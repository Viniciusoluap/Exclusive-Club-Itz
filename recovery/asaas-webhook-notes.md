# Notas de pesquisa — Asaas Webhooks

Fonte: https://docs.asaas.com/docs/receive-asaas-events-at-your-webhook-endpoint
Data da consulta: 2026-08-26.

A documentação oficial mostra que o evento do webhook é um objeto JSON com identificador próprio (`id`), atributo `event` e a entidade relacionada (`payment`). A página recomenda proteger o endpoint aceitando apenas IPs oficiais do Asaas e validando sempre o header `asaas-access-token`. O token do webhook deve ter entre 32 e 255 caracteres, sem espaços, sem sequências simples e não deve ser uma API Key do Asaas.

Implicação para o Exclusive Clube: a sincronização deve usar o webhook como mecanismo de atualização quase em tempo real, com validação do token, registro idempotente do identificador do evento, processamento transacional e resposta de erro quando o processamento não for concluído. A importação paginada de cobranças deve continuar como reconciliação periódica, pois o webhook não deve ser a única fonte de recuperação.

A referência oficial de `GET /v3/payments` informa que a listagem é paginada e aceita filtros por `customer`, `billingType`, `status`, `subscription`, `installment`, `externalReference`, status de nota, antecipação e intervalos de `dateCreated`, `dueDate`, `paymentDate` e `estimatedCreditDate`. Isso permite uma carga inicial completa e reconciliações incrementais por data, cliente, status e referência externa, sem depender de uma única chamada ou de dados legados do banco.

Fonte: https://docs.asaas.com/reference/list-payments

A documentação oficial da TecnoSpeed consultada em https://docs.pagamentobancario.com.br/ descreve uma API REST de **pagamentos bancários a pagar**, não um gateway de cobrança de clientes. O fluxo informado é: cadastrar o pagador/conta, solicitar pagamentos, gerar remessa, aguardar retorno bancário e consultar a conciliação. A API usa um token da Software House e possui estados como `CREATED`, `PAID`, `SCHEDULED`, `CANCELLED`, `REJECTED` e `REFUNDED`, além de mencionar notificações por webhook.

Implicação para o Exclusive Clube: TecnoSpeed e Asaas parecem ocupar papéis diferentes. O Asaas é a fonte externa de cobranças a receber dos clientes; a TecnoSpeed, se esse for o produto contratado, deve alimentar o módulo de contas a pagar/transferências e conciliação bancária. Não há qualquer referência à TecnoSpeed no código atual além de falsos positivos da palavra “tecnologia”; portanto, a integração ainda não está implementada na `main` e precisa de escopo, credenciais de homologação e definição de banco/fluxo antes de ser codificada.
