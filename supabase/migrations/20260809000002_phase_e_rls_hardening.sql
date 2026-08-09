-- ============================================================
-- Phase E: RLS Hardening
-- ============================================================
-- Replaces all open RLS policies with restrictive, role-based
-- policies. Designed for a clean Supabase Auth migration.
--
-- PREREQUISITES:
--   - Phase B applied (auth_user_id, is_admin columns exist)
--   - Zero real customers (test data only)
--   - Supabase Auth enabled in dashboard
--
-- EFFECT: After this migration, the old custom auth system
-- (username/password via customers table) will stop working.
-- The application must be updated to use Supabase Auth (Phase D).
-- ============================================================

-- 0. ADMIN HELPER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.customers
    WHERE auth_user_id = auth.uid() AND is_admin = true
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true if the current Supabase Auth user has is_admin = true in customers. SECURITY DEFINER to bypass RLS.';


-- 1. CLEANUP: Remove test orders (0 customers confirmed)
-- ============================================================

DELETE FROM public.orders WHERE TRUE;


-- 2. CUSTOMERS
-- ============================================================

DROP POLICY IF EXISTS "open access customers" ON public.customers;

-- Authenticated: read own record
CREATE POLICY "customers_select_own"
    ON public.customers FOR SELECT
    TO authenticated
    USING (auth_user_id = auth.uid());

-- Admin: read all customers
CREATE POLICY "customers_admin_select"
    ON public.customers FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Authenticated: create own record (new registration)
CREATE POLICY "customers_insert_self"
    ON public.customers FOR INSERT
    TO authenticated
    WITH CHECK (auth_user_id = auth.uid());

-- Authenticated: update own record (cannot self-promote)
CREATE POLICY "customers_update_own"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (auth_user_id = auth.uid())
    WITH CHECK (
        auth_user_id = auth.uid()
        AND is_admin = false
    );

-- Admin: update any customer
CREATE POLICY "customers_admin_update"
    ON public.customers FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Admin: delete customers
CREATE POLICY "customers_admin_delete"
    ON public.customers FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- 3. ORDERS
-- ============================================================

DROP POLICY IF EXISTS "open access orders" ON public.orders;

-- Authenticated: read own orders
CREATE POLICY "orders_select_own"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        customer_id IN (
            SELECT id FROM public.customers
            WHERE auth_user_id = auth.uid()
        )
    );

-- Admin: read all orders
CREATE POLICY "orders_admin_select"
    ON public.orders FOR SELECT
    TO authenticated
    USING (public.is_admin());

-- Authenticated: create own orders
CREATE POLICY "orders_insert_own"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (
        customer_id IN (
            SELECT id FROM public.customers
            WHERE auth_user_id = auth.uid()
        )
    );

-- Admin: update orders
CREATE POLICY "orders_admin_update"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.is_admin());

-- Admin: delete orders
CREATE POLICY "orders_admin_delete"
    ON public.orders FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- 4. MENU_ITEMS
-- ============================================================

DROP POLICY IF EXISTS "Open access menu_items" ON public.menu_items;

CREATE POLICY "menu_items_public_read"
    ON public.menu_items FOR SELECT
    USING (true);

CREATE POLICY "menu_items_admin_write"
    ON public.menu_items FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 5. CATEGORIES
-- ============================================================

DROP POLICY IF EXISTS "Open access categories" ON public.categories;

CREATE POLICY "categories_public_read"
    ON public.categories FOR SELECT
    USING (true);

CREATE POLICY "categories_admin_write"
    ON public.categories FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 6. REVIEWS
-- ============================================================

DROP POLICY IF EXISTS "open access reviews" ON public.reviews;

CREATE POLICY "reviews_public_read"
    ON public.reviews FOR SELECT
    USING (true);

CREATE POLICY "reviews_public_insert"
    ON public.reviews FOR INSERT
    WITH CHECK (true);

CREATE POLICY "reviews_admin_delete"
    ON public.reviews FOR DELETE
    TO authenticated
    USING (public.is_admin());


-- 7. SUBSCRIBERS
-- ============================================================

DROP POLICY IF EXISTS "Open access subscribers" ON public.subscribers;

-- Anyone can subscribe
CREATE POLICY "subscribers_public_insert"
    ON public.subscribers FOR INSERT
    WITH CHECK (true);

-- Anyone can unsubscribe (set status = 'unsubscribed' only)
CREATE POLICY "subscribers_unsubscribe_by_email"
    ON public.subscribers FOR UPDATE
    USING (true)
    WITH CHECK (status = 'unsubscribed');

-- Admin: full access
CREATE POLICY "subscribers_admin_select"
    ON public.subscribers FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "subscribers_admin_manage"
    ON public.subscribers FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 8. PROMOTIONS
-- ============================================================

DROP POLICY IF EXISTS "open access promotions" ON public.promotions;

CREATE POLICY "promotions_public_read"
    ON public.promotions FOR SELECT
    USING (active = true);

CREATE POLICY "promotions_admin_select"
    ON public.promotions FOR SELECT
    TO authenticated
    USING (public.is_admin());

CREATE POLICY "promotions_admin_write"
    ON public.promotions FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- 9. SETTINGS
-- ============================================================

DROP POLICY IF EXISTS "open access settings" ON public.settings;

CREATE POLICY "settings_public_read"
    ON public.settings FOR SELECT
    USING (true);

CREATE POLICY "settings_admin_write"
    ON public.settings FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
