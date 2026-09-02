-- =====================================================================
-- 0007_features.sql  Staff · Ingredients · Product recipes
-- =====================================================================

-- ── Product: add missing columns ─────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS available   boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cost        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS archived    boolean       NOT NULL DEFAULT false;

-- ── Ingredients (raw materials with price/unit) ───────────────────────
CREATE TABLE IF NOT EXISTS ingredients (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid          NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                text          NOT NULL,
  category            text          NOT NULL DEFAULT 'food'
                        CHECK (category IN ('food','drink','consumable','operational')),
  unit                text          NOT NULL DEFAULT 'pcs',
  quantity            numeric(14,4) NOT NULL DEFAULT 0,
  price_per_unit      numeric(12,4) NOT NULL DEFAULT 0,
  low_stock_threshold numeric(14,4) NOT NULL DEFAULT 0,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_ingredients_workspace ON ingredients(workspace_id, category);

-- ── Product recipes (bill of materials) ──────────────────────────────
CREATE TABLE IF NOT EXISTS product_recipes (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid          NOT NULL REFERENCES products(id)     ON DELETE CASCADE,
  ingredient_id uuid          NOT NULL REFERENCES ingredients(id)  ON DELETE CASCADE,
  quantity      numeric(14,4) NOT NULL CHECK (quantity > 0),
  UNIQUE (product_id, ingredient_id)
);
CREATE INDEX IF NOT EXISTS idx_product_recipes_product    ON product_recipes(product_id);
CREATE INDEX IF NOT EXISTS idx_product_recipes_ingredient ON product_recipes(ingredient_id);

-- ── RLS: ingredients ─────────────────────────────────────────────────
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "ingr_all_admin" ON ingredients FOR ALL
    USING (is_workspace_member(workspace_id, ARRAY['owner','admin','manager']::workspace_role[]));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "ingr_read_staff" ON ingredients FOR SELECT
    USING (is_workspace_member(workspace_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── RLS: product_recipes ─────────────────────────────────────────────
ALTER TABLE product_recipes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "recipe_all_admin" ON product_recipes FOR ALL
    USING (
      EXISTS (
        SELECT 1 FROM products p
        WHERE  p.id = product_recipes.product_id
          AND  is_workspace_member(p.workspace_id, ARRAY['owner','admin','manager']::workspace_role[])
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "recipe_read_staff" ON product_recipes FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM products p
        WHERE  p.id = product_recipes.product_id
          AND  is_workspace_member(p.workspace_id)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Helper: resolve auth user ID from email ───────────────────────────
CREATE OR REPLACE FUNCTION get_auth_user_id_by_email(p_email text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM auth.users
  WHERE  email = lower(trim(p_email))
  LIMIT  1;
$$;

-- ── Helper: list workspace staff (admin/owner only) ───────────────────
CREATE OR REPLACE FUNCTION get_workspace_staff(p_workspace uuid)
RETURNS TABLE (
  user_id    uuid,
  email      text,
  full_name  text,
  role       workspace_role,
  branch_id  uuid,
  created_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    wm.user_id,
    u.email::text,
    COALESCE(pr.full_name, split_part(u.email::text, '@', 1)) AS full_name,
    wm.role,
    wm.branch_id,
    wm.created_at
  FROM  workspace_members wm
  JOIN  auth.users u    ON u.id  = wm.user_id
  LEFT JOIN profiles pr ON pr.id = wm.user_id
  WHERE wm.workspace_id = p_workspace
    AND is_workspace_member(p_workspace, ARRAY['owner','admin']::workspace_role[]);
$$;
