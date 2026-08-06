-- Add username, address and the delivery-address preference to customers.
-- Existing rows keep a NULL username (Postgres unique constraints allow
-- multiple NULLs) until they are claimed via the sign-up flow.

alter table public.customers
    add column username text unique,
    add column address text,
    add column use_as_delivery_address boolean not null default false;
