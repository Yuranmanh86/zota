-- ============================================================
-- MIGRACAO 003: Correcao de JOIN nos RPCs home_summary e admin_dashboard_summary
-- Problema: user_investments NAO TEM coluna daily_profit nem interest_rate.
--           Esses dados virao da tabela investment_packages via JOIN com package_id.
--           O erro anterior causava falha TOTAL do home_summary -> Home mostrava TUDO 0.
-- Data: 2026-08-11
-- ============================================================

-- ---------------------------------------------------------------------
-- 1. Reconstruir RPC home_summary CORRETAMENTE com JOIN investment_packages
--    As colunas user_id OU profile_id em user_investments sao tratadas dinamicamente.
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
  -- Resolver profile_id
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

  -- Carregar wallet (ou fallback para user_profiles legado)
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

  -- Investimentos ativos: por user_id, senao por profile_id
  v_active_investments := 0;
  v_active_investments_count := 0;

  BEGIN
    SELECT COALESCE(SUM(ui.amount), 0), COALESCE(COUNT(*), 0)
      INTO v_active_investments, v_active_investments_count
    FROM public.user_investments ui
    WHERE ui.user_id = v_profile_id AND ui.status = 'active';
  EXCEPTION WHEN OTHERS THEN
    v_active_investments := 0;
    v_active_investments_count := 0;
  END;

  IF (v_active_investments IS NULL OR v_active_investments = 0) AND v_active_investments_count = 0 THEN
    BEGIN
      SELECT COALESCE(SUM(ui.amount), 0), COALESCE(COUNT(*), 0)
        INTO v_active_investments, v_active_investments_count
      FROM public.user_investments ui
      WHERE ui.profile_id = v_profile_id AND ui.status = 'active';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  v_total_invested := COALESCE(v_wallet.invested, v_active_investments);

  -- ============================================================
  -- Lucros acumulados COM JOIN CORRETO com investment_packages
  -- daily_profit vem de investment_packages (valor ABSOLUTO para o pacote).
  -- Taxa diaria do investimento do usuario =
  --    ui.amount * (ip.daily_profit / NULLIF(ip.minimum_investment, 0))
  -- ============================================================
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

  -- Poupança
  v_savings_value := 0;
  BEGIN
    SELECT COALESCE(SUM(amount_applied), 0) INTO v_savings_value
    FROM public.savings_applications sa
    WHERE sa.profile_id = v_profile_id AND sa.status IN ('active','locked');
  EXCEPTION WHEN OTHERS THEN
    v_savings_value := 0;
  END;

  -- Pedidos pendentes
  v_pending_withdrawals_count := 0;
  BEGIN
    SELECT COALESCE(COUNT(*), 0) INTO v_pending_withdrawals_count
    FROM public.withdrawals w
    WHERE w.profile_id = v_profile_id AND w.status = 'pending';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  v_pending_deposits := 0;
  BEGIN
    SELECT COALESCE(SUM(amount), 0) INTO v_pending_deposits
    FROM public.deposits d
    WHERE d.profile_id = v_profile_id AND d.status = 'pending';
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Calculos finais
  v_estimated_daily := ROUND(COALESCE(v_active_investments, 0) * v_daily_rate / 100.0, 2);
  v_last_profit     := v_estimated_daily;

  RETURN jsonb_build_object(
    'principal', COALESCE(v_wallet.balance, 0),
    'available', COALESCE(v_wallet.available_balance, COALESCE(v_wallet.balance, 0)),
    'invested', v_total_invested,
    'accumulated_profits', v_total_profits,
    'active_investments', COALESCE(v_active_investments_count, 0),
    'total_invested', COALESCE(v_active_investments, 0),
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
-- 2. Reconstruir RPC admin_dashboard_summary com JOIN correto
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_dashboard_summary();
CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS JSONB AS $$
DECLARE
  v_total_users INTEGER;
  v_verified_users INTEGER;
  v_total_balance NUMERIC;
  v_total_invested NUMERIC;
  v_total_bonus NUMERIC;
  v_total_available NUMERIC;
  v_total_profits NUMERIC;
  v_active_investments INTEGER;
  v_total_deposits_count INTEGER;
  v_total_deposits_approved NUMERIC;
  v_total_withdrawals_count INTEGER;
  v_pending_deposits_count INTEGER;
  v_pending_deposits_amount NUMERIC;
  v_pending_withdrawals_count INTEGER;
  v_pending_withdrawals_amount NUMERIC;
  v_total_savings NUMERIC;
  v_active_savings_count INTEGER;
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

  -- JOIN CORRETO com investment_packages
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

  SELECT COUNT(*), COALESCE(SUM(amount + COALESCE(fee, 0)), 0)
    INTO v_pending_withdrawals_count, v_pending_withdrawals_amount
  FROM public.withdrawals WHERE status = 'pending';

  BEGIN
    SELECT COALESCE(SUM(amount_applied), 0), COALESCE(COUNT(*), 0)
      INTO v_total_savings, v_active_savings_count
    FROM public.savings_applications WHERE status IN ('active','locked');
  EXCEPTION WHEN OTHERS THEN
    v_total_savings := 0;
    v_active_savings_count := 0;
  END;

  RETURN jsonb_build_object(
    'totalUsers', COALESCE(v_total_users, 0),
    'verifiedUsers', COALESCE(v_verified_users, 0),
    'totalBalance', COALESCE(v_total_balance, 0),
    'totalInvested', COALESCE(v_total_invested, 0),
    'totalBonus', COALESCE(v_total_bonus, 0),
    'totalAvailable', COALESCE(v_total_available, 0),
    'totalProfits', COALESCE(v_total_profits, 0),
    'activeInvestments', COALESCE(v_active_investments, 0),
    'totalDepositsCount', COALESCE(v_total_deposits_count, 0),
    'totalDepositsApproved', COALESCE(v_total_deposits_approved, 0),
    'totalWithdrawalsCount', COALESCE(v_total_withdrawals_count, 0),
    'pendingDepositsCount', COALESCE(v_pending_deposits_count, 0),
    'pendingDepositsAmount', COALESCE(v_pending_deposits_amount, 0),
    'pendingWithdrawalsCount', COALESCE(v_pending_withdrawals_count, 0),
    'pendingWithdrawalsAmount', COALESCE(v_pending_withdrawals_amount, 0),
    'totalSavings', COALESCE(v_total_savings, 0),
    'activeSavingsCount', COALESCE(v_active_savings_count, 0)
  );
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 3. Alias admin_dashboard_stats aponta para versao corrigida
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_dashboard_stats();
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB AS $$
BEGIN
  RETURN public.admin_dashboard_summary();
END;
$$ LANGUAGE plpgsql;
