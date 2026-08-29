import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { TrpcContext } from "../_core/context";

const databaseMock = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("../db", () => ({ getDb: databaseMock.getDb }));

import { reportsRouter } from "./reportsRouter";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;
type QueryResult = Record<string, unknown>[];

function createContext(role: AuthenticatedUser["role"]): TrpcContext {
  const user: AuthenticatedUser = {
    id: role === "admin" ? 1 : 2,
    openId: `${role}-user`,
    email: `${role}@example.com`,
    name: role === "admin" ? "Admin User" : "Regular User",
    loginMethod: "manus",
    role,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lastSignedIn: new Date("2026-01-01T00:00:00Z"),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as TrpcContext["res"],
  };
}

/** Cria o encadeamento thenable usado pelas consultas Drizzle do router. */
function queryResult(result: QueryResult, whereSpy: ReturnType<typeof vi.fn>) {
  const chain: any = {
    from: () => chain,
    where: (condition: unknown) => {
      whereSpy(condition);
      return chain;
    },
    groupBy: () => chain,
    orderBy: () => chain,
    limit: () => chain,
    then: (
      resolve: (value: QueryResult) => unknown,
      reject: (reason: unknown) => unknown
    ) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
}

function configureDatabase(
  options: {
    selects?: QueryResult[];
    executes?: QueryResult[];
  } = {}
) {
  const selects = [...(options.selects ?? [])];
  const executes = [...(options.executes ?? [])];
  const whereSpy = vi.fn();
  databaseMock.getDb.mockResolvedValue({
    select: vi.fn(() => queryResult(selects.shift() ?? [], whereSpy)),
    execute: vi.fn(async () => [executes.shift() ?? []]),
  });
  return { whereSpy };
}

const VALID_RANGE = { startDate: "2026-01-01", endDate: "2026-01-31" };

beforeEach(() => {
  databaseMock.getDb.mockReset();
  configureDatabase();
});

describe("reportsRouter", () => {
  describe("financial", () => {
    it("calcula valores financeiros conhecidos usando despesas pagas de reparo", async () => {
      const { whereSpy } = configureDatabase({
        selects: [
          [{ total: 10_000 }],
          [
            { clientEmail: "full@example.com", total: 6_000 },
            { clientEmail: "half@example.com", total: 4_000 },
          ],
          [{ vesselName: "Lancha Teste", total: 10_000 }],
          [
            { clientId: 1, quotaType: "full" },
            { clientId: 2, quotaType: "half" },
          ],
          [
            { id: 1, email: "full@example.com" },
            { id: 2, email: "half@example.com" },
          ],
          [{ total: "25.00" }],
          [{ total: 2_000 }],
          [
            {
              clientEmail: "full@example.com",
              clientName: "Cliente",
              total: 6_000,
            },
          ],
        ],
        executes: [
          [{ total: "100.00" }],
          [{ count: 4 }],
          [{ count: 1 }],
          [{ month: "2026-01", total: "200.00" }],
        ],
      });

      const result = await reportsRouter
        .createCaller(createContext("admin"))
        .financial(VALID_RANGE);

      expect(result).toMatchObject({
        totalRevenue: 200,
        avgTicket: 50,
        revenueByVessel: [{ vesselName: "Lancha Teste", total: 100 }],
        revenueByQuotaType: { full: 60, half: 40 },
        defaultRate: 25,
        maintenanceCost: 25,
        maintenanceVsRevenue: 12.5,
        fuelVsRevenue: 10,
        projections: { days30: 200, days60: 400, days90: 600 },
      });
      expect(result.clientLTV).toEqual([
        { clientEmail: "full@example.com", clientName: "Cliente", total: 60 },
      ]);
      const maintenanceWhere = whereSpy.mock.calls[4][0] as {
        getSQL: () => Parameters<MySqlDialect["sqlToQuery"]>[0];
      };
      const maintenanceQuery = new MySqlDialect().sqlToQuery(
        maintenanceWhere.getSQL()
      );
      expect(maintenanceQuery.params).toEqual([
        "repair",
        "paid",
        "2026-01-01",
        "2026-01-31",
      ]);
      expect(
        Object.values({
          totalRevenue: result.totalRevenue,
          avgTicket: result.avgTicket,
          defaultRate: result.defaultRate,
          maintenanceCost: result.maintenanceCost,
          maintenanceVsRevenue: result.maintenanceVsRevenue,
          fuelVsRevenue: result.fuelVsRevenue,
        }).every(Number.isFinite)
      ).toBe(true);
    });

    it("retorna custo e percentual zero quando não há despesas nem receita", async () => {
      const result = await reportsRouter
        .createCaller(createContext("admin"))
        .financial(VALID_RANGE);

      expect(result.totalRevenue).toBe(0);
      expect(result.maintenanceCost).toBe(0);
      expect(result.maintenanceVsRevenue).toBe(0);
      expect(Number.isFinite(result.maintenanceVsRevenue)).toBe(true);
    });

    it.each([
      [
        { startDate: "inválida", endDate: "2026-01-31" },
        "data inicial inválida",
      ],
      [
        { startDate: "2026-01-01", endDate: "31/01/2026" },
        "data final inválida",
      ],
      [
        { startDate: "2026-02-01", endDate: "2026-01-31" },
        "intervalo invertido",
      ],
    ])("rejeita %s", async range => {
      await expect(
        reportsRouter.createCaller(createContext("admin")).financial(range)
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(databaseMock.getDb).not.toHaveBeenCalled();
    });

    it("nega acesso para não-admin", async () => {
      await expect(
        reportsRouter.createCaller(createContext("user")).financial(VALID_RANGE)
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe.each([
    [
      "executive",
      () => reportsRouter.createCaller(createContext("admin")).executive(),
      () => reportsRouter.createCaller(createContext("user")).executive(),
    ],
    [
      "occupancy",
      () =>
        reportsRouter
          .createCaller(createContext("admin"))
          .occupancy(VALID_RANGE),
      () =>
        reportsRouter
          .createCaller(createContext("user"))
          .occupancy(VALID_RANGE),
    ],
    [
      "clients",
      () =>
        reportsRouter.createCaller(createContext("admin")).clients(VALID_RANGE),
      () =>
        reportsRouter.createCaller(createContext("user")).clients(VALID_RANGE),
    ],
    [
      "maintenance",
      () =>
        reportsRouter
          .createCaller(createContext("admin"))
          .maintenance(VALID_RANGE),
      () =>
        reportsRouter
          .createCaller(createContext("user"))
          .maintenance(VALID_RANGE),
    ],
    [
      "fuel",
      () =>
        reportsRouter.createCaller(createContext("admin")).fuel(VALID_RANGE),
      () => reportsRouter.createCaller(createContext("user")).fuel(VALID_RANGE),
    ],
    [
      "seasonality",
      () =>
        reportsRouter
          .createCaller(createContext("admin"))
          .seasonality(VALID_RANGE),
      () =>
        reportsRouter
          .createCaller(createContext("user"))
          .seasonality(VALID_RANGE),
    ],
  ])("%s", (_name, callAsAdmin, callAsUser) => {
    it("executa deterministicamente para admin com banco controlado", async () => {
      await expect(callAsAdmin()).resolves.toBeDefined();
    });

    it("nega acesso para não-admin", async () => {
      await expect(callAsUser()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
