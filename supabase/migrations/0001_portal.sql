-- Portal (modelo Conta Azul) — base multi-módulo (hub) no Supabase dedicado.
-- Cada área do portal = um "módulo": 'financeiro', 'tributos', 'expense'.
--
-- Estrutura (tudo em public):
--   profiles       — 1 linha por usuário (auto-criada no signup)
--   user_modules   — quem acessa qual módulo e com qual papel (viewer/editor/admin)
--   module_state   — estado/edições de cada módulo (modulo,key → jsonb), RLS por módulo
--
-- Idempotente: rodar no Supabase → SQL Editor → New query → colar tudo → Run.

-- ---------- perfis ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles for select to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nome)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- acesso por módulo ----------
create table if not exists public.user_modules (
  user_id uuid not null references auth.users(id) on delete cascade,
  modulo  text not null,                  -- 'financeiro' | 'tributos' | 'expense'
  papel   text not null default 'editor', -- viewer | editor | admin
  primary key (user_id, modulo)
);
-- Depois da Etapa 5 do catálogo, public.user_modules é VIEW sobre core.acessos:
-- rodar esta migração de novo não pode mexer nela como tabela.
do $um$
begin
  if (select relkind from pg_class where oid = 'public.user_modules'::regclass) = 'r' then
    alter table public.user_modules enable row level security;
    drop policy if exists user_modules_self on public.user_modules;
    create policy user_modules_self on public.user_modules for select to authenticated using (user_id = auth.uid());
  end if;
end $um$;

create or replace function public.tem_modulo(m text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_modules where user_id = auth.uid() and modulo = m);
$$;

-- ---------- estado dos módulos (edições compartilhadas) ----------
create table if not exists public.module_state (
  modulo     text not null,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (modulo, key)
);
create or replace function public.module_state_touch()
returns trigger language plpgsql as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists trg_module_state_touch on public.module_state;
create trigger trg_module_state_touch before insert or update on public.module_state
  for each row execute function public.module_state_touch();

alter table public.module_state enable row level security;
drop policy if exists module_state_select on public.module_state;
drop policy if exists module_state_insert on public.module_state;
drop policy if exists module_state_update on public.module_state;
create policy module_state_select on public.module_state for select to authenticated using (public.tem_modulo(modulo));
create policy module_state_insert on public.module_state for insert to authenticated with check (public.tem_modulo(modulo));
create policy module_state_update on public.module_state for update to authenticated using (public.tem_modulo(modulo)) with check (public.tem_modulo(modulo));
