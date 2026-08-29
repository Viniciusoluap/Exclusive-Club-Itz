# Retomada operacional — Exclusive Club

**Data:** 26/08/2026
**Repositório:** `Viniciusoluap/Exclusive-Club-Itz`
**Branch:** `main`
**Commit atual:** `4429fe9` — atualização do plano de fases e proteção de artefatos
**Projeto Vercel:** `exclusive-club-itz` — Production READY
**CI de referência:** [run 32933910728 — aprovado](https://github.com/Viniciusoluap/Exclusive-Club-Itz/actions/runs/32933910728)

## Conclusão executiva

O sistema não deve voltar ao ar por meio de restauração bruta de qualquer ZIP. A estratégia aprovada é manter a `main` atual, provisionar uma base nova, aplicar o schema atual, importar a cópia preparada do backup de agosto em staging, reconciliar clientes e cobranças com o Asaas por paginação e upsert idempotente, e usar o backup de fevereiro apenas como referência histórica secundária.

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
| Deploy de produção    | Concluído | Vercel Production READY; Home e tRPC validados                    |
| Conexão bancária real | Pendente  | Depende de credenciais Pluggy e consentimento bancário             |
| Carga Asaas real      | Pendente  | Depende de nova chave Asaas e `DATABASE_URL` seguros              |

## Por que o backup não deve ser restaurado diretamente

O ZIP de agosto é íntegro e compatível após a preparação validada em staging. Ele preserva as tabelas atuais, as colunas extras de `bpo_charges` e os dados operacionais mais recentes. O ZIP de fevereiro continua íntegro, mas representa um retrato antigo e não deve ser a fonte primária. Restaurar qualquer ZIP inteiro diretamente sobre a produção poderia reverter código, schema, classificações e funcionalidades incorporadas na `main`.

O backup de agosto deve permanecer preservado no Drive e ser usado primeiro em staging. A importação operacional deve ocorrer em uma base nova, com mapeamento explícito, relatório de conflitos e reconciliação por IDs externos. A regra é **nunca executar `DROP`, `TRUNCATE` ou overwrite integral** em produção como parte dessa retomada.

## Ordem operacional recomendada

### 1. Publicação e runtime

A `main` já está publicada na Vercel. A raiz e o tRPC foram validados em Production, o Express serverless está ativo e o projeto possui os aliases `exclusiveclubitz.com` e `www.exclusiveclubitz.com`. Os três segredos criptográficos de aplicação foram cadastrados diretamente na Vercel sem exposição de valores. O domínio próprio ainda depende da zona DNS HostGator.

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

## Atualização por fases — 26/08/2026

| Fase | Estado atual | Evidência e próximo marco |
| --- | --- | --- |
| 1. Diagnóstico, código e publicação inicial | Concluída | `main` preservada, CI aprovado e Vercel Production READY |
| 2. Credenciais e serviços | Parcialmente concluída | `PUBLIC_APP_URL`, `JWT_SECRET`, `SETTINGS_ENCRYPTION_KEY` e `BACKUP_ENCRYPTION_KEY` salvos na Vercel; a chave Asaas exibida no chat não foi usada e deve ser revogada |
| 3. DNS HostGator | Via automatizável esgotada | HostGator administra a zona, mas não há API autorizada nem sessão persistente; aliases já estão cadastrados na Vercel |
| 4. Backup de agosto | Concluída em staging | `restore.sql` importado localmente sem view legada e sem perda das colunas extras |
| 5. Migrações e integridade | Concluída em staging | 35 tabelas, 22 controles de migração, contagens críticas preservadas e Open Finance criado vazio |
| 6. Reconciliação Asaas | Bloqueada por credencial segura | `pnpm asaas:rebuild` passou sem chave; falta inserir uma nova chave diretamente na Vercel ou no site |
| 7. Open Finance | Código pronto, sandbox pendente | Adapter Pluggy, widget, webhook e testes prontos; faltam credencial Pluggy e consentimento bancário |
| 8. Produção e domínio próprio | Parcialmente concluída | `exclusive-club-itz.vercel.app` validado; os domínios próprios continuam em manutenção até a zona HostGator apontar para a Vercel |
| 9. Continuidade operacional | Em preparação | Documentação, rollback e relatórios de backup versionados |

## O que falta para os 100%

A implementação de código, a validação automatizada, a recuperação local do backup de agosto e a publicação Vercel estão concluídas. O restante é operacional: inserir uma nova chave Asaas — a chave exibida no chat deve ser revogada —, obter/configurar `DATABASE_URL`, executar o dry-run real, inserir credenciais Pluggy, configurar o webhook, conectar uma conta em sandbox e aplicar os dois registros DNS da Vercel na zona HostGator. A Vercel não fornece API para editar a zona HostGator, e a HostGator não apresentou uma API autorizada nesta sessão; por isso essa última alteração permanece a única dependência externa não automatizável identificada.

Nenhuma chave deve ser enviada no chat. Os valores devem ser inseridos diretamente na Vercel ou na aba segura do sistema. A troca para produção financeira somente ocorrerá após o relatório de divergências Asaas, a validação do banco de recuperação e um rollback testado.

## Referências

[1]: https://www.bcb.gov.br/estabilidadefinanceira/openfinance "Banco Central — Open Finance"
[2]: https://docs.pluggy.ai/reference/auth-create "Pluggy — Create API Key"
[3]: https://docs.pluggy.ai/reference/connect-token-create "Pluggy — Create Connect Token"
[4]: https://docs.pluggy.ai/reference/accounts-list "Pluggy — List Accounts"
[5]: https://docs.pluggy.ai/docs/webhooks "Pluggy — Webhooks"
[6]: https://developers.belvo.com/products/aggregation_brazil/aggregation-brazil-integration-widget "Belvo — Aggregation Brazil Widget"
[7]: https://developers.belvo.com/developer_resources/resources-webhooks-aggregation "Belvo — Aggregation Webhooks"
