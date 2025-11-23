# TODO - Correções Urgentes

## Problemas Críticos Reportados

### Sistema de Cotas
- [x] Implementar contador correto de reservas ativas por cliente
- [x] Cota inteira = 2 reservas simultâneas por embarcação
- [x] Meia cota = 1 reserva simultânea por embarcação
- [x] Cliente pode ter múltiplas cotas (ex: 1 cota lancha + 1 cota jet = 4 datas total)
- [x] Validar limite de reservas por tipo de cota e embarcação

### Endpoint Admin
- [x] Criar endpoint bookings.createForClient para admin
- [x] Permitir admin criar reservas para qualquer cliente
- [x] Validar que apenas admin pode usar este endpoint

### Previsão do Tempo
- [x] Corrigir carregamento da previsão do tempo
- [x] Verificar integração com OpenWeatherMap API
- [x] Tratar erros de API gracefully

### Testes
- [x] Executar todos os testes
- [x] Garantir que correções não quebram funcionalidades existentes
