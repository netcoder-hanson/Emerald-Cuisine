// ============================================================
// Supabase Auth — isolated wrapper for Supabase Authentication
// ============================================================
// This module provides a thin wrapper around the Supabase Auth
// SDK. It coexists with the existing custom authentication system
// (auth.js) without modifying or replacing it.
//
// The application-level authentication switch is NOT part of this
// module. Existing functions (getCurrentUser, loginOrRegister, etc.)
// continue to use the custom auth system until Phase D.
// ============================================================

import { getSupabaseClient, isSupabaseConfigured } from './supabase.js';

/**
 * Returns the Supabase client with auth methods available.
 * Reuses the existing client from supabase.js — no second client.
 * @returns {object|null}
 */
function getClient() {
    if (!isSupabaseConfigured()) return null;
    return getSupabaseClient();
}

// ------------------------------------------------------------
// Auth state
// ------------------------------------------------------------

/**
 * Get the currently authenticated Supabase Auth user.
 * Returns null when no Supabase Auth session exists.
 * @returns {Promise<object|null>}
 */
export async function getUser() {
    const client = getClient();
    if (!client) return null;
    try {
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user) return null;
        return data.user;
    } catch {
        return null;
    }
}

/**
 * Get the current Supabase Auth session (user + tokens).
 * Returns null when no session exists.
 * @returns {Promise<object|null>}
 */
export async function getSession() {
    const client = getClient();
    if (!client) return null;
    try {
        const { data, error } = await client.auth.getSession();
        if (error || !data?.session) return null;
        return data.session;
    } catch {
        return null;
    }
}

// ------------------------------------------------------------
// Sign up
// ------------------------------------------------------------

/**
 * Register a new user with Supabase Auth.
 * @param {string} email
 * @param {string} password
 * @param {object} [options] - Additional user metadata.
 * @returns {Promise<{user: object|null, error: string|null}>}
 */
export async function signUp(email, password, options = {}) {
    const client = getClient();
    if (!client) return { user: null, error: 'Supabase is not configured.' };
    try {
        const { data, error } = await client.auth.signUp({
            email,
            password,
            options: {
                data: options.metadata || {}
            }
        });
        if (error) return { user: null, error: error.message };
        return { user: data?.user || null, error: null };
    } catch (e) {
        return { user: null, error: e.message || 'Sign up failed.' };
    }
}

// ------------------------------------------------------------
// Sign in
// ------------------------------------------------------------

/**
 * Sign in an existing user with email and password.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{user: object|null, error: string|null}>}
 */
export async function signIn(email, password) {
    const client = getClient();
    if (!client) return { user: null, error: 'Supabase is not configured.' };
    try {
        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });
        if (error) return { user: null, error: error.message };
        return { user: data?.user || null, error: null };
    } catch (e) {
        return { user: null, error: e.message || 'Sign in failed.' };
    }
}

// ------------------------------------------------------------
// Sign out
// ------------------------------------------------------------

/**
 * Sign out the current Supabase Auth user.
 * @returns {Promise<{error: string|null}>}
 */
export async function signOut() {
    const client = getClient();
    if (!client) return { error: null };
    try {
        const { error } = await client.auth.signOut();
        if (error) return { error: error.message };
        return { error: null };
    } catch (e) {
        return { error: e.message || 'Sign out failed.' };
    }
}

// ------------------------------------------------------------
// Auth state listener
// ------------------------------------------------------------

/**
 * Subscribe to Supabase Auth state changes.
 * Returns an object with an `unsubscribe` method.
 * @param {function} callback - Called with (event, session) on each change.
 * @returns {{unsubscribe: function}}
 */
export function onAuthStateChange(callback) {
    const client = getClient();
    if (!client) return { unsubscribe: () => {} };
    const { data } = client.auth.onAuthStateChange(callback);
    return {
        unsubscribe: () => data?.subscription?.unsubscribe?.()
    };
}
