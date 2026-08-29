-- ============================================================
-- MIGRACAO 004: RLS Policies CRITICAS FALTANTES
-- Problema: deposits/withdrawals entre outras tinha RLS ATIVO mas ZERO policies
--            = default deny -> bloqueia TUDO, inclusive inserts validos.
-- Resolve: erro "new row violates row-level security policy for table deposits"
--          erro equivalente em withdrawals
--          e garante acesso minimo em user_investments/referrals/etc
-- Data: 2026-08-11
-- ============================================================

-- ---------------------------------------------------------------------
-- 0. Garantir funcao helper is_current_admin (usada em outras policies)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS BOOLEAN AS $$
DECLARE
  v_auth_uid UUID;
  v_admin_flag BOOLEAN;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RETURN FALSE; END IF;

  SELECT up.is_admin INTO v_admin_flag
  FROM public.user_profiles up
  WHERE up.auth_user_id = v_auth_uid
  LIMIT 1;

  RETURN COALESCE(v_admin_flag, FALSE);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.is_current_admin() TO authenticated, anon;

-- Helper interno: auth_uid -> profile_id
CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS UUID AS $$
DECLARE
  v_auth_uid UUID;
  v_pid UUID;
BEGIN
  v_auth_uid := auth.uid();
  IF v_auth_uid IS NULL THEN RETURN NULL; END IF;
  SELECT up.id INTO v_pid FROM public.user_profiles up WHERE up.auth_user_id = v_auth_uid LIMIT 1;
  RETURN v_pid;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, anon;

-- ============================================================
-- 1. TABELA: deposits (PEDIDOS DE DEPOSITO / RECARGA)
-- ============================================================
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_deposits_select ON public.deposits;
CREATE POLICY policy_deposits_select ON public.deposits
  FOR SELECT
  USING (
    public.is_current_admin()
    OR profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_deposits_insert ON public.deposits;
CREATE POLICY policy_deposits_insert ON public.deposits
  FOR INSERT
  WITH CHECK (
    profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_deposits_update ON public.deposits;
CREATE POLICY policy_deposits_update ON public.deposits
  FOR UPDATE
  USING (
    public.is_current_admin()
    OR (
      profile_id = public.current_profile_id()
      AND status IN ('pending','cancelled')
    )
  )
  WITH CHECK (
    public.is_current_admin()
    OR (
      profile_id = public.current_profile_id()
      AND status IN ('pending','cancelled')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.deposits TO authenticated;

-- ============================================================
-- 2. TABELA: withdrawals (PEDIDOS DE SAQUE)
-- ============================================================
ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_withdrawals_select ON public.withdrawals;
CREATE POLICY policy_withdrawals_select ON public.withdrawals
  FOR SELECT
  USING (
    public.is_current_admin()
    OR profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_withdrawals_insert ON public.withdrawals;
CREATE POLICY policy_withdrawals_insert ON public.withdrawals
  FOR INSERT
  WITH CHECK (
    profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_withdrawals_update ON public.withdrawals;
CREATE POLICY policy_withdrawals_update ON public.withdrawals
  FOR UPDATE
  USING (
    public.is_current_admin()
    OR (
      profile_id = public.current_profile_id()
      AND status IN ('pending','cancelled')
    )
  )
  WITH CHECK (
    public.is_current_admin()
    OR (
      profile_id = public.current_profile_id()
      AND status IN ('pending','cancelled')
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.withdrawals TO authenticated;

-- ============================================================
-- 3. TABELA: user_investments (Investimentos do user)
--    Garante policies se RLS estiver ativo mas sem policies
-- ============================================================
ALTER TABLE public.user_investments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_user_investments_select ON public.user_investments;
CREATE POLICY policy_user_investments_select ON public.user_investments
  FOR SELECT
  USING (
    public.is_current_admin()
    OR user_id = public.current_profile_id()
    OR profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_user_investments_insert ON public.user_investments;
CREATE POLICY policy_user_investments_insert ON public.user_investments
  FOR INSERT
  WITH CHECK (
    user_id = public.current_profile_id()
    OR profile_id = public.current_profile_id()
  );

DROP POLICY IF EXISTS policy_user_investments_update ON public.user_investments;
CREATE POLICY policy_user_investments_update ON public.user_investments
  FOR UPDATE
  USING (
    public.is_current_admin()
    OR user_id = public.current_profile_id()
    OR profile_id = public.current_profile_id()
  )
  WITH CHECK (
    public.is_current_admin()
    OR user_id = public.current_profile_id()
    OR profile_id = public.current_profile_id()
  );

GRANT SELECT, INSERT, UPDATE ON public.user_investments TO authenticated;

-- ============================================================
-- 4. TABELA: investment_packages (Catalogo de pacotes)
--    Qualquer utilizador autenticado pode ler
-- ============================================================
ALTER TABLE public.investment_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_investment_packages_select ON public.investment_packages;
CREATE POLICY policy_investment_packages_select ON public.investment_packages
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

GRANT SELECT ON public.investment_packages TO authenticated, anon;

-- ============================================================
-- 5. TABELA: referral_rewards (Bonus de indicacao)
-- ============================================================
ALTER TABLE public.referral_rewards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_referral_rewards_select ON public.referral_rewards;
CREATE POLICY policy_referral_rewards_select ON public.referral_rewards
  FOR SELECT
  USING (
    public.is_current_admin()
    OR referrer_id = public.current_profile_id()
    OR referred_id = public.current_profile_id()
  );

GRANT SELECT ON public.referral_rewards TO authenticated;

-- ============================================================
-- 6. VIEWS / my_deposits_view / my_withdrawals_view
--    (caso existam - ficam acessiveis se as tabelas base permitirem)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='my_deposits_view') THEN
    GRANT SELECT ON public.my_deposits_view TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='public' AND table_name='my_withdrawals_view') THEN
    GRANT SELECT ON public.my_withdrawals_view TO authenticated;
  END IF;
END $$;

-- ============================================================
-- 7. GRANTs em colunas de sequences / tabelas auxiliares
--    (importante: inserts de uuid, etc)
-- ============================================================
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- ============================================================
-- 8. RPCs CRITICOS marcados como SECURITY DEFINER + set search_path
--    Estes RPCs precisam escrever em tabelas protegidas por RLS
--    (atualizar saldos, inserir deposits/withdrawals em nome do user)
--    O SECURITY DEFINER executa com permissoes do OWNER (postgres)
--    e passa pelas RLS policies da tabela alvo.
-- ============================================================

-- Home summary
ALTER FUNCTION public.home_summary(UUID, UUID) SECURITY DEFINER;
ALTER FUNCTION public.home_summary(UUID, UUID) SET search_path = public;

-- Criar pedido de deposito
ALTER FUNCTION public.create_deposit_request(NUMERIC, TEXT, TEXT, TEXT) SECURITY DEFINER;
ALTER FUNCTION public.create_deposit_request(NUMERIC, TEXT, TEXT, TEXT) SET search_path = public;

-- Criar pedido de saque
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_withdrawal_request'
  ) THEN
    ALTER FUNCTION public.create_withdrawal_request(NUMERIC, TEXT, TEXT, NUMERIC) SECURITY DEFINER;
    ALTER FUNCTION public.create_withdrawal_request(NUMERIC, TEXT, TEXT, NUMERIC) SET search_path = public;
  END IF;
END $$;

-- Comprar investimento
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'purchase_investment_package'
  ) THEN
    ALTER FUNCTION public.purchase_investment_package(UUID, NUMERIC) SECURITY DEFINER;
    ALTER FUNCTION public.purchase_investment_package(UUID, NUMERIC) SET search_path = public;
  END IF;
END $$;

-- Poupanca
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'create_savings_application'
  ) THEN
    ALTER FUNCTION public.create_savings_application(NUMERIC) SECURITY DEFINER;
    ALTER FUNCTION public.create_savings_application(NUMERIC) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'settle_savings_application'
  ) THEN
    ALTER FUNCTION public.settle_savings_application(UUID) SECURITY DEFINER;
    ALTER FUNCTION public.settle_savings_application(UUID) SET search_path = public;
  END IF;
END $$;

-- Wallet helper
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_or_create_wallet'
  ) THEN
    ALTER FUNCTION public.get_or_create_wallet(UUID) SECURITY DEFINER;
    ALTER FUNCTION public.get_or_create_wallet(UUID) SET search_path = public;
  END IF;
END $$;

-- Refresh savings status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'refresh_savings_status'
  ) THEN
    ALTER FUNCTION public.refresh_savings_status() SECURITY DEFINER;
    ALTER FUNCTION public.refresh_savings_status() SET search_path = public;
  END IF;
END $$;

-- Admin RPCs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_dashboard_summary'
  ) THEN
    ALTER FUNCTION public.admin_dashboard_summary() SECURITY DEFINER;
    ALTER FUNCTION public.admin_dashboard_summary() SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_review_deposit'
  ) THEN
    ALTER FUNCTION public.admin_review_deposit(UUID, UUID, TEXT, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_review_deposit(UUID, UUID, TEXT, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_review_withdrawal'
  ) THEN
    ALTER FUNCTION public.admin_review_withdrawal(UUID, UUID, TEXT, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_review_withdrawal(UUID, UUID, TEXT, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_approve_deposit'
  ) THEN
    ALTER FUNCTION public.admin_approve_deposit(UUID, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_approve_deposit(UUID, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_reject_deposit'
  ) THEN
    ALTER FUNCTION public.admin_reject_deposit(UUID, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_reject_deposit(UUID, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_approve_withdrawal'
  ) THEN
    ALTER FUNCTION public.admin_approve_withdrawal(UUID, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_approve_withdrawal(UUID, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_reject_withdrawal'
  ) THEN
    ALTER FUNCTION public.admin_reject_withdrawal(UUID, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_reject_withdrawal(UUID, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_adjust_wallet'
  ) THEN
    ALTER FUNCTION public.admin_adjust_wallet(UUID, NUMERIC, BOOLEAN, TEXT) SECURITY DEFINER;
    ALTER FUNCTION public.admin_adjust_wallet(UUID, NUMERIC, BOOLEAN, TEXT) SET search_path = public;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'admin_list_users'
  ) THEN
    ALTER FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) SECURITY DEFINER;
    ALTER FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER) SET search_path = public;
  END IF;
END $$;
