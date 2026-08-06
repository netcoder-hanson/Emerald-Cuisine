import { getSupabaseClient } from './supabase.js';

const PERSISTENT_AUTH_KEY = 'emeraldAuthUser';
const SESSION_AUTH_KEY = 'emeraldAuthUserSession';

function saveAuthSession(sessionUser, rememberMe = false) {
    try {
        if (rememberMe) {
            localStorage.setItem(PERSISTENT_AUTH_KEY, JSON.stringify(sessionUser));
            sessionStorage.removeItem(SESSION_AUTH_KEY);
        } else {
            sessionStorage.setItem(SESSION_AUTH_KEY, JSON.stringify(sessionUser));
            localStorage.removeItem(PERSISTENT_AUTH_KEY);
        }
    } catch {
        // Storage unavailable — silently continue without persistence.
    }
}

function clearAuthSession() {
    try {
        localStorage.removeItem(PERSISTENT_AUTH_KEY);
        sessionStorage.removeItem(SESSION_AUTH_KEY);
    } catch {
        // Storage unavailable.
    }
}

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function normalizePassword(password) {
    return String(password || '').trim();
}

export async function hashPassword(value) {
    const normalized = normalizePassword(value);
    const encoder = new TextEncoder();
    const data = encoder.encode(`${normalized}::emerald-cuisine`);
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
        const digest = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
    }
    // Non-secure context fallback (crypto.subtle unavailable over plain HTTP).
    let hash = 0;
    const str = new TextDecoder().decode(data);
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return `legacy-${(hash >>> 0).toString(16)}`;
}

async function verifyPassword(storedPassword, suppliedPassword) {
    if (!storedPassword) return false;
    if (storedPassword === normalizePassword(suppliedPassword)) return true;
    if (typeof storedPassword === 'string' && (/^[a-f0-9]{64}$/i.test(storedPassword) || storedPassword.startsWith('legacy-'))) {
        return storedPassword === await hashPassword(suppliedPassword);
    }
    return false;
}

function buildSessionUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name || 'New user',
        email: user.email,
        username: user.username || '',
        address: user.address || '',
        useAsDeliveryAddress: Boolean(user.useAsDeliveryAddress),
        sessionToken: user.sessionToken || null,
        rememberMe: Boolean(user.rememberMe)
    };
}

export function getCurrentUser() {
    try {
        const stored = localStorage.getItem(PERSISTENT_AUTH_KEY) || sessionStorage.getItem(SESSION_AUTH_KEY) || 'null';
        return buildSessionUser(JSON.parse(stored));
    } catch {
        return null;
    }
}

export function logoutUser() {
    clearAuthSession();
}

export async function restoreSession() {
    const storedUser = getCurrentUser();
    if (!storedUser?.sessionToken) return storedUser;

    const client = getSupabaseClient();
    if (!client) return storedUser;

    try {
        const { data, error } = await client
            .from('customers')
            .select('id,name,email,username,address,use_as_delivery_address,session_token')
            .eq('session_token', storedUser.sessionToken)
            .maybeSingle();

        if (error || !data) {
            clearAuthSession();
            return null;
        }

        const restoredUser = buildSessionUser({
            id: data.id,
            name: data.name,
            email: data.email,
            username: data.username,
            address: data.address,
            useAsDeliveryAddress: data.use_as_delivery_address,
            sessionToken: data.session_token,
            rememberMe: Boolean(storedUser.rememberMe)
        });

        saveAuthSession(restoredUser, restoredUser.rememberMe);
        return restoredUser;
    } catch {
        return storedUser;
    }
}

// True when an account already uses the given email. Used by the sign-up
// flow to offer "update" or "replace" when a legacy email-only account
// exists in Supabase.
export async function findExistingByEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) return null;

    const client = getSupabaseClient();
    let supabase = null;
    if (client) {
        try {
            const { data, error } = await client
                .from('customers')
                .select('*')
                .eq('email', normalizedEmail)
                .maybeSingle();
            if (!error && data) supabase = data;
        } catch {
            supabase = null;
        }
    }

    if (!supabase) return null;
    return { local: null, supabase };
}

export async function loginOrRegister({
    username,
    email,
    address,
    useAsDeliveryAddress = false,
    password,
    rememberMe = false,
    conflictMode = null
}) {
    const normalizedUsername = String(username || '').trim();
    const normalizedEmail = normalizeEmail(email);
    const trimmedPassword = normalizePassword(password);
    const trimmedAddress = String(address || '').trim();

    if (!normalizedUsername || !trimmedPassword) {
        throw new Error('Please enter your username and password.');
    }

    const hashedPassword = await hashPassword(trimmedPassword);
    const sessionToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const client = getSupabaseClient();
    if (!client) {
        throw new Error('Supabase is not configured. Cannot authenticate users.');
    }

    try {
        const { data: lookup, error: lookupError } = await client
            .from('customers')
            .select('*')
            .eq('username', normalizedUsername)
            .maybeSingle();

        if (lookupError) {
            throw lookupError;
        }

        if (lookup) {
            // Sign-in path: the username exists.
            const passwordMatches = await verifyPassword(lookup.password_hash || lookup.password || '', trimmedPassword);
            if (!passwordMatches) {
                throw new Error('Wrong password for this username.');
            }

            const { error: updateError } = await client
                .from('customers')
                .update({
                    session_token: sessionToken,
                    remember_me: Boolean(rememberMe),
                    last_seen: new Date().toISOString()
                })
                .eq('id', lookup.id);

            if (updateError) {
                throw updateError;
            }

            const sessionUser = buildSessionUser({
                id: lookup.id,
                name: lookup.name,
                email: lookup.email,
                username: lookup.username,
                address: lookup.address || '',
                useAsDeliveryAddress: Boolean(lookup.use_as_delivery_address),
                sessionToken,
                rememberMe
            });

            saveAuthSession(sessionUser, rememberMe);
            return sessionUser;
        } else if (normalizedEmail) {
            // Sign-up path: no username match — resolve any legacy
            // account that already uses this email first.
            const { data: conflictRow, error: conflictError } = await client
                .from('customers')
                .select('id')
                .eq('email', normalizedEmail)
                .maybeSingle();

            if (conflictError) {
                throw conflictError;
            }

            if (conflictRow && conflictMode === 'replace') {
                const { error: deleteError } = await client
                    .from('customers')
                    .delete()
                    .eq('id', conflictRow.id);
                if (deleteError) {
                    throw deleteError;
                }
            } else if (conflictRow && conflictMode === 'update') {
                const { error: updateError } = await client
                    .from('customers')
                    .update({
                        name: normalizedUsername,
                        username: normalizedUsername,
                        address: trimmedAddress,
                        use_as_delivery_address: Boolean(useAsDeliveryAddress),
                        password_hash: hashedPassword,
                        session_token: sessionToken,
                        remember_me: Boolean(rememberMe),
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', conflictRow.id);

                if (updateError) {
                    throw updateError;
                }

                const { data: updated, error: fetchError } = await client
                    .from('customers')
                    .select('*')
                    .eq('id', conflictRow.id)
                    .maybeSingle();

                if (fetchError || !updated) {
                    throw new Error('Failed to fetch updated user');
                }

                const sessionUser = buildSessionUser({
                    id: updated.id,
                    name: updated.name,
                    email: updated.email,
                    username: updated.username,
                    address: updated.address || '',
                    useAsDeliveryAddress: Boolean(updated.use_as_delivery_address),
                    sessionToken,
                    rememberMe
                });

                saveAuthSession(sessionUser, rememberMe);
                return sessionUser;
            } else {
                const { data: created, error: insertError } = await client
                    .from('customers')
                    .insert({
                        name: normalizedUsername,
                        username: normalizedUsername,
                        email: normalizedEmail,
                        address: trimmedAddress,
                        use_as_delivery_address: Boolean(useAsDeliveryAddress),
                        password_hash: hashedPassword,
                        session_token: sessionToken,
                        remember_me: Boolean(rememberMe),
                        last_seen: new Date().toISOString()
                    })
                    .select()
                    .single();

                if (insertError) {
                    throw insertError;
                }

                const sessionUser = buildSessionUser({
                    id: created.id,
                    name: created.name,
                    email: created.email,
                    username: created.username,
                    address: created.address || '',
                    useAsDeliveryAddress: Boolean(created.use_as_delivery_address),
                    sessionToken,
                    rememberMe
                });

                saveAuthSession(sessionUser, rememberMe);
                return sessionUser;
            }
        } else {
            throw new Error('No account found with that username. Please sign up first.');
        }
    } catch (error) {
        throw error;
    }
}
