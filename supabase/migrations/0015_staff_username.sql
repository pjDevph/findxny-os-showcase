alter table profiles
  add column if not exists username     text unique,
  add column if not exists is_pos_staff boolean not null default false;

create index if not exists profiles_username_idx on profiles(username);
