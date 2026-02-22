// Listar cobranças não classificadas do Asaas
listUnclassifiedCharges: adminProcedure.query(async () => {
  console.log('[listUnclassifiedCharges] Iniciando busca de cobranças não classificadas...');
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  // Buscar todos os clientes ativos
  const activeClients = await db.select().from(allowedClients).where(eq(allowedClients.isActive, 1));

  // Buscar todas as cobranças existentes em outras abas (para excluir da listagem)
  const fuelCharges = await db.select().from(fuelRecords);
  const inspectionChargesData = await db.select().from(inspectionCharges);
  
  // Buscar cobranças excluídas manualmente do módulo Saas
  const manuallyExcluded = await db.select().from(excludedAsaasCharges);
  console.log('[listUnclassifiedCharges] Cobranças excluídas manualmente:', manuallyExcluded.length);
  
  const excludedAsaasIds = new Set<string>();
  
  // Adicionar IDs de cobranças de abastecimento
  fuelCharges.forEach(record => {
    if (record.asaasChargeId) {
      excludedAsaasIds.add(record.asaasChargeId);
    }
  });
  
  // Adicionar IDs de cobranças de vistorias/reparos
  inspectionChargesData.forEach(charge => {
    if (charge.asaasChargeId) {
      excludedAsaasIds.add(charge.asaasChargeId);
    }
  });
    // Adicionar IDs de cobranças excluídas manualmente
  manuallyExcluded.forEach(excluded => {
    excludedAsaasIds.add(excluded.asaasChargeId);
  });

  // Buscar cobranças já classificadas
  const classifiedCharges = await db.select().from(subscriptionCharges);
  const classifiedAsaasIds = new Set(classifiedCharges.map(c => c.asaasPaymentId).filter(Boolean) as string[]);
  console.log('[listUnclassifiedCharges] Cobranças já classificadas (subscriptions):', classifiedAsaasIds.size);
  console.log('[listUnclassifiedCharges] Total de IDs excluídos (fuel + inspection + manual):', excludedAsaasIds.size);

  const unclassifiedCharges: Array<{
    asaasChargeId: string;
    description: string;
    value: number;
    dueDate: string;
    status: string;
    clientId: number;
    clientName: string;
    clientEmail: string;
    asaasCustomerId: string;
  }> = [];

  console.log('[listUnclassifiedCharges] Total de clientes ativos:', activeClients.length);
  let totalAsaasCharges = 0;
  let totalExcludedByFilter = 0;
  let totalClassified = 0;
  let totalAutoClassified = 0;

  for (const client of activeClients) {
    try {
      // Buscar ou criar cliente no Asaas
      const asaasCustomer = await getOrCreateAsaasCustomer({
        email: client.email,
        name: client.name,
        cpfCnpj: client.cpfCnpj,
        phone: client.phone || undefined,
      });

      // Buscar todas as cobranças do cliente no Asaas
      const asaasCharges = await listCustomerCharges(asaasCustomer.id);
      totalAsaasCharges += asaasCharges.length;

      for (const asaasCharge of asaasCharges) {
        // EXCLUIR cobranças que já existem em outras abas
        if (excludedAsaasIds.has(asaasCharge.id)) {
          totalExcludedByFilter++;
          continue;
        }

        // EXCLUIR cobranças já classificadas
        if (classifiedAsaasIds.has(asaasCharge.id)) {
          totalClassified++;
          continue;
        }

        // Classificar cobrança: mensalidade vs venda de cota
        const description = asaasCharge.description?.toLowerCase() || "";
        let chargeType: "monthly" | "quota_sale" | null = null;

        if (description.includes("mensalidade") || description.includes("monthly")) {
          chargeType = "monthly";
        } else if (description.includes("cota") || description.includes("quota") || description.includes("venda") || description.includes("parcela")) {
          chargeType = "quota_sale";
        }

        // Se não conseguir classificar, adiciona à lista de não classificadas
        if (!chargeType) {
          unclassifiedCharges.push({
            asaasChargeId: asaasCharge.id,
            description: asaasCharge.description || "Sem descrição",
            value: asaasCharge.value,
            dueDate: asaasCharge.dueDate,
            status: asaasCharge.status,
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            asaasCustomerId: asaasCustomer.id,
          });
        } else {
          totalAutoClassified++;
        }
      }
    } catch (error) {
      console.error(`Erro ao buscar cobranças do cliente ${client.name}:`, error);
    }
  }

  console.log('[listUnclassifiedCharges] === RESUMO ===');
  console.log('[listUnclassifiedCharges] Total de cobranças do Asaas:', totalAsaasCharges);
  console.log('[listUnclassifiedCharges] Excluídas por filtro (fuel/inspection/manual):', totalExcludedByFilter);
  console.log('[listUnclassifiedCharges] Já classificadas (subscriptions):', totalClassified);
  console.log('[listUnclassifiedCharges] Auto-classificadas (mensalidade/cota):', totalAutoClassified);
  console.log('[listUnclassifiedCharges] NÃO CLASSIFICADAS (retorno):', unclassifiedCharges.length);
  console.log('[listUnclassifiedCharges] === FIM RESUMO ===');

  return unclassifiedCharges;
}),
