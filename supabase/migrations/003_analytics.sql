-- ============================================================================
-- MISTER BARBER — Analitiche navigazione (privacy-first)
-- ============================================================================
-- Scelte (2026-06-08):
--   * Tempo per pagina + tempo-per-prenotare → contatori AGGREGATI ANONIMI.
--     Nessun PII, nessun identificativo cliente, nessuna riga-evento per visita.
--     Footprint DB: 3 righe totali, in eterno. (richiesta: niente log pesanti)
--   * "Quante volte è venuto il cliente" → DERIVATO dalla tabella `appointments`
--     già esistente (GROUP BY phone). Zero storage nuovo. Solo admin autenticato.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- nav_stats: contatori aggregati anonimi. Whitelist di metriche fissa.
--   page_index    → tempo visibile cumulato su index.html
--   page_prenota  → tempo visibile cumulato su prenota.html
--   ttb           → time-to-book: da apertura prenota.html a conferma
-- avg = total_ms / sample_count (calcolata lato dashboard).
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.nav_stats (
  metric       text        primary key
                           check (metric in ('page_index','page_prenota','ttb')),
  total_ms     bigint      not null default 0,
  sample_count bigint      not null default 0,
  updated_at   timestamptz not null default now()
);

insert into public.nav_stats (metric) values ('page_index'), ('page_prenota'), ('ttb')
  on conflict (metric) do nothing;

alter table public.nav_stats enable row level security;

-- Pulizia idempotente policy precedenti
drop policy if exists "auth_read_nav" on public.nav_stats;

-- Solo admin autenticato legge gli aggregati. Anon NON ha select diretta:
-- scrive esclusivamente tramite la RPC SECURITY DEFINER qui sotto.
create policy "auth_read_nav"
  on public.nav_stats for select
  to authenticated
  using (true);

revoke all on public.nav_stats from anon;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC bump_nav: l'unico modo con cui anon incrementa un contatore.
-- SECURITY DEFINER → gira coi privilegi del proprietario, anon non serve grant
-- sulla tabella. Valida metric (whitelist) e ms (0..30min) per scartare garbage.
-- Non espone NULLA in lettura: ritorna void.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_nav(p_metric text, p_ms integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_metric not in ('page_index','page_prenota','ttb') then return; end if;
  if p_ms is null or p_ms < 0 or p_ms > 1800000 then return; end if; -- cap 30 min
  update public.nav_stats
     set total_ms     = total_ms + p_ms,
         sample_count = sample_count + 1,
         updated_at   = now()
   where metric = p_metric;
end;
$$;

revoke all on function public.bump_nav(text, integer) from public;
grant execute on function public.bump_nav(text, integer) to anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC customer_visit_stats: distribuzione clienti ricorrenti.
-- DERIVATA da appointments (nessuno storage nuovo). SECURITY INVOKER → rispetta
-- RLS: eseguibile SOLO da authenticated (admin vede già telefoni/nomi).
-- Ritorna SOLO bucket aggregati (es. visits=2 → customers=5), niente PII.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.customer_visit_stats()
returns table (visits int, customers bigint)
language sql
security invoker
stable
as $$
  with per_customer as (
    select regexp_replace(phone, '[^0-9]', '', 'g') as ph, count(*)::int as visits
    from public.appointments
    where status in ('confirmed', 'completed')
      and phone is not null
    group by 1
  )
  select visits, count(*)::bigint as customers
  from per_customer
  group by visits
  order by visits;
$$;

revoke all on function public.customer_visit_stats() from anon, public;
grant execute on function public.customer_visit_stats() to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- RPC customer_visits_by_phone: quante volte è venuto UN cliente (lookup admin).
-- Normalizza il telefono (solo cifre) per match robusto. authenticated-only.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.customer_visits_by_phone(p_phone text)
returns int
language sql
security invoker
stable
as $$
  select count(*)::int
  from public.appointments
  where status in ('confirmed', 'completed')
    and regexp_replace(phone, '[^0-9]', '', 'g')
      = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
$$;

revoke all on function public.customer_visits_by_phone(text) from anon, public;
grant execute on function public.customer_visits_by_phone(text) to authenticated;
