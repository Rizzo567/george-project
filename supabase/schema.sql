-- Tabella prenotazioni
create table public.appointments (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null,
  phone       text        not null,
  barber      text        not null check (barber in ('george', 'berlin')),
  service     text        not null check (service in ('Cut','Fade','Beard','Razor','Full')),
  date        date        not null,
  time        time        not null,
  notes       text,
  img_url     text,
  status      text        not null default 'pending'
                          check (status in ('pending','confirmed','completed','cancelled')),
  created_at  timestamptz default now()
);

-- Abilita RLS
alter table public.appointments enable row level security;

-- Anon: può inserire nuove prenotazioni
create policy "anon_insert"
  on public.appointments for insert
  to anon
  with check (true);

-- Anon: può leggere (necessario per controllare slot disponibili)
create policy "anon_select_slots"
  on public.appointments for select
  to anon
  using (true);

-- Authenticated: può leggere tutto
create policy "auth_select_all"
  on public.appointments for select
  to authenticated
  using (true);

-- Authenticated: può aggiornare status
create policy "auth_update_status"
  on public.appointments for update
  to authenticated
  using (true)
  with check (true);
