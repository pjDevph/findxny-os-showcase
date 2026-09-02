-- Migration 0056: Product add-ons (extra rice, extra shot, size upgrades, etc.)
-- product_addon_groups: named option sets attached to a product (e.g. "Size", "Extras")
-- product_addons:       individual options within a group (e.g. "Large +₱30")
-- order_item_addons:    snapshot of chosen addons per order line item

CREATE TABLE IF NOT EXISTS product_addon_groups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id)  ON DELETE CASCADE,
  product_id   UUID        NOT NULL REFERENCES products(id)    ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  is_required  BOOLEAN     NOT NULL DEFAULT false,
  min_select   INT         NOT NULL DEFAULT 0,
  max_select   INT         NOT NULL DEFAULT 1,  -- 1 = single-pick, >1 = multi-pick
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS product_addons (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID        NOT NULL REFERENCES workspaces(id)           ON DELETE CASCADE,
  group_id     UUID        NOT NULL REFERENCES product_addon_groups(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_item_addons (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id UUID        NOT NULL REFERENCES order_items(id)     ON DELETE CASCADE,
  addon_id      UUID        NOT NULL REFERENCES product_addons(id)  ON DELETE RESTRICT,
  name          TEXT        NOT NULL,            -- price/name snapshot at order time
  price         NUMERIC(12,2) NOT NULL,
  qty           INT         NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addon_groups_product   ON product_addon_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_addon_groups_workspace ON product_addon_groups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_addons_group           ON product_addons(group_id);
CREATE INDEX IF NOT EXISTS idx_order_item_addons_item ON order_item_addons(order_item_id);

ALTER TABLE product_addon_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_addons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_item_addons    ENABLE ROW LEVEL SECURITY;
