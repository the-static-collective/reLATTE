-- SPAWN 024: independent opt-in, short-lived signed capability relay.
-- Account-free bearer keys are stored as SHA-256 hashes only. No public Data API grants.
-- The Edge Function is the only supported interface; these tables do not claim real-world fulfillment.

create table if not exists public.relatte_relay_024_offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  state text not null default 'OPEN'
    check (state in ('OPEN','ENGAGED','CLOSED','WITHDRAWN')),
  category text not null check (category in ('tools','materials','method','art','skill','digital')),
  scope text not null check (scope in ('review','test','copy')),
  label text not null check (char_length(label) between 12 and 100),
  quantity smallint not null check (quantity between 1 and 20),
  packet_id uuid not null unique,
  packet_hash text not null unique check (packet_hash ~ '^[a-f0-9]{64}$'),
  packet jsonb not null,
  owner_hash text not null check (owner_hash ~ '^[a-f0-9]{64}$'),
  check (expires_at > created_at and expires_at <= created_at + interval '65 minutes')
);
comment on table public.relatte_relay_024_offers is
  'Private DB backing an opt-in 60-minute sanitized public offer projection. Session-key signature integrity only; not verified inventory, identity or fulfillment.';

create table if not exists public.relatte_relay_024_interests (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null unique references public.relatte_relay_024_offers(id) on delete cascade,
  created_at timestamptz not null default now(),
  packet_id uuid not null unique,
  packet_hash text not null unique check (packet_hash ~ '^[a-f0-9]{64}$'),
  packet jsonb not null,
  guest_hash text not null check (guest_hash ~ '^[a-f0-9]{64}$'),
  decision_packet jsonb,
  decision_hash text check (decision_hash is null or decision_hash ~ '^[a-f0-9]{64}$'),
  ack_packet jsonb,
  ack_hash text check (ack_hash is null or ack_hash ~ '^[a-f0-9]{64}$'),
  check ((decision_packet is null) = (decision_hash is null)),
  check ((ack_packet is null) = (ack_hash is null)),
  check (ack_packet is null or decision_packet is not null)
);
comment on table public.relatte_relay_024_interests is
  'One explicitly signed interest per offered capability in the pilot. Decision and ACK are signed chain packets, not delivery receipts.';

create index if not exists relatte_relay_024_discovery_idx
  on public.relatte_relay_024_offers (category,expires_at desc)
  where state='OPEN';

create index if not exists relatte_relay_024_expiry_idx
  on public.relatte_relay_024_offers(expires_at);

alter table public.relatte_relay_024_offers enable row level security;
alter table public.relatte_relay_024_interests enable row level security;
revoke all on public.relatte_relay_024_offers from PUBLIC, anon, authenticated;
revoke all on public.relatte_relay_024_interests from PUBLIC, anon, authenticated;
grant select, insert, update, delete on public.relatte_relay_024_offers to service_role;
grant select, insert, update, delete on public.relatte_relay_024_interests to service_role;
