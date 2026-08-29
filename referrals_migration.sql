-- =================================================================
-- ZORA - SISTEMA DE RECOMPENSAS / INDICAÇÕES
-- Migração idempotente (não destrói dados existentes)
-- REGRA: Convidado compra pacote N1..N9 -> Convidador ganha 10% do valor
-- =================================================================

-- -----------------------------------------------------------------
-- 0. FUNÇÕES AUXILIARES OBRIGATÓRIAS (garantir que existem)
-- -----------------------------------------------------------------

-- 0.1 set_updated_at() - usado em triggers de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
grant execute on function public.set_updated_at() to authenticated, anon;

-- 0.2 days_since(timestamptz) - função utilitária de intervalo
--     IMPORTANTE: fazemos drop + create porque o nome do parâmetro difere entre
--     migrações antigas (purchased_at) e esta (p_date). O PostgreSQL não permite
--     renomear parâmetro via CREATE OR REPLACE.
drop function if exists public.days_since(timestamptz);
create function public.days_since(p_date timestamptz default null)
returns integer
language plpgsql
immutable
as $$
begin
  if p_date is null then return 0; end if;
  return greatest(0, extract(day from (now() - p_date))::integer);
end;
$$;
grant execute on function public.days_since(timestamptz) to authenticated, anon;

-- 0.3 get_or_create_wallet(uuid) - garante carteira para um profile_id
create or replace function public.get_or_create_wallet(p_profile_id uuid)
returns uuid
language plpgsql
security definer
as $$
declare
  v_wallet_id uuid;
begin
  select id into v_wallet_id
    from public.wallets w
   where w.profile_id = p_profile_id
   limit 1;

  if v_wallet_id is null then
    insert into public.wallets (profile_id, balance, available_balance, bonus_balance)
    values (p_profile_id, 0, 0, 0)
    returning id into v_wallet_id;
  end if;

  return v_wallet_id;
end;
$$;
comment on function public.get_or_create_wallet(uuid)
  is 'Devolve a carteira do utilizador, criando-a se não existir.';
grant execute on function public.get_or_create_wallet(uuid) to authenticated, anon;

-- -----------------------------------------------------------------
-- 1. Adicionar colunas em user_profiles
--    - invite_code          (código que o utilizador ENTROU, opcional)
--    - referral_code        (código PRÓPRIO gerado automaticamente)
--    - referred_by          (FK do convidador)
-- -----------------------------------------------------------------

alter table public.user_profiles
  add column if not exists invite_code text;
comment on column public.user_profiles.invite_code
  is 'Código de indicação que este utilizador usou ao registar (se houver).';

alter table public.user_profiles
  add column if not exists referral_code text unique;
comment on column public.user_profiles.referral_code
  is 'Código de indicação ÚNICO gerado para este utilizador partilhar.';

alter table public.user_profiles
  add column if not exists referred_by uuid references public.user_profiles(id) on delete set null;
comment on column public.user_profiles.referred_by
  is 'ID do perfil que convidou este utilizador (quem gerou o link/ código usado).';

create index if not exists idx_user_profiles_referral_code on public.user_profiles (referral_code);
create index if not exists idx_user_profiles_referred_by   on public.user_profiles (referred_by);
create index if not exists idx_user_profiles_invite_code    on public.user_profiles (invite_code);

-- Garantir RLS em user_profiles (se já não estiver activo)
alter table public.user_profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'policy_user_profiles_self_select'
  ) then
    create policy policy_user_profiles_self_select on public.user_profiles
      for select using (auth.uid() = auth_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'policy_user_profiles_self_insert'
  ) then
    create policy policy_user_profiles_self_insert on public.user_profiles
      for insert with check (auth.uid() = auth_user_id);
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'user_profiles' and policyname = 'policy_user_profiles_self_update'
  ) then
    create policy policy_user_profiles_self_update on public.user_profiles
      for update using (auth.uid() = auth_user_id) with check (auth.uid() = auth_user_id);
  end if;
end $$;

-- -----------------------------------------------------------------
-- 2. Adicionar saldo de bónus na carteira (separado do saldo normal)
-- -----------------------------------------------------------------
alter table public.wallets
  add column if not exists bonus_balance numeric(14,2) not null default 0;
comment on column public.wallets.bonus_balance
  is 'Saldo de recompensas de indicação (bónus) separado do capital do utilizador.';

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'chk_bonus_balance_nonneg'
  ) then
    alter table public.wallets
      add constraint chk_bonus_balance_nonneg check (bonus_balance >= 0);
  end if;
end $$;

-- Garantir RLS em wallets
alter table public.wallets enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wallets' and policyname = 'policy_wallets_self_select'
  ) then
    create policy policy_wallets_self_select on public.wallets
      for select using (
        auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wallets' and policyname = 'policy_wallets_self_update'
  ) then
    create policy policy_wallets_self_update on public.wallets
      for update using (
        auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'wallets' and policyname = 'policy_wallets_self_insert'
  ) then
    create policy policy_wallets_self_insert on public.wallets
      for insert with check (
        auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;
end $$;

-- -----------------------------------------------------------------
-- 3. Tabela de histórico de recompensas pagas / a receber
-- -----------------------------------------------------------------
create table if not exists public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.user_profiles(id) on delete cascade,
  referred_id uuid not null references public.user_profiles(id) on delete cascade,
  user_investment_id uuid references public.user_investments(id) on delete set null,
  package_id uuid references public.investment_packages(id) on delete set null,
  package_number integer,
  investment_amount numeric(14,2) not null default 0,
  reward_percent numeric(5,2) not null default 10,
  reward_amount numeric(14,2) not null default 0,
  status text not null default 'paid',
  description text,
  paid_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_rr_status check (status in ('pending', 'paid', 'cancelled')),
  constraint chk_rr_amount check (investment_amount >= 0 and reward_amount >= 0),
  constraint uq_rr_investment unique (referred_id, user_investment_id)
);
comment on table public.referral_rewards
  is 'Histórico de recompensas pagas pelo programa de indicações da Zora.';
comment on column public.referral_rewards.package_number
  is 'Número do pacote comprado (N1..N9) para facilitar relatórios e UI.';

create index if not exists idx_rr_referrer_id  on public.referral_rewards (referrer_id);
create index if not exists idx_rr_referred_id  on public.referral_rewards (referred_id);
create index if not exists idx_rr_status       on public.referral_rewards (status);
create index if not exists idx_rr_created_at   on public.referral_rewards (created_at desc);

drop trigger if exists trg_rr_updated_at on public.referral_rewards;
create trigger trg_rr_updated_at
  before update on public.referral_rewards
  for each row execute function public.set_updated_at();

alter table public.referral_rewards enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'referral_rewards' and policyname = 'policy_rr_select_referrer'
  ) then
    create policy policy_rr_select_referrer on public.referral_rewards
      for select using (
        auth.uid() = (select auth_user_id from public.user_profiles where id = referrer_id)
        or auth.uid() = (select auth_user_id from public.user_profiles where id = referred_id)
      );
  end if;
end $$;

-- -----------------------------------------------------------------
-- 4. Função para gerar código de indicação único (8 letras+digitos)
-- -----------------------------------------------------------------
create or replace function public.generate_referral_code(seed_text text default null)
returns text
language plpgsql
security definer
as $$
declare
  v_code text;
  v_exists boolean;
  v_attempts integer := 0;
  v_seed text;
  v_hash bigint;
  v_step bigint;
  v_pos integer;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  v_seed := coalesce(seed_text, gen_random_uuid()::text || to_char(clock_timestamp(), 'US'), 'x');
  loop
    v_attempts := v_attempts + 1;
    if v_attempts > 50 then
      v_code := substring(upper(substr(md5(v_seed || random()::text), 1, 16)) from 1 for 12);
    else
      v_hash := abs(('x' || substr(md5(v_seed || random()::text || v_attempts::text), 1, 14))::bit(56)::bigint);
      v_code := '';
      for i in 1..8 loop
        v_step := ((v_hash >> ((i - 1) * 5)) & 31);
        v_pos := (v_step::integer % 32) + 1;
        v_code := v_code || substr(v_alphabet, v_pos, 1);
      end loop;
    end if;
    select exists(select 1 from public.user_profiles up where up.referral_code = v_code) into v_exists;
    exit when not v_exists;
  end loop;
  return v_code;
end;
$$;
comment on function public.generate_referral_code(text)
  is 'Gera um código de indicação único e humano-amigável para o utilizador.';
grant execute on function public.generate_referral_code(text) to authenticated, anon;

-- -----------------------------------------------------------------
-- 5. Trigger que garante referral_code único ao inserir perfil
--    e resolve o convidador através de invite_code / referred_by
-- -----------------------------------------------------------------
create or replace function public.ensure_referral_code()
returns trigger
language plpgsql
security definer
as $$
declare
  v_inviter_id uuid;
  v_invite_code_raw text;
begin
  if new.referral_code is null or char_length(trim(new.referral_code)) = 0 then
    new.referral_code := public.generate_referral_code(coalesce(new.phone_number, new.full_name));
  end if;

  if new.referred_by is null then
    v_invite_code_raw := coalesce(new.invite_code, '');
    if char_length(trim(v_invite_code_raw)) > 2 then
      select id into v_inviter_id
        from public.user_profiles up
       where up.referral_code = upper(trim(v_invite_code_raw))
          or up.referral_code = trim(v_invite_code_raw)
       limit 1;
      if v_inviter_id is not null and v_inviter_id <> new.id then
        new.referred_by := v_inviter_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function public.ensure_referral_code()
  is 'Antes de inserir user_profiles: gera código único e resolve referred_by a partir de invite_code.';

drop trigger if exists trg_user_profiles_ensure_referral_code on public.user_profiles;
create trigger trg_user_profiles_ensure_referral_code
  before insert on public.user_profiles
  for each row execute function public.ensure_referral_code();

-- Backfill: garantir códigos para perfis já existentes
do $$
declare
  r record;
begin
  for r in select id, phone_number, full_name from public.user_profiles where referral_code is null loop
    update public.user_profiles
       set referral_code = public.generate_referral_code(coalesce(r.phone_number, r.full_name))
     where id = r.id;
  end loop;
end $$;

-- Backfill: resolver referred_by a partir de invite_code para perfis antigos
do $$
declare
  r record;
  v_inviter uuid;
begin
  for r in
    select up.id, up.invite_code, up.referred_by
      from public.user_profiles up
     where up.referred_by is null
       and up.invite_code is not null
       and char_length(trim(up.invite_code)) > 2
  loop
    select id into v_inviter
      from public.user_profiles up
     where up.referral_code = upper(trim(r.invite_code))
        or up.referral_code = trim(r.invite_code)
     limit 1;
    if v_inviter is not null and v_inviter <> r.id then
      update public.user_profiles up
         set referred_by = v_inviter
       where up.id = r.id;
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------
-- 6. RPC: Resumo de indicações do utilizador autenticado
-- -----------------------------------------------------------------
create or replace function public.get_referral_summary()
returns table (
  referral_code text,
  invite_link text,
  total_invited integer,
  active_invited integer,
  total_packages_purchased integer,
  total_reward_earned numeric(14,2),
  total_reward_paid numeric(14,2),
  pending_reward numeric(14,2),
  bonus_balance numeric(14,2),
  total_invested_by_invited numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_code text;
  v_link text;
  v_host text := 'zora.app';
begin
  select id, up.referral_code into v_profile_id, v_code
    from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;

  if v_profile_id is null then
    return next; return;
  end if;

  if v_code is null then
    v_code := public.generate_referral_code();
    update public.user_profiles up set referral_code = v_code where up.id = v_profile_id;
  end if;

  v_link := 'https://' || v_host || '/invite/' || v_code;

  return query
    select
      v_code::text,
      v_link::text,
      (select count(1) from public.user_profiles up2 where up2.referred_by = v_profile_id)::integer,
      (select count(distinct up2.id) from public.user_profiles up2
        join public.user_investments ui on ui.user_id = up2.id
       where up2.referred_by = v_profile_id and ui.status = 'active')::integer,
      (select count(1) from public.referral_rewards rr where rr.referrer_id = v_profile_id)::integer,
      coalesce((select sum(rr.reward_amount) from public.referral_rewards rr where rr.referrer_id = v_profile_id), 0)::numeric(14,2),
      coalesce((select sum(rr.reward_amount) from public.referral_rewards rr where rr.referrer_id = v_profile_id and rr.status = 'paid'), 0)::numeric(14,2),
      coalesce((select sum(rr.reward_amount) from public.referral_rewards rr where rr.referrer_id = v_profile_id and rr.status = 'pending'), 0)::numeric(14,2),
      coalesce((select w.bonus_balance from public.wallets w where w.profile_id = v_profile_id), 0)::numeric(14,2),
      coalesce((select sum(rr.investment_amount) from public.referral_rewards rr where rr.referrer_id = v_profile_id), 0)::numeric(14,2);
end;
$$;
comment on function public.get_referral_summary()
  is 'Retorna estatísticas completas de indicações do utilizador actual.';
grant execute on function public.get_referral_summary() to authenticated;

-- -----------------------------------------------------------------
-- 7. RPC: Histórico detalhado de recompensas
-- -----------------------------------------------------------------
create or replace function public.get_referral_history()
returns table (
  reward_id uuid,
  package_number integer,
  package_name text,
  investment_amount numeric(14,2),
  reward_percent numeric(5,2),
  reward_amount numeric(14,2),
  status text,
  paid_at timestamp with time zone,
  invited_name text,
  invited_phone text
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
begin
  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then return; end if;

  return query
    select
      rr.id,
      coalesce(rr.package_number, ip.package_number),
      coalesce(ip.name, ('N' || coalesce(rr.package_number, 0) || ' - Pacote')),
      rr.investment_amount,
      rr.reward_percent,
      rr.reward_amount,
      rr.status,
      rr.paid_at,
      coalesce(up2.full_name, 'Utilizador'),
      coalesce(up2.phone_number, '-')
    from public.referral_rewards rr
    left join public.user_profiles up2 on up2.id = rr.referred_id
    left join public.investment_packages ip on ip.id = rr.package_id
    where rr.referrer_id = v_profile_id
    order by rr.created_at desc;
end;
$$;
comment on function public.get_referral_history()
  is 'Lista detalhada de recompensas de indicação recebidas.';
grant execute on function public.get_referral_history() to authenticated;

-- -----------------------------------------------------------------
-- 8. RPC: Resgatar bónus (mover bonus_balance para available_balance)
-- -----------------------------------------------------------------
create or replace function public.withdraw_bonus(p_amount numeric default null)
returns table (
  success boolean,
  message text,
  withdrawn_amount numeric(14,2),
  new_available numeric(14,2),
  new_bonus numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_wallet_id uuid;
  v_bonus numeric(14,2);
  v_available numeric(14,2);
  v_amount numeric(14,2);
begin
  success := false; message := 'Operação inválida';
  withdrawn_amount := 0; new_available := 0; new_bonus := 0;

  if v_auth_user_id is null then
    message := 'Utilizador não autenticado'; return next; return;
  end if;

  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then
    message := 'Perfil não encontrado'; return next; return;
  end if;

  v_wallet_id := public.get_or_create_wallet(v_profile_id);

  select w.bonus_balance, w.available_balance
    into v_bonus, v_available
    from public.wallets w where w.id = v_wallet_id for update;

  v_bonus := coalesce(v_bonus, 0);
  v_amount := coalesce(p_amount, v_bonus);

  if v_bonus <= 0 then
    message := 'Não tem bónus para resgatar.'; return next; return;
  end if;

  if v_amount > v_bonus then v_amount := v_bonus; end if;
  if v_amount <= 0 then
    message := 'Valor a resgatar inválido.'; return next; return;
  end if;

  update public.wallets w
     set bonus_balance = (bonus_balance - v_amount),
         available_balance = (available_balance + v_amount),
         updated_at = now()
   where w.id = v_wallet_id;

  insert into public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at
  ) values (
    v_profile_id, v_wallet_id, 'profit', 'credit', v_amount,
    coalesce(v_available, 0), coalesce(v_available, 0) + v_amount,
    'Resgate de bónus de indicação no valor de ' || to_char(v_amount, 'FM999G999G990D00') || ' MZN',
    'completed', now()
  );

  select w.available_balance, w.bonus_balance
    into new_available, new_bonus
    from public.wallets w where w.id = v_wallet_id;

  success := true;
  withdrawn_amount := v_amount;
  message := 'Bónus resgatado para o saldo disponível com sucesso.';
  return next;
end;
$$;
comment on function public.withdraw_bonus(numeric)
  is 'Move o saldo de bónus de indicação para o saldo disponível da carteira.';
grant execute on function public.withdraw_bonus(numeric) to authenticated;

-- -----------------------------------------------------------------
-- 9. MODIFICAR purchase_investment_package:
--    - Atribuir 10% ao convidador como bonus_balance
--    - Registar linha em referral_rewards
-- -----------------------------------------------------------------
create or replace function public.purchase_investment_package(
  p_package_id uuid,
  p_amount numeric(14,2)
)
returns table (
  success boolean,
  message text,
  user_investment_id uuid,
  new_balance numeric(14,2),
  new_available_balance numeric(14,2),
  referral_bonus_paid numeric(14,2),
  referral_paid_to uuid
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
  v_referrer_id uuid;
  v_referrer_wallet_id uuid;
  v_bonus_pct numeric(5,2) := 10;
  v_bonus numeric(14,2);
begin
  success := false;
  message := 'Operação inválida';
  user_investment_id := null;
  new_balance := 0;
  new_available_balance := 0;
  referral_bonus_paid := 0;
  referral_paid_to := null;

  if v_auth_user_id is null then
    message := 'Utilizador não autenticado'; return next; return;
  end if;

  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then
    message := 'Perfil do utilizador não encontrado'; return next; return;
  end if;

  select * into v_package from public.investment_packages ip where ip.id = p_package_id and ip.is_active = true limit 1;
  if v_package is null then
    message := 'Pacote de investimento indisponível'; return next; return;
  end if;

  v_min_investment := coalesce(v_package.minimum_investment, 300);
  if p_amount is null or p_amount < v_min_investment then
    message := 'Valor inferior ao mínimo do pacote (' || v_min_investment::text || ' MZN)'; return next; return;
  end if;
  if p_amount <= 0 then
    message := 'Valor de investimento inválido'; return next; return;
  end if;

  v_wallet_id := public.get_or_create_wallet(v_profile_id);

  select w.balance, w.available_balance
    into v_current_balance, v_current_available
    from public.wallets w where w.id = v_wallet_id for update;

  if v_current_available is null then v_current_available := 0; end if;
  if v_current_balance is null then v_current_balance := 0; end if;

  if v_current_available < p_amount then
    success := false;
    message := 'Saldo insuficiente. Disponível: ' || to_char(v_current_available, 'FM999G999G990D00') || ' MZN';
    return next; return;
  end if;

  update public.wallets w
     set balance = (w.balance - p_amount),
         available_balance = (w.available_balance - p_amount),
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
    v_current_available, (v_current_available - p_amount),
    'Compra do pacote ' || coalesce(v_package.name, 'Investimento') || ' no valor de ' || to_char(p_amount, 'FM999G999G990D00') || ' MZN',
    'completed', now()
  );

  -- ========== PROGRAMA DE INDICAÇÕES: 10% de bónus ao convidador ==========
  v_bonus := round((p_amount * v_bonus_pct / 100.0) * 100) / 100;
  v_bonus := coalesce(v_bonus, 0);

  if v_bonus > 0 then
    select up.referred_by into v_referrer_id
      from public.user_profiles up where up.id = v_profile_id limit 1;

    if v_referrer_id is not null and v_referrer_id <> v_profile_id then
      v_referrer_wallet_id := public.get_or_create_wallet(v_referrer_id);

      update public.wallets w
         set bonus_balance = coalesce(w.bonus_balance, 0) + v_bonus,
             updated_at = now()
       where w.id = v_referrer_wallet_id;

      insert into public.referral_rewards (
        referrer_id, referred_id, user_investment_id, package_id,
        package_number, investment_amount, reward_percent, reward_amount,
        status, description, paid_at
      ) values (
        v_referrer_id, v_profile_id, v_investment_id, p_package_id,
        v_package.package_number, p_amount, v_bonus_pct, v_bonus,
        'paid',
        'Bónus de indicação (10%): Compra do ' || coalesce(v_package.name, 'Pacote')
          || ' no valor de ' || to_char(p_amount, 'FM999G999G990D00') || ' MZN',
        now()
      );

      insert into public.transactions (
        profile_id, wallet_id, user_investment_id,
        transaction_type, direction, amount,
        description, status, processed_at, reference
      ) values (
        v_referrer_id, v_referrer_wallet_id, null,
        'profit', 'credit', v_bonus,
        'Bónus de indicação (10%) de ' || to_char(p_amount, 'FM999G999G990D00') || ' MZN',
        'completed', now(),
        'ref:' || v_investment_id::text
      );

      referral_bonus_paid := v_bonus;
      referral_paid_to := v_referrer_id;
    end if;
  end if;

  select w.balance, w.available_balance
    into new_balance, new_available_balance
    from public.wallets w where w.id = v_wallet_id;

  success := true;
  user_investment_id := v_investment_id;
  message := case
    when referral_bonus_paid > 0 then
      'Investimento realizado com sucesso. O seu convidador recebeu ' || to_char(referral_bonus_paid, 'FM999G999G990D00') || ' MZN de bónus.'
    else
      'Investimento realizado com sucesso.'
    end;
  return next;
end;
$$;
comment on function public.purchase_investment_package(uuid, numeric)
  is 'Compra transaccional de pacote. Paga 10% de bónus ao convidador (referred_by) em bonus_balance.';
grant execute on function public.purchase_investment_package(uuid, numeric) to authenticated;

-- -----------------------------------------------------------------
-- FINAL: Garantir RLS e permissões básicas
-- -----------------------------------------------------------------
grant select, insert, update on public.referral_rewards to authenticated;

grant execute on function public.get_or_create_wallet(uuid) to authenticated, anon;
grant execute on function public.days_since(timestamptz) to authenticated;
grant execute on function public.set_updated_at() to authenticated, anon;

-- =================================================================
-- FIM: SISTEMA DE RECOMPENSAS ZORA (REFERRALS)
-- =================================================================
