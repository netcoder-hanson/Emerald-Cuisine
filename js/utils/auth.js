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

    // Try to read existing row
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

    // No row — create one (new registration)
    const email = (authUser.email || '').trim().toLowerCase();
    const displayName = authUser.user_metadata?.name
        || authUser.user_metadata?.username
        || email.split('@')[0]
        || 'User';
    const username = authUser.user_metadata?.username || email.split('@')[0];
    const address = authUser.user_metadata?.address || '';
    const useAsDelivery = authUser.user_metadata?.useAsDeliveryAddress || false;

    const { data: created, error: insertError } = await client
        .from('customers')
        .insert({
            auth_user_id: authUser.id,
            email,
            name: displayName,
            username,
            address,
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

/**
 * Initialize the cache from the current Supabase Auth session.
 * Called once on module load and on auth state changes.
 */
async function _initCache() {
    const session = await sbGetSession();
    if (session?.user) {
        const customer = await ensureCustomerProfile(session.user);
        _cachedUser = buildProfile(customer, session.user);
    } else {
        _cachedUser = null;
    }
    _cacheInitialized = true;
}

// Listen for auth state changes to keep cache updated
sbOnAuthStateChange(async () => {
    const session = await sbGetSession();
    if (session?.user) {
        const customer = await ensureCustomerProfile(session.user);
        _cachedUser = buildProfile(customer, session.user);
    } else {
        _cachedUser = null;
    }
});

// Initialize cache on module load
_initCache();

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
 * Restore an existing Supabase Auth session (called on page load).
 * Now handled by the cache initialization — returns the cached user.
 * @returns {object|null}
 */
export function restoreSession() {
    return _cachedUser;
}

/**
 * Sign in with email/password. If the credentials are not found,
 * attempts to sign up instead.
 * @param {Object} params
 * @param {string} params.email
 * @param {string} params.password
 * @param {string} [params.name] - Display name (used on sign-up)
 * @param {string} [params.address] - Delivery address (used on sign-up)
 * @param {boolean} [params.useAsDeliveryAddress]
 * @returns {Promise<object>} User profile
 * @throws {Error} On auth failure
 */
export async function loginOrRegister({
    email,
    password,
    name = '',
    address = '',
    useAsDeliveryAddress = false
}) {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '').trim();

    if (!trimmedEmail || !trimmedPassword) {
        throw new Error('Please enter your email and password.');
    }

    // Try sign-in first
    const signInResult = await sbSignIn(trimmedEmail, trimmedPassword);
    if (signInResult.user) {
        return getCurrentUser();
    }

    // Sign-in failed — try sign-up
    const signUpResult = await sbSignUp(trimmedEmail, trimmedPassword, {
        metadata: {
            name: name || trimmedEmail.split('@')[0],
            username: name || trimmedEmail.split('@')[0],
            address,
            useAsDeliveryAddress
        }
    });

    if (signUpResult.error) {
        // If signUp says "already registered", try signIn once more
        if (signUpResult.error.includes('already') || signUpResult.error.includes('registered')) {
            const retry = await sbSignIn(trimmedEmail, trimmedPassword);
            if (retry.user) return getCurrentUser();
        }
        throw new Error(signUpResult.error || 'Could not create your account. Please try again.');
    }

    // Sign-up succeeded — build profile
    const authUser = await sbGetUser();
    if (!authUser) {
        throw new Error('Account created but could not retrieve session. Please sign in.');
    }

    const customer = await ensureCustomerProfile(authUser);
    return buildProfile(customer, authUser);
}

/**
 * Sign out the current user and clear local auth state.
 */
export async function logoutUser() {
    await sbSignOut();
    try {
        localStorage.removeItem('emeraldOrders');
    } catch {
        // Storage unavailable.
    }
}

/**
 * Subscribe to auth state changes.
 * @param {function} callback - Called with (event, session) on each change.
 * @returns {{unsubscribe: function}}
 */
export function onAuthStateChange(callback) {
    return sbOnAuthStateChange(callback);
}
