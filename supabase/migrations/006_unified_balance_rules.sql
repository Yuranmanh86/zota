-- ============================================================
-- MIGRATION 006 — REGRA UNIFICADA DE SALDOS
-- ============================================================
-- OBJECTIVOS:
--   A) Renda Diária (Pacote Comprado):
--      - No momento da compra, credita imediatamente a PRIMEIRA
--        renda diária no Saldo Principal (available_balance/balance).
--      - A cada 24h seguintes, uma nova renda diária é disponibilizada
--        (processamento via RPC process_daily_profits, que pode ser
--         invocado no login do usuário ou periodicamente).
--
--   B) Lucros (Acúmulo Geral):
--      - Campo "Lucros" = soma de TUDO que já foi ganho e creditado:
--        (renda diária recebida) + (lucros de poupança recebida)
--      - Usa os valores PERSISTIDOS em wallets.profits e
--        user_profiles.accumulated_profits (NÃO recalcula).
--
--   C) Poupança:
--      - Ao vencer/receber: amount_to_receive volta para Saldo Principal
--      - A parte correspondente ao lucro (amount_to_receive - amount_applied)
--        é SOMADA aos Lucros Acumulados.
-- ============================================================

-- ============================================================
-- 0. GARANTIR SECURITY DEFINER e search_path em funções críticas
--    (ainda que migration 005 já o tenha feito, repetimos por segurança)
-- ============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        WHERE p.proname IN (
            'purchase_investment_package',
            'settle_savings_application',
            'create_savings_application',
            'home_summary'
        ) AND p.pronamespace = 'public'::regnamespace
    LOOP
        BEGIN
            EXECUTE 'ALTER FUNCTION public.purchase_investment_package(' || r.args || ') SECURITY DEFINER;';
            EXECUTE 'ALTER FUNCTION public.purchase_investment_package(' || r.args || ') SET search_path = public;';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
END $$;


-- ============================================================
-- 1. ADICIONAR COLUNAS DE CONTROLO EM user_investments
--    Necessárias para gerir a cadência de 24h das rendas diárias
-- ============================================================
DO $$
BEGIN

    -- last_profit_credited_at: data do último crédito de renda diária
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'last_profit_credited_at'
    ) THEN
        ALTER TABLE public.user_investments
            ADD COLUMN last_profit_credited_at TIMESTAMPTZ;
    END IF;

    -- daily_profit_amount: valor da diária para este investimento
    -- (fixo, calculado no momento da compra para evitar JOINs desnecessários)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'daily_profit_amount'
    ) THEN
        ALTER TABLE public.user_investments
            ADD COLUMN daily_profit_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
    END IF;

    -- total_profit_credited: total já creditado para este investimento
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'total_profit_credited'
    ) THEN
        ALTER TABLE public.user_investments
            ADD COLUMN total_profit_credited NUMERIC(18,2) NOT NULL DEFAULT 0;
    END IF;

    -- profile_id: coluna de conveniência, usada em joins e RLS
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'profile_id'
    ) THEN
        ALTER TABLE public.user_investments
            ADD COLUMN profile_id UUID
            REFERENCES public.user_profiles(id) ON DELETE SET NULL;

        -- Backfill: profile_id = user_id (como user_id referencia user_profiles,
        -- para a maioria dos casos os dois coincidem)
        UPDATE public.user_investments
        SET profile_id = user_id
        WHERE profile_id IS NULL;
    END IF;

END
$$;

CREATE INDEX IF NOT EXISTS
    idx_ui_needs_profit
ON public.user_investments(status, last_profit_credited_at)
WHERE status = 'active';


-- ============================================================
-- 2. RECRIAR purchase_investment_package
--    NOVO COMPORTAMENTO:
--    a) Valida e debita valor do Saldo Principal
--    b) Cria user_investments com status 'active'
--    c) CALCULA e CRÉDITA IMEDIATAMENTE a PRIMEIRA renda diária
--       no Saldo Principal + Lucros Acumulados
--    d) Atualiza last_profit_credited_at = NOW()
-- ============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        WHERE p.proname = 'purchase_investment_package'
          AND p.pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS public.purchase_investment_package(' || r.args || ');';
    END LOOP;
END $$;


CREATE OR REPLACE FUNCTION public.purchase_investment_package(
    p_package_id UUID,
    p_amount NUMERIC
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    user_investment_id UUID,
    new_balance NUMERIC,
    new_available_balance NUMERIC,
    referral_bonus_paid NUMERIC,
    referral_paid_to UUID,
    first_daily_profit NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_user_id UUID := auth.uid();
    v_profile_id UUID;
    v_wallet_id UUID;
    v_package public.investment_packages;
    v_current_balance NUMERIC := 0;
    v_current_available NUMERIC := 0;
    v_current_profits NUMERIC := 0;
    v_min_investment NUMERIC;
    v_investment_id UUID;
    v_referrer_id UUID;
    v_referrer_wallet_id UUID;
    v_bonus_pct NUMERIC(5,2) := 10;
    v_bonus NUMERIC := 0;

    -- Controlo de renda diária
    v_daily_profit NUMERIC := 0;
    v_rate NUMERIC;
BEGIN
    success := false;
    message := 'Operação inválida';
    user_investment_id := null;
    new_balance := 0;
    new_available_balance := 0;
    referral_bonus_paid := 0;
    referral_paid_to := null;
    first_daily_profit := 0;

    -- 1. Autenticação
    IF v_auth_user_id IS NULL THEN
        message := 'Sessão expirada. Faça login novamente.';
        RETURN NEXT; RETURN;
    END IF;

    SELECT up.id INTO v_profile_id
    FROM public.user_profiles up
    WHERE up.auth_user_id = v_auth_user_id
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        message := 'Perfil não encontrado.';
        RETURN NEXT; RETURN;
    END IF;

    -- 2. Pacote válido
    SELECT * INTO v_package
    FROM public.investment_packages ip
    WHERE ip.id = p_package_id AND ip.is_active = true
    LIMIT 1;

    IF v_package IS NULL THEN
        message := 'Pacote indisponível.';
        RETURN NEXT; RETURN;
    END IF;

    v_min_investment := COALESCE(v_package.minimum_investment, 300);
    IF p_amount IS NULL OR p_amount < v_min_investment THEN
        message := 'Valor inferior ao mínimo do pacote (' || v_min_investment::text || ' MZN)';
        RETURN NEXT; RETURN;
    END IF;
    IF p_amount <= 0 THEN
        message := 'Valor inválido.';
        RETURN NEXT; RETURN;
    END IF;

    -- 3. Carteira + saldo actual
    v_wallet_id := public.get_or_create_wallet(v_profile_id);

    SELECT
        COALESCE(w.balance, 0),
        COALESCE(w.available_balance, COALESCE(w.balance, 0)),
        COALESCE(w.profits, 0)
    INTO v_current_balance, v_current_available, v_current_profits
    FROM public.wallets w
    WHERE w.id = v_wallet_id
    FOR UPDATE;

    -- Se a wallet não existir ou for null, tenta de user_profiles (fallback)
    IF v_current_balance IS NULL OR v_current_available IS NULL THEN
        SELECT
            COALESCE(up.balance, 0),
            COALESCE(up.available_balance, COALESCE(up.balance, 0)),
            COALESCE(up.accumulated_profits, 0)
        INTO v_current_balance, v_current_available, v_current_profits
        FROM public.user_profiles up
        WHERE up.id = v_profile_id;
    END IF;

    IF v_current_available < p_amount THEN
        success := false;
        message := 'Saldo insuficiente. Disponível: '
                   || to_char(v_current_available, 'FM999G999G990D00') || ' MZN';
        RETURN NEXT; RETURN;
    END IF;

    -- ============================================================
    -- 4. DEBITAR valor do investimento do Saldo Principal
    -- ============================================================
    v_current_balance   := ROUND(v_current_balance   - p_amount, 2);
    v_current_available := ROUND(v_current_available - p_amount, 2);

    UPDATE public.wallets
    SET
        balance           = v_current_balance,
        available_balance = v_current_available,
        invested          = COALESCE(invested, 0) + p_amount,
        updated_at        = NOW()
    WHERE id = v_wallet_id;

    -- Garante que user_profiles também fica sincronizado
    UPDATE public.user_profiles
    SET
        balance           = v_current_balance,
        available_balance = v_current_available,
        total_invested    = COALESCE(total_invested, 0) + p_amount,
        updated_at        = NOW()
    WHERE id = v_profile_id;

    -- ============================================================
    -- 5. CÁLCULO da renda diária (taxa do pacote)
    --    daily_profit = p_amount * (ip.daily_profit / ip.minimum_investment)
    -- ============================================================
    v_rate := CASE
        WHEN COALESCE(v_package.minimum_investment, 0) > 0
        THEN COALESCE(v_package.daily_profit, 0)::NUMERIC
             / v_package.minimum_investment::NUMERIC
        ELSE 0.035
    END;

    v_daily_profit := ROUND(p_amount * v_rate, 2);

    -- ============================================================
    -- 6. CRIAR user_investments
    --    PRIMEIRO: INSERT com as colunas que SEMPRE existem na tabela
    --    DEPOIS:  UPDATE para gravar os campos novos de controlo diário
    -- ============================================================
    INSERT INTO public.user_investments (
        user_id,
        package_id,
        amount, purchased_at, status
    ) VALUES (
        v_profile_id,
        p_package_id,
        p_amount, NOW(), 'active'
    )
    RETURNING id INTO v_investment_id;

    -- Grava os campos novos de controlo (criados via ALTER TABLE no início da migration)
    UPDATE public.user_investments
    SET
        daily_profit_amount     = v_daily_profit,
        last_profit_credited_at = NOW(),   -- primeiro crédito é AGORA
        total_profit_credited   = v_daily_profit
    WHERE id = v_investment_id;

    -- ============================================================
    -- 7. REGRA UNIFICADA A) - RENDA DIÁRIA IMEDIATA
    --    Creditar a PRIMEIRA renda diária NO SALDO PRINCIPAL
    --    e também somar em Lucros Acumulados
    -- ============================================================
    IF v_daily_profit > 0 THEN
        v_current_balance     := ROUND(v_current_balance     + v_daily_profit, 2);
        v_current_available   := ROUND(v_current_available   + v_daily_profit, 2);
        v_current_profits     := ROUND(v_current_profits     + v_daily_profit, 2);
        first_daily_profit    := v_daily_profit;

        UPDATE public.wallets
        SET
            balance           = v_current_balance,
            available_balance = v_current_available,
            profits           = v_current_profits,
            updated_at        = NOW()
        WHERE id = v_wallet_id;

        UPDATE public.user_profiles
        SET
            balance             = v_current_balance,
            available_balance   = v_current_available,
            accumulated_profits = v_current_profits,
            updated_at          = NOW()
        WHERE id = v_profile_id;

        -- Regista transacção de renda diária (primeira)
        INSERT INTO public.transactions (
            profile_id, wallet_id, user_investment_id,
            transaction_type, direction, amount,
            balance_before, balance_after,
            description, status, processed_at
        ) VALUES (
            v_profile_id, v_wallet_id, v_investment_id,
            'profit', 'credit', v_daily_profit,
            (v_current_available - v_daily_profit), v_current_available,
            '1ª Renda diária imediata: Pacote ' || COALESCE(v_package.name, 'Investimento'),
            'completed', NOW()
        );
    END IF;

    -- ============================================================
    -- 8. Programa de indicações: 10% bónus ao convidador
    --    (mantém lógica anterior mas SEM debitar o comprador;
    --     o bónus é "gratuito" e só incrementa bonus_balance + balance do referente)
    -- ============================================================
    v_bonus := ROUND((p_amount * v_bonus_pct / 100.0), 2);
    v_bonus := COALESCE(v_bonus, 0);

    IF v_bonus > 0 THEN
        SELECT up.referred_by INTO v_referrer_id
        FROM public.user_profiles up
        WHERE up.id = v_profile_id
        LIMIT 1;

        IF v_referrer_id IS NOT NULL AND v_referrer_id <> v_profile_id THEN
            v_referrer_wallet_id := public.get_or_create_wallet(v_referrer_id);

            UPDATE public.wallets w
            SET
                bonus_balance = COALESCE(w.bonus_balance, 0) + v_bonus,
                balance       = COALESCE(w.balance, 0) + v_bonus,
                available_balance = COALESCE(w.available_balance, w.balance, 0) + v_bonus,
                profits       = COALESCE(w.profits, 0) + v_bonus,
                updated_at    = NOW()
            WHERE w.id = v_referrer_wallet_id;

            UPDATE public.user_profiles up
            SET
                bonus_balance       = COALESCE(up.bonus_balance, 0) + v_bonus,
                balance             = COALESCE(up.balance, 0) + v_bonus,
                available_balance   = COALESCE(up.available_balance, up.balance, 0) + v_bonus,
                accumulated_profits = COALESCE(up.accumulated_profits, 0) + v_bonus,
                updated_at          = NOW()
            WHERE up.id = v_referrer_id;

            INSERT INTO public.referral_rewards (
                referrer_id, referred_id, user_investment_id, package_id,
                package_number, investment_amount, reward_percent, reward_amount,
                status, description, paid_at
            ) VALUES (
                v_referrer_id, v_profile_id, v_investment_id, p_package_id,
                v_package.package_number, p_amount, v_bonus_pct, v_bonus,
                'paid',
                'Bónus 10% ref: Compra ' || COALESCE(v_package.name, 'Pacote'),
                NOW()
            );

            INSERT INTO public.transactions (
                profile_id, wallet_id, user_investment_id,
                transaction_type, direction, amount,
                description, status, processed_at, reference
            ) VALUES (
                v_referrer_id, v_referrer_wallet_id, null,
                'profit', 'credit', v_bonus,
                'Bónus indicação 10%: ' || to_char(p_amount, 'FM999G999G990D00') || ' MZN',
                'completed', NOW(),
                'ref:' || COALESCE(v_investment_id::text, '')
            );

            referral_bonus_paid := v_bonus;
            referral_paid_to    := v_referrer_id;
        END IF;
    END IF;

    -- Transacção principal (compra)
    INSERT INTO public.transactions (
        profile_id, wallet_id, user_investment_id,
        transaction_type, direction, amount,
        balance_before, balance_after,
        description, status, processed_at
    ) VALUES (
        v_profile_id, v_wallet_id, v_investment_id,
        'investment', 'debit', p_amount,
        (v_current_available + p_amount - v_daily_profit),
        v_current_available,
        'Compra pacote ' || COALESCE(v_package.name, 'Investimento'),
        'completed', NOW()
    );

    -- Carrega saldos finais para retornar ao cliente
    SELECT w.balance, w.available_balance
    INTO   new_balance, new_available_balance
    FROM   public.wallets w
    WHERE  w.id = v_wallet_id;

    success := true;
    user_investment_id := v_investment_id;
    message := CASE
        WHEN first_daily_profit > 0 THEN
            'Investimento realizado. +'
            || to_char(first_daily_profit, 'FM999G999G990D00')
            || ' MZN já creditado no Saldo Principal (1ª renda diária).'
        ELSE
            'Investimento realizado com sucesso.'
        END;

    RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purchase_investment_package(UUID, NUMERIC) TO authenticated, anon;


-- ============================================================
-- 3. RPC: process_daily_profits
--    Percorre user_investments activos e, para cada um,
--    se passaram >= 24h desde last_profit_credited_at,
--    credita 1 renda diária adicional.
--
--    Esta função DEVE ser chamada:
--      - No login do utilizador
--      - Periodicamente (ex.: pg_cron se habilitado)
--      - Quando o utilizador abre o ecrã Home
-- ============================================================
DROP FUNCTION IF EXISTS public.process_daily_profits();

CREATE OR REPLACE FUNCTION public.process_daily_profits()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_uid UUID;
    v_profile_id UUID;
    v_wallet_id UUID;

    v_cur_balance NUMERIC := 0;
    v_cur_available NUMERIC := 0;
    v_cur_profits NUMERIC := 0;

    v_total_credited NUMERIC := 0;
    v_count_updated INTEGER := 0;

    r RECORD;
BEGIN
    v_auth_uid := auth.uid();
    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Sessão expirada.',
            'total_credited', 0,
            'investments_updated', 0
        );
    END IF;

    SELECT up.id INTO v_profile_id
    FROM public.user_profiles up
    WHERE up.auth_user_id = v_auth_uid
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Perfil não encontrado.',
            'total_credited', 0,
            'investments_updated', 0
        );
    END IF;

    v_wallet_id := public.get_or_create_wallet(v_profile_id);

    -- Carrega saldo actual
    SELECT
        COALESCE(w.balance, 0),
        COALESCE(w.available_balance, w.balance, 0),
        COALESCE(w.profits, 0)
    INTO v_cur_balance, v_cur_available, v_cur_profits
    FROM public.wallets w
    WHERE w.id = v_wallet_id
    FOR UPDATE;

    -- Loop por investimentos activos deste utilizador
    FOR r IN
        SELECT
            ui.id            AS ui_id,
            ui.amount        AS amount,
            ui.daily_profit_amount AS dp,
            ui.last_profit_credited_at AS lp,
            ui.total_profit_credited AS tpc
        FROM public.user_investments ui
        WHERE (ui.user_id = v_profile_id OR ui.profile_id = v_profile_id)
          AND ui.status = 'active'
          AND ui.daily_profit_amount > 0
        FOR UPDATE OF ui
    LOOP
        -- Regra: só credita 1 vez a cada 24h
        IF r.lp IS NULL OR (NOW() - r.lp) >= INTERVAL '24 hours' THEN

            -- Actualiza carteira
            v_cur_balance   := ROUND(v_cur_balance   + r.dp, 2);
            v_cur_available := ROUND(v_cur_available + r.dp, 2);
            v_cur_profits   := ROUND(v_cur_profits   + r.dp, 2);
            v_total_credited:= ROUND(v_total_credited + r.dp, 2);
            v_count_updated := v_count_updated + 1;

            -- Actualiza controlo no user_investments
            UPDATE public.user_investments ui2
            SET
                last_profit_credited_at = NOW(),
                total_profit_credited   = ROUND(COALESCE(ui2.total_profit_credited, 0) + r.dp, 2),
                updated_at              = NOW()
            WHERE ui2.id = r.ui_id;

            -- Transacção
            INSERT INTO public.transactions (
                profile_id, wallet_id, user_investment_id,
                transaction_type, direction, amount,
                description, status, processed_at
            ) VALUES (
                v_profile_id, v_wallet_id, r.ui_id,
                'profit', 'credit', r.dp,
                'Renda diária (pacote activo)',
                'completed', NOW()
            );
        END IF;
    END LOOP;

    -- Persiste saldos finais na wallet e profile
    IF v_count_updated > 0 THEN
        UPDATE public.wallets
        SET
            balance           = v_cur_balance,
            available_balance = v_cur_available,
            profits           = v_cur_profits,
            updated_at        = NOW()
        WHERE id = v_wallet_id;

        UPDATE public.user_profiles
        SET
            balance             = v_cur_balance,
            available_balance   = v_cur_available,
            accumulated_profits = v_cur_profits,
            updated_at          = NOW()
        WHERE id = v_profile_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', CASE
            WHEN v_count_updated = 0
                THEN 'Nenhuma renda diária vencida. Aguarde as próximas 24h.'
            ELSE
                v_count_updated::text || ' rendas diárias creditadas. Total +'
                || to_char(v_total_credited, 'FM999G999G990D00') || ' MZN.'
        END,
        'total_credited', COALESCE(v_total_credited, 0),
        'investments_updated', COALESCE(v_count_updated, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_daily_profits() TO authenticated, anon;


-- ============================================================
-- 4. RECRIAR settle_savings_application
--    REGRA UNIFICADA C) - Poupança
--    Ao vencer:
--      - amount_applied        → Saldo Principal (capital devolvido)
--      - amount_to_receive - amount_applied (lucro)
--        → Saldo Principal E Lucros Acumulados
-- ============================================================
DROP FUNCTION IF EXISTS public.settle_savings_application(UUID);

CREATE OR REPLACE FUNCTION public.settle_savings_application(
    p_savings_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_auth_uid UUID;
    v_profile_id UUID;

    v_sa RECORD;

    v_wallet_id UUID;

    v_available NUMERIC := 0;
    v_balance NUMERIC := 0;
    v_profits NUMERIC := 0;

    v_capital NUMERIC;
    v_savings_profit NUMERIC;
    v_total NUMERIC;

    v_new_available NUMERIC;
    v_new_balance NUMERIC;
    v_new_profits NUMERIC;

BEGIN
    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Sessão expirada. Faça login novamente.'
        );
    END IF;

    SELECT up.id INTO v_profile_id
    FROM public.user_profiles up
    WHERE up.auth_user_id = v_auth_uid
    LIMIT 1;

    IF v_profile_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Perfil não encontrado.'
        );
    END IF;

    SELECT * INTO v_sa
    FROM public.savings_applications sa
    WHERE sa.id = p_savings_id;

    IF v_sa IS NULL OR v_sa.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Aplicação de poupança não encontrada.'
        );
    END IF;

    -- Permissão
    IF v_sa.profile_id <> v_profile_id
       AND NOT public.is_current_admin()
    THEN
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Sem permissão para receber esta poupança.'
        );
    END IF;

    -- Auto-ready: se locked e passou release_at
    IF v_sa.status = 'locked' AND v_sa.release_at <= NOW() THEN
        v_sa.status := 'ready';
    END IF;

    IF v_sa.status <> 'ready' THEN
        IF v_sa.status = 'completed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Esta poupança já foi recebida.'
            );
        END IF;
        IF v_sa.status IN ('cancelled', 'expired') THEN
            RETURN jsonb_build_object(
                'success', false,
                'message', 'Esta poupança foi cancelada/expirada.'
            );
        END IF;
        RETURN jsonb_build_object(
            'success', false,
            'message', 'Prazo ainda não decorrido. Aguarde a liberação.'
        );
    END IF;

    -- Calcula componentes
    v_capital       := COALESCE(v_sa.amount_applied, 0);
    v_total         := COALESCE(v_sa.amount_to_receive, 0);
    v_savings_profit := GREATEST(0, ROUND(v_total - v_capital, 2));

    -- Carrega carteira
    SELECT
        w.id,
        COALESCE(w.available_balance, w.balance, 0),
        COALESCE(w.balance, 0),
        COALESCE(w.profits, 0)
    INTO v_wallet_id, v_available, v_balance, v_profits
    FROM public.wallets w
    WHERE w.profile_id = v_sa.profile_id
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
        v_wallet_id := public.get_or_create_wallet(v_sa.profile_id);
        SELECT
            COALESCE(w.available_balance, w.balance, 0),
            COALESCE(w.balance, 0),
            COALESCE(w.profits, 0)
        INTO v_available, v_balance, v_profits
        FROM public.wallets w
        WHERE w.id = v_wallet_id;
    END IF;

    -- Fallback para user_profiles
    IF v_wallet_id IS NULL THEN
        SELECT
            COALESCE(up.available_balance, up.balance, 0),
            COALESCE(up.balance, 0),
            COALESCE(up.accumulated_profits, 0)
        INTO v_available, v_balance, v_profits
        FROM public.user_profiles up
        WHERE up.id = v_sa.profile_id;
    END IF;

    -- ============================================================
    -- REGRA UNIFICADA C):
    --   - Capital + Lucro → Saldo Principal
    --   - Lucro          → Lucros Acumulados (aumenta o somatório)
    -- ============================================================
    v_new_available := ROUND(COALESCE(v_available, 0) + v_total, 2);
    v_new_balance   := ROUND(COALESCE(v_balance,   0) + v_total, 2);
    v_new_profits   := ROUND(COALESCE(v_profits,   0) + v_savings_profit, 2);

    -- Persiste wallet
    IF v_wallet_id IS NOT NULL THEN
        UPDATE public.wallets
        SET
            available_balance = v_new_available,
            balance           = v_new_balance,
            profits           = v_new_profits,
            updated_at        = NOW()
        WHERE id = v_wallet_id;
    END IF;

    -- Persiste profile (sempre)
    UPDATE public.user_profiles
    SET
        available_balance   = v_new_available,
        balance             = v_new_balance,
        accumulated_profits = v_new_profits,
        updated_at          = NOW()
    WHERE id = v_sa.profile_id;

    -- Marca como completed
    UPDATE public.savings_applications
    SET
        status     = 'completed',
        settled_at = NOW(),
        updated_at = NOW()
    WHERE id = p_savings_id;

    -- Transacção: capital devolvido
    INSERT INTO public.transactions (
        profile_id, wallet_id,
        transaction_type, direction, amount,
        description, status, processed_at, reference
    ) VALUES (
        v_sa.profile_id, v_wallet_id,
        'savings', 'credit', v_capital,
        'Poupança recebida: Capital devolvido',
        'completed', NOW(),
        'sav:' || p_savings_id::text
    );

    -- Transacção: lucro da poupança (se houver)
    IF v_savings_profit > 0 THEN
        INSERT INTO public.transactions (
            profile_id, wallet_id,
            transaction_type, direction, amount,
            description, status, processed_at, reference
        ) VALUES (
            v_sa.profile_id, v_wallet_id,
            'profit', 'credit', v_savings_profit,
            'Poupança recebida: Lucro (rendimento)',
            'completed', NOW(),
            'sav-profit:' || p_savings_id::text
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message',
            'Poupança recebida! Capital +'
            || to_char(v_capital, 'FM999G999G990D00')
            || ' + Lucro +'
            || to_char(v_savings_profit, 'FM999G999G990D00')
            || ' MZN no Saldo Principal.',
        'savings_id', p_savings_id,
        'amount_received', v_total,
        'capital_received', v_capital,
        'profit_received', v_savings_profit,
        'new_available_balance', v_new_available,
        'new_balance', v_new_balance,
        'new_profits', v_new_profits
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_savings_application(UUID) TO authenticated, anon;


-- ============================================================
-- 5. RECRIAR home_summary
--    REGRA UNIFICADA B) - Lucros = ACUMULADO REAL (já creditado)
--    Usa wallets.profits / profile.accumulated_profits.
--    Apenas para estimated_daily_profit é que usamos a taxa.
-- ============================================================
DROP FUNCTION IF EXISTS public.home_summary(UUID);
DROP FUNCTION IF EXISTS public.home_summary(UUID, UUID);

CREATE OR REPLACE FUNCTION public.home_summary(
    p_auth_user_id UUID DEFAULT NULL,
    p_profile_id  UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_wallet RECORD;

    v_active_investments NUMERIC;
    v_active_investments_count INTEGER;

    v_total_invested NUMERIC;
    v_total_profits_persisted NUMERIC;   -- REAL (B)

    v_savings_value NUMERIC;

    v_pending_deposits NUMERIC;
    v_pending_withdrawals_count INTEGER;

    v_daily_rate CONSTANT NUMERIC := 3.5;
    v_estimated_daily NUMERIC;
    v_last_profit NUMERIC;
BEGIN
    -- Resolve profile
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

    -- Carrega WALLET preferencialmente
    SELECT
        w.balance,
        w.invested,
        w.profits,
        w.available_balance,
        w.bonus_balance,
        w.pending_withdrawals
    INTO v_wallet
    FROM public.wallets w
    WHERE w.profile_id = v_profile_id;

    -- Fallback para user_profiles se wallet não existir
    IF v_wallet IS NULL THEN
        SELECT
            up.balance,
            COALESCE(up.total_invested, 0)        AS invested,
            COALESCE(up.accumulated_profits, 0)   AS profits,
            COALESCE(up.available_balance, up.balance) AS available_balance,
            COALESCE(up.bonus_balance, 0)         AS bonus_balance,
            COALESCE(up.pending_withdrawals, 0)   AS pending_withdrawals
        INTO v_wallet
        FROM public.user_profiles up
        WHERE up.id = v_profile_id;
    END IF;

    -- Conta investimentos activos (por user_id, depois por profile_id)
    v_active_investments := 0;
    v_active_investments_count := 0;
    BEGIN
        SELECT COALESCE(SUM(ui.amount), 0), COALESCE(COUNT(*), 0)
        INTO v_active_investments, v_active_investments_count
        FROM public.user_investments ui
        WHERE ui.user_id = v_profile_id AND ui.status = 'active';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    IF (v_active_investments IS NULL OR v_active_investments = 0) AND v_active_investments_count = 0 THEN
        BEGIN
            SELECT COALESCE(SUM(ui.amount), 0), COALESCE(COUNT(*), 0)
            INTO v_active_investments, v_active_investments_count
            FROM public.user_investments ui
            WHERE ui.profile_id = v_profile_id AND ui.status = 'active';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- Total investido: prefere o persistido, senão o calculado
    v_total_invested := COALESCE(v_wallet.invested, v_active_investments);

    -- ============================================================
    -- REGRA UNIFICADA B): LUCROS = VALOR PERSISTIDO (REAL)
    -- NÃO recalculamos por JOIN. O acumulado real já está em
    -- wallets.profits / user_profiles.accumulated_profits.
    -- ============================================================
    v_total_profits_persisted := COALESCE(v_wallet.profits, 0);

    -- Poupança activa/locked
    v_savings_value := 0;
    BEGIN
        SELECT COALESCE(SUM(amount_applied), 0)
        INTO v_savings_value
        FROM public.savings_applications sa
        WHERE sa.profile_id = v_profile_id
          AND sa.status IN ('active','locked');
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Pedidos pendentes
    v_pending_withdrawals_count := 0;
    BEGIN
        SELECT COALESCE(COUNT(*), 0)
        INTO v_pending_withdrawals_count
        FROM public.withdrawals w
        WHERE w.profile_id = v_profile_id AND w.status = 'pending';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    v_pending_deposits := 0;
    BEGIN
        SELECT COALESCE(SUM(amount), 0)
        INTO v_pending_deposits
        FROM public.deposits d
        WHERE d.profile_id = v_profile_id AND d.status = 'pending';
    EXCEPTION WHEN OTHERS THEN NULL; END;

    -- Estimativa diária apenas para exibição (não é lucro real ainda)
    v_estimated_daily := ROUND(
        COALESCE(v_active_investments, 0) * v_daily_rate / 100.0,
        2
    );
    v_last_profit := v_estimated_daily;

    RETURN jsonb_build_object(
        'principal',              COALESCE(v_wallet.balance, 0),
        'available',              COALESCE(v_wallet.available_balance, COALESCE(v_wallet.balance, 0)),
        'invested',               v_total_invested,
        'accumulated_profits',    v_total_profits_persisted,   -- <<< REGRA B: REAL
        'active_investments',     COALESCE(v_active_investments_count, 0),
        'total_invested',         COALESCE(v_active_investments, 0),
        'estimated_daily_profit', v_estimated_daily,
        'estimated_monthly_profit', ROUND(v_estimated_daily * 30, 2),
        'last_profit',            v_last_profit,
        'savings_value',          COALESCE(v_savings_value, 0),
        'balance',                COALESCE(v_wallet.balance, 0),
        'available_balance',      COALESCE(v_wallet.available_balance, COALESCE(v_wallet.balance, 0)),
        'bonus_balance',          COALESCE(v_wallet.bonus_balance, 0),
        'pending_withdrawals',    COALESCE(v_wallet.pending_withdrawals, 0),
        'pending_withdrawals_count', COALESCE(v_pending_withdrawals_count, 0),
        'pending_deposits',       COALESCE(v_pending_deposits, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.home_summary(UUID, UUID) TO authenticated, anon;


-- ============================================================
-- 6. BACKFILL: para investimentos activos existentes,
--    calcula daily_profit_amount e marca last_profit_credited_at
--    (assumindo que o último crédito foi em purchased_at ou agora)
-- ============================================================
DO $$
DECLARE
    r RECORD;
    v_rate NUMERIC;
    v_dp NUMERIC;
BEGIN
    FOR r IN
        SELECT
            ui.id AS ui_id,
            ui.amount,
            ui.package_id,
            ui.purchased_at,
            ui.last_profit_credited_at,
            ui.daily_profit_amount
        FROM public.user_investments ui
        WHERE ui.status = 'active'
    LOOP
        IF COALESCE(r.daily_profit_amount, 0) = 0 THEN
            -- Calcula com base no pacote
            v_rate := 0.035;
            BEGIN
                SELECT CASE
                    WHEN COALESCE(ip.minimum_investment, 0) > 0
                    THEN COALESCE(ip.daily_profit, 0)::NUMERIC
                         / ip.minimum_investment::NUMERIC
                    ELSE 0.035
                END
                INTO v_rate
                FROM public.investment_packages ip
                WHERE ip.id = r.package_id;
            EXCEPTION WHEN OTHERS THEN v_rate := 0.035; END;

            v_dp := ROUND(COALESCE(r.amount, 0) * v_rate, 2);

            UPDATE public.user_investments
            SET daily_profit_amount = v_dp
            WHERE id = r.ui_id;
        END IF;

        -- Se last_profit_credited_at for NULL, coloca purchased_at ou NOW()
        IF r.last_profit_credited_at IS NULL THEN
            UPDATE public.user_investments
            SET last_profit_credited_at = COALESCE(r.purchased_at, NOW())
            WHERE id = r.ui_id;
        END IF;
    END LOOP;
END
$$;


-- ============================================================
-- FINAL
-- ============================================================
SELECT 'Migration 006 aplicada com sucesso. Regra Unificada de Saldos activa.' AS status;
