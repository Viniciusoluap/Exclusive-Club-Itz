import type { users } from "../drizzle/schema";

type User = typeof users.$inferSelect;

interface AuthRequest {
  user?: User;
  body: {
    clientId?: string;
    documentType?: string;
  };
  file?: {
    buffer: Buffer;
    mimetype: string;
    originalname: string;
    size: number;
  };
}

interface ExpressResponse {
  status(code: number): ExpressResponse;
  json(data: any): void;
}
import { storagePut } from "./storage";

/**
 * Endpoint REST para upload de documentos de clientes
 * POST /api/upload-client-document
 * 
 * Body (multipart/form-data):
 * - file: arquivo (PDF, JPG, PNG)
 * - clientId: ID do cliente
 * - documentType: 'contract' | 'contract2' | 'document'
 */
export async function uploadClientDocument(req: AuthRequest, res: ExpressResponse) {
  try {
    // Validar autenticação
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Validar role (apenas admin)
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Apenas administradores podem fazer upload de documentos" });
    }

    // Validar campos obrigatórios
    const { clientId, documentType } = req.body;
    if (!clientId || !documentType) {
      return res.status(400).json({ error: "clientId e documentType são obrigatórios" });
    }

    // Validar tipo de documento
    const validTypes = ["contract", "contract2", "document"];
    if (!validTypes.includes(documentType)) {
      return res.status(400).json({ error: "documentType deve ser 'contract', 'contract2' ou 'document'" });
    }

    // Validar arquivo
    if (!req.file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    const file = req.file;

    // Validar tipo de arquivo
    const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/jpg"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return res.status(400).json({ error: "Tipo de arquivo inválido. Permitidos: PDF, JPG, PNG" });
    }

    // Validar tamanho (máximo 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return res.status(400).json({ error: "Arquivo muito grande. Tamanho máximo: 10MB" });
    }

    // Gerar nome único para o arquivo
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const extension = file.originalname.split(".").pop() || "pdf";
    const fileKey = `client-documents/${clientId}/${documentType}-${timestamp}-${randomSuffix}.${extension}`;

    // Upload para S3
    const { url } = await storagePut(fileKey, file.buffer, file.mimetype);

    console.log(`[Upload] Documento ${documentType} do cliente ${clientId} enviado com sucesso: ${url}`);

    return res.status(200).json({
      success: true,
      url,
      fileKey,
      documentType,
      clientId,
    });
  } catch (error) {
    console.error("[Upload] Erro ao fazer upload de documento:", error);
    return res.status(500).json({ error: "Erro ao fazer upload de documento" });
  }
}
