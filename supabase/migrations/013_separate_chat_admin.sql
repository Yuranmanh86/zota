-- Permissão independente para moderadores do chat.
-- is_admin continua reservado ao painel financeiro.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS is_chat_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE FUNCTION public.is_current_chat_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
      AND is_chat_admin = TRUE
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_chat_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_profile_id UUID,
  p_hours INTEGER DEFAULT 4,
  p_reason TEXT DEFAULT 'Por motivos de conteúdo que viola as políticas do Zora.'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  IF NOT public.is_current_chat_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas moderadores do chat podem suspender utilizadores.');
  END IF;
  IF p_profile_id IS NULL OR p_hours < 1 OR p_hours > 720 THEN
    RETURN jsonb_build_object('success', false, 'message', 'A duração deve estar entre 1 e 720 horas.');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_profiles WHERE id = p_profile_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Utilizador não encontrado.');
  END IF;

  v_until := now() + make_interval(hours => p_hours);
  UPDATE public.user_profiles
  SET suspended_until = v_until,
      suspension_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Por motivos de conteúdo que viola as políticas do Zora.'),
      updated_at = now()
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'message', format('Utilizador suspenso por %s horas.', p_hours));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_chat_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas moderadores do chat podem reativar utilizadores.');
  END IF;
  UPDATE public.user_profiles
  SET suspended_until = NULL, suspension_reason = NULL, updated_at = now()
  WHERE id = p_profile_id;
  RETURN jsonb_build_object('success', true, 'message', 'Envio de mensagens reativado.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(UUID) TO authenticated;
