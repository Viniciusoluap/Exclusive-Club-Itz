import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(),
  mutationOptions: undefined as undefined | { onSuccess?: () => Promise<void> },
  status: {
    status: "completed" as const,
    result: {
      mode: "dry-run" as const,
      customers: { total: 42 },
      payments: {
        total: 3163,
        matchedLocalClients: 3000,
        unmatchedLocalClients: 163,
      },
      warnings: { total: 2 },
    },
  },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      system: { asaasStagingDryRunStatus: { invalidate: mocks.invalidate } },
    }),
    system: {
      asaasStagingDryRunStatus: {
        useQuery: () => ({ data: mocks.status }),
      },
      asaasStagingDryRun: {
        useMutation: (options: { onSuccess?: () => Promise<void> }) => {
          mocks.mutationOptions = options;
          return { mutate: vi.fn(), isPending: false, isError: false };
        },
      },
    },
  },
}));

import { AsaasStagingDryRunCard } from "./AsaasStagingDryRunCard";

describe("painel do dry-run Asaas", () => {
  beforeEach(() => {
    mocks.invalidate.mockClear();
    mocks.mutationOptions = undefined;
  });

  it("invalida status após mutation e renderiza só o resumo agregado", async () => {
    const html = renderToStaticMarkup(<AsaasStagingDryRunCard />);
    await mocks.mutationOptions?.onSuccess?.();

    expect(mocks.invalidate).toHaveBeenCalledOnce();
    expect(html).toContain("Clientes Asaas:");
    expect(html).toContain("3.163");
    expect(html).toContain("Sem vínculo local:");
    expect(html).not.toContain("nome-cliente");
    expect(html).not.toContain("cliente@example.com");
    expect(html).not.toContain("pay_123");
  });
});
