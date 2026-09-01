-- Restaura os grupos oficiais apagados acidentalmente.
-- Idempotente: pode ser executada novamente sem duplicar threads ou membros.

BEGIN;

INSERT INTO public.chat_threads (
  id,
  title,
  is_group,
  thread_category,
  status,
  is_public,
  is_private,
  is_verified,
  created_by
)
VALUES
  (
    '00000000-0000-0000-0000-000000000001',
    'Suporte Zora',
    TRUE,
    'support',
    'Ativo',
    TRUE,
    FALSE,
    TRUE,
    NULL
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Poupança Zora',
    TRUE,
    'savings',
    'Ativo',
    TRUE,
    FALSE,
    TRUE,
    NULL
  )
ON CONFLICT (id) DO UPDATE
SET title = EXCLUDED.title,
    is_group = EXCLUDED.is_group,
    thread_category = EXCLUDED.thread_category,
    status = EXCLUDED.status,
    is_public = EXCLUDED.is_public,
    is_private = EXCLUDED.is_private,
    is_verified = EXCLUDED.is_verified;

INSERT INTO public.chat_thread_members (chat_thread_id, profile_id, role)
SELECT group_ids.id, profiles.id, 'participant'
FROM (
  VALUES
    ('00000000-0000-0000-0000-000000000001'::uuid),
    ('00000000-0000-0000-0000-000000000002'::uuid)
) AS group_ids(id)
CROSS JOIN public.user_profiles AS profiles
ON CONFLICT (profile_id, chat_thread_id) DO NOTHING;

COMMIT;