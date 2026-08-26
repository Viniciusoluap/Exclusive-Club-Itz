import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import * as openFinance from "../openFinance";

function rethrow(error: unknown): never {
  if (error instanceof openFinance.OpenFinanceError) {
    const code =
      error.status === 404
        ? "NOT_FOUND"
        : error.status === 400
          ? "BAD_REQUEST"
          : error.status === 503
            ? "PRECONDITION_FAILED"
            : "INTERNAL_SERVER_ERROR";
    throw new TRPCError({ code, message: error.message });
  }
  throw error;
}

async function ownedConnection(
  connectionId: number,
  userId: number,
  isAdmin: boolean
) {
  const connection = isAdmin
    ? await openFinance.getOpenFinanceConnection(connectionId)
    : await openFinance.getOpenFinanceConnectionForUser(connectionId, userId);
  if (!connection) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Conexão Open Finance não encontrada.",
    });
  }
  return connection;
}

export const openFinanceRouter = router({
  /** Lista as conexões do usuário; admin pode auditar todas. */
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      return await openFinance.listOpenFinanceConnections(
        ctx.user.role === "admin" ? undefined : ctx.user.id
      );
    } catch (error) {
      return rethrow(error);
    }
  }),

  /** Cria um token efêmero para o Pluggy Connect Widget. */
  createConnectToken: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        let itemId: string | undefined;
        if (input.connectionId) {
          const connection = await ownedConnection(
            input.connectionId,
            ctx.user.id,
            ctx.user.role === "admin"
          );
          itemId = connection.providerItemId;
        }
        return await openFinance.createPluggyConnectToken(ctx.user.id, itemId);
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** Lista contas bancárias já sincronizadas. */
  accounts: protectedProcedure
    .input(
      z
        .object({ connectionId: z.number().int().positive().optional() })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      try {
        if (input?.connectionId)
          await ownedConnection(
            input.connectionId,
            ctx.user.id,
            ctx.user.role === "admin"
          );
        if (ctx.user.role === "admin")
          return await openFinance.listOpenFinanceAccounts(input?.connectionId);
        const ownConnections = await openFinance.listOpenFinanceConnections(
          ctx.user.id
        );
        const ownIds = new Set(ownConnections.map(connection => connection.id));
        return (
          await openFinance.listOpenFinanceAccounts(input?.connectionId)
        ).filter(account => ownIds.has(account.connectionId));
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** Dispara sincronização completa e idempotente de uma conexão. */
  sync: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await ownedConnection(
          input.connectionId,
          ctx.user.id,
          ctx.user.role === "admin"
        );
        return await openFinance.syncOpenFinanceConnection(
          input.connectionId,
          "manual"
        );
      } catch (error) {
        return rethrow(error);
      }
    }),

  /** Marca a conexão como desconectada localmente. A remoção remota é deliberadamente separada. */
  disconnect: protectedProcedure
    .input(z.object({ connectionId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const connection = await ownedConnection(
        input.connectionId,
        ctx.user.id,
        ctx.user.role === "admin"
      );
      const db = await import("../db").then(module => module.getDb());
      if (!db)
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Banco de dados indisponível.",
        });
      const { openFinanceConnections } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      await db
        .update(openFinanceConnections)
        .set({ status: "disconnected" })
        .where(eq(openFinanceConnections.id, connection.id));
      return { success: true };
    }),

  /** Resumo agregado para o painel administrativo. */
  summary: adminProcedure.query(async () => {
    try {
      return await openFinance.getOpenFinanceSummary();
    } catch (error) {
      return rethrow(error);
    }
  }),
});
