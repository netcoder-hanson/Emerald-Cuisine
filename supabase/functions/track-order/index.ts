import { withSupabase } from 'npm:@supabase/server';

function json(body, status = 200) {
    return Response.json(body, { status });
}

export default {
    fetch: withSupabase({ auth: 'publishable' }, async (req, ctx) => {
        if (req.method !== 'POST') {
            return json({ error: 'Method not allowed' }, 405);
        }

        let payload;
        try {
            payload = await req.json();
        } catch {
            return json({ error: 'Invalid JSON body.' }, 400);
        }

        const orderNumber = String(payload?.order_number || '').trim();
        const trackingToken = String(payload?.tracking_token || '').trim();

        if (!orderNumber || !trackingToken) {
            return json({ error: 'order_number and tracking_token are required.' }, 400);
        }

        try {
            const supabase = ctx.supabaseAdmin;

            const { data: order, error } = await supabase
                .from('orders')
                .select('order_number, status, delivery_type, items, total, address, created_at, tracking_token')
                .eq('order_number', orderNumber)
                .eq('tracking_token', trackingToken)
                .maybeSingle();

            if (error) {
                console.error('track-order query error:', error);
                return json({ error: 'Internal error.' }, 500);
            }

            if (!order) {
                return json({ error: 'Order not found.' }, 404);
            }

            const estimatedTime = order.delivery_type === 'pickup'
                ? 'Ready in 20-30 mins'
                : 'Estimated delivery in 40-55 mins';

            return json({
                order_number: order.order_number,
                status: order.status,
                delivery_type: order.delivery_type,
                estimated_time: estimatedTime,
                items: order.items,
                total: order.total,
                address: order.address,
                created_at: order.created_at
            });
        } catch (err) {
            console.error('track-order error:', err);
            return json({ error: 'Internal error.' }, 500);
        }
    })
};
