-- Story 13 (Fase 1, DB-09/DB-14): allowed_clients.email e users.openId
-- tinham apenas um index() comum nomeado "..._unique" — nenhuma constraint
-- UNIQUE de fato existia no banco, apesar do nome. users.email não tinha
-- NENHUM índice/constraint. Isso já é assumido pela aplicação (getUserByEmail,
-- getAllowedClientByEmail usam .limit(1)) e, no caso de openId, pelo próprio
-- upsertUser() (server/db.ts, INSERT ... ON DUPLICATE KEY UPDATE) — sem uma
-- chave única para colidir, esse upsert nunca conseguia de fato disparar o
-- caminho de UPDATE numa condição de corrida (dois logins simultâneos do
-- mesmo openId criavam duas linhas em vez de uma).
--
-- ORDEM PROPOSITAL — ADD antes de DROP: os `ALTER TABLE ... ADD CONSTRAINT
-- UNIQUE` abaixo são a parte arriscada — falham com "Duplicate entry" se já
-- existir email/openId duplicado (dado real de identidade, não um log; ver
-- Story 9 para contraste — lá um dedup automático era seguro porque
-- webhook_logs não tem significado de negócio). drizzle-kit para a migration
-- inteira no primeiro statement que falhar, então rodar os ADDs (sob nomes
-- novos, sufixo _uq) ANTES dos DROPs dos índices antigos garante que, se
-- algum ADD falhar, a migration aborta ali mesmo e os índices antigos —
-- inúteis, mas inofensivos — continuam intactos. Testado empiricamente: a
-- ordem DROP-antes-de-ADD (o que `drizzle-kit generate` produz por padrão,
-- reaproveitando o mesmo nome) deixa a tabela SEM nenhum índice de
-- unicidade se o ADD falhar no meio — pior que o estado original, porque
-- DDL no MySQL não é transacional (cada statement já aplicado fica valendo
-- mesmo que um statement posterior no mesmo arquivo falhe).
--
-- Use `pnpm tsx server/scripts/auditDuplicateIdentities.ts` para localizar
-- duplicatas antes de rodar esta migration em um banco com histórico real.
ALTER TABLE `allowed_clients` ADD CONSTRAINT `allowed_clients_email_uq` UNIQUE(`email`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_open_id_uq` UNIQUE(`openId`);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `users_email_uq` UNIQUE(`email`);--> statement-breakpoint
DROP INDEX `allowed_clients_email_unique` ON `allowed_clients`;--> statement-breakpoint
DROP INDEX `users_openId_unique` ON `users`;
