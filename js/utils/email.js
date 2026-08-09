import { invokeEdgeFunction } from './store.js';

export async function sendOrderEmails(order) {
    try {
        const result = await invokeEdgeFunction('send-order-email', { order });
        return Boolean(result?.sent_customer || result?.sent_restaurant);
    } catch (error) {
        console.error('Failed to send order emails:', error);
        return false;
    }
}
