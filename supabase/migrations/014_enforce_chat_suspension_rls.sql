-- Reforça a proteção da suspensão no banco.
-- Remove policies antigas/permissivas de INSERT antes de criar a regra final.

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'chat_messages'
      AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.chat_messages', policy_record.policyname);
  END LOOP;
END;
$$;

CREATE POLICY policy_chat_messages_insert_suspension_guard
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = (
      SELECT profile.auth_user_id
      FROM public.user_profiles profile
      WHERE profile.id = chat_messages.sender_profile_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_profiles sender
      WHERE sender.id = chat_messages.sender_profile_id
        AND (sender.suspended_until IS NULL OR sender.suspended_until <= now())
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.chat_threads thread
        WHERE thread.id = chat_messages.chat_thread_id
          AND thread.is_public = TRUE
      )
      OR EXISTS (
        SELECT 1
        FROM public.chat_thread_members member_row
        JOIN public.user_profiles member_profile ON member_profile.id = member_row.profile_id
        WHERE member_row.chat_thread_id = chat_messages.chat_thread_id
          AND member_profile.auth_user_id = auth.uid()
      )
    )
  );

GRANT INSERT ON public.chat_messages TO authenticated;
