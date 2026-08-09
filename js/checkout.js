import { getCart, formatPrice, calculateTotals, clearCart, escapeHtml, getCartItemDetails } from './utils/cart.js';
import { getMenuItems } from './utils/menu.js';
import { saveOrder, generateSecureOrderNumber } from './utils/store.js';
import { sendOrderEmails } from './utils/email.js';
import { getCurrentUser, restoreSession } from './utils/auth.js';

const checkoutForm = document.querySelector('.checkout-form');
const summaryItemsContainer = document.querySelector('.summary-items');
const summarySubtotal = document.getElementById('summary-subtotal');

async function ensureSignedIn() {
    const currentUser = getCurrentUser();
    if (currentUser) return currentUser;

    const restoredUser = await restoreSession();
    if (restoredUser) return restoredUser;

    window.location.href = 'order.html';
    return null;
}

function prefillCheckout(user) {
    if (!checkoutForm || !user) return;
    const nameInput = checkoutForm.querySelector('input[name="fullName"]');
    const emailInput = checkoutForm.querySelector('input[name="email"]');
    if (nameInput && !nameInput.value.trim()) {
        nameInput.value = user.name || '';
    }
    if (emailInput && !emailInput.value.trim()) {
        emailInput.value = user.email || '';
    }
    if (user.useAsDeliveryAddress) {
        const addressInput = checkoutForm.querySelector('input[name="address"]');
        if (addressInput && !addressInput.value.trim()) {
            addressInput.value = user.address || '';
        }
    }
}

const summaryDelivery = document.getElementById('summary-delivery');
const summaryVat = document.getElementById('summary-vat');
const summaryTotal = document.getElementById('summary-total');

async function getCartItems() {
    const cart = getCart();
    const menuItems = await getMenuItems();

    return Object.entries(cart).map(([id, quantity]) => {
        const item = menuItems.find(menu => menu.id === id) || getCartItemDetails(id);
        return item ? { ...item, quantity } : null;
    }).filter(Boolean);
}

async function renderSummary() {
    const items = await getCartItems();
    const deliveryType = getDeliveryType();
    summaryItemsContainer.innerHTML = '';

    const { subtotal, vat, deliveryFee, total } = calculateTotals(items, deliveryType);
    summarySubtotal.textContent = formatPrice(subtotal);
    summaryVat.textContent = formatPrice(vat);
    summaryDelivery.textContent = deliveryFee ? formatPrice(deliveryFee) : 'Free';
    summaryTotal.textContent = formatPrice(total);

    if (!items.length) {
        summaryItemsContainer.innerHTML = '<p class="cart-empty">Your cart is empty. Add items from the order page before checking out.</p>';
        return;
    }

    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'summary-item';
        row.innerHTML = `<span>${escapeHtml(item.name)} x${item.quantity}</span><strong>${formatPrice(item.price * item.quantity)}</strong>`;
        summaryItemsContainer.appendChild(row);
    });
}

function getDeliveryType() {
    if (!checkoutForm) return 'delivery';
    const selected = checkoutForm.querySelector('input[name="deliveryType"]:checked');
    return selected ? selected.value : 'delivery';
}

if (checkoutForm) {
    checkoutForm.querySelectorAll('input[name="deliveryType"]').forEach(radio => {
        radio.addEventListener('change', renderSummary);
    });
    checkoutForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submitButton = checkoutForm.querySelector('button[type="submit"]');
        const message = checkoutForm.querySelector('.form-message') || document.createElement('p');
        message.textContent = '';
        message.classList.remove('error');
        message.classList.remove('success');

        const items = await getCartItems();
        if (!items.length) {
            message.textContent = 'Your cart is empty. Please add items first.';
            message.classList.add('error');
            return;
        }

        const formData = new FormData(checkoutForm);
        const fullName = (formData.get('fullName') || '').trim();
        const phone = (formData.get('phone') || '').trim();
        const email = (formData.get('email') || '').trim();
        const address = (formData.get('address') || '').trim();
        const deliveryType = formData.get('deliveryType') || 'delivery';
        const paymentMethod = formData.get('paymentMethod') || 'delivery';

        if (!fullName || !phone || !email || !address) {
            message.textContent = 'Please complete all fields before submitting your order.';
            message.classList.add('error');
            return;
        }

        const { subtotal, vat, deliveryFee, total } = calculateTotals(items, deliveryType);
        const orderData = {
            orderNumber: generateSecureOrderNumber(),
            createdAt: new Date().toISOString(),
            estimatedTime: deliveryType === 'pickup' ? 'Ready in 20-30 mins' : 'Estimated delivery in 40-55 mins',
            fullName,
            phone,
            email,
            address: deliveryType === 'pickup' ? "Pickup location: Emerald's Cuisine" : address,
            items,
            subtotal,
            vat,
            deliveryFee,
            total,
            deliveryType,
            paymentMethod
        };

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = 'Placing your order...';
        }

        try {
            // Save with cart preservation for recovery
            const savedRow = await saveOrder(orderData, { preserveCartOnError: true });
            // Capture the tracking token from the saved row for emails/confirmation
            if (savedRow?.tracking_token) {
                orderData.trackingToken = savedRow.tracking_token;
            }
        } catch (error) {
            message.textContent = error.message || 'We could not save your order. Please check your connection and try again. Your cart has been preserved for retry.';
            message.classList.add('error');
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = 'Place Order';
            }
            console.error('Failed to save order:', error);
            return;
        }

        // Only send emails and show confirmation if save succeeded
        const emailSent = await sendOrderEmails(orderData);
        message.classList.remove('error');
        message.classList.add('success');
        message.textContent = emailSent
            ? 'Order confirmed! Please check your email for your receipt.'
            : 'Order confirmed! Your order has been placed successfully.';

        clearCart();
        localStorage.setItem('emeraldLastOrder', JSON.stringify(orderData));
        setTimeout(() => {
            window.location.href = `confirmation.html?order=${orderData.orderNumber}`;
        }, 1500);
    });
}

async function initCheckout() {
    const user = await ensureSignedIn();
    if (user) prefillCheckout(user);
    renderSummary();
}

initCheckout();
