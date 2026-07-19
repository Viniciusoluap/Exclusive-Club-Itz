-- DB-21 / Story 5: recria a trilha de auditoria de pagamento `webhook_logs`.
-- A tabela foi criada em 0032_dizzy_spacker_dave.sql e DROPada em
-- 0033_good_lila_cheney.sql (linha 5), nunca recriada, e ficou ausente de
-- drizzle/schema.ts. O INSERT em server/_core/index.ts falhava 100% em silêncio.
--
-- Schema alinhado ao uso real do webhook (server/_core/index.ts) e do painel
-- admin (server/routers/bpoRouter.ts:listWebhookLogs), idêntico ao schema
-- canônico já restaurado em produção via scripts/restore-missing-tables.mjs.
--
-- IF NOT EXISTS: a tabela pode já existir em produção (restaurada manualmente
-- pelo script acima); a migration deve ser idempotente para não falhar.
--
-- RETENÇÃO (DB-21): registros devem ser expurgados após 90 dias por um job de
-- limpeza (ainda não implementado — TODO documentado em drizzle/schema.ts).
CREATE TABLE IF NOT EXISTS `webhook_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event` varchar(100) NOT NULL,
	`asaas_payment_id` varchar(255),
	`payload` text,
	`processed` tinyint NOT NULL DEFAULT 0,
	`error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `webhook_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `wl_event` ON `webhook_logs` (`event`);--> statement-breakpoint
CREATE INDEX `wl_asaas_payment_id` ON `webhook_logs` (`asaas_payment_id`);--> statement-breakpoint
CREATE INDEX `wl_created_at` ON `webhook_logs` (`created_at`);
