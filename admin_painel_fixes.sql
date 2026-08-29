-- =================================================================
-- ZORA ADMIN: FIXES COMPLEMENTARES PARA O PAINEL FUNCIONAR
-- Adiciona colunas ausentes, corrige views e RPCS
-- Idempotente: pode rodar múltiplas vezes sem quebrar dados
-- =================================================================

-- ---------------------------------------------------------------
-- 1. user_profiles: colunas ausentes usadas pelo painel admin
-- ---------------------------------------------------------------
alter table public.user_profiles
  add column if not exists is_verified boolean not null default false;
comment on column public.user_profiles.is_verified
  is 'Indica se a conta foi verificada pelo administrador.';

alter table public.user_profiles
  add column if not exists referral_code text unique;
comment on column public.user_profiles.referral_code
  is 'Código de indicação único do utilizador.';

alter table public.user_profiles
  add column if not exists referred_by uuid references public.user_profiles(id) on delete set null;
comment on column public.user_profiles.referred_by
  is 'Perfil do utilizador que convidou este (indicação).';

create unique index if not exists idx_user_profiles_referral_code on public.user_profiles (referral_code);
create index if not exists idx_user_profiles_referred_by on public.user_profiles (referred_by);

-- Atribui um referral_code default para quem ainda não tem
do $$
declare
  r record;
  v_code text;
begin
  for r in select id from public.user_profiles where referral_code is null loop
    v_code := 'ZR' || substring(md5(random()::text || r.id::text) from 1 for 8);
    update public.user_profiles
       set referral_code = v_code
     where id = r.id
       and referral_code is null;
  end loop;
end $$;

-- ---------------------------------------------------------------
-- 2. wallets: coluna bonus_balance usada em admin_dashboard_stats
-- ---------------------------------------------------------------
alter table public.wallets
  add column if not exists bonus_balance numeric(14,2) not null default 0;
comment on column public.wallets.bonus_balance
  is 'Saldo de bónus (indicações) ainda não resgatado para o disponível.';

-- ---------------------------------------------------------------
-- 3. savings_applications: tabela definitiva + view
--    (corrige admin_dashboard_stats e admin_list_users)
-- ---------------------------------------------------------------
create table if not exists public.savings_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  amount_applied numeric(14,2) not null default 0,
  amount_to_receive numeric(14,2) not null default 0,
  start_at timestamp with time zone not null default now(),
  release_at timestamp with time zone not null,
  status text not null default 'active',
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_sa_amount check (amount_applied > 0),
  constraint chk_sa_status check (status in ('active','settled','cancelled'))
);
create index if not exists idx_sa_profile_id on public.savings_applications (profile_id);
create index if not exists idx_sa_status     on public.savings_applications (status);

drop trigger if exists trg_savings_applications_updated_at on public.savings_applications;
create trigger trg_savings_applications_updated_at
  before update on public.savings_applications
  for each row execute function public.set_updated_at();

alter table public.savings_applications enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='savings_applications' and policyname='policy_savings_applications_user_select'
  ) then
    create policy policy_savings_applications_user_select on public.savings_applications
      for select using (
        public.is_current_admin()
        or auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;
end $$;
grant select, insert, update on public.savings_applications to authenticated;

-- View unificada usada pelo frontend (fallback se refresh_savings_status não existir)
create or replace view public.savings_applications_view as
  select
    sa.id,
    sa.profile_id,
    sa.wallet_id,
    sa.amount_applied,
    sa.amount_to_receive,
    sa.start_at,
    sa.release_at,
    sa.status,
    sa.description,
    sa.created_at,
    sa.updated_at,
    (sa.amount_to_receive - sa.amount_applied) as profit,
    case
      when sa.status = 'settled' then 'Recebido'
      when sa.release_at <= now() then 'A receber'
      when now() between sa.start_at and sa.release_at then 'Activa'
      else 'Agendada'
    end as status_label
  from public.savings_applications sa;
grant select on public.savings_applications_view to authenticated;

-- Stub idempotente: refresh_savings_status (não causa erro no finance.ts)
create or replace function public.refresh_savings_status()
returns void
language plpgsql
security definer
as $$
begin
  update public.savings_applications
     set status = 'active'
   where status = 'active'
     and release_at > now();
  return;
end;
$$;
grant execute on function public.refresh_savings_status() to authenticated;

-- ---------------------------------------------------------------
-- 4. transactions: ajuste no check para incluir 'adjustment_credit/debit'
-- ---------------------------------------------------------------
alter table public.transactions
  drop constraint if exists chk_tx_type;
alter table public.transactions
  add constraint chk_tx_type check (transaction_type in (
    'deposit','withdrawal','investment','profit','savings','xitique','fee','other',
    'adjustment_credit','adjustment_debit'
  ));

-- =================================================================
-- FIM: FIXES PAINEL ADMIN ZORA
-- =================================================================
