# Zora Finance - Setup & Integração Supabase

## ✅ Status de Integração

Banco de dados Supabase (schema proposto) configurado com:
- ✅ 30+ tabelas normalizadas
- ✅ Triggers automáticos
- ✅ Views e funções SQL
- ✅ Autenticação integrada com serviço HTTP customizado (endpoints `/auth/*`)

## 🔧 Serviços Criados

### 1. **auth.ts** - Autenticação
- `signUpWithEmail()` - Registrar novo usuário
- `signInWithEmail()` - Login
- `signOut()` - Logout
- `getCurrentSession()` - Sessão atual
- `updateUserProfile()` - Atualizar perfil
- `enableBiometric()` - Habilitar biometria

### 2. **finance.ts** - Dados Financeiros
- `getUserProfile()` - Dados do usuário
- `getDashboardSummary()` - Resumo da home
- `getInvestmentPackages()` - Pacotes N1-N9
- `getUserInvestments()` - Investimentos do usuário
- `getUserSavings()` - Poupanças
- `getUserXitiques()` - Xitique participações

### 3. **chat.ts** - Chat e Mensagens
- `getChatGroups()` - Grupos do usuário
- `getGroupMessages()` - Mensagens de grupo
- `sendMessage()` - Enviar mensagem
- `deleteMessage()` - Deletar mensagem
- `addReaction()` - Reagir a mensagem
- `getContacts()` - Contatos
- `getOrCreatePrivateChat()` - Chat privado

## 🚀 Alterações no App

### AppNavigator.tsx
- ✅ Atualizado para usar tabela `user_profiles` (antes `profiles`)
- ✅ Usa coluna `full_name` (antes `nome_completo`)

### HomeScreen.tsx
- ✅ Integrado com `useDashboardSummary`
- ✅ Exibe dados reais do backend Supabase
- ✅ Formatação de moeda em MZN

### Componentes Atualizados
- ✅ InvestmentCard - Numeração N1-N9 no canto superior
- ✅ HomeScreen - Dashboard com dados reais

## 📋 Próximas Implementações

### Telas a Completar
1. **LoginScreen.tsx** - Integrar com `signInWithEmail()`
2. **RegisterScreen.tsx** - Integrar com `signUpWithEmail()`
3. **InvestScreen.tsx** - Compra de pacotes N1-N9
4. **WalletScreen.tsx** - Dados reais de carteira
5. **ChatScreen.tsx** - Integrar com `getChatGroups()`
6. **SavingsScreen.tsx** - Integrar com `getUserSavings()`

### Hooks a Criar
1. **useAuth()** - Context de autenticação
2. **useInvestments()** - Query de investimentos
3. **useChat()** - Query de chat em tempo real
4. **useWallet()** - Query de carteira

## 🔐 Variáveis de Ambiente

Verifique `.env` e configure as variáveis de conexão para o servidor backend/Supabase.

## 🗄️ Schema do Banco

O banco foi criado com as tabelas:

### Autenticação & Perfil
- `user_profiles` - Perfis de usuário (auth_user_id, full_name, invite_code, etc)
- `user_settings` - Configurações (idioma, tema, biometria, etc)

### Investimentos
- `investment_packages` - Pacotes N1-N9
- `user_investments` - Compras de pacotes
- `investment_profit_history` - Histórico de lucros

### Carteira
- `wallets` - Saldos (principal, blocked, available, analysis)
- `financial_transactions` - Todas as movimentações

### Poupança
- `savings_applications` - Aplicações de poupança
- `savings_history` - Histórico

### Xitique
- `xitique_groups` - Grupos de xitique
- `xitique_participants` - Participantes
- `xitique_contributions` - Contribuições
- `xitique_payments` - Pagamentos/sorteios

### Chat
- `chat_groups` - Grupos de chat
- `chat_group_participants` - Membros
- `messages` - Mensagens
- `message_reactions` - Reações a mensagens
- `contacts` - Contatos entre usuários

### Notificações & Auditoria
- `notifications` - Notificações do app
- `audit_logs` - Log de todas as operações
- `admin_logs` - Log de ações admin

## 💡 Notas Importantes

1. **Inserir pacotes iniciais**: Execute o script SQL no seu servidor Supabase (Supabase Workbench/cli)
2. **Criar grupo Suporte Zora**: Já criado por trigger automaticamente
3. **Controle de acesso**: Regras de acesso são implementadas no backend (cada usuário vê seus dados)
4. **Autenticação**: Use o serviço de autenticação HTTP (endpoints `/auth/*`)

## 🧪 Como Testar

1. Abrir app: `npx expo start`
2. Registrar novo usuário
3. Fazer login
4. Verificar se dados da home carregam
5. Navegar entre abas

## 📞 Suporte

Para debugging:
1. Verificar Console do Expo
2. Abrir ferramentas de administração do Supabase (Supabase Workbench / Adminer)
3. Consultar logs de RLS

---

**Última atualização:** 04/08/2026

