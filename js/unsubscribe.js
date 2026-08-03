import CONFIG from './config.js';
import { getSupabaseClient } from './utils/supabase.js';

const form = document.getElementById('unsubscribe-form');
const emailInput = document.getElementById('unsubscribe-email');
const message = document.getElementById('unsubscribe-message');

function setMessage(text, isError = false) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle('error', isError);
}

function prefillEmail() {
    try {
        const params = new URLSearchParams(window.location.search);
        const email = params.get('email');
        if (email && emailInput) {
            emailInput.value = email;
        }
    } catch {
    }
}

async function unsubscribe(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return { ok: false, message: 'Please enter a valid email address.' };

    const client = getSupabaseClient();
    if (client) {
        // Try to flip the subscribers row to 'unsubscribed' (consent respected).
        const { data, error } = await client
            .from('subscribers')
            .update({ status: 'unsubscribed' })
            .eq('email', normalized)
            .select();

        if (error) {
            console.error('Unsubscribe Supabase error:', error);
            return { ok: false, message: 'We could not update your preference right now. Please try again later.' };
        }
        if (data && data.length) {
            return { ok: true, message: 'You have been unsubscribed from promotional emails.' };
        }
        // Email not in subscribers — also flip marketing opt-in on customers.
        const { error: custError } = await client
            .from('customers')
            .update({ marketing_opt_in: false })
            .eq('email', normalized);

        if (custError) {
            console.error('Customer opt-out error:', custError);
            return { ok: false, message: 'We could not update your preference right now. Please try again later.' };
        }
        return { ok: true, message: 'Your marketing preference has been updated. You will no longer receive promotional emails.' };
    }

    // Demo mode fallback: update the local subscribers list.
    try {
        const subscribers = JSON.parse(localStorage.getItem('emeraldSubscribers') || '[]');
        const index = subscribers.findIndex(sub => String(sub.email || '').trim().toLowerCase() === normalized);
        if (index > -1) {
            subscribers[index].status = 'unsubscribed';
            localStorage.setItem('emeraldSubscribers', JSON.stringify(subscribers));
            return { ok: true, message: 'You have been unsubscribed from promotional emails.' };
        }
        return { ok: true, message: 'You are not currently subscribed. No changes were needed.' };
    } catch {
        return { ok: false, message: 'We could not update your preference right now. Please try again later.' };
    }
}

if (form) {
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const email = emailInput ? emailInput.value.trim() : '';
        if (!email) {
            setMessage('Please enter your email address.', true);
            return;
        }
        setMessage('Processing&hellip;');
        form.querySelector('button[type="submit"]').disabled = true;
        const result = await unsubscribe(email);
        form.querySelector('button[type="submit"]').disabled = false;
        setMessage(result.message, !result.ok);
        if (result.ok && emailInput) emailInput.disabled = true;
    });
}

prefillEmail();

