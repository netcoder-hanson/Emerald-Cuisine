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
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ienFvZnp1b3RldGt2dHVsb2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU1Mzc4NTMsImV4cCI6MjEwMTExMzg1M30.DZmCcj8fF3wWo4i0B0Wo8w1FzHvzp3hb6aNUtv7m_Vw'
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

    // --- Admin page login (simple demo password) ---
    // Change this to any password you like.
    adminPassword: 'admin123',

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
//   name text not null,
//   description text,
//   image text,
//   sort_order integer default 0,
//   created_at timestamptz default now()
// );
//
// create table menu_items (
//   id uuid primary key default gen_random_uuid(),
//   name text not null,
//   category text not null,
//   description text,
//   price numeric not null,
//   rating numeric default 4.5,
//   image text,
//   available boolean default true,
//   created_at timestamptz default now()
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
//   password_hash text not null,
//   session_token text,
//   remember_me boolean default false,
//   last_seen timestamptz default now(),
//   created_at timestamptz default now()
// );
//
// create table promotions (
//   id uuid primary key default gen_random_uuid(),
//   title text not null,
//   message text,
//   discount text,
//   active boolean default true,
//   created_at timestamptz default now()
// );
//
// create table subscribers (
//   id uuid primary key default gen_random_uuid(),
//   email text not null unique,
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
// ============================================================
