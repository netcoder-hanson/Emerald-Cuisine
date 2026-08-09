import { withSupabase } from 'npm:@supabase/server';

const MAILERSEND_API_KEY = Deno.env.get('MAILERSEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('MAILERSEND_FROM_EMAIL') || 'netcoder.hanson@gmail.com';
const FROM_NAME = Deno.env.get('MAILERSEND_FROM_NAME') || "Emerald's Cuisine";
const SITE_URL = Deno.env.get('SITE_URL') || '';
const MAILERSEND_API = 'https://api.mailersend.com/v3';

function json(body, status = 200) {
    return Response.json(body, { status });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildOrderHtml(order, recipientType, unsubscribeUrl) {
    const items = Array.isArray(order.items) ? order.items : [];
    const itemRows = items.map(item => `
      <tr>
        <td style="padding:8px 0;">${escapeHtml(item.name)} x${escapeHtml(item.quantity)}</td>
        <td align="right" style="padding:8px 0;">₦${Number(item.price * item.quantity).toLocaleString()}</td>
      </tr>
    `).join('');

    const trackingToken = String(order.trackingToken || '').trim();
    const trackingBlock = recipientType === 'customer' && trackingToken ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 24px;background:#F3F8F5;border:1px solid #CFE6DC;border-radius:12px;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0 0 6px;font-size:12px;color:#6B6B6B;text-transform:uppercase;letter-spacing:1px;">Order tracking token</p>
            <p style="margin:0;font-size:22px;font-weight:bold;letter-spacing:2px;color:#0A5C43;">${escapeHtml(trackingToken)}</p>
            <p style="margin:8px 0 0;font-size:12px;color:#6B6B6B;">Keep this token safe. You will need it together with your order number to track your order.</p>
          </td>
        </tr>
      </table>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#F8F6F1;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#0F7A5A;padding:28px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:24px;">Emerald's Cuisine</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">${recipientType === 'restaurant' ? 'New order received' : 'Your order is confirmed'}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#232323;">
            <h2 style="margin:0 0 12px;color:#0A5C43;">Order #${escapeHtml(order.orderNumber)}</h2>
            <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">${recipientType === 'restaurant' ? 'A new order has been placed.' : 'Thanks for your order. We have received your order and payment details.'}</p>
            ${trackingBlock}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0 24px;border-top:1px solid #E7E1D6;border-bottom:1px solid #E7E1D6;">
              <tr><td style="padding:8px 0;"><strong>Customer</strong></td><td align="right" style="padding:8px 0;">${escapeHtml(order.fullName)}</td></tr>
              <tr><td style="padding:8px 0;"><strong>Email</strong></td><td align="right" style="padding:8px 0;">${escapeHtml(order.email)}</td></tr>
              <tr><td style="padding:8px 0;"><strong>Phone</strong></td><td align="right" style="padding:8px 0;">${escapeHtml(order.phone)}</td></tr>
              <tr><td style="padding:8px 0;"><strong>Delivery</strong></td><td align="right" style="padding:8px 0;">${escapeHtml(order.deliveryType)}</td></tr>
              <tr><td style="padding:8px 0;"><strong>Payment</strong></td><td align="right" style="padding:8px 0;">${escapeHtml(order.paymentMethod)}</td></tr>
            </table>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tbody>${itemRows}</tbody>
            </table>
            <p style="display:inline-block;background:#C8A24C;color:#ffffff;padding:10px 20px;border-radius:999px;font-weight:bold;margin:0 0 16px;">
              Total: ₦${Number(order.total).toLocaleString()}
            </p>
            ${order.estimatedTime ? `<p style="font-size:14px;color:#6B6B6B;margin:0 0 6px;">${escapeHtml(order.estimatedTime)}</p>` : ''}
            ${recipientType === 'customer' && SITE_URL && trackingToken ? `<p style="font-size:14px;color:#6B6B6B;margin:0 0 24px;"><a href="${SITE_URL}/track.html?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(trackingToken)}" style="color:#0F7A5A;">Track your order</a></p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#FAF7F0;color:#6B6B6B;font-size:12px;line-height:1.7;">
            ${recipientType === 'customer' ? `<p style="margin:0 0 6px;"><a href="${unsubscribeUrl}" style="color:#0F7A5A;text-decoration:underline;">Unsubscribe</a> from promotional emails.</p>` : ''}
            <p style="margin:0;">Emerald's Cuisine &middot; Lagos, Nigeria</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendMail(toEmail, subject, html, text) {
    const response = await fetch(`${MAILERSEND_API}/email`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({
            from: { email: FROM_EMAIL, name: FROM_NAME },
            to: [{ email: toEmail }],
            subject,
            html,
            text
        })
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`MailerSend returned ${response.status}: ${errorBody}`);
    }
}

export default {
    fetch: withSupabase({ auth: 'publishable' }, async (req) => {
        if (req.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405);
        }
        if (!MAILERSEND_API_KEY) {
            return json({ error: 'MAILERSEND_API_KEY secret is not set on this Edge Function.' }, 500);
        }

        let payload;
        try {
            payload = await req.json();
        } catch {
            return json({ error: 'Invalid JSON body.' }, 400);
        }

        const order = payload?.order;
        if (!order?.orderNumber) {
            return json({ error: 'order is required.' }, 400);
        }

        const customerEmail = String(order.email || '').trim().toLowerCase();
        const restaurantEmail = Deno.env.get('RESTAURANT_EMAIL') || '';
        const trackingToken = String(order.trackingToken || '').trim();
        if (!isValidEmail(customerEmail)) {
            return json({ error: 'Customer email is invalid.' }, 400);
        }
        if (!isValidEmail(restaurantEmail)) {
            return json({ error: 'RESTAURANT_EMAIL secret is not set or invalid.' }, 500);
        }
        if (!trackingToken) {
            return json({ error: 'Order tracking token is missing.' }, 400);
        }

        const customerHtml = buildOrderHtml(order, 'customer', `${SITE_URL}/unsubscribe.html?email=${encodeURIComponent(customerEmail)}`);
        const restaurantHtml = buildOrderHtml(order, 'restaurant', '');
        const customerText = [
            `Your order ${order.orderNumber} is confirmed.`,
            `Order tracking token: ${trackingToken}`,
            `Keep this token safe. You will need it together with your order number to track your order.`,
            SITE_URL ? `Track your order: ${SITE_URL}/track.html?order=${encodeURIComponent(order.orderNumber)}&token=${encodeURIComponent(trackingToken)}` : ''
        ].filter(Boolean).join('\n\n');
        const restaurantText = `New order received: ${order.orderNumber}.`;

        try {
            await Promise.all([
                sendMail(restaurantEmail, `New order received: ${order.orderNumber}`, restaurantHtml, restaurantText),
                sendMail(customerEmail, `Order confirmed: ${order.orderNumber}`, customerHtml, customerText)
            ]);
            return json({ sent_customer: true, sent_restaurant: true });
        } catch (error) {
            console.error('send-order-email error:', error);
            return json({ error: `Internal error: ${error.message}` }, 500);
        }
    })
};
