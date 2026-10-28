# Clothing Store E-Commerce Website

Responsive online store + admin dashboard for a Sri Lankan clothing brand, built by **E-POCH IT Solutions**.

- **Frontend:** plain HTML, CSS and vanilla JavaScript (`public/`)
- **Backend:** Node.js + Express JSON API (`server.js`)
- **Database:** Prisma ORM (`prisma/schema.prisma`) - SQLite for development, switchable to PostgreSQL/MySQL
- **Images:** no photos are included. Every image slot renders a labelled placeholder (`.ph` in `public/css/style.css`, `placeholder()` in `public/js/app.js`) until real photography is added.

## Getting started

Requires Node.js 18 or newer.

```bash
npm run setup     # install packages, create the database, load demo data
npm run dev       # start at http://localhost:3000 (auto-restarts on changes)
```

Demo accounts are created by the seed script (`prisma/seed.js`) - see the `ADMIN`, `STAFF` and `CUSTOMER` constants at the top of that file. **Change or remove them before going live.**

| Command | What it does |
| --- | --- |
| `npm run db:migrate` | Apply schema changes (creates a migration) |
| `npm run db:seed` | Reload demo data (clears existing data) |
| `npm run db:reset` | Drop and recreate the database, then seed |
| `npm run db:studio` | Browse the database in Prisma Studio |

## Pages

| Route | Page |
| --- | --- |
| `/` | Home - hero, categories, new arrivals, sale banner, best sellers, collections, reviews, newsletter |
| `/shop`, `/new-arrivals`, `/sale`, `/search?q=` | Product grid with category, size, colour, price, stock and sale filters, sorting, pagination |
| `/product/:slug` | Gallery with zoom, size/colour selection with per-variant stock, size guide, add to cart / buy now, reviews, related products, sticky mobile add-to-cart |
| `/cart` | Quantity editing, promo codes, district delivery estimate, free-delivery progress |
| `/checkout` | Contact, delivery & billing address, delivery method, payment method (COD / bank transfer / card), notes, terms consent |
| `/order-confirmation` | Order number, items, payment status, bank details, delivery estimate, tracking link |
| `/track-order` | Guest order tracking by order number + email |
| `/account` | Register, login, forgot/reset password, profile, saved addresses, order history, return requests, password change |
| `/wishlist` | Saved products (device + account sync) |
| `/about`, `/contact`, `/faq`, `/shipping`, `/returns`, `/privacy-policy`, `/terms` | Content pages |
| `/admin` | Admin dashboard (staff login required) |
| anything else | 404 page |

## Admin dashboard (`/admin`)

Dashboard KPIs · Products (with size × colour variant editor) · Categories · Inventory (stock per variant, adjustments, movement log, low-stock alerts) · Orders (status workflow with history, payment status, shipment/tracking, refunds) · Customers · Payments · Shipping (district rates, COD rules) · Discounts (coupons) · Reviews moderation · Reports (+ CSV export) · Website content · Settings · Staff & roles.

Roles: **ADMIN** has full access. **STAFF** can manage catalogue, stock, orders and content, but cannot delete products/categories or change settings and staff.

## How key requirements are handled

- **Stock per size & colour:** `ProductVariant` rows (unique per product + size + colour). Every change writes an `InventoryMovement`.
- **No overselling:** checkout runs in a database transaction and decrements stock only where `stock >= quantity`.
- **Duplicate orders:** each checkout visit sends an idempotency key; resubmitting returns the same order.
- **Historical accuracy:** `OrderItem` stores product name, SKU, size, colour and price at purchase time.
- **Order vs payment status:** tracked separately, with `OrderStatusHistory` for every change. Cancelling/returning restocks items.
- **Security:** bcrypt password hashing, hashed session and reset tokens in HTTP-only cookies, role-based access, server-side validation, rate limiting on login/register/checkout/contact, CSRF header check, prices always recalculated server-side, no card data stored.

## Before launch (not included in this build)

1. **Card payments** - integrate PayHere or WEBXPAY hosted checkout in `POST /api/orders` (see comment) and add a verified webhook that marks the payment `PAID`.
2. **Email/SMS** - replace `notify()` in `server.js` with an SMTP / SMS provider (order confirmation, dispatch, password reset).
3. **Product photos** - add an upload endpoint (validate type/size, compress) and set `ProductImage.url`; render `<img>` instead of the placeholder when a URL exists.
4. **Production database** - switch the Prisma provider to PostgreSQL or MySQL, set `DATABASE_URL`, run `prisma migrate deploy`.
5. Serve over HTTPS with `NODE_ENV=production`, set up automated backups, and review the privacy policy and terms text.
