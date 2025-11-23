# Project TODO - Melhorias Solicitadas

## 🔴 PRIORIDADE ALTA - Sistema de Cotas

### Correção Crítica
- [x] Corrigir bug de validação de terças-feiras (está bloqueando como segunda)

### Sistema de Cotas e Frações
- [x] Adicionar campo "quotaType" na tabela allowed_clients (full, half)
- [x] Adicionar campo "quotaCount" na tabela allowed_clients (número de cotas)
- [x] Atualizar lógica de limite de reservas baseado em cotas:
  - Cota inteira: 2 reservas simultâneas por cota
  - Meia cota: 1 reserva simultânea por meia cota
  - Múltiplas cotas: somar limites (ex: 2 cotas = 4 reservas)
- [x] Atualizar painel admin para cadastrar cotas ao adicionar cliente
- [x] Atualizar interface de reservas para mostrar limite baseado em cotas
- [x] Adicionar validação no backend para respeitar limites de cotas

## 📧 Notificações

### Email
- [ ] Configurar serviço de email (usando built-in notification API)
- [ ] Notificar admin quando cliente fizer nova reserva
- [ ] Notificar cliente quando reserva for confirmada
- [ ] Notificar cliente quando reserva for cancelada
- [ ] Notificar cliente 1 dia antes da data reservada

### WhatsApp
- [ ] Pesquisar API de WhatsApp Business
- [ ] Integrar notificações via WhatsApp
- [ ] Enviar confirmação de reserva por WhatsApp
- [ ] Enviar lembrete 1 dia antes por WhatsApp

## 📊 Relatórios e Exportação

### Exportação PDF
- [ ] Criar relatório de reservas por período em PDF
- [ ] Criar relatório de uso por cliente em PDF
- [ ] Criar relatório de uso por embarcação em PDF
- [ ] Adicionar gráficos e estatísticas nos relatórios

### Exportação Excel
- [ ] Criar exportação de reservas em Excel
- [ ] Criar exportação de clientes em Excel
- [ ] Criar exportação de estatísticas em Excel

## 💳 Sistema de Pagamento

### Integração Mercado Pago
- [ ] Criar conta Mercado Pago para testes
- [ ] Integrar SDK do Mercado Pago
- [ ] Criar fluxo de pagamento para novas cotas
- [ ] Criar fluxo de pagamento para renovação
- [ ] Adicionar histórico de pagamentos no painel admin
- [ ] Adicionar histórico de pagamentos para clientes

## 🖼️ Galeria e Avaliações

### Galeria de Fotos
- [ ] Criar tabela de fotos das embarcações
- [ ] Adicionar upload de múltiplas fotos no painel admin
- [ ] Criar galeria na página de cada embarcação
- [ ] Adicionar lightbox para visualização de fotos

### Sistema de Avaliações
- [ ] Criar tabela de avaliações (ratings)
- [ ] Permitir cliente avaliar após usar embarcação
- [ ] Mostrar média de avaliações nas embarcações
- [ ] Adicionar comentários nas avaliações
- [ ] Painel admin para moderar avaliações

## ✅ Testes e Validação
- [ ] Testar sistema de cotas com diferentes cenários
- [ ] Testar notificações de email
- [ ] Testar notificações de WhatsApp
- [ ] Testar exportação de relatórios
- [ ] Testar fluxo de pagamento
- [ ] Testar galeria de fotos
- [ ] Testar sistema de avaliações
- [ ] Validar com usuário antes de finalizar
