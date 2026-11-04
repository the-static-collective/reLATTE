-- Keep synthetic live test exchanges out of public opt-in discovery.
alter table public.relatte_relay_024_offers
  add column if not exists sandbox boolean not null default false;
create index if not exists relatte_relay_024_public_open_idx
  on public.relatte_relay_024_offers(created_at desc)
  where state='OPEN' and sandbox=false;
