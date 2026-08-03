export const DELIVERY_FEE = 1500;
export const VAT_RATE = 0.075;
export const FREE_DELIVERY_THRESHOLD = 20000;

export function getCart() {
    try {
        const cart = JSON.parse(localStorage.getItem('emeraldCart') || '{}');
        return cart && typeof cart === 'object' && !Array.isArray(cart) ? cart : {};
    } catch {
        return {};
    }
}

export function saveCart(cart) {
    localStorage.setItem('emeraldCart', JSON.stringify(cart));
}

const CART_ITEMS_KEY = 'emeraldCartItems';

// Store a small snapshot of each added item so the cart and checkout
// summary can still render even if the live menu source changes (e.g.
// Supabase -> menu.json fallback) and the menu ids no longer match.
export function getCartItemDetails(id) {
    try {
        return JSON.parse(localStorage.getItem(CART_ITEMS_KEY) || '{}')[id] || null;
    } catch {
        return null;
    }
}

export function saveCartItemDetails(id, item) {
    if (!id || !item) return;
    try {
        const map = JSON.parse(localStorage.getItem(CART_ITEMS_KEY) || '{}');
        map[id] = {
            id,
            name: item.name,
            price: Number(item.price) || 0,
            image: item.image || '',
            description: item.description || ''
        };
        localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(map));
    } catch {
        // Storage unavailable — ignore.
    }
}

export function removeCartItemDetails(id) {
    try {
        const map = JSON.parse(localStorage.getItem(CART_ITEMS_KEY) || '{}');
        delete map[id];
        localStorage.setItem(CART_ITEMS_KEY, JSON.stringify(map));
    } catch {
        // Storage unavailable — ignore.
    }
}

export function clearCart() {
    localStorage.removeItem('emeraldCart');
    localStorage.removeItem(CART_ITEMS_KEY);
}

export function formatPrice(value) {
    return `₦${(Number(value) || 0).toLocaleString()}`;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function calculateTotals(items, deliveryType = 'delivery') {
    const list = Array.isArray(items) ? items : [];
    const subtotal = list.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const vat = Math.round(subtotal * VAT_RATE);
    const deliveryFee = list.length && deliveryType !== 'pickup' && subtotal < FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : 0;
    const total = subtotal + vat + deliveryFee;
    return { subtotal, vat, deliveryFee, total };
}

export function getCartItemCount() {
    const cart = getCart();
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}