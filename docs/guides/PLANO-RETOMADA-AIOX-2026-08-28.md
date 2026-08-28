# Plano de retomada operacional (AIOX) — Exclusive Club

**Data:** 28/08/2026
**Autor:** Claude Code, a partir de 3 documentos de memória fornecidos pelo responsável (`Memória de contexto`, `Retomada operacional`, `Validação final 26/08/2026`) e verificação direta do estado atual dos repositórios via GitHub.
**Repositórios:** `Viniciusoluap/Exclusive-Club-Itz` (principal, vinculado ao projeto Vercel `exclusive-club-itz`) e `Viniciusoluap/Exclusive-Club-Itz-Manus` (cópia espelho, mesmos commits/SHAs).
**Branch de trabalho deste plano:** `claude/repo-recovery-plan-lx66kz`.

> Este documento é a fonte de verdade para retomar o trabalho em qualquer sessão futura — Manus ou Claude. Antes de agir, releia a seção 0 (correções de registro) e a seção 5 (regras de segurança), que nunca deixam de valer.

## 0. Correções de registro em relação à memória de 26–27/08

A memória enviada descrevia um estado de dois dias atrás. Ao conferir o GitHub agora, alguns pontos mudaram:

1. **O gating dos 3 testes Asaas por `ASAAS_API_KEY` já está corrigido.** `server/asaas.auth.test.ts` na `main` atual usa `it.skipIf(!hasAsaasKey)` nos testes que fazem chamada real à API. Isso não é mais um bloqueio de CI — é comportamento esperado e documentado (`docs/reviews/fase0-known-test-failures.md`).
2. **A `main` está verde.** Run `33018892983` (commit `fd4b0c7c89aa51cfbb5274ac30d056f44a1116f1`) passou em todos os gates: schema TiDB efêmero, typecheck, testes, build e E2E.
3. **O repositório-espelho já existe.** `Exclusive-Club-Itz-Manus` é idêntico a `Exclusive-Club-Itz` (mesmos SHAs de commit, mesmas branches). O passo "criar um repositório novo idêntico ao original", caso venha a ser necessário recriar do zero, já está satisfeito — o que falta é decidir qual dos dois fica como definitivo (ver Fase 6).
4. **Única pendência de código aberta:** PR #121 em `Exclusive-Club-Itz` (`chore(deps): bump nanoid from 5.1.11 to 5.1.16`, dependabot), com CI **falhando** (run `33061847498`). Precisa de triagem antes de qualquer merge futuro na `main`.
5. **Achado novo, descoberto ao abrir esta PR:** o CI nunca havia rodado em `Exclusive-Club-Itz-Manus` (0 execuções registradas antes desta sessão, mesmo com pushes anteriores para `main`). Ao disparar manualmente (`workflow_dispatch`) para diagnosticar, ele falhou em 3 testes (`server/asaas.auth.test.ts`, `server/asaas.integration.test.ts` — [run 33187301697](https://github.com/Viniciusoluap/Exclusive-Club-Itz-Manus/actions/runs/33187301697)) porque os secrets `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` nunca foram cadastrados neste repositório — diferente de `Exclusive-Club-Itz`, onde já existem e a `main` passa integralmente. Não é bug de código nem flake; é paridade de configuração faltando. Reforça a recomendação da Fase 0 de manter `Exclusive-Club-Itz` como principal até `Itz-Manus` ter os mesmos secrets. Detalhe registrado em [comentário na PR #1](https://github.com/Viniciusoluap/Exclusive-Club-Itz-Manus/pull/1#issuecomment-5454728565).

Nenhuma credencial, banco remoto, App ID Manus, chave Asaas nova ou registro DNS foi tocado nesta sessão — o levantamento acima foi só leitura via API do GitHub, e o disparo de CI usou apenas os secrets que o próprio GitHub Actions já injeta (nenhum valor visto ou manuseado por Claude).

## 1. Divisão de responsabilidade

| Frente | Onde | Quem opera | Por quê |
|---|---|---|---|
| Banco de dados (provisionar TiDB/MySQL, `DATABASE_URL`) | Manus | **Você** | Requer console/credenciais que só você acessa |
| Autenticação (App ID, URLs OAuth) | Manus | **Você** | Configuração sensível no portal Manus |
| Publicação final / deploy de produção | Manus (código chega pronto do Claude) | **Você** | Decisão operacional; o código já vem validado |
| Segredos (Asaas, Pluggy, SMTP, `BACKUP_ENCRYPTION_KEY`) | Vercel/Manus, ambiente seguro | **Você** | Nunca devem passar pelo chat ou pelo código |
| Código, testes, CI, migrations, scripts, merges, PRs | GitHub | **Claude**, autônomo | Onde há acesso direto para validar antes de qualquer promoção |
| Consolidação/exclusão de repositório | GitHub | Claude prepara e valida; **você autoriza a exclusão** | Ação irreversível, nunca automática |

Regra-chave: Claude nunca terá as credenciais reais de banco, Asaas, Pluggy ou OAuth. O trabalho do lado Claude é deixar código, scripts, migrations e CI comprovadamente prontos, para que a inserção dos valores reais no Manus/Vercel seja apenas "virar a chave", sem depuração no meio do caminho.

## 2. Fases (orquestração AIOX)

Cada fase do lado Claude roda autonomamente, usando os agentes AIOX apropriados (`@devops`, `@dev`, `@qa`, `@data-engineer`, `@architect`). Fases marcadas com `GATE MANUS` dependem de uma ação sua fora do Claude — Claude prepara tudo antes do gate e retoma sozinho assim que a condição for satisfeita.

### Fase 0 — Saneamento do repositório (Claude, autônomo, agora)
- `@devops`: triagem do PR #121 (nanoid bump) — investigar a falha de CI, corrigir ou fechar.
- `@architect`: registrar qual repositório é a fonte de verdade durante a migração. Recomendação: manter `Exclusive-Club-Itz` como principal (é o vinculado ao projeto Vercel `exclusive-club-itz`, e é o único com os secrets Asaas de CI já configurados); tratar `Exclusive-Club-Itz-Manus` como cópia congelada de rollback até a Fase 6.
- **Ação sua (GitHub, não é Manus):** se decidir manter `Exclusive-Club-Itz-Manus` como candidato ativo (em vez de só rollback congelado), cadastre `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` como Actions secrets nele (Settings → Secrets and variables → Actions), com os mesmos valores de sandbox já usados em `Exclusive-Club-Itz`. Claude não pode fazer isso — não deve ver o valor da chave.
- **Saída:** CI 100% verde nos dois repositórios, zero PRs pendentes.

### Fase 1 — Preparação para ambiente remoto (Claude, autônomo, só código)
- `@data-engineer`: revisar o journal de migrations (`drizzle/`), confirmar `db:migrate:ci`, preparar checklist para banco remoto real.
- `@dev`: mapear o plano de rotação da chave Asaas (fallback em `server/_core/asaas.ts`, prioridade `process.env.ASAAS_API_KEY` → `getSetting("asaas_api_key")`) sem tocar em nenhum segredo.
- `@qa`: montar checklist de smoke test pós-deploy (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`).
- **Saída:** runbooks prontos, nenhuma ação em produção.

> **GATE MANUS #1 (você):** provisionar banco TiDB/MySQL compatível no Manus, obter `DATABASE_URL`; configurar App ID e URLs OAuth no portal Manus; inserir os valores no Manus/Vercel.

### Fase 2 — Migração e restauração em staging (Claude autônomo, sem dados reais até seu aval)
- `@data-engineer`: aplicar as migrations atuais na base nova e importar a cópia preparada do backup de agosto via `scripts/prepare_backup_restore.mjs` (nunca o ZIP bruto, nunca sobre base com dados).
- `@qa`: validar contagens contra o relatório de agosto (30 tabelas — 42 clientes autorizados, 3.163 cobranças, 2.962 despesas, 625 cotas, etc.).
- **Saída:** relatório de validação de staging. Sem overwrite de produção.

> **GATE MANUS #2 (você):** revisar o relatório e autorizar a troca reversível de `DATABASE_URL` (mantendo a base anterior intacta para rollback).

### Fase 3 — Reconciliação financeira (Claude prepara e roda dry-run; você autoriza `--apply`)
- `@dev`: rodar `pnpm asaas:rebuild` (modo leitura, padrão) assim que a chave Asaas nova estiver disponível no ambiente seguro.
- `@qa`: revisar divergências, clientes sem vínculo, totais comparados ao painel Asaas.
- **Saída:** relatório de divergência.

> **GATE MANUS #3 (você):** inserir nova chave Asaas (tratando a antiga como comprometida) e novo token de webhook; autorizar `pnpm asaas:rebuild -- --apply` só depois da revisão.

### Fase 4 — Open Finance / Pluggy sandbox (Claude prepara; você faz o consentimento)
- `@dev`: confirmar webhook HTTPS (`PUBLIC_APP_URL/api/webhooks/pluggy`), variáveis Pluggy.
- `@qa`: checklist de smoke test — criação, reconexão, expiração/revogação de consentimento, duplicata de webhook, sincronização de transações.
- **Saída:** ambiente pronto para o primeiro consentimento real.

> **GATE MANUS #4 (você):** credenciais Pluggy no ambiente seguro + primeiro consentimento bancário real (única etapa que exige humano — autenticação/MFA ocorre no domínio da instituição financeira).

### Fase 5 — DNS e domínio próprio (você, no HostGator/Vercel)
- Claude documenta os registros exatos a apontar na zona HostGator para `exclusiveclubitz.com` e `www`. A Vercel não expõe API para editar a zona HostGator — esta é a única dependência externa não automatizável identificada até agora.

### Fase 6 — Consolidação dos repositórios (Claude prepara, você aprova a exclusão)
- `@devops`: confirmar que o repositório escolhido como definitivo está 100% sincronizado e operando (CI verde, deploy funcionando, domínio ativo).
- Confirmação explícita sua por escrito antes de excluir o repositório antigo — Claude nunca executa essa exclusão sozinho, mesmo em modo autônomo.
- **Saída:** um único repositório ativo; o outro arquivado ou excluído com sua autorização.

### Fase 7 — Backup novo e fechamento operacional
- `@devops` + `@data-engineer`: gerar backup novo em produção, validar o artefato, arquivar anexos, documentar rollback.
- **Saída:** operação declarada 100% validada, com evidências em `docs/guides/`.

## 3. Critérios de escalonamento (quando Claude para e chama você)

Claude opera de forma autônoma em todas as fases marcadas sem `GATE MANUS`. Casos extremos que sempre pausam e pedem sua decisão, mesmo em modo autônomo:

- Qualquer ação destrutiva ou irreversível (`DROP`, `TRUNCATE`, overwrite integral, exclusão de repositório, rotação de `BACKUP_ENCRYPTION_KEY`).
- Qualquer necessidade de credencial, segredo ou banco que não esteja disponível no ambiente seguro.
- Divergência relevante entre o relatório de reconciliação Asaas e o painel Asaas real.
- Falha de CI que não se resolve em 1–2 tentativas de correção direta (evita loop de tentativa às cegas).
- Qualquer decisão de modelagem/dados que precise de julgamento de negócio (ex.: promover cliente Asaas a `allowed_clients`).

## 4. Prompt de continuidade

Cole o bloco abaixo no início de uma nova sessão (Manus ou Claude) para retomar exatamente daqui, sem precisar reexplicar o histórico:

```
Estou retomando o projeto Exclusive Club. O plano de referência está em
docs/guides/PLANO-RETOMADA-AIOX-2026-08-28.md nos repositórios
Viniciusoluap/Exclusive-Club-Itz e Viniciusoluap/Exclusive-Club-Itz-Manus
(branch claude/repo-recovery-plan-lx66kz ou main, conforme o merge).

Leia esse documento antes de agir. Ele define:
- divisão de responsabilidade (Manus = banco, autenticação, publicação e
  segredos; Claude/GitHub = código, testes, CI, migrations, scripts, merges);
- 8 fases (0 a 7) com gates explícitos onde só eu posso agir (GATE MANUS);
- critérios de quando parar e me perguntar em vez de seguir sozinho.

Antes de qualquer mudança: confirme o estado real do código/CI na branch
atual (não confie cegamente neste prompt nem em documentos antigos — pode
ter avançado desde a última sessão). Não invente credenciais, resultados de
produção ou integrações não comprovadas. Nunca receba, imprima ou commite
senha, API key, token OAuth/Asaas/Pluggy, DATABASE_URL, BACKUP_ENCRYPTION_KEY
ou segredo SMTP — esses valores só existem no Manus/Vercel.

Continue a partir da fase em que paramos. Trabalhe de forma autônoma nas
fases sem GATE MANUS; me avise e pare nos casos extremos listados na
seção 3 do plano. Ao concluir uma fase do lado Claude, atualize este
documento (ou a story/handoff AIOX correspondente) com o que foi feito e
o que ficou pendente, e faça commit/push seguindo as regras do
.claude/CLAUDE.md (Story-Driven Development, Quality First, No Invention).
```

## 5. Regras de segurança que continuam valendo

- Nunca receber, imprimir, commitar ou colar no chat senha, API key, token OAuth/Asaas/Pluggy, `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` ou segredo SMTP. Valores reais só na Vercel, no Manus ou na aba segura do sistema.
- Nunca restaurar o ZIP de agosto (ou qualquer backup) diretamente sobre a base ativa. Nunca `DROP`, `TRUNCATE`, overwrite integral ou reimportação destrutiva em produção. Promoção sempre por troca reversível de conexão.
- `BACKUP_ENCRYPTION_KEY` não é trocada sem aprovação explícita — perdê-la torna backups antigos ilegíveis.
- Clientes Asaas não são promovidos automaticamente a `allowed_clients` — é decisão operacional separada.
- Não confundir "código pronto" com "operação financeira validada em produção". Quando o ambiente não tiver credenciais, marcar como bloqueado por dependência externa — nunca simular sucesso.

## 6. Referências

- `docs/guides/FINAL-VALIDACAO-2026-08-26.md`
- `docs/guides/RETOMADA-OPERACIONAL.md`
- `docs/guides/AVALIACAO-BACKUP-AGOSTO.md`
- `docs/stories/STORY-OF-001-open-finance-recovery.md`
- `.claude/CLAUDE.md`, `.claude/rules/`
