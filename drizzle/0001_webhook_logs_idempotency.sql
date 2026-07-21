-- Story 9 (Fase 1, SYS-19): chave de idempotência do webhook Asaas.
--
-- PRÉ-REQUISITO: se já existirem reenvios do mesmo evento (event +
-- asaas_payment_id) registrados em webhook_logs — o que é plausível, já que
-- justamente a ausência dessa constraint é o problema que esta migration
-- corrige — o ADD CONSTRAINT abaixo falha com "Duplicate entry" se essa
-- limpeza não rodar antes. Mantém a linha mais recente de cada grupo
-- duplicado (maior id) e remove as demais; é uma tabela de auditoria de
-- webhook, não dado financeiro de origem, então isso é seguro.
--
-- Usa subquery materializada (não self-join com id1 < id2) porque essa
-- segunda forma comprovadamente NÃO remove todas as duplicatas numa única
-- execução quando há 3+ linhas no mesmo grupo (testado localmente: sobra
-- uma linha extra por grupo a cada passada) — a forma abaixo resolve tudo
-- de uma vez, independente de quantas duplicatas existem por grupo.
DELETE FROM webhook_logs
WHERE asaas_payment_id IS NOT NULL
  AND id NOT IN (
    SELECT max_id FROM (
      SELECT MAX(id) AS max_id
      FROM webhook_logs
      WHERE asaas_payment_id IS NOT NULL
      GROUP BY event, asaas_payment_id
    ) keepers
  );
--> statement-breakpoint
ALTER TABLE `webhook_logs` ADD CONSTRAINT `wl_event_payment_unique` UNIQUE(`event`,`asaas_payment_id`);
