-- ============================================================================
-- Track HOW each machine was entered: tapping its NFC sticker or scanning its
-- QR code. Run after 0001-0003. Safe to run once; existing rows are kept and
-- marked 'unknown' (they predate QR codes and the NFC/QR split).
-- ============================================================================

alter table public.tap_events
  add column if not exists source text not null default 'unknown';

alter table public.tap_events
  drop constraint if exists tap_events_source_check;
alter table public.tap_events
  add constraint tap_events_source_check check (source in ('nfc', 'qr', 'unknown'));

create index if not exists tap_events_source_idx
  on public.tap_events (source, created_at desc);

-- record_tap now takes the source as a second argument. The old one-argument
-- version is dropped first: leaving both in place makes a call like
-- record_tap(p_machine_id => '...') ambiguous to PostgREST. Anything outside
-- 'nfc'/'qr' is stored as 'unknown' rather than rejected, so a bad value can
-- never cost you the scan itself.
drop function if exists public.record_tap(text);

create or replace function public.record_tap(p_machine_id text, p_source text default 'unknown')
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.tap_events (machine_id, uid, source)
  values (
    p_machine_id,
    auth.uid(),
    case when p_source in ('nfc', 'qr') then p_source else 'unknown' end
  );
$$;

grant execute on function public.record_tap(text, text) to anon, authenticated;
