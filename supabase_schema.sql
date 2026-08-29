-- =================================================================
-- ZORA FINANCE APP - SUPABASE SCHEMA COMPLETO
-- Versão actualizada: Pacote mínimo 300 MZN + Tabela de Transações
-- =================================================================

-- Limpeza de objectos existentes para permitir rerun seguro no editor SQL
drop view if exists public.xitique_participants cascade;
drop table if exists public.savings_applications cascade;
drop view if exists public.savings_applications_compat cascade;
drop view if exists public.profiles cascade;
drop table if exists public.chat_thread_members cascade;
drop table if exists public.chat_messages cascade;
drop table if exists public.chat_threads cascade;
drop table if exists public.xitique_members cascade;
drop table if exists public.xitique_groups cascade;
drop table if exists public.savings_accounts cascade;
drop table if exists public.transactions cascade;
drop table if exists public.user_investments cascade;
drop table if exists public.investment_packages cascade;
drop table if exists public.user_sessions cascade;
drop table if exists public.user_settings cascade;
drop table if exists public.wallets cascade;
drop table if exists public.user_profiles cascade;
drop function if exists public.home_summary(uuid) cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.days_since(timestamptz) cascade;
drop function if exists public.get_or_create_wallet(uuid) cascade;
drop function if exists public.purchase_investment_package(uuid, numeric) cascade;
drop function if exists public.get_or_create_private_chat(uuid, uuid) cascade;

-- Habilita UUID e funções necessárias
create extension if not exists "pgcrypto";

-- Função única para actualizar updated_at em todas as tabelas
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql stable;

-- ============================================================
-- TABELA: user_profiles (Perfis de Utilizador)
-- ============================================================
create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null,
  phone_number text not null unique,
  invite_code text,
  referral_code text unique,
  referred_by uuid references public.user_profiles(id) on delete set null,
  balance numeric(14,2) not null default 0,
  total_invested numeric(14,2) not null default 0,
  accumulated_profits numeric(14,2) not null default 0,
  is_admin boolean not null default false,
  is_verified boolean not null default false,
  biometric_enabled boolean not null default false,
  account_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_phone_length check (char_length(phone_number) >= 9),
  constraint chk_balance_nonneg check (balance >= 0),
  constraint chk_total_invested_nonneg check (total_invested >= 0),
  constraint chk_accumulated_profits_nonneg check (accumulated_profits >= 0)
);
comment on table public.user_profiles is 'Perfil do utilizador conectado ao auth.users.';
comment on column public.user_profiles.full_name is 'Nome completo do utilizador.';
comment on column public.user_profiles.phone_number is 'Telefone único do utilizador, usado para login.';
comment on column public.user_profiles.invite_code is 'Código de convite opcional inserido no cadastro.';
comment on column public.user_profiles.referral_code is 'Código de indicação único do utilizador.';
comment on column public.user_profiles.referred_by is 'Perfil do utilizador que indicou este utilizador.';
comment on column public.user_profiles.balance is 'Saldo principal do utilizador na carteira.';
comment on column public.user_profiles.total_invested is 'Total investido pelo utilizador em pacotes ativos.';
comment on column public.user_profiles.accumulated_profits is 'Lucros acumulados gerados pelos investimentos ativos.';
comment on column public.user_profiles.is_admin is 'Indica se o utilizador tem privilégios administrativos no painel.';
comment on column public.user_profiles.is_verified is 'Indica se a conta foi verificada pelo administrador.';
comment on column public.user_profiles.biometric_enabled is 'Flag que indica se login biometric está activado.';
comment on column public.user_profiles.account_active is 'Marca se a conta está activa.';

create unique index if not exists idx_user_profiles_phone_number on public.user_profiles (phone_number);
create unique index if not exists idx_user_profiles_referral_code on public.user_profiles (referral_code);
create index if not exists idx_user_profiles_referred_by on public.user_profiles (referred_by);
create index if not exists idx_user_profiles_auth_user_id on public.user_profiles (auth_user_id);

create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

create policy policy_user_profiles_select
  on public.user_profiles
  for select
  using (auth.role() = 'authenticated');

create policy policy_user_profiles_insert
  on public.user_profiles
  for insert
  with check (
    auth.uid() = auth_user_id
    or auth.role() = 'anon'
  );

create policy policy_user_profiles_update
  on public.user_profiles
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy policy_user_profiles_delete
  on public.user_profiles
  for delete
  using (auth.uid() = auth_user_id);

-- Auto-criar `user_profiles` quando um novo utilizador é criado no esquema `auth`
create or replace function public.handle_auth_user_created()
returns trigger as $$
begin
  insert into public.user_profiles (auth_user_id, full_name, phone_number, invite_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'fullName', new.email),
    coalesce(
      nullif(regexp_replace(new.raw_user_meta_data->>'phone_number', '\D', '', 'g'), ''),
      nullif(regexp_replace(new.raw_user_meta_data->>'phone', '\D', '', 'g'), ''),
      coalesce(
        nullif(substring(new.email from '^([^@]+)@'), ''),
        '000000000'
      )
    ),
    new.raw_user_meta_data->>'invite_code'
  )
  on conflict (phone_number) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_auth_user_created on auth.users;
create trigger trg_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_auth_user_created();

-- ============================================================
-- TABELA: wallets (Carteiras Financeiras)
-- ============================================================
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.user_profiles(id) on delete cascade,
  balance numeric(14,2) not null default 0,
  locked_balance numeric(14,2) not null default 0,
  currency text not null default 'MZN',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_balance_nonneg check (balance >= 0),
  constraint chk_locked_nonneg check (locked_balance >= 0)
);
comment on table public.wallets is 'Carteira financeira do utilizador com saldos.';
comment on column public.wallets.locked_balance is 'Saldo bloqueado ou reservado.';
comment on column public.wallets.currency is 'Moeda usada no app.';

create index if not exists idx_wallets_profile_id on public.wallets (profile_id);

create trigger trg_wallets_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

create or replace function public.sync_user_profile_finances_from_wallet()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    update public.user_profiles
       set balance = 0,
           updated_at = now()
     where id = old.profile_id;
    return old;
  end if;

  update public.user_profiles
     set balance = coalesce(new.balance, 0),
         updated_at = now()
   where id = new.profile_id;

  return new;
end;
$$;
comment on function public.sync_user_profile_finances_from_wallet()
  is 'Sincroniza os saldos de public.wallets para public.user_profiles quando uma carteira é criada ou atualizada.';

create trigger trg_wallets_sync_user_profile
  after insert or update or delete on public.wallets
  for each row execute function public.sync_user_profile_finances_from_wallet();

update public.user_profiles up
set balance = coalesce(w.balance, 0)
from public.wallets w
where w.profile_id = up.id;

alter table public.wallets enable row level security;

-- ============================================================
-- TABELA: savings_applications (Poupanças aplicadas)
-- ============================================================
create table public.savings_applications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  amount_applied numeric(14,2) not null default 0,
  amount_to_receive numeric(14,2) not null default 0,
  start_at timestamp with time zone not null default now(),
  release_at timestamp with time zone not null default now(),
  status text not null default 'active',
  description text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_sa_amount check (amount_applied > 0),
  constraint chk_sa_status check (status in ('active','settled','cancelled'))
);
create index if not exists idx_sa_profile_id on public.savings_applications (profile_id);
create index if not exists idx_sa_status on public.savings_applications (status);

create trigger trg_savings_applications_updated_at
  before update on public.savings_applications
  for each row execute function public.set_updated_at();

alter table public.savings_applications enable row level security;

create policy policy_savings_applications_user_select
  on public.savings_applications
  for select
  using (
    public.is_current_admin()
    or auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
  );

grant select, insert, update on public.savings_applications to authenticated;

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

create policy policy_wallets_select
  on public.wallets
  for select
  using (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.wallets.profile_id
    )
  );

create policy policy_wallets_insert
  on public.wallets
  for insert
  with check (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.wallets.profile_id
    )
  );

create policy policy_wallets_update
  on public.wallets
  for update
  using (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.wallets.profile_id
    )
  )
  with check (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.wallets.profile_id
    )
  );

-- ============================================================
-- TABELA: user_settings (Configurações do Utilizador)
-- ============================================================
create table public.user_settings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.user_profiles(id) on delete cascade,
  notifications_enabled boolean not null default true,
  language text not null default 'pt-MZ',
  dark_mode boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
comment on table public.user_settings is 'Configurações do utilizador como notificações e idioma.';
comment on column public.user_settings.notifications_enabled is 'Habilita notificações para o utilizador.';
comment on column public.user_settings.language is 'Idioma preferido.';
comment on column public.user_settings.dark_mode is 'Tema escuro activado.';

create index if not exists idx_user_settings_profile_id on public.user_settings (profile_id);

create trigger trg_user_settings_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;

create policy policy_user_settings_select
  on public.user_settings
  for select
  using (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.user_settings.profile_id
    )
  );

create policy policy_user_settings_insert
  on public.user_settings
  for insert
  with check (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.user_settings.profile_id
    )
  );

create policy policy_user_settings_update
  on public.user_settings
  for update
  using (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.user_settings.profile_id
    )
  )
  with check (
    auth.uid() = (
      select auth_user_id
      from public.user_profiles
      where id = public.user_settings.profile_id
    )
  );

-- ============================================================
-- TABELA: user_sessions (Sessões do Utilizador)
-- ============================================================
create table public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  session_token_hash text not null,
  refresh_token_hash text,
  last_accessed_at timestamp with time zone not null default now(),
  expires_at timestamp with time zone,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint unique_session_token_hash unique (session_token_hash)
);
comment on table public.user_sessions is 'Sessões do app para rastrear token, último acesso e estado activo.';
comment on column public.user_sessions.last_accessed_at is 'Data/hora do último acesso dessa sessão.';
comment on column public.user_sessions.is_active is 'Indica se a sessão está activa.';

create index if not exists idx_user_sessions_auth_user_id on public.user_sessions (auth_user_id);
create index if not exists idx_user_sessions_profile_id on public.user_sessions (profile_id);

create trigger trg_user_sessions_updated_at
  before update on public.user_sessions
  for each row execute function public.set_updated_at();

alter table public.user_sessions enable row level security;

create policy policy_user_sessions_select
  on public.user_sessions
  for select
  using (auth.uid() = auth_user_id);

create policy policy_user_sessions_insert
  on public.user_sessions
  for insert
  with check (auth.uid() = auth_user_id);

create policy policy_user_sessions_update
  on public.user_sessions
  for update
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

create policy policy_user_sessions_delete
  on public.user_sessions
  for delete
  using (auth.uid() = auth_user_id);

-- ============================================================
-- TABELA: investment_packages (Pacotes de Investimento)
-- IMPORTANTE: Pacote mínimo = 300 MZN (N1)
-- ============================================================
create table public.investment_packages (
  id uuid primary key default gen_random_uuid(),
  package_number integer not null unique,
  name text not null,
  description text,
  minimum_investment numeric(14,2) not null default 300,
  daily_profit numeric(14,2) not null default 0,
  monthly_profit numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_min_investment_positive check (minimum_investment >= 300),
  constraint chk_daily_profit_nonneg check (daily_profit >= 0),
  constraint chk_monthly_profit_nonneg check (monthly_profit >= 0),
  constraint chk_package_number check (package_number between 1 and 20)
);
comment on table public.investment_packages is 'Pacotes de investimento disponíveis no app. N1 = 300 MZN (menor pacote).';
comment on column public.investment_packages.minimum_investment is 'Valor mínimo de aplicação (300 MZN no menor pacote).';
comment on column public.investment_packages.daily_profit is 'Retorno diário estimado.';

create unique index if not exists idx_investment_packages_package_number on public.investment_packages (package_number);

create trigger trg_investment_packages_updated_at
  before update on public.investment_packages
  for each row execute function public.set_updated_at();

alter table public.investment_packages enable row level security;

create policy policy_investment_packages_select
  on public.investment_packages
  for select
  using (true);

-- Inserção dos pacotes de investimento N1 a N9
-- N1 = 300 MZN é o menor pacote disponível (100 MZN REMOVIDO)
insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (1, 'N1 - Pacote Iniciante', 'Pacote de investimento nível 1 - ideal para começar', 300, 10.5, 315, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (2, 'N2 - Pacote Básico', 'Pacote de investimento nível 2', 500, 17.5, 525, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (3, 'N3 - Pacote Intermediário', 'Pacote de investimento nível 3', 1000, 35, 1050, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (4, 'N4 - Pacote Avançado', 'Pacote de investimento nível 4', 5000, 175, 5250, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (5, 'N5 - Pacote Premium', 'Pacote de investimento nível 5', 10000, 350, 10500, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (6, 'N6 - Pacote Elite', 'Pacote de investimento nível 6', 15000, 525, 15750, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (7, 'N7 - Pacote Master', 'Pacote de investimento nível 7', 20000, 700, 21000, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (8, 'N8 - Pacote VIP', 'Pacote de investimento nível 8', 25000, 875, 26250, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

insert into public.investment_packages (package_number, name, description, minimum_investment, daily_profit, monthly_profit, is_active)
values (9, 'N9 - Pacote Imperial', 'Pacote de investimento nível 9 - máximo retorno', 30000, 1050, 31500, true)
on conflict (package_number) do update set
  name = excluded.name,
  description = excluded.description,
  minimum_investment = excluded.minimum_investment,
  daily_profit = excluded.daily_profit,
  monthly_profit = excluded.monthly_profit,
  is_active = excluded.is_active;

-- ============================================================
-- TABELA: user_investments (Investimentos do Utilizador)
-- ============================================================
create table public.user_investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  package_id uuid not null references public.investment_packages(id) on delete restrict,
  amount numeric(14,2) not null default 0,
  purchased_at timestamp with time zone not null default now(),
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_amount_positive check (amount > 0),
  constraint chk_status check (status in ('active', 'completed', 'cancelled'))
);
comment on table public.user_investments is 'Regista investimentos realizados pelo utilizador.';
comment on column public.user_investments.status is 'Estado do investimento: active, completed, cancelled.';

create index if not exists idx_user_investments_user_id on public.user_investments (user_id);
create index if not exists idx_user_investments_package_id on public.user_investments (package_id);
create index if not exists idx_user_investments_status on public.user_investments (status);

create trigger trg_user_investments_updated_at
  before update on public.user_investments
  for each row execute function public.set_updated_at();

create or replace function public.sync_user_profile_investment_totals()
returns trigger
language plpgsql
as $$
declare
  v_profile_id uuid;
  v_total_invested numeric(14,2);
  v_accumulated_profits numeric(14,2);
begin
  if tg_op = 'DELETE' then
    v_profile_id := old.user_id;
  else
    v_profile_id := new.user_id;
  end if;

  select
    coalesce(sum(ui.amount), 0)::numeric(14,2),
    coalesce(sum(
      ui.amount * (coalesce(ip.daily_profit, 0) / nullif(coalesce(ip.minimum_investment, ui.amount), 0))
      * public.days_since(ui.purchased_at)
    ), 0)::numeric(14,2)
  into v_total_invested, v_accumulated_profits
  from public.user_investments ui
  left join public.investment_packages ip on ip.id = ui.package_id
  where ui.user_id = v_profile_id and ui.status = 'active';

  update public.user_profiles
     set total_invested = v_total_invested,
         accumulated_profits = v_accumulated_profits,
         updated_at = now()
   where id = v_profile_id;

  if tg_op = 'DELETE' then
    return old;
  else
    return new;
  end if;
end;
$$;

create trigger trg_user_investments_sync_profile
  after insert or update or delete on public.user_investments
  for each row execute function public.sync_user_profile_investment_totals();

alter table public.user_investments enable row level security;

create policy policy_user_investments_select
  on public.user_investments
  for select
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.user_investments.user_id));

create policy policy_user_investments_insert
  on public.user_investments
  for insert
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.user_investments.user_id));

create policy policy_user_investments_update
  on public.user_investments
  for update
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.user_investments.user_id))
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.user_investments.user_id));

-- ============================================================
-- TABELA: transactions (Movimentos/Transacções)
-- ============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  user_investment_id uuid references public.user_investments(id) on delete set null,
  transaction_type text not null,
  direction text not null default 'debit',
  amount numeric(14,2) not null default 0,
  balance_before numeric(14,2),
  balance_after numeric(14,2),
  description text,
  reference text,
  status text not null default 'completed',
  processed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_tx_type check (transaction_type in ('deposit', 'withdrawal', 'investment', 'profit', 'savings', 'xitique', 'fee', 'other')),
  constraint chk_tx_direction check (direction in ('debit', 'credit')),
  constraint chk_tx_status check (status in ('pending', 'completed', 'failed', 'reversed')),
  constraint chk_tx_amount check (amount >= 0)
);
comment on table public.transactions is 'Histórico de todas as transacções financeiras do utilizador.';
comment on column public.transactions.transaction_type is 'Tipo: deposit, withdrawal, investment, profit, savings, xitique, fee, other.';
comment on column public.transactions.direction is 'Sentido: debit (saída) ou credit (entrada).';

create index if not exists idx_transactions_profile_id on public.transactions (profile_id);
create index if not exists idx_transactions_wallet_id on public.transactions (wallet_id);
create index if not exists idx_transactions_investment_id on public.transactions (user_investment_id);
create index if not exists idx_transactions_created_at on public.transactions (created_at desc);

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;

create policy policy_transactions_select
  on public.transactions
  for select
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.transactions.profile_id));

create policy policy_transactions_insert
  on public.transactions
  for insert
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.transactions.profile_id));

-- ============================================================
-- TABELA: savings_accounts (Contas de Poupança)
-- ============================================================
create table public.savings_accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  name text not null default 'Poupança principal',
  balance numeric(14,2) not null default 0,
  status text not null default 'active',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_savings_balance check (balance >= 0),
  constraint chk_savings_status check (status in ('active', 'closed'))
);
comment on table public.savings_accounts is 'Contas de poupança do utilizador.';
comment on column public.savings_accounts.balance is 'Saldo acumulado na poupança.';

create index if not exists idx_savings_accounts_profile_id on public.savings_accounts (profile_id);

create trigger trg_savings_accounts_updated_at
  before update on public.savings_accounts
  for each row execute function public.set_updated_at();

alter table public.savings_accounts enable row level security;

create policy policy_savings_accounts_select
  on public.savings_accounts
  for select
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.savings_accounts.profile_id));

create policy policy_savings_accounts_insert
  on public.savings_accounts
  for insert
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.savings_accounts.profile_id));

create policy policy_savings_accounts_update
  on public.savings_accounts
  for update
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.savings_accounts.profile_id))
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.savings_accounts.profile_id));

-- ============================================================
-- TABELA: xitique_groups (Grupos de Xitique)
-- ============================================================
create table public.xitique_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  contribution_value numeric(14,2) not null default 0,
  frequency text not null default 'monthly',
  status text not null default 'active',
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_xitique_status check (status in ('active', 'closed')),
  constraint chk_xitique_frequency check (frequency in ('weekly', 'biweekly', 'monthly'))
);
comment on table public.xitique_groups is 'Grupos de xitique disponíveis ou em andamento.';
comment on column public.xitique_groups.frequency is 'Frequência de contribuição: weekly, biweekly, monthly.';

create index if not exists idx_xitique_groups_status on public.xitique_groups (status);

create trigger trg_xitique_groups_updated_at
  before update on public.xitique_groups
  for each row execute function public.set_updated_at();

alter table public.xitique_groups enable row level security;

create policy policy_xitique_groups_select
  on public.xitique_groups
  for select
  using (auth.role() = 'authenticated');

create policy policy_xitique_groups_insert
  on public.xitique_groups
  for insert
  with check (auth.role() = 'authenticated');

-- ============================================================
-- TABELA: xitique_members (Participantes em Xitique)
-- ============================================================
create table public.xitique_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  xitique_group_id uuid not null references public.xitique_groups(id) on delete cascade,
  joined_at timestamp with time zone not null default now(),
  role text not null default 'member',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint uq_xitique_member unique (profile_id, xitique_group_id)
);
comment on table public.xitique_members is 'Membros que participam de um grupo de xitique.';

create index if not exists idx_xitique_members_profile_id on public.xitique_members (profile_id);
create index if not exists idx_xitique_members_group_id on public.xitique_members (xitique_group_id);

create trigger trg_xitique_members_updated_at
  before update on public.xitique_members
  for each row execute function public.set_updated_at();

alter table public.xitique_members enable row level security;

create policy policy_xitique_members_select
  on public.xitique_members
  for select
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.xitique_members.profile_id));

create policy policy_xitique_members_insert
  on public.xitique_members
  for insert
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.xitique_members.profile_id));

-- ============================================================
-- TABELAS DE CHAT / COMUNIDADE
-- ============================================================
create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  title text,
  is_group boolean not null default true,
  thread_category text,
  status text,
  is_public boolean not null default true,
  is_private boolean not null default false,
  is_verified boolean not null default false,
  created_by uuid references public.user_profiles(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
comment on table public.chat_threads is 'Threads de chat que podem conter múltiplos membros.';

create trigger trg_chat_threads_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

insert into public.chat_threads (id, title, is_group, thread_category, status, is_public, is_private, is_verified, created_by)
select '00000000-0000-0000-0000-000000000001', 'Suporte Zora', true, 'support', 'Ativo', true, false, true, null
where not exists (select 1 from public.chat_threads where id = '00000000-0000-0000-0000-000000000001');

insert into public.chat_threads (id, title, is_group, thread_category, status, is_public, is_private, is_verified, created_by)
select '00000000-0000-0000-0000-000000000002', 'Poupança Zora', true, 'savings', 'Ativo', true, false, true, null
where not exists (select 1 from public.chat_threads where id = '00000000-0000-0000-0000-000000000002');

insert into public.chat_threads (id, title, is_group, thread_category, status, is_public, is_private, is_verified, created_by)
select '00000000-0000-0000-0000-000000000003', 'Xitique Zora', true, 'xitique', 'Ativo', true, false, true, null
where not exists (select 1 from public.chat_threads where id = '00000000-0000-0000-0000-000000000003');

create table public.chat_thread_members (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  chat_thread_id uuid not null references public.chat_threads(id) on delete cascade,
  joined_at timestamp with time zone not null default now(),
  role text not null default 'participant',
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint uq_chat_member unique (profile_id, chat_thread_id)
);
comment on table public.chat_thread_members is 'Membros de threads de chat do utilizador.';

create index if not exists idx_chat_thread_members_profile_id on public.chat_thread_members (profile_id);
create index if not exists idx_chat_thread_members_chat_thread_id on public.chat_thread_members (chat_thread_id);

create trigger trg_chat_thread_members_updated_at
  before update on public.chat_thread_members
  for each row execute function public.set_updated_at();

alter table public.chat_thread_members enable row level security;

create policy policy_chat_thread_members_select
  on public.chat_thread_members
  for select
  using (auth.uid() = (select auth_user_id from public.user_profiles where id = public.chat_thread_members.profile_id));

create policy policy_chat_thread_members_insert
  on public.chat_thread_members
  for insert
  with check (auth.uid() = (select auth_user_id from public.user_profiles where id = public.chat_thread_members.profile_id));

create policy policy_chat_threads_select
  on public.chat_threads
  for select
  using (
    is_public
    or exists (
      select 1
      from public.chat_thread_members m
      join public.user_profiles up on up.id = m.profile_id
      where m.chat_thread_id = public.chat_threads.id
        and up.auth_user_id = auth.uid()
    )
  );

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  chat_thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_profile_id uuid not null references public.user_profiles(id) on delete cascade,
  type text not null default 'text',
  content text,
  attachment_url text,
  is_deleted boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);
comment on table public.chat_messages is 'Mensagens trocadas por threads de chat.';

create index if not exists idx_chat_messages_chat_thread_id on public.chat_messages (chat_thread_id);
create index if not exists idx_chat_messages_sender_profile_id on public.chat_messages (sender_profile_id);

create trigger trg_chat_messages_updated_at
  before update on public.chat_messages
  for each row execute function public.set_updated_at();

alter table public.chat_messages enable row level security;

create policy policy_chat_messages_select
  on public.chat_messages
  for select
  using (
    (
      exists (
        select 1
        from public.chat_threads ct
        where ct.id = public.chat_messages.chat_thread_id
          and ct.is_public
      )
      or exists (
        select 1
        from public.chat_thread_members m
        join public.user_profiles up on up.id = m.profile_id
        where m.chat_thread_id = public.chat_messages.chat_thread_id
          and up.auth_user_id = auth.uid()
      )
    )
  );

create policy policy_chat_messages_insert
  on public.chat_messages
  for insert
  with check (
    (
      auth.uid() = (select auth_user_id from public.user_profiles where id = public.chat_messages.sender_profile_id)
      and (
        exists (
          select 1
          from public.chat_threads ct
          where ct.id = public.chat_messages.chat_thread_id
            and ct.is_public
        )
        or exists (
          select 1
          from public.chat_thread_members m
          join public.user_profiles up on up.id = m.profile_id
          where m.chat_thread_id = public.chat_messages.chat_thread_id
            and up.auth_user_id = auth.uid()
        )
      )
    )
  );

-- ============================================================
-- FUNÇÕES RPC E AUXILIARES
-- ============================================================

create or replace function public.get_or_create_private_chat(p1 uuid, p2 uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  current_profile_id uuid;
  chat_id uuid;
begin
  select id into current_profile_id from public.user_profiles where auth_user_id = auth.uid();
  if current_profile_id is null then
    raise exception 'Perfil não encontrado para o utilizador autenticado';
  end if;
  if p1 = p2 then
    raise exception 'Os participantes devem ser diferentes';
  end if;
  if p1 <> current_profile_id and p2 <> current_profile_id then
    raise exception 'Perfil não autorizado para criar esta conversa';
  end if;

  select id into chat_id
  from public.chat_threads
  where is_private
    and exists (select 1 from public.chat_thread_members m where m.chat_thread_id = public.chat_threads.id and m.profile_id = p1)
    and exists (select 1 from public.chat_thread_members m where m.chat_thread_id = public.chat_threads.id and m.profile_id = p2)
  limit 1;

  if chat_id is not null then
    return chat_id;
  end if;

  insert into public.chat_threads (title, is_group, thread_category, status, is_public, is_private, is_verified, created_by)
  values ('Conversa privada', false, 'private', 'Ativo', false, true, false, current_profile_id)
  returning id into chat_id;

  insert into public.chat_thread_members (profile_id, chat_thread_id, joined_at, role)
  values (p1, chat_id, now(), 'participant'), (p2, chat_id, now(), 'participant');

  return chat_id;
end;
$$;

-- Views de compatibilidade
create view public.profiles as
select *
from public.user_profiles;
comment on view public.profiles is 'View de compatibilidade para frontends que consultam profiles.';

create or replace view public.savings_applications_compat as
select *
from public.savings_accounts;
comment on view public.savings_applications_compat is 'View de compatibilidade para frontends que consultam savings_applications em versões anteriores.';

create view public.xitique_participants as
select *
from public.xitique_members;
comment on view public.xitique_participants is 'View de compatibilidade para frontends que consultam xitique_participants.';

-- Função auxiliar para calcular dias desde a compra
create or replace function public.days_since(purchased_at timestamptz)
returns integer
language sql stable as $$
select coalesce(extract(day from (now() - purchased_at)), 0)::integer;
$$;
comment on function public.days_since(timestamptz) is 'Calcula dias inteiros desde uma data até hoje.';

-- Função de resumo home
create or replace function public.home_summary(auth_user_id uuid)
returns table (
  principal numeric(14,2),
  accumulated_profits numeric(14,2),
  savings_value numeric(14,2),
  active_investments int,
  xitique_active int,
  last_profit text,
  available numeric(14,2),
  total_invested numeric(14,2),
  estimated_daily_profit numeric(14,2),
  estimated_monthly_profit numeric(14,2)
)
language sql stable as $$
select
  coalesce(up.balance, w.balance, 0) as principal,
  coalesce(up.accumulated_profits, (
    select sum(
      ui.amount * (coalesce(ip.daily_profit, 0) / nullif(coalesce(ip.minimum_investment, ui.amount), 0))
      * public.days_since(ui.purchased_at)
    )
    from public.user_investments ui
    left join public.investment_packages ip on ip.id = ui.package_id
    where ui.user_id = up.id and ui.status = 'active'
  ), 0)::numeric(14,2) as accumulated_profits,
  coalesce(sum(s.balance), 0) as savings_value,
  coalesce((select count(1) from public.user_investments ui where ui.user_id = up.id and ui.status = 'active'), 0) as active_investments,
  coalesce((select count(1) from public.xitique_members xm where xm.profile_id = up.id), 0) as xitique_active,
  coalesce((
    select to_char(sum(ui.amount * (coalesce(ip.daily_profit, 0) / nullif(coalesce(ip.minimum_investment, ui.amount), 0))), 'FM999G999G990D00')
    from public.user_investments ui
    left join public.investment_packages ip on ip.id = ui.package_id
    where ui.user_id = up.id and ui.status = 'active'
  ), '0.00')::text as last_profit,
  coalesce(up.balance, w.balance, 0) as available,
  coalesce(up.total_invested, (select sum(ui.amount) from public.user_investments ui where ui.user_id = up.id and ui.status = 'active'), 0)::numeric(14,2) as total_invested,
  coalesce((
    select sum(ui.amount * (coalesce(ip.daily_profit, 0) / nullif(coalesce(ip.minimum_investment, ui.amount), 0)))
    from public.user_investments ui
    left join public.investment_packages ip on ip.id = ui.package_id
    where ui.user_id = up.id and ui.status = 'active'
  ), 0)::numeric(14,2) as estimated_daily_profit,
  coalesce((
    select sum((ui.amount * (coalesce(ip.daily_profit, 0) / nullif(coalesce(ip.minimum_investment, ui.amount), 0))) * 30)
    from public.user_investments ui
    left join public.investment_packages ip on ip.id = ui.package_id
    where ui.user_id = up.id and ui.status = 'active'
  ), 0)::numeric(14,2) as estimated_monthly_profit
from public.user_profiles up
left join public.wallets w on w.profile_id = up.id
left join public.savings_accounts s on s.profile_id = up.id
where up.auth_user_id = auth_user_id
group by up.id, w.balance;
$$;
comment on function public.home_summary(uuid) is 'Função que retorna o resumo inicial usado na Home do app com cálculo de lucros de 3.5% diário.';

-- Função para obter ou criar carteira do utilizador
create or replace function public.get_or_create_wallet(p_profile_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  wid uuid;
begin
  select id into wid from public.wallets w where w.profile_id = $1 limit 1;
  if wid is null then
    insert into public.wallets (profile_id, balance, locked_balance, currency)
    values ($1, 0, 0, 'MZN')
    returning id into wid;
  end if;
  return wid;
end;
$$;
comment on function public.get_or_create_wallet(uuid) is 'Retorna a carteira do utilizador, criando-a com saldo zero se ainda não existir.';

-- ============================================================
-- FUNÇÃO RPC PRINCIPAL: Compra Transaccional de Investimento
-- Valida saldo, debita da carteira, cria user_investments + transactions
-- ============================================================
create or replace function public.purchase_investment_package(
  p_package_id uuid,
  p_amount numeric(14,2)
)
returns table (
  success boolean,
  message text,
  user_investment_id uuid,
  new_balance numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_wallet_id uuid;
  v_package public.investment_packages;
  v_current_balance numeric(14,2);
  v_current_available numeric(14,2);
  v_min_investment numeric(14,2);
  v_investment_id uuid;
begin
  if v_auth_user_id is null then
    success := false; message := 'Utilizador não autenticado'; return next; return;
  end if;

  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then
    success := false; message := 'Perfil do utilizador não encontrado'; return next; return;
  end if;

  select * into v_package from public.investment_packages ip where ip.id = p_package_id and ip.is_active = true limit 1;
  if v_package is null then
    success := false; message := 'Pacote de investimento indisponível'; return next; return;
  end if;

  v_min_investment := coalesce(v_package.minimum_investment, 300);
  if p_amount is null or p_amount < v_min_investment then
    success := false; message := 'Valor inferior ao mínimo do pacote (' || v_min_investment::text || ' MZN)'; return next; return;
  end if;
  if p_amount <= 0 then
    success := false; message := 'Valor de investimento inválido'; return next; return;
  end if;

  v_wallet_id := public.get_or_create_wallet(v_profile_id);

  select w.balance
    into v_current_balance
    from public.wallets w where w.id = v_wallet_id for update;

  if v_current_balance is null then v_current_balance := 0; end if;

  if v_current_balance < p_amount then
    success := false;
    message := 'Saldo insuficiente. Disponível: ' || to_char(v_current_balance, 'FM999G999G990D00') || ' MZN';
    return next;
    return;
  end if;

  update public.wallets w
    set
      balance = (w.balance - p_amount),
      updated_at = now()
    where w.id = v_wallet_id;

  insert into public.user_investments (user_id, package_id, amount, purchased_at, status)
    values (v_profile_id, p_package_id, p_amount, now(), 'active')
    returning id into v_investment_id;

  insert into public.transactions (
    profile_id, wallet_id, user_investment_id,
    transaction_type, direction, amount,
    balance_before, balance_after,
    description, status, processed_at
  ) values (
    v_profile_id, v_wallet_id, v_investment_id,
    'investment', 'debit', p_amount,
    v_current_balance, (v_current_balance - p_amount),
    'Compra do pacote ' || coalesce(v_package.name, 'Investimento') || ' no valor de ' || to_char(p_amount, 'FM999G999G990D00') || ' MZN',
    'completed', now()
  );

  select w.balance
    into new_balance
    from public.wallets w where w.id = v_wallet_id;

  success := true;
  message := 'Investimento realizado com sucesso';
  user_investment_id := v_investment_id;
  return next;
end;
$$;
comment on function public.purchase_investment_package(uuid, numeric) is 'Compra transaccional de pacote de investimento. Valida saldo, debita carteira, cria user_investments e regista transação.';

-- ============================================================
-- GRANTs de execução das funções RPC
-- ============================================================
grant execute on function public.get_or_create_wallet(uuid) to authenticated, anon;
grant execute on function public.purchase_investment_package(uuid, numeric) to authenticated;
grant execute on function public.days_since(timestamptz) to authenticated;
grant execute on function public.home_summary(uuid) to authenticated;
grant execute on function public.get_or_create_private_chat(uuid, uuid) to authenticated;
grant execute on function public.set_updated_at() to authenticated;

-- ============================================================
-- FIM DO SCRIPT ZORA FINANCE APP
-- ============================================================
