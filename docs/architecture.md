# Architecture

FINDXNY OS is a monorepo composed of:

```txt
apps/web        Next.js admin + customer web app
apps/pos-app    Expo React Native POS/kitchen/staff app
packages/*      shared types, validation, API/domain helpers
supabase/*      Edge Functions, migrations, RLS, seed data
```

## Runtime flow

```txt
Web Admin / Customer Site ─┐
                           ├─ Supabase Auth + Edge Functions ─ Supabase Postgres
POS App ───────────────────┘
```

Business rules live in Edge Functions. Clients should not calculate sensitive values such as product prices, totals, permissions, payment status, or cancellation state.

## Key backend areas

- Catalog: `products-*`, `product-categories-upsert`
- Ingredients/recipes: `ingredients-*`, `recipe-items-*`
- Inventory: `stock-in`, `stock-out`, `inventory-adjust`
- Orders: `orders-create`, `orders-advance`, `orders-cancel`, `public-orders-create`
- Bookings: `public-bookings-create`, `bookings-confirm`, `bookings-cancel`, `bookings-cleanup`
- Payments: `payments-create-intent`, `payments-cash-confirm`, `payments-webhook`, `refunds-create`
- Staff/security: `me`, `staff-*`, `employees-*`, RLS policies

## Backend startup

There is no local Supabase/Docker stack — all environments (dev/staging/production) are real deployed Supabase projects. Run from repo root:

```powershell
npm install
npm run be:migrate
npm run be:seed
npm run dev:be
```
