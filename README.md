# Emerald's Cuisine

A responsive, multi-page restaurant website for **Emerald's Cuisine** — a luxury grill and fine dining restaurant in Lagos, Nigeria. Customers can browse the menu, place orders, check out, track deliveries and leave reviews, while the owner manages orders, menu items, subscribers and promotions from a simple admin dashboard.

Built as a **static site with no framework and no build step** — plain HTML, CSS and vanilla JavaScript ES modules that run directly in the browser.

---

## Recent Changes (HTML Validation Fixes)

- Renamed category image files to remove spaces and illegal characters (e.g. `Barbecue Chicken Platter.jpg` → `barbecue-chicken-platter.jpg`)
- Updated all `src` references in `index.html`, `js/order.js`, `js/utils/menu.js` and `data/menu.json` to use the new filenames
- Changed second `<main>` in `admin.html` to `<section>` to fix duplicate main element error
- Moved `<input type="file">` outside the `role="button"` upload zone in admin settings and item forms
- Added `src` attribute to `<img>` elements that were missing it (lightbox preview, logo preview)
- Updated `js/admin.js` to find the file input in its new DOM position

---

## Features

- **Online ordering** — browse menu categories, add items to cart, pick delivery or pickup
- **Checkout** — delivery address, payment method, live subtotal / VAT / delivery-fee totals
- **Order tracking** — real-time order status timeline and a map of the delivery route
- **Order confirmation** — order number + estimated delivery time, with email receipts
- **Reviews** — customers leave ratings and reviews that appear on the homepage
- **Reservations** — table reservation modal on the homepage
- **Newsletter** — email subscription for promotions and seasonal menus
- **Customer accounts** — sign in / create an account on any page; sessions are saved to Supabase (or localStorage in demo mode) and checkout auto-fills your name and email
- **"Keep me signed in"** — ticking this on the sign-in modal keeps you logged in across browser restarts (persistent session); leaving it unticked stores the session only for the current tab/session
- **Admin dashboard** — manage menu items & categories, view orders, manage subscribers, view/delete registered customers, send promo emails, and edit site text (announcement, hero)
- **Admin dashboard** — manage menu items & categories, view orders, manage subscribers, send promo emails, and edit site text (announcement, hero)

## Demo mode

Out of the box the site runs in **demo mode** — no backend required. Menu data loads from `data/menu.json`, and orders, reviews and subscribers are stored in `localStorage`. Add your Supabase + MailerSend settings to switch to live mode.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Markup | Semantic HTML5 (multi-page) |
| Styling | CSS3 — Flexbox & Grid, mobile-first, single `css/style.css` |
| Logic | Vanilla JavaScript ES modules |
| Database | [Supabase](https://supabase.com) (PostgreSQL) via CDN `@supabase/supabase-js@2` |
| Email | [MailerSend](https://www.mailersend.com) via Supabase Edge Functions |
| Icons / Fonts | Font Awesome 6, Lucide, Google Fonts (Inter + Poppins) |
| Linting | webhint (`.hintrc`, modern browsers only) |

No bundler, no package manager, no framework.

---

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage — hero, categories, featured menu, about, reviews, reservation modal, gallery, newsletter |
| `order.html` | Menu browsing and cart |
| `checkout.html` | Delivery/pickup form and order summary |
| `confirmation.html` | Order confirmation with order number and ETA |
| `track.html` | Order status timeline and delivery map |
| `admin.html` | Owner dashboard (login-protected) |
| `unsubscribe.html` | Newsletter unsubscribe page |

---

## Getting Started

The site is static, so there is **nothing to install**. Just open any page in a browser, or serve the folder locally:

```bash
# With Python
python -m http.server 8000

# Or with VS Code
# Install the "Live Server" extension and click "Go Live"
```

Then visit `http://localhost:8000`.

> ES modules (`type="module"`) are blocked by the `file://` protocol in some browsers, so use a local server rather than double-clicking the HTML files.

---

## Going Live (Supabase + MailerSend)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy the project URL and anon key.
3. Paste them into `js/config.js` under `CONFIG.supabase`.
4. In the Supabase **SQL Editor**, run the schema in the comment block at the bottom of `js/config.js` to create the tables:

   `categories`, `customers`, `menu_items`, `orders`, `promotions`, `subscribers`, `reviews`, `settings`
   `categories`, `menu_items`, `orders`, `promotions`, `subscribers`, `reviews`, `settings`

5. Enable **Row Level Security** on each table and add open (demo) policies as described in the file — the tables are configured for learning/demo purposes; use stricter policies for a public production site.

### 2. MailerSend

1. Create a free account at [mailersend.com](https://www.mailersend.com).
2. Set the sender inbox you want to use for order emails.
3. Add these secrets to your Supabase project:
   ```bash
   supabase secrets set MAILERSEND_API_KEY=mlsn.xxxxxxxx
   supabase secrets set MAILERSEND_FROM_EMAIL=orders@emeraldscuisine.com
   supabase secrets set MAILERSEND_FROM_NAME="Emerald's Cuisine"
   supabase secrets set RESTAURANT_EMAIL=you@example.com
   supabase secrets set SITE_URL=https://emeraldscuisine.com
   ```
4. Deploy the included `send-order-email` edge function.

### 3. Storage bucket (image uploads)

The admin panel uploads menu item + logo images to Supabase Storage.

1. In the Supabase dashboard open **Storage → New bucket**.
2. Name it `menu-images` and make it a **Public** bucket.
3. Add public (demo) policies, e.g.:
   ```sql
   create policy "public read images"
     on storage.objects for select using (bucket_id = 'menu-images');
   create policy "public upload images"
     on storage.objects for insert with check (bucket_id = 'menu-images');
   ```

### 4. Edge Function — promotion email blasts (MailerSend)

Promotional emails are sent **server-side** via a Supabase Edge Function, so the
MailerSend API key is never exposed in the browser.

1. Make sure the Supabase CLI is installed and you're logged in:
   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```
2. Deploy the included function:
   ```bash
   supabase functions deploy send-promotion-email
   ```
3. Set the MailerSend secret (and optional overrides):
   ```bash
   supabase secrets set MAILERSEND_API_KEY=mlsn.xxxxxxxx
   supabase secrets set MAILERSEND_FROM_EMAIL=offers@emeraldscuisine.com
   supabase secrets set MAILERSEND_FROM_NAME="Emerald's Cuisine"
   supabase secrets set SITE_URL=https://emeraldscuisine.com
   ```
   (Optional: `MAILERSEND_TEMPLATE_ID` — not required; the function builds its own HTML.)
4. The function pulls `subscribers` with `status = 'active'` plus `customers` with
   `marketing_opt_in = true`, respects unsubscribe consent, includes an unsubscribe
   link in every email, and writes `last_sent_at` / sent / failed counts back to the
   promotion row.
5. If the function is not deployed/reachable, the admin UI will continue to use the MailerSend-powered edge function for promo emails, but order receipts will not be sent until `send-order-email` is deployed.

### 5. Admin login

Set the admin dashboard password in `js/config.js` (`CONFIG.adminPassword`) before deploying.

---

## Configuration

All site configuration lives in one place: `js/config.js`.

```js
CONFIG = {
  supabase: { url, anonKey },
  adminPassword,
  restaurantLocation: { lat, lng }   // used by the order tracker map
}
```

While keys are empty, the site stays in demo mode.

---

## Project Structure

```
├── index.html             Homepage
├── order.html             Menu + cart
├── checkout.html          Checkout form
├── confirmation.html      Order confirmation
├── track.html             Order tracking
├── admin.html             Admin dashboard
├── unsubscribe.html       Newsletter unsubscribe page
├── css/
│   └── style.css          Single global stylesheet
├── data/
│   └── menu.json          Demo menu fallback
├── images/
│   └── categories/        Menu images
├── js/
│   ├── config.js          Site configuration (keys, password, location)
│   ├── script.js          Shared UI behavior (non-module)
│   ├── home.js            Homepage logic
│   ├── order.js           Menu + cart logic
│   ├── checkout.js        Checkout logic
│   ├── confirmation.js    Confirmation logic
│   ├── track.js           Order tracking logic
│   ├── admin.js           Admin dashboard logic
│   ├── unsubscribe.js     Unsubscribe form logic
│   └── utils/
│       ├── auth.js        Sign in / register, session persistence, "keep me signed in"
│       ├── auth-ui.js     Global sign-in widget + modal injected into every page header
│       ├── cart.js        Cart, totals, price formatting, escapeHtml
│       ├── email.js       Order receipt sends via Supabase edge function
│       ├── menu.js        Menu + categories (Supabase then menu.json fallback)
│       ├── store.js       Generic Supabase CRUD + LocalStorage fallbacks
│       └── supabase.js    Supabase client creation
└── supabase/
    └── functions/
        ├── deno.json
        └── send-promotion-email/
            └── index.ts    Edge Function (promo emails via MailerSend)
```

---

## Development Conventions

- Semantic HTML5, modern CSS (Flexbox/Grid), vanilla JS ES modules
- Keep the code **beginner-friendly** — avoid advanced patterns unless necessary
- Make the **smallest possible change**; don't rewrite working code
- Reuse existing CSS classes, utilities and functions before adding new ones
- Follow the **"Supabase first, LocalStorage fallback"** pattern in `js/utils/store.js`
- Escape user-generated content with `escapeHtml()` from `js/utils/cart.js`
- Money is stored as numbers and displayed in naira (₦) via `formatPrice()`
- Pricing rules (VAT 7.5%, delivery fee, free-delivery threshold) live in `js/utils/cart.js`

More detailed guidance for AI agents and contributors lives in [`agents.md`](./agents.md) and `.github/copilot-instructions.md`.

---

## CI Checks

GitHub Actions runs the following checks on every push to `dev` and every PR targeting `main`:

| Check | What it catches | Tool |
| --- | --- | --- |
| **HTML validation** | Structural/syntax errors in HTML files | html5validator |
| **CSS validation** | Invalid properties, syntax errors, unclosed blocks in CSS | stylelint |
| **JavaScript syntax** | Syntax errors in all `.js` files | `node --check` |
| **Broken local references** | Missing images, CSS, JS files referenced from HTML/CSS/JS | Custom shell script |
| **Secret detection** | Private keys, service-role keys, connection strings, hardcoded passwords | Custom shell script |

The Supabase publishable (anon) key is excluded from secret detection since it is intentionally public per Supabase's security model. Service-role keys and other privileged credentials are flagged.

---

## Deployment

Any static host works — [Netlify](https://netlify.com), [Vercel](https://vercel.com), [Cloudflare Pages](https://pages.cloudflare.com), or GitHub Pages. Point the host at the repository root; there is no build command and no output directory.

---

## Disclaimer

The Supabase RLS policies and browser-based admin password are **demo-grade** and are intended for learning. Before deploying to production, move admin authentication server-side, harden the database policies, and review the API keys' visibility.

---

## Phase 0: Secure Order Foundation

### Changes Made

#### Database Migration
- **`supabase/migrations/20260808000000_phase0_foundation.sql`**: Adds foundational columns for secure customer-order relationships
  - Adds `customer_id` column to `orders` table (nullable for backward compatibility)
  - Adds `marketing_opt_in`, `password_hash`, `session_token`, `remember_me`, `last_seen`, `created_at` to `customers` table
  - Adds performance indexes for order lookups
  - All operations are additive and use `IF NOT EXISTS` to prevent breaking existing tables

#### Secure Order Numbers
- **Format**: `EC-XXXXXX` (6 cryptographically random alphanumeric characters)
- **Excludes ambiguous characters**: I, O, 0, 1
- **Entropy**: ~35 bits (36^6 possible combinations)
- **Backward compatible**: Existing `EBF*` order numbers continue to work

#### Order Storage
- **No more phantom orders**: Failed database saves now throw an error instead of falling back to localStorage
- **Cart preservation**: Cart data is preserved locally for retry when database save fails
- **Customer linking**: Orders now include `customer_id` when the user is signed in

#### Confirmation & Tracking
- **Database-first**: Confirmation and tracking pages now query the database first
- **No localStorage masquerade**: localStorage-only orders are clearly marked as unconfirmed
- **Clear error messages**: Users see helpful messages when orders are not found

### Customer/Order Relationship

Orders are now linked to customer accounts via `customer_id`:
- When a signed-in user places an order, their `customer_id` is stored with the order
- Existing historical orders remain with `customer_id = NULL` until manually reconciled
- Foreign key constraint requires manual verification of `customers.id` column type

### Security Improvements

1. **Order number security**: Predictable timestamp-based order numbers replaced with cryptographically secure generation
2. **Phantom order prevention**: Failed database saves no longer create fake successful orders
3. **Database-first lookups**: Confirmation and tracking pages prefer database over localStorage
4. **Cart recovery**: Failed orders preserve cart contents for retry without creating phantom orders

### Current Authentication Limitations

The following limitations remain and should be addressed in future phases:

1. **Client-side admin auth**: Admin authentication is still browser-based (sessionStorage)
2. **No RLS policies**: Row Level Security policies are not yet configured in the repository
3. **No Supabase Auth**: The application uses a custom session system, not Supabase Auth
4. **No order isolation**: Any user can still view any order by number (no ownership verification)

### Remaining Security Work

- **P0**: Implement RLS policies to restrict order access to order owners
- **P0**: Move admin authentication server-side
- **P0**: Add order ownership verification for tracking/confirmation
- **P1**: Consider migrating to Supabase Auth for better security
- **P1**: Add rate limiting for order lookups
- **P2**: Implement order status updates from restaurant

### Database Migration Instructions

After pulling these changes, run the migration in the Supabase SQL Editor:

```sql
-- Check if customer_id column exists on orders table
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'orders' AND column_name = 'customer_id';

-- If not, run the migration file contents from:
-- supabase/migrations/20260808000000_phase0_foundation.sql
```

**Important**: Verify `customers.id` is UUID type before adding the foreign key constraint. The commented-out constraint in the migration file should be uncommented after verification.

---

## License

This project is for demonstration/educational purposes. See the repository for any licensing details.
