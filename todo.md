# TODO - Novas Funcionalidades

## Funcionalidades Solicitadas

### Menu Mobile Responsivo
- [x] Criar componente de menu hambúrguer para mobile
- [x] Implementar drawer/sidebar que abre ao clicar no hambúrguer
- [x] Adaptar navegação existente para funcionar em modo mobile
- [x] Testar responsividade em diferentes tamanhos de tela

### Calendário de Manutenção (Admin)
- [x] Criar página /admin/manutencao
- [x] Implementar tabela de manutenções com CRUD completo
- [x] Adicionar formulário para criar/editar manutenção
- [x] Campos: embarcação, data início, data fim, descrição, status
- [x] Interface intuitiva com dialogs

### Bloqueio Automático de Reservas
- [x] Verificar se já existe tabela maintenances no schema
- [x] Criar endpoints tRPC para manutenções (se não existir)
- [x] Integrar verificação de manutenção no calendário de reservas
- [x] Bloquear datas em manutenção visualmente no calendário
- [x] Impedir criação de reservas em datas com manutenção
- [x] Adicionar mensagem informativa quando data está em manutenção

### Testes
- [x] Testar menu mobile em diferentes dispositivos
- [x] Testar CRUD de manutenções
- [x] Verificar bloqueio de reservas em datas com manutenção
- [x] Executar testes automatizados
- [ ] Garantir que nada foi quebrado
