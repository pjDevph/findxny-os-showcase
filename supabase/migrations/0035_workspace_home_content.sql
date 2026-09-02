-- Editable homepage content (hero copy + promos / ads / events band), managed
-- from the admin Home Editor. Featured products stay driven by product flags.
-- Shape: { hero: { title, lead }, promos: [ { title, blurb, image_url, cta_label, cta_href } ] }
alter table workspaces
  add column if not exists home_content jsonb not null default '{}'::jsonb;
