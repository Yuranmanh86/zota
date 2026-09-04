-- Restore the complete investment catalog used by the app.
-- Existing package IDs are preserved by the package_number upsert.

INSERT INTO public.investment_packages (
  package_number,
  name,
  description,
  minimum_investment,
  daily_profit,
  monthly_profit,
  is_active
)
VALUES
  (1, 'N1 - Pacote Iniciante', 'Pacote de investimento nível 1 - ideal para começar', 300, 10.5, 315, true),
  (2, 'N2 - Pacote Básico', 'Pacote de investimento nível 2', 500, 17.5, 525, true),
  (3, 'N3 - Pacote Intermediário', 'Pacote de investimento nível 3', 1000, 35, 1050, true),
  (4, 'N4 - Pacote Avançado', 'Pacote de investimento nível 4', 5000, 175, 5250, true),
  (5, 'N5 - Pacote Premium', 'Pacote de investimento nível 5', 10000, 350, 10500, true),
  (6, 'N6 - Pacote Elite', 'Pacote de investimento nível 6', 15000, 525, 15750, true),
  (7, 'N7 - Pacote Master', 'Pacote de investimento nível 7', 20000, 700, 21000, true),
  (8, 'N8 - Pacote VIP', 'Pacote de investimento nível 8', 25000, 875, 26250, true),
  (9, 'N9 - Pacote Imperial', 'Pacote de investimento nível 9 - máximo retorno', 30000, 1050, 31500, true)
ON CONFLICT (package_number) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  minimum_investment = EXCLUDED.minimum_investment,
  daily_profit = EXCLUDED.daily_profit,
  monthly_profit = EXCLUDED.monthly_profit,
  is_active = EXCLUDED.is_active,
  updated_at = now();
