/**
 * Fuel Router — domínio de combustível (abastecimento, orçamento e compras)
 *
 * Extraído de server/routers.ts (Story 40, SYS-03) sem qualquer alteração de
 * comportamento: os três routers abaixo são montados em appRouter sob as mesmas
 * chaves de antes (fuelRecords, fuelBudget, fuelPurchases), de modo que o
 * contrato da API permanece idêntico para o frontend.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure, employeeProcedure } from "../_core/trpc";
import * as db from "../db";
import * as stats from "../stats";

// Fuel Records router - Admin and Employee
export const fuelRecordsRouter = router({
  create: protectedProcedure
    .input(z.object({
      bookingId: z.number().optional(), // Opcional quando isOperational = true
      vesselId: z.number(),
      liters: z.number().positive().optional(), // Opcional quando usa método por peso
      pricePerLiter: z.number().positive().optional(), // Opcional - busca do estoque se não informado
      notes: z.string().optional(),
      receiptUrl: z.string().url().optional(), // Comprovante do modo galão único (antigo)
      // Campos opcionais do método de abastecimento por pesagem
      litersInitial: z.number().positive().optional(), // Litros iniciais no galão (ex: 50.05)
      weightFull: z.number().positive().optional(), // Peso do galão cheio em kg (ex: 37.80)
      weightAfter: z.number().nonnegative().optional(), // Peso do galão após em kg (pode ser 0 se galão ficou vazio)
      photoBeforeUrl: z.string().url().optional(), // URL da foto ANTES
      photoAfterUrl: z.string().url().optional(), // URL da foto DEPOIS
      gallonNumber: z.number().min(1).max(3).default(1), // Galão 1, 2 ou 3
      // NOVO: Array de galões para múltiplos galões por abastecimento
      containers: z.array(z.object({
        gallonNumber: z.number().min(1).max(3),
        litersInitial: z.number().positive(),
        weightFull: z.number().positive(),
        weightAfter: z.number().nonnegative(),
        photoBeforeUrl: z.string().url(),
        photoAfterUrl: z.string().url(),
      })).optional(),
      isOperational: z.boolean().optional().default(false), // Abastecimento operacional (custo da empresa)
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user || (ctx.user.role !== 'admin' && ctx.user.role !== 'employee')) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Acesso negado' });
      }
      const database = await import('../db').then(m => m.getDb());
      if (!database) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      // Validar entrada: se não for operacional, bookingId é obrigatório
      if (!input.isOperational && !input.bookingId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Reserva é obrigatória para abastecimentos de clientes' });
      }

      // Buscar dados da reserva e embarcação (apenas se não for operacional)
      const { sql } = await import('drizzle-orm');
      let booking: any = null;
      
      if (!input.isOperational && input.bookingId) {
        const bookingResult = await database.execute(sql`
          SELECT b.client_name, b.client_email, b.vessel_name, v.name as vessel_name_actual
          FROM bookings b
          JOIN vessels v ON b.vessel_id = v.id
          WHERE b.id = ${input.bookingId}
        `) as any;
        booking = (Array.isArray(bookingResult[0]) ? bookingResult[0][0] : bookingResult[0]);
        if (!booking) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Reserva não encontrada' });
        }
      } else if (input.isOperational) {
        // Para abastecimento operacional, buscar apenas nome da embarcação
        const vesselResult = await database.execute(sql`
          SELECT name FROM vessels WHERE id = ${input.vesselId}
        `) as any;
        const vessel = (Array.isArray(vesselResult[0]) ? vesselResult[0][0] : vesselResult[0]);
        if (!vessel) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Embarcação não encontrada' });
        }
        // Criar objeto booking fictício para abastecimento operacional
        booking = {
          client_name: 'Exclusive Club (Operacional)',
          client_email: 'operacional@exclusiveclub.com',
          vessel_name: vessel.name,
          vessel_name_actual: vessel.name
        };
      }

      // NOVO: Suporte a múltiplos galões
      const useMultipleContainers = input.containers && input.containers.length > 0;
      
      // Validar campos de peso (se um for informado, todos devem ser) - modo legado
      const hasWeightData = !useMultipleContainers && (input.litersInitial !== undefined || input.weightFull !== undefined || input.weightAfter !== undefined);
      if (hasWeightData) {
        if (input.litersInitial === undefined || input.weightFull === undefined || input.weightAfter === undefined) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'Se usar o método de pesagem, todos os campos (litros iniciais, peso cheio e peso após) são obrigatórios' 
          });
        }
        if (!input.photoBeforeUrl || !input.photoAfterUrl) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'As fotos da balança (antes e depois) são obrigatórias ao usar o método de pesagem' 
          });
        }
        if (input.weightAfter >= input.weightFull) {
          throw new TRPCError({ 
            code: 'BAD_REQUEST', 
            message: 'O peso após deve ser menor que o peso cheio' 
          });
        }
      }
      
      // Validar múltiplos galões
      if (useMultipleContainers) {
        for (const container of input.containers!) {
          if (container.weightAfter >= container.weightFull) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: `Galão ${container.gallonNumber}: O peso após deve ser menor que o peso cheio` 
            });
          }
        }
      }

      // Buscar preço/L e estoque do galão específico
      const currentDate = new Date();
      const currentMonthYear = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Buscar estoque do galão específico
      const gallonResult = await database.execute(sql`
        SELECT stock_liters, last_price_per_liter FROM gallon_stock WHERE gallon_number = ${input.gallonNumber}
      `) as any;
      const gallon = (Array.isArray(gallonResult[0]) ? gallonResult[0][0] : gallonResult[0]);
      
      // Fallback para fuel_budget se galão não existir
      const budgetResult = await database.execute(sql`
        SELECT last_price_per_liter, stock_liters FROM fuel_budget WHERE month_year = ${currentMonthYear}
      `) as any;
      const budget = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);
      
      const defaultPricePerLiter = gallon?.last_price_per_liter ? gallon.last_price_per_liter / 100 : (budget?.last_price_per_liter ? budget.last_price_per_liter / 100 : null);
      const currentStockLiters = gallon?.stock_liters ? gallon.stock_liters / 100 : 0;
      
      console.log(`[fuelRecords.create] Galão ${input.gallonNumber} - Estoque: ${currentStockLiters}L, Preço/L: R$${defaultPricePerLiter}`);
      
      // Usar preço do estoque se não foi informado
      let finalPricePerLiter = input.pricePerLiter;
      if (!finalPricePerLiter && defaultPricePerLiter) {
        finalPricePerLiter = defaultPricePerLiter;
        console.log('[fuelRecords.create] Preço/L aplicado do estoque:', finalPricePerLiter);
      } else if (!finalPricePerLiter) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Preço por litro não informado e não há preço no estoque. Configure o orçamento primeiro.' 
        });
      }

      // Calcular valores de peso e litros
      let litersInitialInCents = null;
      let weightFullInGrams = null;
      let weightAfterInGrams = null;
      let weightConsumedInGrams = null;
      let litersCalculatedInCents = null;
      let finalLitersInCents = input.liters ? Math.round(input.liters * 100) : 0;
      
      // Array para armazenar dados de cada galão (para salvar na tabela fuel_record_containers)
      const containersToSave: Array<{
        gallonNumber: number;
        litersInitial: number;
        weightFull: number;
        weightAfter: number;
        weightConsumed: number;
        litersUsed: number;
        photoBeforeUrl: string;
        photoAfterUrl: string;
      }> = [];

      // NOVO: Processar múltiplos galões
      if (useMultipleContainers && input.containers) {
        console.log('[fuelRecords.create] Processando múltiplos galões:', input.containers.length);
        
        let totalLitersUsedInCents = 0;
        
        for (const container of input.containers) {
          const containerLitersInitial = Math.round(container.litersInitial * 100);
          const containerWeightFull = Math.round(container.weightFull * 100);
          const containerWeightAfter = Math.round(container.weightAfter * 100);
          const containerWeightConsumed = containerWeightFull - containerWeightAfter;
          const containerLitersUsed = Math.round((containerWeightConsumed * containerLitersInitial) / containerWeightFull);
          
          totalLitersUsedInCents += containerLitersUsed;
          
          containersToSave.push({
            gallonNumber: container.gallonNumber,
            litersInitial: containerLitersInitial,
            weightFull: containerWeightFull,
            weightAfter: containerWeightAfter,
            weightConsumed: containerWeightConsumed,
            litersUsed: containerLitersUsed,
            photoBeforeUrl: container.photoBeforeUrl,
            photoAfterUrl: container.photoAfterUrl,
          });
          
          console.log(`[fuelRecords.create] Galão ${container.gallonNumber}: ${containerLitersUsed / 100}L`);
        }
        
        finalLitersInCents = totalLitersUsedInCents;
        console.log('[fuelRecords.create] Total de litros (múltiplos galões):', finalLitersInCents / 100, 'L');
        
      } else if (hasWeightData && input.litersInitial !== undefined && input.weightFull !== undefined && input.weightAfter !== undefined) {
        // Modo legado: galão único
        litersInitialInCents = Math.round(input.litersInitial * 100);
        weightFullInGrams = Math.round(input.weightFull * 100);
        weightAfterInGrams = Math.round(input.weightAfter * 100);
        weightConsumedInGrams = weightFullInGrams - weightAfterInGrams;
        litersCalculatedInCents = Math.round((weightConsumedInGrams * litersInitialInCents) / weightFullInGrams);
        finalLitersInCents = litersCalculatedInCents;
      }

      const SERVICE_FEE = 1000; // Taxa de abastecimento e aplicativo em centavos (R$ 10,00)
      const pricePerLiterInCents = Math.round(finalPricePerLiter * 100);
      const fuelCost = Math.round((finalLitersInCents / 100) * finalPricePerLiter * 100);
      const totalAmount = fuelCost + SERVICE_FEE;
      
      const finalLiters = finalLitersInCents / 100;
      
      // Descontar litros do estoque de cada galão
      if (useMultipleContainers && containersToSave.length > 0) {
        // Descontar de cada galão individualmente
        for (const container of containersToSave) {
          console.log(`[fuelRecords.create] Descontando do Galão ${container.gallonNumber}: ${container.litersUsed / 100}L`);
          await database.execute(sql`
            UPDATE gallon_stock 
            SET stock_liters = stock_liters - ${container.litersUsed}
            WHERE gallon_number = ${container.gallonNumber}
          `);
        }
      } else {
        // Modo legado: descontar do galão único
        console.log(`[fuelRecords.create] Descontando do Galão ${input.gallonNumber}:`, finalLiters, 'L');
        await database.execute(sql`
          UPDATE gallon_stock 
          SET stock_liters = stock_liters - ${finalLitersInCents}
          WHERE gallon_number = ${input.gallonNumber}
        `);
      }
      
      // Manter compatibilidade: atualizar fuel_budget
      await database.execute(sql`
        UPDATE fuel_budget 
        SET stock_liters = stock_liters - ${finalLitersInCents}
        WHERE month_year = ${currentMonthYear}
      `);

      // Criar ou buscar cliente no Asaas (PULAR se for operacional)
      const asaas = await import('../_core/asaas');
      let asaasCustomerId = '';
      let asaasChargeId = '';
      let paymentUrl = '';
      let syncStatus = input.isOperational ? 'manual' : 'pending'; // Operacional = manual (sem cobrança)
      let syncError = null;
      
      // Definir data de vencimento (para uso posterior)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1); // Vencimento em 1 dia
      
      // PULAR criação de cobrança se for abastecimento operacional
      if (!input.isOperational) {
      try {
        console.log('[fuelRecords.create] Iniciando criação de cobrança Asaas...');
        console.log('[fuelRecords.create] Usuário criador:', ctx.user?.name, '| Role:', ctx.user?.role, '| ID:', ctx.user?.id);
        console.log('[fuelRecords.create] Cliente:', booking.client_name, booking.client_email);
        
        const customer = await asaas.getOrCreateCustomer({
          name: booking.client_name,
          email: booking.client_email,
        });
        asaasCustomerId = customer.id;
        console.log('[fuelRecords.create] Cliente Asaas ID:', asaasCustomerId);

        // Criar cobrança no Asaas
        console.log('[fuelRecords.create] Criando cobrança...');
        const charge = await asaas.createCharge({
          customer: asaasCustomerId,
          billingType: 'PIX', // Pagamento via PIX
          value: totalAmount / 100, // Converter centavos para reais
          dueDate: asaas.formatDateForAsaas(dueDate),
          description: `Abastecimento - ${booking.vessel_name_actual} - ${finalLiters.toFixed(2)}L`,
          externalReference: `fuel_record_${input.bookingId}_${Date.now()}`,
        });
        
        asaasChargeId = charge.id;
        paymentUrl = charge.invoiceUrl || charge.bankSlipUrl || '';
        syncStatus = 'synced';
        
        console.log('[fuelRecords.create] ✅ Cobrança criada com sucesso!');
        console.log('[fuelRecords.create] Charge ID:', asaasChargeId);
        console.log('[fuelRecords.create] Payment URL:', paymentUrl);
      } catch (error: any) {
        syncStatus = 'failed';
        syncError = error.message;
        console.error('[fuelRecords.create] ❌ ERRO ao criar cobrança Asaas:');
        console.error('[fuelRecords.create] Usuário:', ctx.user?.name, '| Role:', ctx.user?.role);
        console.error('[fuelRecords.create] Cliente:', booking.client_name, booking.client_email);
        console.error('[fuelRecords.create] Mensagem:', error.message);
        console.error('[fuelRecords.create] Stack:', error.stack);
        console.error('[fuelRecords.create] Response completo:', JSON.stringify(error));
        console.error('[fuelRecords.create] Abastecimento será salvo, mas cobrança pode ser criada manualmente depois');
      }
      } // Fechar bloco if (!input.isOperational)

      // Para múltiplos galões, usar dados do primeiro galão para o registro principal
      const primaryGallon = containersToSave.length > 0 ? containersToSave[0] : null;
      const primaryPhotoBeforeUrl = primaryGallon ? primaryGallon.photoBeforeUrl : (input.photoBeforeUrl || null);
      const primaryPhotoAfterUrl = primaryGallon ? primaryGallon.photoAfterUrl : (input.photoAfterUrl || null);
      const primaryGallonNumber = primaryGallon ? primaryGallon.gallonNumber : input.gallonNumber;

      // sql`` (não template string crua): booking.client_name/client_email/
      // vessel_name_actual e input.notes/photoBeforeUrl/photoAfterUrl chegam
      // de dados de reserva/formulário, não de constantes controladas pelo
      // código — interpolar direto numa string SQL é injeção de SQL (mesma
      // classe já corrigida para client_email na Fase 0 e em bpoRouter.ts).
      //
      // fuel_records + fuel_record_containers numa única transação: os
      // containers não fazem sentido sem o registro principal (nem
      // vice-versa) — um sucesso parcial aqui é corrupção de dado real.
      // A cobrança no Asaas (asaas.createCharge, acima) já é uma chamada
      // HTTP externa concluída antes deste bloco — não é revertível por
      // rollback de banco, então NÃO entra nesta transação; e é exatamente
      // por isso que o sync com bpo_charges (mais abaixo) também fica FORA:
      // se ele falhasse dentro da mesma transação e revertesse o INSERT de
      // fuel_records, perderíamos a única referência local à cobrança já
      // criada (pior que o bug original, que ao menos preservava o registro).
      const fuelRecordId: number = await database.transaction(async (tx) => {
        const insertResult = await tx.execute(sql`
          INSERT INTO fuel_records (
            booking_id, vessel_id, vessel_name, client_email, client_name,
            liters, price_per_liter, total_amount, notes, receipt_url,
            liters_initial, weight_full, weight_after, weight_consumed, liters_calculated,
            photo_before_url, photo_after_url,
            asaas_charge_id, asaas_customer_id, payment_url, payment_status,
            sync_status, sync_error, last_sync_attempt,
            recorded_by, recorded_at, gallon_number, is_operational
          )
          VALUES (
            ${input.bookingId || null}, ${input.vesselId}, ${booking.vessel_name_actual},
            ${booking.client_email}, ${booking.client_name},
            ${finalLitersInCents}, ${pricePerLiterInCents}, ${totalAmount}, ${input.notes || null}, ${input.receiptUrl || null},
            ${litersInitialInCents}, ${weightFullInGrams}, ${weightAfterInGrams}, ${weightConsumedInGrams}, ${litersCalculatedInCents},
            ${primaryPhotoBeforeUrl}, ${primaryPhotoAfterUrl},
            ${asaasChargeId || null}, ${asaasCustomerId || null}, ${paymentUrl || null}, 'pending',
            ${syncStatus}, ${syncError || null}, NOW(),
            ${ctx.user?.id || null}, NOW(), ${primaryGallonNumber}, ${input.isOperational ? 1 : 0}
          )
        `) as any;

        const insertedId = insertResult[0]?.insertId || insertResult.insertId;

        // VALIDAÇÃO: Garantir que o registro principal foi criado antes de salvar containers
        if (!insertedId || insertedId <= 0) {
          console.error('[fuelRecords.create] ERRO: Falha ao obter ID do registro inserido. insertResult:', JSON.stringify(insertResult));
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Falha ao criar registro de abastecimento. Por favor, tente novamente.'
          });
        }

        console.log('[fuelRecords.create] Registro principal criado com ID:', insertedId);

        // NOVO: Salvar cada container na tabela fuel_record_containers
        if (containersToSave.length > 0) {
          console.log('[fuelRecords.create] Salvando', containersToSave.length, 'containers para fuel_record_id:', insertedId);

          for (const container of containersToSave) {
            await tx.execute(sql`
              INSERT INTO fuel_record_containers (
                fuel_record_id, gallon_number, liters_initial, weight_full, weight_after,
                weight_consumed, liters_used, photo_before_url, photo_after_url
              )
              VALUES (
                ${insertedId}, ${container.gallonNumber}, ${container.litersInitial},
                ${container.weightFull}, ${container.weightAfter}, ${container.weightConsumed},
                ${container.litersUsed}, ${container.photoBeforeUrl}, ${container.photoAfterUrl}
              )
            `);
          }

          console.log('[fuelRecords.create] Containers salvos com sucesso!');
        }

        return insertedId;
      });

      console.log('[fuelRecords.create] Abastecimento salvo no banco com sync_status:', syncStatus);

      // Sincronizar imediatamente com bpo_charges para aparecer na tela do cliente.
      // Best-effort e deliberadamente fora da transação acima (ver comentário
      // no início do bloco) — mas a falha não é mais silenciosa: reportada
      // na resposta (bpoSyncFailed) em vez de só um console.warn perdido no
      // log do servidor, para quem chama poder reagir/reconciliar depois.
      let bpoSyncFailed = false;
      if (!input.isOperational && asaasChargeId) {
        try {
          const dueDateStr = asaas.formatDateForAsaas(dueDate);
          const valueInReais = Number((totalAmount / 100).toFixed(2));
          const fuelDescription = `Abastecimento - ${booking.vessel_name_actual || ''} - ${finalLiters.toFixed(2)}L`;
          await database.execute(sql`
            INSERT INTO bpo_charges (
              asaas_charge_id, asaas_customer_id, client_id, client_name, client_email,
              value, due_date, status, type, classified_by, billing_type, description,
              payment_link, invoice_url, source
            ) VALUES (
              ${asaasChargeId}, ${asaasCustomerId || null}, NULL,
              ${booking.client_name || ''}, ${booking.client_email || ''},
              ${valueInReais}, ${dueDateStr}, 'pending', 'fuel', 'manual', 'PIX',
              ${fuelDescription},
              ${paymentUrl || null}, ${paymentUrl || null}, 'manual'
            )
            ON DUPLICATE KEY UPDATE
              type = 'fuel',
              value = ${valueInReais},
              client_name = ${booking.client_name || ''},
              client_email = ${booking.client_email || ''},
              description = ${fuelDescription}
          `);
          console.log('[fuelRecords.create] ✅ bpo_charges sincronizado com type=fuel');
        } catch (bpoErr: any) {
          bpoSyncFailed = true;
          console.error('[fuelRecords.create] Falha ao sincronizar bpo_charges (fuel_record_id ' + fuelRecordId + '):', bpoErr.message);
        }
      }

      return {
        success: true,
        containersCount: containersToSave.length || 1,
        totalLiters: finalLiters,
        totalCost: totalAmount / 100,
        paymentUrl: paymentUrl || undefined,
        asaasChargeId: asaasChargeId || undefined,
        bpoSyncFailed: bpoSyncFailed || undefined,
      };
    }),

  list: employeeProcedure
    .input(z.object({
      vesselId: z.number().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      month: z.number().min(1).max(12).optional(), // Mês (1-12)
      year: z.number().min(2020).max(2030).optional(), // Ano
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql, SQL } = await import('drizzle-orm');

      const conditions: ReturnType<typeof sql>[] = [];

      if (input.vesselId) {
        conditions.push(sql`fr.vessel_id = ${input.vesselId}`);
      }

      if (input.month && input.year) {
        conditions.push(sql`MONTH(fr.created_at) = ${input.month}`);
        conditions.push(sql`YEAR(fr.created_at) = ${input.year}`);
      } else {
        if (input.startDate) {
          conditions.push(sql`fr.created_at >= FROM_UNIXTIME(${input.startDate / 1000})`);
        }
        if (input.endDate) {
          conditions.push(sql`fr.created_at <= FROM_UNIXTIME(${input.endDate / 1000})`);
        }
      }

      const whereClause = conditions.length > 0
        ? sql`WHERE 1=1 AND ${sql.join(conditions, sql` AND `)}`
        : sql`WHERE 1=1`;

      const query = sql`
        SELECT
          fr.*,
          b.booking_date,
          b.client_name,
          b.vessel_name,
          fr.sync_status,
          fr.sync_error,
          fr.last_sync_attempt,
          fr.manual_payment_note,
          u.name as recorded_by_name,
          fr.recorded_at
        FROM fuel_records fr
        LEFT JOIN bookings b ON fr.booking_id = b.id
        LEFT JOIN users u ON fr.recorded_by = u.id
        ${whereClause}
        ORDER BY fr.created_at DESC
      `;

      const result = await db.execute(query) as any;
      const records = (Array.isArray(result[0]) ? result[0] : result) as any[];
      
      // Converter valores de centavos para reais
      return records.map((record: any) => ({
        ...record,
        date: record.booking_date || record.created_at, // Usar created_at se booking_date for null (operacional)
        clientName: record.client_name || 'Exclusive Club (Operacional)', // Nome do cliente ou operacional
        vesselName: record.vessel_name || 'N/A', // Nome da embarcação ou N/A
        liters: record.liters / 100,
        price_per_liter: record.price_per_liter / 100,
        total_cost: record.total_amount / 100,
        recorded_by_name: record.recorded_by_name || 'Sistema', // Nome do usuário que registrou
        recorded_at: record.recorded_at, // Data/hora de registro
        gallonNumber: record.gallon_number || 1, // Número do galão (1, 2 ou 3)
      }));
    }),

  getByBooking: employeeProcedure
    .input(z.object({ bookingId: z.number() }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT fr.*
        FROM fuel_records fr
        WHERE fr.booking_id = ${input.bookingId}
        ORDER BY fr.created_at DESC
      `) as any;

      return (Array.isArray(result[0]) ? result[0] : result) as any[];
    }),

  stats: employeeProcedure
    .input(z.object({
      vesselId: z.number().optional(),
      startDate: z.number().optional(),
      endDate: z.number().optional(),
      month: z.number().min(1).max(12).optional(), // Mês (1-12)
      year: z.number().min(2020).max(2030).optional(), // Ano
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql: sqlTag } = await import('drizzle-orm');

      const conditions: any[] = [];
      if (input.vesselId) {
        conditions.push(sqlTag`vessel_id = ${input.vesselId}`);
      }
      if (input.month && input.year) {
        conditions.push(sqlTag`MONTH(created_at) = ${Number(input.month)}`);
        conditions.push(sqlTag`YEAR(created_at) = ${Number(input.year)}`);
      } else {
        if (input.startDate) {
          conditions.push(sqlTag`created_at >= FROM_UNIXTIME(${input.startDate / 1000})`);
        }
        if (input.endDate) {
          conditions.push(sqlTag`created_at <= FROM_UNIXTIME(${input.endDate / 1000})`);
        }
      }
      const whereClause = conditions.length > 0
        ? sqlTag`WHERE ${sqlTag.join(conditions, sqlTag` AND `)}`
        : sqlTag``;

      const result = await db.execute(sqlTag`
        SELECT
          COUNT(*) as total_records,
          SUM(liters) as total_liters,
          SUM(total_amount) as total_cost,
          AVG(liters) as avg_liters_per_refuel,
          AVG(price_per_liter) as avg_price_per_liter,
          SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
          SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending
        FROM fuel_records
        ${whereClause}
      `) as any;
      const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

      return {
        totalRecords: Number(stats.total_records) || 0,
        totalLiters: Number(stats.total_liters) || 0,
        totalCost: Number(stats.total_cost) / 100 || 0, // Converter centavos para reais
        totalReceived: Number(stats.total_received) / 100 || 0, // Converter centavos para reais
        totalPending: Number(stats.total_pending) / 100 || 0, // Converter centavos para reais
        avgLitersPerRefuel: Number(stats.avg_liters_per_refuel) / 100 || 0,
        avgPricePerLiter: Number(stats.avg_price_per_liter) / 100 || 0,
      };
    }),

  delete: employeeProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');

        // 1. Buscar informações do abastecimento (incluindo gallon_number para devolver ao estoque correto)
        const recordResult = await db.execute(sql`
          SELECT 
            fr.liters,
            fr.gallon_number,
            fr.booking_id
          FROM fuel_records fr
          WHERE fr.id = ${input.id}
        `) as any;
        const record = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);
        
        if (!record) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
        }
        
        // 2. Devolver litros ao estoque do galão correto (gallon_stock)
        const litersToReturn = record.liters; // Já está em centésimos
        const gallonNumber = record.gallon_number;
        
        const updateResult = await db.execute(sql`
          UPDATE gallon_stock 
          SET stock_liters = stock_liters + ${litersToReturn}
          WHERE gallon_number = ${gallonNumber}
        `) as any;
        
        const affectedRows = Array.isArray(updateResult) ? (updateResult[0] as any)?.affectedRows : (updateResult as any)?.affectedRows;
        
        if (!affectedRows || affectedRows === 0) {
          console.warn(`[fuelRecords.delete] AVISO: gallon_stock não encontrado para galão ${gallonNumber}. Litros não devolvidos.`);
        } else {
          console.log(`[fuelRecords.delete] ✅ Devolvendo ${litersToReturn / 100}L ao estoque do Galão ${gallonNumber}`);
        }
        
        // 3. Excluir containers filhos primeiro (evitar containers órfãos que inflam o consumo)
        await db.execute(sql`DELETE FROM fuel_record_containers WHERE fuel_record_id = ${input.id}`);
        
        // 4. Excluir o registro principal
        await db.execute(sql`DELETE FROM fuel_records WHERE id = ${input.id}`);
        
        return { success: true };
      } catch (error: any) {
        console.error('[fuelRecords.delete] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao excluir abastecimento: ${error.message}` 
        });
      }
    }),

  // Sincronizar abastecimento individual com Asaas
  syncWithAsaas: adminProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        // Buscar registro de abastecimento
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT * FROM fuel_records WHERE id = ${input.id}
        `) as any;
        const record = (Array.isArray(result[0]) ? result[0][0] : result[0]);

        if (!record) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Abastecimento não encontrado' });
        }

        // Se já está sincronizado, retornar sucesso
        if (record.sync_status === 'synced' && record.asaas_charge_id) {
          return { 
            success: true, 
            message: 'Abastecimento já sincronizado',
            chargeId: record.asaas_charge_id,
            paymentUrl: record.payment_url
          };
        }

        // Tentar criar cobrança no Asaas
        const asaas = await import('../_core/asaas');
        
        console.log('[syncWithAsaas] Buscando/criando cliente:', record.client_email);
        const customer = await asaas.getOrCreateCustomer({
          name: record.client_name,
          email: record.client_email,
        });
        console.log('[syncWithAsaas] Cliente obtido:', customer.id);

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 1); // Vencimento em 1 dia
        
        console.log('[syncWithAsaas] Criando cobrança...');
        const charge = await asaas.createCharge({
          customer: customer.id,
          billingType: 'UNDEFINED',
          value: record.total_amount / 100, // Converter centavos para reais
          dueDate: asaas.formatDateForAsaas(dueDate),
          description: `Abastecimento - ${record.vessel_name} - ${record.liters / 100}L`,
          externalReference: `fuel_record_${record.id}`,
        });
        console.log('[syncWithAsaas] Cobrança criada:', charge.id);

        // Atualizar registro com dados da cobrança
        await db.execute(sql`
          UPDATE fuel_records 
          SET 
            asaas_charge_id = ${charge.id},
            asaas_customer_id = ${customer.id},
            payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
            sync_status = 'synced',
            sync_error = NULL,
            last_sync_attempt = NOW()
          WHERE id = ${input.id}
        `);

        return { 
          success: true, 
          message: 'Cobrança criada com sucesso no Asaas',
          chargeId: charge.id,
          paymentUrl: charge.invoiceUrl || charge.bankSlipUrl || ''
        };
      } catch (error: any) {
        console.error('[syncWithAsaas] Erro:', error);
        
        // Salvar erro no banco
        const { sql } = await import('drizzle-orm');
        await db.execute(sql`
          UPDATE fuel_records 
          SET 
            sync_status = 'failed',
            sync_error = ${error.message},
            last_sync_attempt = NOW()
          WHERE id = ${input.id}
        `);

        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao sincronizar com Asaas: ${error.message}` 
        });
      }
    }),

  // Sincronizar todos os abastecimentos pendentes
  syncAllPending: adminProcedure
    .mutation(async () => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        // Buscar todos os registros pendentes
        const { sql } = await import('drizzle-orm');
        const result = await db.execute(sql`
          SELECT id FROM fuel_records 
          WHERE sync_status = 'pending' OR sync_status = 'failed'
          ORDER BY created_at ASC
        `) as any;
        const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

        let successCount = 0;
        let failCount = 0;
        const errors: string[] = [];

        // Sincronizar cada registro
        for (const record of records) {
          try {
            // Reutilizar lógica do endpoint syncWithAsaas
            const recordResult = await db.execute(sql`
              SELECT * FROM fuel_records WHERE id = ${record.id}
            `) as any;
            const fullRecord = (Array.isArray(recordResult[0]) ? recordResult[0][0] : recordResult[0]);

            if (!fullRecord) continue;

            const asaas = await import('../_core/asaas');
            const customer = await asaas.getOrCreateCustomer({
              name: fullRecord.client_name,
              email: fullRecord.client_email,
            });

            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 1); // Vencimento em 1 dia
            
            const charge = await asaas.createCharge({
              customer: customer.id,
              billingType: 'UNDEFINED',
              value: fullRecord.total_amount / 100,
              dueDate: asaas.formatDateForAsaas(dueDate),
              description: `Abastecimento - ${fullRecord.vessel_name} - ${fullRecord.liters / 100}L`,
              externalReference: `fuel_record_${fullRecord.id}`,
            });

            await db.execute(sql`
              UPDATE fuel_records 
              SET 
                asaas_charge_id = ${charge.id},
                asaas_customer_id = ${customer.id},
                payment_url = ${charge.invoiceUrl || charge.bankSlipUrl || ''},
                sync_status = 'synced',
                sync_error = NULL,
                last_sync_attempt = NOW()
              WHERE id = ${record.id}
            `);

            successCount++;
          } catch (error: any) {
            console.error(`[syncAllPending] Erro no registro ${record.id}:`, error);
            failCount++;
            errors.push(`Registro ${record.id}: ${error.message}`);
            
            await db.execute(sql`
              UPDATE fuel_records 
              SET 
                sync_status = 'failed',
                sync_error = ${error.message},
                last_sync_attempt = NOW()
              WHERE id = ${record.id}
            `);
          }
        }

        return {
          success: true,
          total: records.length,
          successCount,
          failCount,
          errors: errors.length > 0 ? errors : undefined
        };
      } catch (error: any) {
        console.error('[syncAllPending] Erro:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao sincronizar abastecimentos: ${error.message}` 
        });
      }
    }),

  // Marcar pagamento como recebido manualmente
  markAsPaid: adminProcedure
    .input(z.object({
      id: z.number(),
      note: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      try {
        const { sql } = await import('drizzle-orm');

        // 1. Buscar o registro para obter asaas_charge_id
        const recResult = await db.execute(sql`
          SELECT id, asaas_charge_id, total_amount, client_email, client_name, due_date
          FROM fuel_records WHERE id = ${input.id}
        `) as any;
        const rec = (Array.isArray(recResult[0]) ? recResult[0][0] : recResult[0]);
        if (!rec) throw new TRPCError({ code: 'NOT_FOUND', message: 'Registro de abastecimento não encontrado' });

        // 2+3. Atualizar fuel_records e sincronizar bpo_charges como uma
        // única transação: são as duas metades do mesmo evento de negócio
        // ("este pagamento foi recebido") — sem chamada externa no meio
        // (diferente de fuelRecords.create), então não há razão para
        // aceitar sucesso parcial. Se o sync com bpo_charges falhar por
        // qualquer motivo, a marcação de pago também é revertida, em vez
        // de reportar sucesso enquanto o financeiro fica desatualizado.
        await db.transaction(async (tx) => {
          await tx.execute(sql`
            UPDATE fuel_records
            SET
              payment_status = 'paid',
              sync_status = 'manual',
              paid_at = NOW(),
              manual_payment_note = ${input.note || 'Pagamento recebido manualmente'}
            WHERE id = ${input.id}
          `);

          const dueDateStr = rec.due_date ? new Date(rec.due_date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
          const valueInReais = ((rec.total_amount || 0) / 100).toFixed(2);
          const valueNum = parseFloat(valueInReais);
          const clientEmail = rec.client_email ? String(rec.client_email) : null;
          const asaasId = rec.asaas_charge_id ? String(rec.asaas_charge_id) : null;

          let rowsUpdated = 0;

          // 1. Pelo asaas_charge_id (mais preciso)
          if (asaasId) {
            const [r] = (await tx.execute(sql`
              UPDATE bpo_charges
              SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW()
              WHERE asaas_charge_id = ${asaasId}
                AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
            `)) as any;
            rowsUpdated += r?.affectedRows ?? 0;
          }

          // 2. Fallback por email (case-insensitive) + tipo + valor com margem
          if (rowsUpdated === 0 && clientEmail && valueNum > 0) {
            const [r2] = (await tx.execute(sql`
              UPDATE bpo_charges
              SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW()
              WHERE type = 'fuel'
                AND LOWER(client_email) = LOWER(${clientEmail})
                AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
                AND ABS(CAST(value AS DECIMAL(10,2)) - ${valueNum}) < 0.02
              ORDER BY ABS(DATEDIFF(due_date, ${dueDateStr})) ASC
              LIMIT 1
            `)) as any;
            rowsUpdated += r2?.affectedRows ?? 0;
          }

          // 3. Fallback amplo: qualquer fuel pendente/vencido do mesmo cliente (sem restrição de valor)
          if (rowsUpdated === 0 && clientEmail) {
            const [r3] = (await tx.execute(sql`
              UPDATE bpo_charges
              SET status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW()
              WHERE type = 'fuel'
                AND LOWER(client_email) = LOWER(${clientEmail})
                AND status IN ('pending', 'overdue')
              ORDER BY ABS(DATEDIFF(due_date, ${dueDateStr})) ASC
              LIMIT 1
            `)) as any;
            rowsUpdated += r3?.affectedRows ?? 0;
          }

          // 4. Nenhum registro encontrado — inserir como baixa manual para rastreio
          if (rowsUpdated === 0) {
            const clientName = rec.client_name || null;
            const safeDesc = `Abastecimento - Baixa manual (ID: ${input.id})`;
            await tx.execute(sql`
              INSERT INTO bpo_charges (
                asaas_charge_id, client_name, client_email,
                value, due_date, status, type, classified_by,
                billing_type, description, source, synced_at
              ) VALUES (
                ${asaasId}, ${clientName}, ${clientEmail},
                ${valueInReais}, ${dueDateStr}, 'receivedInCash', 'fuel', 'manual',
                'PIX', ${safeDesc}, 'manual', NOW()
              )
              ON DUPLICATE KEY UPDATE
                status = 'receivedInCash', paid_date = CURDATE(), synced_at = NOW()
            `);
          }
        });

        return { success: true, message: 'Pagamento marcado como recebido' };
      } catch (error: any) {
        // Re-lança TRPCErrors intencionais (ex.: NOT_FOUND 'Registro de
        // abastecimento não encontrado') sem mascará-los com a mensagem genérica.
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error('[markAsPaid] Erro:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Erro ao marcar pagamento. Tente novamente.'
        });
      }
    }),

  // Generate PDF report for selected fuel records
  generateReport: employeeProcedure
    .input(z.object({
      recordIds: z.array(z.number()),
    }))
    .mutation(async ({ input }) => {
      if (input.recordIds.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
      }

      // Buscar registros selecionados via raw SQL
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const idsSQL = sql.join(input.recordIds.map(id => sql`${id}`), sql`, `);
      const result = await db.execute(sql`
        SELECT
          fr.*,
          b.booking_date,
          b.client_name,
          u.name as recorded_by_name
        FROM fuel_records fr
        LEFT JOIN bookings b ON fr.booking_id = b.id
        LEFT JOIN users u ON fr.recorded_by = u.id
        WHERE fr.id IN (${idsSQL})
        ORDER BY fr.created_at DESC
      `) as any;
      
      const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

      if (!records || records.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
      }

      // Mapear snake_case para camelCase e calcular campos faltantes
      const mappedRecords = records.map(r => ({
        id: r.id,
        vesselName: r.vessel_name || 'N/A',
        clientName: r.client_name || 'N/A', // Nome do cliente que usou a embarcação
        employeeName: r.recorded_by_name || 'Sistema', // Nome do funcionário que registrou
        date: r.booking_date || r.created_at,
        liters: r.liters || 0,
        pricePerLiter: r.price_per_liter || 0,
        subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
        serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
        totalAmount: r.total_amount || 0,
        notes: r.notes,
        // Campos de pesagem (opcionais)
        litersInitial: r.liters_initial || null,
        weightFull: r.weight_full || null,
        weightAfter: r.weight_after || null,
        weightConsumed: r.weight_consumed || null,
        litersCalculated: r.liters_calculated || null,
        photoBeforeUrl: r.photo_before_url || null,
        photoAfterUrl: r.photo_after_url || null,
      }));

      // Gerar PDF
      const { generateFuelRecordsPDF } = await import('../_core/fuelRecordPDF');
      const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);

      // Retornar PDF como base64
      return {
        pdf: pdfBuffer.toString('base64'),
        filename: `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`,
      };
    }),

  sendReportByEmail: employeeProcedure
    .input(z.object({
      recordIds: z.array(z.number()),
      email: z.string().email(),
    }))
    .mutation(async ({ input }) => {
      if (input.recordIds.length === 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nenhum registro selecionado' });
      }

      // Buscar registros selecionados via raw SQL
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const idsSQL = sql.join(input.recordIds.map(id => sql`${id}`), sql`, `);
      const result = await db.execute(sql`
        SELECT
          fr.*,
          b.booking_date,
          b.client_name,
          u.name as recorded_by_name
        FROM fuel_records fr
        LEFT JOIN bookings b ON fr.booking_id = b.id
        LEFT JOIN users u ON fr.recorded_by = u.id
        WHERE fr.id IN (${idsSQL})
        ORDER BY fr.created_at DESC
      `) as any;
      
      const records = (Array.isArray(result[0]) ? result[0] : result) as any[];

      if (!records || records.length === 0) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Nenhum registro encontrado' });
      }

      // Mapear snake_case para camelCase e calcular campos faltantes
      const mappedRecords = records.map(r => ({
        id: r.id,
        vesselName: r.vessel_name || 'N/A',
        clientName: r.client_name || 'N/A', // Nome do cliente que usou a embarcação
        employeeName: r.recorded_by_name || 'Sistema', // Nome do funcionário que registrou
        date: r.booking_date || r.created_at,
        liters: r.liters || 0,
        pricePerLiter: r.price_per_liter || 0,
        subtotal: (r.liters || 0) * (r.price_per_liter || 0) / 100, // Calculado: litros × preço/L (em centavos)
        serviceFee: 1000, // Taxa fixa: R$ 10.00 em centavos
        totalAmount: r.total_amount || 0,
        notes: r.notes,
        // Campos de pesagem (opcionais)
        litersInitial: r.liters_initial || null,
        weightFull: r.weight_full || null,
        weightAfter: r.weight_after || null,
        weightConsumed: r.weight_consumed || null,
        litersCalculated: r.liters_calculated || null,
        photoBeforeUrl: r.photo_before_url || null,
        photoAfterUrl: r.photo_after_url || null,
      }));

      // Gerar PDF
      const { generateFuelRecordsPDF } = await import('../_core/fuelRecordPDF');
      const pdfBuffer = await generateFuelRecordsPDF(mappedRecords);
      const filename = `abastecimentos-${new Date().toISOString().split('T')[0]}.pdf`;

      // Enviar email com PDF anexado
      const { sendEmail } = await import('../_core/emailService');
      
      const totalLiters = mappedRecords.reduce((sum, r) => sum + r.liters, 0) / 100;
      const totalAmount = mappedRecords.reduce((sum, r) => sum + r.totalAmount, 0) / 100;

      const emailSent = await sendEmail({
        to: input.email,
        subject: `Relatório de Abastecimentos - ${new Date().toLocaleDateString('pt-BR')}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #0891b2 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 28px;">⚓ EXCLUSIVE CLUB</h1>
              <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">Sistema de Compartilhamento de Embarcações</p>
            </div>
            
            <div style="padding: 30px; background: #f9fafb;">
              <h2 style="color: #1f2937; margin-top: 0;">Relatório de Abastecimentos</h2>
              
              <p style="color: #6b7280; line-height: 1.6;">
                Prezado(a),
              </p>
              
              <p style="color: #6b7280; line-height: 1.6;">
                Segue em anexo o relatório de abastecimentos solicitado, contendo <strong>${records.length} registro(s)</strong>.
              </p>
              
              <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #0891b2;">
                <h3 style="margin: 0 0 15px 0; color: #0891b2;">Resumo</h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Total de Registros:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${records.length}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280;">Total de Litros:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #1f2937;">${totalLiters.toFixed(2)}L</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 12px;">Valor Total:</td>
                    <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #0891b2; font-size: 18px; border-top: 1px solid #e5e7eb; padding-top: 12px;">R$ ${totalAmount.toFixed(2)}</td>
                  </tr>
                </table>
              </div>
              
              <p style="color: #6b7280; line-height: 1.6;">
                O relatório completo em PDF está anexado a este email.
              </p>
              
              <p style="color: #6b7280; line-height: 1.6; margin-bottom: 0;">
                Atenciosamente,<br>
                <strong>Equipe Exclusive Club</strong>
              </p>
            </div>
            
            <div style="background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; font-size: 12px;">
              <p style="margin: 0;">
                Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
              </p>
              <p style="margin: 10px 0 0 0;">
                © ${new Date().getFullYear()} Exclusive Club - Todos os direitos reservados
              </p>
            </div>
          </div>
        `,
        text: `
RELATÓRIO DE ABASTECIMENTOS - EXCLUSIVE CLUB

Resumo:
- Total de Registros: ${records.length}
- Total de Litros: ${totalLiters.toFixed(2)}L
- Valor Total: R$ ${totalAmount.toFixed(2)}

O relatório completo em PDF está anexado a este email.

Atenciosamente,
Equipe Exclusive Club

Relatório gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        `,
        attachments: [{
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });

      if (!emailSent) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao enviar e-mail. Verifique as configurações SMTP.' });
      }

      return { success: true, email: input.email };
    }),

  // Novo endpoint: generatePayment - Gerar pagamento PIX para abastecimentos selecionados
  generatePayment: protectedProcedure
    .input(z.object({
      recordIds: z.array(z.number()).min(1).max(1, 'Selecione apenas um abastecimento por vez'),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const asaas = await import('../_core/asaas');

      // Resolve a chave da API do Asaas via resolvedor único (env override → banco).
      // Ver server/_core/asaas.ts :: resolveAsaasApiKey
      const apiKey = await asaas.resolveAsaasApiKey();

      if (!apiKey) {
        console.error('[generatePayment] ASAAS_API_KEY não configurada');
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: 'Integração de pagamento não configurada. Configure a chave API em Configurações do Admin.' 
        });
      }

      const ASAAS_API_URL = asaas.resolveAsaasApiUrl(apiKey);

      // Buscar abastecimento selecionado (apenas 1)
      const recordId = input.recordIds[0];
      
      const result = await db.execute(sql`
        SELECT 
          id,
          client_name as clientName,
          client_email as clientEmail,
          vessel_name as vesselName,
          liters,
          total_amount as totalAmount,
          asaas_charge_id as asaasChargeId,
          payment_status as paymentStatus
        FROM fuel_records
        WHERE id = ${recordId}
          AND client_email = ${ctx.user.email}
          AND payment_status IN ('pending', 'overdue')
      `) as any;

      const records = (Array.isArray(result[0]) ? result[0] : result);
      const record = records[0];

      if (!record) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Abastecimento não encontrado ou já foi pago' 
        });
      }
      
      // Validar que o abastecimento tem cobrança no Asaas
      if (!record.asaasChargeId) {
        throw new TRPCError({ 
          code: 'BAD_REQUEST', 
          message: 'Cobrança não foi criada no sistema de pagamento. Entre em contato com o administrador.' 
        });
      }

      // Buscar cobrança EXISTENTE no Asaas (com valores atualizados - multas/juros)
      console.log(`[generatePayment] Buscando cobrança existente: ${record.asaasChargeId}`);
      
      let charge;
      try {
        charge = await asaas.getCharge(record.asaasChargeId);
        console.log(`[generatePayment] Cobrança encontrada - Valor: R$ ${charge.value}`);
      } catch (error) {
        console.error('[generatePayment] Erro ao buscar cobrança no Asaas:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: 'Erro ao buscar cobrança no sistema de pagamento' 
        });
      }
      
      const totalValue = parseFloat(charge.value);
      const chargeDetails = [{
        id: record.id,
        vesselName: record.vesselName,
        originalAmount: record.totalAmount / 100,
        currentAmount: totalValue,
        asaasChargeId: record.asaasChargeId,
      }];

      // Buscar QR Code PIX da cobrança EXISTENTE
      console.log(`[generatePayment] Buscando QR Code PIX para cobrança existente ${charge.id}`);

      try {
        // A API do Asaas retorna os dados do PIX junto com a cobrança
        // Campos: invoiceUrl, bankSlipUrl, invoiceNumber, externalReference, 
        // originalValue, interestValue, description, billingType, canBePaidAfterDueDate,
        // pixTransaction, status, dueDate, originalDueDate, paymentDate, clientPaymentDate,
        // installmentNumber, transactionReceiptUrl, nossoNumero, invoiceNumber, externalReference
        
        // Para PIX, precisamos buscar o QR Code em um endpoint separado
        const pixResponse = await fetch(`${ASAAS_API_URL}/payments/${charge.id}/pixQrCode`, {
          method: 'GET',
          headers: {
            'access_token': apiKey,
            'Content-Type': 'application/json',
          },
        });

        if (!pixResponse.ok) {
          const errorText = await pixResponse.text();
          console.error('[generatePayment] Erro ao buscar QR Code:', {
            status: pixResponse.status,
            statusText: pixResponse.statusText,
            body: errorText,
            chargeId: charge.id,
          });
          
          // Se o QR Code não existe, pode ser porque a cobrança já foi paga ou expirou
          if (pixResponse.status === 404) {
            throw new TRPCError({ 
              code: 'BAD_REQUEST', 
              message: 'QR Code PIX não disponível. A cobrança pode ter sido paga ou expirado.' 
            });
          }
          
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: `Erro ao buscar QR Code PIX. Status: ${pixResponse.status}` 
          });
        }

        const pixData = await pixResponse.json();
        console.log('[generatePayment] QR Code obtido:', {
          hasEncodedImage: !!pixData.encodedImage,
          hasPayload: !!pixData.payload,
          expirationDate: pixData.expirationDate,
        });

        // Validar que os dados do PIX existem
        if (!pixData.encodedImage || !pixData.payload) {
          console.error('[generatePayment] Dados do PIX incompletos:', pixData);
          throw new TRPCError({ 
            code: 'INTERNAL_SERVER_ERROR', 
            message: 'Dados do QR Code PIX estão incompletos. Entre em contato com o administrador.' 
          });
        }

        return {
          success: true,
          chargeId: charge.id,
          totalValue,
          qrCode: pixData.encodedImage, // Base64 da imagem QR Code
          payload: pixData.payload, // Código PIX copia-e-cola
          expirationDate: pixData.expirationDate,
          chargeDetails,
        };
      } catch (error: any) {
        console.error('[generatePayment] Erro ao processar pagamento:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao gerar pagamento: ${error.message || 'Erro desconhecido'}` 
        });
      }
    }),

  // Novo endpoint: myRecords - Cliente vê seus próprios abastecimentos
  myRecords: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT 
          fr.id,
          fr.vessel_name as vesselName,
          fr.liters,
          fr.price_per_liter as pricePerLiter,
          fr.total_amount as totalAmount,
          fr.notes,
          fr.receipt_url as receiptUrl,
          fr.asaas_charge_id as asaasChargeId,
          fr.payment_status as paymentStatus,
          fr.paid_at as paidAt,
          fr.due_date as dueDate,
          fr.created_at as createdAt,
          b.booking_date as bookingDate
        FROM fuel_records fr
        LEFT JOIN bookings b ON fr.booking_id = b.id
        WHERE fr.client_email = ${ctx.user.email}
        ORDER BY fr.created_at DESC
      `) as any;

      const records = (Array.isArray(result[0]) ? result[0] : result);

      // Mapear campos para camelCase e converter centavos para reais
      return records.map((r: any) => ({
        id: r.id,
        vesselName: r.vesselName,
        liters: r.liters / 100, // Converter centavos para reais
        pricePerLiter: r.pricePerLiter / 100,
        totalAmount: r.totalAmount / 100,
        notes: r.notes,
        receiptUrl: r.receiptUrl,
        asaasChargeId: r.asaasChargeId,
        paymentStatus: r.paymentStatus,
        paidAt: r.paidAt,
        dueDate: r.dueDate,
        createdAt: r.createdAt,
        bookingDate: r.bookingDate,
      }));
    }),

  // Novo endpoint: uploadReceipt - Upload de comprovante de pagamento
  uploadReceipt: employeeProcedure
    .input(z.object({
      recordId: z.number(),
      receiptUrl: z.string().url(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      await db.execute(sql`
        UPDATE fuel_records 
        SET receipt_url = ${input.receiptUrl}
        WHERE id = ${input.recordId}
      `);

      return { success: true };
    }),

  // Novo endpoint: financialStats - Estatísticas financeiras para dashboard
  financialStats: adminProcedure
    .input(z.object({
      monthYear: z.string().optional(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');

      // Se não especificado, usar mês atual
      const monthYear = input.monthYear || new Date().toISOString().slice(0, 7);

      // Buscar estatísticas do mês
      const result = await db.execute(sql`
        SELECT 
          COUNT(*) as total_records,
          SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_received,
          SUM(total_amount) as total_billed,
          SUM(CASE WHEN payment_status = 'pending' THEN total_amount ELSE 0 END) as total_pending,
          SUM(CASE WHEN payment_status = 'overdue' THEN total_amount ELSE 0 END) as total_overdue
        FROM fuel_records
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ${monthYear}
          AND (is_operational = 0 OR is_operational IS NULL)
      `) as any;

      const stats = (Array.isArray(result[0]) ? result[0][0] : result[0]);

      // Buscar orçamento do mês (soma das compras de combustível)
      const budgetResult = await db.execute(sql`
        SELECT COALESCE(SUM(amount_paid), 0) as total_budget
        FROM fuel_purchases
        WHERE month_year = ${monthYear}
      `) as any;

      const budgetData = (Array.isArray(budgetResult[0]) ? budgetResult[0][0] : budgetResult[0]);

      const totalReceived = Number(stats.total_received) || 0;
      const totalBilled = Number(stats.total_billed) || 0;
      const totalPending = Number(stats.total_pending) || 0;
      const totalOverdue = Number(stats.total_overdue) || 0;
      const totalBudget = Number(budgetData.total_budget) || 0;

      // Buscar custo operacional acumulativo do ano
      const currentYear = monthYear.split('-')[0];
      const operationalCostResult = await db.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0) as operational_cost
        FROM fuel_records
        WHERE YEAR(created_at) = ${currentYear}
          AND is_operational = 1
      `) as any;

      const operationalCostData = (Array.isArray(operationalCostResult[0]) ? operationalCostResult[0][0] : operationalCostResult[0]);
      const operationalCost = Number(operationalCostData.operational_cost) || 0;

      // Calcular saldo (Gasto - Orçamento)
      // Saldo = diferença entre o que foi gasto e o orçamento disponível
      // Negativo = dentro do orçamento, Positivo = acima do orçamento
      const balance = totalBilled - totalBudget;

      return {
        monthYear,
        totalRecords: Number(stats.total_records) || 0,
        totalReceived: totalReceived / 100, // Converter centavos para reais
        totalBilled: totalBilled / 100,
        totalPending: totalPending / 100,
        totalOverdue: totalOverdue / 100,
        balance: balance / 100,
        totalBudget: totalBudget / 100,
        budgetUsagePercent: totalBudget > 0 ? (totalBilled / totalBudget) * 100 : 0,
        operationalCost: operationalCost / 100, // Custo operacional acumulativo do ano
        operationalCostYear: currentYear, // Ano do custo operacional
      };
    }),
});

// Fuel Budget router - Admin and Employee access
export const fuelBudgetRouter = router({
  // Permitir acesso para admin e employee (funcionários precisam do preço/L)
  get: employeeProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT * FROM fuel_budget WHERE month_year = ${input.monthYear}
      `) as any;

      const budget = (Array.isArray(result[0]) ? result[0][0] : result[0]);
      
      // Calcular orçamento total como soma das compras do histórico
      const purchasesResult = await db.execute(sql`
        SELECT COALESCE(SUM(amount_paid), 0) as total_purchases,
               COALESCE(SUM(liters_purchased), 0) as total_liters_purchased
        FROM fuel_purchases
        WHERE month_year = ${input.monthYear}
      `) as any;
      const purchasesData = (Array.isArray(purchasesResult[0]) ? purchasesResult[0][0] : purchasesResult[0]);
      const totalBudget = Number(purchasesData.total_purchases) || 0; // Já em centavos
      const totalLitersPurchased = Number(purchasesData.total_liters_purchased) || 0; // Já em centésimos

      // Calcular total de litros já abastecidos (usados)
      const usedResult = await db.execute(sql`
        SELECT COALESCE(SUM(liters), 0) as total_liters_used
        FROM fuel_records
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
      `) as any;
      const usedData = (Array.isArray(usedResult[0]) ? usedResult[0][0] : usedResult[0]);
      const totalLitersUsed = Number(usedData.total_liters_used) || 0; // Já em centésimos

      // Estoque real = Total comprado - Total usado
      const realStockLiters = totalLitersPurchased - totalLitersUsed;

      // Calcular preço/L médio ponderado: (soma total R$ das compras) / (soma total litros das compras)
      // Arredondar para cima
      const avgPricePerLiter = totalLitersPurchased > 0 
        ? Math.ceil((totalBudget / totalLitersPurchased) * 100) / 100 // totalBudget já está em centavos, totalLiters em centésimos
        : 0;

      // Calcular total gasto (soma dos abastecimentos)
      const spentResult = await db.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0) as total_spent
        FROM fuel_records
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
      `) as any;
      const spentData = (Array.isArray(spentResult[0]) ? spentResult[0][0] : spentResult[0]);
      const totalSpent = Number(spentData.total_spent) || 0;

      // Calcular total recebido (pagamentos confirmados)
      const receivedResult = await db.execute(sql`
        SELECT COALESCE(SUM(total_amount), 0) as total_received
        FROM fuel_records
        WHERE DATE_FORMAT(created_at, '%Y-%m') = ${input.monthYear}
          AND payment_status = 'paid'
      `) as any;
      const receivedData = (Array.isArray(receivedResult[0]) ? receivedResult[0][0] : receivedResult[0]);
      const totalReceived = Number(receivedData.total_received) || 0;

      return {
        monthYear: input.monthYear,
        totalBudget: totalBudget / 100, // Orçamento = soma das compras
        totalSpent: totalSpent / 100, // Gasto = soma dos abastecimentos
        totalReceived: totalReceived / 100, // Recebido = pagamentos confirmados
        stockLiters: realStockLiters / 100, // Estoque = comprado - usado
        lastPricePerLiter: avgPricePerLiter, // Preço/L médio ponderado (já em reais)
      };
    }),

  // REMOVIDO: endpoint 'set' não é mais necessário
  // Orçamento agora é calculado automaticamente como soma das compras

  // NOVO: getCurrentStock - Obter estoque com herança do mês anterior
  getCurrentStock: employeeProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const { calculateCurrentGallonStock } = await import('../db');

      try {
        // Calcular estoque atual de cada galão (com herança)
        const gallon1Stock = await calculateCurrentGallonStock(1, input.monthYear);
        const gallon2Stock = await calculateCurrentGallonStock(2, input.monthYear);
        const gallon3Stock = await calculateCurrentGallonStock(3, input.monthYear);

        return {
          gallon1: gallon1Stock / 100, // Converter centésimos para litros
          gallon2: gallon2Stock / 100,
          gallon3: gallon3Stock / 100,
          total: (gallon1Stock + gallon2Stock + gallon3Stock) / 100,
        };
      } catch (error: any) {
        console.error('[fuelBudget.getCurrentStock] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao calcular estoque: ${error.message}` 
        });
      }
    }),

  // NOVO: getCurrentBalance - Obter saldo com herança do mês anterior
  getCurrentBalance: employeeProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const { calculateCurrentBalance } = await import('../db');

      try {
        const balance = await calculateCurrentBalance(input.monthYear);

        return {
          inherited: balance.inherited / 100, // Converter centavos para reais
          budget: balance.budget / 100,
          spent: balance.spent / 100,
          current: balance.current / 100,
        };
      } catch (error: any) {
        console.error('[fuelBudget.getCurrentBalance] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao calcular saldo: ${error.message}` 
        });
      }
    }),

  // NOVO: getMonthPurchases - Obter apenas compras do mês (SEM herança)
  getMonthPurchases: employeeProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const { getMonthPurchasesByGallon } = await import('../db');

      try {
        const purchases = await getMonthPurchasesByGallon(input.monthYear);

        return {
          gallon1: purchases.gallon1 / 100, // Converter centésimos para litros
          gallon2: purchases.gallon2 / 100,
          gallon3: purchases.gallon3 / 100,
          total: purchases.total / 100,
        };
      } catch (error: any) {
        console.error('[fuelBudget.getMonthPurchases] Error:', error);
        throw new TRPCError({ 
          code: 'INTERNAL_SERVER_ERROR', 
          message: `Erro ao buscar compras do mês: ${error.message}` 
        });
      }
    }),
});

// Fuel Purchases router - Admin only
export const fuelPurchasesRouter = router({
  create: adminProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
      liters: z.number().positive(),
      amountPaid: z.number().positive(),
      notes: z.string().optional(),
      gallonNumber: z.number().min(1).max(3).default(1), // Galão 1, 2 ou 3
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      
      // Calcular preço por litro
      const pricePerLiter = Math.round((input.amountPaid * 100) / input.liters); // em centavos
      const litersPurchased = Math.round(input.liters * 100); // em centésimos
      const amountPaid = Math.round(input.amountPaid * 100); // em centavos
      
      // Inserir compra com gallon_number
      await db.execute(sql`
        INSERT INTO fuel_purchases (
          month_year, liters_purchased, amount_paid, price_per_liter, 
          purchased_by, notes, gallon_number
        )
        VALUES (
          ${input.monthYear}, ${litersPurchased}, ${amountPaid}, ${pricePerLiter},
          ${ctx.user.id}, ${input.notes || null}, ${input.gallonNumber}
        )
      `);
      
      // Atualizar estoque do galão específico na tabela gallon_stock
      await db.execute(sql`
        UPDATE gallon_stock 
        SET stock_liters = stock_liters + ${litersPurchased},
            last_price_per_liter = ${pricePerLiter}
        WHERE gallon_number = ${input.gallonNumber}
      `);
      
      // Manter compatibilidade: atualizar fuel_budget com total geral
      await db.execute(sql`
        INSERT INTO fuel_budget (month_year, total_budget, total_spent, total_received, stock_liters, last_price_per_liter)
        VALUES (${input.monthYear}, 0, 0, 0, ${litersPurchased}, ${pricePerLiter})
        ON DUPLICATE KEY UPDATE 
          stock_liters = stock_liters + ${litersPurchased},
          last_price_per_liter = ${pricePerLiter}
      `);
      
      return { success: true, gallonNumber: input.gallonNumber };
    }),

  list: adminProcedure
    .input(z.object({
      monthYear: z.string(), // formato: YYYY-MM
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      const result = await db.execute(sql`
        SELECT 
          fp.*,
          u.name as purchased_by_name
        FROM fuel_purchases fp
        LEFT JOIN users u ON fp.purchased_by = u.id
        WHERE fp.month_year = ${input.monthYear}
        ORDER BY fp.purchased_at DESC
      `) as any;

      const purchases = (Array.isArray(result[0]) ? result[0] : result) as any[];
      
      return purchases.map((p: any) => ({
        id: p.id,
        monthYear: p.month_year,
        litersPurchased: p.liters_purchased / 100, // Converter para litros
        amountPaid: p.amount_paid / 100, // Converter para reais
        pricePerLiter: p.price_per_liter / 100, // Converter para reais
        purchasedAt: p.purchased_at,
        purchasedByName: p.purchased_by_name || 'Sistema',
        notes: p.notes,
        gallonNumber: p.gallon_number || 1, // Número do galão (1, 2 ou 3)
      }));
    }),

  delete: adminProcedure
    .input(z.object({
      purchaseId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      
      // Buscar compra para devolver litros ao estoque
      const result = await db.execute(sql`
        SELECT * FROM fuel_purchases WHERE id = ${input.purchaseId}
      `) as any;
      const purchase = (Array.isArray(result[0]) ? result[0][0] : result[0]);
      
      if (!purchase) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Compra não encontrada' });
      }
      
      // Devolver litros ao estoque do galão específico
      const gallonNumber = purchase.gallon_number || 1;
      await db.execute(sql`
        UPDATE gallon_stock 
        SET stock_liters = stock_liters - ${purchase.liters_purchased}
        WHERE gallon_number = ${gallonNumber}
      `);
      
      // Manter compatibilidade: atualizar fuel_budget
      await db.execute(sql`
        UPDATE fuel_budget 
        SET stock_liters = stock_liters - ${purchase.liters_purchased}
        WHERE month_year = ${purchase.month_year}
      `);
      
      // Deletar compra
      await db.execute(sql`
        DELETE FROM fuel_purchases WHERE id = ${input.purchaseId}
      `);
      
      return { success: true };
    }),

  // Endpoint para obter estoque de todos os galões
  // CORRIGIDO: Estoque = Total Comprado - Total Abastecido (calculado dinamicamente)
  // CORRIGIDO: Preço por litro = Média ponderada (total_gasto / total_litros)
  // CORRIGIDO: Agora considera fuel_record_containers para abastecimentos com múltiplos galões
  getGallonStock: employeeProcedure
    .query(async () => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      
      // Calcular estoque dinamicamente para cada galão
      // Estoque = Total Comprado (fuel_purchases) - Total Abastecido (fuel_records + fuel_record_containers)
      // Preço/L = Média ponderada (total_gasto / total_litros) das compras
      // IMPORTANTE: fuel_records.liters contém o total do abastecimento (pode ser de múltiplos galões)
      // fuel_record_containers.liters_used contém os litros usados de cada galão específico
      // Para abastecimentos antigos (sem containers), usamos fuel_records.gallon_number
      // Para abastecimentos novos (com containers), usamos fuel_record_containers.gallon_number
      const stockResult = await db.execute(sql`
        SELECT 
          g.gallon_number,
          g.last_price_per_liter,
          g.updated_at,
          COALESCE(p.total_purchased, 0) as total_purchased,
          COALESCE(p.total_amount_paid, 0) as total_amount_paid,
          COALESCE(r.total_refueled, 0) as total_refueled
        FROM gallon_stock g
        LEFT JOIN (
          SELECT gallon_number, 
                 SUM(liters_purchased) as total_purchased,
                 SUM(amount_paid) as total_amount_paid
          FROM fuel_purchases
          GROUP BY gallon_number
        ) p ON g.gallon_number = p.gallon_number
        LEFT JOIN (
          -- Soma abastecimentos: fuel_records (antigos sem containers) + fuel_record_containers (novos com múltiplos galões)
          SELECT gallon_number, SUM(liters_used) as total_refueled FROM (
            -- Abastecimentos antigos: registros em fuel_records que NÃO têm containers associados
            SELECT fr.gallon_number, fr.liters as liters_used
            FROM fuel_records fr
            WHERE NOT EXISTS (
              SELECT 1 FROM fuel_record_containers frc WHERE frc.fuel_record_id = fr.id
            )
            UNION ALL
            -- Abastecimentos novos: registros em fuel_record_containers (cada galão usado)
            SELECT frc.gallon_number, frc.liters_used
            FROM fuel_record_containers frc
          ) combined
          GROUP BY gallon_number
        ) r ON g.gallon_number = r.gallon_number
        ORDER BY g.gallon_number ASC
      `) as any;

      const gallons = (Array.isArray(stockResult[0]) ? stockResult[0] : stockResult) as any[];
      
      return gallons.map((g: any) => {
        // Estoque = Comprado - Abastecido (valores em centésimos)
        const totalPurchased = Number(g.total_purchased) || 0;
        const totalRefueled = Number(g.total_refueled) || 0;
        const totalAmountPaid = Number(g.total_amount_paid) || 0;
        const stockLiters = (totalPurchased - totalRefueled) / 100;
        
        // Calcular média ponderada do preço por litro: total_gasto / total_litros
        // Se não houver compras, usa o last_price_per_liter como fallback
        const avgPricePerLiter = totalPurchased > 0 
          ? (totalAmountPaid / totalPurchased) // já está em centavos/centésimos, resultado em reais
          : (g.last_price_per_liter || 0) / 100;
        
        console.log(`[getGallonStock] Galão ${g.gallon_number}: Comprado=${totalPurchased/100}L, Abastecido=${totalRefueled/100}L, Estoque=${stockLiters}L, Preço/L médio=R$${avgPricePerLiter.toFixed(2)}`);
        
        return {
          id: g.gallon_number,
          gallonNumber: g.gallon_number,
          stockLiters: stockLiters,
          lastPricePerLiter: avgPricePerLiter, // Agora é média ponderada
          updatedAt: g.updated_at,
          // Campos extras para debug
          totalPurchased: totalPurchased / 100,
          totalRefueled: totalRefueled / 100,
        };
      });
    }),

  // Endpoint para obter estoque de um galão específico
  // CORRIGIDO: Estoque = Total Comprado - Total Abastecido (calculado dinamicamente)
  // CORRIGIDO: Preço por litro = Média ponderada (total_gasto / total_litros)
  // CORRIGIDO: Agora considera fuel_record_containers para abastecimentos com múltiplos galões
  // Story 12 (Fase 1, DB-03/SYS-12): não tinha NENHUM check de autorização
  // antes — qualquer requisição não autenticada conseguia ler estoque e
  // preço/L de combustível. Alinhado com o resto dos endpoints de estoque
  // (employeeProcedure).
  getGallonStockByNumber: employeeProcedure
    .input(z.object({
      gallonNumber: z.number().min(1).max(3),
    }))
    .query(async ({ input }) => {
      const db = await import('../db').then(m => m.getDb());
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });

      const { sql } = await import('drizzle-orm');
      
      // Calcular estoque dinamicamente para o galão específico
      // Estoque = Total Comprado (fuel_purchases) - Total Abastecido (fuel_records + fuel_record_containers)
      // Preço/L = Média ponderada (total_gasto / total_litros) das compras
      const stockResult = await db.execute(sql`
        SELECT 
          g.gallon_number,
          g.last_price_per_liter,
          COALESCE(p.total_purchased, 0) as total_purchased,
          COALESCE(p.total_amount_paid, 0) as total_amount_paid,
          COALESCE(r.total_refueled, 0) as total_refueled
        FROM gallon_stock g
        LEFT JOIN (
          SELECT gallon_number, 
                 SUM(liters_purchased) as total_purchased,
                 SUM(amount_paid) as total_amount_paid
          FROM fuel_purchases
          WHERE gallon_number = ${input.gallonNumber}
          GROUP BY gallon_number
        ) p ON g.gallon_number = p.gallon_number
        LEFT JOIN (
          -- Soma abastecimentos: fuel_records (antigos sem containers) + fuel_record_containers (novos com múltiplos galões)
          SELECT gallon_number, SUM(liters_used) as total_refueled FROM (
            -- Abastecimentos antigos: registros em fuel_records que NÃO têm containers associados
            SELECT fr.gallon_number, fr.liters as liters_used
            FROM fuel_records fr
            WHERE fr.gallon_number = ${input.gallonNumber}
              AND NOT EXISTS (
                SELECT 1 FROM fuel_record_containers frc WHERE frc.fuel_record_id = fr.id
              )
            UNION ALL
            -- Abastecimentos novos: registros em fuel_record_containers (cada galão usado)
            SELECT frc.gallon_number, frc.liters_used
            FROM fuel_record_containers frc
            WHERE frc.gallon_number = ${input.gallonNumber}
          ) combined
          GROUP BY gallon_number
        ) r ON g.gallon_number = r.gallon_number
        WHERE g.gallon_number = ${input.gallonNumber}
      `) as any;

      const gallon = (Array.isArray(stockResult[0]) ? stockResult[0][0] : stockResult[0]);
      
      if (!gallon) {
        return { gallonNumber: input.gallonNumber, stockLiters: 0, lastPricePerLiter: 0 };
      }
      
      // Estoque = Comprado - Abastecido (valores em centésimos)
      const totalPurchased = Number(gallon.total_purchased) || 0;
      const totalRefueled = Number(gallon.total_refueled) || 0;
      const totalAmountPaid = Number(gallon.total_amount_paid) || 0;
      const stockLiters = (totalPurchased - totalRefueled) / 100;
      
      // Calcular média ponderada do preço por litro: total_gasto / total_litros
      // Se não houver compras, usa o last_price_per_liter como fallback
      const avgPricePerLiter = totalPurchased > 0 
        ? (totalAmountPaid / totalPurchased) // já está em centavos/centésimos, resultado em reais
        : (gallon.last_price_per_liter || 0) / 100;
      
      console.log(`[getGallonStockByNumber] Galão ${input.gallonNumber}: Comprado=${totalPurchased/100}L, Abastecido=${totalRefueled/100}L, Estoque=${stockLiters}L, Preço/L médio=R$${avgPricePerLiter.toFixed(2)}`);
      
      return {
        gallonNumber: gallon.gallon_number,
        stockLiters: stockLiters,
        lastPricePerLiter: avgPricePerLiter, // Agora é média ponderada
        totalPurchased: totalPurchased / 100,
        totalRefueled: totalRefueled / 100,
      };
    }),
});
