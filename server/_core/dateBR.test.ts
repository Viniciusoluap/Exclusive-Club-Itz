/**
 * Fuso das datas de negócio.
 *
 * Bug que motivou estes testes: a tela de backups exibia "em cerca de 3 horas"
 * para um backup recém-iniciado. A coluna é timestamp(mode:'string'), então o
 * MySQL devolve "2026-08-03 01:13:46" sem marcador de fuso; o navegador
 * interpretava como horário local e o instante UTC aparecia adiantado em 3h.
 */

import { describe, expect, it } from "vitest";
import { toIsoUtc, todayInSaoPaulo } from "./dateBR";

describe("toIsoUtc", () => {
  it("trata datetime ingênuo do MySQL como UTC", () => {
    // Era exatamente o caso da tela: 01:13 UTC = 22:13 do dia anterior em SP.
    expect(toIsoUtc("2026-08-03 01:13:46")).toBe("2026-08-03T01:13:46.000Z");
  });

  it("o valor normalizado converte para o horário correto de São Paulo", () => {
    const iso = toIsoUtc("2026-08-03 01:13:46")!;
    const emSaoPaulo = new Date(iso).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    // UTC-3: 01:13 do dia 03 vira 22:13 do dia 02 — no passado, não no futuro.
    expect(emSaoPaulo).toContain("02/08/2026");
    expect(emSaoPaulo).toContain("22:13");
  });

  it("preserva valores que já trazem fuso explícito", () => {
    expect(toIsoUtc("2026-08-03T01:13:46.000Z")).toBe("2026-08-03T01:13:46.000Z");
    expect(toIsoUtc("2026-08-02T22:13:46-03:00")).toBe("2026-08-02T22:13:46-03:00");
  });

  it("aceita Date e devolve ISO", () => {
    expect(toIsoUtc(new Date("2026-08-03T01:13:46.000Z"))).toBe(
      "2026-08-03T01:13:46.000Z",
    );
  });

  it("devolve null para ausente e não quebra com lixo", () => {
    expect(toIsoUtc(null)).toBeNull();
    expect(toIsoUtc(undefined)).toBeNull();
    expect(toIsoUtc("")).toBeNull();
    expect(toIsoUtc("não é data")).toBe("não é data");
  });
});

describe("todayInSaoPaulo", () => {
  it("retorna YYYY-MM-DD", () => {
    expect(todayInSaoPaulo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
