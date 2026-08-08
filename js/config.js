// ============================================================
// Site configuration for Emerald's Cuisine
// ------------------------------------------------------------
// Supabase settings below. While keys are empty, the site keeps
// working in "demo mode" (menu falls back to menu.json,
// orders/reviews are local only).
// ============================================================

const CONFIG = {
    supabase: {
        url: 'https://nbzqofzuotetkvtuloba.supabase.co',
        anonKey: 'sb_publishable_EkNPqY8W9_GvtD_yeO9UrQ_ygxRbQZ8',
        storageBucket: 'menu-images',
        functionsBaseUrl: 'https://nbzqofzuotetkvtuloba.supabase.co/functions/v1'
    },

    defaults: {
        currency: '₦',
        taxRate: 7.5,
        deliveryFee: 1500,
        minOrder: 0,
        leadTime: 30
    },

    adminUsername: 'admin',
    adminPassword: '',
    // Email used to sign in as admin from the site header as an alternative
    // to the username. Entering this email + the admin password also
    // redirects straight to admin.html.
    adminEmail: 'admin@emeraldscuisine.com',

    restaurantLocation: {
        lat: 6.4281,
        lng: 3.4219
    }
};

export default CONFIG;

// Supabase tables, storage bucket, and the send-promotion-email and
// send-order-email edge functions are configured in the Supabase dashboard.
// See README.md for the full setup guide.
