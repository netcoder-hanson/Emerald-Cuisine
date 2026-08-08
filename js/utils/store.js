import CONFIG from '../config.js';
import { getSupabaseClient } from './supabase.js';

const LOCAL_ORDERS_KEY = 'emeraldOrders';

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

export async function saveOrder(order) {
    const localOrder = {
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
        status: 'received',
        created_at: order.createdAt || new Date().toISOString()
    };

    const row = await insertRow('orders', {
        ...localOrder
    });
    if (row) {
        return row;
    }

    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '[]');
        const list = Array.isArray(stored) ? stored : [];
        list.unshift(localOrder);
        localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(list.slice(0, 100)));
        return localOrder;
    } catch {
        throw new Error('Failed to save order to database');
    }
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

    try {
        const stored = JSON.parse(localStorage.getItem(LOCAL_ORDERS_KEY) || '[]');
        const row = Array.isArray(stored) ? stored.find(entry => String(entry.order_number) === String(orderNumber)) : null;
        if (row) {
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
    } catch {
        // Ignore local fallback errors.
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
