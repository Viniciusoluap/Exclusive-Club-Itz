# Project TODO - Sistema de Cotas Numeradas

## 📊 Estrutura de Cotas
- Lancha: 7 cotas numeradas (1 a 7)
- Jetski: 6 cotas numeradas (1 a 6)
- Cada cota pode ser: Inteira (2 reservas simultâneas) ou Meia (1 reserva)

## 🗄️ Banco de Dados
- [x] Adicionar campo `quotaNumber` na tabela `client_quotas`
- [x] Adicionar validação de range (1-7 para lancha, 1-6 para jetski)
- [x] Migrar dados existentes

## 🔄 Backend
- [x] Atualizar procedures para incluir quotaNumber
- [x] Adicionar validação de quotaNumber no create/update
- [x] Atualizar queries para retornar quotaNumber

## 🎨 Frontend - Admin
- [x] Adicionar seleção de número de cota no formulário
- [x] Mostrar número da cota na lista de clientes
- [x] Permitir edição de número de cota

## 📝 Cadastro de Clientes
- [x] Receber lista de clientes do usuário
- [x] Cadastrar clientes automaticamente no banco (16 clientes)
- [x] Validar dados antes de inserir

## ✅ Testes
- [x] Testar cadastro com número de cota
- [x] Testar validação de ranges
- [x] Testar reservas com novo sistema


## 🐛 Bugs Reportados
- [x] Botão de logout não está funcionando
- [x] Verificar e documentar segurança de acesso admin (apenas owner)

## 🔒 Segurança
- [x] Confirmar que apenas owner tem acesso ao painel Admin
- [x] Documentar controle de acesso baseado em role (ver SECURITY.md)
