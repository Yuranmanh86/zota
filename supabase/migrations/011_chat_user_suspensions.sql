-- Suspensão temporária de envio de mensagens por usuário.
-- A regra é aplicada no banco para cobrir chats públicos e privados.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

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
  IF NOT public.is_current_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas administradores podem suspender utilizadores.');
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

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Utilizador suspenso por %s horas.', p_hours),
    'suspended_until', v_until,
    'suspension_reason', (SELECT suspension_reason FROM public.user_profiles WHERE id = p_profile_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_profile_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_current_admin() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas administradores podem reativar utilizadores.');
  END IF;

  UPDATE public.user_profiles
  SET suspended_until = NULL,
      suspension_reason = NULL,
      updated_at = now()
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'message', 'Envio de mensagens reativado.');
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_chat_restriction()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMPTZ;
  v_reason TEXT;
BEGIN
  SELECT suspended_until, suspension_reason
  INTO v_until, v_reason
  FROM public.user_profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;

  IF v_until IS NULL OR v_until <= now() THEN
    RETURN jsonb_build_object('suspended', false, 'suspended_until', NULL, 'reason', NULL);
  END IF;

  RETURN jsonb_build_object('suspended', true, 'suspended_until', v_until, 'reason', v_reason);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unsuspend_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_chat_restriction() TO authenticated;

DROP POLICY IF EXISTS policy_chat_messages_insert ON public.chat_messages;
CREATE POLICY policy_chat_messages_insert
  ON public.chat_messages
  FOR INSERT
  WITH CHECK (
    auth.uid() = (SELECT auth_user_id FROM public.user_profiles WHERE id = public.chat_messages.sender_profile_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles sender
      WHERE sender.id = public.chat_messages.sender_profile_id
        AND (sender.suspended_until IS NULL OR sender.suspended_until <= now())
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.chat_threads ct
        WHERE ct.id = public.chat_messages.chat_thread_id
          AND ct.is_public
      )
      OR EXISTS (
        SELECT 1
        FROM public.chat_thread_members m
        JOIN public.user_profiles up ON up.id = m.profile_id
        WHERE m.chat_thread_id = public.chat_messages.chat_thread_id
          AND up.auth_user_id = auth.uid()
      )
    )
  );

COMMENT ON COLUMN public.user_profiles.suspended_until IS 'Fim da suspensão temporária de envio de mensagens.';
COMMENT ON COLUMN public.user_profiles.suspension_reason IS 'Motivo apresentado ao utilizador durante a suspensão.';
