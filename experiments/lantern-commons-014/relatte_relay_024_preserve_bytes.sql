-- 024: Preserve signed UTF-8 JSON property order; JSONB reordering breaks ECDSA signatures.
-- No submissions have been written to these new tables before this alteration.
alter table public.relatte_relay_024_offers
  alter column packet type text using packet::text;
alter table public.relatte_relay_024_interests
  alter column packet type text using packet::text,
  alter column decision_packet type text using decision_packet::text,
  alter column ack_packet type text using ack_packet::text;
alter table public.relatte_relay_024_offers
  add constraint relatte_024_offer_packet_size check (char_length(packet) <= 3000);
alter table public.relatte_relay_024_interests
  add constraint relatte_024_interest_packet_size check (char_length(packet) <= 3000),
  add constraint relatte_024_decision_packet_size check (decision_packet is null or char_length(decision_packet) <= 3000),
  add constraint relatte_024_ack_packet_size check (ack_packet is null or char_length(ack_packet) <= 3000);
