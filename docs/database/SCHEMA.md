# Database Schema — exclusive-club-reservas

> Gerado por @data-engineer (Dara) — Fase 2 do brownfield-discovery (análise somente-leitura).
> Fonte: `drizzle/schema.ts`, `drizzle/relations.ts`, `drizzle/*.sql`, `drizzle/meta/_journal.json`.

## Visão Geral

- **ORM:** Drizzle ORM.
- **Dialeto real:** **MySQL** (`mysqlTable`, `dialect: "mysql"` em `drizzle.config.ts`, `_journal.json` → `"dialect": "mysql"`). Observação: o briefing da missão assumia Postgres — **está incorreto**; o projeto é MySQL (provavelmente PlanetScale/MySQL gerenciado, dado o padrão de quase ausência de foreign keys). Isso muda a análise de integridade referencial (ver DB-AUDIT).
- **Conexão:** via `process.env.DATABASE_URL` (`server/db.ts`, `drizzle.config.ts`, e todos os scripts da raiz).
- **Controle de acesso:** aplicação (camada tRPC), **não** há RLS nativo (MySQL não tem RLS de linha como o Postgres). Detalhado em DB-AUDIT.
- **Total de tabelas:** 21.
- **Domínios:** clientes/cotas, reservas, embarcações, manutenções, vistorias, combustível/estoque, cobranças financeiras (BPO/Asaas), despesas, usuários/auth, backup, cache Asaas.

### Tabelas por domínio

| Domínio | Tabelas |
|---------|---------|
| Clientes & Cotas | `allowed_clients`, `client_quotas` |
| Reservas | `bookings`, `reviews` |
| Frota | `vessels`, `maintenances` |
| Vistorias | `inspections`, `inspection_charges` |
| Combustível | `fuel_records`, `fuel_record_containers`, `fuel_purchases`, `fuel_budget`, `gallon_stock` |
| Financeiro / BPO | `bpo_charges`, `expense_records`, `due_date_change_requests`, `asaas_customers` |
| Operação / Sistema | `users`, `employees`, `system_settings`, `backup_history` |

## Tabelas e Relacionamentos

Nomenclatura: PK sempre `id int AUTO_INCREMENT`. Colunas `created_at`/`updated_at` presentes na maioria (timestamp, `ON UPDATE CURRENT_TIMESTAMP`).

### `allowed_clients`
Whitelist de clientes autorizados (fonte de verdade de quem pode reservar). Colunas: `email` (varchar 320, índice único lógico), `name`, `phone`, `cpf_cnpj`, `rg`, endereço, `is_active` (tinyint), `contract_url`, `contract2_url`, `document_url`.
- **Relaciona (lógico, sem FK):** `client_quotas.client_id → allowed_clients.id`; join frequente por `email` com `bookings`, `inspection_charges`, `bpo_charges`, `fuel_records`.

### `bookings`
Reservas de embarcação. `client_email`, `client_name`, `vessel_id`, `vessel_name` (desnormalizado), `booking_date` (bigint epoch ms), `status` enum(`pending`,`confirmed`,`used`,`cancelled`) default `confirmed`, `notes`.
- **Relaciona (lógico):** `vessel_id → vessels.id`; `client_email → allowed_clients.email`.

### `client_quotas`
Cotas de cliente por embarcação. `client_id`, `vessel_id`, `quota_type` enum(`full`,`half`), `quota_number`, `is_active`.
- **Relaciona (lógico):** `client_id → allowed_clients.id`, `vessel_id → vessels.id`.

### `vessels`
Embarcações. `name`, `type` enum(`lancha`,`jetski`), `description`, `image_url`, `capacity`, `is_active`, `quota_count` default 6, `document_url`, `extra_document_url`.

### `maintenances`
`vessel_id`, `vessel_name`, `start_date`/`end_date` (bigint epoch), `description`, `status` enum(`scheduled`,`in_progress`,`completed`,`cancelled`), `created_by` (int default 1).

### `inspections`
Vistorias. `booking_id` (nullable), `vessel_id`, `vessel_name`, `vessel_type` enum(`lancha`,`jetski`), `client_name`, `client_email` (nullable), `inspection_data` (text — JSON serializado), `observations`, `status` enum(`approved`,`rejected`), `inspected_by` (text), `reprovation_photos` (text — JSON).

### `inspection_charges`
Cobranças de vistoria/reparo. `charge_type` enum(`inspection`,`repair`), `inspection_id` (nullable), `vessel_id` (nullable), `client_email`, `vessel_name`, `description`, `failed_items`, `amount` decimal(10,2), `due_date`, `asaas_charge_id`, `payment_status` enum(`pending`,`paid`,`overdue`,`partiallyPaid`,`cancelled`), `amount_paid` decimal(10,2), `receipt_url`.

### `fuel_records`
Abastecimentos (registro central, muito largo — ~40 colunas). `booking_id` (nullable, operacional), `vessel_id`, `client_email`, `liters`/`price_per_liter`/`total_amount` (int, centavos), campos Asaas (`asaas_charge_id`, `asaas_customer_id`, `payment_status`, `payment_url`, `sync_status`, `sync_error`), campos de pesagem (`weight_full`, `weight_after`, `weight_consumed`, `liters_calculated`), `gallon_number` default 1, `is_operational` tinyint, `recorded_by` default `system@exclusive.club`.

### `fuel_record_containers`
Detalhamento por galão de um abastecimento. `fuel_record_id`, `gallon_number`, pesagens, `liters_used`, fotos. Índice em `fuel_record_id`.
- **Relaciona (lógico):** `fuel_record_id → fuel_records.id`.

### `fuel_purchases`
Compras de combustível. `month_year`, `liters_purchased`, `amount_paid`, `price_per_liter`, `purchased_by` (**única FK real** → `users.id`), `gallon_number`.

### `fuel_budget` / `gallon_stock`
Orçamento mensal e estoque por galão. `gallon_stock` tem índice `gallon_number_idx`. `fuel_budget` índice em `month_year`.

### `bpo_charges`
Fonte única de verdade do BPO financeiro (substituiu `subscription_charges`/`unclassified_charges`). Campos Asaas, cliente desnormalizado (`client_id`, `client_name`, `client_email`), valores decimal, `status` (10 valores), `type` (6), `classified_by` enum, `source` enum. `asaas_charge_id` UNIQUE. Índices: `asaas_charge_id`, `client_id`, `due_date`, `status`.

### `expense_records`
Despesas / centro de custo. `cost_center` enum (8 valores), `value` decimal, `due_date`/`paid_date` (varchar YYYY-MM-DD), `status`, `source_type`, `asaas_payment_id`, `manually_classified`. Índices: `cost_center`, `status`, `due_date`.

### `due_date_change_requests`
Solicitações de mudança de vencimento. `charge_id`, `client_email`, `old_due_date`/`new_due_date`, `reason`, `status` enum(`pending`,`approved`,`rejected`), `processed_by`.

### `asaas_customers`
Cache de clientes Asaas. `client_email`, `asaas_customer_id`, `cpf_cnpj`. Índices em email e customer_id.

### `users`
Auth. `open_id` (varchar 64, índice único), `email` (nullable, **sem unique**), `login_method`, `role` enum(`user`,`admin`,`employee`) default `user`, `password_hash` (varchar 255, adicionada tardiamente), `last_signed_in`.
- **Relaciona:** `fuel_purchases.purchased_by → users.id` (relação Drizzle declarada em `relations.ts` — a única).

### `employees`
`name`, `email` (índice `email`), `phone`, `vessel_ids` (**text com lista CSV/JSON — anti-padrão de modelagem**, deveria ser tabela de junção), `is_active`.

### `system_settings`
Config chave/valor. `key` (índice), `value` (text), `updated_by`. **Guarda `asaas_api_key` no banco** (ver DB-AUDIT — segredo em tabela).

### `backup_history`
Histórico de backups. `status` enum(`running`,`success`,`failed`), caminhos (`drive_file_url`, `s3_url`, `local_file_path`), tamanho, duração.

### Relações declaradas no ORM (`relations.ts`)
Apenas **uma**: `users` ↔ `fuel_purchases`. Todas as demais associações existem apenas como convenção de nomes de coluna, sem `relations()` e sem FK no banco.

## Índices Existentes

| Tabela | Índice | Coluna(s) | Tipo |
|--------|--------|-----------|------|
| allowed_clients | allowed_clients_email_unique | email | index (nome sugere unique, mas criado como `index`) |
| employees | email | email | index |
| fuel_budget | month_year | month_year | index |
| gallon_stock | gallon_number_idx | gallon_number | index |
| system_settings | key | key | index |
| users | users_openId_unique | open_id | index |
| fuel_record_containers | fuel_record_id_idx | fuel_record_id | index |
| expense_records | er_cost_center / er_status / er_due_date | cost_center / status / due_date | index x3 |
| bpo_charges | 4 índices | asaas_charge_id, client_id, due_date, status | index x4 |
| asaas_customers | 2 índices | client_email, asaas_customer_id | index x2 |
| bpo_charges | (unique) | asaas_charge_id | UNIQUE |

**Sem nenhum índice:** `bookings`, `client_quotas`, `fuel_records`, `fuel_purchases`, `inspections`, `inspection_charges`, `maintenances`, `reviews`, `due_date_change_requests`, `vessels`. Ver débitos de índice em DB-AUDIT.

## Constraints

| Tipo | Situação |
|------|----------|
| PRIMARY KEY | Presente em todas (id autoincrement). |
| FOREIGN KEY | **Apenas 1 em todo o banco:** `fuel_purchases.purchased_by → users.id` (`ON DELETE no action`). Todos os demais relacionamentos são não-enforçados. |
| UNIQUE | Apenas `bpo_charges.asaas_charge_id`. `users.email`, `allowed_clients.email`, `users.open_id` **não** têm UNIQUE real (apenas `index`). |
| CHECK | **Zero** em todo o banco. |
| NOT NULL | Amplamente usado. Enums com defaults na maioria. |
| DEFAULT | Consistente (`CURRENT_TIMESTAMP`, enums, tinyint 0/1). |

> Nota sobre datas: mistura de representações — `booking_date`/`start_date`/`end_date` como `bigint` epoch, vencimentos como `varchar(10)` "YYYY-MM-DD" (`bpo_charges`, `expense_records`) e `timestamp` (`inspection_charges`, `fuel_records`). Inconsistência de tipo temporal entre tabelas.
