# Open Finance e retomada financeira — Exclusive Clube

**Status:** fundação implementada em branch isolada `manus/open-finance-foundation`
**Provedor inicial:** Pluggy
**Escopo:** conexão de contas, leitura de saldos e transações, webhooks, sincronização idempotente e reconciliação posterior com Asaas.

## Decisão de arquitetura

O Exclusive Clube usa o **Pluggy Connect Widget** para que a instituição bancária trate credenciais, MFA e fluxos específicos. O backend gera um Connect Token efêmero com `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET`; o frontend nunca recebe essas credenciais. A escolha é provider-first, não provider-locked: as tabelas guardam `provider`, `providerItemId`, `providerAccountId` e `providerTransactionId`, permitindo um adapter Belvo ou Celcoin no futuro sem mudar o domínio.

| Alternativa                                      | Vantagem                                                                                  | Limitação                                                                                                        | Decisão                    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Pluggy                                           | Widget React, sandbox, cobertura de Open Finance, API e webhooks; integração já preparada | Produção depende de contratação, cobertura e limites da instituição                                              | **Primeiro adapter**       |
| Belvo                                            | Widget e APIs de agregação com webhooks, alternativa madura para Brasil                   | Preço e acesso de produção dependem de contratação; adapter ainda não implementado                               | Contingência               |
| Integração direta com o ecossistema Open Finance | Menos dependência de agregador em tese                                                    | Exige requisitos regulatórios, operacionais e de participação incompatíveis com o objetivo de implantação rápida | Não recomendada para o MVP |

A cobertura não deve ser entendida como promessa de conectar literalmente qualquer conta. Ela depende da instituição, do produto, do perfil CPF/CNPJ, do consentimento e do provedor escolhido. O consentimento pode expirar ou ser revogado; o painel exibe esse estado explicitamente.

## Arquivos implementados

| Área        | Arquivo                                               | Função                                                               |
| ----------- | ----------------------------------------------------- | -------------------------------------------------------------------- |
| Dados       | `drizzle/schema.ts` e `drizzle/0008_open_finance.sql` | Conexões, contas, transações, eventos e execuções                    |
| Backend     | `server/openFinance.ts`                               | Adapter Pluggy, normalização, paginação por cursor, upsert e webhook |
| API         | `server/routers/openFinanceRouter.ts`                 | Procedures protegidas e escopo por usuário                           |
| HTTP        | `server/_core/index.ts`                               | `POST /api/webhooks/pluggy` com resposta rápida                      |
| Frontend    | `client/src/pages/admin/OpenFinance.tsx`              | Widget, status, saldos e ações de sincronização                      |
| Rota        | `client/src/App.tsx`                                  | `/admin/open-finance` protegido para admin                           |
| Recuperação | `scripts/asaas_rebuild.mjs`                           | Asaas → `asaas_customers`/`bpo_charges`, dry-run por padrão          |

## Configuração de ambiente

Copie os nomes de `.env.example` para o ambiente seguro da hospedagem. Não coloque valores reais no Git ou no chat.

```env
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_API_URL=https://api.pluggy.ai
PLUGGY_WEBHOOK_SECRET=
PUBLIC_APP_URL=https://seu-dominio-publico
```

`PUBLIC_APP_URL` precisa ser HTTPS para o sistema enviar `PUBLIC_APP_URL/api/webhooks/pluggy` ao criar o Connect Token. O `PLUGGY_WEBHOOK_SECRET` deve ser configurado como header customizado `x-pluggy-webhook-secret` no webhook da Pluggy. O endpoint rejeita chamadas sem segredo ou com segredo divergente.

## Fluxo de conexão

O administrador acessa `/admin/open-finance` e clica em **Conectar conta**. O backend cria um Connect Token com `clientUserId=exclusive-user-{id}` e `avoidDuplicates=true`; o widget conduz o consentimento bancário. Após `item/created` ou `item/updated`, o endpoint responde 2XX imediatamente, registra `eventId` com chave única e processa a sincronização de forma assíncrona. A sincronização lê as contas e percorre `/v2/transactions` por cursor, usando upsert pelos IDs externos.

A remoção local marca a conexão como `disconnected`; a exclusão remota do Item é deliberadamente uma etapa separada para evitar uma ação destrutiva acidental. Para consentimento expirado, o usuário deve reconectar pelo widget.

## Retomada do financeiro

A ordem segura é provisionar uma **base nova**, aplicar as migrações aditivas e então carregar o Asaas. O arquivo de backup de 25/02/2026 não deve substituir o código atual nem ser importado integralmente: ele contém o modelo financeiro antigo, enquanto a `main` já utiliza `bpo_charges` como fonte BPO.

O Asaas é a fonte de verdade para clientes e cobranças. O script abaixo nunca recebe chave por argumento e não executa escrita por padrão:

```bash
pnpm asaas:rebuild
```

O primeiro relatório deve ser revisado. Somente no ambiente correto e depois de conferir totais, clientes sem vínculo e status, aplica-se o upsert sem `DELETE`:

```bash
pnpm asaas:rebuild -- --apply
```

O script preserva `description`, `dueDate`, `paymentDate`, `billingType`, `externalReference`, links, `netValue` e status normalizado. Ele não promove automaticamente qualquer cliente Asaas a cliente autorizado do portal; essa decisão permanece no cadastro operacional.

O backup de fevereiro deve ser usado depois, em staging, apenas para preencher entidades históricas que não existam no Asaas. Cada conjunto de registros precisa de mapeamento explícito para o schema atual, relatório de conflitos e reconciliação por email/ID. Nenhum `DROP`, `TRUNCATE` ou overwrite integral é permitido.

## Gates antes de produção

1. Provisionar o banco novo e confirmar que a `main` continua intacta.
2. Aplicar `0008_open_finance.sql` e validar tabelas/indexes.
3. Configurar Pluggy em sandbox e confirmar criação de Connect Token sem credenciais no frontend.
4. Configurar webhook HTTPS com header secreto e testar `item/created`, duplicata e evento inválido.
5. Executar `pnpm asaas:rebuild` em dry-run e comparar totais do relatório com o painel Asaas.
6. Aplicar a carga Asaas somente após conferir clientes sem vínculo, cobranças vencidas e recebidas.
7. Executar o ETL seletivo do backup em staging e aprovar conflitos.
8. Rodar testes, build e smoke test da rota `/admin/open-finance`.
9. Só então configurar produção e realizar a primeira conexão real assistida.

## Referências

[1]: https://www.bcb.gov.br/estabilidadefinanceira/openfinance "Banco Central — Open Finance"
[2]: https://docs.pluggy.ai/docs/pluggy-connect-introduction "Pluggy — Connect Widget"
[3]: https://docs.pluggy.ai/reference/connect-token-create "Pluggy — Create Connect Token"
[4]: https://docs.pluggy.ai/reference/accounts-list "Pluggy — List Accounts"
[5]: https://docs.pluggy.ai/reference/transactions-list-by-cursor "Pluggy — List Transactions by Cursor"
[6]: https://docs.pluggy.ai/docs/webhooks "Pluggy — Webhooks"
[7]: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget "Belvo — Aggregation Brazil Widget"
