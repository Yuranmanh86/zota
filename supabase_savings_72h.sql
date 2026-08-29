-- =================================================================
-- ZORA FINANCE APP — SISTEMA DE POUPANÇA 72H (RETORNO 2X)
-- Script para colar no Editor SQL do Supabase
-- Mínimo: 5.000 MZN | Prazo: 72 horas | Retorno: 100% (valor * 2)
-- =================================================================

BEGIN;

-- -----------------------------------------------------------------
-- 1. TABELA: savings_applications (Aplicações de Poupança)
-- -----------------------------------------------------------------
DROP TABLE IF EXISTS public.savings_applications CASCADE;

CREATE TABLE public.savings_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  wallet_id uuid REFERENCES public.wallets(id) ON DELETE SET NULL,
  amount_applied numeric(14,2) NOT NULL DEFAULT 0,
  amount_to_receive numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'locked',
  start_at timestamp with time zone NOT NULL DEFAULT now(),
  release_at timestamp with time zone NOT NULL DEFAULT (now() + INTERVAL '72 hours'),
  settled_at timestamp with time zone,
  cancelled_at timestamp with time zone,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chk_amount_positive CHECK (amount_applied >= 5000),
  CONSTRAINT chk_return CHECK (amount_to_receive = amount_applied * 2),
  CONSTRAINT chk_status CHECK (status IN ('locked', 'ready', 'completed', 'cancelled'))
);

COMMENT ON TABLE public.savings_applications IS 'Aplicações de poupança com prazo de 72h e retorno de 100% (2x o valor aplicado). Mínimo 5.000 MZN.';
COMMENT ON COLUMN public.savings_applications.amount_applied IS 'Valor aplicado (mínimo 5.000 MZN).';
COMMENT ON COLUMN public.savings_applications.amount_to_receive IS 'Valor a receber no vencimento (2x o aplicado).';
COMMENT ON COLUMN public.savings_applications.status IS 'locked = em espera | ready = liberado para sacar | completed = pago | cancelled = cancelado.';
COMMENT ON COLUMN public.savings_applications.release_at IS 'Data/hora em que o valor fica disponível para levantamento (start_at + 72h).';

CREATE INDEX IF NOT EXISTS idx_savings_applications_profile_id ON public.savings_applications (profile_id);
CREATE INDEX IF NOT EXISTS idx_savings_applications_status ON public.savings_applications (status);
CREATE INDEX IF NOT EXISTS idx_savings_applications_release_at ON public.savings_applications (release_at DESC);

-- Trigger updated_at
CREATE TRIGGER trg_savings_applications_updated_at
  BEFORE UPDATE ON public.savings_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.savings_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_savings_applications_select
  ON public.savings_applications
  FOR SELECT
  USING (auth.uid() = (SELECT auth_user_id FROM public.user_profiles WHERE id = public.savings_applications.profile_id));

CREATE POLICY policy_savings_applications_insert
  ON public.savings_applications
  FOR INSERT
  WITH CHECK (auth.uid() = (SELECT auth_user_id FROM public.user_profiles WHERE id = public.savings_applications.profile_id));

CREATE POLICY policy_savings_applications_update
  ON public.savings_applications
  FOR UPDATE
  USING (auth.uid() = (SELECT auth_user_id FROM public.user_profiles WHERE id = public.savings_applications.profile_id));

-- -----------------------------------------------------------------
-- 2. FUNÇÃO RPC: create_savings_application
--    Recebe: valor a aplicar. Valida saldo, debita carteira,
--    cria aplicação, cria transacção.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_savings_application(p_amount numeric(14,2))
RETURNS TABLE (
  success boolean,
  message text,
  savings_id uuid,
  start_at timestamptz,
  release_at timestamptz,
  amount_applied numeric(14,2),
  amount_to_receive numeric(14,2),
  new_available_balance numeric(14,2),
  new_balance numeric(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_wallet_id uuid;
  v_available numeric(14,2) := 0;
  v_balance numeric(14,2) := 0;
  v_min constant numeric := 5000;
  v_return_amount numeric(14,2);
  v_release timestamptz;
  v_now timestamptz := now();
  v_savings_id uuid;
  v_tx_id uuid;
BEGIN
  success := false;
  message := '';
  savings_id := null;
  start_at := null;
  release_at := null;
  amount_applied := 0;
  amount_to_receive := 0;
  new_available_balance := 0;
  new_balance := 0;

  IF v_auth_user_id IS NULL THEN
    message := 'Sessão expirada. Faça login novamente.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF p_amount IS NULL OR p_amount < v_min THEN
    message := 'Valor mínimo para poupança é de 5.000 MZN.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT up.id INTO v_profile_id
  FROM public.user_profiles up
  WHERE up.auth_user_id = v_auth_user_id
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    message := 'Perfil de utilizador não encontrado.';
    RETURN NEXT;
    RETURN;
  END IF;

  PERFORM public.get_or_create_wallet(v_profile_id);

  SELECT w.id, w.available_balance, w.balance
  INTO v_wallet_id, v_available, v_balance
  FROM public.wallets w
  WHERE w.profile_id = v_profile_id
  LIMIT 1;

  IF v_wallet_id IS NULL THEN
    message := 'Carteira não encontrada.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_available < p_amount THEN
    message := 'Saldo insuficiente. Disponível: ' || to_char(v_available, 'FM999G999G990D00') || ' MZN.';
    RETURN NEXT;
    RETURN;
  END IF;

  v_return_amount := p_amount * 2;
  v_release := v_now + INTERVAL '72 hours';

  UPDATE public.wallets
  SET
    available_balance = available_balance - p_amount,
    balance = balance - p_amount,
    updated_at = v_now
  WHERE id = v_wallet_id
  RETURNING available_balance, balance INTO new_available_balance, new_balance;

  INSERT INTO public.savings_applications (
    profile_id, wallet_id, amount_applied, amount_to_receive,
    status, start_at, release_at
  ) VALUES (
    v_profile_id, v_wallet_id, p_amount, v_return_amount,
    'locked', v_now, v_release
  ) RETURNING id INTO v_savings_id;

  INSERT INTO public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, savings_application_id
  ) VALUES (
    v_profile_id, v_wallet_id, 'savings', 'debit', p_amount,
    v_balance, new_balance, 'Aplicação em Poupança 72h', 'completed', v_now, v_savings_id
  ) RETURNING id INTO v_tx_id;

  UPDATE public.savings_applications
  SET transaction_id = v_tx_id, updated_at = v_now
  WHERE id = v_savings_id;

  success := true;
  message := 'Poupança criada com sucesso! O valor será liberado em 72 horas.';
  savings_id := v_savings_id;
  start_at := v_now;
  release_at := v_release;
  amount_applied := p_amount;
  amount_to_receive := v_return_amount;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.create_savings_application(numeric) IS 'Cria uma nova aplicação de poupança de 72h. Debita a carteira e retorna os dados da operação.';

-- -----------------------------------------------------------------
-- 3. FUNÇÃO RPC: settle_savings_application
--    Marca aplicação "ready" → "completed" e deposita o valor na carteira.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.settle_savings_application(p_savings_id uuid)
RETURNS TABLE (
  success boolean,
  message text,
  savings_id uuid,
  amount_received numeric(14,2),
  new_available_balance numeric(14,2),
  new_balance numeric(14,2)
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_auth_user_id uuid := auth.uid();
  v_profile_id uuid;
  v_savings public.savings_applications%ROWTYPE;
  v_new_available numeric(14,2);
  v_new_balance numeric(14,2);
  v_now timestamptz := now();
BEGIN
  success := false;
  message := '';
  savings_id := null;
  amount_received := 0;
  new_available_balance := 0;
  new_balance := 0;

  IF v_auth_user_id IS NULL THEN
    message := 'Sessão expirada.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT up.id INTO v_profile_id
  FROM public.user_profiles up
  WHERE up.auth_user_id = v_auth_user_id;

  SELECT * INTO v_savings
  FROM public.savings_applications s
  WHERE s.id = p_savings_id;

  IF NOT FOUND OR v_savings.profile_id <> v_profile_id THEN
    message := 'Aplicação de poupança não encontrada.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_savings.status NOT IN ('ready', 'locked') THEN
    message := 'Esta poupança já foi processada ou cancelada.';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_savings.status = 'locked' AND v_now < v_savings.release_at THEN
    message := 'Prazo de 72h ainda não concluído. Aguarde a liberação.';
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.wallets w
  SET
    available_balance = w.available_balance + v_savings.amount_to_receive,
    balance = w.balance + v_savings.amount_to_receive,
    updated_at = v_now
  WHERE w.id = v_savings.wallet_id
  RETURNING w.available_balance, w.balance INTO v_new_available, v_new_balance;

  UPDATE public.savings_applications s
  SET
    status = 'completed',
    settled_at = v_now,
    updated_at = v_now
  WHERE s.id = v_savings.id;

  INSERT INTO public.transactions (
    profile_id, wallet_id, transaction_type, direction, amount,
    balance_before, balance_after, description, status, processed_at, savings_application_id
  ) VALUES (
    v_savings.profile_id, v_savings.wallet_id, 'savings', 'credit',
    v_savings.amount_to_receive,
    v_new_balance - v_savings.amount_to_receive, v_new_balance,
    'Recebimento Poupança 72h (rendimento +100%)',
    'completed', v_now, v_savings.id
  );

  success := true;
  message := 'Valor recebido com sucesso! Rendimento de 100% creditado na carteira.';
  savings_id := v_savings.id;
  amount_received := v_savings.amount_to_receive;
  new_available_balance := v_new_available;
  new_balance := v_new_balance;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.settle_savings_application(uuid) IS 'Conclui a poupança após 72h e credita o valor de retorno (2x) na carteira.';

-- -----------------------------------------------------------------
-- 4. FUNÇÃO AUXILIAR: refresh_savings_status
--    Atualiza automaticamente "locked" → "ready" quando passar de 72h.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_savings_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.savings_applications
  SET status = 'ready', updated_at = now()
  WHERE status = 'locked' AND now() >= release_at;
END;
$$;

COMMENT ON FUNCTION public.refresh_savings_status() IS 'Atualiza poupanças vencidas de locked para ready. Chamar antes de listar.';

-- -----------------------------------------------------------------
-- 5. VIEW: savings_applications (compatibilidade + status atualizado)
-- -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.savings_applications_view AS
SELECT
  s.*,
  CASE
    WHEN s.status = 'locked' AND now() >= s.release_at THEN 'ready'
    ELSE s.status
  END AS effective_status,
  GREATEST(0, EXTRACT(EPOCH FROM (s.release_at - now())))::bigint AS remaining_seconds
FROM public.savings_applications s;

COMMENT ON VIEW public.savings_applications_view IS 'View de poupanças com effective_status (já atualiza ready se passou 72h) e remaining_seconds restantes.';

-- -----------------------------------------------------------------
-- 6. VIEW de compatibilidade (savings_applications → nome antigo)
-- -----------------------------------------------------------------
CREATE OR REPLACE VIEW public.poupancas AS
SELECT * FROM public.savings_applications_view;

COMMIT;

-- =================================================================
-- FIM DO SCRIPT. Copie tudo e cole no Editor SQL do Supabase.
-- =================================================================
