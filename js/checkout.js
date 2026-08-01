import { getCart, formatPrice, calculateTotals, clearCart, escapeHtml } from './utils/cart.js';
import { getMenuItems } from './utils/menu.js';

const checkoutForm = document.querySelector('.checkout-form');
const summaryItemsContainer = document.querySelector('.summary-items');
const summarySubtotal = document.getElementById('summary-subtotal');
const summaryDelivery = document.getElementById('summary-delivery');
const summaryVat = document.getElementById('summary-vat');
const summaryTotal = document.getElementById('summary-total');
const confirmationCard = document.querySelector('.confirmation-card');
const confirmationNumber = document.getElementById('confirmation-number');
const confirmationTime = document.getElementById('confirmation-time');
const confirmationName = document.getElementById('confirmation-name');
const confirmationPhone = document.getElementById('confirmation-phone');
const confirmationEmail = document.getElementById('confirmation-email');
const confirmationAddress = document.getElementById('confirmation-address');
const confirmationItems = document.getElementById('confirmation-items');
const confirmationTotal = document.getElementById('confirmation-total');

async function getCartItems() {
    const cart = getCart();
    const menuItems = await getMenuItems();
    
    return Object.entries(cart).map(([id, quantity]) => {
        const item = menuItems.find(menu => menu.id === id);
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

function showConfirmation(data) {
    document.querySelector('.checkout-section').scrollIntoView({ behavior: 'smooth' });
    confirmationCard.classList.remove('hidden');
    confirmationNumber.textContent = data.orderNumber;
    confirmationTime.textContent = data.estimatedTime;
    confirmationName.textContent = data.fullName;
    confirmationPhone.textContent = data.phone;
    confirmationEmail.textContent = data.email;
    confirmationAddress.textContent = data.address;
    confirmationItems.innerHTML = '';
    data.items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'summary-item';
        row.innerHTML = `<span>${escapeHtml(item.name)} x${item.quantity}</span><strong>${formatPrice(item.price * item.quantity)}</strong>`;
        confirmationItems.appendChild(row);
    });
    confirmationTotal.textContent = formatPrice(data.total);
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
        const items = await getCartItems();
        if (!items.length) {
            const message = checkoutForm.querySelector('.form-message');
            message.textContent = 'Your cart is empty. Please add items first.';
            message.classList.add('error');
            return;
        }

        const formData = new FormData(checkoutForm);
        const fullName = formData.get('fullName').trim();
        const phone = formData.get('phone').trim();
        const email = formData.get('email').trim();
        const address = formData.get('address').trim();
        const deliveryType = formData.get('deliveryType');
        const paymentMethod = formData.get('paymentMethod');

        if (!fullName || !phone || !email || !address) {
            const message = checkoutForm.querySelector('.form-message');
            message.textContent = 'Please complete all fields before submitting your order.';
            message.classList.add('error');
            return;
        }

        const { subtotal, vat, total } = calculateTotals(items, deliveryType);
        const orderData = {
            orderNumber: `EBF${Date.now().toString().slice(-6)}`,
            estimatedTime: deliveryType === 'pickup' ? 'Ready in 20-30 mins' : 'Estimated delivery in 40-55 mins',
            fullName,
            phone,
            email,
            address: deliveryType === 'pickup' ? "Pickup location: Emerald's Cuisine" : address,
            items,
            total
        };

        clearCart();
        await renderSummary();
        showConfirmation(orderData);
        checkoutForm.reset();
    });
}

renderSummary();