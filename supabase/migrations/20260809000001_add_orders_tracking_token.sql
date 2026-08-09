-- ============================================================
-- Add tracking_token to orders for anonymous order tracking
-- ============================================================
-- The tracking_token is a cryptographically secure random string
-- that allows anonymous users to look up their order status via
-- the track-order Edge Function without exposing customer data.
-- ============================================================

-- 1. Add column (nullable first)
ALTER TABLE public.orders
  ADD COLUMN tracking_token text;

-- 2. Generate tokens for any existing orders
UPDATE public.orders
  SET tracking_token = encode(gen_random_bytes(16), 'hex')
  WHERE tracking_token IS NULL;

-- 3. Enforce NOT NULL
ALTER TABLE public.orders
  ALTER COLUMN tracking_token SET NOT NULL;

-- 4. Unique constraint (prevents token collisions)
ALTER TABLE public.orders
  ADD CONSTRAINT orders_tracking_token_unique UNIQUE (tracking_token);

-- 5. Index for fast lookups
CREATE INDEX idx_orders_tracking_token ON public.orders (tracking_token);
