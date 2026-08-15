/**
 * A data do registro de abastecimento tem que ser a data de Brasília.
 *
 * POR QUE UM ARQUIVO SÓ PARA ISSO: a linha corrigida só é executada para
 * registros COM FOTO, e a trava de regressão dos PDFs não cobre esse caminho —
 * baixar foto exigiria rede dentro do teste, o que traria instabilidade. Em vez
 * de fingir cobertura, a regra foi extraída para uma função e é testada aqui,
 * de forma direta.
 *
 * O caso que importa é o da madrugada. Em qualquer outro horário as duas datas
 * coincidem, e um teste que só usasse horário comercial aprovaria o defeito.
 */

// O teste precisa rodar num fuso conhecido: é a máquina que estava mandando na
// data antes da correção, e é justamente isso que não pode mais acontecer.
process.env.TZ = "UTC";

import { describe, expect, it } from "vitest";
import { dataDoRegistro } from "./fuelRecordPDF";

describe("data do registro de abastecimento", () => {
  it("usa o dia de Brasília, não o da máquina", () => {
    // 02:00 UTC = 23:00 do dia anterior em Brasília.
    // Antes da correção este registro saía como 17/03 — um dia à frente do que
    // o clube registrou.
    expect(dataDoRegistro("2026-03-17T02:00:00.000Z")).toBe("16/03/2026");
  });

  it("mantém o dia quando o horário não cruza a meia-noite", () => {
    expect(dataDoRegistro("2026-03-15T13:00:00.000Z")).toBe("15/03/2026");
  });

  it("funciona no limite exato da virada em Brasília", () => {
    // 03:00 UTC é exatamente 00:00 em Brasília: já é o dia novo.
    expect(dataDoRegistro("2026-03-17T03:00:00.000Z")).toBe("17/03/2026");
    // Um segundo antes ainda é o dia anterior.
    expect(dataDoRegistro("2026-03-17T02:59:59.000Z")).toBe("16/03/2026");
  });

  it("aceita objeto Date, não só texto", () => {
    expect(dataDoRegistro(new Date("2026-03-17T02:00:00.000Z"))).toBe("16/03/2026");
  });

  it("NÃO depende do fuso da máquina", () => {
    // A prova de que a correção pegou: o resultado é o mesmo com o processo em
    // UTC. Sem o fuso explícito, esta mesma data daria 17/03 aqui e 16/03 numa
    // máquina em Brasília.
    const semFuso = new Date("2026-03-17T02:00:00.000Z").toLocaleDateString("pt-BR");

    expect(semFuso).toBe("17/03/2026"); // o que o código fazia antes
    expect(dataDoRegistro("2026-03-17T02:00:00.000Z")).toBe("16/03/2026"); // o que faz agora
  });
});
