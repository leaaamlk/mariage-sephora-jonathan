-- Sephora & Jonathan — schéma initial Supabase
create extension if not exists pgcrypto;
create extension if not exists unaccent;

create type public.member_role as enum ('admin','collaborator');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role public.member_role not null default 'collaborator',
  created_at timestamptz not null default now()
);

create table public.wedding_tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null unique check (table_number > 0),
  table_name text,
  capacity integer not null default 10 check (capacity > 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  first_name text not null default '',
  last_name text not null default '',
  envelope_name text,
  side text not null default 'À classer' check (side in ('Jonathan','Église','Sephora','À classer')),
  rsvp text,
  present boolean not null default false,
  registered boolean not null default false,
  family_name text,
  table_id uuid references public.wedding_tables(id) on delete set null,
  seat_label text,
  message text,
  email text,
  phone text,
  dedupe_key text generated always as (
    regexp_replace(lower(unaccent(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')))), '[^a-z0-9]', '', 'g')
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index guests_dedupe_key_unique on public.guests(dedupe_key) where dedupe_key <> '';

create table public.wedding_assets (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null unique,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.activity_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id),
  action text not null,
  entity text not null,
  entity_id text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger guests_updated_at before update on public.guests
for each row execute function public.set_updated_at();

-- Un collaborateur peut modifier la fiche d'un invité, mais pas son placement.
create or replace function public.protect_seating_fields()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() and (
    new.table_id is distinct from old.table_id or
    new.seat_label is distinct from old.seat_label
  ) then
    raise exception 'Seuls les administrateurs peuvent modifier le plan de table.';
  end if;
  return new;
end; $$;
create trigger guests_protect_seating before update on public.guests
for each row execute function public.protect_seating_fields();

create or replace function public.protect_seating_insert()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() and (new.table_id is not null or new.seat_label is not null) then
    raise exception 'Seuls les administrateurs peuvent attribuer une table ou un siège.';
  end if;
  return new;
end; $$;
create trigger guests_protect_seating_insert before insert on public.guests
for each row execute function public.protect_seating_insert();

alter table public.profiles enable row level security;
alter table public.guests enable row level security;
alter table public.wedding_tables enable row level security;
alter table public.wedding_assets enable row level security;
alter table public.activity_logs enable row level security;

create policy "profiles read self or admin" on public.profiles for select to authenticated
using (id=auth.uid() or public.is_admin());
create policy "profiles admin update" on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read guests" on public.guests for select to authenticated using (true);
create policy "authenticated insert guests" on public.guests for insert to authenticated with check (true);
create policy "authenticated update guests" on public.guests for update to authenticated using (true) with check (true);
create policy "authenticated delete guests" on public.guests for delete to authenticated using (true);

create policy "authenticated read tables" on public.wedding_tables for select to authenticated using (true);
create policy "admin insert tables" on public.wedding_tables for insert to authenticated with check (public.is_admin());
create policy "admin update tables" on public.wedding_tables for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete tables" on public.wedding_tables for delete to authenticated using (public.is_admin());

create policy "authenticated read assets" on public.wedding_assets for select to authenticated using (true);
create policy "admin insert assets" on public.wedding_assets for insert to authenticated with check (public.is_admin());
create policy "admin update assets" on public.wedding_assets for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete assets" on public.wedding_assets for delete to authenticated using (public.is_admin());

create policy "admin read logs" on public.activity_logs for select to authenticated using (public.is_admin());
create policy "authenticated insert logs" on public.activity_logs for insert to authenticated with check (actor=auth.uid());

-- Privé : le bucket n'est pas public. Les utilisateurs connectés peuvent consulter;
-- seuls les administrateurs peuvent téléverser/supprimer les fichiers.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('wedding-private','wedding-private',false,52428800,
  array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do nothing;

create policy "signed in read wedding files" on storage.objects for select to authenticated
using (bucket_id='wedding-private');
create policy "admins upload wedding files" on storage.objects for insert to authenticated
with check (bucket_id='wedding-private' and public.is_admin());
create policy "admins update wedding files" on storage.objects for update to authenticated
using (bucket_id='wedding-private' and public.is_admin())
with check (bucket_id='wedding-private' and public.is_admin());
create policy "admins delete wedding files" on storage.objects for delete to authenticated
using (bucket_id='wedding-private' and public.is_admin());

-- Profil créé automatiquement en rôle collaborateur à l'inscription.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id,email,display_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''), 'collaborator')
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- IMPORTANT : promouvoir les deux comptes administrateurs depuis SQL Editor après leur création :
-- update public.profiles set role='admin' where email in ('TON_EMAIL','EMAIL_JONATHAN');

-- Synchronisation temps réel pour la liste et les tables.
alter publication supabase_realtime add table public.guests;
alter publication supabase_realtime add table public.wedding_tables;
