# Decision Log OF-001 — Exclusive Clube

## Contexto

O repositório oficial é `Viniciusoluap/Exclusive-Club-Itz`. A `main` contém mudanças posteriores ao backup de 25/02/2026; por isso, o backup é histórico e não pode substituir o estado atual.

## Decisões

| ID    | Decisão                                                                                                  | Motivo                                                              | Estado                 |
| ----- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| D-001 | Trabalhar na branch `manus/open-finance-foundation`                                                      | Preservar a `main` e permitir rollback                              | Concluída              |
| D-002 | Usar base nova + carga Asaas + ETL seletivo                                                              | Evitar perda de funções recentes e usar Asaas como fonte financeira | Aprovada               |
| D-003 | Começar com Pluggy como provider-first                                                                   | Widget React, sandbox, API, webhooks e menor fricção de integração  | Implementada em código |
| D-004 | Manter credenciais Pluggy somente no backend                                                             | Reduzir exposição de segredos e seguir o fluxo oficial              | Implementada           |
| D-005 | Responder webhook antes do processamento                                                                 | A Pluggy exige 2XX em menos de 5 segundos e reenvia falhas          | Implementada           |
| D-006 | Usar `eventId`, `providerItemId`, `providerAccountId` e `providerTransactionId` como chaves idempotentes | Evitar duplicidade em retries e sincronizações repetidas            | Implementada           |
| D-007 | Dry-run Asaas por padrão                                                                                 | Permitir auditoria de totais e vínculos antes de qualquer escrita   | Implementada           |
| D-008 | Não excluir Item remoto na desconexão local                                                              | Separar ação reversível de ação destrutiva                          | Implementada           |
| D-009 | Não declarar conexão como “qualquer banco garantido”                                                     | Cobertura depende da instituição, produto, perfil e consentimento   | Documentada            |

## Evidências

Os testes determinísticos de normalização, direção financeira, idempotência e segredo passaram: `4 tests passed`. A checagem de sintaxe do reconstruidor Asaas passou. O esbuild dos módulos server/client passou. O typecheck global foi tentado, mas o processo excedeu o limite de memória do sandbox; esse bloqueio foi registrado e não deve ser confundido com aprovação do build completo.

## Dependências inevitáveis

A validação com contas reais depende de `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, configuração do webhook HTTPS e consentimento bancário. A carga Asaas depende de `ASAAS_API_KEY` e `DATABASE_URL` no ambiente correto. Nenhuma dessas credenciais deve ser enviada no chat ou gravada no Git.

## Próxima decisão operacional

Depois de provisionar a base nova e configurar as credenciais seguras, executar primeiro os dry-runs e smoke tests. A publicação final só deve acontecer depois de comparar o total de cobranças Asaas, os clientes sem vínculo e os eventos de webhook em staging.

## Validação remota concluída

O workflow [CI remoto 32933356910](https://github.com/Viniciusoluap/Exclusive-Club-Itz/actions/runs/32933356910) foi aprovado em 26/08/2026. O job principal passou pela migração no TiDB efêmero, typecheck, 120 arquivos de teste com 748 testes e build de produção. O job E2E também passou depois que a branch passou a aplicar o schema na instância efêmera própria antes dos fluxos.

A primeira execução havia revelado dois problemas operacionais: a nova migração precisava de `--> statement-breakpoint` entre os DDLs para o replay do Drizzle, e o job E2E não aplicava o schema no próprio banco. Ambos foram corrigidos em commit separado, sem tocar a `main`.

A pendência restante é externa ao código: credenciais Pluggy/Asaas em ambiente seguro, contratação/configuração do provedor, URL HTTPS pública para webhook e publicação assistida. A branch está publicada em PR draft para revisão e não houve alteração de produção.
