// ============================================================
// Site configuration for Emerald's Cuisine
// ------------------------------------------------------------
// To enable live features you must:
//   1. Create a FREE Supabase project   -> https://supabase.com
//   2. Create a FREE EmailJS account    -> https://www.emailjs.com
//   3. Paste your keys below.
//
// While keys are empty, the site keeps working in "demo mode"
// (menu falls back to menu.json, orders/reviews are local only).
// ============================================================

const CONFIG = {
    // --- Supabase (backend database) ---
    // Create a project, then open Project Settings -> API.
    supabase: {
        url: 'https://nbzqofzuotetkvtuloba.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ienFvZnp1b3RldGt2dHVsb2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Mzc4NTMsImV4cCI6MjEwMTExMzg1M30.DZmCcj8fF3wWo4i0B0Wo8w1FzHvzp3hb6aNUtv7m_Vw',
        // Storage bucket used for menu item / logo image uploads.
        storageBucket: 'menu-images',
        // Base URL for Supabase Edge Functions. The promotions "Go live"
        // button calls <this base>/send-promotion-email. The anon key is
        // used for authorization (the function itself reads its secret).
        functionsBaseUrl: 'https://nbzqofzuotetkvtuloba.supabase.co/functions/v1'
    },

    // --- Site defaults (overridable from the admin dashboard -> Settings) ---
    defaults: {
        currency: '₦',          // currency symbol shown next to prices
        taxRate: 7.5,           // percentage
        deliveryFee: 1500,
        minOrder: 0,
        leadTime: 30            // minutes
    },

    // --- EmailJS (sending emails from the browser) ---
    // Create an account, add an email service and ONE template.
    // Set the template's "To Email" field to {{to_email}} and use these
    // variable names inside it:
    //   restaurant copy:    is_restaurant, order_number, customer_name,
    //     customer_email, customer_phone, address, delivery_type,
    //     payment_method, items, total, estimated_time
    //   customer receipt:   is_customer (same order variables)
    //   promo blast:        is_promo, customer_email, title, message, discount
    emailjs: {
        publicKey: 'V4Tpt0y6t2153vgDX',         // Account -> General -> Public Key
        serviceId: 'service_tidc7oe',         // your email service id, e.g. 'service_abc'
        templateId: 'template_37hgsd4',        // the single Emerald's Cuisine template id
        restaurantEmail: 'jerry02wright@outlook.com'    // the inbox that receives new order notifications
    },

    // --- Admin page login (simple demo credentials) ---
    // Default admin username + password. Use these on the site header or
    // the admin login form to open the dashboard. You can change them
    // inside the dashboard (Settings -> Admin credentials) or here.
    adminUsername: 'admin',
    adminPassword: 'admin123',
    // Email used to sign in as admin from the site header as an alternative
    // to the username. Entering this email + the admin password also
    // redirects straight to admin.html.
    adminEmail: 'admin@emeraldscuisine.com',

    // --- Restaurant location (used by the order tracker map) ---
    restaurantLocation: {
        lat: 6.4281,
        lng: 3.4219
    }
};

export default CONFIG;

// ============================================================
// SUPABASE SETUP (one-time)
// ------------------------------------------------------------
// In the Supabase SQL editor, run this once:
//
// create table categories (
//   id uuid primary key default gen_random_uuid(),
//   name text not null unique,
//   description text,
//   image text,
//   sort_order integer default 0,
//   display_order integer default 0,
//   created_at timestamptz default now()
// );
//
// create table menu_items (
//   id uuid primary key default gen_random_uuid(),
//   name text not null,
//   category text not null,
//   description text not null default '',
//   price numeric not null,
//   rating numeric default 4.5,
//   image text,
//   image_url text,
//   category_id uuid references categories(id),
//   is_available boolean default true,
//   available boolean default true,
//   created_at timestamptz default now(),
//   updated_at timestamptz default now()
// );
//
// create table orders (
//   id uuid primary key default gen_random_uuid(),
//   order_number text not null unique,
//   customer_name text not null,
//   phone text,
//   email text,
//   address text,
//   delivery_type text default 'delivery',
//   payment_method text default 'delivery',
//   items jsonb not null,
//   subtotal numeric,
//   vat numeric,
//   delivery_fee numeric,
//   total numeric,
//   status text default 'received',
//   created_at timestamptz default now()
// );
//
// create table customers (
//   id uuid primary key default gen_random_uuid(),
//   name text not null,
//   email text not null unique,
//   phone text,
//   address text,
//   password_hash text not null,
//   session_token text,
//   remember_me boolean default false,
//   marketing_opt_in boolean default false,
//   last_seen timestamptz default now(),
//   created_at timestamptz default now()
// );
//
// create table promotions (
//   id uuid primary key default gen_random_uuid(),
//   title text not null,
//   description text not null default '',
//   message text,
//   discount text,
//   discount_type text default 'percentage',
//   discount_value numeric(10,2),
//   start_date date,
//   end_date date,
//   active boolean default true,
//   is_live boolean default false,
//   last_sent_at timestamptz,
//   created_at timestamptz default now()
// );
//
// create table subscribers (
//   id uuid primary key default gen_random_uuid(),
//   email text not null unique,
//   status text default 'active',
//   subscribed_at timestamptz default now(),
//   created_at timestamptz default now()
// );
//
// create table reviews (
//   id uuid primary key default gen_random_uuid(),
//   customer_name text,
//   rating integer not null,
//   comment text not null,
//   order_number text,
//   created_at timestamptz default now()
// );
//
// create table settings (
//   id text primary key,
//   value text
// );
//
// For each table above run:  alter table <table> enable row level security;
// Then add open demo policies, e.g. for menu_items:
//   create policy "open access menu_items" on menu_items for all using (true) with check (true);
// (Repeat for every table. This is fine for learning/demo. For a real
// public site, replace with stricter policies.)
//
// ------------------------------------------------------------
// UPGRADING AN EXISTING DATABASE (non-destructive)
// ------------------------------------------------------------
// If you already created the original tables and only need the new
// admin-panel columns, run this instead of re-creating anything:
//
// alter table categories add column if not exists display_order integer default 0;
// alter table categories add constraint categories_name_unique unique (name);
//
// alter table menu_items add column if not exists description text not null default '';
// alter table menu_items add column if not exists image_url text;
// alter table menu_items add column if not exists category_id uuid references categories(id);
// alter table menu_items add column if not exists is_available boolean default true;
// alter table menu_items add column if not exists updated_at timestamptz default now();
//
// alter table customers add column if not exists phone text;
// alter table customers add column if not exists address text;
// alter table customers add column if not exists marketing_opt_in boolean default false;
//
// alter table promotions add column if not exists description text not null default '';
// alter table promotions add column if not exists discount_type text default 'percentage';
// alter table promotions add column if not exists discount_value numeric(10,2);
// alter table promotions add column if not exists start_date date;
// alter table promotions add column if not exists end_date date;
// alter table promotions add column if not exists is_live boolean default false;
// alter table promotions add column if not exists last_sent_at timestamptz;
//
// alter table subscribers add column if not exists status text default 'active';
// alter table subscribers add column if not exists subscribed_at timestamptz default now();
//
// -- Sync legacy flags after adding the new columns:
// update menu_items set is_available = available where is_available is null;
// update promotions set is_live = active where is_live is null;
// update subscribers set status = 'active' where status is null;
//
// ------------------------------------------------------------
// STORAGE BUCKET + EDGE FUNCTION (one-time)
// ------------------------------------------------------------
// 1. Storage: create a public bucket named "menu-images". In the
//    Supabase dashboard: Storage -> New bucket -> name "menu-images",
//    public bucket. Add a policy allowing anon uploads/reads (demo; use
//    a service-role-only policy for production):
//
//   create policy "public read images"
//     on storage.objects for select using (bucket_id = 'menu-images');
//   create policy "public upload images"
//     on storage.objects for insert with check (bucket_id = 'menu-images');
//
// 2. Edge Function (promotion email via MailerSend):
//    - Deploy supabase/functions/send-promotion-email with:
//        supabase functions deploy send-promotion-email
//    - Set the MailerSend API key as a Supabase secret (never client-side):
//        supabase secrets set MAILERSEND_API_KEY=...
//    - Optional template id: MAILERSEND_TEMPLATE_ID=...
//    The function reads subscribers (status='active') + customers
//    (marketing_opt_in=true), sends via MailerSend, and writes
//    last_sent_at + sent/failed counts back to the promotions row.
// ============================================================
