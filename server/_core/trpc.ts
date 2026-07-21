import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

// Story 12 (Fase 1, DB-03/SYS-12): ponto único de autorização por papel —
// adminProcedure/employeeProcedure/allowedClientProcedure. Antes,
// server/routers.ts redefinia sua própria cópia de adminProcedure (e as
// únicas definições de employeeProcedure/allowedClientProcedure) em vez de
// usar esta aqui, e ~32 endpoints tinham o check de authz feito inline no
// corpo do handler (`if (!ctx.user || ctx.user.role !== ...)`) em vez de na
// própria procedure — fácil de esquecer num endpoint novo, e cada cópia
// podia divergir da regra "oficial" sem ninguém perceber.
// Nota: passadas como função inline para `.use()` (não pré-construídas via
// `t.middleware(...)`) — só assim o TypeScript infere o ctx já estreitado
// por protectedProcedure (user não-nulo) em vez do TrpcContext genérico de
// novo, que exigiria repetir o `if (!ctx.user)` aqui também.
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
  }
  return next({ ctx });
});

export const employeeProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'employee' && ctx.user.role !== 'admin') {
    throw new TRPCError({ code: "FORBIDDEN", message: "Employee access required" });
  }
  return next({ ctx });
});

// Cliente com email cadastrado (e ativo) em allowed_clients — ou admin, que
// sempre passa. Depende de server/db.ts, então fica aqui (não em db.ts) para
// não empurrar a dependência de tRPC/TRPCError para o módulo de acesso a
// dados.
export const allowedClientProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role === 'admin') {
    return next({ ctx });
  }

  if (!ctx.user.email) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Email não encontrado' });
  }

  const { getAllowedClientByEmail } = await import('../db');
  const allowedClient = await getAllowedClientByEmail(ctx.user.email);
  if (!allowedClient || !allowedClient.isActive) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Seu email não está autorizado a fazer reservas. Entre em contato com o administrador.',
    });
  }

  return next({ ctx });
});
