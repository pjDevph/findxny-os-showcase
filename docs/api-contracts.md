# API Contracts

This project uses Supabase Edge Functions as the backend API. Web and POS should call these functions instead of duplicating business rules client-side.

## Catalog

### `products-upsert`
Creates or updates a product.

Required on create: `workspace_id`, `name`, `price`.
Optional fields: `sku`, `category_id`, `kitchen_required`, `active`, `image_url`, `featured`, `is_ingredient`, `purchase_unit`, `selling_unit`, `cost`, `barcode`, `for_sale`.

Response: `{ product }`.

### `ingredients-upsert`
Creates or updates an ingredient.

Payload: `{ workspace_id, id?, name, unit, cost_per_unit, stock_qty?, low_stock_threshold? }`.

The database keeps compatibility columns synchronized: `cost_per_unit`/`price_per_unit` and `stock_qty`/`quantity`.

Response: `{ ingredient }`.

### `recipe-items-upsert`
Attaches an ingredient to a product recipe.

Payload: `{ workspace_id, id?, product_id, ingredient_id, qty, unit? }`.

Response: `{ recipe_item, cost, warnings }`.

## Inventory

### `stock-in`
Creates or increments a branch inventory row for a product.

Payload: `{ workspace_id, branch_id, product_id, quantity, unit?, unit_cost?, supplier?, reason?, low_stock_threshold? }`.

Response: `{ item, movement }`.

### `inventory-adjust`
Sets stock to an absolute quantity when `type = "adjustment"`; adds/subtracts when `type = "in" | "out"`.

Payload: `{ workspace_id, branch_id, inventory_item_id, type, quantity, reason? }`.

Response: `{ item, movement }`.

## Orders and bookings cancellation

### `orders-cancel`
Cancels unpaid pending/preparing orders and expires any pending Xendit invoice.

Payload: `{ workspace_id, order_id, reason? }`.

Rules:
- already cancelled returns idempotently
- completed orders cannot be cancelled
- paid orders must go through void/refund flow
- pending Xendit intents are marked `cancelled`

### `bookings-cancel`
Cancels unpaid hold/confirmed bookings and expires any pending Xendit invoice.

Payload: `{ workspace_id, booking_id, reason? }`.

Rules:
- completed bookings cannot be cancelled
- paid bookings must go through refund flow
- pending Xendit intents are marked `cancelled`
- `hold_expires_at` is cleared on cancellation

## Payments

### `payments-webhook`
Handles Xendit invoice webhooks.

Rules:
- `PAID` marks payment intent succeeded, creates payment/transaction/receipt, confirms booking or advances order
- `EXPIRED`, `VOIDED`, or `CANCELLED` marks pending local intent as cancelled
- locally cancelled intents ignore late `PAID` events to avoid reopening cancelled orders/bookings
