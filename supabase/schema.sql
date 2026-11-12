-- Run once in the Supabase SQL editor (already applied by the setup).
create schema if not exists gta;
create table if not exists gta.docs (
  path text primary key, col text not null, id text not null,
  data jsonb not null default '{}'::jsonb, v bigint not null default 1, updated_at timestamptz not null default now()
);
create index if not exists gta_docs_col_idx on gta.docs (col);
create index if not exists gta_docs_data_gin on gta.docs using gin (data jsonb_path_ops);
alter table gta.docs enable row level security;            -- no policies: only the edge function (direct DB connection) can read/write
revoke all on schema gta from anon, authenticated;
revoke all on gta.docs from anon, authenticated;
insert into storage.buckets (id, name, public, file_size_limit) values ('gta-art', 'gta-art', true, 52428800) on conflict (id) do nothing;
