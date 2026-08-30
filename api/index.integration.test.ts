import { describe, expect, it } from "vitest";
import * as esbuild from "esbuild";
import { createServer } from "http";
import type { AddressInfo } from "net";
import path from "path";

/**
 * Reproduz, num teste, o mesmo caminho que a Vercel/Manus usam em produção:
 * bundle via esbuild (mesmos flags do script `build`) -> api/index.ts importa
 * o bundle -> handler recebe uma requisição HTTP real, sem cookie de sessão.
 *
 * Existe porque um deploy chegou a servir esse adaptador sem o bundle
 * `api/_server.js` presente (gerado só pelo script de build, nunca versionado),
 * e o sintoma observado foi `/api/trpc/*` respondendo 404 "No procedure
 * found" em vez de 401 — ou seja, o roteador nem chegava a montar as rotas.
 * Este teste falha se isso se repetir: local (com sessão ausente) tem que dar
 * 401, nunca 404.
 *
 * VERCEL=1 antes do import evita que o módulo do servidor dispare o
 * `startServer()` automático (bind de porta, cron jobs) — mesma condição que
 * o ambiente serverless real já impõe.
 */
process.env.VERCEL = "1";

await esbuild.build({
  entryPoints: [
    path.resolve(import.meta.dirname, "..", "server/_core/index.ts"),
  ],
  platform: "node",
  packages: "external",
  bundle: true,
  format: "esm",
  external: ["./vite"],
  outfile: path.resolve(import.meta.dirname, "_server.js"),
});

const { default: handler } = await import("./index");

describe("adaptador serverless (api/index.ts)", () => {
  it("resolve /api/trpc/system.stagingValidationReport sem sessão como 401, nunca 404", async () => {
    const server = createServer((req, res) => {
      void handler(req, res);
    });

    try {
      await new Promise<void>(resolve => server.listen(0, resolve));
      const { port } = server.address() as AddressInfo;

      const response = await fetch(
        `http://127.0.0.1:${port}/api/trpc/system.stagingValidationReport`
      );
      const body = await response.text();

      expect(response.status).toBe(401);
      expect(body).not.toContain("No procedure found");
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});
