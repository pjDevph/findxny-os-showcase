-- Recipe lines can belong to one of two fixed sections: ingredients or toppings.
-- Defaults to 'ingredient' so existing rows keep their meaning.
alter table recipe_items
  add column if not exists section text not null default 'ingredient'
  check (section in ('ingredient', 'topping'));
