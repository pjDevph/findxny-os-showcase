-- Storage bucket for product images. Public read so the menu/admin can render
-- by URL without signing; writes are restricted to authenticated workspace
-- staff (owner/admin/manager) via the policy below.

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product_images_read"   on storage.objects;
drop policy if exists "product_images_write"  on storage.objects;
drop policy if exists "product_images_update" on storage.objects;
drop policy if exists "product_images_delete" on storage.objects;

create policy "product_images_read" on storage.objects
  for select using (bucket_id = 'product-images');

create policy "product_images_write" on storage.objects
  for insert with check (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );

create policy "product_images_update" on storage.objects
  for update using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );

create policy "product_images_delete" on storage.objects
  for delete using (
    bucket_id = 'product-images'
    and exists (
      select 1 from public.workspace_members
      where user_id = auth.uid()
        and role in ('owner','admin','manager')
    )
  );
