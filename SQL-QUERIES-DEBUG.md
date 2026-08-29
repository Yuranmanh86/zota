# 🔍 SQL Queries para Debug

## Autenticação & Perfil

### Verificar usuários registrados
```sql
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
ORDER BY created_at DESC;
```

### Verificar perfis de usuário
```sql
SELECT id, auth_user_id, full_name, phone_number, account_status, created_at 
FROM user_profiles 
ORDER BY created_at DESC;
```

### Verificar carteiras criadas
```sql
SELECT w.id, up.full_name, w.principal_balance, w.available_balance, w.blocked_balance 
FROM wallets w
JOIN user_profiles up ON w.user_id = up.id
ORDER BY w.created_at DESC;
```

### Verificar configurações de usuário
```sql
SELECT up.full_name, us.language, us.theme, us.biometric_enabled, us.notifications_enabled 
FROM user_settings us
JOIN user_profiles up ON us.user_id = up.id
ORDER BY us.created_at DESC;
```

## Investimentos

### Listar pacotes N1-N9
```sql
SELECT package_number, name, value, daily_profit, monthly_profit, duration_days, is_active 
FROM investment_packages 
ORDER BY package_number;
```

### Investimentos do usuário
```sql
SELECT up.full_name, ip.value_invested, p.name, p.package_number, ip.status, ip.accumulated_profit, ip.purchased_at 
FROM user_investments ip
JOIN user_profiles up ON ip.user_id = up.id
JOIN investment_packages p ON ip.package_id = p.id
ORDER BY ip.purchased_at DESC;
```

### Histórico de lucros
```sql
SELECT up.full_name, p.package_number, iph.profit, iph.profit_date, iph.payment_status 
FROM investment_profit_history iph
JOIN user_profiles up ON iph.user_id = up.id
JOIN investment_packages p ON iph.package_id = p.id
ORDER BY iph.profit_date DESC;
```

### Total investido por usuário
```sql
SELECT up.full_name, 
       COUNT(*) as total_investimentos,
       SUM(ui.value_invested) as valor_total,
       SUM(ui.accumulated_profit) as lucro_total
FROM user_investments ui
JOIN user_profiles up ON ui.user_id = up.id
WHERE ui.status = 'active'
GROUP BY ui.user_id, up.full_name
ORDER BY valor_total DESC;
```

## Poupança

### Aplicações de poupança
```sql
SELECT up.full_name, sa.amount, sa.interest_rate, sa.start_date, sa.expiry_date, sa.status, sa.profit 
FROM savings_applications sa
JOIN user_profiles up ON sa.user_id = up.id
ORDER BY sa.created_at DESC;
```

### Histórico de poupança
```sql
SELECT up.full_name, sh.amount, sh.interest_earned, sh.history_date 
FROM savings_history sh
JOIN user_profiles up ON sh.user_id = up.id
ORDER BY sh.history_date DESC;
```

## Xitique

### Grupos de Xitique
```sql
SELECT id, name, description, administrator_id, max_participants, contribution_value, frequency, status, created_at 
FROM xitique_groups 
ORDER BY created_at DESC;
```

### Participantes de Xitique
```sql
SELECT up.full_name, xg.name, xp.order_number, xp.status, xp.joined_at 
FROM xitique_participants xp
JOIN user_profiles up ON xp.user_id = up.id
JOIN xitique_groups xg ON xp.group_id = xg.id
ORDER BY xp.joined_at DESC;
```

### Contribuições de Xitique
```sql
SELECT xg.name, up.full_name, xc.contribution_date, xc.amount, xc.status 
FROM xitique_contributions xc
JOIN xitique_participants xp ON xc.participant_id = xp.id
JOIN user_profiles up ON xp.user_id = up.id
JOIN xitique_groups xg ON xc.group_id = xg.id
ORDER BY xc.contribution_date DESC;
```

## Chat

### Grupos de chat
```sql
SELECT id, name, description, is_community, created_by, member_count, created_at 
FROM chat_groups 
ORDER BY created_at DESC;
```

### Membros de grupo
```sql
SELECT cg.name, up.full_name, cgp.role, cgp.joined_at 
FROM chat_group_participants cgp
JOIN chat_groups cg ON cgp.group_id = cg.id
JOIN user_profiles up ON cgp.user_id = up.id
ORDER BY cgp.joined_at DESC;
```

### Mensagens recentes
```sql
SELECT cg.name, up.full_name, m.content, m.message_type, m.created_at, m.is_deleted 
FROM messages m
JOIN chat_groups cg ON m.group_id = cg.id
JOIN user_profiles up ON m.sender_id = up.id
ORDER BY m.created_at DESC 
LIMIT 50;
```

### Reações a mensagens
```sql
SELECT up.full_name, m.content, mr.emoji, mr.created_at 
FROM message_reactions mr
JOIN messages m ON mr.message_id = m.id
JOIN user_profiles up ON mr.user_id = up.id
ORDER BY mr.created_at DESC;
```

## Transações Financeiras

### Histórico de transações
```sql
SELECT up.full_name, ft.transaction_type, ft.origin_account, ft.destination_account, ft.amount, ft.status, ft.created_at 
FROM financial_transactions ft
JOIN user_profiles up ON ft.user_id = up.id
ORDER BY ft.created_at DESC;
```

### Resumo de transações por tipo
```sql
SELECT transaction_type, COUNT(*) as total, SUM(amount) as valor_total 
FROM financial_transactions 
GROUP BY transaction_type
ORDER BY total DESC;
```

## Notificações

### Notificações não lidas
```sql
SELECT up.full_name, n.title, n.message, n.notification_type, n.created_at 
FROM notifications n
JOIN user_profiles up ON n.user_id = up.id
WHERE n.is_read = false
ORDER BY n.created_at DESC;
```

### Todas as notificações
```sql
SELECT up.full_name, n.title, n.message, n.notification_type, n.is_read, n.read_at 
FROM notifications n
JOIN user_profiles up ON n.user_id = up.id
ORDER BY n.created_at DESC 
LIMIT 100;
```

## Uploads de Arquivo

### Arquivos enviados
```sql
SELECT up.full_name, fu.file_type, fu.file_name, fu.file_size_bytes, fu.mimetype, fu.created_at 
FROM file_uploads fu
JOIN user_profiles up ON fu.user_id = up.id
ORDER BY fu.created_at DESC;
```

## Auditoria

### Logs de auditoria
```sql
SELECT al.table_name, al.operation, up.full_name, al.created_at 
FROM audit_logs al
LEFT JOIN user_profiles up ON al.user_id = up.id
ORDER BY al.created_at DESC 
LIMIT 100;
```

### Logs de admin
```sql
SELECT admin.full_name as admin, alg.action, target.full_name as target_user, alg.created_at 
FROM admin_logs alg
LEFT JOIN user_profiles admin ON alg.admin_id = admin.id
LEFT JOIN user_profiles target ON alg.target_user_id = target.id
ORDER BY alg.created_at DESC;
```

## Bloqueios de Usuário

### Usuários bloqueados
```sql
SELECT blocker.full_name as blocker, blocked.full_name as blocked_user, ub.reason, ub.created_at 
FROM user_blocks ub
JOIN user_profiles blocker ON ub.blocker_id = blocker.id
JOIN user_profiles blocked ON ub.blocked_user_id = blocked.id
ORDER BY ub.created_at DESC;
```

## Configuração do Sistema

### Variáveis de configuração
```sql
SELECT config_key, config_value, description 
FROM system_config 
ORDER BY config_key;
```

## Views Úteis

### Dashboard resumo
```sql
SELECT * FROM v_home_summary 
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'Seu Nome');
```

### Resumo de carteira
```sql
SELECT * FROM v_wallet_summary 
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'Seu Nome');
```

### Resumo de investimentos
```sql
SELECT * FROM v_investment_summary 
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'Seu Nome');
```

### Resumo de poupança
```sql
SELECT * FROM v_savings_summary 
WHERE user_id = (SELECT id FROM user_profiles WHERE full_name = 'Seu Nome');
```

### Contas ativas
```sql
SELECT * FROM v_user_account_summary 
WHERE status = 'active' 
ORDER BY created_at DESC;
```

## Úteis para Manutenção

### Contar registros em todas as tabelas
```sql
SELECT TABLE_SCHEMA, TABLE_NAME, 
       (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = TABLE_SCHEMA) as table_count
FROM information_schema.tables
WHERE TABLE_SCHEMA = 'your_database_name'
ORDER BY TABLE_NAME;
```

### Tamanho das tabelas
```sql
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

**Dica:** Copiar queries e executar no seu cliente Supabase (Supabase Workbench, Adminer ou CLI).

