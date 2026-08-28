// ============================================================
// Authentication — Supabase Auth integration
// ============================================================
// Replaces the legacy custom auth system (username/password,
// localStorage sessions) with Supabase Auth (email/password).
//
// getCurrentUser() returns a lightweight profile object:
//   { id, name, email, username, address, useAsDeliveryAddress, isAdmin }
// ============================================================

import { getSupabaseClient } from './supabase.js';
import {
    getUser as sbGetUser,
    getSession as sbGetSession,
    signIn as sbSignIn,
    signUp as sbSignUp,
    signOut as sbSignOut,
    signInWithGoogle as sbSignInWithGoogle,
    onAuthStateChange as sbOnAuthStateChange
} from './supabase-auth.js';

// ------------------------------------------------------------
// Profile helpers
// ------------------------------------------------------------

function buildProfile(customer, authUser) {
    if (!customer && !authUser) return null;
    const email = (customer?.email || authUser?.email || '').trim().toLowerCase();
    const name = customer?.name || email.split('@')[0] || 'User';
    return {
        id: customer?.id || null,
        name,
        email,
        username: customer?.username || '',
        phone: customer?.phone || '',
        address: customer?.address || '',
        useAsDeliveryAddress: Boolean(customer?.use_as_delivery_address),
        isAdmin: Boolean(customer?.is_admin)
    };
}

/**
 * Fetch or create the customers row for the given Supabase Auth user.
 * When no row exists, one is created (RLS customers_insert_self allows it).
 * @returns {Promise<object|null>} customers row, or null if Supabase unavailable
 */
async function ensureCustomerProfile(authUser) {
    if (!authUser?.id) return null;
    const client = getSupabaseClient();
    if (!client) return null;

    const { data: existing, error: fetchError } = await client
        .from('customers')
        .select('*')
        .eq('auth_user_id', authUser.id)
        .maybeSingle();

    if (fetchError) {
        console.error('Failed to fetch customer profile:', fetchError);
        return null;
    }

    if (existing) return existing;

    const email = (authUser.email || '').trim().toLowerCase();
    const displayName = authUser.user_metadata?.name
        || authUser.user_metadata?.username
        || email.split('@')[0]
        || 'User';
    const username = authUser.user_metadata?.username || email.split('@')[0];
    const address = authUser.user_metadata?.address || '';
    const phone = authUser.user_metadata?.phone || '';
    const useAsDelivery = authUser.user_metadata?.useAsDeliveryAddress || false;

    const { data: created, error: insertError } = await client
        .from('customers')
        .insert({
            auth_user_id: authUser.id,
            email,
            name: displayName,
            username,
            address,
            phone,
            use_as_delivery_address: useAsDelivery
        })
        .select()
        .single();

    if (insertError) {
        console.error('Failed to create customer profile:', insertError);
        return null;
    }

    return created;
}

// ------------------------------------------------------------
// Synchronous cache for getCurrentUser()
// ------------------------------------------------------------

let _cachedUser = null;
let _cacheInitialized = false;

async function _hydrateCache(authUser) {
    if (!authUser) {
        _cachedUser = null;
        return null;
    }

    const customer = await ensureCustomerProfile(authUser);
    _cachedUser = buildProfile(customer, authUser);
    return _cachedUser;
}

/**
 * Initialize the cache from the current Supabase Auth session.
 * Called once on module load and on auth state changes.
 */
async function _initCache() {
    try {
        const session = await sbGetSession();
        await _hydrateCache(session?.user || null);
    } catch (error) {
        console.error('Failed to initialize auth cache:', error);
        _cachedUser = null;
    } finally {
        _cacheInitialized = true;
    }
}

const _cacheReadyPromise = _initCache();

// Listen for auth state changes to keep cache updated.
sbOnAuthStateChange(async () => {
    try {
        const session = await sbGetSession();
        await _hydrateCache(session?.user || null);
    } catch (error) {
        console.error('Failed to update auth cache:', error);
        _cachedUser = null;
    }
});

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------

/**
 * Get the current authenticated user's profile (synchronous, cached).
 * Returns null when no Supabase Auth session exists.
 * @returns {object|null}
 */
export function getCurrentUser() {
    return _cachedUser;
}

/**
 * Wait until the initial Supabase session has been restored and the
 * customer profile cache has been hydrated.
 * @returns {Promise<object|null>}
 */
export function waitForAuthReady() {
    return _cacheReadyPromise.then(() => _cachedUser);
}

/**
 * Restore an existing Supabase Auth session (called on page load).
 * This now waits for the initial auth cache hydration instead of
 * returning immediately with a potentially stale null value.
 * @returns {Promise<object|null>}
 */
export function restoreSession() {
    return waitForAuthReady();
}

/**
 * Re-read the current customer profile from the database and update the
 * in-memory cache. Called after the customer edits their own profile so the
 * rest of the UI (dropdown, checkout prefill) reflects the saved changes.
 * @returns {Promise<object|null>}
 */
export async function refreshProfile() {
    try {
        const session = await sbGetSession();
        return await _hydrateCache(session?.user || null);
    } catch (error) {
        console.error('Failed to refresh profile:', error);
        return _cachedUser;
    }
}

/**
 * Sign in with email/password. If the credentials are not found,
 * attempts to sign up instead.
 */
export async function loginOrRegister({
    email,
    password,
    name = '',
    address = '',
    phone = '',
    useAsDeliveryAddress = false
}) {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '').trim();

    if (!trimmedEmail || !trimmedPassword) {
        throw new Error('Please enter your email and password.');
    }

    const signInResult = await sbSignIn(trimmedEmail, trimmedPassword);
    if (signInResult.user) {
        // Do not wait for the auth-state listener to update the cache.
        // Hydrate it immediately so callers can use the returned profile.
        return await _hydrateCache(signInResult.user);
    }

    const signUpResult = await sbSignUp(trimmedEmail, trimmedPassword, {
        metadata: {
            name: name || trimmedEmail.split('@')[0],
            username: name || trimmedEmail.split('@')[0],
            address,
            phone,
            useAsDeliveryAddress
        }
    });

    if (signUpResult.error) {
        if (signUpResult.error.includes('already') || signUpResult.error.includes('registered')) {
            const retry = await sbSignIn(trimmedEmail, trimmedPassword);
            if (retry.user) return await _hydrateCache(retry.user);
        }
        throw new Error(signUpResult.error || 'Could not create your account. Please try again.');
    }

    const authUser = await sbGetUser();
    if (!authUser) {
        throw new Error('Account created but could not retrieve session. Please sign in.');
    }

    return await _hydrateCache(authUser);
}

/**
 * Sign out the current user and clear local auth state.
 */
export async function logoutUser() {
    await sbSignOut();
    _cachedUser = null;
    try {
        localStorage.removeItem('emeraldOrders');
    } catch {
        // Storage unavailable.
    }
}

/**
 * Subscribe to auth state changes.
 */
export function onAuthStateChange(callback) {
    return sbOnAuthStateChange(callback);
}

/**
 * Initiate Google OAuth sign-in.
 * Delegates to Supabase Auth's signInWithOAuth.
 */
export async function signInWithGoogle() {
    return sbSignInWithGoogle();
}
