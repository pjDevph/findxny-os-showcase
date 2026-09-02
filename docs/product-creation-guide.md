# Product Setup Guide

Complete step-by-step for setting up a product correctly in FINDXNY OS. Follow every section in order — skipping fields causes missing kitchen tickets, wrong stock deductions, or items not appearing on the menu.

---

## Before You Start: Know Your Product Type

Answer these three questions first. Your answers determine which sections below are required.

| Question | Answer determines |
|---|---|
| Does this item get cooked or prepared by a station? | → Prep Station setting |
| Does this item use up stock when sold? | → Stock Behavior setting |
| Does this item have variations (size, extras, add-ons)? | → Add-ons setup |

---

## Step 1 — Basic Info

Go to **Web Admin → Products → New Product** (or tap **+** in POS → Products).

| Field | What to enter | Required |
|---|---|---|
| **Name** | Full display name as it will appear on POS screen, kitchen ticket, and receipt. Use title case: "Beef Bulalo", not "beef bulalo". | ✅ Required |
| **Category** | Pick the category this belongs to (Meals, Drinks, Snacks, etc.). Creates if not exists. Without a category the product is uncategorized and hard to find on POS. | Recommended |
| **Description** | Short description shown on the public menu / featured card. Keep it under 2 sentences. | Optional |
| **Photo** | Upload a clear photo (min 400×400px, square). Appears on POS grid and public menu. Dramatically helps speed at counter. | Optional but recommended |
| **Price** | Selling price in ₱. Do not include tax — the system adds VAT automatically based on workspace settings. | ✅ Required |
| **SKU / Barcode** | Only needed if you use a barcode scanner. Leave blank otherwise. | Optional |

---

## Step 2 — Prep Station (Kitchen Display Routing)

> **This is the most commonly missed setting.** If wrong, kitchen tickets don't appear for the correct station.

Go to **Advanced tab** (web admin) or scroll to Station on POS.

| Station Value | Use when | What happens |
|---|---|---|
| **None** | Item needs no preparation — packaged goods, bottled drinks, room fees | No kitchen ticket is generated. Item goes straight to "ready". |
| **Kitchen** | Item is cooked or grilled — rice meals, soups, mains | Ticket appears in Kitchen column on Prep Display |
| **Drinks** | Item is prepared by a barista or drinks station — coffees, juices, shakes | Ticket appears in Drinks column on Prep Display |
| **Counter** | Item is assembled at counter — sandwiches, packaging, plating | Ticket appears in Counter column on Prep Display |

**How to check it's working:** After saving, place a test order with this product. Open Prep Display (Web Admin → Prep Display or POS → Kitchen). The ticket should appear in the correct column.

> **Rule:** If a staff member needs to DO something before the item reaches the customer, it needs a prep station. If you just grab it off a shelf, set to None.

---

## Step 3 — Stock Behavior

Go to **Advanced tab → Stock Behavior**.

| Option | Use when | What happens when an order is placed |
|---|---|---|
| **None** | Services, room booking fees, or items you track manually | Nothing deducted. No stock alerts. |
| **Recipe** | Item is made from raw ingredients (food, coffee) | Deducts each ingredient in the recipe from Inventory → Ingredients. Product auto-hides if any ingredient runs out. |
| **Inventory** | Pre-packaged items with a fixed unit count (bottled water, canned goods) | Deducts 1 unit from Inventory → Items each time one is sold. Order is rejected if stock is 0. |

### If you chose Recipe → Go to Step 4
### If you chose Inventory → Go to Step 5
### If you chose None → Skip to Step 6

---

## Step 4 — Set Up Recipe (for Recipe stock behavior only)

Go to **Web Admin → Products → [Product] → Recipe tab**.

A recipe is the bill of materials — every ingredient consumed when one unit of this product is sold.

**For each ingredient:**

| Field | What to enter |
|---|---|
| **Ingredient** | Pick from your Ingredients list (Web Admin → Inventory → Ingredients). If it's not listed, create it first. |
| **Quantity Used** | How much is consumed per 1 unit sold. Be precise: "0.25" for 250g of a 1kg ingredient. |
| **Unit** | The unit for the quantity above (g, ml, pcs, kg, L). Must match or be convertible to the ingredient's purchase unit. |

**Common mistakes:**
- Using kg when the ingredient is tracked in g — the system converts but double-check the math
- Forgetting garnishes or packaging that also consume stock
- Not adding the recipe at all — the product will show `stock_behavior=recipe` but never deduct anything

**After saving the recipe:** Go to Inventory → Ingredients and confirm each ingredient has a current stock level entered. A product with `stock_behavior=recipe` but 0 stock on any ingredient will be auto-hidden.

---

## Step 5 — Set Up Inventory Item (for Inventory stock behavior only)

Go to **Web Admin → Inventory → Items → Add Item** (or POS → Inventory → +).

Link this product to an inventory item:

| Field | What to enter |
|---|---|
| **Product** | Select the product you just created |
| **Branch** | Which branch holds this stock |
| **Quantity** | Current on-hand count |
| **Unit** | pcs, bottles, boxes, etc. |
| **Low Stock Alert** | Quantity below which a low-stock warning appears on the dashboard |

**After saving:** Confirm in Web Admin → Inventory that the item appears with the correct quantity. Place a test order — quantity should decrease by 1.

---

## Step 6 — Add-ons / Modifiers (optional but important)

If your product has variations the cashier must choose from, set up add-on groups.

**Web Admin → Products → [Product] → Add-ons tab**

### Add-on Group = a question asked to the cashier
### Add-on Options = the possible answers

**Example: Beef Bulalo**
- Group: "Size" (Required, pick exactly 1)
  - Option: Regular — ₱0
  - Option: Large — ₱50
- Group: "Extras" (Optional, pick 0–3)
  - Option: Extra Rice — ₱30
  - Option: Extra Broth — ₱20
  - Option: Extra Bone — ₱0

| Group Field | What to set |
|---|---|
| **Group Name** | The question label ("Size", "Extras", "Add-ons", "Temperature") |
| **Required** | ON = cashier cannot add item to order without choosing. OFF = optional. |
| **Min Select** | Usually 0 (optional) or 1 (required pick) |
| **Max Select** | 1 = cashier picks one option. 2+ = cashier can pick multiple |

| Option Field | What to set |
|---|---|
| **Name** | The choice label ("Large", "Extra Shot", "No Ice") |
| **Price** | Additional charge for this option. 0 if included in base price. |
| **Active** | ON = shown. OFF = hidden (use to 86 a modifier without deleting it). |

> **Add-ons are set in Web Admin only.** The POS app cannot create or edit add-on groups — only the cashier can select them during ordering.

---

## Step 7 — Visibility & Menu Settings

| Setting | Where | What it does | Default |
|---|---|---|---|
| **Active** | Advanced tab | ON = appears on POS order screen. OFF = hidden from cashier and customer. Use to temporarily 86 an item without deleting it. | ON |
| **For Sale** | Advanced tab | OFF = internal use only (e.g. a raw material you track but don't sell). Still appears in inventory but not on POS/menu. | ON |
| **Pinned** | Advanced tab | ON = floats this product to the TOP of the POS grid. Use for your top 3–5 bestsellers to speed up order entry. | OFF |
| **Featured** | Advanced tab | ON = shows this product in the "House Favourites" section on your public landing page. | OFF |
| **Featured Tag** | Advanced tab | Short label on the featured card ("House Favourite", "Best Seller"). Only applies if Featured is ON. | blank |

---

## Step 8 — Pricing & Costing (for margin tracking)

This section is optional but important for business analytics.

**Web Admin → Products → [Product] → Pricing tab**

| Field | What to enter | Why it matters |
|---|---|---|
| **Cost** | Your cost to produce 1 unit (ingredients + packaging + labor allocation). If you use Recipe, the system can auto-calculate this from ingredient costs. | Used to calculate food cost % and gross margin on Reports |
| **Purchase Unit** | How you buy/measure it — kg, g, pcs, box | Used for recipe math and costing |
| **Selling Unit** | What the customer receives — "bowl", "cup", "bottle" | Shown on receipts and public menu |
| **Is Ingredient** | Check this if this product is also a raw ingredient used in other products' recipes | Makes it appear in the Ingredients picker |

---

## Full Product Setup Checklist

Print or save this. Check each box when setting up any product:

### Every product
- [ ] Name set (title case, clear)
- [ ] Category assigned
- [ ] Price set (correct, no tax included)
- [ ] Photo uploaded
- [ ] **Prep Station set** (None / Kitchen / Drinks / Counter)
- [ ] **Stock Behavior set** (None / Recipe / Inventory)
- [ ] Active: ON (unless intentionally hiding)
- [ ] For Sale: ON (unless internal use only)

### If Prep Station ≠ None
- [ ] Placed a test order and verified ticket appears in correct column on Prep Display
- [ ] Confirmed station staff know this product routes to them

### If Stock Behavior = Recipe
- [ ] All ingredients added to recipe with correct quantity + unit
- [ ] Each ingredient exists in Inventory → Ingredients with a current stock level
- [ ] Placed a test order and confirmed ingredient quantities decreased

### If Stock Behavior = Inventory
- [ ] Inventory Item created and linked to this product
- [ ] Starting quantity entered
- [ ] Low stock alert level set
- [ ] Placed a test order and confirmed quantity decreased by 1

### If product has variations (sizes, extras, temperature, etc.)
- [ ] Add-on groups created in Web Admin
- [ ] Each group set as Required or Optional correctly
- [ ] Min/Max select configured
- [ ] All options have correct prices (0 if included)
- [ ] Tested from POS — add-on picker appeared during order

### For featured/public menu products
- [ ] Description/blurb written
- [ ] Featured: ON if it should appear on landing page
- [ ] Featured Tag set (e.g. "House Favourite")

### For bestsellers
- [ ] Pinned: ON to float to top of POS grid

---

## Common Mistakes Reference

| Symptom | Cause | Fix |
|---|---|---|
| Kitchen doesn't get a ticket for this item | Prep Station = None | Set Prep Station to Kitchen (or Drinks/Counter) |
| Ticket appears in wrong station column | Wrong Prep Station | Change to correct station |
| Stock not decreasing when item is sold | Stock Behavior = None, or recipe is empty | Set correct stock behavior; add recipe items |
| Item auto-disappeared from POS | Recipe ingredient hit 0 | Restock the ingredient; item auto-reactivates |
| Cashier can't add item without choosing a size | add-on group is Required=ON | Correct if intentional; turn Required OFF if not |
| Item not showing on public menu | Active=OFF or For Sale=OFF | Turn both ON |
| Item appears at bottom of POS grid always | Not pinned | Turn Pinned ON for high-frequency items |
| Order rejected with "Insufficient stock" | Inventory stock = 0 | Restock via Inventory → Stock In |
| Cost % shows 0% on reports | Cost field is empty | Enter cost per unit in Pricing tab |

---

## Quick Reference: Station → Display Column

| Prep Station value | Column on Web Prep Display | Column on POS Kitchen Screen |
|---|---|---|
| `none` | Not shown | Not shown |
| `kitchen` | INCOMING → Kitchen tab | New → Kitchen |
| `drinks` | INCOMING → Drinks tab | New → Drinks |
| `counter` | INCOMING → Counter tab | New → Counter |

All stations show in the **All** tab. Filter by tab to see only your station's tickets.
