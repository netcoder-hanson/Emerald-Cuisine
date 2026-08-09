-- ============================================================
-- Phase 0: Secure Order Foundation
-- ============================================================
-- This migration adds foundational columns and constraints
-- needed for secure customer-order relationships.
--
-- All operations are ADDITIVE and IF NOT EXISTS to prevent
-- breaking existing tables regardless of their current schema.
--
-- IMPORTANT: This migration does NOT:
--   - Drop any existing columns
--   - Drop any existing tables
--   - Modify existing data
--   - Add NOT NULL constraints to existing columns
--   - Create foreign keys (requires manual verification first)
-- ============================================================

-- 1. CUSTOMERS TABLE: Add columns that may not exist yet
-- ============================================================

-- marketing_opt_in: used by unsubscribe.js
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT true;

-- password_hash: used by auth.js for authentication
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS password_hash text;

-- session_token: used by auth.js for session management
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS session_token text;

-- remember_me: used by auth.js
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS remember_me boolean DEFAULT false;

-- last_seen: used by auth.js to track activity
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS last_seen timestamptz;

-- created_at: standard timestamp for record creation
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Index for session token lookups (auth.js restoreSession)
CREATE INDEX IF NOT EXISTS idx_customers_session_token
    ON public.customers (session_token)
    WHERE session_token IS NOT NULL;

-- Index for email lookups (used frequently)
CREATE INDEX IF NOT EXISTS idx_customers_email
    ON public.customers (email);


-- 2. ORDERS TABLE: Add customer_id column for order ownership
-- ============================================================

-- customer_id: links order to the customers table
-- Initially nullable to allow migration of existing orders
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_id uuid;

-- Index for querying orders by customer (My Orders feature)
CREATE INDEX IF NOT EXISTS idx_orders_customer_id
    ON public.orders (customer_id)
    WHERE customer_id IS NOT NULL;

-- Index for order_number lookups (getOrder, confirmation, tracking)
CREATE INDEX IF NOT EXISTS idx_orders_order_number
    ON public.orders (order_number);

-- Index for ordering by created_at (admin listing)
CREATE INDEX IF NOT EXISTS idx_orders_created_at
    ON public.orders (created_at DESC);

-- Note: Foreign key constraint for customer_id -> customers.id
-- requires manual verification of the customers.id column type.
-- Run this AFTER verifying customers.id is uuid:
-- ALTER TABLE public.orders
--     ADD CONSTRAINT fk_orders_customer
--     FOREIGN KEY (customer_id) REFERENCES public.customers(id)
--     ON DELETE SET NULL;


-- 3. PROMOTIONS TABLE: Ensure required columns exist
-- ============================================================

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT false;

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS last_sent_count integer DEFAULT 0;

ALTER TABLE public.promotions
    ADD COLUMN IF NOT EXISTS last_failed_count integer DEFAULT 0;


-- 4. SETTINGS TABLE: Ensure it exists for key-value storage
-- ============================================================

CREATE TABLE IF NOT EXISTS public.settings (
    id text PRIMARY KEY,
    value text,
    created_at timestamptz DEFAULT now()
);


-- 5. COMMENTS for documentation
-- ============================================================

COMMENT ON COLUMN public.orders.customer_id IS
    'UUID reference to customers.id. Initially nullable for historical order migration.';

COMMENT ON COLUMN public.customers.password_hash IS
    'SHA-256 hashed password (salted with ::emerald-cuisine). Not a Supabase Auth password.';

COMMENT ON COLUMN public.customers.session_token IS
    'Session token for custom authentication. Used by auth.js restoreSession().';
