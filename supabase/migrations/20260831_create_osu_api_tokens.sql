create table if not exists public.osu_api_tokens (
  token_key text primary key,
  access_token text not null,
  token_type text not null default 'Bearer',
  scope text not null default 'public',
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.osu_api_tokens enable row level security;

revoke all on table public.osu_api_tokens from anon, authenticated;

comment on table public.osu_api_tokens is 'Private osu! API access token store used only by Edge Functions via service role.';
