-- Exclude zero-price products from the public menu.
-- The DB constraint allows price >= 0 (useful for internal items), but a ₱0.00
-- product on the customer menu or POS order screen is always a data-entry mistake.
create or replace function public_menu_v1(p_slug text)
returns jsonb
language sql
stable
as $$
  with ws as (select * from workspaces where slug = p_slug limit 1)
  select case when not exists (select 1 from ws) then null else jsonb_build_object(
    'workspace', (select jsonb_build_object(
        'id', id, 'name', name, 'slug', slug, 'currency', currency,
        'tax_rate', tax_rate, 'service_rate', service_rate, 'phone', phone,
        'hold_minutes', hold_minutes, 'slot_minutes', slot_minutes,
        'maintenance_mode', maintenance_mode, 'maintenance_message', maintenance_message,
        'home_content', home_content
      ) from ws),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'address', address) order by name)
      from branches where workspace_id = (select id from ws)), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order) order by sort_order)
      from product_categories where workspace_id = (select id from ws)), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'sku', sku, 'price', price, 'kitchen_required', kitchen_required,
        'image_url', image_url, 'category_id', category_id, 'featured', featured,
        'featured_tag', featured_tag, 'featured_blurb', featured_blurb, 'featured_sort', featured_sort))
      from products where workspace_id = (select id from ws) and active = true and for_sale = true and price > 0), '[]'::jsonb),
    'menu_book_pages', coalesce((
      select jsonb_agg(jsonb_build_object('page_no', page_no, 'label', label, 'file_name', file_name, 'image_path', image_path) order by sort_order)
      from menu_book_pages where workspace_id = (select id from ws)), '[]'::jsonb),
    'menu_book_hotspots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'page_no', page_no, 'shape', shape, 'x', x, 'y', y, 'w', w, 'h', h, 'points', points,
        'blend_color', blend_color, 'name', name, 'price', price, 'cat', cat, 'product_id', product_id) order by sort_order)
      from menu_book_hotspots where workspace_id = (select id from ws)), '[]'::jsonb)
  ) end;
$$;

revoke all on function public_menu_v1(text) from public;
grant execute on function public_menu_v1(text) to service_role;
