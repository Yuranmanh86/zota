# 🎯 Teste Rápido - 5 Minutos

## Passo 1: Deploy Database (1 min)
```
1. Abrir Supabase Workbench / Adminer (ou conectar via CLI)
2. Abrir novo query
3. Copiar: database.sql (TUDO)
4. Colar: No SQL Editor
5. Executar: Botão Run
6. Esperar: Sucesso ✅
```

## Passo 2: Iniciar App (1 min)
```bash
npx expo start
```

Selecionar:
- `w` para Web (mais fácil)
- OU `i` para iOS
- OU `a` para Android

## Passo 3: Registrar (2 min)
```
Email: teste@example.com
Senha: Senha123!
Nome: João Silva
Telefone: +258843123456
```

Clicar "Registrar"

## Passo 4: Verificar Home (1 min)
Deve exibir:
- ✅ Seu nome: "João Silva"
- ✅ Saldo: Qualquer valor MZN
- ✅ Ativos: Valor MZN
- ✅ Lucro: Valor MZN
- ✅ Numeração N1-N9 nos cards

---

## 🎉 Pronto!

Se tudo aparecer, você tem:
- ✅ Database funcionando
- ✅ Autenticação funcionando
-- ✅ App conectado ao backend Supabase

Próximo: Ler `GUIA-TESTES.md` para testes mais profundos

---

## ⚠️ Se Algo Falhar

- Verificar `.env` com URL do backend e credenciais Supabase
- Verificar internet

**Erro: "Perfil não encontrado"**
- database.sql não foi executado completamente
- Refazer passo 1

**Erro: políticas de acesso**
- Verificar permissões no banco/Supabase e no backend
- Refazer deployment do schema se necessário

---

## 💻 Commands Úteis

```bash
# Limpar cache
npx expo prebuild --clean

# Ver logs
npx expo start --verbose

# Reset database (Supabase)
# Use com cautela: adapte para Supabase
-- DROP DATABASE zora; CREATE DATABASE zora; -- depois rodar database.sql
```

---

**Time:** 5 minutos  
**Result:** App funcionando com banco real ✅

