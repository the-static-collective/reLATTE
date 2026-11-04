-- SPAWN 024 privacy: purge expired, self-attested signed relay rows after 24h grace.
-- ON DELETE CASCADE removes linked interests, decision and ACK with each offer.
select cron.schedule(
  'relatte-relay-024-prune-24h',
  '11 * * * *',
  $$delete from public.relatte_relay_024_offers where expires_at < now() - interval '24 hours'$$
);
