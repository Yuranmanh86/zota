-- Permite que um participante veja os membros da sua própria conversa privada.
-- Isso é necessário para o app identificar o nome e telefone do outro participante.

CREATE OR REPLACE FUNCTION public.can_view_chat_thread_members(p_thread_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_thread_members member_row
    JOIN public.user_profiles profile_row ON profile_row.id = member_row.profile_id
    WHERE member_row.chat_thread_id = p_thread_id
      AND profile_row.auth_user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_chat_thread_members(UUID) TO authenticated;

DROP POLICY IF EXISTS policy_chat_thread_members_select ON public.chat_thread_members;
CREATE POLICY policy_chat_thread_members_select
  ON public.chat_thread_members
  FOR SELECT
  USING (public.can_view_chat_thread_members(chat_thread_id));
