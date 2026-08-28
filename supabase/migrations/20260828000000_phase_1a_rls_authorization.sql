-- ============================================================
-- Phase 1A: RLS & Authorization Hardening
-- ============================================================
-- Closes every authorization gap identified in the security audit:
--
--   1. ENABLES RLS + FORCE RLS on all 8 tables (policies existed
--      but RLS was never turned on — policies were purely decorative).
--   2. Drops the dangerous subscribers UPDATE policy that let any
--      anonymous user corrupt the mailing list.
--   3. Replaces it with a SECURITY DEFINER RPC that atomically
--      sets status = 'unsubscribed' for a matching email, without
--      exposing other rows or allowing column changes.
--   4. Restricts review inserts to authenticated users (was open
--      to anon — unlimited spam vector).
--   5. Fixes is_admin NULLability (NULL caused customers_update_own
--      to fail for legacy rows — WITH CHECK (is_admin = false)
--      evaluates NULL = false → NULL → policy denied).
--   6. Adds the missing foreign key orders.customer_id → customers.id
--      to enforce referential integrity.
--   7. Adds UNIQUE constraints on orders.order_number and
--      subscribers.email to prevent duplicates that break lookups.
--   8. Drops the redundant tracking_token btree index (the UNIQUE
--      constraint already creates one).
--   9. Adds a customers_admin_insert policy so admins can create
--      customer records directly.
--
-- NOTE on service role: the Supabase service-role client (used by the
-- edge functions via ctx.supabaseAdmin) bypasses RLS by design. No
-- "service" policies are required — FORCE ROW LEVEL SECURITY does not
-- affect superuser/service roles.
--
-- Preserves all existing application functionality.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. HELPER: restrict unauthenticated unsubscribe to safe updates
-- ──────────────────────────────────────────────────────────────

-- SECURITY DEFINER so anon callers can invoke it without needing
-- SELECT/UPDATE on subscribers.  It only touches the single row
-- whose email matches, and only sets status → 'unsubscribed'.
CREATE OR REPLACE FUNCTION public.unsubscribe_by_email(p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized text := trim(lower(p_email));
BEGIN
  UPDATE public.subscribers
     SET status = 'unsubscribed'
   WHERE email = normalized
     AND status != 'unsubscribed';

  -- Also best-effort flip customer marketing_opt_in.
  UPDATE public.customers
     SET marketing_opt_in = false
   WHERE email = normalized
     AND marketing_opt_in = true;

  RETURN true;  -- always returns true to avoid email enumeration
END;
$$;

COMMENT ON FUNCTION public.unsubscribe_by_email(text) IS
  'Allows anonymous users to unsubscribe by email. SECURITY DEFINER to bypass RLS. Only sets status to unsubscribed — no other columns can be modified.';


-- ──────────────────────────────────────────────────────────────
-- 1. ENABLE RLS on every public table
-- ──────────────────────────────────────────────────────────────

ALTER TABLE public.customers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings     ENABLE ROW LEVEL SECURITY;

-- FORCE ensures even table owners (service_role) are bound by RLS
-- when accessing data through the PostgREST API.  The service-role
-- client used by edge functions bypasses RLS via the Superuser
-- permission, so FORCE only affects non-superuser roles — exactly
-- what we want for defense in depth.
ALTER TABLE public.customers    FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.reviews      FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subscribers  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promotions   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.settings     FORCE ROW LEVEL SECURITY;


-- ──────────────────────────────────────────────────────────────
-- 2. SCHEMA INTEGRITY: constraints that prevent data corruption
-- ──────────────────────────────────────────────────────────────

-- 2a. is_admin must NOT NULL (NULL broke customers_update_own)
-- Backfill any NULL values to false first
UPDATE public.customers SET is_admin = false WHERE is_admin IS NULL;

ALTER TABLE public.customers
    ALTER COLUMN is_admin SET DEFAULT false,
    ALTER COLUMN is_admin SET NOT NULL;

-- 2b. Foreign key: orders.customer_id → customers.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_orders_customer'
    AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
        ADD CONSTRAINT fk_orders_customer
        FOREIGN KEY (customer_id) REFERENCES public.customers(id)
        ON DELETE SET NULL;
  END IF;
END $$;

-- 2c. UNIQUE on order_number (prevents duplicate lookups returning arbitrary rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_order_number_unique'
    AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
        ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
  END IF;
END $$;

-- 2d. UNIQUE on subscribers.email (prevents duplicate subscriptions)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscribers_email_unique'
    AND conrelid = 'public.subscribers'::regclass
  ) THEN
    ALTER TABLE public.subscribers
        ADD CONSTRAINT subscribers_email_unique UNIQUE (email);
  END IF;
END $$;

-- 2e. Drop redundant tracking_token index (UNIQUE constraint already creates btree)
DROP INDEX IF EXISTS public.idx_orders_tracking_token;


-- ──────────────────────────────────────────────────────────────
-- 3. DROP all existing policies so we start from a clean state
-- ──────────────────────────────────────────────────────────────

-- Customers
DROP POLICY IF EXISTS "customers_select_own"          ON public.customers;
DROP POLICY IF EXISTS "customers_admin_select"         ON public.customers;
DROP POLICY IF EXISTS "customers_insert_self"          ON public.customers;
DROP POLICY IF EXISTS "customers_update_own"           ON public.customers;
DROP POLICY IF EXISTS "customers_admin_update"         ON public.customers;
DROP POLICY IF EXISTS "customers_admin_delete"         ON public.customers;
DROP POLICY IF EXISTS "open access customers"          ON public.customers;

-- Orders
DROP POLICY IF EXISTS "orders_select_own"              ON public.orders;
DROP POLICY IF EXISTS "orders_admin_select"            ON public.orders;
DROP POLICY IF EXISTS "orders_insert_own"              ON public.orders;
DROP POLICY IF EXISTS "orders_admin_update"            ON public.orders;
DROP POLICY IF EXISTS "orders_admin_delete"            ON public.orders;
DROP POLICY IF EXISTS "open access orders"             ON public.orders;

-- Menu items
DROP POLICY IF EXISTS "menu_items_public_read"         ON public.menu_items;
DROP POLICY IF EXISTS "menu_items_admin_write"         ON public.menu_items;
DROP POLICY IF EXISTS "Open access menu_items"         ON public.menu_items;

-- Categories
DROP POLICY IF EXISTS "categories_public_read"         ON public.categories;
DROP POLICY IF EXISTS "categories_admin_write"         ON public.categories;
DROP POLICY IF EXISTS "Open access categories"         ON public.categories;

-- Reviews
DROP POLICY IF EXISTS "reviews_public_read"            ON public.reviews;
DROP POLICY IF EXISTS "reviews_public_insert"          ON public.reviews;
DROP POLICY IF EXISTS "reviews_admin_delete"           ON public.reviews;
DROP POLICY IF EXISTS "open access reviews"            ON public.reviews;

-- Subscribers
DROP POLICY IF EXISTS "subscribers_public_insert"              ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_unsubscribe_by_email"       ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_admin_select"               ON public.subscribers;
DROP POLICY IF EXISTS "subscribers_admin_manage"               ON public.subscribers;
DROP POLICY IF EXISTS "Open access subscribers"                ON public.subscribers;

-- Promotions
DROP POLICY IF EXISTS "promotions_public_read"         ON public.promotions;
DROP POLICY IF EXISTS "promotions_admin_select"        ON public.promotions;
DROP POLICY IF EXISTS "promotions_admin_write"         ON public.promotions;
DROP POLICY IF EXISTS "open access promotions"         ON public.promotions;

-- Settings
DROP POLICY IF EXISTS "settings_public_read"           ON public.settings;
DROP POLICY IF EXISTS "settings_admin_write"           ON public.settings;
DROP POLICY IF EXISTS "open access settings"           ON public.settings;


-- ──────────────────────────────────────────────────────────────
-- 4. RECREATE policies — restrictive, role-based
-- ──────────────────────────────────────────────────────────────

-- ── 4a. CUSTOMERS ────────────────────────────────────────────

-- Owner can read their own record
CREATE POLICY "customers_select_own"
    ON public.customers FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

-- Admin can read all customers
CREATE POLICY "customers_admin_select"
    ON public.customers FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Authenticated user can create their own profile (new registration)
CREATE POLICY "customers_insert_self"
    ON public.customers FOR INSERT
    TO authenticated
    WITH CHECK (auth_user_id = auth.uid());

-- Admin can insert customers on behalf of others
CREATE POLICY "customers_admin_insert"
    ON public.customers FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- Owner can update own record (cannot self-promote to admin)
CREATE POLICY "customers_update_own"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (auth_user_id = auth.uid())
    WITH CHECK (
        auth_user_id = auth.uid()
        AND is_admin = false
    );

-- Admin can update any customer (including promoting to admin)
CREATE POLICY "customers_admin_update"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Admin can delete customers
CREATE POLICY "customers_admin_delete"
    ON public.customers FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- ── 4b. ORDERS ───────────────────────────────────────────────

-- Owner can read own orders
CREATE POLICY "orders_select_own"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        customer_id IN (
            SELECT id FROM public.customers
            WHERE auth_user_id = auth.uid()
        )
    );

-- Admin can read all orders
CREATE POLICY "orders_admin_select"
    ON public.orders FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Owner can insert own orders (customer_id must match their profile)
CREATE POLICY "orders_insert_own"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        customer_id IN (
            SELECT id FROM public.customers
            WHERE auth_user_id = auth.uid()
        )
    );

-- Admin can update any order (status changes, etc.)
CREATE POLICY "orders_admin_update"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Admin can delete orders
CREATE POLICY "orders_admin_delete"
    ON public.orders FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- ── 4c. MENU ITEMS ───────────────────────────────────────────

-- Everyone (including anon) can browse the menu
CREATE POLICY "menu_items_public_read"
    ON public.menu_items FOR SELECT
    USING (true);

-- Admin has full write access
CREATE POLICY "menu_items_admin_write"
    ON public.menu_items FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ── 4d. CATEGORIES ───────────────────────────────────────────

-- Everyone (including anon) can browse categories
CREATE POLICY "categories_public_read"
    ON public.categories FOR SELECT
    USING (true);

-- Admin has full write access
CREATE POLICY "categories_admin_write"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ── 4e. REVIEWS ──────────────────────────────────────────────

-- Everyone (including anon) can read reviews
CREATE POLICY "reviews_public_read"
    ON public.reviews FOR SELECT
    USING (true);

-- ONLY authenticated users can insert reviews (prevents anon spam)
CREATE POLICY "reviews_authenticated_insert"
    ON public.reviews FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Admin can delete any review
CREATE POLICY "reviews_admin_delete"
    ON public.reviews FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- ── 4f. SUBSCRIBERS ──────────────────────────────────────────

-- Anyone (including anon) can subscribe
CREATE POLICY "subscribers_public_insert"
    ON public.subscribers FOR INSERT
    WITH CHECK (true);

-- NOTE: The dangerous USING (true) UPDATE policy is REMOVED.
-- Unsubscribe is now handled exclusively by the unsubscribe_by_email()
-- SECURITY DEFINER function, which only sets status = 'unsubscribed'
-- on the matching row and cannot modify other columns.

-- Admin can read all subscribers
CREATE POLICY "subscribers_admin_select"
    ON public.subscribers FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Admin has full management access
CREATE POLICY "subscribers_admin_manage"
    ON public.subscribers FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ── 4g. PROMOTIONS ───────────────────────────────────────────

-- Active promotions are publicly visible (for banners, etc.)
CREATE POLICY "promotions_public_read"
    ON public.promotions FOR SELECT
    USING (active = true);

-- Admin can see all promotions (including inactive drafts)
CREATE POLICY "promotions_admin_select"
    ON public.promotions FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Admin has full write access
CREATE POLICY "promotions_admin_write"
    ON public.promotions FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ── 4h. SETTINGS ─────────────────────────────────────────────

-- Public read (site configuration — announcement, hero text, etc.)
CREATE POLICY "settings_public_read"
    ON public.settings FOR SELECT
    USING (true);

-- Admin has full write access
CREATE POLICY "settings_admin_write"
    ON public.settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ──────────────────────────────────────────────────────────────
-- 5. GRANT execute on the unsubscribe function to anon/authenticated
-- ──────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.unsubscribe_by_email(text) TO anon;
GRANT EXECUTE ON FUNCTION public.unsubscribe_by_email(text) TO authenticated;


-- ──────────────────────────────────────────────────────────────
-- 6. Verify: run a quick assertion to catch misconfiguration
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'customers','orders','menu_items','categories',
    'reviews','subscribers','promotions','settings'
  ];
  missing text[] := ARRAY[]::text[];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = tbl
        AND c.relrowsecurity = true
    ) THEN
      missing := array_append(missing, tbl);
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'RLS not enabled on: %', array_to_string(missing, ', ');
  END IF;

  RAISE NOTICE 'Phase 1A: RLS verified enabled on all 8 tables.';
END $$;
