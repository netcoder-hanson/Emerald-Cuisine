import { getSupabaseClient } from './supabase.js';

const USERS_KEY = 'emeraldUsers';
const PERSISTENT_AUTH_KEY = 'emeraldAuthUser';
const SESSION_AUTH_KEY = 'emeraldAuthUserSession';

function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

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
            .select('id,name,email,session_token')
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
            sessionToken: data.session_token,
            rememberMe: Boolean(storedUser.rememberMe)
        });

        saveAuthSession(restoredUser, restoredUser.rememberMe);
        return restoredUser;
    } catch {
        return storedUser;
    }
}

export async function loginOrRegister({ name, email, password, rememberMe = false }) {
    const normalizedEmail = normalizeEmail(email);
    const trimmedPassword = normalizePassword(password);

    if (!normalizedEmail || !trimmedPassword) {
        throw new Error('Please enter your email and password.');
    }

    const users = getUsers();
    const existingUser = users.find(user => String(user.email || '').toLowerCase() === normalizedEmail);

    const hashedPassword = await hashPassword(trimmedPassword);
    const sessionToken = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const client = getSupabaseClient();
    let supabaseUser = null;

    if (client) {
        try {
            const { data: lookup, error: lookupError } = await client
                .from('customers')
                .select('*')
                .eq('email', normalizedEmail)
                .maybeSingle();

            if (lookupError) {
                throw lookupError;
            }

            if (lookup) {
                const passwordMatches = await verifyPassword(lookup.password_hash || lookup.password || '', trimmedPassword);
                if (!passwordMatches) {
                    throw new Error('Wrong password for this email.');
                }

                const { error: updateError } = await client
                    .from('customers')
                    .update({
                        name: String(name || '').trim() || lookup.name || 'New user',
                        session_token: sessionToken,
                        remember_me: Boolean(rememberMe),
                        last_seen: new Date().toISOString()
                    })
                    .eq('id', lookup.id);

                if (updateError) {
                    throw updateError;
                }

                supabaseUser = {
                    id: lookup.id,
                    name: String(name || '').trim() || lookup.name || 'New user',
                    email: normalizedEmail,
                    sessionToken
                };
            } else {
                const { data: created, error: insertError } = await client
                    .from('customers')
                    .insert({
                        name: String(name || '').trim() || 'New user',
                        email: normalizedEmail,
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

                supabaseUser = {
                    id: created.id,
                    name: created.name,
                    email: created.email,
                    sessionToken
                };
            }
        } catch {
            supabaseUser = null;
        }
    }

    if (existingUser) {
        if (!(await verifyPassword(existingUser.password || '', trimmedPassword))) {
            throw new Error('Wrong password for this email.');
        }

        const sessionUser = buildSessionUser({
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            sessionToken,
            rememberMe
        });

        existingUser.password = hashedPassword;
        existingUser.name = sessionUser.name;
        saveUsers(users);
        saveAuthSession(sessionUser, rememberMe);
        return sessionUser;
    }

    const newUser = {
        id: Date.now().toString(36),
        name: String(name || '').trim() || 'New user',
        email: normalizedEmail,
        password: hashedPassword
    };

    users.push(newUser);
    saveUsers(users);

    const sessionUser = buildSessionUser({
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        sessionToken,
        rememberMe
    });

    saveAuthSession(sessionUser, rememberMe);
    return supabaseUser || sessionUser;
}
