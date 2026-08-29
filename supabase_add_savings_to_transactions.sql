-- ============================================================
-- INCREMENTO: Adicionar savings_application_id na tabela transactions
-- Executar APÓS o script supabase_schema.sql original
-- ============================================================

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS savings_application_id uuid
  REFERENCES public.savings_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_savings_application_id
  ON public.transactions (savings_application_id);

COMMENT ON COLUMN public.transactions.savings_application_id
  IS 'Referência à poupança que originou a transacção (aplicação ou recebimento).';
