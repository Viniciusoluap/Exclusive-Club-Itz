import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { createServer } from "http";
import type { AddressInfo } from "net";
import fs from "fs";
import path from "path";

/**
 * Reproduz, num teste, o mesmo caminho que a Vercel/Manus usam em produção:
 * roda o próprio comando configurado em package.json (não uma cópia dos
 * flags) para gerar api/_server.js -> api/index.ts importa o bundle ->
 * handler recebe uma requisição HTTP real, sem cookie de sessão.
 *
 * Existe porque um deploy chegou a servir esse adaptador sem o bundle
 * `api/_server.js` presente (gerado só pelo script de build, nunca versionado),
 * e o sintoma observado foi `/api/trpc/*` respondendo 404 "No procedure
 * found" em vez de 401 — ou seja, o roteador nem chegava a montar as rotas.
 * Este teste falha se isso se repetir: local (com sessão ausente) tem que dar
 * 401, nunca 404.
 *
 * Extrai e executa o trecho do script `build` que gera api/_server.js (em vez
 * de recriar os flags do esbuild aqui) para que uma regressão no próprio
 * script — flags divergentes, ou a geração do arquivo removida — quebre este
 * teste, não só o script duplicado. Pula só o `vite build` do mesmo script,
 * que não afeta esse artefato e só custaria tempo.
 *
 * VERCEL=1 antes do import evita que o módulo do servidor dispare o
 * `startServer()` automático (bind de porta, cron jobs) — mesma condição que
 * o ambiente serverless real já impõe.
 */
process.env.VERCEL = "1";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pkg = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")
) as { scripts: Record<string, string> };

const apiServerBuildCommand = pkg.scripts.build
  .split("&&")
  .map(segment => segment.trim())
  .find(segment => segment.includes("api/_server.js"));

if (!apiServerBuildCommand) {
  throw new Error(
    "O script `build` do package.json não gera mais api/_server.js — " +
      "o adaptador serverless (api/index.ts) quebraria em produção."
  );
}

execSync(apiServerBuildCommand, { cwd: repoRoot, stdio: "inherit" });

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
