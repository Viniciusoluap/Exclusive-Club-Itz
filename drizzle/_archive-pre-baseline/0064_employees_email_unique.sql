-- Adiciona constraint UNIQUE em employees.email.
--
-- Contexto: server/routers.ts (employees.create) já tentava tratar erro de
-- duplicidade (MySQL ER_DUP_ENTRY / errno 1062), mas a coluna só tinha um
-- INDEX comum -- o erro nunca era lançado e emails duplicados eram aceitos
-- silenciosamente. Esta migration corrige a causa raiz no schema.
--
-- PRÉ-REQUISITO ANTES DE APLICAR EM PRODUÇÃO: se já existir mais de um
-- funcionário com o mesmo email, este ALTER TABLE falha com "Duplicate
-- entry ... for key 'employees.email'". Rode antes:
--   SELECT email, COUNT(*) FROM employees GROUP BY email HAVING COUNT(*) > 1;
-- e resolva manualmente qualquer duplicata encontrada antes de aplicar.
DROP INDEX `email` ON `employees`;
--> statement-breakpoint
ALTER TABLE `employees` ADD CONSTRAINT `email` UNIQUE(`email`);
