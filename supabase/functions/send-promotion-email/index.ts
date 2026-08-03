// ============================================================
// send-promotion-email — Supabase Edge Function
// ------------------------------------------------------------
// Emails every active newsletter subscriber + every customer
// who has opted in to marketing about a promotion, then records
// the send result back on the promotions row.
//
// MailerSend API key lives ONLY as a Supabase secret:
//     supabase secrets set MAILERSEND_API_KEY=mlsn.xxxx
// Optionally set the from address / name:
//     supabase secrets set MAILERSEND_FROM_EMAIL=netcoder.hanson@gmail.com
//     supabase secrets set MAILERSEND_FROM_NAME="Emerald's Cuisine"
//
// Deploy with:
//     supabase functions deploy send-promotion-email
// ============================================================

import { withSupabase } from 'npm:@supabase/server';

const MAILERSEND_API_KEY = Deno.env.get('MAILERSEND_API_KEY') || '';
const FROM_EMAIL = Deno.env.get('MAILERSEND_FROM_EMAIL') || 'netcoder.hanson@gmail.com';
const FROM_NAME = Deno.env.get('MAILERSEND_FROM_NAME') || "Emerald's Cuisine";
// Public origin used to build unsubscribe links (e.g. https://emeraldscuisine.com).
const SITE_URL = Deno.env.get('SITE_URL') || '';
const MAILERSEND_API = 'https://api.mailersend.com/v3';

function json(body, status = 200) {
    return Response.json(body, { status });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function buildPromoHtml(promotion, discountText, unsubscribeUrl) {
    const description = String(promotion.description || promotion.message || '');
    const escape = (value) => String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    return `
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;background:#F8F6F1;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F1;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="background:#0F7A5A;padding:28px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:24px;">Emerald's Cuisine</h1>
            <p style="margin:6px 0 0;opacity:0.9;font-size:14px;">Exclusive offer for you</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#232323;">
            <h2 style="margin:0 0 12px;color:#0A5C43;">${escape(promotion.title)}</h2>
            <p style="font-size:16px;line-height:1.7;margin:0 0 16px;">${escape(description)}</p>
            <p style="display:inline-block;background:#C8A24C;color:#ffffff;padding:10px 20px;border-radius:999px;font-weight:bold;margin:0 0 24px;">
              ${discountText ? `Save ${escape(discountText)}` : 'Limited-time offer'}
            </p>
            ${promotion.start_date ? `<p style="font-size:14px;color:#6B6B6B;margin:0 0 4px;">Valid from ${escape(promotion.start_date)}</p>` : ''}
            ${promotion.end_date ? `<p style="font-size:14px;color:#6B6B6B;margin:0 0 24px;">Until ${escape(promotion.end_date)}</p>` : ''}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background:#FAF7F0;color:#6B6B6B;font-size:12px;line-height:1.7;">
            <p style="margin:0 0 6px;">
              <a href="${unsubscribeUrl}" style="color:#0F7A5A;text-decoration:underline;">Unsubscribe</a>
              from promotional emails. You'll still receive order updates.
            </p>
            <p style="margin:0;">Emerald's Cuisine &middot; Lagos, Nigeria</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Sends one bulk batch (max 100 recipients per MailerSend bulk call).
async function sendBulk(recipients, subject, buildHtmlFor) {
    const messages = recipients.map((email) => {
        const unsubscribeUrl = SITE_URL
            ? `${SITE_URL}/unsubscribe.html?email=${encodeURIComponent(email)}`
            : `/unsubscribe.html?email=${encodeURIComponent(email)}`;
        return {
            from: { email: FROM_EMAIL, name: FROM_NAME },
            to: [{ email }],
            subject,
            html: buildHtmlFor(email, unsubscribeUrl),
            text: 'You are receiving this because you subscribed to Emerald\u2019s Cuisine updates.'
        };
    });

    const response = await fetch(`${MAILERSEND_API}/bulk`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${MAILERSEND_API_KEY}`,
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        },
        body: JSON.stringify({ messages })
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`MailerSend bulk returned ${response.status}: ${errorBody}`);
    }
    return messages.length;
}

export default {
    fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => {
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

        const promotionId = payload?.promotion_id;
        if (!promotionId) {
            return json({ error: 'promotion_id is required.' }, 400);
        }

        try {
            const supabase = ctx.supabaseAdmin;

            // 1. Load the promotion.
            const { data: promotion, error: promoError } = await supabase
                .from('promotions')
                .select('*')
                .eq('id', promotionId)
                .single();
            if (promoError || !promotion) {
                return json({ error: 'Promotion not found.' }, 404);
            }

            // 2. Pull recipients respecting consent.
            const [subResult, custResult] = await Promise.all([
                supabase.from('subscribers').select('email').eq('status', 'active'),
                supabase.from('customers').select('email').eq('marketing_opt_in', true)
            ]);

            const emails = new Set();
            (subResult.data || []).forEach((row) => emails.add(String(row.email || '').trim().toLowerCase()));
            (custResult.data || []).forEach((row) => emails.add(String(row.email || '').trim().toLowerCase()));
            const recipients = [...emails].filter(isValidEmail);

            const nowIso = new Date().toISOString();
            const discountText = promotion.discount_value !== null && promotion.discount_value !== undefined
                ? (promotion.discount_type === 'fixed'
                    ? `₦${Number(promotion.discount_value).toLocaleString()}`
                    : `${Number(promotion.discount_value)}%`)
                : '';

            if (!recipients.length) {
                await supabase.from('promotions').update({
                    is_live: true,
                    last_sent_at: nowIso,
                    last_sent_count: 0,
                    last_failed_count: 0
                }).eq('id', promotionId);
                return json({ sent: 0, failed: 0, message: 'No active recipients to email.' });
            }

            // 3. Send in batches of 100 (MailerSend bulk limit).
            const subject = `Special offer: ${promotion.title}`;
            const buildHtmlFor = (email, unsubscribeUrl) =>
                buildPromoHtml(promotion, discountText, unsubscribeUrl);

            let sent = 0;
            let failed = 0;
            for (let i = 0; i < recipients.length; i += 100) {
                const batch = recipients.slice(i, i + 100);
                try {
                    const accepted = await sendBulk(batch, subject, buildHtmlFor);
                    sent += accepted;
                } catch (err) {
                    console.error('Bulk batch failed:', err);
                    failed += batch.length;
                }
            }

            // 4. Record the result back on the promotion.
            await supabase.from('promotions').update({
                is_live: true,
                last_sent_at: nowIso,
                last_sent_count: sent,
                last_failed_count: failed
            }).eq('id', promotionId);

            return json({
                sent,
                failed,
                recipients: recipients.length,
                message: `${sent} email(s) accepted, ${failed} failed.`
            });
        } catch (err) {
            console.error('send-promotion-email error:', err);
            return json({ error: `Internal error: ${err.message}` }, 500);
        }
    })
};
