import CONFIG from '../config.js';
import { getSupabaseClient } from './supabase.js';
import { getCurrentUser } from './auth.js';

const LOCAL_ORDERS_KEY = 'emeraldOrders';
const CART_BACKUP_KEY = 'emeraldCartBackup';

// ============================================================
// Secure Order Number Generation
// ============================================================

// Characters excluding ambiguous ones (I, O, 0, 1)
const ORDER_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generate a cryptographically secure order number.
 * Format: EC-XXXXXX (6 alphanumeric characters)
 * Uses crypto.getRandomValues for security.
 */
export function generateSecureOrderNumber() {
    const array = new Uint8Array(6);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    } else {
        // Fallback for non-secure contexts (should not happen in production)
        for (let i = 0; i < 6; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
    }
    
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += ORDER_CHARS[array[i] % ORDER_CHARS.length];
    }
    return `EC-${result}`;
}

/**
 * Generate a cryptographically secure tracking token.
 * Format: 32-char hex string (16 bytes).
 */
export function generateTrackingToken() {
    const array = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(array);
    } else {
        for (let i = 0; i < 16; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }
    }
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Legacy order number generation (for backward compatibility).
 * @deprecated Use generateSecureOrderNumber() instead.
 */
export function generateLegacyOrderNumber() {
    return `EBF${Date.now().toString().slice(-6)}`;
}

export async function fetchRows(tableName, options = {}) {
    const client = getSupabaseClient();
    if (!client) return null;
    let query = client.from(tableName).select(options.select || '*');
    if (options.order) query = query.order(options.order, { ascending: options.ascending ?? true });
    if (options.eq) query = query.eq(options.eq.column, options.eq.value);
    if (options.limit) query = query.limit(options.limit);
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

export async function insertRow(tableName, payload) {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.from(tableName).insert(payload).select();
    if (error) throw error;
    return data[0];
}

export async function updateRow(tableName, id, payload) {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.from(tableName).update(payload).eq('id', id).select();
    if (error) throw error;
    return data[0];
}

export async function deleteRow(tableName, id) {
    const client = getSupabaseClient();
    if (!client) return null;
    const { error } = await client.from(tableName).delete().eq('id', id);
    if (error) throw error;
    return true;
}

export async function countRows(tableName, column = null, value = null) {
    const client = getSupabaseClient();
    if (!client) return null;
    let query = client.from(tableName).select('*', { count: 'exact', head: true });
    if (column && value !== undefined && value !== null) query = query.eq(column, value);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

export async function countMenuItemsByCategory(categoryId) {
    return countRows('menu_items', 'category_id', categoryId);
}

export async function fetchRowsIn(tableName, column, values) {
    const client = getSupabaseClient();
    if (!client) return null;
    if (!values || !values.length) return [];
    const { data, error } = await client.from(tableName).select('*').in(column, values);
    if (error) throw error;
    return data;
}

export async function uploadImage(file, folder = 'menu') {
    const client = getSupabaseClient();
    if (!client || !file) return null;
    const bucket = CONFIG.supabase.storageBucket || 'menu-images';
    const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await client.storage.from(bucket).upload(path, file, {
        upsert: false,
        contentType: file.type
    });
    if (error) throw error;
    const { data: publicUrl } = client.storage.from(bucket).getPublicUrl(path);
    return publicUrl?.publicUrl || null;
}

export async function invokeEdgeFunction(functionName, body) {
    const client = getSupabaseClient();
    if (!client || !client.functions) return null;
    const { data, error } = await client.functions.invoke(functionName, { body });
    if (error) throw error;
    return data;
}

export async function exportAllData() {
    const tables = ['menu_items', 'categories', 'promotions', 'subscribers', 'customers', 'orders', 'settings'];
    const result = {};
    for (const table of tables) {
        try {
            const rows = await fetchRows(table, { order: 'created_at', ascending: false });
            result[table] = rows || [];
        } catch {
            result[table] = [];
        }
    }
    return result;
}

function csvCell(value) {
    const string = String(value ?? '');
    return /[",\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

export function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(row => {
        lines.push(headers.map(header => csvCell(row[header])).join(','));
    });
    return lines.join('\n');
}

export function downloadBlob(filename, content, mime = 'text/plain') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadAsJson(filename, data) {
    downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json');
}

export function downloadAsCsv(filename, headers, rows) {
    const objects = rows.map(row => {
        const obj = {};
        headers.forEach(header => { obj[header] = row[header] ?? ''; });
        return obj;
    });
    downloadBlob(filename, toCSV(objects), 'text/csv');
}

/**
 * Save an order to the database.
 * 
 * IMPORTANT: This function NO LONGER falls back to localStorage for successful orders.
 * If Supabase fails, the function throws an error. The cart is preserved locally
 * for retry, but the order is NOT considered successfully placed until persisted.
 * 
 * @param {Object} order - Order data from checkout
 * @param {Object} options - Additional options
 * @param {boolean} options.preserveCartOnError - If true, backup cart before attempting save
 * @returns {Promise<Object>} Saved order row from database
 * @throws {Error} If database save fails
 */
export async function saveOrder(order, options = {}) {
    const user = getCurrentUser();
    const localOrder = {
        order_number: order.orderNumber,
        tracking_token: order.trackingToken || generateTrackingToken(),
        customer_id: user?.id || null,
        customer_name: order.fullName,
        phone: order.phone,
        email: order.email,
        address: order.address,
        delivery_type: order.deliveryType,
        payment_method: order.paymentMethod,
        items: order.items,
        subtotal: order.subtotal,
        vat: order.vat,
        delivery_fee: order.deliveryFee,
        total: order.total,
        status: 'received',
        created_at: order.createdAt || new Date().toISOString()
    };

    // Backup cart before attempting save (for recovery)
    if (options.preserveCartOnError) {
        try {
            localStorage.setItem(CART_BACKUP_KEY, JSON.stringify({
                items: order.items,
                timestamp: Date.now()
            }));
        } catch {
            // Storage unavailable - continue with save attempt
        }
    }

    try {
        const row = await insertRow('orders', localOrder);
        if (row) {
            // Clear cart backup on successful save
            try {
                localStorage.removeItem(CART_BACKUP_KEY);
            } catch {
                // Ignore cleanup errors
            }
            return row;
        }
    } catch (error) {
        // Database save failed - preserve cart for retry but DO NOT create phantom order
        console.error('Failed to save order to database:', error);
        throw new Error('Could not save your order. Please check your connection and try again. Your cart has been preserved for retry.');
    }

    // Should not reach here, but just in case
    throw new Error('Failed to save order to database');
}

/**
 * Get an order by order number.
 * 
 * IMPORTANT: This function now PREFERS the database over localStorage.
 * localStorage-only orders are treated as unconfirmed and return null.
 * 
 * @param {string} orderNumber - The order number to look up
 * @param {Object} options - Options for the lookup
 * @param {boolean} options.allowLocalFallback - If true, check localStorage if DB fails (default: false)
 * @returns {Promise<Object|null>} Order data or null if not found in database
 */
export async function getOrder(orderNumber, options = {}) {
    // Always try database first
    try {
        const rows = await fetchRows('orders', { eq: { column: 'order_number', value: orderNumber } });
        if (rows && rows.length) {
            const row = rows[0];
            return {
                orderNumber: row.order_number,
                trackingToken: row.tracking_token,
                estimatedTime: row.delivery_type === 'pickup' ? 'Ready in 20-30 mins' : 'Estimated delivery in 40-55 mins',
                fullName: row.customer_name,
                phone: row.phone,
                email: row.email,
                address: row.address,
                items: row.items,
                total: Number(row.total),
                subtotal: Number(row.subtotal),
                vat: Number(row.vat),
                deliveryFee: Number(row.delivery_fee),
                deliveryType: row.delivery_type,
                paymentMethod: row.payment_method,
                status: row.status,
                customerId: row.customer_id,
                createdAt: row.created_at,
                isDatabaseOrder: true
            };
        }
    } catch (error) {
        console.error('Database order lookup failed:', error);
    }

    // Only check localStorage if explicitly allowed (for recovery purposes)
    if (options.allowLocalFallback) {
        try {
            const stored = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '[]');
            const row = Array.isArray(stored) ? stored.find(entry => String(entry.order_number) === String(orderNumber)) : null;
            if (row) {
                // Return with isDatabaseOrder: false to indicate this is NOT confirmed
                return {
                    orderNumber: row.order_number,
                    trackingToken: null,
                    estimatedTime: row.delivery_type === 'pickup' ? 'Ready in 20-30 mins' : 'Estimated delivery in 40-55 mins',
                    fullName: row.customer_name,
                    phone: row.phone,
                    email: row.email,
                    address: row.address,
                    items: row.items,
                    total: Number(row.total),
                    subtotal: Number(row.subtotal),
                    vat: Number(row.vat),
                    deliveryFee: Number(row.delivery_fee),
                    deliveryType: row.delivery_type,
                    paymentMethod: row.payment_method,
                    status: row.status,
                    customerId: null,
                    createdAt: row.created_at,
                    isDatabaseOrder: false
                };
            }
        } catch {
            // Ignore local fallback errors.
        }
    }

    return null;
}

export async function getSubscribers() {
    return fetchRows('subscribers', { order: 'created_at', ascending: false });
}

export async function addSubscriber(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const row = await insertRow('subscribers', { email: normalized });
    if (!row) throw new Error('Failed to subscribe');
    return row;
}

export async function removeSubscriber(id) {
    return deleteRow('subscribers', id);
}

export async function getReviews() {
    return fetchRows('reviews', { order: 'created_at', ascending: false, limit: 50 });
}

export async function addReview(review) {
    const row = await insertRow('reviews', review);
    if (!row) throw new Error('Failed to add review');
    return row;
}

export async function getActivePromotion() {
    const rows = await fetchRows('promotions', {
        order: 'created_at',
        ascending: false,
        limit: 1,
        eq: { column: 'active', value: true }
    });
    return (rows && rows.length) ? rows[0] : null;
}

export async function getSetting(key, fallback = '') {
    try {
        const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
        return (rows && rows.length) ? rows[0].value : fallback;
    } catch (error) {
        console.error(`Failed to fetch setting "${key}":`, error);
        return fallback;
    }
}

// ============================================================
// Cart Recovery (for failed order saves)
// ============================================================

/**
 * Save cart data locally for recovery after a failed order save.
 * This is NOT an order - it's just preserving the cart contents.
 */
export function saveCartForRecovery(cartItems) {
    try {
        localStorage.setItem(CART_BACKUP_KEY, JSON.stringify({
            items: cartItems,
            timestamp: Date.now()
        }));
    } catch {
        // Storage unavailable
    }
}

/**
 * Get backed up cart data from a failed order attempt.
 * @returns {Object|null} Cart backup data or null
 */
export function getCartRecovery() {
    try {
        const backup = JSON.parse(localStorage.getItem(CART_BACKUP_KEY) || 'null');
        if (backup && backup.items && backup.timestamp) {
            // Only return if less than 24 hours old
            const age = Date.now() - backup.timestamp;
            if (age < 24 * 60 * 60 * 1000) {
                return backup;
            }
        }
    } catch {
        // Ignore errors
    }
    return null;
}

/**
 * Clear cart recovery data (after successful retry or manual clear).
 */
export function clearCartRecovery() {
    try {
        localStorage.removeItem(CART_BACKUP_KEY);
    } catch {
        // Ignore errors
    }
}

/**
 * Check if an order exists in the database.
 * Useful for verifying before showing confirmation.
 */
export async function orderExistsInDatabase(orderNumber) {
    try {
        const rows = await fetchRows('orders', {
            select: 'id',
            eq: { column: 'order_number', value: orderNumber },
            limit: 1
        });
        return rows && rows.length > 0;
    } catch {
        return false;
    }
}
