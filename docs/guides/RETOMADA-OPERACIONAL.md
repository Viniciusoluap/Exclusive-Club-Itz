# Retomada operacional — Exclusive Clube

**Data:** 26/08/2026
**Repositório:** `Viniciusoluap/Exclusive-Club-Itz`
**Branch:** `manus/open-finance-foundation`
**Pull request:** [#112 — feat: retomada segura e fundação Open Finance](https://github.com/Viniciusoluap/Exclusive-Club-Itz/pull/112)
**CI:** [run 32933356910 — aprovado](https://github.com/Viniciusoluap/Exclusive-Club-Itz/actions/runs/32933356910)

## Conclusão executiva

O sistema não deve voltar ao ar por meio de restauração bruta do ZIP de fevereiro. A estratégia aprovada e implementada na branch é mais segura: manter a `main` atual, provisionar uma base nova, aplicar o schema atual, importar clientes e cobranças do Asaas por paginação e upsert idempotente, e usar o backup de 25/02/2026 apenas para recuperação histórica seletiva.

A fundação Open Finance foi implementada com Pluggy como primeiro adapter. O fluxo já tem Connect Widget, Connect Token gerado no backend, conexões por usuário, contas, transações, webhook idempotente, sincronização por cursor e tela administrativa. A escolha não promete “qualquer banco” de forma absoluta: cobertura depende da instituição, do produto, do perfil CPF/CNPJ, do consentimento e do contrato do provedor.

## O que já foi concluído

| Frente                | Estado    | Evidência                                                          |
| --------------------- | --------- | ------------------------------------------------------------------ |
| Main preservada       | Concluído | Todo código está na branch isolada                                 |
| Migração Open Finance | Concluído | `drizzle/0008_open_finance.sql` com DDL aditivo e breakpoints      |
| Adapter Pluggy        | Concluído | `server/openFinance.ts`                                            |
| API protegida         | Concluído | `server/routers/openFinanceRouter.ts`                              |
| Webhook               | Concluído | `POST /api/webhooks/pluggy`, segredo no header e idempotência      |
| Interface             | Concluído | `/admin/open-finance`                                              |
| Reconstrução Asaas    | Concluído | `scripts/asaas_rebuild.mjs`, dry-run padrão                        |
| Documentação e AIOX   | Concluído | Story OF-001, decision log e estado AIOX                           |
| CI remoto             | Aprovado  | schema TiDB, typecheck, 748 testes, build e E2E                    |
| Deploy de produção    | Pendente  | Não existe workflow de deploy versionado nem plataforma confirmada |
| Conexão bancária real | Pendente  | Depende de credenciais Pluggy e consentimento bancário             |
| Carga Asaas real      | Pendente  | Depende de `ASAAS_API_KEY` e `DATABASE_URL` seguros                |

## Por que o backup não deve ser restaurado diretamente

O ZIP `exclusive-club-backup-2026-02-25T00-03-58-718Z.zip` é íntegro e útil, mas representa um retrato antigo. O dump possui o modelo anterior de cobranças, enquanto a `main` atual consolidou o BPO em `bpo_charges` e recebeu mudanças posteriores de segurança, backup, migração e testes. Restaurar o ZIP inteiro poderia reverter código, schema, classificações e funcionalidades que já foram incorporadas.

O backup deve permanecer preservado como evidência histórica e ser usado em staging. O ETL seletivo precisa importar somente registros inexistentes na base nova, com mapeamento explícito, relatório de conflito e reconciliação por email/ID. A regra é **nunca executar `DROP`, `TRUNCATE` ou overwrite integral** como parte dessa retomada.

## Ordem operacional recomendada

### 1. Publicar a branch somente após revisão do PR

O PR #112 está em modo draft, com `main` intacta e todas as verificações do GitHub aprovadas. A publicação do PR como pronto para revisão e o merge são decisões reversíveis no fluxo do GitHub, mas o merge só deve ocorrer depois da conferência visual da tela administrativa e da confirmação de que a hospedagem escolhida suporta as variáveis necessárias.

### 2. Provisionar a base nova

Criar um banco MySQL/TiDB compatível com o runtime atual, configurar `DATABASE_URL` no ambiente seguro e executar as migrações. O CI remoto já comprovou o replay em TiDB efêmero. Antes da carga, registrar o identificador do banco, o commit publicado e o snapshot de rollback.

### 3. Executar o Asaas em dry-run

O script lê clientes e cobranças paginados, normaliza status e preserva descrição, vencimento, pagamento, tipo de cobrança, referência externa e links. O comando não escreve por padrão:

```bash
pnpm asaas:rebuild
```

Depois de revisar o relatório e comparar os totais com o painel Asaas, a aplicação controlada usa upserts por `asaas_customer_id` e `asaas_charge_id`, sem deletar dados:

```bash
pnpm asaas:rebuild -- --apply
```

Clientes Asaas não são promovidos automaticamente a usuários autorizados do portal. Esse vínculo deve ser aprovado no cadastro operacional para evitar conceder acesso indevido.

### 4. Configurar o Open Finance em sandbox

Adicionar as variáveis no ambiente seguro:

```env
PLUGGY_CLIENT_ID=
PLUGGY_CLIENT_SECRET=
PLUGGY_API_URL=https://api.pluggy.ai
PLUGGY_WEBHOOK_SECRET=
PUBLIC_APP_URL=https://dominio-publico-https
```

O backend usa `POST /auth` para obter a API key e cria Connect Tokens efêmeros; o frontend nunca recebe `clientSecret`. Configurar na Pluggy o webhook `PUBLIC_APP_URL/api/webhooks/pluggy` com o header customizado `x-pluggy-webhook-secret`.

### 5. Fazer o primeiro smoke test assistido

A única etapa que exige o usuário é o consentimento bancário no widget, porque a autenticação e MFA devem ocorrer no domínio da instituição. O teste deve confirmar criação, atualização, reconexão, expiração/revogação de consentimento, duplicata de webhook e sincronização de transações.

## Comparativo de provedor

| Opção                               | Experiência                                          | Implantação                                      | Risco/custo                                       | Decisão              |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------- | -------------------- |
| Pluggy                              | Widget React, sandbox, contas, transações e webhooks | Adapter já implementado                          | Produção depende de contrato, cobertura e limites | **Primeiro adapter** |
| Belvo                               | Widget de agregação e webhooks                       | Adapter futuro compatível com a abstração        | Produção e preço dependem de contratação          | Contingência         |
| Celcoin                             | Alternativa brasileira modular/enterprise            | Exigiria avaliação comercial e técnica adicional | Maior complexidade de contratação                 | Contingência         |
| Participação direta no Open Finance | Controle institucional                               | Requisitos regulatórios e operacionais elevados  | Não adequada ao MVP                               | Não recomendada      |

O Banco Central descreve o Open Finance como compartilhamento padronizado mediante consentimento do cliente; a aplicação deve informar finalidade, escopo, duração e revogação do consentimento. [1] A Pluggy documenta o Connect Widget, autenticação de backend, Items, contas, transações e webhooks. [2] [3] [4] [5] A Belvo documenta widget brasileiro e webhooks como alternativa de agregação. [6] [7]

## Riscos e controles

| Risco                                     | Nível | Controle implementado ou recomendado                               |
| ----------------------------------------- | ----: | ------------------------------------------------------------------ |
| Restaurar backup antigo e perder mudanças |  Alto | Branch atual preservada; backup tratado como ETL seletivo          |
| Duplicar cobranças Asaas                  |  Alto | Upsert por ID externo e dry-run padrão                             |
| Conceder acesso indevido por email        |  Alto | Não promover cliente Asaas automaticamente a `allowed_clients`     |
| Expor credenciais Pluggy                  |  Alto | Segredos somente no backend e fora do Git                          |
| Duplicar webhook                          |  Alto | `provider_event_id` único e resposta rápida                        |
| Cobertura bancária incompleta             | Médio | Mostrar status/erro e confirmar cobertura por instituição          |
| Consentimento expirar                     | Médio | Estado local de expiração/reconexão                                |
| Deploy sem ambiente conhecido             |  Alto | Confirmar hospedagem e variáveis antes do merge                    |
| Teste local sem banco                     | Médio | CI remoto passou com TiDB; staging deve repetir carga e smoke test |

## O que falta para os 100%

A implementação de código e validação automatizada está concluída. O restante é operacional e externo ao repositório: escolher ou confirmar a hospedagem, cadastrar as variáveis secretas, provisionar a base nova, executar o dry-run do Asaas, revisar os totais, configurar o webhook Pluggy e concluir o primeiro consentimento bancário. Não é seguro automatizar essas ações sem acesso autenticado aos ambientes e sem validar os valores de produção.

Quando o usuário retornar, o fluxo mínimo será abrir o PR #112, configurar as variáveis na hospedagem escolhida e assumir o controle apenas no widget bancário. Nenhuma chave deve ser enviada no chat.

## Referências

[1]: https://www.bcb.gov.br/estabilidadefinanceira/openfinance "Banco Central — Open Finance"
[2]: https://docs.pluggy.ai/reference/auth-create "Pluggy — Create API Key"
[3]: https://docs.pluggy.ai/reference/connect-token-create "Pluggy — Create Connect Token"
[4]: https://docs.pluggy.ai/reference/accounts-list "Pluggy — List Accounts"
[5]: https://docs.pluggy.ai/docs/webhooks "Pluggy — Webhooks"
[6]: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget "Belvo — Aggregation Brazil Widget"
[7]: https://developers.belvo.com/developer_resources/resources-webhooks-aggregation "Belvo — Aggregation Webhooks"
