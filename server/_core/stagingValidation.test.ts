import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("mysql2/promise", () => ({
  default: {
    createConnection: vi.fn(),
  },
}));

import mysql from "mysql2/promise";
import {
  StagingValidationDisabledError,
  isStagingValidationEnabled,
  runStagingValidation,
} from "./stagingValidation";

describe("isStagingValidationEnabled", () => {
  it("é false por padrão (ausente)", () => {
    expect(isStagingValidationEnabled({})).toBe(false);
  });

  it("é false para qualquer valor que não seja a string exata \"true\"", () => {
    expect(isStagingValidationEnabled({ STAGING_VALIDATION_ENABLED: "1" })).toBe(
      false
    );
    expect(
      isStagingValidationEnabled({ STAGING_VALIDATION_ENABLED: "TRUE" })
    ).toBe(false);
  });

  it("é true só com a string exata \"true\"", () => {
    expect(
      isStagingValidationEnabled({ STAGING_VALIDATION_ENABLED: "true" })
    ).toBe(true);
  });
});

describe("runStagingValidation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.STAGING_VALIDATION_ENABLED;
    delete process.env.STAGING_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  it("recusa quando a flag está desligada, mesmo com STAGING_DATABASE_URL válida", async () => {
    process.env.STAGING_DATABASE_URL =
      "mysql://user:pass@host.test/exclusive_club_staging_candidate";

    await expect(runStagingValidation()).rejects.toThrow(
      StagingValidationDisabledError
    );
    expect(mysql.createConnection).not.toHaveBeenCalled();
  });

  it("recusa quando a flag está ligada mas a URL de staging é igual à ativa", async () => {
    const sameUrl = "mysql://user:pass@host.test/exclusive_club_staging";
    process.env.STAGING_VALIDATION_ENABLED = "true";
    process.env.STAGING_DATABASE_URL = sameUrl;
    process.env.DATABASE_URL = sameUrl;

    await expect(runStagingValidation()).rejects.toThrow(
      "não pode ser a conexão ativa"
    );
    expect(mysql.createConnection).not.toHaveBeenCalled();
  });

  it("com a flag ligada e URL válida, roda só SELECT COUNT(*) e fecha a conexão", async () => {
    process.env.STAGING_VALIDATION_ENABLED = "true";
    process.env.STAGING_DATABASE_URL =
      "mysql://user:pass@host.test/exclusive_club_staging_candidate";

    const queryCalls: string[] = [];
    const end = vi.fn(async () => undefined);
    const query = vi.fn(async (sql: string) => {
      queryCalls.push(sql);
      return [[{ n: 42 }]];
    });
    vi.mocked(mysql.createConnection).mockResolvedValue({
      query,
      end,
    } as unknown as mysql.Connection);

    const report = await runStagingValidation();

    expect(report.counts).toEqual({
      allowed_clients: 42,
      bpo_charges: 42,
      expense_records: 42,
      client_quotas: 42,
    });
    expect(queryCalls).toHaveLength(4);
    for (const sql of queryCalls) {
      expect(sql).toMatch(/^SELECT COUNT\(\*\) AS n FROM `\w+`$/);
    }
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("fecha a conexão mesmo se uma das contagens falhar", async () => {
    process.env.STAGING_VALIDATION_ENABLED = "true";
    process.env.STAGING_DATABASE_URL =
      "mysql://user:pass@host.test/exclusive_club_staging_candidate";

    const end = vi.fn(async () => undefined);
    const query = vi.fn(async () => {
      throw new Error("falha simulada de leitura");
    });
    vi.mocked(mysql.createConnection).mockResolvedValue({
      query,
      end,
    } as unknown as mysql.Connection);

    await expect(runStagingValidation()).rejects.toThrow(
      "falha simulada de leitura"
    );
    expect(end).toHaveBeenCalledTimes(1);
  });
});
