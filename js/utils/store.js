import { getSupabaseClient } from './supabase.js';

// Generic helpers for reading and writing Supabase tables.
// Every function returns null when Supabase is not configured,
// so the site still works in demo mode.

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

// ---------------- Orders ----------------

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
    const localOrders = JSON.parse(localStorage.getItem('emeraldOrders') || '{}');
    localOrders[order.orderNumber] = { ...order, createdAt: Date.now(), status: 'received' };
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
    const localOrders = JSON.parse(localStorage.getItem('emeraldOrders') || '{}');
    return localOrders[orderNumber] || null;
}

// ---------------- Newsletter subscribers ----------------

export async function getSubscribers() {
    return fetchRows('subscribers', { order: 'created_at', ascending: false });
}

export async function addSubscriber(email) {
    const row = await insertRow('subscribers', { email });
    if (row) return row;
    const subscribers = JSON.parse(localStorage.getItem('emeraldSubscribers') || '[]');
    if (!subscribers.some(sub => sub.email === email)) subscribers.push({ email });
    localStorage.setItem('emeraldSubscribers', JSON.stringify(subscribers));
    return { email };
}

export async function removeSubscriber(id) {
    return deleteRow('subscribers', id);
}

// ---------------- Reviews ----------------

export async function getReviews() {
    return fetchRows('reviews', { order: 'created_at', ascending: false, limit: 50 });
}

export async function addReview(review) {
    const row = await insertRow('reviews', review);
    if (row) return row;
    const reviews = JSON.parse(localStorage.getItem('emeraldReviews') || '[]');
    reviews.unshift({ ...review, created_at: new Date().toISOString() });
    localStorage.setItem('emeraldReviews', JSON.stringify(reviews));
    return review;
}

// ---------------- Promotions & settings ----------------

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
    const rows = await fetchRows('settings', { eq: { column: 'id', value: key } });
    return (rows && rows.length) ? rows[0].value : fallback;
}

// LocalStorage demo fallbacks for settings and promotions
export function getLocalSetting(key, fallback = '') {
    const settings = JSON.parse(localStorage.getItem('emeraldSettings') || '{}');
    return settings[key] || fallback;
}
