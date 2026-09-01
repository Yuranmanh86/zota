-- =====================================================================
-- Migração 007: Adiciona coluna is_support_user para usuário SUPORTE ZORA
-- =====================================================================
-- Objetivo: Permitir que um perfil user_profiles seja marcado como
-- "SUPORTE ZORA" (selo de verificação + nome de exibição substituído)
-- configurável diretamente no Supabase pelo administrador.
-- =====================================================================

-- 1. Adiciona a coluna booleana is_support_user (se não existir)
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS is_support_user BOOLEAN DEFAULT FALSE;

-- 2. Garante RLS (Row Level Security) - utilizadores autenticados podem LER a coluna
--    (Apenas administradores devem poder ALTERAR — mantém políticas existentes)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles'
      AND policyname = 'user_profiles_select_policy'
  ) THEN
    -- Política já existe; não a alteramos para não quebrar configurações
    NULL;
  END IF;
END $$;

-- =====================================================================
-- 3. EXEMPLOS DE USO (executar separadamente no SQL Editor do Supabase):
-- =====================================================================

-- Para marcar um perfil EXISTENTE como SUPORTE ZORA (altere o UUID):
-- UPDATE public.user_profiles
-- SET is_support_user = TRUE
-- WHERE id = '00000000-0000-0000-0000-000000000099';  ← ID do perfil ZORA_SYSTEM

-- Para marcar OUTRO perfil (ex: um atendente real):
-- UPDATE public.user_profiles
-- SET is_support_user = TRUE
-- WHERE id = '<UUID-DO-PERFIL-DE-SUPORTE>';

-- Para remover o selo de um perfil:
-- UPDATE public.user_profiles
-- SET is_support_user = FALSE
-- WHERE id = '<UUID-DO-PERFIL>';

-- Para ver todos os perfis marcados como suporte:
-- SELECT id, full_name, phone_number, is_support_user
-- FROM public.user_profiles
-- WHERE is_support_user = TRUE;
