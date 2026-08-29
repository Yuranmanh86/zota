-- ============================================================
-- MIGRATION 005 — CORREÇÕES CRÍTICAS
-- ADMIN + POUPANÇA + PERFORMANCE
--
-- Corrige:
--   A) Ambiguidade admin_list_users
--   B) admin_dashboard_summary
--   C) RPCs de poupança
--   D) View savings_applications_view
--   E) RLS de savings_applications
--   F) GET DIAGNOSTICS inválido
--   G) Compatibilidade package_id / investment_package_id
--
-- DATA: 2026-08-12
-- ============================================================


-- ============================================================
-- A) ELIMINAR TODAS AS VERSÕES ANTIGAS DE admin_list_users
-- ============================================================

DO $$
DECLARE
    r RECORD;
BEGIN

    FOR r IN
        SELECT
            p.oid,
            p.proname,
            pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        WHERE p.proname = 'admin_list_users'
          AND p.pronamespace = 'public'::regnamespace
    LOOP

        EXECUTE
            'DROP FUNCTION IF EXISTS public.admin_list_users('
            || r.args
            || ');';

        RAISE NOTICE
            'Removida admin_list_users(%)',
            r.args;

    END LOOP;

END
$$;


-- ============================================================
-- B) GARANTIR TABELA savings_applications
--    ANTES DE TUDO: dropar constraint antiga chk_sa_status se existir
--    (ela pode ter vindo de migration antiga SEM o status 'locked',
--     que causa erro "new row violates check constraint chk_sa_status")
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_sa_status'
      AND conrelid = 'public.savings_applications'::regclass
  ) THEN
    ALTER TABLE public.savings_applications DROP CONSTRAINT chk_sa_status;
  END IF;

  -- Tambem dropa qualquer constraint anonima de CHECK em status (nome gerado auto)
  -- e qualquer constraint que permita status mas nao inclua locked
  EXECUTE (
    SELECT string_agg(
      'ALTER TABLE public.savings_applications DROP CONSTRAINT ' || quote_ident(conname) || ';',
      E'\n'
    )
    FROM pg_constraint
    WHERE conrelid = 'public.savings_applications'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  );
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.savings_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    profile_id UUID NOT NULL
        REFERENCES public.user_profiles(id)
        ON DELETE CASCADE,

    wallet_id UUID
        REFERENCES public.wallets(id)
        ON DELETE SET NULL,

    amount_applied NUMERIC(18,2) NOT NULL
        CHECK (amount_applied > 0),

    amount_to_receive NUMERIC(18,2) NOT NULL
        CHECK (amount_to_receive >= amount_applied),

    status TEXT NOT NULL DEFAULT 'active',

    start_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    release_at TIMESTAMPTZ NOT NULL,

    settled_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GARANTIR: constraint EXPLICITA e CORRETA com todos os 6 status
ALTER TABLE public.savings_applications
  DROP CONSTRAINT IF EXISTS savings_applications_status_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'savings_applications_status_check'
      AND conrelid = 'public.savings_applications'::regclass
  ) THEN
    ALTER TABLE public.savings_applications
      ADD CONSTRAINT savings_applications_status_check
      CHECK (status IN ('active','locked','ready','completed','cancelled','expired'));
  END IF;
END $$;

-- Tambem garante que a constraint chk_sa_status NAO exista mais (evita duplicidade)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_sa_status'
      AND conrelid = 'public.savings_applications'::regclass
  ) THEN
    ALTER TABLE public.savings_applications DROP CONSTRAINT chk_sa_status;
  END IF;
END $$;


-- ============================================================
-- B1) GARANTIR COLUNAS EM BANCOS ANTIGOS
-- ============================================================

DO $$
BEGIN

    -- wallet_id
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'wallet_id'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN wallet_id UUID;

    END IF;


    -- amount_to_receive
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'amount_to_receive'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN amount_to_receive NUMERIC(18,2)
        NOT NULL DEFAULT 0;

    END IF;


    -- release_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'release_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN release_at TIMESTAMPTZ
        NOT NULL DEFAULT (NOW() + INTERVAL '72 hours');

    END IF;


    -- settled_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'settled_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN settled_at TIMESTAMPTZ;

    END IF;


    -- cancelled_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'cancelled_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN cancelled_at TIMESTAMPTZ;

    END IF;


    -- start_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'start_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN start_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();

    END IF;


    -- updated_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'updated_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN updated_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();

    END IF;


    -- created_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'savings_applications'
          AND column_name = 'created_at'
    ) THEN

        ALTER TABLE public.savings_applications
        ADD COLUMN created_at TIMESTAMPTZ
        NOT NULL DEFAULT NOW();

    END IF;

END
$$;


-- ============================================================
-- B2) ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS
    idx_savings_profile_status
ON public.savings_applications(profile_id, status);


CREATE INDEX IF NOT EXISTS
    idx_savings_release
ON public.savings_applications(release_at)
WHERE status IN ('active', 'locked');


-- ============================================================
-- C) RLS savings_applications
-- ============================================================

ALTER TABLE public.savings_applications
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS
    policy_savings_select
ON public.savings_applications;


CREATE POLICY
    policy_savings_select
ON public.savings_applications
FOR SELECT
USING (
    public.is_current_admin()
    OR profile_id = public.current_profile_id()
);


DROP POLICY IF EXISTS
    policy_savings_insert
ON public.savings_applications;


CREATE POLICY
    policy_savings_insert
ON public.savings_applications
FOR INSERT
WITH CHECK (
    profile_id = public.current_profile_id()
);


DROP POLICY IF EXISTS
    policy_savings_update
ON public.savings_applications;


CREATE POLICY
    policy_savings_update
ON public.savings_applications
FOR UPDATE
USING (
    public.is_current_admin()
    OR profile_id = public.current_profile_id()
)
WITH CHECK (
    public.is_current_admin()
    OR profile_id = public.current_profile_id()
);


GRANT
    SELECT,
    INSERT,
    UPDATE
ON public.savings_applications
TO authenticated;


-- ============================================================
-- D) ADMIN — LISTAR UTILIZADORES
--
-- Compatível com:
--   package_id
--   investment_package_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_users(
    p_search TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE
    v_result JSONB;
    v_auth_uid UUID;

    v_has_package_id BOOLEAN := FALSE;
    v_has_investment_package_id BOOLEAN := FALSE;

    v_package_column TEXT;

    v_sql TEXT;

BEGIN

    -- ========================================================
    -- Verificar sessão
    -- ========================================================

    v_auth_uid := auth.uid();

    IF v_auth_uid IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;


    -- ========================================================
    -- Verificar admin
    -- ========================================================

    IF NOT public.is_current_admin() THEN
        RETURN '[]'::JSONB;
    END IF;


    -- ========================================================
    -- Descobrir coluna correta
    -- ========================================================

    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'package_id'
    )
    INTO v_has_package_id;


    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'user_investments'
          AND column_name = 'investment_package_id'
    )
    INTO v_has_investment_package_id;


    IF v_has_investment_package_id THEN

        v_package_column := 'investment_package_id';

    ELSIF v_has_package_id THEN

        v_package_column := 'package_id';

    ELSE

        v_package_column := NULL;

    END IF;


    -- ========================================================
    -- Query dinâmica
    -- ========================================================

    v_sql := '
        SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb)
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

                (
                    SELECT r.full_name
                    FROM public.user_profiles r
                    WHERE r.id = up.referred_by
                ) AS referred_by_name,

                up.created_at AS joined_at,

                COALESCE(
                    w.balance,
                    up.balance,
                    0
                ) AS wallet_balance,

                COALESCE(
                    w.available_balance,
                    up.available_balance,
                    COALESCE(
                        w.balance,
                        up.balance,
                        0
                    )
                ) AS wallet_available,

                COALESCE(
                    w.bonus_balance,
                    up.bonus_balance,
                    0
                ) AS wallet_bonus,

                COALESCE(
                    w.invested,
                    up.total_invested,
                    0
                ) AS total_invested,

                (
                    SELECT COUNT(*)
                    FROM public.user_investments ui
                    WHERE (
                        ui.user_id = up.id
                        OR ui.profile_id = up.id
                    )
                    AND ui.status = ''active''
                ) AS active_investments,

                %ACTIVE_PACKAGE_NUMBER%

                %ACTIVE_PACKAGE_NAME%

                (
                    SELECT COUNT(*)
                    FROM public.savings_applications sa
                    WHERE sa.profile_id = up.id
                ) AS savings_count,

                COALESCE(
                    (
                        SELECT SUM(sa.amount_applied)
                        FROM public.savings_applications sa
                        WHERE sa.profile_id = up.id
                    ),
                    0
                ) AS total_savings_applied,

                up.updated_at

            FROM public.user_profiles up

            LEFT JOIN public.wallets w
                ON w.profile_id = up.id

            WHERE
                $1 IS NULL
                OR up.full_name ILIKE ''%%'' || $1 || ''%%''
                OR up.phone_number ILIKE ''%%'' || $1 || ''%%''
                OR up.id::text ILIKE ''%%'' || $1 || ''%%''

            ORDER BY up.created_at DESC

            LIMIT COALESCE($2, 100)

            OFFSET COALESCE($3, 0)

        ) t
    ';


    -- ========================================================
    -- Se existe coluna de pacote
    -- ========================================================

    IF v_package_column IS NOT NULL THEN

        v_sql := REPLACE(
            v_sql,
            '%ACTIVE_PACKAGE_NUMBER%',
            format(
                '(
                    SELECT ip.package_number
                    FROM public.user_investments ui
                    LEFT JOIN public.investment_packages ip
                        ON ip.id = ui.%I
                    WHERE (
                        ui.user_id = up.id
                        OR ui.profile_id = up.id
                    )
                    AND ui.status = ''active''
                    ORDER BY ui.purchased_at DESC NULLS LAST
                    LIMIT 1
                ) AS active_package_number,',
                v_package_column
            )
        );


        v_sql := REPLACE(
            v_sql,
            '%ACTIVE_PACKAGE_NAME%',
            format(
                '(
                    SELECT ip.name
                    FROM public.user_investments ui
                    LEFT JOIN public.investment_packages ip
                        ON ip.id = ui.%I
                    WHERE (
                        ui.user_id = up.id
                        OR ui.profile_id = up.id
                    )
                    AND ui.status = ''active''
                    ORDER BY ui.purchased_at DESC NULLS LAST
                    LIMIT 1
                ) AS active_package_name,',
                v_package_column
            )
        );

    ELSE

        v_sql := REPLACE(
            v_sql,
            '%ACTIVE_PACKAGE_NUMBER%',
            'NULL::text AS active_package_number,'
        );


        v_sql := REPLACE(
            v_sql,
            '%ACTIVE_PACKAGE_NAME%',
            'NULL::text AS active_package_name,'
        );

    END IF;


    -- ========================================================
    -- Executar
    -- ========================================================

    EXECUTE v_sql
    INTO v_result
    USING
        p_search,
        p_limit,
        p_offset;


    RETURN COALESCE(
        v_result,
        '[]'::JSONB
    );

END;
$$;


GRANT EXECUTE
ON FUNCTION public.admin_list_users(TEXT, INTEGER, INTEGER)
TO authenticated, anon;


-- ============================================================
-- E) ADMIN DASHBOARD SUMMARY
-- ============================================================

DO $$
DECLARE
    r RECORD;
BEGIN

    FOR r IN
        SELECT
            pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        WHERE p.proname = 'admin_dashboard_summary'
          AND p.pronamespace = 'public'::regnamespace
    LOOP

        EXECUTE
            'DROP FUNCTION IF EXISTS public.admin_dashboard_summary('
            || r.args
            || ');';

    END LOOP;


    FOR r IN
        SELECT
            pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p
        WHERE p.proname = 'admin_dashboard_stats'
          AND p.pronamespace = 'public'::regnamespace
    LOOP

        EXECUTE
            'DROP FUNCTION IF EXISTS public.admin_dashboard_stats('
            || r.args
            || ');';

    END LOOP;

END
$$;


CREATE OR REPLACE FUNCTION public.admin_dashboard_summary()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE

    v_auth_uid UUID;

    v_total_users INTEGER := 0;
    v_verified_users INTEGER := 0;

    v_total_balance NUMERIC := 0;
    v_total_invested NUMERIC := 0;
    v_total_profits NUMERIC := 0;
    v_total_bonus NUMERIC := 0;
    v_total_available NUMERIC := 0;

    v_active_investments INTEGER := 0;

    v_total_deposits_count INTEGER := 0;
    v_total_withdrawals_count INTEGER := 0;

    v_pending_deposits_count INTEGER := 0;
    v_pending_deposits_amount NUMERIC := 0;

    v_pending_withdrawals_count INTEGER := 0;
    v_pending_withdrawals_amount NUMERIC := 0;

    v_total_deposits_approved NUMERIC := 0;
    v_total_withdrawals_paid NUMERIC := 0;

    v_total_savings_applications INTEGER := 0;
    v_active_savings_value NUMERIC := 0;

BEGIN

    v_auth_uid := auth.uid();


    IF v_auth_uid IS NULL
       OR NOT public.is_current_admin()
    THEN

        RETURN jsonb_build_object(
            'total_users', 0,
            'verified_users', 0,
            'total_deposits_count', 0,
            'pending_deposits_count', 0,
            'total_deposits_value', 0,
            'pending_deposits_value', 0,
            'total_withdrawals_count', 0,
            'pending_withdrawals_count', 0,
            'total_withdrawals_value', 0,
            'pending_withdrawals_value', 0,
            'total_balance', 0,
            'total_available', 0,
            'total_bonus', 0,
            'total_invested', 0,
            'total_profits', 0,
            'active_investments', 0,
            'total_savings_applications', 0,
            'active_savings_value', 0
        );

    END IF;


    -- ========================================================
    -- UTILIZADORES
    -- ========================================================

    SELECT
        COUNT(*),
        COALESCE(
            SUM(
                CASE
                    WHEN is_verified THEN 1
                    ELSE 0
                END
            ),
            0
        )
    INTO
        v_total_users,
        v_verified_users
    FROM public.user_profiles;


    -- ========================================================
    -- WALLETS
    -- ========================================================

    SELECT
        COALESCE(
            SUM(
                COALESCE(
                    w.balance,
                    up.balance,
                    0
                )
            ),
            0
        ),

        COALESCE(
            SUM(
                COALESCE(
                    w.invested,
                    up.total_invested,
                    0
                )
            ),
            0
        ),

        COALESCE(
            SUM(
                COALESCE(
                    w.bonus_balance,
                    up.bonus_balance,
                    0
                )
            ),
            0
        ),

        COALESCE(
            SUM(
                COALESCE(
                    w.available_balance,
                    up.available_balance,
                    w.balance,
                    up.balance,
                    0
                )
            ),
            0
        )

    INTO
        v_total_balance,
        v_total_invested,
        v_total_bonus,
        v_total_available

    FROM public.user_profiles up

    LEFT JOIN public.wallets w
        ON w.profile_id = up.id;


    -- ========================================================
    -- INVESTIMENTOS
    -- ========================================================

    BEGIN

        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_investments'
              AND column_name = 'investment_package_id'
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_investments'
              AND column_name = 'package_id'
        )
        THEN

            EXECUTE '
                SELECT
                    COALESCE(
                        SUM(
                            ui.amount *
                            (
                                COALESCE(ip.daily_profit, 0)
                                /
                                NULLIF(
                                    COALESCE(
                                        ip.minimum_investment,
                                        ui.amount
                                    ),
                                    0
                                )
                            )
                        ),
                        0
                    ),
                    COUNT(*)

                FROM public.user_investments ui

                LEFT JOIN public.investment_packages ip
                    ON ip.id =
                        COALESCE(
                            ui.investment_package_id,
                            ui.package_id
                        )

                WHERE ui.status = ''active''
            '
            INTO
                v_total_profits,
                v_active_investments;


        ELSIF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_investments'
              AND column_name = 'investment_package_id'
        )
        THEN

            EXECUTE '
                SELECT
                    COALESCE(
                        SUM(
                            ui.amount *
                            (
                                COALESCE(ip.daily_profit, 0)
                                /
                                NULLIF(
                                    COALESCE(
                                        ip.minimum_investment,
                                        ui.amount
                                    ),
                                    0
                                )
                            )
                        ),
                        0
                    ),
                    COUNT(*)

                FROM public.user_investments ui

                LEFT JOIN public.investment_packages ip
                    ON ip.id = ui.investment_package_id

                WHERE ui.status = ''active''
            '
            INTO
                v_total_profits,
                v_active_investments;


        ELSIF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'user_investments'
              AND column_name = 'package_id'
        )
        THEN

            EXECUTE '
                SELECT
                    COALESCE(
                        SUM(
                            ui.amount *
                            (
                                COALESCE(ip.daily_profit, 0)
                                /
                                NULLIF(
                                    COALESCE(
                                        ip.minimum_investment,
                                        ui.amount
                                    ),
                                    0
                                )
                            )
                        ),
                        0
                    ),
                    COUNT(*)

                FROM public.user_investments ui

                LEFT JOIN public.investment_packages ip
                    ON ip.id = ui.package_id

                WHERE ui.status = ''active''
            '
            INTO
                v_total_profits,
                v_active_investments;

        ELSE

            SELECT
                0,
                COUNT(*)
            INTO
                v_total_profits,
                v_active_investments
            FROM public.user_investments
            WHERE status = 'active';

        END IF;

    EXCEPTION
        WHEN OTHERS THEN

            v_total_profits := 0;
            v_active_investments := 0;

    END;


    -- ========================================================
    -- DEPÓSITOS APROVADOS
    -- ========================================================

    SELECT
        COUNT(*),
        COALESCE(SUM(amount), 0)

    INTO
        v_total_deposits_count,
        v_total_deposits_approved

    FROM public.deposits

    WHERE status = 'approved';


    -- ========================================================
    -- SAQUES APROVADOS / PAGOS
    -- ========================================================

    SELECT
        COUNT(*)

    INTO
        v_total_withdrawals_count

    FROM public.withdrawals

    WHERE status IN ('approved', 'paid');


    -- ========================================================
    -- DEPÓSITOS PENDENTES
    -- ========================================================

    SELECT
        COUNT(*),
        COALESCE(SUM(amount), 0)

    INTO
        v_pending_deposits_count,
        v_pending_deposits_amount

    FROM public.deposits

    WHERE status = 'pending';


    -- ========================================================
    -- SAQUES PENDENTES
    -- ========================================================

    SELECT
        COUNT(*),
        COALESCE(
            SUM(
                amount + COALESCE(fee, 0)
            ),
            0
        )

    INTO
        v_pending_withdrawals_count,
        v_pending_withdrawals_amount

    FROM public.withdrawals

    WHERE status = 'pending';


    -- ========================================================
    -- TOTAL SAQUES PAGOS
    -- ========================================================

    SELECT
        COALESCE(SUM(amount), 0)

    INTO
        v_total_withdrawals_paid

    FROM public.withdrawals

    WHERE status IN ('approved', 'paid');


    -- ========================================================
    -- POUPANÇA
    -- ========================================================

    SELECT
        COUNT(*),
        COALESCE(SUM(amount_applied), 0)

    INTO
        v_total_savings_applications,
        v_active_savings_value

    FROM public.savings_applications

    WHERE status IN ('active', 'locked');


    -- ========================================================
    -- RETORNO
    -- ========================================================

    RETURN jsonb_build_object(

        'total_users',
        COALESCE(v_total_users, 0),

        'verified_users',
        COALESCE(v_verified_users, 0),

        'total_balance',
        COALESCE(v_total_balance, 0),

        'total_available',
        COALESCE(v_total_available, 0),

        'total_invested',
        COALESCE(v_total_invested, 0),

        'total_profits',
        COALESCE(v_total_profits, 0),

        'total_bonus',
        COALESCE(v_total_bonus, 0),

        'active_investments',
        COALESCE(v_active_investments, 0),

        'total_deposits_count',
        COALESCE(v_total_deposits_count, 0),

        'pending_deposits_count',
        COALESCE(v_pending_deposits_count, 0),

        'total_deposits_value',
        COALESCE(v_total_deposits_approved, 0),

        'pending_deposits_value',
        COALESCE(v_pending_deposits_amount, 0),

        'total_withdrawals_count',
        COALESCE(v_total_withdrawals_count, 0),

        'pending_withdrawals_count',
        COALESCE(v_pending_withdrawals_count, 0),

        'total_withdrawals_value',
        COALESCE(v_total_withdrawals_paid, 0),

        'pending_withdrawals_value',
        COALESCE(v_pending_withdrawals_amount, 0),

        'total_savings_applications',
        COALESCE(v_total_savings_applications, 0),

        'active_savings_value',
        COALESCE(v_active_savings_value, 0)

    );

END;
$$;


GRANT EXECUTE
ON FUNCTION public.admin_dashboard_summary()
TO authenticated, anon;


-- ============================================================
-- E1) ALIAS admin_dashboard_stats
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN

    RETURN public.admin_dashboard_summary();

END;
$$;


GRANT EXECUTE
ON FUNCTION public.admin_dashboard_stats()
TO authenticated, anon;


-- ============================================================
-- F) REFRESH SAVINGS STATUS
--
-- CORRIGIDO:
--
-- ERRADO:
-- GET DIAGNOSTICS v_updated = v_updated + ROW_COUNT;
--
-- CORRETO:
-- GET DIAGNOSTICS v_row_count = ROW_COUNT;
-- v_updated := v_updated + v_row_count;
-- ============================================================

DROP FUNCTION IF EXISTS public.refresh_savings_status();


CREATE OR REPLACE FUNCTION public.refresh_savings_status()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE

    v_updated INTEGER := 0;
    v_row_count INTEGER := 0;

BEGIN

    -- ========================================================
    -- ACTIVE -> LOCKED
    -- ========================================================

    UPDATE public.savings_applications

    SET
        status = 'locked',
        updated_at = NOW()

    WHERE status = 'active';


    GET DIAGNOSTICS v_row_count = ROW_COUNT;


    v_updated := v_updated + v_row_count;


    -- ========================================================
    -- LOCKED -> READY
    -- ========================================================

    UPDATE public.savings_applications

    SET
        status = 'ready',
        updated_at = NOW()

    WHERE status = 'locked'
      AND release_at <= NOW();


    GET DIAGNOSTICS v_row_count = ROW_COUNT;


    v_updated := v_updated + v_row_count;


    RETURN v_updated;

END;
$$;


GRANT EXECUTE
ON FUNCTION public.refresh_savings_status()
TO authenticated, anon;


-- ============================================================
-- G) CREATE SAVINGS APPLICATION
-- ============================================================

DROP FUNCTION IF EXISTS public.create_savings_application(NUMERIC);


CREATE OR REPLACE FUNCTION public.create_savings_application(
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$

DECLARE

    v_auth_uid UUID;
    v_profile_id UUID;
    v_wallet_id UUID;

    v_available NUMERIC := 0;
    v_balance NUMERIC := 0;

    v_minimum CONSTANT NUMERIC := 5000;
    v_hours CONSTANT INTEGER := 72;
    v_multiplier CONSTANT NUMERIC := 2;

    v_savings_id UUID;

    v_release_at TIMESTAMPTZ;
    v_amount_to_receive NUMERIC;

    v_new_available NUMERIC;
    v_new_balance NUMERIC;

BEGIN

    -- ========================================================
    -- AUTENTICAÇÃO
    -- ========================================================

    v_auth_uid := auth.uid();


    IF v_auth_uid IS NULL THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Sessão expirada. Faça login novamente.'
        );

    END IF;


    -- ========================================================
    -- PERFIL
    -- ========================================================

    SELECT up.id

    INTO v_profile_id

    FROM public.user_profiles up

    WHERE up.auth_user_id = v_auth_uid

    LIMIT 1;


    IF v_profile_id IS NULL THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Perfil não encontrado.'
        );

    END IF;


    -- ========================================================
    -- VALIDAÇÃO
    -- ========================================================

    IF p_amount IS NULL
       OR p_amount <= 0
    THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Valor inválido.'
        );

    END IF;


    IF p_amount < v_minimum THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Valor mínimo para poupança é MZN 5.000,00.'
        );

    END IF;


    -- ========================================================
    -- SALDO
    -- ========================================================

    SELECT
        w.id,

        COALESCE(
            w.available_balance,
            w.balance,
            up.available_balance,
            up.balance,
            0
        ),

        COALESCE(
            w.balance,
            up.balance,
            0
        )

    INTO
        v_wallet_id,
        v_available,
        v_balance

    FROM public.user_profiles up

    LEFT JOIN public.wallets w
        ON w.profile_id = up.id

    WHERE up.id = v_profile_id

    LIMIT 1;


    IF v_available < p_amount THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Saldo disponível insuficiente para aplicar na poupança.'
        );

    END IF;


    -- ========================================================
    -- CÁLCULOS
    -- ========================================================

    v_amount_to_receive :=
        ROUND(
            p_amount * v_multiplier,
            2
        );


    v_release_at :=
        NOW()
        + (v_hours || ' hours')::INTERVAL;


    v_new_available :=
        ROUND(
            v_available - p_amount,
            2
        );


    v_new_balance :=
        ROUND(
            COALESCE(
                v_balance,
                v_available
            ) - p_amount,
            2
        );


    -- ========================================================
    -- DEBITAR WALLET
    -- ========================================================

    IF v_wallet_id IS NOT NULL THEN

        UPDATE public.wallets

        SET
            available_balance = v_new_available,
            balance = v_new_balance,
            updated_at = NOW()

        WHERE id = v_wallet_id;

    END IF;


    -- ========================================================
    -- SINCRONIZAR USER PROFILE
    -- ========================================================

    UPDATE public.user_profiles

    SET
        available_balance = v_new_available,
        balance = v_new_balance,
        updated_at = NOW()

    WHERE id = v_profile_id;


    -- ========================================================
    -- CRIAR POUPANÇA
    -- ========================================================

    INSERT INTO public.savings_applications (

        profile_id,
        wallet_id,
        amount_applied,
        amount_to_receive,
        status,
        start_at,
        release_at,
        created_at,
        updated_at

    )

    VALUES (

        v_profile_id,
        v_wallet_id,
        p_amount,
        v_amount_to_receive,
        'locked',
        NOW(),
        v_release_at,
        NOW(),
        NOW()

    )

    RETURNING id
    INTO v_savings_id;


    -- ========================================================
    -- RETORNO
    -- ========================================================

    RETURN jsonb_build_object(

        'success',
        true,

        'message',
        'Poupança criada com sucesso! Prazo de 72h em curso.',

        'savings_id',
        v_savings_id,

        'start_at',
        NOW(),

        'release_at',
        v_release_at,

        'amount_applied',
        p_amount,

        'amount_to_receive',
        v_amount_to_receive,

        'new_available_balance',
        v_new_available,

        'new_balance',
        v_new_balance

    );

END;
$$;


GRANT EXECUTE
ON FUNCTION public.create_savings_application(NUMERIC)
TO authenticated, anon;


-- ============================================================
-- H) SETTLE SAVINGS APPLICATION
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

    v_new_available NUMERIC;
    v_new_balance NUMERIC;

BEGIN

    -- ========================================================
    -- AUTENTICAÇÃO
    -- ========================================================

    v_auth_uid := auth.uid();


    IF v_auth_uid IS NULL THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Sessão expirada. Faça login novamente.'
        );

    END IF;


    -- ========================================================
    -- PERFIL
    -- ========================================================

    SELECT up.id

    INTO v_profile_id

    FROM public.user_profiles up

    WHERE up.auth_user_id = v_auth_uid

    LIMIT 1;


    IF v_profile_id IS NULL THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Perfil não encontrado.'
        );

    END IF;


    -- ========================================================
    -- POUPANÇA
    -- ========================================================

    SELECT *

    INTO v_sa

    FROM public.savings_applications sa

    WHERE sa.id = p_savings_id;


    IF v_sa IS NULL
       OR v_sa.id IS NULL
    THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Aplicação de poupança não encontrada.'
        );

    END IF;


    -- ========================================================
    -- PERMISSÃO
    -- ========================================================

    IF v_sa.profile_id <> v_profile_id
       AND NOT public.is_current_admin()
    THEN

        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Sem permissão para receber esta poupança.'
        );

    END IF;


    -- ========================================================
    -- LIBERAR AUTOMATICAMENTE SE JÁ PASSARAM 72 HORAS
    -- ========================================================

    IF v_sa.status = 'locked'
       AND v_sa.release_at <= NOW()
    THEN

        v_sa.status := 'ready';

    END IF;


    -- ========================================================
    -- VALIDAR STATUS
    -- ========================================================

    IF v_sa.status <> 'ready' THEN

        IF v_sa.status = 'completed' THEN

            RETURN jsonb_build_object(
                'success', false,
                'message',
                'Esta poupança já foi recebida.'
            );

        END IF;


        IF v_sa.status IN ('cancelled', 'expired') THEN

            RETURN jsonb_build_object(
                'success', false,
                'message',
                'Esta poupança foi cancelada/expirada.'
            );

        END IF;


        RETURN jsonb_build_object(
            'success', false,
            'message',
            'Prazo de 72h ainda não decorrido. Aguarde a liberação.'
        );

    END IF;


    -- ========================================================
    -- SALDO ATUAL
    -- ========================================================

    SELECT
        w.id,

        COALESCE(
            w.available_balance,
            w.balance,
            up.available_balance,
            up.balance,
            0
        ),

        COALESCE(
            w.balance,
            up.balance,
            0
        )

    INTO
        v_wallet_id,
        v_available,
        v_balance

    FROM public.user_profiles up

    LEFT JOIN public.wallets w
        ON w.profile_id = up.id

    WHERE up.id = v_sa.profile_id

    LIMIT 1;


    -- ========================================================
    -- NOVO SALDO
    -- ========================================================

    v_new_available :=
        ROUND(
            COALESCE(v_available, 0)
            + v_sa.amount_to_receive,
            2
        );


    v_new_balance :=
        ROUND(
            COALESCE(
                v_balance,
                v_available,
                0
            )
            + v_sa.amount_to_receive,
            2
        );


    -- ========================================================
    -- CREDITAR WALLET
    -- ========================================================

    IF v_wallet_id IS NOT NULL THEN

        UPDATE public.wallets

        SET
            available_balance = v_new_available,
            balance = v_new_balance,
            updated_at = NOW()

        WHERE id = v_wallet_id;

    END IF;


    -- ========================================================
    -- CREDITAR USER PROFILE
    -- ========================================================

    UPDATE public.user_profiles

    SET
        available_balance = v_new_available,
        balance = v_new_balance,
        updated_at = NOW()

    WHERE id = v_sa.profile_id;


    -- ========================================================
    -- MARCAR COMO COMPLETADO
    -- ========================================================

    UPDATE public.savings_applications

    SET
        status = 'completed',
        settled_at = NOW(),
        updated_at = NOW()

    WHERE id = p_savings_id;


    -- ========================================================
    -- RETORNO
    -- ========================================================

    RETURN jsonb_build_object(

        'success',
        true,

        'message',
        'Poupança recebida com sucesso! Valor creditado no seu saldo.',

        'savings_id',
        p_savings_id,

        'amount_received',
        v_sa.amount_to_receive,

        'new_available_balance',
        v_new_available,

        'new_balance',
        v_new_balance

    );

END;
$$;


GRANT EXECUTE
ON FUNCTION public.settle_savings_application(UUID)
TO authenticated, anon;


-- ============================================================
-- I) VIEW savings_applications_view
-- ============================================================

DROP VIEW IF EXISTS public.savings_applications_view;


CREATE VIEW public.savings_applications_view
AS

SELECT

    sa.id,

    sa.profile_id,

    sa.wallet_id,

    sa.amount_applied,

    sa.amount_to_receive,

    sa.status,

    CASE

        WHEN sa.status IN (
            'completed',
            'cancelled',
            'expired'
        )
        THEN sa.status

        WHEN sa.status = 'ready'
        THEN 'ready'

        WHEN NOW() >= sa.release_at
        THEN 'ready'

        WHEN sa.status = 'active'
        THEN 'locked'

        ELSE sa.status

    END AS effective_status,

    GREATEST(
        0,
        EXTRACT(
            EPOCH FROM (
                sa.release_at - NOW()
            )
        )
    )::BIGINT AS remaining_seconds,

    sa.start_at,

    sa.release_at,

    sa.settled_at,

    sa.cancelled_at,

    sa.created_at,

    sa.updated_at

FROM public.savings_applications sa;


GRANT SELECT
ON public.savings_applications_view
TO authenticated;


-- ============================================================
-- J) GARANTIR SECURITY DEFINER
-- ============================================================

ALTER FUNCTION
    public.refresh_savings_status()
SECURITY DEFINER;

ALTER FUNCTION
    public.refresh_savings_status()
SET search_path = public;


ALTER FUNCTION
    public.create_savings_application(NUMERIC)
SECURITY DEFINER;

ALTER FUNCTION
    public.create_savings_application(NUMERIC)
SET search_path = public;


ALTER FUNCTION
    public.settle_savings_application(UUID)
SECURITY DEFINER;

ALTER FUNCTION
    public.settle_savings_application(UUID)
SET search_path = public;


ALTER FUNCTION
    public.admin_dashboard_summary()
SECURITY DEFINER;

ALTER FUNCTION
    public.admin_dashboard_summary()
SET search_path = public;


ALTER FUNCTION
    public.admin_dashboard_stats()
SECURITY DEFINER;

ALTER FUNCTION
    public.admin_dashboard_stats()
SET search_path = public;


ALTER FUNCTION
    public.admin_list_users(TEXT, INTEGER, INTEGER)
SECURITY DEFINER;

ALTER FUNCTION
    public.admin_list_users(TEXT, INTEGER, INTEGER)
SET search_path = public;


-- ============================================================
-- K) TRIGGER updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.trg_set_updated_at_savings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN

    NEW.updated_at := NOW();

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
    trg_savings_updated_at
ON public.savings_applications;


CREATE TRIGGER
    trg_savings_updated_at

BEFORE UPDATE
ON public.savings_applications

FOR EACH ROW

EXECUTE FUNCTION
    public.trg_set_updated_at_savings();


-- ============================================================
-- L) TESTES BÁSICOS
-- ============================================================

SELECT
    public.refresh_savings_status()
    AS savings_rows_updated;


SELECT
    public.admin_dashboard_summary()
    AS admin_dashboard_test;


-- ============================================================
-- FINAL
-- ============================================================

SELECT
    'Migration 005 atualizada aplicada com sucesso!' AS status;
