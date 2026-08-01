import CONFIG from '../config.js';

let client = null;

export function isSupabaseConfigured() {
    return Boolean(CONFIG.supabase.url && CONFIG.supabase.anonKey);
}

export function getSupabaseClient() {
    if (client) return client;
    if (!isSupabaseConfigured()) return null;
    if (!window.supabase) return null;
    client = window.supabase.createClient(CONFIG.supabase.url, CONFIG.supabase.anonKey);
    return client;
}
