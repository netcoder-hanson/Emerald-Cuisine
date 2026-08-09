-- ============================================================
-- Phase B: Introduce Supabase Auth alongside custom auth
-- ============================================================
-- This migration adds columns needed for Supabase Auth linkage
-- and database-level admin role. The existing custom authentication
-- system remains untouched.
--
-- All operations are additive and IF NOT EXISTS for safety.
-- ============================================================

-- 1. AUTH USER LINKAGE: Link customers to Supabase Auth accounts
-- ============================================================

-- auth_user_id: UUID reference to auth.users(id)
-- Nullable to allow coexistence with the existing custom auth system.
-- Unique constraint ensures one Supabase Auth user maps to at most one customer.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS auth_user_id uuid;

-- Foreign key to auth.users — the core linkage for Supabase Auth.
-- ON DELETE SET NULL: if a Supabase Auth user is deleted, the customer
-- record is preserved but the auth link is severed.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_customers_auth_user'
        AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers
            ADD CONSTRAINT fk_customers_auth_user
            FOREIGN KEY (auth_user_id) REFERENCES auth.users(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- Unique constraint on auth_user_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'customers_auth_user_id_key'
        AND conrelid = 'public.customers'::regclass
    ) THEN
        ALTER TABLE public.customers
            ADD CONSTRAINT customers_auth_user_id_key
            UNIQUE (auth_user_id);
    END IF;
END $$;

-- Index for auth_user_id lookups (used by auth state restoration)
CREATE INDEX IF NOT EXISTS idx_customers_auth_user_id
    ON public.customers (auth_user_id)
    WHERE auth_user_id IS NOT NULL;


-- 2. ADMIN ROLE: Database-level admin flag
-- ============================================================

-- is_admin: marks a customer as an administrator.
-- Default false — no existing customers become admins automatically.
-- Nullable for safety with the existing schema.
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;


-- 3. COMMENTS for documentation
-- ============================================================

COMMENT ON COLUMN public.customers.auth_user_id IS
    'UUID reference to auth.users(id). Links customer record to Supabase Auth. NULL when using custom auth only.';

COMMENT ON COLUMN public.customers.is_admin IS
    'Database-level admin flag. Default false. Prepared for future admin migration.';
