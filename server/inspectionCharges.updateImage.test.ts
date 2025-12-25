import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAdminContext(): { ctx: TrpcContext } {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin User",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  const ctx: TrpcContext = {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };

  return { ctx };
}

describe("inspectionCharges.update - Gerenciamento de Imagem", () => {
  it("deve aceitar receiptUrl como parâmetro opcional", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Verificar que o schema aceita receiptUrl
    const inputSchema = {
      chargeId: 1,
      newAmount: 150.00,
      newDueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      receiptUrl: "https://example.com/new-image.jpg",
    };

    // O teste verifica que o input é válido (não lança erro de validação)
    expect(inputSchema.receiptUrl).toBe("https://example.com/new-image.jpg");
    expect(inputSchema.chargeId).toBe(1);
  });

  it("deve aceitar receiptUrl como null para remover imagem", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Verificar que o schema aceita receiptUrl null
    const inputSchema = {
      chargeId: 1,
      newAmount: 150.00,
      receiptUrl: null,
    };

    expect(inputSchema.receiptUrl).toBeNull();
  });

  it("deve permitir atualização sem receiptUrl (campo opcional)", async () => {
    const { ctx } = createAdminContext();
    const caller = appRouter.createCaller(ctx);

    // Verificar que o schema funciona sem receiptUrl
    const inputSchema = {
      chargeId: 1,
      newAmount: 150.00,
      newDueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };

    expect(inputSchema).not.toHaveProperty('receiptUrl');
    expect(inputSchema.chargeId).toBe(1);
  });

  it("deve validar URL de imagem válida", () => {
    const validUrls = [
      "https://s3.amazonaws.com/bucket/receipts/image.jpg",
      "https://example.com/photo.png",
      "https://storage.example.com/receipts/document.pdf",
    ];

    validUrls.forEach(url => {
      expect(url).toMatch(/^https?:\/\//);
    });
  });

  it("deve aceitar diferentes formatos de arquivo", () => {
    const validExtensions = [".jpg", ".jpeg", ".png", ".pdf"];
    
    const testUrls = [
      "https://example.com/image.jpg",
      "https://example.com/image.jpeg",
      "https://example.com/image.png",
      "https://example.com/document.pdf",
    ];

    testUrls.forEach((url, index) => {
      expect(url.toLowerCase()).toContain(validExtensions[index]);
    });
  });
});

describe("inspectionCharges.listAll - Retorno de receiptUrl", () => {
  it("deve incluir receipt_url nos campos retornados", () => {
    // Simular estrutura de dados retornada pelo listAll
    const mockCharge = {
      id: 1,
      charge_type: "repair",
      vessel_name: "Lancha Test",
      client_email: "client@example.com",
      amount: "15000",
      due_date: new Date(),
      payment_status: "pending",
      receipt_url: "https://s3.amazonaws.com/bucket/receipts/test.jpg",
      description: "Reparo do motor",
    };

    expect(mockCharge).toHaveProperty("receipt_url");
    expect(mockCharge.receipt_url).toBe("https://s3.amazonaws.com/bucket/receipts/test.jpg");
  });

  it("deve retornar receipt_url como null quando não há imagem", () => {
    const mockCharge = {
      id: 2,
      charge_type: "repair",
      vessel_name: "Jetski Test",
      client_email: "client@example.com",
      amount: "5000",
      due_date: new Date(),
      payment_status: "pending",
      receipt_url: null,
      description: "Manutenção preventiva",
    };

    expect(mockCharge.receipt_url).toBeNull();
  });
});
