# Plano de retomada operacional (AIOX) — Exclusive Club

**Data:** 28/08/2026
**Autor:** Claude Code, a partir de 3 documentos de memória fornecidos pelo responsável (`Memória de contexto`, `Retomada operacional`, `Validação final 26/08/2026`) e verificação direta do estado atual dos repositórios via GitHub.
**Repositórios:** `Viniciusoluap/Exclusive-Club-Itz` (fonte atual — CI e Vercel funcionando, usado só até o corte final) e `Viniciusoluap/Exclusive-Club-Itz-Manus` (**destino definitivo**, decisão do responsável em 28/08/2026 — ver seção 0, item 6). Ao final da Fase 6, só `Exclusive-Club-Itz-Manus` continuará existindo.
**Branch de trabalho deste plano:** `claude/repo-recovery-plan-lx66kz`.

> Este documento é a fonte de verdade para retomar o trabalho em qualquer sessão futura — Manus, Claude, Codex ou outra ferramenta. Antes de agir, releia a seção 0 (correções de registro) e a seção 5 (regras de segurança), que nunca deixam de valer.

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

12. **Bloqueador de infraestrutura na execução da Fase 2 (28/08/2026) — collation MySQL 8/TiDB ausente no staging local do Manus:** ao aplicar as migrations atuais numa base de ensaio local (ferramenta de staging do próprio Manus), a aplicação parou após 3 migrations porque uma migration seguinte exige a collation `utf8mb4_0900_ai_ci` — nativa do MySQL 8.0+/TiDB, que não existe no MariaDB usado por essa base local. **Não é bug de código nem de migration:** o schema está escrito corretamente para o motor real de produção (TiDB Cloud), o mesmo validado pelo CI oficial via Docker (`pingcap/tidb:latest --store=unistore`). Flexibilizar a migration para caber no MariaDB seria retrocesso (Artigo IV — No Invention) e quebraria a compatibilidade real com produção só para acomodar uma ferramenta de ensaio que usa outro motor — o Manus recusou corretamente essa saída e pediu instrução em vez de contornar sozinho. A base parcial criada nesse MariaDB **não deve ser reaproveitada** (nenhum backup foi restaurado nela, nenhuma alteração em `DATABASE_URL`/base ativa/Vercel/DNS/Asaas/Pluggy).

    Provisionar banco é responsabilidade do Manus/responsável (seção 1) — Claude não tem acesso a infraestrutura de nuvem nem ao ambiente do Manus para fazer isso diretamente. Três opções técnicas, em ordem de preferência:
    - **(a) Preferencial — TiDB via Docker no próprio ambiente Manus**, exatamente como o CI oficial já valida com sucesso todas as migrations: `docker run -d --name tidb-staging -p 4000:4000 pingcap/tidb:latest --store=unistore`. Só funciona se o ambiente Manus permitir rodar containers Docker.
    - **(b) Alternativa — segundo cluster TiDB Cloud Serverless**, isolado do banco de produção, criado pelo responsável no console TiDB Cloud (mesmo provedor já usado para GATE MANUS #1, tem tier serverless gratuito).
    - **(c) Alternativa — MySQL 8.0 via Docker** (`utf8mb4_0900_ai_ci` é a collation padrão nativa do MySQL 8, então funciona sem ajuste): `docker run -d --name mysql8-staging -p 3306:3306 -e MYSQL_ROOT_PASSWORD=staging -e MYSQL_DATABASE=exclusive_club mysql:8.0`.

    A Fase 2 permanece bloqueada até existir um staging MySQL 8/TiDB compatível — nenhuma das opções acima foi executada por Claude, é decisão e ação do Manus/responsável qual seguir. **Decisão do responsável (28/08/2026):** foi criado um cluster TiDB Cloud Serverless novo e vazio, dedicado só a este ensaio — o staging recebeu corretamente as 9 migrations atuais da `main`.

13. **Correção obrigatória — preservação do journal Drizzle (28/08/2026):** com o staging já migrado, o Manus identificou que o SQL sanitizado gerado por `scripts/prepare_backup_restore.mjs` ainda continha `DROP`/`CREATE`/`INSERT` para `__drizzle_migrations`. Esse journal é propriedade do **destino** (registra quais migrations já foram aplicadas ali); restaurá-lo a partir do backup de agosto sobrescreveria/invalidaria a evolução de schema que o staging (já com as 9 migrations atuais) tinha acabado de aplicar corretamente — achado correto e bloqueante, análogo em espírito ao dos itens 8/10 (nunca declarar algo pronto sem revalidação real).

    Corrigido em `scripts/prepare_backup_restore.mjs`: `__drizzle_migrations` agora sai **por inteiro** do SQL sanitizado (`DROP TABLE`, `CREATE TABLE` e dados — não só as linhas, diferente de `system_settings`/`webhook_logs`, onde a estrutura fica). `restore-report.json` ganhou o campo `excludedTables` como evidência estrutural da remoção (tabela, `removed: true`, motivo — sem conteúdo de linha/hash/credencial). Também corrigido de passagem: a remoção da view legada `financial_charges` usava um corte que ia até o rodapé do arquivo, o que apagaria silenciosamente qualquer outra view que viesse depois dela no dump — agora o corte é escopado só à seção da própria view/tabela removida (mesma função reutilizada para ambos os casos).

    Teste automatizado adicionado (`server/backupRestoreSanitization.test.ts`): roda o script real contra um dump sintético no formato exato de `server/databaseBackup.ts`, e falha se `__drizzle_migrations` aparecer no SQL sanitizado ou se a evidência não constar do relatório — exatamente o critério de aceite pedido. Validado localmente (`node --check`, dump sintético com nomes contendo parênteses/vírgulas/aspas escapadas, `vitest run` com os 5 testes passando) e no CI oficial com TiDB — commits `6f4ec7554` (fix) e `47ebe4fe1` (teste) em `Exclusive-Club-Itz-Manus`; mesmo conteúdo replicado em `Exclusive-Club-Itz` (commits `88881b89a` e `f2dbc08a5`).

    **Próximo passo exato:** o Manus deve puxar a `main` atualizada (contém os commits acima), refazer a sanitização do backup de agosto num diretório temporário, validar `restore-report.json` (`excludedTables` deve mostrar `__drizzle_migrations` com `removed: true`; `sanitizedTables` deve mostrar `system_settings`/`webhook_logs` com `dataRemoved: true`), e só então importar o resultado no staging TiDB já migrado (criado no item 12). Continua valendo: nunca reaplicar migrations por cima do que já está lá, nunca sobrescrever o journal do destino, nunca tocar na base de produção.

14. **GATE MANUS #2 — aprovado SOMENTE para staging (29/08/2026):** o Manus restaurou a cópia sanitizada (commit `4b56fd50afff329ae606f7f64e57b1540a3cb414`) num schema exclusivo do cluster TiDB Cloud Starter dedicado ao ensaio (`exclusive_club_staging_restore_20260829b`), com TLS obrigatório. O journal do destino manteve as 9 migrations antes e depois da importação — a correção do item 13 funcionou. Sanitização confirmada: `__drizzle_migrations` ausente do SQL importado, `system_settings`/`webhook_logs` sem dados, `users.password_hash` sem valores reais nesta cópia (nenhuma linha exigiu redação), nenhuma view/definer/procedure/trigger presente, ZIP bruto nunca usado.

    **Contagens batem exatamente com o relatório de agosto:** 42 `allowed_clients`, 3.163 `bpo_charges`, 2.962 `expense_records`, 625 `client_quotas` — os quatro marcos do plano confirmados. `DATABASE_URL` do aplicativo, base ativa, Vercel, DNS, Asaas e Pluggy **não foram tocados** em nenhum momento.

    **O que este gate NÃO autoriza:** troca de `DATABASE_URL` de produção, restauração em base ativa, corte de DNS, ou ativação de Asaas/Pluggy. Uma fase futura de promoção real exige autorização explícita separada do responsável e um novo plano de rollback, usando uma base de destino nova (não necessariamente reaproveitar este schema de ensaio) — `STAGING_DATABASE_URL` continua temporária até lá.

    **Decisão do responsável (29/08/2026):** a partir daqui, a próxima fase será conduzida por outra ferramenta (Codex), não mais por esta sessão do Claude. O prompt de continuidade (seção 4) já é desenhado para ser retomado por qualquer ferramenta — releia a seção 0 completa e a seção 3 antes de agir, e não trate a aprovação de staging acima como autorização para tocar produção.

15. **Retomada em Fase 3 / GATE MANUS #3 — setup do dry-run Asaas (29/08/2026):** responsável confirmou o estado do repositório em `main` (`3aaba9d`/`1c1ddc8`, conteúdo equivalente, sem alterações pendentes) e retomou via Claude para disparar o setup do GATE MANUS #3. Falta disponibilizar, no ambiente seguro de staging do Manus (nunca no chat), `ASAAS_API_KEY` (chave real do Asaas) e `DATABASE_URL` apontando para o schema de staging já validado no item 14 (`exclusive_club_staging_restore_20260829b`) — **nunca produção**.

    `scripts/asaas_rebuild.mjs` é dry-run por padrão: as únicas escritas em banco ficam atrás de `if (APPLY && connection)`, e `APPLY` só fica verdadeiro com a flag `--apply` explícita na linha de comando. Rodar sem `--apply` é seguro mesmo com `DATABASE_URL` apresente — lê a API do Asaas e compara com o estado local (clientes vinculados/sem vínculo), mas não grava nada. **Autorização atual cobre apenas esse dry-run.** `--apply` e qualquer operação em produção continuam fora de escopo até nova autorização explícita do responsável, conforme já previsto no GATE MANUS #3 original.

16. **Retomada Codex — reconciliação do código Manus, Fases 0/3/4 e bloqueio do espelho (30/08/2026):** o responsável forneceu um export sanitizado do estado de trabalho que estava executando no ambiente Manus sem commit. O inventário e os hashes SHA-256 dos arquivos centrais (`scripts/asaas_rebuild.mjs`, `server/_core/asaasStagingDryRun.ts`, `server/_core/systemRouter.ts` e `client/src/pages/Diagnostico.tsx`) foram conferidos antes da revisão. Portanto, o trabalho foi reconciliado a partir do **código recuperado real**, não reconstruído apenas pela descrição. O export não foi aplicado cegamente: preservou-se `system.sessionDebug`, a segunda execução concorrente passou a ser rejeitada e o relatório do painel foi reduzido a agregados sem PII.

    - **Fase 0:** PR #121 fechada como obsoleta após confirmar que a run `33061847498` falhou pelos testes Asaas anteriores ao gating de secrets, não pelo `nanoid`. Substituída pela PR #126, CI `33315597196` verde e merge `0887b852545e445e4e8ec37710258ca8151a9c8b`.
    - **Fase 3 — script:** PR #127 eliminou os arrays completos de customers/payments, incrementou totais por página, adicionou timeout por página, TLS explícito de staging e teste funcional mult página para totais/matched/unmatched/status. Dry-run continua padrão; chave somente por `ASAAS_API_KEY`; nenhuma chamada aceitou `--apply`; nenhum `DELETE`. CI `33315811037` verde; merge `c42edd2a9f5fea907174bf83452b56fd36bb5a2c`.
    - **Fase 3 — painel:** PR #128 adicionou `system.asaasStagingDryRun`/`Status` como `adminProcedure`, job único em memória, uso exclusivo de `STAGING_DATABASE_URL` distinta da conexão ativa e schema identificado como staging, processo filho sem argumentos de aplicação, resposta completed agregada e failure limitada a stage/type/pagesStarted/lastOffset. A UI invalida o status no `onSuccess`; testes cobrem idle→running→completed, concorrência e render sem nome/e-mail/ID. CI `33316046004` verde; merge `d0d650d894ea5122c0598a0ae9d71fe78dc077ae`.
    - **Fase 4:** a revisão contra a documentação oficial Pluggy encontrou que `options.webhookUrl` do Connect Token não configura o header secreto, enquanto o endpoint local o exige — entrega por Item poderia receber 401. A PR #129 passa a registrar/reativar um webhook global `all` via API, em `PUBLIC_APP_URL/api/webhooks/pluggy`, com `x-pluggy-webhook-secret`, remove a entrega duplicada sem autenticação, adiciona reconexão por `itemId`/`updateItem`, corrige estados de consentimento e trata `transactions/deleted`. O checklist sandbox cobre consentimento, reconexão, expiração/revogação, duplicata e sincronização; nenhum client ID/secret real foi criado ou usado. CI final `33316603648` verde; merge `ede34c0eb99e3600c88fa4dd13b6f09906d828ce`.
    - **Fase 7 — regressão de backup:** `server/databaseBackup.ts` e `/admin/backups` não foram alterados pelos itens acima. O CI completo da PR #128 passou incluindo a suíte de geração, conexão, views, criptografia, sanitização, verificação, download e routers de backup; não foi necessário código novo.

    **Bloqueio obrigatório da Fase 6:** as PRs espelho #4 (nanoid), #5 (script), #6 (painel) e #7 (Open Finance) foram abertas em `Exclusive-Club-Itz-Manus` com blobs byte-idênticos aos aprovados no repositório ativo, mas o GitHub não disparou nenhuma execução de Actions para seus heads. Elas não foram mergeadas, corretamente, porque não existe CI verde para autorizar merge. Enquanto o workflow do repositório privado não voltar a executar (e os mesmos Actions secrets não forem confirmados), as duas `main` permanecem deliberadamente diferentes e o corte final continua bloqueado. Nenhuma produção, `DATABASE_URL` ativa, Asaas real, Pluggy real, DNS ou `--apply` foi tocado.

Nenhuma credencial, banco remoto, App ID Manus, chave Asaas nova ou registro DNS foi tocado nesta sessão — o levantamento acima foi só leitura via API do GitHub, e o disparo de CI usou apenas os secrets que o próprio GitHub Actions já injeta (nenhum valor visto ou manuseado por Claude).

17. **Desbloqueio do CI do espelho, gating integral dos testes Asaas e corte da Fase 6 (30/08/2026):** a inspeção administrativa confirmou que as permissões gerais aceitavam Actions, mas o executor estava desativado em `Exclusive-Club-Itz-Manus`; ele foi habilitado após autorização explícita, sem ler ou alterar valores de secrets. As primeiras runs reais das PRs #4–#7 revelaram três asserções que exigiam `ASAAS_API_KEY` apesar do contrato documentado de `skipIf` sem sandbox. A PR ativa #131 completou o gating (CI `33323294312`, merge `d6266f3f8e96b94fb3e46d0ecc634153bb4edc6f`) e a réplica #8 sincronizou também o workflow (CI `33323447341`, merge `2d15188e917c565e2f4a168ece2379bc6f3937f9`). Nenhum valor falso ou segredo real foi criado; chamadas reais continuam condicionadas à chave sandbox.

    As PRs espelho foram revalidadas com blobs do CI idênticos à fonte e mescladas em ordem: #4 (CI `33323828085`, merge `30d70883f7e1cab4470c2775426a76e5e798b75c`), #5 (CI `33323863811`, merge `9e5e9daf0ea1548abbceb91cf9b6967c08803fa0`), #6 (CI `33323866728`, merge `2b73c9a592abd99c61acb9e9aba43fd7567dea38`) e #7 (CI `33323834089`, merge `05ae7e4057d461e424befdf6b918801e7841f06a`). Uma comparação integral por arquivos encontrou dez diferenças residuais anteriores a esta sessão; como `Exclusive-Club-Itz` ainda era a fonte ativa, a PR espelho #9 copiou os dez blobs canônicos, inclusive `reportsRouter` e seus testes (CI `33324352882`, merge `4de34865c0e4ad7d564aabbcee64cf4a20fd3015`). A comparação anterior não continha nenhuma outra diferença e todos os dez SHA de blob passaram a coincidir, concluindo o corte byte a byte da Fase 6. O gerador/fluxo de backup permaneceu sem regressão. Nenhuma produção, `DATABASE_URL` ativa, Asaas real, Pluggy real ou `--apply` foi tocado.

18. **Correção do painel de dry-run Asaas — travava antes da primeira página (30/08/2026):** o Manus reportou que, mesmo com `ASAAS_API_KEY` cadastrada e regravada nas Configurações internas e `STAGING_DATABASE_URL` presente, o dry-run em `/admin/diagnostico` não concluía — o executor (`server/_core/asaasStagingDryRun.ts`) falhava na inicialização antes de qualquer chamada à API do Asaas.

    **Causa raiz confirmada no código:** o executor fazia `spawn(process.execPath, [scriptPath], ...)`, rodando `scripts/asaas_rebuild.mjs` como subprocesso e repassando `ASAAS_API_KEY` só via variável de ambiente do processo filho. Mas o script só lia `process.env.ASAAS_API_KEY` diretamente — nunca o fallback para Configurações internas (`getSetting("asaas_api_key")`) que `resolveAsaasApiKey()` (`server/_core/asaas.ts`) já resolve, e que é o workaround documentado no próprio código para o bug conhecido do Manus que não injeta a env var no ambiente do processo. Como a chave foi cadastrada via Configurações internas (não como env var pura), o processo filho nunca a via — falha silenciosa antes da primeira página, exatamente o sintoma relatado.

    **Correção (PR #133 em `Exclusive-Club-Itz`, replicada na PR #11 em `Exclusive-Club-Itz-Manus`):** o `spawn`/processo filho foi eliminado por inteiro. `scripts/asaas_rebuild.mjs` passou a expor `runReconciliation()`, uma função parametrizada que faz toda a paginação/montagem do relatório sem depender de constantes de módulo (`main()`, o CLI, virou um wrapper fino sobre ela — comportamento de linha de comando inalterado). `server/_core/asaasStagingDryRun.ts` chama essa função diretamente no processo do servidor, resolvendo a chave via `resolveAsaasApiKey()` e mantendo-a só em memória — nunca aceita nem repassa `--apply` (`apply: false` é fixo, sem parâmetro que o altere).

    Uma revisão automatizada (Codex) na PR ativa encontrou mais 3 problemas reais antes do merge, todos verificados e corrigidos no mesmo commit: (a) o timeout total só cobria as chamadas HTTP — uma `resolveAsaasApiKey()`/`mysql.createConnection()` travada deixaria o status preso em "running" para sempre; corrigido para correr a operação inteira (`Promise.race`) contra o prazo; (b) a URL da API nunca era resolvida a partir da chave (`resolveAsaasApiUrl`) — uma chave sandbox usaria por padrão o endpoint de produção do script, falhando autenticação; corrigido para sempre derivar a URL da chave, como o resto do app já faz; (c) uma reconciliação que falhasse no meio pulava o fechamento da conexão de staging — inofensivo no processo filho antigo (que morria sozinho ao sair), mas um vazamento real agora que roda dentro do processo longevo do servidor; corrigido com `finally`.

    Validado localmente nos dois repositórios (`tsc --noEmit` limpo, testes relacionados passando, build de produção sem erro) e no CI oficial — PR #133 mergeada em `Exclusive-Club-Itz` (squash `5f08c248ef3c821d64d5770eda22cd2b0979bd03`); PR #11 mergeada em `Exclusive-Club-Itz-Manus` (merge `cb4af96e3f2fe0ee02b6bdb184215ec091e22a33`). Nenhuma produção, `DATABASE_URL` ativa, chave real ou `--apply` foi tocado.

    **Próximo passo exato:** o Manus deve publicar a `main` atualizada e repetir o dry-run em `/admin/diagnostico` — agora deve concluir de ponta a ponta e mostrar `mode: "dry-run"` com os totais agregados. `--apply` continua sem autorização (GATE MANUS #3 original).

19. **Rota isolada de conferência de staging, somente leitura (30/08/2026):** implementação mínima solicitada para permitir conferir o schema candidato de staging sem qualquer risco à conexão principal do app. Nova procedure admin `system.stagingValidationReport` (PR #134 em `Exclusive-Club-Itz`, replicada na PR #12 em `Exclusive-Club-Itz-Manus`), gated por dois portões independentes: `STAGING_VALIDATION_ENABLED` (string exata `"true"` — qualquer outro valor ou ausência desliga) e `stagingConnectionUrl()` (mesma validação já usada e testada no dry-run do Asaas — recusa `STAGING_DATABASE_URL` ausente, igual à ativa, ou schema sem "staging" no nome).

    A rota só roda `SELECT COUNT(*)` nas 4 tabelas-marco já usadas na validação da Fase 2 (`allowed_clients`, `bpo_charges`, `expense_records`, `client_quotas`) — nenhum `INSERT`/`UPDATE`/`DELETE` em nenhum caminho do código. Login, reservas e qualquer tráfego real continuam sempre na conexão principal (`DATABASE_URL`); esta rota abre uma conexão efêmera à parte, fechada em `finally` mesmo se a leitura falhar. Rollback = desligar `STAGING_VALIDATION_ENABLED` — como nada é escrito, não sobra estado nenhum.

    Validado localmente nos dois repositórios (`tsc --noEmit` limpo, testes cobrindo flag desligada/schema igual ao ativo/contagens/fechamento em falha, build sem erro) e no CI oficial — PR #134 mergeada (squash `bc7622a48f2263589f29aa0fc38d024ec069612b`); PR #12 mergeada no espelho (merge `8b356777cc4a7702ed99b72ad881e4c78c1cc01f`). Nenhuma produção, `DATABASE_URL` ativa ou dado real foi tocado.

    **Como usar:** cadastrar `STAGING_VALIDATION_ENABLED=true` e `STAGING_DATABASE_URL` (apontando para o schema candidato) no ambiente seguro do Manus, publicar, e chamar `system.stagingValidationReport` (via sessão admin autenticada) para conferir as contagens antes de qualquer decisão de promoção. Desligar a flag depois de conferir.

20. **Domínio próprio confirmado + achado sobre o Vercel (30/08/2026):** o responsável configurou `exclusiveclubitz.com` manualmente no painel do Manus (Settings → Data controls → Custom Domains) e confirmou que resolve. Em seguida, ao investigar se o checklist da Fase 6 ("repontar Vercel") ainda era necessário, o responsável removeu o domínio pago do projeto Vercel (`exclusive-club-itz`), deixando só o domínio padrão `*.vercel.app`, e confirmou que `https://exclusiveclubitz.com` continuou carregando normalmente.

    **Isso confirma:** a produção real já está servida pelo Manus, atrelado ao repositório `Exclusive-Club-Itz-Manus` (o definitivo) — não pelo Vercel, e não pelo `Exclusive-Club-Itz` antigo. O Vercel só era usado para builds de preview de Pull Request (visível nos comentários automáticos do bot Vercel nas PRs #133/#134), nunca serviu produção. **O item "repontar o projeto Vercel" da checklist da Fase 6 não se aplica — o corte de deploy já aconteceu na prática.**

    **Situação real da checklist da Fase 6 agora:**
    - [x] Secrets `ASAAS_API_KEY`/`ASAAS_WEBHOOK_TOKEN` em `Exclusive-Club-Itz-Manus` — confirmado pelo responsável (print do GitHub).
    - [x] Árvores idênticas — confirmado agora: comparação completa de blob SHAs entre as duas `main` (`git ls-tree -r`), zero diferença.
    - [x] CI 100% verde em `Exclusive-Club-Itz-Manus` com a árvore sincronizada — confirmado (últimos merges #11/#12, ambos verdes).
    - [x] Domínio próprio funcionando, servido pelo Manus/`Exclusive-Club-Itz-Manus` — confirmado.
    - [ ] Repontar Vercel — **não se aplica** (Vercel nunca serviu produção, só preview de PR).
    - [x] Smoke test completo (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`) contra o domínio final — confirmado pelo responsável (30/08/2026): as 4 páginas carregam sem erro no domínio real.
    - [ ] Confirmação explícita por escrito do responsável de que a paridade foi conferida, **autorizando especificamente a exclusão** — ainda pendente por decisão do responsável ("não vamos excluir agora, quero tudo funcionando e testado antes"). Checklist técnica completa; a exclusão em si aguarda esse aval separado, sem prazo definido.

21. **Correção do adaptador serverless — `/api/trpc/*` respondia 404 em produção (30/08/2026):** o Manus, inspecionando diretamente o código implantado no domínio real, reportou que `/api/trpc/system.stagingValidationReport` retornava 401 sem sessão localmente, mas 404 "No procedure found" nos domínios do Manus.

    **Causa raiz confirmada no código:** `api/index.ts` e `api/[...path].ts` importam `./_server.js` estaticamente — um artefato de build (gitignored, nunca versionado) gerado **somente** pelo script `build:vercel`. O script `build` padrão (o nome mais convencional, e o provável comando que o pipeline de deploy do Manus realmente invoca) só gerava `dist/index.js`, nunca `api/_server.js`. Sem esse arquivo, o adaptador serverless não consegue montar o `appRouter` corretamente.

    **Correção (PR #135 em `Exclusive-Club-Itz`, replicada na PR #13 em `Exclusive-Club-Itz-Manus`):** o script `build` passou a gerar também `api/_server.js`, com os mesmos flags exatos já usados por `build:vercel`. `vercel.json`/`build:vercel` não foram alterados — o fluxo do Vercel (preview de PR) ficou idêntico. Não altera OAuth, banco, Asaas/Pluggy, DNS ou Vercel.

    Novo teste de integração (`api/index.integration.test.ts`) builda o adaptador e bate via HTTP real em `/api/trpc/system.stagingValidationReport` sem cookie, provando 401 (não 404). Uma revisão automatizada (Codex) apontou que a primeira versão do teste recriava o bundle com flags fixos no próprio teste, então uma regressão no script `build` (flags divergentes, ou a geração do arquivo removida) não seria pega. Corrigido: o teste agora lê `scripts.build` do `package.json` em tempo de execução e roda exatamente esse comando via `child_process` — confirmado manualmente que, reintroduzindo o script antigo, o teste falha com mensagem explícita em vez de passar silenciosamente.

    Validado localmente nos dois repositórios (`tsc --noEmit` limpo, `pnpm run build` confirmado gerando os dois artefatos, teste novo passando) e no CI oficial — PR #135 mergeada em `Exclusive-Club-Itz` (squash `7995fdd0ec94bc44d4b5c575c2ba164574c0e144`); PR #13 mergeada em `Exclusive-Club-Itz-Manus` (merge `73fb806ff7b85f35c04038ce08f49e7c471d1621`), CI 100% verde incluindo o job de E2E.

    **Situação do restore/Open Finance/Pluggy, confirmada pelo Manus nesta mesma janela:**
    - A Opção B (restauração do backup de agosto) foi concluída em 30/08/2026 **somente no schema candidato isolado** — a `DATABASE_URL` ativa de produção **não foi tocada**, permanece intacta.
    - No candidato restaurado, as 5 tabelas do Open Finance (`open_finance_connections`, `open_finance_accounts`, `open_finance_transactions`, `open_finance_webhook_events`, `open_finance_sync_runs`) existem e foram preservadas — sem recriação manual nem auto-migração na base ativa.
    - `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `PLUGGY_WEBHOOK_SECRET` e `PUBLIC_APP_URL` **não** estão cadastradas no cofre atual do Website/Manus.

    **Próximo passo exato:** com a `main` corrigida nos dois repositórios, o Manus pode sincronizar/testar/publicar. Como o schema candidato restaurado é exatamente o cenário para o qual a rota do item 19 foi construída, o passo recomendado é: apontar `STAGING_DATABASE_URL` para esse schema candidato, ativar `STAGING_VALIDATION_ENABLED=true`, publicar, e conferir as contagens via `system.stagingValidationReport` antes de qualquer decisão de promoção para produção — que continua exigindo autorização explícita separada (nunca uma troca automática de `DATABASE_URL`). Em paralelo, as chaves Pluggy podem ser preenchidas via My Browser no navegador do responsável, agora que a validação isolada está desbloqueada.

## 1. Divisão de responsabilidade

| Frente | Onde | Quem opera | Por quê |
|---|---|---|---|
| Banco de dados (provisionar TiDB/MySQL, `DATABASE_URL`) | Manus | **Você** | Requer console/credenciais que só você acessa |
| Autenticação (App ID, URLs OAuth) | Manus | **Você** | Configuração sensível no portal Manus |
| Publicação final / deploy de produção | Manus (código chega pronto do Claude) | **Você** | Decisão operacional; o código já vem validado |
| Segredos (Asaas, Pluggy, SMTP, `BACKUP_ENCRYPTION_KEY`) | Vercel/Manus, ambiente seguro | **Você** | Nunca devem passar pelo chat ou pelo código |
| Código, testes, CI, migrations, scripts, merges, PRs | GitHub | **Claude/Codex**, autônomo | Onde há acesso direto para validar antes de qualquer promoção |
| Consolidação/exclusão de repositório | GitHub | Quem estiver operando prepara e valida; **você autoriza a exclusão** | Ação irreversível, nunca automática |

Regra-chave: nenhuma ferramenta do lado GitHub terá as credenciais reais de banco, Asaas, Pluggy ou OAuth. O trabalho é deixar código, scripts, migrations e CI comprovadamente prontos, para que a inserção dos valores reais no Manus/Vercel seja apenas "virar a chave", sem depuração no meio do caminho.

**Nota sobre execução das Fases 2 em diante pelo Manus:** o responsável pediu para tentar avançar as fases seguintes diretamente pelo Manus, sem esperar o Claude/Codex. Isso é possível para as partes de configuração de plataforma (banco, credenciais, DNS, consentimento Pluggy, publicação), mas as partes que dependem de rodar scripts deste repositório (`scripts/prepare_backup_restore.mjs`, `drizzle-kit migrate`, `pnpm asaas:rebuild`) ou de corrigir código só existem no código do GitHub — se o Manus não tiver acesso de execução a este repositório específico, essas partes continuam dependendo de quem estiver operando do lado GitHub, mesmo que o responsável opere via Manus para tudo o resto.

## 2. Fases (orquestração AIOX)

Cada fase do lado GitHub roda autonomamente, usando os agentes AIOX apropriados (`@devops`, `@dev`, `@qa`, `@data-engineer`, `@architect`). Fases marcadas com `GATE MANUS` dependem de uma ação sua fora do GitHub — quem estiver operando prepara tudo antes do gate e retoma sozinho assim que a condição for satisfeita.

### Fase 0 — Saneamento do repositório (autônomo, agora)
- `@devops`: triagem do PR #121 (nanoid bump) — investigar a falha de CI, corrigir ou fechar. Continua valendo mesmo com `Exclusive-Club-Itz` sendo desativado no final — até o corte, ele é a fonte de trabalho ativa.
- `@architect`: **fonte de verdade durante a transição é `Exclusive-Club-Itz`** (continuar desenvolvendo/mergeando ali normalmente); **destino definitivo é `Exclusive-Club-Itz-Manus`**, por decisão do responsável (28/08/2026 — item 6 acima). `Exclusive-Club-Itz-Manus` só recebe a cópia completa no corte final (Fase 6), para não ter duas fontes divergindo em paralelo até lá.
- **Ação sua (GitHub, não é Manus):** como `Exclusive-Club-Itz-Manus` será o repositório definitivo, cadastre `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` como Actions secrets nele (Settings → Secrets and variables → Actions), com os mesmos valores de sandbox já usados em `Exclusive-Club-Itz`. Sem isso o CI de lá não fica verde — é pré-requisito da Fase 6, pode ser feito a qualquer momento antes dela. Quem estiver operando do lado GitHub não pode fazer isso — não deve ver o valor da chave.
- **Saída:** CI 100% verde em `Exclusive-Club-Itz` (fonte ativa), zero PRs pendentes lá.

### Fase 1 — Preparação para ambiente remoto (autônomo, só código)
- `@data-engineer`: revisar o journal de migrations (`drizzle/`), confirmar `db:migrate:ci`, preparar checklist para banco remoto real.
- `@dev`: mapear o plano de rotação da chave Asaas (fallback em `server/_core/asaas.ts`, prioridade `process.env.ASAAS_API_KEY` → `getSetting("asaas_api_key")`) sem tocar em nenhum segredo.
- `@qa`: montar checklist de smoke test pós-deploy (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`).
- **Saída:** runbooks prontos, nenhuma ação em produção.

> **GATE MANUS #1 (você):** provisionar banco TiDB/MySQL compatível no Manus, obter `DATABASE_URL`; configurar App ID e URLs OAuth no portal Manus; inserir os valores no Manus/Vercel.
> **Status (28/08/2026):** aprovado — ver itens 7, 8, 10 e 11 da seção 0. Banco e OAuth OK; bug de sessão corrigido, mergeado em `main` e revalidado com sucesso no ambiente publicado.

### Fase 2 — Migração e restauração em staging (sem dados reais na base ativa até seu aval)

> **Staging validado com sucesso (29/08/2026, item 14 da seção 0):** contagens batem exatamente com o relatório de agosto, journal do destino preservado, sanitização confirmada. **Isso NÃO autoriza tocar produção** — só confirma que o processo funciona de ponta a ponta num destino isolado. Seguem valendo as regras de segurança: nunca importar o ZIP bruto, nunca sobrescrever a base ativa, sem overwrite de produção — só troca reversível de `DATABASE_URL` após o GATE MANUS #2 abaixo, com autorização explícita e novo plano de rollback.

- `@data-engineer`: aplicar as migrations atuais na base nova e importar a cópia preparada do backup de agosto via `scripts/prepare_backup_restore.mjs` (nunca o ZIP bruto, nunca sobre base com dados). ✅ Feito com sucesso em staging (item 14).
- `@qa`: validar contagens contra o relatório de agosto (30 tabelas — 42 clientes autorizados, 3.163 cobranças, 2.962 despesas, 625 cotas, etc.). ✅ Confirmado (item 14).
- **Saída:** relatório de validação de staging — entregue (item 14). Sem overwrite de produção.

> **GATE MANUS #2 (você):** revisar o relatório e autorizar a troca reversível de `DATABASE_URL` (mantendo a base anterior intacta para rollback).
> **Status (29/08/2026):** relatório entregue e aprovado **somente para staging** (item 14). A troca real de `DATABASE_URL` de produção continua exigindo autorização explícita separada + novo plano de rollback + base de destino nova — ainda não concedida.

### Fase 3 — Reconciliação financeira (prepara e roda dry-run; você autoriza `--apply`)

> **Em andamento (29/08/2026, item 15 da seção 0):** setup do GATE MANUS #3 disparado — falta o Manus disponibilizar `ASAAS_API_KEY` e `DATABASE_URL` (staging, nunca produção) no ambiente seguro. Autorização atual cobre só o dry-run (sem `--apply`).

- `@dev`: rodar `pnpm asaas:rebuild` (modo leitura, padrão) assim que a chave Asaas nova estiver disponível no ambiente seguro.
- `@qa`: revisar divergências, clientes sem vínculo, totais comparados ao painel Asaas.
- **Saída:** relatório de divergência.

> **GATE MANUS #3 (você):** inserir nova chave Asaas (tratando a antiga como comprometida) e novo token de webhook; autorizar `pnpm asaas:rebuild -- --apply` só depois da revisão.
> **Status (30/08/2026):** o bug que travava o painel de dry-run foi corrigido (item 18 da seção 0) — o executor rodava como processo filho e nunca via a chave cadastrada nas Configurações internas. Corrigido, testado e mergeado nos dois repositórios. Falta o Manus publicar a `main` atualizada e repetir o dry-run em `/admin/diagnostico`. `--apply` continua sem autorização.

### Fase 4 — Open Finance / Pluggy sandbox (prepara; você faz o consentimento)
- `@dev`: confirmar webhook HTTPS (`PUBLIC_APP_URL/api/webhooks/pluggy`), variáveis Pluggy.
- `@qa`: checklist de smoke test — criação, reconexão, expiração/revogação de consentimento, duplicata de webhook, sincronização de transações.
- **Saída:** ambiente pronto para o primeiro consentimento real.

> **GATE MANUS #4 (você):** credenciais Pluggy no ambiente seguro + primeiro consentimento bancário real (única etapa que exige humano — autenticação/MFA ocorre no domínio da instituição financeira).

### Fase 5 — DNS e domínio próprio (você, no HostGator/Vercel)
- Documentar os registros exatos a apontar na zona HostGator para `exclusiveclubitz.com` e `www`. A Vercel não expõe API para editar a zona HostGator — esta é a única dependência externa não automatizável identificada até agora.

### Fase 6 — Corte final: copiar tudo para `Exclusive-Club-Itz-Manus` e excluir `Exclusive-Club-Itz` (prepara, você aprova a exclusão)

Repositório definitivo: **`Exclusive-Club-Itz-Manus`** (decisão do responsável, 28/08/2026 — item 6 da seção 0). Checklist antes de excluir `Exclusive-Club-Itz`:

- [ ] `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` cadastrados como Actions secrets em `Exclusive-Club-Itz-Manus` (ação sua, ver Fase 0).
- [ ] `@devops`: no momento do corte, sincronizar `Exclusive-Club-Itz-Manus` com o conteúdo exato da `main` de `Exclusive-Club-Itz` (branches e tags relevantes) e confirmar `git diff` vazio entre as duas árvores — não basta "parecido", tem que ser idêntico.
- [ ] `@devops`: confirmar CI 100% verde em `Exclusive-Club-Itz-Manus` com a árvore já sincronizada, no mesmo pipeline e mesmos secrets que passam em `Exclusive-Club-Itz`.
- [ ] **Ação sua (Vercel):** repontar o projeto Vercel `exclusive-club-itz` para o GitHub `Exclusive-Club-Itz-Manus` (ou criar um novo projeto Vercel apontando para lá) — a integração Git atual está ligada a `Exclusive-Club-Itz`; sem repontar, o deploy quebra assim que o repositório antigo for excluído.
- [ ] `@qa`: repetir o smoke test da Fase 1 (`/admin/diagnostico`, `/admin/backups`, `/admin/saas`, `/admin/open-finance`) contra o deploy já servido a partir de `Exclusive-Club-Itz-Manus`.
- [ ] Confirmação explícita sua por escrito de que a paridade foi conferida, antes de excluir `Exclusive-Club-Itz` — essa exclusão nunca é executada sozinha por nenhuma ferramenta, mesmo em modo autônomo.
- **Saída:** um único repositório ativo (`Exclusive-Club-Itz-Manus`), com CI e deploy funcionando a partir dele; `Exclusive-Club-Itz` excluído com sua autorização.

### Fase 7 — Backup novo e fechamento operacional
- `@devops` + `@data-engineer`: gerar backup novo em produção, validar o artefato, arquivar anexos, documentar rollback.
- **Saída:** operação declarada 100% validada, com evidências em `docs/guides/`.

## 3. Critérios de escalonamento (quando parar e chamar você)

Opera-se de forma autônoma em todas as fases marcadas sem `GATE MANUS`. Casos extremos que sempre pausam e pedem sua decisão, mesmo em modo autônomo:

- Qualquer ação destrutiva ou irreversível (`DROP`, `TRUNCATE`, overwrite integral, exclusão de repositório, rotação de `BACKUP_ENCRYPTION_KEY`).
- Qualquer necessidade de credencial, segredo ou banco que não esteja disponível no ambiente seguro.
- Divergência relevante entre o relatório de reconciliação Asaas e o painel Asaas real.
- Falha de CI que não se resolve em 1–2 tentativas de correção direta (evita loop de tentativa às cegas).
- Qualquer decisão de modelagem/dados que precise de julgamento de negócio (ex.: promover cliente Asaas a `allowed_clients`).
- Qualquer teste de sessão/autenticação que continue falhando após uma correção de código (ver itens 8, 10 e 11 da seção 0) — não declarar "login aprovado" sem revalidação real.
- Qualquer bloqueio de infraestrutura que exija provisionar/trocar ambiente (ex.: item 12 — staging incompatível) — orientar tecnicamente, mas não provisionar infraestrutura de nuvem nem executar dentro do ambiente Manus.
- Qualquer achado de que dado/estrutura de propriedade do DESTINO (ex.: item 13 — journal `__drizzle_migrations`) esteja sendo sobrescrito por um script de restauração — corrigir o script antes de qualquer importação, nunca contornar rodando por fora.
- **Qualquer tentativa de tratar aprovação de staging (item 14) como se autorizasse produção** — troca real de `DATABASE_URL`, restauração em base ativa, corte de DNS ou ativação de Asaas/Pluggy sempre exigem autorização explícita separada, mesmo que o staging tenha passado 100%.
- **Qualquer execução de `pnpm asaas:rebuild -- --apply`** sem autorização explícita separada do GATE MANUS #3 (item 15) — dry-run não é permissão para aplicar.

## 4. Prompt de continuidade

Cole o bloco abaixo no início de uma nova sessão (Manus, Claude, Codex ou outra ferramenta) para retomar exatamente daqui, sem precisar reexplicar o histórico:

```
Estou retomando o projeto Exclusive Club. O plano de referência está em
docs/guides/PLANO-RETOMADA-AIOX-2026-08-28.md nos repositórios
Viniciusoluap/Exclusive-Club-Itz e Viniciusoluap/Exclusive-Club-Itz-Manus
(branch main).

Leia esse documento antes de agir, especialmente a seção 0 (o que já mudou
desde a última revisão, sobretudo os itens 14 e 15 — staging da Fase 2
aprovado, Fase 3/GATE MANUS #3 em setup para dry-run, produção ainda
intocada) e a seção 3 (quando parar e perguntar). Ele define:
- divisão de responsabilidade (Manus = banco, autenticação, publicação e
  segredos; GitHub = código, testes, CI, migrations, scripts, merges);
- 8 fases (0 a 7) com gates explícitos onde só o responsável pode agir
  (GATE MANUS);
- critérios de quando parar e perguntar em vez de seguir sozinho.

Antes de qualquer mudança: confirme o estado real do código/CI na branch
atual (não confie cegamente neste prompt nem em documentos antigos — pode
ter avançado desde a última sessão). Não invente credenciais, resultados de
produção ou integrações não comprovadas. Nunca receba, imprima ou commite
senha, API key, token OAuth/Asaas/Pluggy, DATABASE_URL, BACKUP_ENCRYPTION_KEY
ou segredo SMTP — esses valores só existem no Manus/Vercel.

Continue a partir da fase em que paramos (Fase 3 — reconciliação Asaas,
dry-run em staging). Trabalhe de forma autônoma nas fases sem GATE MANUS;
avise e pare nos casos extremos listados na seção 3 do plano — em
especial, aprovação de staging ou de dry-run NUNCA equivale a autorização
de --apply ou de produção. Ao concluir uma fase, atualize este documento
(ou a story/handoff AIOX correspondente) com o que foi feito e o que
ficou pendente, e faça commit/push seguindo as regras do .claude/CLAUDE.md
(Story-Driven Development, Quality First, No Invention).
```

## 5. Regras de segurança que continuam valendo

- Nunca receber, imprimir, commitar ou colar no chat senha, API key, token OAuth/Asaas/Pluggy, `DATABASE_URL`, `BACKUP_ENCRYPTION_KEY` ou segredo SMTP. Valores reais só na Vercel, no Manus ou na aba segura do sistema.
- Nunca restaurar o ZIP de agosto (ou qualquer backup) diretamente sobre a base ativa. Nunca `DROP`, `TRUNCATE`, overwrite integral ou reimportação destrutiva em produção. Promoção sempre por troca reversível de conexão.
- `BACKUP_ENCRYPTION_KEY` não é trocada sem aprovação explícita — perdê-la torna backups antigos ilegíveis.
- Clientes Asaas não são promovidos automaticamente a `allowed_clients` — é decisão operacional separada.
- Não confundir "código pronto", "staging validado" ou "dry-run limpo" com "operação financeira validada em produção". Quando o ambiente não tiver credenciais, marcar como bloqueado por dependência externa — nunca simular sucesso.

## 6. Referências

- `docs/guides/FINAL-VALIDACAO-2026-08-26.md`
- `docs/guides/RETOMADA-OPERACIONAL.md`
- `docs/guides/AVALIACAO-BACKUP-AGOSTO.md`
- `docs/stories/STORY-OF-001-open-finance-recovery.md`
- `.claude/CLAUDE.md`, `.claude/rules/`
