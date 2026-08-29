-- ---------------------------------------------------------------------
-- 1. CRIAR / GARANTIR ESTRUTURA COMPLETA DA TABELA wallets
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id UUID NOT NULL,

    balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    invested NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    profits NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    available_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    bonus_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    locked_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    pending_withdrawals NUMERIC(18,2) NOT NULL DEFAULT 0.00,

    currency TEXT NOT NULL DEFAULT 'MZN',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT wallets_profile_id_unique
        UNIQUE (profile_id),

    CONSTRAINT wallets_balance_check
        CHECK (balance >= 0),

    CONSTRAINT wallets_invested_check
        CHECK (invested >= 0),

    CONSTRAINT wallets_profits_check
        CHECK (profits >= 0),

    CONSTRAINT wallets_available_balance_check
        CHECK (available_balance >= 0),

    CONSTRAINT wallets_bonus_balance_check
        CHECK (bonus_balance >= 0),

    CONSTRAINT wallets_locked_balance_check
        CHECK (locked_balance >= 0),

    CONSTRAINT wallets_pending_withdrawals_check
        CHECK (pending_withdrawals >= 0)
);


-- Garantir colunas caso a tabela já existisse anteriormente

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS invested NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS profits NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS available_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS bonus_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS locked_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS pending_withdrawals NUMERIC(18,2) NOT NULL DEFAULT 0.00;

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'MZN';

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.wallets
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();


-- Relacionamento com user_profiles

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'wallets_profile_id_fkey'
    ) THEN

        ALTER TABLE public.wallets
        ADD CONSTRAINT wallets_profile_id_fkey
        FOREIGN KEY (profile_id)
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE;

    END IF;
END $$;


CREATE INDEX IF NOT EXISTS idx_wallets_profile_id
ON public.wallets(profile_id);

-- ---------------------------------------------------------------------
-- 2. GARANTIR COLUNAS FALTANTES NA TABELA user_profiles
--    (mantemos backward compatibility com códigos antigos)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_profiles' AND column_name='available_balance'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN available_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_profiles' AND column_name='bonus_balance'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN bonus_balance NUMERIC(18,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_profiles' AND column_name='pending_withdrawals'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN pending_withdrawals NUMERIC(18,2) NOT NULL DEFAULT 0.00;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_profiles' AND column_name='biometric_enabled'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_profiles' AND column_name='is_verified'
    ) THEN
      ALTER TABLE user_profiles ADD COLUMN is_verified BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. GARANTIR TABELAS deposits E withdrawals EXISTEM COM COLUNAS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'mpesa',
  contact TEXT,
  proof_reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  fee NUMERIC(18,2) NOT NULL DEFAULT 0,
  withdrawal_method TEXT NOT NULL DEFAULT 'mpesa',
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected','cancelled')),
  admin_notes TEXT,
  reviewed_by UUID REFERENCES public.user_profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE UNIQUE,
  deposit_id UUID REFERENCES public.deposits(id),
  amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  credited_at TIMESTAMPTZ
);

-- ---------------------------------------------------------------------
-- 4. SINCRONIZAR user_profiles.balance com wallets (backfill)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='wallets')
    AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
    -- Garante wallet para cada profile
    INSERT INTO wallets (profile_id, balance, invested, profits, available_balance, bonus_balance, pending_withdrawals, updated_at)
    SELECT up.id, COALESCE(up.balance, 0), COALESCE(up.total_invested, 0), 0, COALESCE(up.available_balance, COALESCE(up.balance, 0)), COALESCE(up.bonus_balance, 0), COALESCE(up.pending_withdrawals, 0), NOW()
    FROM user_profiles up
    WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.profile_id = up.id);

    -- Backfill available_balance da wallet a partir de profile.balance (se wallet estiver zerada)
    UPDATE wallets w
    SET available_balance = up.balance
    FROM user_profiles up
    WHERE w.profile_id = up.id
      AND w.available_balance = 0
      AND COALESCE(up.balance, 0) > 0;

    -- Sincroniza profile.available_balance com wallet (RPC do app lê de up)
    UPDATE user_profiles up
    SET available_balance = w.available_balance,
        bonus_balance = w.bonus_balance,
        pending_withdrawals = w.pending_withdrawals,
        balance = w.balance,
        total_invested = w.invested
    FROM wallets w
    WHERE w.profile_id = up.id;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. TRIGGER para manter user_profiles sincronizado com wallets
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_profile_from_wallet()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.user_profiles
  SET balance = NEW.balance,
      total_invested = NEW.invested,
      profits = NEW.profits,
      available_balance = NEW.available_balance,
      bonus_balance = NEW.bonus_balance,
      pending_withdrawals = NEW.pending_withdrawals,
      updated_at = NOW()
  WHERE id = NEW.profile_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_profile_from_wallet ON public.wallets;
CREATE TRIGGER trg_sync_profile_from_wallet
AFTER UPDATE OF balance, invested, profits, available_balance, bonus_balance, pending_withdrawals
ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_from_wallet();

-- ---------------------------------------------------------------------
-- 6. RPC: home_summary
--    Aceita BOTH auth_user_id OU p_profile_id para compatibilidade total
--    Campos retornados: principal, available, invested, accumulated_profits,
--    active_investments, total_invested, estimated_daily_profit,
--    estimated_monthly_profit, last_profit, savings_value,
--    available_balance, bonus_balance, pending_withdrawals,
--    pending_withdrawals_count, pending_deposits, balance
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.home_summary(UUID);
DROP FUNCTION IF EXISTS public.home_summary(UUID, UUID);
CREATE OR REPLACE FUNCTION public.home_summary(
  p_auth_user_id UUID DEFAULT NULL,
  p_profile_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_profile_id UUID;
  v_wallet RECORD;
  v_active_investments NUMERIC;
  v_active_investments_count INTEGER;
  v_total_invested NUMERIC;
  v_total_profits NUMERIC;
  v_savings_value NUMERIC;
  v_pending_deposits NUMERIC;
  v_pending_withdrawals_count INTEGER;
  v_daily_rate CONSTANT NUMERIC := 3.5;
  v_estimated_daily NUMERIC;
  v_last_profit NUMERIC;
BEGIN
  IF p_profile_id IS NOT NULL THEN
    v_profile_id := p_profile_id;
  ELSIF p_auth_user_id IS NOT NULL THEN
    SELECT up.id INTO v_profile_id
    FROM public.user_profiles up
    WHERE up.auth_user_id = p_auth_user_id;
  END IF;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object(
      'principal', 0, 'available', 0, 'invested', 0,
      'accumulated_profits', 0, 'active_investments', 0,
      'total_invested', 0, 'estimated_daily_profit', 0,
      'estimated_monthly_profit', 0, 'last_profit', 0,
      'savings_value', 0, 'balance', 0, 'available_balance', 0,
      'bonus_balance', 0, 'pending_withdrawals', 0,
      'pending_withdrawals_count', 0, 'pending_deposits', 0
    );
  END IF;

  SELECT w.balance, w.invested, w.profits,
         w.available_balance, w.bonus_balance, w.pending_withdrawals
  INTO v_wallet
  FROM public.wallets w
  WHERE w.profile_id = v_profile_id;

  IF v_wallet IS NULL THEN
    SELECT up.balance, COALESCE(up.total_invested, 0) AS invested,
           COALESCE(NULLIF(up.accumulated_profits, 0), 0) AS profits,
           COALESCE(up.available_balance, up.balance) AS available_balance,
           COALESCE(up.bonus_balance, 0) AS bonus_balance,
           COALESCE(up.pending_withdrawals, 0) AS pending_withdrawals
    INTO v_wallet
    FROM public.user_profiles up WHERE up.id = v_profile_id;
  END IF;

  SELECT COALESCE(SUM(amount),0), COALESCE(COUNT(*),0)
    INTO v_active_investments, v_active_investments_count
  FROM public.user_investments ui
  WHERE ui.user_id = v_profile_id AND ui.status = 'active';

  IF v_active_investments IS NULL OR v_active_investments = 0 THEN
    SELECT COALESCE(SUM(amount),0), COALESCE(COUNT(*),0)
      INTO v_active_investments, v_active_investments_count
    FROM public.user_investments ui
    WHERE ui.profile_id = v_profile_id AND ui.status = 'active';
  END IF;

  v_total_invested := COALESCE(v_wallet.invested, v_active_investments);

  v_total_profits := COALESCE(v_wallet.profits, 0);
  BEGIN
    SELECT COALESCE(SUM(
      ui.amount * (COALESCE(ip.daily_profit, 0)
        / NULLIF(COALESCE(ip.minimum_investment, ui.amount), 0))
    ), 0)
      INTO v_total_profits
    FROM public.user_investments ui
    LEFT JOIN public.investment_packages ip ON ip.id = ui.package_id
    WHERE (ui.user_id = v_profile_id OR ui.profile_id = v_profile_id)
      AND ui.status IN ('active','completed');
  EXCEPTION WHEN OTHERS THEN
    v_total_profits := COALESCE(v_wallet.profits, 0);
  END;

  v_total_profits := COALESCE(v_total_profits, COALESCE(v_wallet.profits, 0));

  BEGIN
    SELECT COALESCE(SUM(amount_applied), 0) INTO v_savings_value
    FROM public.savings_applications sa
    WHERE sa.profile_id = v_profile_id AND sa.status IN ('active','locked');
  EXCEPTION WHEN OTHERS THEN
    v_savings_value := 0;
  END;

  SELECT COALESCE(COUNT(*),0) INTO v_pending_withdrawals_count
  FROM public.withdrawals w
  WHERE w.profile_id = v_profile_id AND w.status = 'pending';

  SELECT COALESCE(SUM(amount),0) INTO v_pending_deposits
  FROM public.deposits d
  WHERE d.profile_id = v_profile_id AND d.status = 'pending';

  v_estimated_daily := ROUND(v_active_investments * v_daily_rate / 100.0, 2);
  v_last_profit := v_estimated_daily;

  RETURN jsonb_build_object(
    'principal', COALESCE(v_wallet.balance, 0),
    'available', COALESCE(v_wallet.available_balance, COALESCE(v_wallet.balance, 0)),
    'invested', v_total_invested,
    'accumulated_profits', v_total_profits,
    'active_investments', COALESCE(v_active_investments_count, 0),
    'total_invested', v_active_investments,
    'estimated_daily_profit', v_estimated_daily,
    'estimated_monthly_profit', ROUND(v_estimated_daily * 30, 2),
    'last_profit', v_last_profit,
    'savings_value', COALESCE(v_savings_value, 0),
    'balance', COALESCE(v_wallet.balance, 0),
    'available_balance', COALESCE(v_wallet.available_balance, COALESCE(v_wallet.balance, 0)),
    'bonus_balance', COALESCE(v_wallet.bonus_balance, 0),
    'pending_withdrawals', COALESCE(v_wallet.pending_withdrawals, 0),
    'pending_withdrawals_count', COALESCE(v_pending_withdrawals_count, 0),
    'pending_deposits', COALESCE(v_pending_deposits, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 7. RPC: create_deposit_request
--    Obtém automaticamente o perfil do usuário logado via auth.uid()
--    Aceita os campos usados pelo app (payment_method, contact, proof_reference)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_deposit_request(UUID, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_deposit_request(NUMERIC, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.create_deposit_request(
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'mpesa',
  p_contact TEXT DEFAULT NULL,
  p_proof_reference TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_auth_uid UUID;
  v_profile_id UUID;
  v_id UUID;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sessão expirada. Faça login novamente.');
  END IF;

  SELECT up.id INTO v_profile_id
  FROM public.user_profiles up WHERE up.auth_user_id = v_auth_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Valor deve ser maior que zero.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.deposits
    WHERE profile_id = v_profile_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você já tem um depósito pendente. Aguarde aprovação.');
  END IF;

  INSERT INTO public.deposits (profile_id, amount, payment_method, contact, proof_reference)
  VALUES (v_profile_id, p_amount, COALESCE(p_payment_method, 'mpesa'), p_contact, p_proof_reference)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pedido enviado. Aguarde aprovação do admin.',
    'deposit_id', v_id,
    'amount', p_amount,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 8. RPC: create_withdrawal_request
--    Obtém automaticamente o perfil via auth.uid().
--    Desconta saldo disponível no pedido; devolve se rejeitado.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_withdrawal_request(UUID, NUMERIC, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_withdrawal_request(NUMERIC, TEXT, TEXT, NUMERIC);
CREATE OR REPLACE FUNCTION public.create_withdrawal_request(
  p_amount NUMERIC,
  p_withdrawal_method TEXT DEFAULT 'mpesa',
  p_contact TEXT DEFAULT NULL,
  p_fee NUMERIC DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
  v_auth_uid UUID;
  v_profile_id UUID;
  v_id UUID;
  v_available NUMERIC;
  v_total NUMERIC;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Sessão expirada. Faça login novamente.');
  END IF;

  SELECT up.id INTO v_profile_id
  FROM public.user_profiles up WHERE up.auth_user_id = v_auth_uid;

  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado.');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Valor deve ser maior que zero.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawals
    WHERE profile_id = v_profile_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Você já tem um saque pendente. Aguarde processamento.');
  END IF;

  v_total := p_amount + COALESCE(p_fee, 0);

  SELECT COALESCE(available_balance, balance, 0) INTO v_available
  FROM public.wallets WHERE profile_id = v_profile_id;

  IF v_available IS NULL THEN
    SELECT COALESCE(available_balance, balance, 0) INTO v_available
    FROM public.user_profiles WHERE id = v_profile_id;
  END IF;

  IF COALESCE(v_available, 0) < v_total THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Saldo insuficiente.',
      'available', COALESCE(v_available, 0),
      'required', v_total
    );
  END IF;

  INSERT INTO public.withdrawals (profile_id, amount, fee, withdrawal_method, contact)
  VALUES (v_profile_id, p_amount, COALESCE(p_fee, 0), COALESCE(p_withdrawal_method, 'mpesa'), p_contact)
  RETURNING id INTO v_id;

  UPDATE public.wallets
  SET balance = balance - v_total,
      available_balance = available_balance - v_total,
      pending_withdrawals = pending_withdrawals + v_total,
      updated_at = NOW()
  WHERE profile_id = v_profile_id;

  IF NOT FOUND THEN
    UPDATE public.user_profiles
    SET balance = balance - v_total,
        available_balance = available_balance - v_total,
        pending_withdrawals = pending_withdrawals + v_total,
        updated_at = NOW()
    WHERE id = v_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Saque solicitado. Valor já reservado.',
    'withdrawal_id', v_id,
    'amount', p_amount,
    'fee', COALESCE(p_fee, 0),
    'total_deducted', v_total,
    'status', 'pending'
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 9. RPC ADMIN: admin_review_deposit (credita saldo no approved)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_review_deposit(UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_review_deposit(
  p_admin_id UUID,
  p_deposit_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_profile_id UUID;
  v_amount NUMERIC;
  v_old_status TEXT;
  v_referrer_id UUID;
  v_bonus NUMERIC;
BEGIN
  SELECT profile_id, amount, status INTO v_profile_id, v_amount, v_old_status
  FROM public.deposits WHERE id = p_deposit_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Depósito não encontrado.');
  END IF;

  IF v_old_status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Depósito já foi analisado.');
  END IF;

  IF p_status = 'approved' THEN
    UPDATE public.wallets
    SET balance = balance + v_amount,
        available_balance = available_balance + v_amount,
        updated_at = NOW()
    WHERE profile_id = v_profile_id;
    IF NOT FOUND THEN
      UPDATE public.user_profiles
      SET balance = balance + v_amount,
          available_balance = available_balance + v_amount,
          updated_at = NOW()
      WHERE id = v_profile_id;
    END IF;

    -- Bónus de referência 10%
    SELECT referred_by INTO v_referrer_id FROM public.user_profiles WHERE id = v_profile_id;
    IF v_referrer_id IS NOT NULL AND v_amount > 0 THEN
      v_bonus := ROUND((v_amount * 10) / 100.0, 2);
      UPDATE public.wallets
      SET bonus_balance = bonus_balance + v_bonus,
          balance = balance + v_bonus,
          available_balance = available_balance + v_bonus,
          updated_at = NOW()
      WHERE profile_id = v_referrer_id;
      IF NOT FOUND THEN
        UPDATE public.user_profiles
        SET bonus_balance = bonus_balance + v_bonus,
            balance = balance + v_bonus,
            available_balance = available_balance + v_bonus,
            updated_at = NOW()
        WHERE id = v_referrer_id;
      END IF;

      INSERT INTO public.referral_rewards (referrer_id, referred_id, deposit_id, amount, status, created_at, credited_at)
      VALUES (v_referrer_id, v_profile_id, p_deposit_id, v_bonus, 'credited', NOW(), NOW())
      ON CONFLICT (referred_id) DO NOTHING;
    END IF;
  END IF;

  UPDATE public.deposits
  SET status = p_status,
      reviewed_by = p_admin_id,
      reviewed_at = NOW(),
      admin_notes = p_notes,
      updated_at = NOW()
  WHERE id = p_deposit_id;

  RETURN jsonb_build_object('success', true, 'message', 'Depósito analisado com sucesso.');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 10. RPC ADMIN: admin_review_withdrawal
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_review_withdrawal(UUID, UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_review_withdrawal(
  p_admin_id UUID,
  p_withdrawal_id UUID,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_profile_id UUID;
  v_amount NUMERIC;
  v_fee NUMERIC;
  v_total NUMERIC;
  v_old_status TEXT;
BEGIN
  SELECT profile_id, amount, fee, status INTO v_profile_id, v_amount, v_fee, v_old_status
  FROM public.withdrawals WHERE id = p_withdrawal_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Saque não encontrado.');
  END IF;

  IF v_old_status NOT IN ('pending') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Saque já foi analisado.');
  END IF;

  v_total := v_amount + COALESCE(v_fee, 0);

  IF p_status = 'rejected' OR p_status = 'cancelled' THEN
    -- Devolve valor ao cliente
    UPDATE public.wallets
    SET balance = balance + v_total,
        available_balance = available_balance + v_total,
        pending_withdrawals = pending_withdrawals - v_total,
        updated_at = NOW()
    WHERE profile_id = v_profile_id;
    IF NOT FOUND THEN
      UPDATE public.user_profiles
      SET balance = balance + v_total,
          available_balance = available_balance + v_total,
          pending_withdrawals = pending_withdrawals - v_total,
          updated_at = NOW()
      WHERE id = v_profile_id;
    END IF;
  ELSIF p_status = 'approved' OR p_status = 'paid' THEN
    -- Confirma que saque foi processado (valor já reservado no pedido)
    UPDATE public.wallets
    SET pending_withdrawals = pending_withdrawals - v_total,
        updated_at = NOW()
    WHERE profile_id = v_profile_id;
    IF NOT FOUND THEN
      UPDATE public.user_profiles
      SET pending_withdrawals = pending_withdrawals - v_total,
          updated_at = NOW()
      WHERE id = v_profile_id;
    END IF;
  END IF;

  UPDATE public.withdrawals
  SET status = p_status,
      reviewed_by = p_admin_id,
      reviewed_at = NOW(),
      admin_notes = p_notes,
      updated_at = NOW()
  WHERE id = p_withdrawal_id;

  RETURN jsonb_build_object('success', true, 'message', 'Saque analisado com sucesso.');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 11. RPC ADMIN: listar todos usuários (com filtros)
--     Campos mapeados exatamente como AdminUserRow em services/admin.ts
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_users(TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      up.id,
      up.full_name,
      up.phone_number,
      up.is_admin,
      up.is_verified,
      up.referral_code,
      up.invite_code,
      up.referred_by,
      (SELECT r.full_name FROM public.user_profiles r WHERE r.id = up.referred_by) AS referred_by_name,
      up.created_at AS joined_at,
      COALESCE(w.balance, up.balance, 0) AS wallet_balance,
      COALESCE(w.available_balance, up.available_balance, COALESCE(w.balance, up.balance, 0)) AS wallet_available,
      COALESCE(w.bonus_balance, up.bonus_balance, 0) AS wallet_bonus,
      COALESCE(w.invested, up.total_invested, 0) AS total_invested,
      (SELECT COUNT(*) FROM public.user_investments ui WHERE (ui.user_id = up.id OR ui.profile_id = up.id) AND ui.status='active') AS active_investments,
      (SELECT ip.package_number
         FROM public.user_investments ui
         LEFT JOIN public.investment_packages ip ON ip.id = ui.investment_package_id
        WHERE (ui.user_id = up.id OR ui.profile_id = up.id) AND ui.status='active'
        ORDER BY ui.purchased_at DESC LIMIT 1) AS active_package_number,
      (SELECT ip.name
         FROM public.user_investments ui
         LEFT JOIN public.investment_packages ip ON ip.id = ui.investment_package_id
        WHERE (ui.user_id = up.id OR ui.profile_id = up.id) AND ui.status='active'
        ORDER BY ui.purchased_at DESC LIMIT 1) AS active_package_name,
      (SELECT COUNT(*) FROM public.savings_applications sa WHERE sa.profile_id = up.id) AS savings_count,
      COALESCE((SELECT SUM(sa.amount_applied) FROM public.savings_applications sa WHERE sa.profile_id = up.id), 0) AS total_savings_applied,
      up.updated_at
    FROM public.user_profiles up
    LEFT JOIN public.wallets w ON w.profile_id = up.id
    WHERE
      p_search IS NULL
      OR up.full_name ILIKE '%' || p_search || '%'
      OR up.phone_number ILIKE '%' || p_search || '%'
      OR up.id::text ILIKE '%' || p_search || '%'
    ORDER BY up.created_at DESC
    LIMIT COALESCE(p_limit, 100)
    OFFSET COALESCE(p_offset, 0)
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 12. RPC ADMIN: dashboard summary com métricas globais
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_dashboard_summary();
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS JSONB AS $$
DECLARE
  v_total_users INTEGER;
  v_verified_users INTEGER;
  v_total_balance NUMERIC;
  v_total_invested NUMERIC;
  v_total_profits NUMERIC;
  v_total_bonus NUMERIC;
  v_total_available NUMERIC;
  v_active_investments INTEGER;
  v_total_deposits_count INTEGER;
  v_total_withdrawals_count INTEGER;
  v_pending_deposits_count INTEGER;
  v_pending_deposits_amount NUMERIC;
  v_pending_withdrawals_count INTEGER;
  v_pending_withdrawals_amount NUMERIC;
  v_total_deposits_approved NUMERIC;
  v_total_withdrawals_paid NUMERIC;
  v_total_savings_applications INTEGER;
  v_active_savings_value NUMERIC;
BEGIN
  SELECT COUNT(*),
         COALESCE(SUM(CASE WHEN is_verified THEN 1 ELSE 0 END), 0)
    INTO v_total_users, v_verified_users
  FROM public.user_profiles;

  SELECT COALESCE(SUM(COALESCE(w.balance, up.balance)), 0),
         COALESCE(SUM(COALESCE(w.invested, up.total_invested)), 0),
         COALESCE(SUM(COALESCE(w.bonus_balance, up.bonus_balance)), 0),
         COALESCE(SUM(COALESCE(w.available_balance, up.available_balance, COALESCE(w.balance, up.balance))), 0)
    INTO v_total_balance, v_total_invested, v_total_bonus, v_total_available
  FROM public.user_profiles up
  LEFT JOIN public.wallets w ON w.profile_id = up.id;

  BEGIN
    SELECT COALESCE(SUM(
      ui.amount * (COALESCE(ip.daily_profit, 0)
        / NULLIF(COALESCE(ip.minimum_investment, ui.amount), 0))
    ), 0),
    COALESCE(COUNT(*), 0)
      INTO v_total_profits, v_active_investments
    FROM public.user_investments ui
    LEFT JOIN public.investment_packages ip ON ip.id = ui.package_id
    WHERE ui.status = 'active';
  EXCEPTION WHEN OTHERS THEN
    v_total_profits := 0;
    v_active_investments := 0;
  END;

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_total_deposits_count, v_total_deposits_approved
  FROM public.deposits WHERE status IN ('approved');

  SELECT COUNT(*)
    INTO v_total_withdrawals_count
  FROM public.withdrawals WHERE status IN ('approved','paid');

  SELECT COUNT(*), COALESCE(SUM(amount), 0)
    INTO v_pending_deposits_count, v_pending_deposits_amount
  FROM public.deposits WHERE status = 'pending';

  SELECT COUNT(*), COALESCE(SUM(amount + fee), 0)
    INTO v_pending_withdrawals_count, v_pending_withdrawals_amount
  FROM public.withdrawals WHERE status = 'pending';

  SELECT COALESCE(SUM(amount), 0)
    INTO v_total_withdrawals_paid
  FROM public.withdrawals WHERE status IN ('approved','paid');

  SELECT COUNT(*), COALESCE(SUM(amount_applied), 0)
    INTO v_total_savings_applications, v_active_savings_value
  FROM public.savings_applications
  WHERE status IN ('active','locked');

  RETURN jsonb_build_object(
    'total_users', v_total_users,
    'verified_users', COALESCE(v_verified_users, 0),
    'total_balance', COALESCE(v_total_balance, 0),
    'total_available', COALESCE(v_total_available, 0),
    'total_invested', COALESCE(v_total_invested, 0),
    'total_profits', COALESCE(v_total_profits, 0),
    'total_bonus', COALESCE(v_total_bonus, 0),
    'active_investments', COALESCE(v_active_investments, 0),
    'total_deposits_count', COALESCE(v_total_deposits_count, 0),
    'pending_deposits_count', COALESCE(v_pending_deposits_count, 0),
    'total_deposits_value', COALESCE(v_total_deposits_approved, 0),
    'pending_deposits_value', COALESCE(v_pending_deposits_amount, 0),
    'total_withdrawals_count', COALESCE(v_total_withdrawals_count, 0),
    'pending_withdrawals_count', COALESCE(v_pending_withdrawals_count, 0),
    'total_withdrawals_value', COALESCE(v_total_withdrawals_paid, 0),
    'pending_withdrawals_value', COALESCE(v_pending_withdrawals_amount, 0),
    'total_savings_applications', COALESCE(v_total_savings_applications, 0),
    'active_savings_value', COALESCE(v_active_savings_value, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 12b. RPC COMPATIBILIDADE: admin_dashboard_stats (alias)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_dashboard_stats();
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB AS $$
BEGIN
  RETURN public.admin_dashboard_summary();
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 13. RPCs de wrapper para admin: approve/reject (compatibilidade services/admin.ts)
--     Todas obtêm automaticamente p_admin_id via auth.uid() -> profile.id
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_approve_deposit(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_approve_deposit(
  p_deposit_id UUID,
  p_admin_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT up.id INTO v_admin_id
  FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() AND up.is_admin = TRUE;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: não é administrador.');
  END IF;
  RETURN public.admin_review_deposit(v_admin_id, p_deposit_id, 'approved', p_admin_notes);
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.admin_reject_deposit(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_reject_deposit(
  p_deposit_id UUID,
  p_admin_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT up.id INTO v_admin_id
  FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() AND up.is_admin = TRUE;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: não é administrador.');
  END IF;
  RETURN public.admin_review_deposit(v_admin_id, p_deposit_id, 'rejected', p_admin_notes);
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.admin_approve_withdrawal(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_approve_withdrawal(
  p_withdrawal_id UUID,
  p_admin_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT up.id INTO v_admin_id
  FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() AND up.is_admin = TRUE;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: não é administrador.');
  END IF;
  RETURN public.admin_review_withdrawal(v_admin_id, p_withdrawal_id, 'paid', p_admin_notes);
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS public.admin_reject_withdrawal(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.admin_reject_withdrawal(
  p_withdrawal_id UUID,
  p_admin_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  SELECT up.id INTO v_admin_id
  FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() AND up.is_admin = TRUE;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado: não é administrador.');
  END IF;
  RETURN public.admin_review_withdrawal(v_admin_id, p_withdrawal_id, 'rejected', p_admin_notes);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 14. RPC ADMIN: admin_adjust_wallet (ajuste manual de saldo)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_adjust_wallet(UUID, NUMERIC, BOOLEAN, TEXT);
CREATE OR REPLACE FUNCTION public.admin_adjust_wallet(
  p_profile_id UUID,
  p_amount NUMERIC,
  p_available_only BOOLEAN DEFAULT TRUE,
  p_description TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_admin_id UUID;
  v_exists BOOLEAN;
  v_new_balance NUMERIC;
  v_new_available NUMERIC;
BEGIN
  SELECT up.id INTO v_admin_id
  FROM public.user_profiles up WHERE up.auth_user_id = auth.uid() AND up.is_admin = TRUE;
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Acesso negado.');
  END IF;

  IF p_amount = 0 OR p_amount IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Valor inválido.');
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.user_profiles WHERE id = p_profile_id) INTO v_exists;
  IF NOT v_exists THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil não encontrado.');
  END IF;

  UPDATE public.wallets
  SET
    balance = CASE WHEN p_available_only THEN balance ELSE balance + p_amount END,
    available_balance = available_balance + p_amount,
    updated_at = NOW()
  WHERE profile_id = p_profile_id;

  IF NOT FOUND THEN
    UPDATE public.user_profiles
    SET
      balance = CASE WHEN p_available_only THEN balance ELSE balance + p_amount END,
      available_balance = available_balance + p_amount,
      updated_at = NOW()
    WHERE id = p_profile_id;
  END IF;

  SELECT COALESCE(balance, 0), COALESCE(available_balance, balance, 0)
    INTO v_new_balance, v_new_available
  FROM public.wallets WHERE profile_id = p_profile_id;
  IF v_new_balance IS NULL THEN
    SELECT COALESCE(balance, 0), COALESCE(available_balance, balance, 0)
      INTO v_new_balance, v_new_available
    FROM public.user_profiles WHERE id = p_profile_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Saldo ajustado com sucesso.',
    'new_balance', COALESCE(v_new_balance, 0),
    'new_available', COALESCE(v_new_available, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 15. ATIVAR REALTIME NAS TABELAS PRINCIPAIS
--    (você também deve ativar via Supabase Dashboard > Database > Replication)
-- ---------------------------------------------------------------------
ALTER TABLE public.user_profiles REPLICA IDENTITY FULL;
ALTER TABLE public.wallets REPLICA IDENTITY FULL;
ALTER TABLE public.deposits REPLICA IDENTITY FULL;
ALTER TABLE public.withdrawals REPLICA IDENTITY FULL;
ALTER TABLE public.user_investments REPLICA IDENTITY FULL;
ALTER TABLE public.savings_applications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------
-- FIM DA MIGRATION
-- ---------------------------------------------------------------------
SELECT 'Migration Zora executada com sucesso! Agora ative o Realtime no Dashboard: Database > Replication > toggle ON em wallets, user_profiles, deposits, withdrawals, user_investments, savings_applications' AS status;
