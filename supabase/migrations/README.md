# Migration conventions

## ⚠️ New tables need an explicit GRANT (Supabase change, effective Oct 30, 2026)

Supabase used to auto-grant `anon`/`authenticated` API access to every new
`public` table. As of **Oct 30, 2026** that auto-grant is removed for **newly
created tables** on existing projects (announced May 2026).

- **Existing tables are unaffected** — they keep the grants already applied.
- **Tables created on/after Oct 30, 2026 are NOT reachable from supabase-js**
  until you add an explicit GRANT — even with correct RLS policies. The symptom
  is `permission denied for table X` (Postgres error `42501`).

RLS and GRANTs are two separate layers: RLS decides *which rows*, the GRANT
decides whether the role can touch the table through the Data API *at all*.

### Pattern to follow for every `create table` going forward

```sql
create table if not exists public.new_table ( ... );
alter table public.new_table enable row level security;

-- Required for tables created on/after Oct 30, 2026 (harmless before then):
grant select, insert, update, delete on public.new_table to authenticated;
-- Only if anon needs access (e.g. public-by-code rows like guest_passes):
-- grant select on public.new_table to anon;
```

Tailor the privilege list and roles to what the table actually needs — most
app tables are `authenticated` only. Grant `anon` only for genuinely public
reads. Service-role (edge functions, webhooks) bypasses both RLS and grants.

Do **not** backfill grants onto pre-existing tables — they already have them.
