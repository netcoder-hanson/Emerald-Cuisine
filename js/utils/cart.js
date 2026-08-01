export const DELIVERY_FEE = 1500;
export const VAT_RATE = 0.075;
export const FREE_DELIVERY_THRESHOLD = 20000;

export function getCart() {
    return JSON.parse(localStorage.getItem('emeraldCart') || '{}');
}

export function saveCart(cart) {
    localStorage.setItem('emeraldCart', JSON.stringify(cart));
}

export function clearCart() {
    localStorage.removeItem('emeraldCart');
}

export function formatPrice(value) {
    return `₦${value.toLocaleString()}`;
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
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const vat = Math.round(subtotal * VAT_RATE);
    const deliveryFee = items.length && deliveryType !== 'pickup' && subtotal <= FREE_DELIVERY_THRESHOLD ? DELIVERY_FEE : 0;
    const total = subtotal + vat + deliveryFee;
    return { subtotal, vat, deliveryFee, total };
}

export function getCartItemCount() {
    const cart = getCart();
    return Object.values(cart).reduce((sum, qty) => sum + qty, 0);
}