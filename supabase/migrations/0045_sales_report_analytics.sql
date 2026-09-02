-- sales_report_analytics RPC function
-- Accepts filters for order_type, payment_status, and category
-- Returns aggregated sales data for reporting

drop function if exists public.sales_report_analytics(
  p_workspace_id uuid,
  p_channel text,
  p_payment_method text,
  p_category text,
  p_date_from timestamp,
  p_date_to timestamp
) cascade;

create function public.sales_report_analytics(
  p_workspace_id uuid,
  p_order_type text default null,
  p_payment_status text default null,
  p_category text default null,
  p_date_from timestamp with time zone default null,
  p_date_to timestamp with time zone default null
)
returns table (
  order_type text,
  payment_status text,
  category text,
  total_orders bigint,
  total_quantity numeric,
  total_revenue numeric,
  average_order_value numeric,
  discount_total numeric
)
language sql
stable
security definer
as $$
  select
    coalesce(o.order_type, 'unknown')    as order_type,
    coalesce(o.payment_status, 'unknown') as payment_status,
    coalesce(pc.name, 'uncategorized') as category,
    count(distinct o.id)::bigint          as total_orders,
    sum(oi.quantity)::numeric             as total_quantity,
    sum(oi.total)::numeric                as total_revenue,
    avg(o.total)::numeric                 as average_order_value,
    sum(coalesce(o.discount, 0))::numeric as discount_total
  from
    orders o
    left join order_items oi on o.id = oi.order_id
    left join products pr on oi.product_id = pr.id
    left join product_categories pc on pr.category_id = pc.id
  where
    o.workspace_id = p_workspace_id
    and (p_order_type is null or o.order_type = p_order_type)
    and (p_payment_status is null or o.payment_status = p_payment_status)
    and (p_category is null or pc.name = p_category)
    and (p_date_from is null or o.created_at >= p_date_from)
    and (p_date_to is null or o.created_at <= p_date_to)
  group by o.order_type, o.payment_status, pc.name
  order by total_revenue desc nulls last;
$$;
