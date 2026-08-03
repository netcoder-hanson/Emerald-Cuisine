import CONFIG from '../config.js';

let initialised = false;

function ensureInit() {
    if (initialised) return;
    if (window.emailjs && CONFIG.emailjs.publicKey) {
        window.emailjs.init({ publicKey: CONFIG.emailjs.publicKey });
        initialised = true;
    }
}

export function isEmailConfigured() {
    return Boolean(
        CONFIG.emailjs.publicKey &&
        CONFIG.emailjs.serviceId &&
        CONFIG.emailjs.templateId &&
        CONFIG.emailjs.restaurantEmail &&
        window.emailjs
    );
}

function buildTemplateParams(order) {
    return {
        order_number: order.orderNumber,
        customer_name: order.fullName,
        customer_email: order.email,
        customer_phone: order.phone,
        address: order.address,
        delivery_type: order.deliveryType,
        payment_method: order.paymentMethod,
        items: order.items.map(item => `${item.name} x${item.quantity}`).join(', '),
        total: order.total,
        estimated_time: order.estimatedTime
    };
}

// Sends an email to the restaurant and a receipt to the customer
// using the same template, toggled with the is_restaurant / is_customer flags.
export async function sendOrderEmails(order) {
    if (!isEmailConfigured()) return false;
    ensureInit();
    const params = buildTemplateParams(order);
    try {
        await window.emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, {
            ...params,
            to_email: CONFIG.emailjs.restaurantEmail,
            is_restaurant: true
        });
        await window.emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateId, {
            ...params,
            to_email: order.email,
            is_customer: true
        });
        return true;
    } catch {
        return false;
    }
}
