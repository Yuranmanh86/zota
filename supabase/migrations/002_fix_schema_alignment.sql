-- =====================================================================
-- MIGRATION 002 — Alinhamento de schema e correções de RPCs
-- Objetivo: eliminar erros:
--   1. "column ui.profile_id does not exist"  na RPC home_summary
--   2. "column proof-url of relation deposits does not exist"
--   3. Garantir idempotência (roda várias vezes sem quebrar)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Garantir coluna profile_id na tabela user_investments
--    (home_summary referencia ui.profile_id e ui.user_id em OR)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_investments'
  ) THEN

    -- 1a. Adicionar coluna profile_id UUID se não existir
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_investments' AND column_name='profile_id'
    ) THEN
      ALTER TABLE public.user_investments ADD COLUMN profile_id UUID;
    END IF;

    -- 1b. Garantir coluna user_id UUID (algumas versões antigas só têm profile_id)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_investments' AND column_name='user_id'
    ) THEN
      ALTER TABLE public.user_investments ADD COLUMN user_id UUID;
    END IF;

    -- 1c. Backfill bidirecional (popular uma coluna a partir da outra)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_investments' AND column_name='profile_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_investments' AND column_name='user_id') THEN

      UPDATE public.user_investments
      SET profile_id = user_id
      WHERE profile_id IS NULL AND user_id IS NOT NULL;

      UPDATE public.user_investments
      SET user_id = profile_id
      WHERE user_id IS NULL AND profile_id IS NOT NULL;
    END IF;

    -- 1d. Garantir FK e índices (não falham se já existirem)
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='user_profiles') THEN
        ALTER TABLE public.user_investments
        ADD CONSTRAINT IF NOT EXISTS user_investments_profile_id_fkey
        FOREIGN KEY (profile_id) REFERENCES public.user_profiles(id) ON DELETE CASCADE;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'user_investments_profile_id_fkey já existe ou não pode ser criado: %', SQLERRM;
    END;

    CREATE INDEX IF NOT EXISTS idx_user_investments_profile_id
    ON public.user_investments(profile_id);

    CREATE INDEX IF NOT EXISTS idx_user_investments_user_id
    ON public.user_investments(user_id);

  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. Unificar nome da coluna de comprovativo em deposits: proof_reference
--    (código frontend / select / tipos usam proof_reference)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='deposits'
  ) THEN

    -- 2a. Se só existe proof_url (migration 001 nova), renomear para proof_reference
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_url'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_reference'
    ) THEN
      ALTER TABLE public.deposits RENAME COLUMN proof_url TO proof_reference;
    END IF;

    -- 2b. Se nenhuma existir, criar proof_reference
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_reference'
    ) THEN
      ALTER TABLE public.deposits ADD COLUMN proof_reference TEXT;
    END IF;

    -- 2c. Se AMBAS existirem por algum motivo, consolidar (migrar dado de proof_url → proof_reference)
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_url'
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_reference'
    ) THEN
      UPDATE public.deposits
      SET proof_reference = proof_url
      WHERE proof_reference IS NULL AND proof_url IS NOT NULL;

      -- 2d. Dropar coluna duplicada proof_url para não haver ambiguidade
      ALTER TABLE public.deposits DROP COLUMN IF EXISTS proof_url;
    END IF;

    -- Garantir índice para filtros de admin (review depósitos pendentes)
    CREATE INDEX IF NOT EXISTS idx_deposits_profile_id_status
    ON public.deposits(profile_id, status);

  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. RPC home_summary — versão robusta (defesa contra coluna ausente)
--    Usamos SQL dinâmico apenas onde necessário para não falhar
--    em compilação caso alguma coluna ainda esteja faltando.
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
  v_col_user_id BOOLEAN;
  v_col_profile_id BOOLEAN;
  v_qry TEXT;
BEGIN
  -- =========================================================
  -- Resolver profile_id a partir de auth_user_id OU parametro
  -- =========================================================
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

  -- =========================================================
  -- Carregar wallet (ou fallback para user_profiles legado)
  -- =========================================================
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

  -- =========================================================
  -- Investimentos ativos — dinâmico, usa coluna que existir
  -- =========================================================
  v_active_investments := 0;
  v_active_investments_count := 0;
  v_total_profits := 0;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='user_investments'
  ) THEN

    -- Descobrir qual(is) coluna(s) de relacionamento existem
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_investments' AND column_name='user_id'
    ) INTO v_col_user_id;

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='user_investments' AND column_name='profile_id'
    ) INTO v_col_profile_id;

    -- Build predicate dinâmico
    IF v_col_user_id AND v_col_profile_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(amount),0), COALESCE(COUNT(*),0)
                     FROM public.user_investments ui
                     WHERE (ui.user_id = $1 OR ui.profile_id = $1)
                       AND ui.status = 'active')$sql$;
    ELSIF v_col_user_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(amount),0), COALESCE(COUNT(*),0)
                     FROM public.user_investments ui
                     WHERE ui.user_id = $1 AND ui.status = 'active')$sql$;
    ELSIF v_col_profile_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(amount),0), COALESCE(COUNT(*),0)
                     FROM public.user_investments ui
                     WHERE ui.profile_id = $1 AND ui.status = 'active')$sql$;
    ELSE
      v_qry := NULL;
    END IF;

    IF v_qry IS NOT NULL THEN
      EXECUTE v_qry
        INTO v_active_investments, v_active_investments_count
        USING v_profile_id;
    END IF;

    -- Lucros acumulados COM JOIN CORRETO com investment_packages
    -- (daily_profit NAO EXISTE em user_investments, vem de investment_packages via package_id)
    IF v_col_user_id AND v_col_profile_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(
                     ui.amount * (COALESCE(ip.daily_profit, 0)
                       / NULLIF(COALESCE(ip.minimum_investment, ui.amount), 0))
                   , 0)
                   FROM public.user_investments ui
                   LEFT JOIN public.investment_packages ip ON ip.id = ui.package_id
                   WHERE (ui.user_id = $1 OR ui.profile_id = $1)
                     AND ui.status IN ('active','completed'))$sql$;
    ELSIF v_col_user_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(
                     ui.amount * (COALESCE(ip.daily_profit, 0)
                       / NULLIF(COALESCE(ip.minimum_investment, ui.amount), 0))
                   , 0)
                   FROM public.user_investments ui
                   LEFT JOIN public.investment_packages ip ON ip.id = ui.package_id
                   WHERE ui.user_id = $1
                     AND ui.status IN ('active','completed'))$sql$;
    ELSIF v_col_profile_id THEN
      v_qry := $sql$(SELECT COALESCE(SUM(
                     ui.amount * (COALESCE(ip.daily_profit, 0)
                       / NULLIF(COALESCE(ip.minimum_investment, ui.amount), 0))
                   , 0)
                   FROM public.user_investments ui
                   LEFT JOIN public.investment_packages ip ON ip.id = ui.package_id
                   WHERE ui.profile_id = $1
                     AND ui.status IN ('active','completed'))$sql$;
    ELSE
      v_qry := NULL;
    END IF;

    IF v_qry IS NOT NULL THEN
      BEGIN
        EXECUTE v_qry INTO v_total_profits USING v_profile_id;
      EXCEPTION WHEN OTHERS THEN
        v_total_profits := COALESCE(v_wallet.profits, 0);
      END;
    END IF;
  END IF;

  v_total_invested := COALESCE(v_wallet.invested, v_active_investments);
  v_total_profits   := COALESCE(v_total_profits, COALESCE(v_wallet.profits, 0));

  -- =========================================================
  -- Poupança
  -- =========================================================
  v_savings_value := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='savings_applications'
  ) THEN
    BEGIN
      SELECT COALESCE(SUM(amount_applied), 0) INTO v_savings_value
      FROM public.savings_applications sa
      WHERE sa.profile_id = v_profile_id AND sa.status IN ('active','locked');
    EXCEPTION WHEN OTHERS THEN
      v_savings_value := 0;
    END;
  END IF;

  -- =========================================================
  -- Pedidos pendentes
  -- =========================================================
  v_pending_withdrawals_count := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='withdrawals'
  ) THEN
    SELECT COALESCE(COUNT(*),0) INTO v_pending_withdrawals_count
    FROM public.withdrawals w
    WHERE w.profile_id = v_profile_id AND w.status = 'pending';
  END IF;

  v_pending_deposits := 0;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='deposits'
  ) THEN
    SELECT COALESCE(SUM(amount),0) INTO v_pending_deposits
    FROM public.deposits d
    WHERE d.profile_id = v_profile_id AND d.status = 'pending';
  END IF;

  -- =========================================================
  -- Cálculo de lucros estimados
  -- =========================================================
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
-- 4. RPC create_deposit_request — inserir em proof_reference
--    (unificado: coluna deposit agora SEMPRE é proof_reference)
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
  v_has_contact BOOLEAN;
  v_has_proof_ref BOOLEAN;
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

  -- Detectar se colunas contact / proof_reference existem na tabela deposits
  -- (algumas migrações antigas podem não ter contact)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deposits' AND column_name='contact'
  ) INTO v_has_contact;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='deposits' AND column_name='proof_reference'
  ) INTO v_has_proof_ref;

  -- Garantir coluna contact se não existir
  IF NOT v_has_contact THEN
    ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS contact TEXT;
    v_has_contact := TRUE;
  END IF;

  -- Garantir coluna proof_reference se não existir
  IF NOT v_has_proof_ref THEN
    ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS proof_reference TEXT;
    v_has_proof_ref := TRUE;
  END IF;

  -- INSERT dinâmico conforme colunas disponíveis (mas acima garantimos)
  INSERT INTO public.deposits (profile_id, amount, payment_method, contact, proof_reference)
  VALUES (
    v_profile_id,
    p_amount,
    COALESCE(p_payment_method, 'mpesa'),
    p_contact,
    p_proof_reference
  ) RETURNING id INTO v_id;

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
-- 5. Garantir permissões de execute para authenticated
-- ---------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.home_summary(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.home_summary(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_deposit_request(NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- FIM MIGRATION 002
-- ---------------------------------------------------------------------
SELECT 'Migration 002 aplicada com sucesso: colunas user_investments.profile_id + deposits.proof_reference garantidas, RPCs recompiladas.' AS status;
