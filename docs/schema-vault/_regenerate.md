---
tags: [schema, meta]
---

# Regenerating this vault

Source of truth is the local Supabase Postgres instance, not these files — edit
migrations under `supabase/migrations/`, apply them, then regenerate.

```bash
# from FINDXNY-OS/, with `npx supabase start` already running

docker exec $(docker ps --filter "name=supabase_db" --format "{{.Names}}") \
  psql -U postgres -d postgres -At -F $'\t' -c "
select c.table_name, c.column_name, c.data_type, c.is_nullable,
  (select true from information_schema.key_column_usage k
     join information_schema.table_constraints tc on tc.constraint_name=k.constraint_name and tc.table_schema=k.table_schema
     where tc.constraint_type='PRIMARY KEY' and k.table_name=c.table_name and k.column_name=c.column_name and k.table_schema='public') as is_pk
from information_schema.columns c
where c.table_schema='public'
order by c.table_name, c.ordinal_position;
" > /tmp/schema_columns.tsv

docker exec $(docker ps --filter "name=supabase_db" --format "{{.Names}}") \
  psql -U postgres -d postgres -At -F $'\t' -c "
select tc.table_name as from_table, kcu.column_name as from_column,
       ccu.table_name as to_table, ccu.column_name as to_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema='public'
order by from_table, from_column;
" > /tmp/schema_fks.tsv

python3 tooling/scripts/gen-obsidian-schema.py
```

New tables are auto-assigned to an "Other" bucket in the canvas if not listed in the
`DOMAINS` map at the top of the script — add them there to keep the layout grouped.
