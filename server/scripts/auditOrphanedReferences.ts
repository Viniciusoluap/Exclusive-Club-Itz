/**
 * Story 15 (Fase 1, DB-01): job de reconciliação de integridade referencial.
 *
 * GATE DE PLATAFORMA (AC): produção roda em TiDB (confirmado — CI usa
 * `pingcap/tidb:latest`, ver .github/workflows/ci.yml). FOREIGN KEY nativa
 * no TiDB é relativamente recente e tem restrições/diferenças de
 * comportamento em relação ao MySQL vanilla (ex.: overhead em sistema
 * distribuído, interação com outras DDLs). Sem confirmar a versão exata e o
 * comportamento em produção, adicionar `FOREIGN KEY` nativo às ~40-40h de
 * escopo desta story é arriscado demais para decidir sem esse dado. Por
 * isso este projeto segue o caminho que o próprio épico já antecipava como
 * mais provável: integridade aplicacional + job de reconciliação (este
 * arquivo), não DDL de FK nativa.
 *
 * Somente leitura — reporta órfãos (linha filha cuja FK aponta para um pai
 * que não existe mais), não corrige nada automaticamente. Cobre todas as
 * relações pai-filho identificadas em drizzle/schema.ts que não têm FK
 * declarada.
 *
 * Uso: pnpm tsx server/scripts/auditOrphanedReferences.ts
 */
import { getDb } from "../db";
import { sql } from "drizzle-orm";

export interface OrphanRelation {
  label: string;
  childTable: string;
  childColumn: string;
  parentTable: string;
  parentColumn: string;
}

// Relações pai-filho sem FK nativa declarada no schema. `parentColumn` é
// sempre a PK (id) do pai neste schema.
export const RELATIONS: OrphanRelation[] = [
  { label: "client_quotas.client_id -> allowed_clients.id", childTable: "client_quotas", childColumn: "client_id", parentTable: "allowed_clients", parentColumn: "id" },
  { label: "client_quotas.vessel_id -> vessels.id", childTable: "client_quotas", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "bookings.vessel_id -> vessels.id", childTable: "bookings", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "due_date_change_requests.charge_id -> inspection_charges.id", childTable: "due_date_change_requests", childColumn: "charge_id", parentTable: "inspection_charges", parentColumn: "id" },
  { label: "fuel_records.booking_id -> bookings.id", childTable: "fuel_records", childColumn: "booking_id", parentTable: "bookings", parentColumn: "id" },
  { label: "fuel_records.vessel_id -> vessels.id", childTable: "fuel_records", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "inspection_charges.inspection_id -> inspections.id", childTable: "inspection_charges", childColumn: "inspection_id", parentTable: "inspections", parentColumn: "id" },
  { label: "inspection_charges.vessel_id -> vessels.id", childTable: "inspection_charges", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "inspections.booking_id -> bookings.id", childTable: "inspections", childColumn: "booking_id", parentTable: "bookings", parentColumn: "id" },
  { label: "inspections.vessel_id -> vessels.id", childTable: "inspections", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "maintenances.vessel_id -> vessels.id", childTable: "maintenances", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "maintenances.created_by -> users.id", childTable: "maintenances", childColumn: "created_by", parentTable: "users", parentColumn: "id" },
  { label: "reviews.booking_id -> bookings.id", childTable: "reviews", childColumn: "booking_id", parentTable: "bookings", parentColumn: "id" },
  { label: "reviews.vessel_id -> vessels.id", childTable: "reviews", childColumn: "vessel_id", parentTable: "vessels", parentColumn: "id" },
  { label: "fuel_record_containers.fuel_record_id -> fuel_records.id", childTable: "fuel_record_containers", childColumn: "fuel_record_id", parentTable: "fuel_records", parentColumn: "id" },
  { label: "bpo_charges.client_id -> allowed_clients.id", childTable: "bpo_charges", childColumn: "client_id", parentTable: "allowed_clients", parentColumn: "id" },
];

export interface OrphanResult extends OrphanRelation {
  orphanCount: number;
  sampleIds: number[];
}

async function countOrphans(relation: OrphanRelation): Promise<OrphanResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const { childTable, childColumn, parentTable, parentColumn } = relation;
  const whereClause = sql`WHERE c.${sql.raw(childColumn)} IS NOT NULL AND p.${sql.raw(parentColumn)} IS NULL`;
  const joinClause = sql`FROM ${sql.raw(childTable)} c LEFT JOIN ${sql.raw(parentTable)} p ON c.${sql.raw(childColumn)} = p.${sql.raw(parentColumn)}`;

  const countRows = (await db.execute(sql`SELECT COUNT(*) as total ${joinClause} ${whereClause}`)) as any;
  const countList = (Array.isArray(countRows[0]) ? countRows[0] : countRows) as any[];
  const orphanCount = Number(countList[0]?.total ?? 0);

  let sampleIds: number[] = [];
  if (orphanCount > 0) {
    const sampleRows = (await db.execute(sql`SELECT c.id ${joinClause} ${whereClause} LIMIT 20`)) as any;
    const sampleList = (Array.isArray(sampleRows[0]) ? sampleRows[0] : sampleRows) as any[];
    sampleIds = sampleList.map((r) => r.id);
  }

  return { ...relation, orphanCount, sampleIds };
}

export async function auditOrphanedReferences(): Promise<{ clean: boolean; results: OrphanResult[] }> {
  console.log("[auditOrphanedReferences] Verificando integridade referencial (sem FK nativa)...\n");

  const results: OrphanResult[] = [];
  for (const relation of RELATIONS) {
    const result = await countOrphans(relation);
    results.push(result);
    if (result.orphanCount === 0) {
      console.log(`✅ ${relation.label}: nenhum órfão.`);
    } else {
      const idsLabel = result.orphanCount > result.sampleIds.length
        ? `${result.sampleIds.join(", ")} (mostrando ${result.sampleIds.length} de ${result.orphanCount})`
        : result.sampleIds.join(", ");
      console.log(`⚠️  ${relation.label}: ${result.orphanCount} órfão(s) — ids de ${relation.childTable}: ${idsLabel}`);
    }
  }

  const clean = results.every((r) => r.orphanCount === 0);
  console.log(
    clean
      ? "\n[auditOrphanedReferences] Baseline limpo — nenhuma relação com registros órfãos."
      : "\n[auditOrphanedReferences] Órfãos encontrados acima precisam de revisão manual (reatribuir ou remover)."
  );

  return { clean, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  auditOrphanedReferences()
    .then(({ clean }) => process.exit(clean ? 0 : 1))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
