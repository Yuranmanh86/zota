# Zora Finance Super App

## Visão geral
Este projeto inicia a base de um Super App Financeiro com foco em Moçambique, combinando carteira digital, investimentos, poupança, xitique, empréstimos e suporte inteligente.

## Frontend
- React Native + Expo SDK 57
- TypeScript
- React Navigation
- Zustand para estado global
- TanStack Query para integração com API
- Axios para comunicação com backend

## Backend
A arquitetura recomendada é modular e limpa, com módulos separados para autenticação, utilizadores, carteira, poupança, investimentos, xitique, empréstimos, transações, notificações, chat, comunidade, IA, suporte, administração, relatórios e segurança.

## Regras financeiras
- Todos os cálculos financeiros devem acontecer no backend.
- Operações críticas devem ser executadas dentro de transações ACID.
- A aplicação cliente deve consumir dados e não confiar em cálculos locais.

## Modificações - Tela de Investimentos
### Numeração de Investimentos (N1-N9)
**Data**: 04/08/2026
**Descrição**: Adicionada numeração visual dos investimentos na tela InvestmentsScreen com badges numeradas de N1 a N9.

**Alterações implementadas**:
1. **InvestmentCard.tsx**:
   - Adicionado prop `index` ao tipo `InvestmentCardProps`
   - Criado badge numérico posicionado no canto superior esquerdo do card
   - Badge com fundo laranja (#FF7A00) e texto branco, dimensões 40x40px
   - Exibe o número no formato "N1", "N2", ... "N9"

2. **InvestmentsScreen.tsx**:
   - Atualizado map de investimentos para passar o índice ao componente InvestmentCard
   - Cada investimento recebe um número sequencial baseado na sua posição na lista filtrada

**Oportunidades de investimento** (na ordem listada):
- N1: Apple (Tecnologia)
- N2: Microsoft (Tecnologia)
- N3: Coca-Cola (Consumo)
- N4: Tesla (Automóveis/Tecnologia)
- N5: Amazon (Comércio/Tecnologia)
- N6: Google (Tecnologia)
- N7: Nvidia (IA)
- N8: Meta (Tecnologia)
- N9: Netflix (Entretenimento)
