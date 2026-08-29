-- =================================================================
-- ZORA - ADMIN: DEPÓSITOS, SAQUES, GESTÃO DE UTILIZADORES
-- Migração idempotente - executar múltiplas vezes não destrói dados
-- =================================================================

-- -----------------------------------------------------------------
-- 1. ROLE DE ADMIN
--    - Coluna is_admin em user_profiles (definida manualmente via SQL)
--    - Função helper: is_current_admin() usada em policies e RPCS
-- -----------------------------------------------------------------

alter table public.user_profiles
  add column if not exists is_admin boolean not null default false;
comment on column public.user_profiles.is_admin
  is 'Indica se o utilizador tem privilégios administrativos no painel de controlo.';

create or replace function public.is_current_admin()
returns boolean
language plpgsql
stable
security definer
as $$
declare
  v_admin boolean;
begin
  if auth.uid() is null then return false; end if;
  select coalesce(is_admin, false) into v_admin
    from public.user_profiles up
   where up.auth_user_id = auth.uid()
   limit 1;
  return coalesce(v_admin, false);
end;
$$;
comment on function public.is_current_admin()
  is 'Devolve true se o utilizador autenticado for administrador.';
grant execute on function public.is_current_admin() to authenticated, anon;

-- -----------------------------------------------------------------
-- 2. TABELA DEPEDÓSITOS (reloads / recargas)
--    Estado: pending -> approved | rejected
--    Quando approved -> valor creditado na carteira available_balance
-- -----------------------------------------------------------------
create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  amount numeric(14,2) not null,
  payment_method text not null default 'mpesa',
  proof_reference text,
  contact text,
  status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_deposit_amount check (amount > 0),
  constraint chk_deposit_status check (status in ('pending','approved','rejected','cancelled'))
);
comment on table public.deposits
  is 'Pedidos de depósito / recarga na carteira Zora. Aprovação manual por admin.';

create index if not exists idx_deposits_profile_id on public.deposits (profile_id);
create index if not exists idx_deposits_status    on public.deposits (status);
create index if not exists idx_deposits_created_at on public.deposits (created_at desc);

drop trigger if exists trg_deposits_updated_at on public.deposits;
create trigger trg_deposits_updated_at
  before update on public.deposits
  for each row execute function public.set_updated_at();

alter table public.deposits enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'deposits' and policyname = 'policy_deposits_user_select'
  ) then
    create policy policy_deposits_user_select on public.deposits
      for select using (
        public.is_current_admin()
        or auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'deposits' and policyname = 'policy_deposits_user_insert'
  ) then
    create policy policy_deposits_user_insert on public.deposits
      for insert with check (
        auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'deposits' and policyname = 'policy_deposits_admin_update'
  ) then
    create policy policy_deposits_admin_update on public.deposits
      for update using (public.is_current_admin()) with check (public.is_current_admin());
  end if;
end $$;

grant select, insert, update on public.deposits to authenticated;

-- -----------------------------------------------------------------
-- 3. TABELA SAQUES (withdrawals)
--    Estado: pending -> approved | rejected
--    - Ao criar pending: valor + taxa debitados de available_balance
--      para confirmed_balance (bloqueado)
--    - Se approved -> confirmed_balance é definitivamente retirado
--    - Se rejected -> valor volta para available_balance
-- -----------------------------------------------------------------
alter table public.wallets
  add column if not exists pending_withdrawals numeric(14,2) not null default 0;
comment on column public.wallets.pending_withdrawals
  is 'Valor bloqueado aguardando aprovação de saques pendentes.';

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.user_profiles(id) on delete cascade,
  wallet_id uuid references public.wallets(id) on delete set null,
  amount numeric(14,2) not null,
  fee numeric(14,2) not null default 0,
  total_deducted numeric(14,2) not null default 0,
  withdrawal_method text not null default 'mpesa',
  contact text not null,
  status text not null default 'pending',
  admin_notes text,
  reviewed_by uuid references public.user_profiles(id) on delete set null,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint chk_withdrawal_amount check (amount > 0),
  constraint chk_withdrawal_fee check (fee >= 0),
  constraint chk_withdrawal_status check (status in ('pending','approved','rejected','cancelled','paid'))
);
comment on table public.withdrawals
  is 'Pedidos de saque da carteira Zora. Requerem aprovação manual do admin.';

create index if not exists idx_withdrawals_profile_id on public.withdrawals (profile_id);
create index if not exists idx_withdrawals_status    on public.withdrawals (status);
create index if not exists idx_withdrawals_created_at on public.withdrawals (created_at desc);

drop trigger if exists trg_withdrawals_updated_at on public.withdrawals;
create trigger trg_withdrawals_updated_at
  before update on public.withdrawals
  for each row execute function public.set_updated_at();

alter table public.withdrawals enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'withdrawals' and policyname = 'policy_withdrawals_user_select'
  ) then
    create policy policy_withdrawals_user_select on public.withdrawals
      for select using (
        public.is_current_admin()
        or auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'withdrawals' and policyname = 'policy_withdrawals_user_insert'
  ) then
    create policy policy_withdrawals_user_insert on public.withdrawals
      for insert with check (
        auth.uid() = (select auth_user_id from public.user_profiles where id = profile_id)
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'withdrawals' and policyname = 'policy_withdrawals_admin_update'
  ) then
    create policy policy_withdrawals_admin_update on public.withdrawals
      for update using (public.is_current_admin()) with check (public.is_current_admin());
  end if;
end $$;

grant select, insert, update on public.withdrawals to authenticated;

-- -----------------------------------------------------------------
-- 4. RPC: UTILIZADOR CRIA PEDIDO DE DEPÓSITO (reload)
-- -----------------------------------------------------------------
create or replace function public.create_deposit_request(
  p_amount numeric,
  p_payment_method text default 'mpesa',
  p_contact text default null,
  p_proof_reference text default null
)
returns table (
  success boolean,
  message text,
  deposit_id uuid,
  amount numeric(14,2),
  status text
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_wallet_id uuid;
begin
  success := false; message := '';
  if v_auth_user_id is null then
    message := 'Utilizador não autenticado'; return next; return;
  end if;
  if p_amount <= 0 then
    message := 'Valor de depósito inválido.'; return next; return;
  end if;

  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then
    message := 'Perfil não encontrado.'; return next; return;
  end if;

  v_wallet_id := public.get_or_create_wallet(v_profile_id);

  insert into public.deposits (
    profile_id, wallet_id, amount, payment_method, contact, proof_reference, status
  ) values (
    v_profile_id, v_wallet_id, p_amount,
    coalesce(nullif(p_payment_method, ''), 'mpesa'),
    p_contact,
    p_proof_reference,
    'pending'
  ) returning id into deposit_id;

  success := true;
  status := 'pending';
  amount := p_amount;
  message := 'Pedido de depósito criado. Aguarde aprovação do administrador.';
  return next;
end;
$$;
comment on function public.create_deposit_request(numeric,text,text,text)
  is 'Utilizador cria um pedido de depósito/recarga pendente de aprovação.';
grant execute on function public.create_deposit_request(numeric,text,text,text) to authenticated;

-- -----------------------------------------------------------------
-- 5. RPC: UTILIZADOR CRIA PEDIDO DE SAQUE (com desconto de taxa)
--    - Ao criar em pending: retira (amount + fee) de available_balance
--      e coloca em pending_withdrawals (bloqueado)
-- -----------------------------------------------------------------
create or replace function public.create_withdrawal_request(
  p_amount numeric,
  p_withdrawal_method text default 'mpesa',
  p_contact text default null,
  p_fee numeric default null
)
returns table (
  success boolean,
  message text,
  withdrawal_id uuid,
  amount numeric(14,2),
  fee numeric(14,2),
  total_deducted numeric(14,2),
  status text
)
language plpgsql
security definer
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_wallet_id uuid;
  v_available numeric(14,2);
  v_balance numeric(14,2);
  v_fee numeric(14,2);
  v_total numeric(14,2);
begin
  success := false; message := '';
  if v_auth_user_id is null then
    message := 'Utilizador não autenticado'; return next; return;
  end if;
  if p_amount <= 0 then
    message := 'Valor de saque inválido.'; return next; return;
  end if;
  if p_contact is null or char_length(trim(p_contact)) < 6 then
    message := 'Indique o contacto para receber o saque.'; return next; return;
  end if;

  select id into v_profile_id from public.user_profiles up where up.auth_user_id = v_auth_user_id limit 1;
  if v_profile_id is null then
    message := 'Perfil não encontrado.'; return next; return;
  end if;

  v_wallet_id := public.get_or_create_wallet(v_profile_id);

  select w.available_balance, w.balance
    into v_available, v_balance
    from public.wallets w where w.id = v_wallet_id for update;

  v_available := coalesce(v_available, 0);
  v_balance := coalesce(v_balance, 0);

  if p_fee is not null and p_fee >= 0 then
    v_fee := p_fee;
  else
    v_fee := greatest(round(p_amount * 0.01 * 100) / 100, 50);
  end if;

  v_total := round((p_amount + v_fee) * 100) / 100;
  if v_total > v_available then
    message := 'Saldo disponível insuficiente para o valor do saque + taxa.'; return next; return;
  end if;

  update public.wallets w
     set available_balance = (v_available - v_total),
         balance = (v_balance - v_total),
         pending_withdrawals = coalesce(pending_withdrawals, 0) + v_total,
         updated_at = now()
   where w.id = v_wallet_id;

  insert into public.withdrawals (
    profile_id, wallet_id, amount, fee, total_deducted,
    withdrawal_method, contact, status
  ) values (
    v_profile_id, v_wallet_id, p_amount, v_fee, v_total,
    coalesce(nullif(p_withdrawal_method, ''), 'mpesa'),
    p_contact, 'pending'
  ) returning id into withdrawal_id;

  insert into public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, reference
  ) values (
    v_profile_id, v_wallet_id, 'withdrawal', 'debit', v_total,
    v_available, (v_available - v_total),
    'Solicitação de saque no valor ' || to_char(p_amount, 'FM999G999G990D00')
      || ' MZN (taxa ' || to_char(v_fee, 'FM999G999G990D00') || ' MZN) - AGUARDA APROVAÇÃO',
    'pending', now(), 'wd:' || (withdrawal_id)::text
  );

  success := true;
  status := 'pending';
  amount := p_amount;
  fee := v_fee;
  total_deducted := v_total;
  message := 'Pedido de saque criado. Aguarde aprovação do administrador.';
  return next;
end;
$$;
comment on function public.create_withdrawal_request(numeric,text,text,numeric)
  is 'Cria saque pendente e bloqueia (amount + fee) no available_balance.';
grant execute on function public.create_withdrawal_request(numeric,text,text,numeric) to authenticated;

-- -----------------------------------------------------------------
-- 6. RPC: ADMIN - APROVAR DEPÓSITO -> creditar available_balance
-- -----------------------------------------------------------------
create or replace function public.admin_approve_deposit(
  p_deposit_id uuid,
  p_admin_notes text default null
)
returns table (
  success boolean,
  message text,
  deposit_id uuid,
  new_available numeric(14,2),
  new_balance numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_admin_id uuid;
  v_admin_profile uuid;
  v_row public.deposits%rowtype;
  v_new_avail numeric(14,2);
  v_new_bal numeric(14,2);
begin
  success := false; message := '';
  if not public.is_current_admin() then
    message := 'Privilégios de administrador necessários.'; return next; return;
  end if;
  v_admin_id := auth.uid();
  select id into v_admin_profile from public.user_profiles up where up.auth_user_id = v_admin_id limit 1;

  select * into v_row from public.deposits d where d.id = p_deposit_id for update;
  if v_row.id is null then
    message := 'Depósito não encontrado.'; return next; return;
  end if;
  if v_row.status <> 'pending' then
    message := 'Depósito já se encontra ' || upper(v_row.status) || '.'; return next; return;
  end if;

  v_row.wallet_id := coalesce(v_row.wallet_id, public.get_or_create_wallet(v_row.profile_id));

  select (coalesce(w.available_balance,0) + v_row.amount)::numeric(14,2),
         (coalesce(w.balance,0) + v_row.amount)::numeric(14,2)
    into v_new_avail, v_new_bal
    from public.wallets w where w.id = v_row.wallet_id for update;

  update public.wallets w
     set available_balance = v_new_avail,
         balance = v_new_bal,
         updated_at = now()
   where w.id = v_row.wallet_id;

  update public.deposits d
     set status = 'approved',
         reviewed_at = now(),
         reviewed_by = v_admin_profile,
         wallet_id = v_row.wallet_id,
         admin_notes = p_admin_notes
   where d.id = v_row.id;

  insert into public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, reference
  ) values (
    v_row.profile_id, v_row.wallet_id, 'deposit', 'credit', v_row.amount,
    (v_new_avail - v_row.amount), v_new_avail,
    'Depósito aprovado via ' || coalesce(v_row.payment_method,'pagamento')
      || ' no valor ' || to_char(v_row.amount, 'FM999G999G990D00') || ' MZN.',
    'completed', now(), 'dep:' || v_row.id::text
  );

  success := true;
  admin_approve_deposit.deposit_id := v_row.id;
  new_available := v_new_avail;
  new_balance := v_new_bal;
  message := 'Depósito aprovado e valor creditado na carteira do utilizador.';
  return next;
end;
$$;
comment on function public.admin_approve_deposit(uuid,text)
  is 'ADMIN: aprova depósito e credita valor em available_balance.';
grant execute on function public.admin_approve_deposit(uuid,text) to authenticated;

-- -----------------------------------------------------------------
-- 7. RPC: ADMIN - REJEITAR DEPÓSITO (sem alterar saldo)
-- -----------------------------------------------------------------
create or replace function public.admin_reject_deposit(
  p_deposit_id uuid,
  p_admin_notes text default null
)
returns table (
  success boolean,
  message text,
  deposit_id uuid
)
language plpgsql
security definer
as $$
declare
  v_admin_profile uuid;
  v_row public.deposits%rowtype;
begin
  success := false; message := '';
  if not public.is_current_admin() then
    message := 'Privilégios de administrador necessários.'; return next; return;
  end if;
  select id into v_admin_profile from public.user_profiles up where up.auth_user_id = auth.uid() limit 1;

  select * into v_row from public.deposits d where d.id = p_deposit_id for update;
  if v_row.id is null then
    message := 'Depósito não encontrado.'; return next; return;
  end if;
  if v_row.status <> 'pending' then
    message := 'Depósito já se encontra ' || upper(v_row.status) || '.'; return next; return;
  end if;

  update public.deposits d
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = v_admin_profile,
         admin_notes = p_admin_notes
   where d.id = v_row.id;

  success := true;
  admin_reject_deposit.deposit_id := v_row.id;
  message := 'Depósito rejeitado.';
  return next;
end;
$$;
comment on function public.admin_reject_deposit(uuid,text)
  is 'ADMIN: rejeita um pedido de depósito pendente.';
grant execute on function public.admin_reject_deposit(uuid,text) to authenticated;

-- -----------------------------------------------------------------
-- 8. RPC: ADMIN - APROVAR SAQUE (valor descontado definitivamente)
--    - pending_withdrawals(total_deducted) é removido
--      available/balance não toca (já foi debitado no create)
-- -----------------------------------------------------------------
create or replace function public.admin_approve_withdrawal(
  p_withdrawal_id uuid,
  p_admin_notes text default null
)
returns table (
  success boolean,
  message text,
  withdrawal_id uuid
)
language plpgsql
security definer
as $$
declare
  v_admin_profile uuid;
  v_row public.withdrawals%rowtype;
  v_new_pending numeric(14,2);
  v_trans_id uuid;
begin
  success := false; message := '';
  if not public.is_current_admin() then
    message := 'Privilégios de administrador necessários.'; return next; return;
  end if;
  select id into v_admin_profile from public.user_profiles up where up.auth_user_id = auth.uid() limit 1;

  select * into v_row from public.withdrawals w where w.id = p_withdrawal_id for update;
  if v_row.id is null then
    message := 'Saque não encontrado.'; return next; return;
  end if;
  if v_row.status <> 'pending' then
    message := 'Saque já se encontra ' || upper(v_row.status) || '.'; return next; return;
  end if;

  update public.wallets wl
     set pending_withdrawals = greatest(coalesce(wl.pending_withdrawals, 0) - v_row.total_deducted, 0),
         updated_at = now()
   where wl.id = v_row.wallet_id
   returning greatest(coalesce(pending_withdrawals,0) - v_row.total_deducted, 0) into v_new_pending;

  update public.withdrawals w
     set status = 'approved',
         reviewed_at = now(),
         reviewed_by = v_admin_profile,
         admin_notes = p_admin_notes
   where w.id = v_row.id;

  update public.transactions t
     set status = 'completed',
         description = 'Saque aprovado: ' || to_char(v_row.amount, 'FM999G999G990D00')
           || ' MZN via ' || coalesce(v_row.withdrawal_method,'-')
           || ' (contacto: ' || coalesce(v_row.contact,'-') || '). '
           || 'Taxa: ' || to_char(v_row.fee, 'FM999G999G990D00') || ' MZN.',
         processed_at = now()
   where t.reference = ('wd:' || v_row.id::text) and t.status = 'pending'
   returning id into v_trans_id;

  if v_trans_id is null then
    insert into public.transactions (
      profile_id, wallet_id, transaction_type, direction, amount,
      description, status, processed_at, reference
    ) values (
      v_row.profile_id, v_row.wallet_id, 'withdrawal', 'debit', v_row.total_deducted,
      'Saque aprovado ' || to_char(v_row.amount, 'FM999G999G990D00') || ' MZN.',
      'completed', now(), 'wd:' || v_row.id::text
    );
  end if;

  success := true;
  admin_approve_withdrawal.withdrawal_id := v_row.id;
  message := 'Saque aprovado. O valor encontra-se processado no pagamento externo.';
  return next;
end;
$$;
comment on function public.admin_approve_withdrawal(uuid,text)
  is 'ADMIN: aprova saque. (valor+taxa já debitados; desbloqueia pending_withdrawals)';
grant execute on function public.admin_approve_withdrawal(uuid,text) to authenticated;

-- -----------------------------------------------------------------
-- 9. RPC: ADMIN - REJEITAR SAQUE -> VALOR VOLTA PARA SALDO
--    - total_deducted volta para available_balance + balance
--    - pending_withdrawals é decrementado
-- -----------------------------------------------------------------
create or replace function public.admin_reject_withdrawal(
  p_withdrawal_id uuid,
  p_admin_notes text default null
)
returns table (
  success boolean,
  message text,
  withdrawal_id uuid,
  refunded numeric(14,2),
  new_available numeric(14,2),
  new_balance numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_admin_profile uuid;
  v_row public.withdrawals%rowtype;
  v_wallet_id uuid;
  v_avail_before numeric(14,2);
  v_bal_before numeric(14,2);
  v_avail_after numeric(14,2);
  v_bal_after numeric(14,2);
begin
  success := false; message := '';
  if not public.is_current_admin() then
    message := 'Privilégios de administrador necessários.'; return next; return;
  end if;
  select id into v_admin_profile from public.user_profiles up where up.auth_user_id = auth.uid() limit 1;

  select * into v_row from public.withdrawals w where w.id = p_withdrawal_id for update;
  if v_row.id is null then
    message := 'Saque não encontrado.'; return next; return;
  end if;
  if v_row.status <> 'pending' then
    message := 'Saque já se encontra ' || upper(v_row.status) || '.'; return next; return;
  end if;

  v_wallet_id := coalesce(v_row.wallet_id, public.get_or_create_wallet(v_row.profile_id));

  select coalesce(w.available_balance, 0), coalesce(w.balance, 0)
    into v_avail_before, v_bal_before
    from public.wallets w where w.id = v_wallet_id for update;

  v_avail_after := v_avail_before + v_row.total_deducted;
  v_bal_after   := v_bal_before   + v_row.total_deducted;

  update public.wallets w
     set available_balance = v_avail_after,
         balance = v_bal_after,
         pending_withdrawals = greatest(coalesce(w.pending_withdrawals,0) - v_row.total_deducted, 0),
         updated_at = now()
   where w.id = v_wallet_id;

  update public.withdrawals w
     set status = 'rejected',
         reviewed_at = now(),
         reviewed_by = v_admin_profile,
         admin_notes = p_admin_notes
   where w.id = v_row.id;

  delete from public.transactions t
   where t.reference = ('wd:' || v_row.id::text) and t.status = 'pending';

  insert into public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, reference
  ) values (
    v_row.profile_id, v_wallet_id, 'withdrawal', 'credit', v_row.total_deducted,
    v_avail_before, v_avail_after,
    'Saque REJEITADO: valor devolvido ao saldo disponível ('
      || to_char(v_row.total_deducted, 'FM999G999G990D00') || ' MZN).',
    'completed', now(), 'wd-reject:' || v_row.id::text
  );

  success := true;
  admin_reject_withdrawal.withdrawal_id := v_row.id;
  refunded := v_row.total_deducted;
  new_available := v_avail_after;
  new_balance := v_bal_after;
  message := 'Saque rejeitado. O valor + taxa foi devolvido ao saldo disponível do utilizador.';
  return next;
end;
$$;
comment on function public.admin_reject_withdrawal(uuid,text)
  is 'ADMIN: rejeita saque e devolve (amount+taxa) para available_balance.';
grant execute on function public.admin_reject_withdrawal(uuid,text) to authenticated;

-- -----------------------------------------------------------------
-- 10. RPC: ADMIN - AJUSTAR SALDO MANUALMENTE (add/subtract)
-- -----------------------------------------------------------------
create or replace function public.admin_adjust_wallet(
  p_profile_id uuid,
  p_amount numeric,
  p_available_only boolean default true,
  p_description text default null
)
returns table (
  success boolean,
  message text,
  profile_id uuid,
  old_available numeric(14,2),
  new_available numeric(14,2),
  old_balance numeric(14,2),
  new_balance numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_auth uuid := auth.uid();
  v_admin_profile uuid;
  v_wallet_id uuid;
  v_avail_before numeric(14,2);
  v_avail_after numeric(14,2);
  v_bal_before numeric(14,2);
  v_bal_after numeric(14,2);
  v_dir text;
  v_sign integer;
begin
  success := false; message := '';
  admin_adjust_wallet.profile_id := p_profile_id;

  if not public.is_current_admin() then
    message := 'Privilégios de administrador necessários.'; return next; return;
  end if;
  if p_amount = 0 then
    message := 'Valor de ajuste inválido (zero).'; return next; return;
  end if;

  select id into v_admin_profile from public.user_profiles up where up.auth_user_id = v_auth limit 1;
  v_wallet_id := public.get_or_create_wallet(p_profile_id);

  select coalesce(w.available_balance,0), coalesce(w.balance,0)
    into v_avail_before, v_bal_before
    from public.wallets w where w.id = v_wallet_id for update;

  v_avail_after := v_avail_before + p_amount;
  if p_available_only then
    v_bal_after := v_bal_before + p_amount;
  else
    v_bal_after := v_bal_before + p_amount;
  end if;

  if v_avail_after < 0 or v_bal_after < 0 then
    message := 'O ajuste deixaria um saldo negativo. Operação cancelada.'; return next; return;
  end if;

  update public.wallets w
     set available_balance = v_avail_after,
         balance = v_bal_after,
         updated_at = now()
   where w.id = v_wallet_id;

  v_sign := case when p_amount >= 0 then 1 else -1 end;
  v_dir  := case when v_sign >= 0 then 'credit' else 'debit' end;

  insert into public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, reference
  ) values (
    p_profile_id, v_wallet_id,
    case when v_sign >= 0 then 'adjustment_credit' else 'adjustment_debit' end,
    v_dir, abs(p_amount),
    v_avail_before, v_avail_after,
    coalesce(nullif(p_description,''),
      'Ajuste manual de saldo por administrador (' || (case when v_sign>=0 then '+' else '-' end)
        || to_char(abs(p_amount), 'FM999G999G990D00') || ' MZN).'),
    'completed', now(),
    'adj:' || coalesce(v_admin_profile::text, 'admin')
  );

  success := true;
  old_available := v_avail_before;
  new_available := v_avail_after;
  old_balance   := v_bal_before;
  new_balance   := v_bal_after;
  message := 'Saldo ajustado com sucesso.';
  return next;
end;
$$;
comment on function public.admin_adjust_wallet(uuid,numeric,boolean,text)
  is 'ADMIN: ajuste manual de saldo na carteira do utilizador.';
grant execute on function public.admin_adjust_wallet(uuid,numeric,boolean,text) to authenticated;

-- -----------------------------------------------------------------
-- 11. RPC: ADMIN - STATS GERAIS DO PAINEL
-- -----------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns table (
  total_users integer,
  verified_users integer,
  total_deposits_count integer,
  pending_deposits_count integer,
  total_deposits_value numeric(14,2),
  pending_deposits_value numeric(14,2),
  total_withdrawals_count integer,
  pending_withdrawals_count integer,
  total_withdrawals_value numeric(14,2),
  pending_withdrawals_value numeric(14,2),
  total_balance numeric(14,2),
  total_available numeric(14,2),
  total_bonus numeric(14,2),
  total_invested numeric(14,2),
  active_investments integer,
  total_savings_applications integer,
  active_savings_value numeric(14,2)
)
language plpgsql
security definer
as $$
begin
  if not public.is_current_admin() then
    total_users := 0; verified_users := 0;
    total_deposits_count := 0; pending_deposits_count := 0;
    total_deposits_value := 0; pending_deposits_value := 0;
    total_withdrawals_count := 0; pending_withdrawals_count := 0;
    total_withdrawals_value := 0; pending_withdrawals_value := 0;
    total_balance := 0; total_available := 0; total_bonus := 0;
    total_invested := 0; active_investments := 0;
    total_savings_applications := 0; active_savings_value := 0;
    return next; return;
  end if;

  return query
    select
      (select count(1)::integer from public.user_profiles)::integer,
      (select count(1)::integer from public.user_profiles where is_verified = true)::integer,
      (select count(1)::integer from public.deposits)::integer,
      (select count(1)::integer from public.deposits where status = 'pending')::integer,
      coalesce((select sum(amount) from public.deposits where status = 'approved'), 0)::numeric(14,2),
      coalesce((select sum(amount) from public.deposits where status = 'pending'), 0)::numeric(14,2),
      (select count(1)::integer from public.withdrawals)::integer,
      (select count(1)::integer from public.withdrawals where status = 'pending')::integer,
      coalesce((select sum(amount) from public.withdrawals where status in ('approved','paid')), 0)::numeric(14,2),
      coalesce((select sum(amount) from public.withdrawals where status = 'pending'), 0)::numeric(14,2),
      coalesce((select sum(coalesce(up.balance, w.balance, 0)) from public.user_profiles up left join public.wallets w on w.profile_id = up.id), 0)::numeric(14,2),
      coalesce((select sum(coalesce(up.available_balance, w.available_balance, 0)) from public.user_profiles up left join public.wallets w on w.profile_id = up.id), 0)::numeric(14,2),
      coalesce((select sum(coalesce(up.bonus_balance, w.bonus_balance, 0)) from public.user_profiles up left join public.wallets w on w.profile_id = up.id), 0)::numeric(14,2),
      coalesce((select sum(amount) from public.user_investments where status = 'active'), 0)::numeric(14,2),
      (select count(1)::integer from public.user_investments where status = 'active')::integer,
      (select count(1)::integer from public.savings_applications)::integer,
      coalesce((select sum(amount_applied) from public.savings_applications where status = 'active'), 0)::numeric(14,2);
end;
$$;
comment on function public.admin_dashboard_stats()
  is 'ADMIN: estatísticas gerais do painel de administração.';
grant execute on function public.admin_dashboard_stats() to authenticated;

-- -----------------------------------------------------------------
-- 12. RPC: ADMIN - LISTA UTILIZADORES (com filtros básicos)
-- -----------------------------------------------------------------
create or replace function public.admin_list_users(
  p_limit integer default 500,
  p_offset integer default 0,
  p_search text default null
)
returns table (
  id uuid,
  full_name text,
  phone_number text,
  is_admin boolean,
  is_verified boolean,
  referral_code text,
  invite_code text,
  referred_by uuid,
  referred_by_name text,
  joined_at timestamp with time zone,
  wallet_balance numeric(14,2),
  wallet_available numeric(14,2),
  wallet_bonus numeric(14,2),
  active_package_number integer,
  active_package_name text,
  total_invested numeric(14,2),
  active_investments integer,
  savings_count integer,
  total_savings_applied numeric(14,2)
)
language plpgsql
security definer
as $$
declare
  v_lim integer := least(abs(coalesce(p_limit, 500)), 1000);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := coalesce(nullif(trim(p_search), ''), null);
begin
  if not public.is_current_admin() then return; end if;

  return query
    select
      up.id,
      up.full_name,
      up.phone_number,
      up.is_admin,
      coalesce(up.is_verified, false) as is_verified,
      up.referral_code,
      up.invite_code,
      up.referred_by,
      (select u2.full_name from public.user_profiles u2 where u2.id = up.referred_by limit 1),
      up.created_at,
      coalesce(up.balance, w.balance, 0)::numeric(14,2),
      coalesce(up.available_balance, w.available_balance, 0)::numeric(14,2),
      coalesce(up.bonus_balance, w.bonus_balance, 0)::numeric(14,2),
      (select ip.package_number
         from public.user_investments ui
         join public.investment_packages ip on ip.id = ui.package_id
        where ui.user_id = up.id and ui.status = 'active'
        order by ui.purchased_at desc limit 1),
      (select ip.name
         from public.user_investments ui
         join public.investment_packages ip on ip.id = ui.package_id
        where ui.user_id = up.id and ui.status = 'active'
        order by ui.purchased_at desc limit 1),
      coalesce((select sum(ui.amount) from public.user_investments ui
        where ui.user_id = up.id and ui.status = 'active'), 0)::numeric(14,2),
      (select count(1)::integer from public.user_investments ui
        where ui.user_id = up.id and ui.status = 'active')::integer,
      (select count(1)::integer from public.savings_applications sa
        where sa.profile_id = up.id)::integer,
      coalesce((select sum(sa.amount_applied) from public.savings_applications sa
        where sa.profile_id = up.id and sa.status = 'active'), 0)::numeric(14,2)
    from public.user_profiles up
    left join public.wallets w on w.profile_id = up.id
    where v_search is null
       or upper(up.full_name) like '%' || upper(v_search) || '%'
       or up.phone_number like '%' || v_search || '%'
       or upper(coalesce(up.referral_code,'')) like '%' || upper(v_search) || '%'
    order by up.created_at desc
    limit v_lim
    offset v_off;
end;
$$;
comment on function public.admin_list_users(integer,integer,text)
  is 'ADMIN: lista paginada de utilizadores com carteira, investimentos e poupanças.';
grant execute on function public.admin_list_users(integer,integer,text) to authenticated;

-- -----------------------------------------------------------------
-- 13. VIEW para utilizador ver os SEUS depósitos e saques (UI)
-- -----------------------------------------------------------------
create or replace view public.my_deposits_view as
  select d.id, d.amount, d.payment_method, d.contact, d.proof_reference,
         d.status, d.created_at, d.reviewed_at, d.admin_notes
    from public.deposits d
    join public.user_profiles up on up.id = d.profile_id
   where up.auth_user_id = auth.uid();

create or replace view public.my_withdrawals_view as
  select w.id, w.amount, w.fee, w.total_deducted, w.withdrawal_method, w.contact,
         w.status, w.created_at, w.reviewed_at, w.admin_notes
    from public.withdrawals w
    join public.user_profiles up on up.id = w.profile_id
   where up.auth_user_id = auth.uid();

grant select on public.my_deposits_view to authenticated;
grant select on public.my_withdrawals_view to authenticated;

-- =================================================================
-- FIM: ADMIN PAINEL + DEPÓSITOS / SAQUES ZORA
-- =================================================================
