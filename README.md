# 🏭 APP MANUTENÇÃO MCF + PSY

## 📦 Versão Atual: v3.6.8

### 🔥 v3.6.8 (2025-12-28): **MIGRAÇÃO PARA SUPABASE**
- ✅ **Backend migrado:** Google Sheets → Supabase PostgreSQL
- ✅ **6 tabelas importadas:** artigos, utilizadores, pedidos, movimentos, planeamento, logs
- ✅ **API REST nativa:** Queries mais rápidas e escaláveis
- ✅ **Credenciais seguras:** Keys do Supabase configuradas
- ✅ **Compatibilidade mantida:** Interface idêntica, backend novo
- ⚠️ **Fotos:** Temporariamente removidas (serão migradas para Supabase Storage)

### 🗄️ **CONFIGURAÇÃO SUPABASE**

**Project URL:** `https://wegftalccimrnnlmoiyn.supabase.co`

**Tabelas Ativas:**
1. ✅ **artigos** - 231 itens de stock
2. ✅ **utilizadores** - Gestão de users e permissões
3. ✅ **pedidos** - 25 pedidos de manutenção (sem fotos por enquanto)
4. ✅ **movimentos** - Histórico de entradas/saídas
5. ✅ **planeamento** - Alocação de recursos
6. ✅ **logs** - Sistema de auditoria

### 📁 **FICHEIROS PRINCIPAIS**

- `index.html` - Aplicação principal (v3.6.8)
- `js/supabase-client.js` - Cliente Supabase (API wrapper)
- `README.md` - Este ficheiro

### 🔄 **BACKUP & ROLLBACK**

**Backups disponíveis:**
- `index.html.BACKUP_BEFORE_SUPABASE_v3.6.8` - Versão anterior (Google Sheets)
- `index.html.BACKUP_BEFORE_CLEANUP_v3.6.6.1` - Versão v3.6.6.1

**Para reverter para Google Sheets:**
```bash
# Restaurar backup
cp index.html.BACKUP_BEFORE_SUPABASE_v3.6.8 index.html

# Fazer commit e push
git add index.html
git commit -m "Rollback para Google Sheets v3.6.7"
git push origin main
```

### 🚀 **DEPLOY**

**GitHub Pages:** https://mcfpsy.github.io/appmanutencao/

**Para fazer deploy de alterações:**
```bash
git add .
git commit -m "Descrição das alterações"
git push origin main
```

O GitHub Pages atualiza automaticamente em ~2-5 minutos.

### 🔐 **CREDENCIAIS**

As credenciais do Supabase estão hardcoded no ficheiro `js/supabase-client.js` (linhas 7-10).

⚠️ **Nota de Segurança:** As keys públicas (`anon key`) podem ser expostas no frontend. As operações sensíveis devem usar Row Level Security (RLS) no Supabase.

### 📊 **PRÓXIMOS PASSOS**

1. ✅ **Testar login** - Verificar autenticação
2. ✅ **Testar criar pedido** - Validar inserção de dados
3. ✅ **Testar editar pedido** - Validar updates
4. ⏳ **Migrar fotos** - Implementar Supabase Storage
5. ⏳ **Configurar RLS** - Adicionar segurança por utilizador
6. ⏳ **Optimizar queries** - Adicionar índices e cache

### 📝 **HISTÓRICO DE VERSÕES**

- **v3.6.8** (2025-12-28): Migração para Supabase
- **v3.6.7** (2025-12-26): Limpeza profunda (↓25% ficheiros, ↓30% tamanho)
- **v3.6.6** (2025-12-03): Alertas de Stock Mínimo
- **v3.6.5**: Dropdown responsável no planeamento
- **v3.6.4**: Cache inteligente 1min + invalidação automática
- **v3.6.3**: "Resolvido" agora atualiza linha existente

### 🐛 **PROBLEMAS CONHECIDOS**

- ⚠️ Fotos dos pedidos não estão disponíveis (removidas temporariamente)
- ⚠️ Validação de sessão é apenas local (não valida com servidor)

### 💡 **CONTACTO & SUPORTE**

Para questões técnicas, contactar o desenvolvedor ou criar um issue no GitHub.

---

**Última atualização:** 2025-12-28  
**Desenvolvido para:** MCF + PSY
