# Plano de retomada operacional (AIOX) — Exclusive Club

**Data:** 28/08/2026
**Autor:** Claude Code, a partir de 3 documentos de memória fornecidos pelo responsável (`Memória de contexto`, `Retomada operacional`, `Validação final 26/08/2026`) e verificação direta do estado atual dos repositórios via GitHub.
**Repositórios:** `Viniciusoluap/Exclusive-Club-Itz` (fonte atual — CI e Vercel funcionando, usado só até o corte final) e `Viniciusoluap/Exclusive-Club-Itz-Manus` (**destino definitivo**, decisão do responsável em 28/08/2026 — ver seção 0, item 6). Ao final da Fase 6, só `Exclusive-Club-Itz-Manus` continuará existindo.
**Branch de trabalho deste plano:** `claude/repo-recovery-plan-lx66kz`.

> Este documento é a fonte de verdade para retomar o trabalho em qualquer sessão futura — Manus ou Claude. Antes de agir, releia a seção 0 (correções de registro) e a seção 5 (regras de segurança), que nunca deixam de valer.

## 0. Correções de registro em relação à memória de 26–27/08

A memória enviada descrevia um estado de dois dias atrás. Ao conferir o GitHub agora, alguns pontos mudaram:

1. **O gating dos 3 testes Asaas por `ASAAS_API_KEY` já está corrigido.** `server/asaas.auth.test.ts` na `main` atual usa `it.skipIf(!hasAsaasKey)` nos testes que fazem chamada real à API. Isso não é mais um bloqueio de CI — é comportamento esperado e documentado (`docs/reviews/fase0-known-test-failures.md`).
2. **A `main` está verde.** Run `33018892983` (commit `fd4b0c7c89aa51cfbb5274ac30d056f44a1116f1`) passou em todos os gates: schema TiDB efêmero, typecheck, testes, build e E2E.
3. **O repositório-espelho já existe.** `Exclusive-Club-Itz-Manus` é idêntico a `Exclusive-Club-Itz` (mesmos SHAs de commit, mesmas branches). O passo "criar um repositório novo idêntico ao original", caso venha a ser necessário recriar do zero, já está satisfeito — o que falta é decidir qual dos dois fica como definitivo (ver Fase 6).
4. **Única pendência de código aberta:** PR #121 em `Exclusive-Club-Itz` (`chore(deps): bump nanoid from 5.1.11 to 5.1.16`, dependabot), com CI **falhando** (run `33061847498`). Precisa de triagem antes de qualquer merge futuro na `main`.
5. **Achado novo, descoberto ao abrir esta PR:** o CI nunca havia rodado em `Exclusive-Club-Itz-Manus` (0 execuções registradas antes desta sessão, mesmo com pushes anteriores para `main`). Ao disparar manualmente (`workflow_dispatch`) para diagnosticar, ele falhou em 3 testes (`server/asaas.auth.test.ts`, `server/asaas.integration.test.ts` — [run 33187301697](https://github.com/Viniciusoluap/Exclusive-Club-Itz-Manus/actions/runs/33187301697)) porque os secrets `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` nunca foram cadastrados neste repositório — diferente de `Exclusive-Club-Itz`, onde já existem e a `main` passa integralmente. Não é bug de código nem flake; é paridade de configuração faltando. Como `Exclusive-Club-Itz-Manus` foi definido como repositório definitivo (item 6 abaixo), cadastrar esses secrets lá é pré-requisito obrigatório da Fase 6, não opcional. Detalhe registrado em [comentário na PR #1](https://github.com/Viniciusoluap/Exclusive-Club-Itz-Manus/pull/1#issuecomment-5454728565).
6. **Decisão do responsável (28/08/2026) — corrige a recomendação original deste plano:** o repositório definitivo será `Exclusive-Club-Itz-Manus`, não `Exclusive-Club-Itz`. Plano de ação: copiar tudo de `Exclusive-Club-Itz` para `Exclusive-Club-Itz-Manus` de forma idêntica, confirmar paridade completa (código, CI verde, secrets, deploy) e só então excluir `Exclusive-Club-Itz` em definitivo. Isso inverte a recomendação original das Fases 0 e 6 — ambas já corrigidas abaixo. "Cópia idêntica" aqui significa árvore de arquivos idêntica na `main` (`git diff` vazio) e paridade de configuração (secrets, integrações), não necessariamente os mesmos hashes de commit — histórico de PR (como o desta própria proposta) pode divergir sem problema, o que importa é o resultado final.
7. **Resultado do GATE MANUS #1 (28/08/2026), registrado pelo responsável no painel Manus:** banco de dados e configuração OAuth foram **aprovados**. O banco gerenciado isolado do projeto existe, passou em checagem de saúde somente leitura, e `DATABASE_URL` está configurada no ambiente seguro do Manus. `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL` e `OAUTH_SERVER_URL` estão presentes, usam HTTPS, e o portal Manus já reconhece o aplicativo (sem mais o erro de App ID não configurado). Nenhum valor real foi exposto em nenhum momento. Nenhuma migration, DDL, DML, restauração de backup, DNS, Vercel, operação Asaas ou operação Pluggy foi executada neste gate — dentro do esperado para a Fase 1.

   **Novo bloqueador, independente do App ID:** ao selecionar uma segunda identidade no fluxo OAuth, a sessão do cliente não persiste ao abrir `/reservas` — o nonce/CSRF passa sem erro de `invalid oauth state`, mas a sessão fica bloqueada mesmo assim. Isso tem características de bug de código (cookie de sessão e/ou callback OAuth, provavelmente em `server/_core`), não de configuração de plataforma, e precisa ser diagnosticado e corrigido no código antes de qualquer declaração de "login completo aprovado". A validação de state/nonce não deve ser enfraquecida para contornar isso.

   **Decisão do responsável:** a Fase 2 permanece **bloqueada** até (a) esse bug de sessão ser corrigido e revalidado, e (b) aprovação expressa do responsável para o plano de staging/restauração sanitizada. `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` também já foram cadastrados como segredos do aplicativo no painel Manus — mas isso é o cofre de runtime do Manus, diferente dos Actions secrets do GitHub tratados no item 5; não usar isso como evidência de que o item 5 está resolvido.

8. **Correção do bug de sessão (28/08/2026), mergeada em `main` nos dois repositórios:** causa raiz identificada em `server/_core/cookies.ts` — o cookie de sessão usava `SameSite=None`, que por especificação (RFC 6265bis) exige `Secure=true`. Quando a detecção de HTTPS atrás do proxy falha (`x-forwarded-proto` ausente/não repassado), o navegador rejeita o `Set-Cookie` inteiro em silêncio, sem erro visível — exatamente o sintoma relatado. O app é same-origin (`client/src/main.tsx` usa `/api/trpc` relativo, sem iframe), então não havia necessidade real de `SameSite=None`; trocado para `SameSite=Lax`, sem alterar validação de state/nonce. Validado localmente (`pnpm check`, `pnpm build`, testes de sessão/logout) e no CI oficial com TiDB real — [run 33197635647](https://github.com/Viniciusoluap/Exclusive-Club-Itz/actions/runs/33197635647), incluindo o job de E2E, 100% verde. PR #123 (`Exclusive-Club-Itz`) e PR #2 (`Exclusive-Club-Itz-Manus`) mergeadas.

   **O que ainda falta para desbloquear a Fase 2:** a revalidação real do login com uma segunda identidade no ambiente publicado (Manus) — isso só pode ser confirmado depois do deploy da `main` atualizada, e não pode ser testado a partir do código sozinho. Até essa revalidação acontecer e ser confirmada pelo responsável, a Fase 2 continua bloqueada.

9. **Aprovação condicional do responsável (28/08/2026):** autorizado seguir da Fase 2 até a Fase 5 e depois a Fase 7 diretamente pelo Manus, **condicionado** ao teste de revalidação do item 8 passar primeiro. Cada fase mantém seus próprios pontos de parada internos (GATE MANUS #2 antes de trocar `DATABASE_URL`, GATE MANUS #3 antes de `pnpm asaas:rebuild -- --apply`, GATE MANUS #4 antes do consentimento Pluggy real) — a aprovação de seguir a sequência não dispensa esses pontos de parada, que continuam exigindo confirmação explícita do responsável a cada um. A Fase 6 (corte final entre repositórios, reponte do Vercel) não faz parte desta sequência pelo Manus — continua sendo executada aqui pelo Claude/GitHub.

10. **Revalidação do item 8 falhou de novo (28/08/2026):** login OAuth reconhece a conta e completa o redirecionamento, mas o app continua tratando como não autenticado — sem erro de `invalid oauth state`. O SameSite=Lax era necessário mas não foi suficiente sozinho. Investigação encontrou uma segunda causa provável, independente da primeira: `server/_core/sdk.ts` usa `VITE_APP_ID` como `clientId` do lado do **servidor** (não só do build do frontend), e grava esse valor no cookie de sessão; numa plataforma que só propaga `VITE_*` para o passo de build, o servidor fica com `appId` vazio sem quebrar a subida, o login completa normalmente, mas `verifySession()` rejeita o cookie por `appId` vazio. Mergeado em `main` nos dois repositórios: `sdk.debugSessionCookie()` + procedure pública `system.sessionDebug` (diagnóstico seguro, nunca expõe segredo/cookie, reporta `missing`/`expired`/`invalid_signature`/`malformed`/`ok`), alerta de `VITE_APP_ID` ausente no log do servidor, `VITE_APP_ID`/`OAUTH_SERVER_URL` adicionados à lista crítica de `/admin/diagnostico`, e `Cache-Control: no-store` no callback (hardening, não a causa principal). Validado localmente (`pnpm check`, `pnpm build`, 7 testes novos) e no CI oficial com TiDB — PR #124 (`Exclusive-Club-Itz`) e PR #3 (`Exclusive-Club-Itz-Manus`) mergeadas.

    **Próximo passo exato:** depois do próximo deploy, testar login com a segunda identidade de novo e checar o resultado de `system.sessionDebug` (ou `/admin/diagnostico`). Se `verify` vier `"malformed"`, confirma a hipótese — a correção final é cadastrar `VITE_APP_ID` como variável de ambiente do **processo do servidor** no Manus (não só do build do frontend). A Fase 2 continua bloqueada até essa revalidação passar de verdade.

11. **Revalidação confirmada pelo responsável (28/08/2026):** cadastro de conta de teste com e-mail aleatório, seguido de um segundo acesso independente (fora do painel Admin), manteve a sessão persistida — Dashboard acessível, usuário autenticado exibido corretamente (print enviado pelo responsável a partir do ambiente publicado em `excludash-dxyaeiar.manus.space`). Isso confirma que a correção do item 10 (combinada ao `SameSite=Lax` do item 8) resolveu de fato o bug de sessão relatado no item 7 — login OAuth completo e sessão persistente em `/reservas`/Dashboard, sem enfraquecer a validação de state/nonce em nenhum momento. **Fase 2 desbloqueada por decisão do responsável.** Segue-se o plano do item 9 (Fase 2 até Fase 5, depois Fase 7, diretamente pelo Manus quando a parte for de configuração de plataforma), respeitando os gates internos de cada fase (GATE MANUS #2 antes de trocar `DATABASE_URL`, #3 antes de `--apply` no Asaas, #4 antes do consentimento Pluggy real) — essa aprovação de fase não dispensa esses pontos de parada.

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

**Nota sobre execução das Fases 2 em diante pelo Manus:** o responsável pediu para tentar avançar as fases seguintes diretamente pelo Manus, sem esperar o Claude. Isso é possível para as partes de configuração de plataforma (banco, credenciais, DNS, consentimento Pluggy, publicação), mas as partes que dependem de rodar scripts deste repositório (`scripts/prepare_backup_restore.mjs`, `drizzle-kit migrate`, `pnpm asaas:rebuild`) ou de corrigir código (o bug de sessão do item 7) só existem no código do GitHub — se o Manus não tiver acesso de execução a este repositório específico, essas partes continuam dependendo do Claude, mesmo que o responsável opere via Manus para tudo o resto.

## 2. Fases (orquestração AIOX)

Cada fase do lado Claude roda autonomamente, usando os agentes AIOX apropriados (`@devops`, `@dev`, `@qa`, `@data-engineer`, `@architect`). Fases marcadas com `GATE MANUS` dependem de uma ação sua fora do Claude — Claude prepara tudo antes do gate e retoma sozinho assim que a condição for satisfeita.

### Fase 0 — Saneamento do repositório (Claude, autônomo, agora)
- `@devops`: triagem do PR #121 (nanoid bump) — investigar a falha de CI, corrigir ou fechar. Continua valendo mesmo com `Exclusive-Club-Itz` sendo desativado no final — até o corte, ele é a fonte de trabalho ativa.
- `@architect`: **fonte de verdade durante a transição é `Exclusive-Club-Itz`** (continuar desenvolvendo/mergeando ali normalmente); **destino definitivo é `Exclusive-Club-Itz-Manus`**, por decisão do responsável (28/08/2026 — item 6 acima). `Exclusive-Club-Itz-Manus` só recebe a cópia completa no corte final (Fase 6), para não ter duas fontes divergindo em paralelo até lá.
- **Ação sua (GitHub, não é Manus):** como `Exclusive-Club-Itz-Manus` será o repositório definitivo, cadastre `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` como Actions secrets nele (Settings → Secrets and variables → Actions), com os mesmos valores de sandbox já usados em `Exclusive-Club-Itz`. Sem isso o CI de lá não fica verde — é pré-requisito da Fase 6, pode ser feito a qualquer momento antes dela. Claude não pode fazer isso — não deve ver o valor da chave.
- **Saída:** CI 100% verde em `Exclusive-Club-Itz` (fonte ativa), zero PRs pendentes lá.

### Fase 1 — Preparação para ambiente remoto (Claude, autônomo, só código)
- `@data-engineer`: revisar o journal de migrations (`drizzle/`), confirmar `db:migrate:ci`, preparar checklist para banco remoto real.
- `@dev`: mapear o plano de rotação da chave Asaas (fallback em `server/_core/asaas.ts`, prioridade `process.env.ASAAS_API_KEY` → `getSetting("asaas_api_key")`) sem tocar em nenhum segredo.
- `@qa`: montar checklist de smoke test pós-deploy (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`).
- **Saída:** runbooks prontos, nenhuma ação em produção.

> **GATE MANUS #1 (você):** provisionar banco TiDB/MySQL compatível no Manus, obter `DATABASE_URL`; configurar App ID e URLs OAuth no portal Manus; inserir os valores no Manus/Vercel.
> **Status (28/08/2026):** aprovado — ver itens 7, 8, 10 e 11 da seção 0. Banco e OAuth OK; bug de sessão corrigido, mergeado em `main` e revalidado com sucesso no ambiente publicado.

### Fase 2 — Migração e restauração em staging (Claude autônomo, sem dados reais até seu aval)

> **Desbloqueada (28/08/2026, item 11 da seção 0):** a revalidação real do login confirmou que a sessão persiste (print do responsável a partir do ambiente publicado), e o responsável autorizou expressamente prosseguir. Seguem valendo as regras de segurança: nunca importar o ZIP bruto, nunca sobrescrever a base ativa, sem overwrite de produção — só troca reversível de `DATABASE_URL` após o GATE MANUS #2 abaixo.

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

### Fase 6 — Corte final: copiar tudo para `Exclusive-Club-Itz-Manus` e excluir `Exclusive-Club-Itz` (Claude prepara, você aprova a exclusão)

Repositório definitivo: **`Exclusive-Club-Itz-Manus`** (decisão do responsável, 28/08/2026 — item 6 da seção 0). Checklist antes de excluir `Exclusive-Club-Itz`:

- [ ] `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` cadastrados como Actions secrets em `Exclusive-Club-Itz-Manus` (ação sua, ver Fase 0).
- [ ] `@devops`: no momento do corte, sincronizar `Exclusive-Club-Itz-Manus` com o conteúdo exato da `main` de `Exclusive-Club-Itz` (branches e tags relevantes) e confirmar `git diff` vazio entre as duas árvores — não basta "parecido", tem que ser idêntico.
- [ ] `@devops`: confirmar CI 100% verde em `Exclusive-Club-Itz-Manus` com a árvore já sincronizada, no mesmo pipeline e mesmos secrets que passam em `Exclusive-Club-Itz`.
- [ ] **Ação sua (Vercel):** repontar o projeto Vercel `exclusive-club-itz` para o GitHub `Exclusive-Club-Itz-Manus` (ou criar um novo projeto Vercel apontando para lá) — a integração Git atual está ligada a `Exclusive-Club-Itz`; sem repontar, o deploy quebra assim que o repositório antigo for excluído.
- [ ] `@qa`: repetir o smoke test da Fase 1 (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`) contra o deploy já servido a partir de `Exclusive-Club-Itz-Manus`.
- [ ] Confirmação explícita sua por escrito de que a paridade foi conferida, antes de excluir `Exclusive-Club-Itz` — Claude nunca executa essa exclusão sozinho, mesmo em modo autônomo.
- **Saída:** um único repositório ativo (`Exclusive-Club-Itz-Manus`), com CI e deploy funcionando a partir dele; `Exclusive-Club-Itz` excluído com sua autorização.

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
- Qualquer teste de sessão/autenticação que continue falhando após uma correção de código (ver itens 8, 10 e 11 da seção 0) — não declarar "login aprovado" sem revalidação real.

## 4. Prompt de continuidade

Cole o bloco abaixo no início de uma nova sessão (Manus ou Claude) para retomar exatamente daqui, sem precisar reexplicar o histórico:

```
Estou retomando o projeto Exclusive Club. O plano de referência está em
docs/guides/PLANO-RETOMADA-AIOX-2026-08-28.md nos repositórios
Viniciusoluap/Exclusive-Club-Itz e Viniciusoluap/Exclusive-Club-Itz-Manus
(branch main).

Leia esse documento antes de agir, especialmente a seção 0 (o que já mudou
desde a última revisão) e a seção 3 (quando parar e perguntar). Ele define:
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
