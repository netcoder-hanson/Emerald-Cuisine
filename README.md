# Emerald's Cuisine

A responsive, multi-page restaurant website for **Emerald's Cuisine** — a luxury grill and fine dining restaurant in Lagos, Nigeria. Customers can browse the menu, place orders, check out, track deliveries and leave reviews, while the owner manages orders, menu items, subscribers and promotions from a simple admin dashboard.

Built as a **static site with no framework and no build step** — plain HTML, CSS and vanilla JavaScript ES modules that run directly in the browser.

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

Out of the box the site runs in **demo mode** — no backend required. Menu data loads from `data/menu.json`, and orders, reviews and subscribers are stored in `localStorage`. Add your Supabase + EmailJS keys to switch to live mode.

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Markup | Semantic HTML5 (multi-page) |
| Styling | CSS3 — Flexbox & Grid, mobile-first, single `css/style.css` |
| Logic | Vanilla JavaScript ES modules |
| Database | [Supabase](https://supabase.com) (PostgreSQL) via CDN `@supabase/supabase-js@2` |
| Email | [EmailJS](https://www.emailjs.com) (browser-side email) |
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

## Going Live (Supabase + EmailJS)

### 1. Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **Project Settings → API** and copy the project URL and anon key.
3. Paste them into `js/config.js` under `CONFIG.supabase`.
4. In the Supabase **SQL Editor**, run the schema in the comment block at the bottom of `js/config.js` to create the tables:

   `categories`, `customers`, `menu_items`, `orders`, `promotions`, `subscribers`, `reviews`, `settings`
   `categories`, `menu_items`, `orders`, `promotions`, `subscribers`, `reviews`, `settings`

5. Enable **Row Level Security** on each table and add open (demo) policies as described in the file — the tables are configured for learning/demo purposes; use stricter policies for a public production site.

### 2. EmailJS

1. Create a free account at [emailjs.com](https://www.emailjs.com).
2. Add an email service and **one** template. Set the template's *To Email* field to `{{to_email}}`.
3. Copy your public key, service ID and template ID into `js/config.js` under `CONFIG.emailjs`.
4. Set `restaurantEmail` to the inbox that should receive new order notifications.

The template variables are documented in `js/config.js` (restaurant copy, customer receipt, and promo blast all use the same template, toggled with `is_restaurant`, `is_customer` and `is_promo`).

### 3. Admin login

The admin dashboard password is `admin123` by default — change it in `js/config.js` (`CONFIG.adminPassword`).

---

## Configuration

All site configuration lives in one place: `js/config.js`.

```js
CONFIG = {
  supabase: { url, anonKey },
  emailjs: { publicKey, serviceId, templateId, restaurantEmail },
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
│   └── utils/
│       ├── auth.js        Sign in / register, session persistence, "keep me signed in"
│       ├── auth-ui.js     Global sign-in widget + modal injected into every page header
│       ├── cart.js        Cart, totals, price formatting, escapeHtml
│       ├── email.js       EmailJS sends (restaurant/customer/promo)
│       ├── menu.js        Menu + categories (Supabase then menu.json fallback)
│       ├── store.js       Generic Supabase CRUD + LocalStorage fallbacks
│       └── supabase.js    Supabase client creation
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

## Deployment

Any static host works — [Netlify](https://netlify.com), [Vercel](https://vercel.com), [Cloudflare Pages](https://pages.cloudflare.com), or GitHub Pages. Point the host at the repository root; there is no build command and no output directory.

---

## Disclaimer

The Supabase RLS policies and admin password included here are **demo-grade** and are intended for learning. Before deploying to production, replace the password, harden the database policies, and review the API keys' visibility.

---

## License

This project is for demonstration/educational purposes. See the repository for any licensing details.
