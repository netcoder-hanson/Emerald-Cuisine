import { formatPrice, escapeHtml } from './utils/cart.js';
import { getOrder } from './utils/store.js';

const params = new URLSearchParams(window.location.search);
const orderNumber = params.get('order');

function initCopyButton(token) {
    const btn = document.getElementById('copy-token-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        try {
            await navigator.clipboard.writeText(token);
            btn.classList.add('copied');
            btn.querySelector('.copy-label').textContent = 'Copied!';
            setTimeout(() => {
                btn.classList.remove('copied');
                btn.querySelector('.copy-label').textContent = 'Copy';
            }, 2000);
        } catch {
            // Fallback for older browsers or insecure contexts
            const textarea = document.createElement('textarea');
            textarea.value = token;
            textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand('copy');
                btn.classList.add('copied');
                btn.querySelector('.copy-label').textContent = 'Copied!';
                setTimeout(() => {
                    btn.classList.remove('copied');
                    btn.querySelector('.copy-label').textContent = 'Copy';
                }, 2000);
            } catch {
                btn.querySelector('.copy-label').textContent = 'Failed';
                setTimeout(() => {
                    btn.querySelector('.copy-label').textContent = 'Copy';
                }, 2000);
            }
            textarea.remove();
        }
    });
}

async function render() {
    let order = null;

    if (orderNumber) {
        // ALWAYS query database first (no localStorage fallback by default)
        try {
            order = await getOrder(orderNumber);
        } catch (error) {
            console.error('Failed to load order from database:', error);
        }
    }

    if (!order) {
        const card = document.querySelector('.confirmation-card');
        if (card) {
            card.innerHTML = `
                <p class="menu-empty">
                    We could not find order <strong>${escapeHtml(orderNumber || 'unknown')}</strong> in our system.
                </p>
                <p class="menu-empty" style="margin-top: 16px;">
                    If you just placed an order, please check your email for confirmation.
                    If you believe this is an error, please contact us.
                </p>
                <a href="order.html" class="btn btn-primary" style="margin-top: 24px;">Place a New Order</a>
            `;
        }
        return;
    }

    // Show confirmation details
    document.getElementById('confirm-name').textContent = order.fullName;
    document.getElementById('confirm-number').textContent = order.orderNumber;
    document.getElementById('confirm-time').textContent = order.estimatedTime;
    document.getElementById('confirm-address').textContent = order.address;
    document.getElementById('confirm-phone').textContent = order.phone;
    document.getElementById('confirm-email').textContent = order.email;
    document.getElementById('confirm-payment').textContent = order.paymentMethod === 'card' ? 'Card payment' : 'Pay on delivery';
    document.getElementById('confirm-total').textContent = formatPrice(order.total);

    // Show tracking token if available
    const tokenBox = document.getElementById('tracking-token-box');
    if (order.trackingToken) {
        document.getElementById('confirm-token').textContent = order.trackingToken;
        tokenBox.hidden = false;
        initCopyButton(order.trackingToken);
    } else {
        tokenBox.hidden = true;
    }

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

    document.getElementById('track-btn').href = `track.html?order=${order.orderNumber}${order.trackingToken ? `&token=${order.trackingToken}` : ''}`;

    // Show notice if this is a localStorage-only order (should not happen with new code)
    if (order.isDatabaseOrder === false) {
        const notice = document.createElement('div');
        notice.className = 'menu-empty';
        notice.style.cssText = 'margin-top: 24px; padding: 16px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px;';
        notice.innerHTML = `
            <strong>Note:</strong> This order was not found in our database. 
            It may not have been fully processed. Please contact us if you have concerns.
        `;
        document.querySelector('.confirmation-card')?.appendChild(notice);
    }
}

render();
