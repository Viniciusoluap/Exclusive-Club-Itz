# Database Audit — exclusive-club-reservas

> Auditoria somente-leitura — @data-engineer (Dara), Fase 2 brownfield-discovery.
> Escopo: `drizzle/` (schema, migrations, meta), camada de acesso `server/` (tRPC), scripts ad-hoc da raiz.
> Nenhuma alteração aplicada. Nenhuma conexão a banco real realizada.

## Sumário

- **Stack real:** Drizzle ORM + **MySQL** (não Postgres). Sem RLS nativo; autorização 100% na aplicação.
- **Débitos catalogados:** 16 — **5 Alta**, **7 Média**, **4 Baixa**.
- **Destaques críticos:** integridade referencial praticamente ausente (1 FK em 21 tabelas); `sql.raw()` com interpolação de string em ~40 pontos (injeção de 2ª ordem via email do usuário); autorização espalhada inline em `publicProcedure`; segredo de API armazenado em tabela.

## Débitos Identificados

| ID | Débito | Severidade | Categoria | Descrição |
|----|--------|------------|-----------|-----------|
| DB-01 | Ausência de foreign keys | Alta | constraint | Só existe 1 FK (`fuel_purchases.purchased_by → users.id`). Relações como `bookings.vessel_id`, `client_quotas.client_id`, `fuel_records.booking_id`, `inspection_charges.inspection_id`, `fuel_record_containers.fuel_record_id`, `due_date_change_requests.charge_id` não têm enforcement. Risco de registros órfãos e inconsistência. Sem `ON DELETE` = deletes deixam lixo referencial. |
| DB-02 | `sql.raw()` com interpolação de string | Alta | segurança | ~40 usos de `sql.raw(\`... ${valor} ...\`)` em `server/routers.ts`. IDs numéricos são validados por `z.number()` (mitigado), mas há interpolação de **strings** controláveis: `client_email = '${ctx.user.email}'` (linhas 3930, 4792, 4834, 4966, 5580) e `admin_response = '${input.reason.replace(/'/g,"\\'")}'` (5482). Ver "Riscos de Segurança". |
| DB-03 | Autorização espalhada em `publicProcedure` | Alta | acesso | `routers.ts` declara 40 `publicProcedure` (incl. `create`/`update`/`delete`/`markAsPaid`/`generatePayment`), cada uma com checagem de role **inline** (`if(!ctx.user||role!==...)`) repetida ~33x. Deveriam usar `protectedProcedure`/`adminProcedure`. Um endpoint novo esquecendo a checagem fica público. Nomenclatura enganosa. |
| DB-04 | Migrations com numeração duplicada não rastreadas | Alta | migration | Existem pares `0002_*`, `0003_*`, `0004_*`, `0062_*` mas o `_journal.json` só referencia UM de cada. Os arquivos órfãos (`0002_loud_ironclad`, `0003_chief_blockbuster`, `0004_flimsy_maestro`, `0062_add_password_hash`) NÃO são aplicados pelo drizzle-kit. Ver "Riscos de Migration". |
| DB-05 | Segredo (`asaas_api_key`) armazenado em `system_settings` | Alta | segurança | A API key do Asaas é lida de `system_settings` (`getSetting('asaas_api_key')`, routers.ts ~2835). Segredo de pagamento em tabela de app, sem criptografia, acessível a qualquer código/script com DATABASE_URL e a qualquer admin. |
| DB-06 | Índices faltando em colunas de join/filtro quentes | Média | índice | Sem índice: `bookings(client_email, vessel_id, booking_date)`, `fuel_records(client_email, vessel_id, booking_id, asaas_charge_id)`, `inspection_charges(client_email, vessel_id, inspection_id)`, `inspections(booking_id, vessel_id, status)`, `client_quotas(client_id, vessel_id)`, `due_date_change_requests(charge_id, client_email)`, `reviews(booking_id)`. Todas usadas em WHERE/JOIN frequentes (inclusive nas raw queries). |
| DB-07 | `bpo_charges` indexada por `client_id` mas consultada por `client_email` | Média | índice | Índice existe em `client_id`, porém as queries de portal do cliente filtram por `client_email = '...'` (5580) — full scan. Falta índice em `client_email`. |
| DB-08 | Zero CHECK constraints | Média | constraint | Nenhuma validação de domínio no banco (ex.: `amount >= 0`, `liters > 0`, `rating BETWEEN 1 AND 5` em `reviews`, `quota_type`/`status` já cobertos por enum). Regras dependem só da app. |
| DB-09 | UNIQUE ausente em chaves naturais | Média | constraint | `users.email`, `users.open_id`, `allowed_clients.email`, `employees.email` têm apenas `index` (não UNIQUE). Permite duplicatas de identidade/whitelist — grave para auth e para o join por email. |
| DB-10 | Scripts ad-hoc com acesso direto a produção | Média | segurança | ~25 scripts `.mjs`/`.ts` na raiz (`seed-clients`, `seed-vessels`, `run_reimport`, `add_classified_by`, `check_stock`, `diagnose-asaas`, etc.) conectam via `DATABASE_URL` e rodam SQL bruto fora da camada tRPC tipada, sem testes/revisão. `run_reimport.mjs` (8KB) faz reimportação de cobranças direto no banco. Superfície de erro humano em dados financeiros. |
| DB-11 | Modelagem: `employees.vessel_ids` como CSV/JSON em text | Média | constraint | Lista de embarcações do funcionário guardada como texto em vez de tabela de junção `employee_vessels`. Impede FK, índice e joins corretos; parsing na aplicação. |
| DB-12 | Desnormalização ampla sem trigger de consistência | Média | constraint | `vessel_name`, `client_name`, `client_email` copiados em `bookings`, `fuel_records`, `inspections`, `inspection_charges`, `bpo_charges`. Sem FK nem sincronização: renomear embarcação/cliente deixa cópias divergentes. |
| DB-13 | Tipos temporais inconsistentes entre tabelas | Baixa | constraint | Datas como `bigint` epoch (`booking_date`, `start_date`), `varchar(10)` "YYYY-MM-DD" (`bpo_charges`, `expense_records`) e `timestamp` (`fuel_records`, `inspection_charges`). Dificulta comparações e índices por data; `varchar` de data não ordena por tipo. |
| DB-14 | Índice nomeado `*_unique` sem ser UNIQUE | Baixa | constraint | `allowed_clients_email_unique` e `users_openId_unique` são criados como `index` comum — o nome sugere unicidade inexistente, induzindo desenvolvedores ao erro. |
| DB-15 | `fuel_records` tabela muito larga (~40 colunas, múltiplos concerns) | Baixa | constraint | Mistura registro de abastecimento, pesagem, cobrança Asaas e sincronização. Já existe `fuel_record_containers` para parte disso. Candidata a decomposição. |
| DB-16 | Escape manual de aspas em SQL | Baixa | segurança | `input.reason.replace(/'/g, "\\'")` (5482) é escaping manual frágil: não trata `\` nem outros vetores; deveria ser parâmetro vinculado. |

## Riscos de Segurança

### Controle de acesso (não há RLS — é MySQL)
A autorização é feita na camada tRPC (`server/_core/trpc.ts`) com três níveis:
- `publicProcedure` — sem middleware de auth (`ctx.user` pode ser null).
- `protectedProcedure` — middleware `requireUser` (exige `ctx.user`).
- `adminProcedure` — exige `ctx.user.role === 'admin'`.

**Inconsistência central (DB-03):** muitas operações sensíveis (deletes, `markAsPaid`, geração de cobrança) são declaradas como `publicProcedure` e reimplementam a checagem de role **inline** dentro do handler (~33 ocorrências de `ctx.user.role !==`). Funciona hoje, mas:
- Não há garantia estrutural — depende de o desenvolvedor lembrar de escrever o `if` em cada endpoint.
- O papel `employee` é verificado inline (`role !== 'admin' && role !== 'employee'`), sem um `employeeProcedure` dedicado.
- Isolamento por dono (cliente só vê os próprios dados) é feito manualmente via `WHERE client_email = ctx.user.email` — espalhado, incluindo dentro de `sql.raw()`.

**Recomendação:** migrar deletes/mutations para `protectedProcedure`/`adminProcedure`/novo `employeeProcedure`; centralizar o scoping por dono em helper único; proibir `publicProcedure` para mutations por convenção de lint.

### SQL Injection (DB-02 / DB-16)
`sql.raw()` desativa a parametrização do Drizzle. Levantamento em `server/routers.ts`:
- **IDs numéricos** (`${input.chargeId}`, `${input.inspectionId}`) — validados por `z.number()`, então o risco direto é baixo (não dá para injetar string), mas o padrão é ruim.
- **Injeção de 2ª ordem via email:** `WHERE ... client_email = '${ctx.user.email}'`. O email vem do usuário autenticado e é **mutável** (`updateUserEmail`, `server/db.ts:451`). Um usuário que defina o email como `x' OR '1'='1` pode alterar a semântica da query e vazar/afetar dados de outros clientes. Vetor real.
- **`input.reason`** interpolado com escaping manual incompleto.

**Recomendação:** substituir todos os `sql.raw()` por template `sql\`\`` parametrizado do Drizzle (bind automático) ou por query builder tipado. Nunca interpolar `ctx.user.email`/inputs de string.

### Segredos
- `.env*` está corretamente no `.gitignore` (bom).
- **Porém** `asaas_api_key` é persistido em `system_settings` (DB-05) — segredo de pagamento fora do cofre de variáveis de ambiente, legível por qualquer admin/script.
- Scripts da raiz usam `process.env.DATABASE_URL` (não há credencial hardcoded — bom), mas concedem acesso irrestrito e não auditado a produção (DB-10).

## Riscos de Migration

- **Dialeto:** MySQL (`_journal.json.dialect = "mysql"`), 63 entradas no journal (idx 0–62).
- **Numeração duplicada (DB-04):** os pares de arquivos com mesmo prefixo NÃO são ambos aplicados. O `_journal.json` rastreia por `tag`, e para cada número duplicado só **uma** tag consta:
  - `0002` → journal usa `0002_gifted_rhino`; **órfão:** `0002_loud_ironclad.sql` (adiciona `quota_type`/`quota_count` a `allowed_clients`).
  - `0003` → journal usa `0003_modern_whistler`; **órfão:** `0003_chief_blockbuster.sql`.
  - `0004` → journal usa `0004_square_doomsday`; **órfão:** `0004_flimsy_maestro.sql`.
  - `0062` → journal usa `0062_small_katie_power`; **órfão:** `0062_add_password_hash.sql`.
  - Curiosamente, `0062_small_katie_power` **também** adiciona `password_hash` a `users` — mesma alteração do órfão `0062_add_password_hash`. Rodar ambos causaria erro de coluna duplicada. Indica resolução manual/merge de branches paralelas.
  - **Conclusão:** os arquivos órfãos são SQL não versionado pelo drizzle-kit. Ou já foram aplicados manualmente (estado do banco divergente do que o journal reproduz), ou são código morto. Em qualquer ambiente novo (`drizzle-kit migrate`), eles serão ignorados — risco de drift entre ambientes.
- **Reversibilidade:** migrations são forward-only (padrão drizzle-kit, sem arquivos `down`). Há `DROP TABLE`/`DROP COLUMN` (ex.: `0003_modern_whistler` = `DROP TABLE maintenances`; `0003_chief_blockbuster` = `DROP COLUMN quota_type/quota_count`) sem estratégia de rollback nem backfill documentado. Um `DROP` errado é irrecuperável sem `pg_dump`/`mysqldump` prévio.
- **Padrões arriscados observados:** `ALTER ... ADD COLUMN NOT NULL` com default (aceitável); `MODIFY COLUMN` de enum (`0062`) sem migração de dados existentes fora do novo conjunto de valores.

## Recomendações

**Prioridade Alta**
1. Introduzir foreign keys nas relações centrais com `ON DELETE` explícito (RESTRICT/SET NULL conforme caso) — começar por `fuel_record_containers → fuel_records`, `client_quotas → allowed_clients/vessels`, `bookings → vessels` (DB-01).
2. Eliminar todo `sql.raw()` com interpolação; usar `sql\`\`` parametrizado. Auditar especificamente as interpolações de `ctx.user.email` e `input.reason` (DB-02, DB-16).
3. Reclassificar mutations de `publicProcedure` para `protected/admin/employeeProcedure`; centralizar scoping por dono (DB-03).
4. Resolver a numeração de migrations: confirmar via `mysqldump --no-data` o estado real vs. journal, remover/renomear os 4 arquivos órfãos, documentar o baseline (DB-04).
5. Mover `asaas_api_key` de `system_settings` para variável de ambiente/secret manager (DB-05).

**Prioridade Média**
6. Criar índices nas colunas de join/filtro listadas em DB-06 e DB-07 (especialmente `*.client_email` e `bookings.vessel_id`).
7. Promover `index` → `UNIQUE` em `users.email`, `users.open_id`, `allowed_clients.email` (DB-09) e adicionar CHECK básicos (`amount>=0`, `rating BETWEEN 1 AND 5`) (DB-08).
8. Normalizar `employees.vessel_ids` para tabela de junção (DB-11); avaliar triggers/consistência para campos desnormalizados (DB-12).
9. Consolidar scripts da raiz em um diretório `scripts/` com revisão, dry-run e proibição de execução automática contra produção (DB-10).

**Prioridade Baixa**
10. Padronizar tipo temporal (preferir `timestamp`/`date` nativo) (DB-13); renomear índices `*_unique` enganosos (DB-14); avaliar decomposição de `fuel_records` (DB-15).

**Pré-requisito para qualquer alteração de schema:** snapshot via `mysqldump` antes de aplicar migrations (o projeto tem `backup_history`/rotinas de backup — validar que estão funcionais antes de mexer no schema).
