import { formatPrice, escapeHtml } from './utils/cart.js';
import { getOrder } from './utils/store.js';

const params = new URLSearchParams(window.location.search);
const orderNumber = params.get('order');

async function render() {
    let localOrder = null;
    try {
        localOrder = JSON.parse(localStorage.getItem('emeraldLastOrder') || 'null');
    } catch {
        localOrder = null;
    }
    let order = null;
    if (orderNumber) {
        if (localOrder && localOrder.orderNumber === orderNumber) {
            order = localOrder;
        } else {
            try {
                order = await getOrder(orderNumber);
            } catch (error) {
                console.error('Failed to load order:', error);
            }
        }
    }

    if (!order) {
        const card = document.querySelector('.confirmation-card');
        if (card) {
            card.innerHTML = '<p class="menu-empty">We could not find that order. Please check your order number and try again.</p>';
        }
        return;
    }

    document.getElementById('confirm-name').textContent = order.fullName;
    document.getElementById('confirm-number').textContent = order.orderNumber;
    document.getElementById('confirm-time').textContent = order.estimatedTime;
    document.getElementById('confirm-address').textContent = order.address;
    document.getElementById('confirm-phone').textContent = order.phone;
    document.getElementById('confirm-email').textContent = order.email;
    document.getElementById('confirm-payment').textContent = order.paymentMethod === 'card' ? 'Card payment' : 'Pay on delivery';
    document.getElementById('confirm-total').textContent = formatPrice(order.total);

    const itemsEl = document.getElementById('confirm-items');
    itemsEl.innerHTML = '';
    const items = Array.isArray(order.items) ? order.items : [];
    if (!items.length) {
        itemsEl.innerHTML = '<p class="cart-empty">No items were recorded for this order.</p>';
    }
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'summary-item';
        row.innerHTML = `<span>${escapeHtml(item.name)} x${item.quantity}</span><strong>${formatPrice(item.price * item.quantity)}</strong>`;
        itemsEl.appendChild(row);
    });

    document.getElementById('track-btn').href = `track.html?order=${order.orderNumber}`;
}

render();
