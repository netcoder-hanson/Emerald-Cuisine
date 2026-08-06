import CONFIG from '../config.js';
import { getSupabaseClient } from './supabase.js';

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

// Count rows in a table, optionally filtered by a column = value.
export async function countRows(tableName, column = null, value = null) {
    const client = getSupabaseClient();
    if (!client) return null;
    let query = client.from(tableName).select('*', { count: 'exact', head: true });
    if (column && value !== undefined && value !== null) query = query.eq(column, value);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

// Count menu items referencing a category_id.
export async function countMenuItemsByCategory(categoryId) {
    return countRows('menu_items', 'category_id', categoryId);
}

// Fetch rows where a column matches any of many values (order history lookup).
export async function fetchRowsIn(tableName, column, values) {
    const client = getSupabaseClient();
    if (!client) return null;
    if (!values || !values.length) return [];
    const { data, error } = await client.from(tableName).select('*').in(column, values);
    if (error) throw error;
    return data;
}

// Upload a File to Supabase Storage (bucket from config) and return the public URL.
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

// Invoke a Supabase Edge Function and return its parsed JSON response.
export async function invokeEdgeFunction(functionName, body) {
    const client = getSupabaseClient();
    if (!client || !client.functions) return null;
    const { data, error } = await client.functions.invoke(functionName, { body });
    if (error) throw error;
    return data;
}

// Export every table as JSON (Settings -> Data -> Export all data).
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

// CSV-safe quoting helper.
function csvCell(value) {
    const string = String(value ?? '');
    return /[",\n]/.test(string) ? `"${string.replace(/"/g, '""')}"` : string;
}

// Build a CSV string from an array of objects (keys from the first row).
export function toCSV(rows) {
    if (!rows || !rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.map(csvCell).join(',')];
    rows.forEach(row => {
        lines.push(headers.map(header => csvCell(row[header])).join(','));
    });
    return lines.join('\n');
}

// Download a blob (CSV or JSON) to the user's machine.
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

// Download a JSON file.
export function downloadAsJson(filename, data) {
    downloadBlob(filename, JSON.stringify(data, null, 2), 'application/json');
}

// Download rows as CSV given explicit headers.
export function downloadAsCsv(filename, headers, rows) {
    const objects = rows.map(row => {
        const obj = {};
        headers.forEach(header => { obj[header] = row[header] ?? ''; });
        return obj;
    });
    downloadBlob(filename, toCSV(objects), 'text/csv');
}

export async function saveOrder(order) {
    const row = await insertRow('orders', {
        order_number: order.orderNumber,
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
        status: 'received'
    });
    if (row) return row;
    // Demo mode fallback: keep orders in localStorage
    let localOrders = {};
    try {
        localOrders = JSON.parse(localStorage.getItem('emeraldOrders') || '{}');
    } catch {
        localOrders = {};
    }
    localOrders[order.orderNumber] = { ...order, createdAt: order.createdAt || Date.now(), status: 'received' };
    localStorage.setItem('emeraldOrders', JSON.stringify(localOrders));
    return order;
}

export async function getOrder(orderNumber) {
    const rows = await fetchRows('orders', { eq: { column: 'order_number', value: orderNumber } });
    if (rows && rows.length) {
        const row = rows[0];
        return {
            orderNumber: row.order_number,
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
            createdAt: row.created_at
        };
    }
    // Demo mode fallback
    let localOrders = {};
    try {
        localOrders = JSON.parse(localStorage.getItem('emeraldOrders') || '{}');
    } catch {
        localOrders = {};
    }
    return localOrders[orderNumber] || null;
}

export async function getSubscribers() {
    return fetchRows('subscribers', { order: 'created_at', ascending: false });
}

export async function addSubscriber(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    const row = await insertRow('subscribers', { email: normalized });
    if (row) return row;
    const subscribers = JSON.parse(localStorage.getItem('emeraldSubscribers') || '[]');
    if (!subscribers.some(sub => String(sub.email).trim().toLowerCase() === normalized)) {
        subscribers.push({ email: normalized });
    }
    localStorage.setItem('emeraldSubscribers', JSON.stringify(subscribers));
    return { email: normalized };
}

export async function removeSubscriber(id) {
    return deleteRow('subscribers', id);
}

export async function getReviews() {
    const rows = await fetchRows('reviews', { order: 'created_at', ascending: false, limit: 50 });
    if (rows) return rows;
    // Demo mode fallback: mirror what addReview() writes to localStorage
    try {
        const localReviews = JSON.parse(localStorage.getItem('emeraldReviews') || 'null');
        return Array.isArray(localReviews) ? localReviews : [];
    } catch {
        return [];
    }
}

export async function addReview(review) {
    const row = await insertRow('reviews', review);
    if (row) return row;
    const reviews = JSON.parse(localStorage.getItem('emeraldReviews') || '[]');
    reviews.unshift({ ...review, created_at: new Date().toISOString() });
    localStorage.setItem('emeraldReviews', JSON.stringify(reviews));
    return review;
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

export function getLocalSetting(key, fallback = '') {
    const settings = JSON.parse(localStorage.getItem('emeraldSettings') || '{}');
    return settings[key] || fallback;
}
