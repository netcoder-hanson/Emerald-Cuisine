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
        // Call the SECURITY DEFINER function which safely sets
        // status = 'unsubscribed' and flips customer marketing_opt_in.
        // This replaces the removed direct UPDATE policies.
        const { error } = await client.rpc('unsubscribe_by_email', {
            p_email: normalized
        });

        if (error) {
            console.error('Unsubscribe RPC error:', error);
            return { ok: false, message: 'We could not update your preference right now. Please try again later.' };
        }
        return { ok: true, message: 'You have been unsubscribed from promotional emails.' };
    }

    return { ok: false, message: 'We could not update your preference right now. Please try again later.' };
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

