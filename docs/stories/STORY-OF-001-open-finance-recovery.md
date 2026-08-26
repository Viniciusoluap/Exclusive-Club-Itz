# Story OF-001: Retomada segura e fundação Open Finance do Exclusive Clube

**Status:** InProgress
**Story ID:** OF-001
**Owner:** Manus AI sob direção de Vinicius
**Branch:** manus/open-finance-foundation
**Depends_on:** Epic-technical-debt

## Objetivo

Retomar o Exclusive Clube sem restaurar o backup antigo de forma destrutiva e preparar uma fundação automatizada para conectar contas bancárias por Open Finance, usando o Asaas como fonte financeira oficial das cobranças e o backup de fevereiro apenas como fonte histórica seletiva.

## Decisões aprovadas

A `main` oficial é `Viniciusoluap/Exclusive-Club-Itz`. A estratégia de recuperação aprovada é a alternativa A: base nova, carga paginada e idempotente do Asaas e ETL seletivo do backup. O sistema deve minimizar intervenções manuais, solicitar autenticação somente quando indispensável e nunca receber segredos por mensagem.

A primeira alternativa técnica avaliada para Open Finance é Pluggy, por oferecer widget, sandbox, API, webhooks e preços públicos. Belvo e Celcoin permanecem como alternativas de contingência, condicionadas a cobertura, preço, contrato, consentimento e requisitos de produção.

## Escopo da primeira entrega automatizada

1. Criar um registro AIOX/SDC para acompanhar a implementação e os gates.
2. Criar a abstração de conexões Open Finance e o adaptador Pluggy no backend, com credenciais somente no servidor.
3. Criar tabelas para conexões, contas, transações e eventos de sincronização, com chaves externas e idempotência.
4. Criar procedures tRPC protegidas para listar conexões, criar Connect Token, iniciar/desconectar conexão e solicitar sincronização.
5. Criar endpoint HTTPS de webhook Pluggy com resposta rápida, validação de segredo, registro idempotente e processamento assíncrono seguro.
6. Criar área administrativa responsiva para conectar conta, visualizar status, saldo, última sincronização e falhas, sem exibir tokens.
7. Criar testes unitários para normalização, idempotência, autorização e webhook; rodar typecheck, testes, build e quality gates.
8. Documentar as variáveis de ambiente, o fluxo de sandbox, os passos de contratação e a transição para produção.

## Fora do escopo desta primeira entrega

Não inclui importação de dados reais sem credenciais de sandbox, movimentação de dinheiro, iniciação de pagamentos, alteração de cobranças no Asaas, restauração do ZIP sobre banco existente, seleção comercial definitiva do provedor ou publicação em produção sem validação dos gates.

## Tasks / Subtasks

- [ ] Criar a fundação de dados e o adaptador Pluggy no backend.
- [ ] Criar procedures tRPC protegidas para conexão, listagem e sincronização.
- [ ] Criar webhook idempotente e processamento assíncrono seguro.
- [ ] Criar interface administrativa para conectar e acompanhar contas.
- [ ] Criar testes unitários e testes de segurança para o fluxo.
- [ ] Atualizar documentação, variáveis de ambiente e evidências AIOX.
- [ ] Executar typecheck, testes, build e quality gates.
- [ ] Preparar a validação assistida em sandbox sem publicar em produção.

## Critérios de aceite

- [ ] A `main` permanece intacta e todo código novo está em branch própria.
- [ ] O código compila sem credenciais Pluggy e sem chamadas externas durante os testes.
- [ ] Nenhum segredo é enviado ao frontend, ao Git ou ao banco em texto puro.
- [ ] A criação de Connect Token exige usuário autenticado e retorna somente token efêmero.
- [ ] Uma conexão pertence a um usuário e não pode ser lida por outro usuário.
- [ ] O mesmo evento de webhook não cria duplicatas quando recebido mais de uma vez.
- [ ] O webhook responde 2XX rapidamente e o processamento não bloqueia a resposta.
- [ ] A sincronização usa identificadores externos únicos para contas e transações.
- [ ] O produto apresenta estados de conexão: pendente, conectado, sincronizando, erro, desconectado e consentimento expirado.
- [ ] `pnpm check`, `pnpm test` e `pnpm build` passam, ou as limitações são documentadas com evidência.
- [ ] O relatório final diferencia o que foi implementado, o que depende de credencial e o que depende de autenticação assistida.

## Riscos e controles

O Open Finance não garante literalmente qualquer banco ou produto: cobertura depende do provedor, da instituição e do contexto CPF/CNPJ. A aplicação deve mostrar cobertura e falhas de forma explícita. Os limites mensais da rede exigem um Item por instituição e sincronização orientada a eventos, sem polling agressivo. O consentimento pode expirar ou ser revogado, exigindo reconexão. A carga Asaas e o ETL do backup devem permanecer separados das tabelas de conexão bancária para permitir reconciliação e auditoria.

## Arquivos de trabalho previstos

## File List

- `docs/stories/STORY-OF-001-open-finance-recovery.md`
- `drizzle/schema.ts`
- `server/db.ts`
- `server/routers.ts`
- `server/_core/index.ts`
- `server/_core/env.ts`
- `client/src/App.tsx`
- `client/src/pages/admin/OpenFinance.tsx`
- `server/openFinance.ts`
- `server/routers/openFinanceRouter.ts`
- `server/openFinance.test.ts`
- `docs/guides/OPEN_FINANCE_SETUP.md`
- `recovery/openfinance-research.md`

## Dev Agent Record

### Agent Model Used

Manus AI, execução autônoma supervisionada por AIOX SDC em modo yolo.

### Decision Log References

Será gerado em `.ai/decision-log-OF-001.md` após as decisões e validações da implementação.

### Completion Notes List

A story só poderá avançar para InReview depois de todos os gates técnicos passarem. Nenhuma credencial real será gravada neste arquivo.

## Change Log

| Data | Versão | Alteração | Responsável |
|---|---:|---|---|
| 2026-08-26 | 0.1.0 | Desenvolvimento iniciado (yolo) — Status: Ready → InProgress | @dev |

## Evidências esperadas

Os comandos de validação, o diff da branch, os testes automatizados, o resultado dos gates AIOX e a documentação de configuração devem ser anexados ao relatório de execução. Nenhum teste de produção deve ser simulado como se fosse conexão real.
