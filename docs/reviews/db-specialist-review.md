# Database Specialist Review

> **Fase 5 do workflow Brownfield Discovery** — `@data-engineer` (Dara) — 2026-07-18
> Revisão especialista da Seção 2 (Database) do `docs/prd/technical-debt-DRAFT.md`.
> Análise **somente-leitura** sobre `drizzle/schema.ts`, `drizzle/*.sql`, `drizzle/meta/_journal.json` e `server/`. Nenhuma conexão a banco real; nenhuma migration executada.

## Método de validação

Reverifiquei o código-fonte para confirmar os débitos do DRAFT e caçar lacunas. Evidências novas coletadas nesta fase:

- **FKs:** `grep references( drizzle/schema.ts` → **1 ocorrência**. Confirma DB-01 (1 FK em 21 tabelas). Os 16 `onDelete/onUpdate` do grep são `onUpdateNow()` de `updated_at`, não FKs.
- **`sql.raw()` / SQL cru:** 311 ocorrências de `sql\`\`/db.execute/sql.raw` em 19 arquivos; `routers.ts` concentra 134. **6** interpolações diretas de `client_email = '${...}'` em `routers.ts` — confirma o vetor de injeção de 2ª ordem (DB-02).
- **Transações:** `grep .transaction( server/` → **0 ocorrências**. Nenhuma transação em todo o backend (achado novo — DB-17).
- **Conexão/pool:** `server/db.ts:11` → `_db = drizzle(process.env.DATABASE_URL)` — string direta, **conexão única** (mysql2 `createConnection`, não `createPool`), sem `schema`, sem reconnect (achado novo — DB-18).
- **Tipos monetários:** `fuel_budget/gallon_stock/fuel_purchases/fuel_records` usam `int` (centavos); `inspection_charges.amount` e `bpo_charges` usam `decimal(10,2)` — representação monetária mista (achado novo — DB-19).
- **Migrations:** 65 arquivos `.sql` em `drizzle/`, `_journal.json` com 63 entradas (idx 0–62). Confirmados os 4 pares órfãos (`0002/0003/0004/0062`). Confirma DB-04.
- **Charset/collation:** nenhuma declaração explícita de `charset`/`collate` no `schema.ts` — depende do default do servidor (achado novo, verificação — DB-20).

---

## Débitos Validados

Legenda severidade (escala unificada Crítico/Alto/Médio/Baixo). Horas = estimativa refinada para uma pessoa. Prioridade em ótica de dados: **segurança → integridade → performance → manutenção**.

| ID | Débito | Severidade (ajuste) | Horas | Prioridade | Notas |
|----|--------|---------------------|-------|------------|-------|
| DB-02 | `sql.raw()` c/ interpolação de string (injeção 2ª ordem) | **Crítico** (era Alta ↑) | 16–24 | **P0** | Confirmado: 6 interpolações de `client_email` mutável. Elevo a Crítico — é o achado mais grave do banco; vetor real de vazamento/alteração cross-cliente. Topo absoluto. |
| DB-04 | Migrations numeração duplicada / drift | **Alta** (mantida) | 4–8 (era 8–16 ↓) | **P0** | Refino p/ baixo: é reconciliação pontual de baseline (verificar via `mysqldump --no-data`, remover 4 órfãos, documentar baseline), não corrupção contínua. **Enabler crítico:** bloqueia com segurança qualquer DDL futura (FKs/índices). Fazer cedo. `=SYS-01`. |
| DB-05 | Segredo `asaas_api_key` em `system_settings` | **Alta** (mantida) | 4–8 | **P0** | Confirmado. Ainda que o storage gerenciado cifre at-rest, o valor é legível em texto plano por qualquer código/admin com `DATABASE_URL`. Quick win de segurança. `=SYS-05`. |
| DB-03 | Autorização inline em `publicProcedure` | **Alta** (mantida) | 16–24 | **P1** | Confirmado. É débito de controle de acesso da camada de dados. `~SYS-12`. Escopo por dono (`WHERE client_email=ctx.user.email`) sobrepõe DB-02 — coordenar. |
| DB-01 | Ausência de foreign keys | **Alta** (mantida) | 16–40 | **P1** | Confirmado (1 FK). **Ressalva de plataforma (crítica p/ planejamento):** se o MySQL gerenciado for PlanetScale/Vitess ou TiDB, FKs têm suporte limitado/ausente. Ver Resposta 4. Se não suportar FK nativa, a mitigação vira integridade aplicacional + jobs de reconciliação (esforço menor de DDL, maior de app). **Confirmar plataforma antes de comprometer 24–40h.** |
| DB-06 | Índices faltando em colunas quentes | Média (mantida) | 6–10 | **P1** (era P2 ↑) | Maior ROI do backlog de dados. Índices são baixo risco e aceleram tanto queries quanto as agregações recursivas do SYS-13. Promover para quick win precoce. |
| DB-07 | `bpo_charges` sem índice em `client_email` | Média (mantida) | 1–2 | **P1** (era P2 ↑) | Quick win de 1–2h que elimina full scan no portal do cliente. Fazer junto de DB-06. |
| DB-09 | UNIQUE ausente em chaves naturais | Média (mantida) | 4–8 | **P2** | Confirmado. **Pré-requisito de dados:** não é possível criar UNIQUE se já houver duplicatas — exige auditoria/dedup de `users.email/open_id`, `allowed_clients.email`, `employees.email` **antes** do DDL. Risco de identidade duplicada é correção séria; recomendo executar cedo dentro de P2. Absorve DB-14 (nomes viram corretos ao virar UNIQUE real). |
| DB-08 | Zero CHECK constraints | Média (mantida) | 4–8 | **P2** | Confirmado. **Ressalva:** MySQL < 8.0.16 ignora CHECK silenciosamente; TiDB tem suporte parcial. Verificar versão/engine antes de confiar em CHECK — senão manter validação na app. |
| DB-10 | Scripts ad-hoc contra produção | Média (mantida) | 8–12 | **P2** | Confirmado. `⊂SYS-08` (subconjunto de maior risco). Consolidar em `scripts/` com dry-run e proibir execução automática contra prod. |
| DB-11 | `employees.vessel_ids` CSV/JSON em text | Média (mantida) | 8–12 | **P2** | Confirmado. Normalizar p/ junção `employee_vessels`. Depende de DB-04 (baseline limpo) para migrar com segurança. |
| DB-12 | Desnormalização ampla sem sincronização | Média (mantida) | 8–16 | **P2** | Confirmado. **Ressalva:** "trigger de consistência" pode não ser viável em Vitess/PlanetScale (triggers não suportados). Se for o caso, sincronização passa a ser aplicacional (helper único no write path) — relaciona DB-01. |
| DB-13 | Tipos temporais inconsistentes | Baixa (mantida) | 12–20 | **P3** | Confirmado. Alto esforço, baixa prioridade — invasivo (toca múltiplas tabelas + math da app). Só após integridade estabilizada. |
| DB-14 | Índice `*_unique` sem ser UNIQUE | Baixa (mantida) | — (fold DB-09) | **P2** | **Mesclar execução em DB-09**: ao promover a UNIQUE real, o nome deixa de ser enganoso. Não gastar linha própria de esforço. |
| DB-15 | `fuel_records` tabela larga (~40 col.) | Baixa (mantida) | 16–24 | **P3** | Confirmado. Decomposição oportunista; coordenar com workstream de combustível (SYS-11/DB-19). |
| DB-16 | Escape manual de aspas em SQL | Baixa (mantida) | — (fold DB-02) | **P0** | **Mesclar em DB-02**: mesma erradicação de `sql.raw()` interpolado. Não é workstream separado. |

**Resumo de ajustes:** 16 débitos validados · 1 severidade elevada (DB-02 → Crítico) · 4 prioridades ajustadas (DB-06/DB-07 ↑ P1; DB-04 esforço ↓) · 2 dobrados em outros (DB-14→DB-09, DB-16→DB-02) · 0 removidos. Todos os 16 débitos da Fase 2 se sustentam.

---

## Débitos Adicionados

Quatro débitos de dados não capturados na Fase 2, confirmados por releitura do código:

| ID | Débito | Severidade | Horas | Prioridade | Evidência / Notas |
|----|--------|------------|-------|------------|-------------------|
| **DB-17** | **Zero transações no backend** | **Alta** | 12–20 | **P1** | `grep .transaction( server/` → 0 ocorrências. Fluxos financeiros multi-escrita (criar cobrança Asaas + atualizar `fuel_records`/`inspection_charges` + `syncStatusToSources`) **não são atômicos**. Falha no meio deixa dado financeiro parcial/inconsistente — o mesmo problema que DB-12 tenta remediar depois. Envolver os write paths críticos (cobrança, pagamento, sync) em `db.transaction()`. Alta severidade: corrupção silenciosa de dados financeiros. |
| **DB-18** | **Conexão única sem pool nem reconnect** | Média | 3–6 | **P2** | `server/db.ts:11` `drizzle(process.env.DATABASE_URL)` cria **uma** conexão mysql2 memoizada (não pool). Consequências: (a) queries serializadas sob carga; (b) se a conexão cai por idle timeout, todas as queries subsequentes falham até restart do processo (sem reconnect); (c) `schema` não é passado → perde-se a API relacional tipada (`db.query`), o que empurra o time para `sql.raw()` (raiz de DB-02). Trocar por `createPool` + passar `schema`. Baixo esforço, alto valor de estabilidade. Responde parcialmente à Pergunta 4 do architect. |
| **DB-19** | **Representação monetária mista (int centavos vs decimal)** | Média | 8–16 | **P2** | Combustível (`fuel_budget`, `gallon_stock`, `fuel_purchases`, `fuel_records`) guarda dinheiro como `int` (centavos); `inspection_charges.amount` e `bpo_charges` usam `decimal(10,2)`. Agregações/relatórios que cruzam domínios (ex.: financeiro consolidado) misturam escalas → erros de conversão de 100x e arredondamento. Padronizar (recomendo `decimal(12,2)` em todo dinheiro, ou centavos-int em todo, com camada de conversão única). Relaciona DB-13 (inconsistência de tipos) e DB-15. |
| **DB-20** | **Sem charset/collation explícito no schema** | Baixa | 2–6 | **P3** | `schema.ts` não declara `charset`/`collate`; depende do default do servidor. Dois riscos: (a) se não for `utf8mb4`, emojis/unicode completo truncam em campos de texto (nomes, `notes`, `inspection_data` JSON); (b) collation define se os **joins por `client_email`** (base de todo o isolamento por dono — DB-02/DB-03) são case-sensitive/insensitive — divergência de collation entre tabelas pode fazer o mesmo email não casar. **Verificar via `SHOW TABLE STATUS` / `information_schema` antes de qualquer remediação.** Prioridade baixa mas verificação barata. |

---

## Respostas ao Architect (Seção 6)

**1. SYS-01/DB-04 — migrations duplicadas, branches, drift.**
Sim, o padrão é de merge de branches paralelas. Evidência decisiva: `0062_small_katie_power` e o órfão `0062_add_password_hash` fazem **a mesma** alteração (`ADD password_hash`) — rodar ambos daria erro de coluna duplicada, o que só acontece se duas branches adicionaram a coluna independentemente e o merge manteve os dois arquivos. O `_journal.json` (63 entradas, por `tag`) rastreia apenas **uma** tag por número; os 4 órfãos (`0002_loud_ironclad`, `0003_chief_blockbuster`, `0004_flimsy_maestro`, `0062_add_password_hash`) **não** são aplicados por `drizzle-kit migrate`. Portanto: em produção, o estado atual reflete o que foi aplicado manualmente/historicamente; em **ambiente novo**, os órfãos são ignorados → drift garantido. **Não posso confirmar o estado de produção sem `mysqldump --no-data`** (análise foi read-only sobre o repo, sem conexão). Ação obrigatória antes de qualquer DDL nova: gerar o dump de estrutura, diff contra o schema que o journal reproduz, decidir por órfão (já-aplicado → deletar arquivo; nunca-aplicado e desejado → renumerar como nova migration `0063+`), documentar o baseline. **DB-04 é enabler: bloqueia FKs/índices até resolvido.**

**2. SYS-05/DB-05 — criptografia at-rest, acesso, outros segredos.**
`asaas_api_key` está em `system_settings` como valor **texto plano** (coluna `value text`, lida via `getSetting`). Storage gerenciado provavelmente cifra o disco at-rest, mas isso **não protege** contra o vetor real: qualquer código de app, qualquer um dos ~25 scripts da raiz (DB-10) e qualquer admin com acesso de leitura à tabela veem a chave em claro. Leitores = todo o backend + todo portador de `DATABASE_URL`. Varredura de outros segredos em `system_settings` requer inspeção dos dados reais (não fiz — read-only sobre código); pelo padrão chave/valor genérico, é provável que outras configs sensíveis (tokens SMTP, webhooks) também estejam lá — **auditar as `key`s em produção**. Destino recomendado: env/secret manager, com rotação da chave após a migração (assumir comprometida).

**3. SYS-11/SYS-13/DB-06 — índices para agregações de combustível/saldo, volume.**
Confirmado que faltam índices nas colunas de agregação. `fuel_budget` tem índice em `month_year` e `gallon_stock` em `gallon_number` (existentes), mas `fuel_records`, `fuel_purchases`, `fuel_record_containers` **não têm** índice em `month_year`/`gallon_number`/`created_at` (ver SCHEMA.md — essas 3 estão na lista "sem nenhum índice", exceto o `fuel_record_id_idx` de containers). As recursões de saldo (`calculateMonthFinalBalance`, SYS-13) varrem `fuel_records`/`fuel_purchases` por mês repetidamente → sem índice em `month_year` isso é full scan por iteração da recursão. **Índices recomendados (DB-06):** `fuel_records(month_year)`, `fuel_records(booking_id)`, `fuel_records(client_email)`, `fuel_purchases(month_year, gallon_number)`. **Volume esperado:** não é derivável do código (sem acesso a dados); precisa de `SELECT COUNT(*)` por tabela em prod. Mesmo com volume baixo hoje, os índices são baratos e evitam degradação — recomendo aplicá-los independentemente do volume atual.

**4. Pool/dialeto — estratégia de conexão, MySQL puro vs TiDB.**
`server/db.ts:11`: `drizzle(process.env.DATABASE_URL)` — **conexão única memoizada, sem pool** (formalizado como novo débito **DB-18**). `schema` não é passado ao `drizzle()`, então a API relacional tipada não está disponível — o que empurra o time a `sql.raw()` (contribui para DB-02). **Não consigo confirmar TiDB vs MySQL puro só pelo código** (a URL vem de env); a quase-total ausência de FKs é sintoma consistente com Vitess/PlanetScale **ou** TiDB, ambos com suporte a FK limitado/desabilitado por padrão. **Esta é a pergunta mais consequente do documento**, porque decide o approach de DB-01/DB-08/DB-12: se for TiDB/Vitess, FKs nativas, triggers e (parcialmente) CHECK podem não existir → a integridade migra para a camada de aplicação. **Recomendação:** confirmar o provider via `SELECT VERSION()` / `SELECT @@version_comment` antes de estimar DB-01 definitivamente. Independente do provider, trocar para `createPool` + `schema` (DB-18) é seguro e recomendado.

**5. Integridade DB-01/DB-12 — FK/constraint entre cobranças ou só sync aplicacional.**
Só **sincronização aplicacional**. Confirmado: 1 única FK em todo o banco (`fuel_purchases.purchased_by → users.id`); `bpo_charges`, `inspection_charges`, `fuel_records`, `webhook_logs` não têm FK entre si nem para `allowed_clients`/`vessels`. O status de pagamento é reconciliado por código (`syncStatusToSources`) sobre cópias desnormalizadas (`client_email`, `vessel_name`), **sem transação** (DB-17) e **sem enforcement** (DB-01). Risco concreto: uma cobrança pode apontar para um cliente/embarcação inexistente ou divergente, e uma falha no meio do sync deixa status inconsistente entre a fonte Asaas e as tabelas locais. É a interseção mais perigosa de DB-01 + DB-12 + DB-17 — recomendo tratá-los como um workstream de "integridade financeira".

**6. Retenção — `webhook_logs`, truncamento a 4000 chars.**
Não há tabela `webhook_logs` no SCHEMA.md das 21 tabelas catalogadas (o schema lista `backup_history`, `asaas_customers`, etc., mas não `webhook_logs`) — a pergunta pode referir-se a uma tabela criada por migration fora do `schema.ts`, ou a logs em `system_settings`/arquivo. **Não confirmei existência nem política de retenção via read-only.** Se existir e não tiver expurgo, cresce indefinidamente (débito de retenção). Truncar payload a 4000 chars é aceitável para triagem, mas **insuficiente para auditoria/replay** de webhooks Asaas com payloads grandes (o payload original não é reconstituível). Recomendação: se a tabela existe, adicionar política de retenção (ex.: TTL 90 dias) e, para auditoria, guardar payload completo ou o hash+referência ao objeto original. **Requer confirmação da existência da tabela em prod.**

---

## Sobreposições — Parecer

**O-1 (SYS-01 ≡ DB-04) — MESCLAR.** É o mesmo débito visto de dois ângulos: @architect enxerga o impacto de **deploy/CI** (ordem não-determinística, deploy quebrado em ambiente novo); eu enxergo o **journal vs. estado do banco** (drift, órfãos não rastreados). Raiz única: colisão de numeração por merge de branches. Na Fase 8, consolidar em **um débito** com **dono @data-engineer** (execução: reconciliar baseline via `mysqldump`, remover/renumerar órfãos, documentar) e @architect como stakeholder do impacto de CI/deploy. Manter as duas descrições como "perspectivas" do mesmo item.

**O-2 (SYS-05 ≡ DB-05) — MESCLAR.** Duplicata exata: `asaas_api_key` em `system_settings`. Um só débito de segurança. Divisão de responsabilidade na execução: **@data-engineer** confirma legibilidade/at-rest e remove o valor da tabela (+ rotação); **@architect** define o destino (secret manager vs env) e o plumbing de config. Consolidar na Fase 8 como um item P0.

**Nota sobre O-4 (SYS-11 ↔ DB-02 ↔ DB-16):** endosso o tratamento como **workstream único** "erradicar `sql.raw()` interpolado". Acrescento que **DB-18** (passar `schema` ao Drizzle, habilitando a API tipada) é **pré-condição facilitadora** deste workstream — sem a query builder relacional, o time continuará caindo em `sql.raw()`. Sugiro incluir DB-18 no mesmo workstream.

---

## Recomendações — Ordem de Resolução (ótica de dados)

Sequência priorizada por **segurança → integridade → performance → manutenção**, respeitando dependências:

**P0 — Segurança e enablers (fazer primeiro, em paralelo onde possível):**
1. **DB-02 (+DB-16) — erradicar `sql.raw()` interpolado** [16–24h]. Maior risco do banco. Priorizar as 6 interpolações de `client_email` e a de `input.reason`. Incluir DB-18 (passar `schema`) como facilitador.
2. **DB-04 (=SYS-01) — reconciliar baseline de migrations** [4–8h]. **Enabler:** nenhuma DDL subsequente (FKs, índices, uniques) é segura antes disto. Exige `mysqldump --no-data` de produção.
3. **DB-05 (=SYS-05) — extrair segredo Asaas para env/secret manager** [4–8h] + rotação. Quick win de segurança.

**P1 — Controle de acesso, integridade e quick wins de performance:**
4. **DB-03 — migrar mutations para procedures tipadas + centralizar scoping por dono** [16–24h]. Coordenar com DB-02 (ambos tocam `WHERE client_email`).
5. **DB-07 + DB-06 — índices** [1–2h + 6–10h]. Quick wins de altíssimo ROI; DB-07 é 1–2h. Fazer cedo, em paralelo.
6. **DB-17 — transações nos fluxos financeiros** [12–20h]. Fecha o buraco de escrita parcial em dados financeiros (interage com DB-12).
7. **DB-01 — foreign keys** [16–40h]. **Gate:** confirmar suporte a FK do provider (Resposta 4) antes de comprometer esforço. Se não suportar, converter em integridade aplicacional + jobs de reconciliação.

**P2 — Correção de modelagem e higiene:**
8. **DB-09 (+DB-14) — UNIQUE em chaves naturais** [4–8h], precedido de auditoria/dedup.
9. **DB-08 — CHECK** [4–8h] (verificar versão/engine antes). **DB-19 — padronizar tipo monetário** [8–16h]. **DB-11 — junção `employee_vessels`** [8–12h]. **DB-10 — consolidar scripts** [8–12h]. **DB-12 — sync desnormalização** [8–16h].

**P3 — Oportunista:**
10. **DB-13** [12–20h], **DB-15** [16–24h], **DB-18 (se não feito no P0)** [3–6h], **DB-20** [2–6h, verificação primeiro].

**Pré-requisito transversal para toda alteração de schema:** `mysqldump` de snapshot antes de aplicar qualquer migration; validar que `backup_history`/rotinas de backup estão funcionais (Constituição AIOX — nunca backup table dentro do próprio DB gerenciado).
</content>
</invoke>
