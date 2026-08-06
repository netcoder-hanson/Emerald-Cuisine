-- Add username, address and the delivery-address preference to customers.
-- Existing rows keep a NULL username (Postgres unique constraints allow
-- multiple NULLs) until they are claimed via the sign-up flow.

alter table public.customers
    add column if not exists username text unique,
    add column if not exists address text,
    add column if not exists use_as_delivery_address boolean not null default false;
