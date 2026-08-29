# 🧪 Guia de Teste - Zora Finance

## 1️⃣ Preparação do Banco de Dados

### Passo 1: Abrir Supabase Workbench / Adminer
1. Abrir sua ferramenta de administração Supabase (Supabase Workbench, Adminer ou CLI)
2. Conectar ao banco `zora`
3. Abrir um novo query/editor

### Passo 2: Executar Script de Criação
1. Copiar todo o conteúdo de `database.sql`
2. Colar no editor SQL do Supabase (Supabase Workbench / Adminer / CLI)
3. Clicar em "Run"
4. Esperar até completar ✅

### Passo 3: Verificar Criação
```sql
-- Verificar tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'zora' 
ORDER BY table_name;

-- Verificar pacotes de investimento
SELECT * FROM investment_packages ORDER BY package_number;

-- Verificar grupo de suporte
SELECT * FROM chat_groups WHERE name = 'Suporte Zora';
```

## 2️⃣ Preparação do App

### Passo 1: Instalar Dependências
```bash
cd c:\Users\Yuran dos santos\Desktop\zora
npm install
npm --prefix backend install
```

### Passo 2: Verificar Variáveis de Ambiente
Abrir `.env` e confirmar que as variáveis para o backend e Supabase estão configuradas.

### Passo 3: Iniciar App
```bash
npx expo start
```

## 3️⃣ Teste de Registro

### Teste 1: Registrar Novo Usuário
1. Selecionar "Não tenho conta" ou "Register"
2. Preencher:
   - Email: `teste@example.com`
   - Senha: `SenhaForte123!`
   - Nome completo: `João Silva`
   - Telefone: `+258843123456`
3. Clicar "Registrar"

### Verificação
```sql
-- No editor SQL (Supabase)
SELECT * FROM auth.users WHERE email = 'teste@example.com';
SELECT * FROM user_profiles WHERE full_name = 'João Silva';
```

**Esperado:**
- ✅ Usuário em `auth.users`
- ✅ Perfil em `user_profiles`
- ✅ Carteira criada automaticamente em `wallets`
- ✅ Configurações criadas em `user_settings`

## 4️⃣ Teste de Login

### Teste 2: Fazer Login
1. Usar credenciais: 
   - Email: `teste@example.com`
   - Senha: `SenhaForte123!`
2. Clicar "Entrar"

**Esperado:**
- ✅ Sessão criada
- ✅ Redirecionado para Home
- ✅ Nome do usuário exibido

## 5️⃣ Teste de Home Screen

### Teste 3: Verificar Dashboard
1. Aguardar carregamento de dados
2. Verificar se exibe:
   - ✅ Nome do usuário
   - ✅ Saldo em MZN
   - ✅ Ativos
   - ✅ Lucro Acumulado
   - ✅ Xitique
   - ✅ Poupança
   - ✅ Investimento

### Verificação de Dados
```sql
-- Verificar carteira do usuário
SELECT * FROM wallets 
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'João Silva');

-- Verificar pacotes disponíveis
SELECT * FROM investment_packages 
WHERE is_active = true 
ORDER BY package_number;
```

**Esperado:**
- ✅ Saldo principal: 0 MZN (novo usuário)
- ✅ 9 pacotes disponíveis (N1 a N9)

## 6️⃣ Teste de Navegação

### Teste 4: Navegar Entre Abas
1. **Investimentos** → Verificar se lista pacotes N1-N9
2. **Chat** → Verificar se mostra grupos
3. **Perfil** → Verificar dados do usuário
4. **Wallet** → Verificar saldos

**Esperado:**
- ✅ Cada aba carrega dados sem erro

## 7️⃣ Teste de Operações

### Teste 5: Simular Investimento
```sql
-- Inserir investimento manualmente
INSERT INTO user_investments (
  user_id,
  package_id,
  value_invested,
  purchased_at,
  expiry_date,
  status,
  accumulated_profit
) VALUES (
  (SELECT id FROM user_profiles WHERE full_name = 'João Silva'),
  (SELECT id FROM investment_packages WHERE package_number = 1),
  500,
  NOW(),
  DATE_ADD(NOW(), INTERVAL 30 DAY),
  'active',
  10
);

-- Inserir lucro
INSERT INTO investment_profit_history (
  user_id,
  investment_id,
  package_id,
  profit,
  profit_date
) VALUES (
  (SELECT id FROM user_profiles WHERE full_name = 'João Silva'),
  (SELECT id FROM user_investments WHERE value_invested = 500 LIMIT 1),
  (SELECT id FROM investment_packages WHERE package_number = 1),
  10,
  NOW()
);

-- Atualizar saldo
UPDATE wallets 
SET principal_balance = 500, available_balance = 500
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'João Silva');
```

### Teste 6: Verificar Home com Dados
1. Voltar para Home
2. Atualizar dados (pull-to-refresh)
3. Verificar se exibe novos valores

**Esperado:**
- ✅ Saldo: 500 MZN
- ✅ Lucro: 10 MZN
- ✅ Investimentos: 1 ativo

## 8️⃣ Teste de Mensagens

### Teste 7: Enviar Mensagem
1. Ir para Chat
2. Abrir "Suporte Zora"
3. Enviar mensagem: "Olá!"

**Esperado:**
- ✅ Mensagem aparece na conversa
- ✅ Salva no banco de dados

```sql
-- Verificar mensagem
SELECT * FROM messages 
WHERE group_id = (SELECT id FROM chat_groups WHERE name = 'Suporte Zora')
ORDER BY created_at DESC LIMIT 1;
```

## 9️⃣ Teste de Logout

### Teste 8: Fazer Logout
1. Ir para Perfil
2. Clicar "Sair"

**Esperado:**
- ✅ Sessão encerrada
- ✅ Redirecionado para Login

## 🔟 Teste de Biometria

### Teste 9: Ativar Biometria
1. Ir para Perfil
2. Ativar "Biometria"
3. Fazer logout
4. Fazer login com impressão digital

**Esperado:**
- ✅ Biometria funciona (se disponível no device)

## 📊 Relatório de Testes

Após completar todos os testes, preencher:

| Teste | Status | Notas |
|-------|--------|-------|
| Banco de dados criado | ✅/❌ | |
| Registro funciona | ✅/❌ | |
| Login funciona | ✅/❌ | |
| Home carrega dados | ✅/❌ | |
| Navegação funciona | ✅/❌ | |
| Investimentos exibem | ✅/❌ | |
| Chat funciona | ✅/❌ | |
| Logout funciona | ✅/❌ | |

## 🐛 Troubleshooting

### Problema: "Erro ao conectar ao banco"
**Solução:**
1. Verificar variáveis do backend (`EXPO_PUBLIC_API_URL`, `Supabase_*`) em `.env`
2. Verificar internet
3. Testar em web primeiro (melhor debug)

### Problema: "Erro ao fazer login"
**Solução:**
1. Verificar se email/senha estão corretos
2. Verificar configurações do serviço de autenticação (backend)
3. Verificar permissões e regras de acesso no backend

### Problema: "Dados não carregam na Home"
**Solução:**
1. Abrir DevTools (F12)
2. Ver erros no console
3. Verificar regras de acesso no backend e permissões do usuário

### Problema: "Mensagem não envia"
**Solução:**
1. Verificar se usuário é membro do chat_group
2. Verificar regras de acesso em messages no backend
3. Verificar se message.sender_id tem acesso

## 📝 Notas Importantes

1. **RLS está ativo** - Dados são filtrados por `auth.uid()`
2. **Triggers automáticos** - Carteira e configurações criadas automaticamente
3. **AsyncStorage** - Sessão persiste entre aberturas do app
4. **Timestamps** - Todos os registros têm created_at e updated_at

## 🚀 Próximos Passos Após Testes

1. Criar mais usuários para testar multiplayer
2. Testar chat em tempo real entre usuários
3. Implementar tela de transferência entre usuários
4. Implementar xitique (sorteios)
5. Implementar notificações

---

**Última atualização:** 04/08/2026  
**Tempo estimado para completar:** 30-45 minutos

