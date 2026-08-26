import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Security headers
  app.use(helmet({ contentSecurityPolicy: false }));

  // Rate limiting
  const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });
  const uploadLimiter  = rateLimit({ windowMs: 15 * 60 * 1000, max: 30,  standardHeaders: true, legacyHeaders: false });
  const webhookLimiter = rateLimit({ windowMs:  1 * 60 * 1000, max: 60,  standardHeaders: true, legacyHeaders: false });
  app.use('/api/trpc', generalLimiter);
  app.use('/api/upload', uploadLimiter);
  app.use('/api/upload-receipt', uploadLimiter);
  app.use('/api/upload-client-document', uploadLimiter);
  app.use('/api/upload-inspection-photo', uploadLimiter);
  app.use('/api/webhooks/asaas', webhookLimiter);
  app.use('/api/webhooks/pluggy', webhookLimiter);

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Helper de autenticação para endpoints Express fora do tRPC
  async function requireAuth(req: any, res: any): Promise<boolean> {
    try {
      await sdk.authenticateRequest(req);
      return true;
    } catch {
      res.status(401).json({ error: 'Não autenticado' });
      return false;
    }
  }

  // Upload receipt endpoint
  app.post('/api/upload-receipt', async (req, res) => {
    if (!await requireAuth(req, res)) return;
    try {
      const multer = await import('multer');
      const upload = multer.default({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('[upload-receipt] Multer error:', err);
          return res.status(400).json({ error: 'Erro ao processar arquivo' });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const allowedReceiptTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedReceiptTypes.includes(file.mimetype)) {
          return res.status(400).json({ error: 'Tipo de arquivo inválido. Permitidos: JPG, PNG, WEBP, PDF' });
        }

        try {
          const { storagePut } = await import('../storage');
          const ext = file.originalname.split('.').pop() || 'jpg';
          const randomSuffix = Math.random().toString(36).substring(2, 15);
          const fileKey = `receipts/${Date.now()}-${randomSuffix}.${ext}`;
          const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
          
          res.json({ url });
        } catch (uploadError: any) {
          console.error('[upload-receipt] storage proxy upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para o storage (proxy Forge)' });
        }
      });
    } catch (error: any) {
      console.error('[upload-receipt] Error:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Upload client document endpoint
  app.post('/api/upload-client-document', async (req, res) => {
    if (!await requireAuth(req, res)) return;
    try {
      const multer = await import('multer');
      const upload = multer.default({ 
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      });
      
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('[upload-client-document] Multer error:', err);
          return res.status(400).json({ error: 'Erro ao processar arquivo' });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const { clientId, documentType } = req.body;
        if (!clientId || !documentType) {
          return res.status(400).json({ error: 'clientId e documentType são obrigatórios' });
        }

        // Validar tipo de documento
        const validTypes = ['contract', 'contract2', 'document'];
        if (!validTypes.includes(documentType)) {
          return res.status(400).json({ error: "documentType deve ser 'contract', 'contract2' ou 'document'" });
        }

        // Validar tipo de arquivo
        const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedMimeTypes.includes(file.mimetype)) {
          return res.status(400).json({ error: 'Tipo de arquivo inválido. Permitidos: PDF, JPG, PNG' });
        }

        try {
          const { storagePut } = await import('../storage');
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const extension = file.originalname.split('.').pop() || 'pdf';
          const fileKey = `client-documents/${clientId}/${documentType}-${timestamp}-${randomSuffix}.${extension}`;
          const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
          
          console.log(`[Upload] Documento ${documentType} do cliente ${clientId} enviado: ${url}`);
          res.json({ success: true, url, fileKey, documentType, clientId });
        } catch (uploadError: any) {
          console.error('[upload-client-document] storage proxy upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para o storage (proxy Forge)' });
        }
      });
    } catch (error: any) {
      console.error('[upload-client-document] Error:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Generic upload endpoint for fuel record photos
  app.post('/api/upload', async (req, res) => {
    if (!await requireAuth(req, res)) return;
    try {
      const multer = await import('multer');
      const upload = multer.default({ 
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      });
      
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('[upload] Multer error:', err);
          return res.status(400).json({ error: 'Erro ao processar arquivo' });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const ALLOWED_FOLDERS = ['uploads', 'photos', 'receipts', 'vessels', 'inspections', 'gallery'];
        const ALLOWED_UPLOAD_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
        const { folder } = req.body;
        const folderPath = ALLOWED_FOLDERS.includes(folder) ? folder : 'uploads';

        if (!ALLOWED_UPLOAD_TYPES.includes(file.mimetype)) {
          return res.status(400).json({ error: 'Tipo de arquivo inválido. Permitidos: JPG, PNG, WEBP, PDF' });
        }

        try {
          const { storagePut } = await import('../storage');
          const ext = file.originalname.split('.').pop() || 'jpg';
          const randomSuffix = Math.random().toString(36).substring(2, 15);
          const fileKey = `${folderPath}/${Date.now()}-${randomSuffix}.${ext}`;
          const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
          
          console.log(`[upload] File uploaded successfully: ${fileKey}`);
          res.json({ success: true, url, key: fileKey });
        } catch (uploadError: any) {
          console.error('[upload] storage proxy upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para o storage (proxy Forge)' });
        }
      });
    } catch (error: any) {
      console.error('[upload] Error:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // Upload inspection photo endpoint
  app.post('/api/upload-inspection-photo', async (req, res) => {
    if (!await requireAuth(req, res)) return;
    try {
      const multer = await import('multer');
      const upload = multer.default({ 
        storage: multer.memoryStorage(),
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
      });
      
      upload.single('photo')(req, res, async (err: any) => {
        if (err) {
          console.error('[upload-inspection-photo] Multer error:', err);
          return res.status(400).json({ error: 'Erro ao processar arquivo' });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        const { itemName, vesselId } = req.body;
        if (!itemName || !vesselId) {
          return res.status(400).json({ error: 'itemName e vesselId são obrigatórios' });
        }

        const allowedInspectionTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowedInspectionTypes.includes(file.mimetype)) {
          return res.status(400).json({ error: 'Apenas imagens são permitidas (JPG, PNG, WEBP)' });
        }

        try {
          const { storagePut } = await import('../storage');
          const ext = file.originalname.split('.').pop() || 'jpg';
          const fileKey = `inspections/${vesselId}/${Date.now()}-${itemName.replace(/\s+/g, '-')}.${ext}`;
          const { url } = await storagePut(fileKey, file.buffer, file.mimetype);
          
          res.json({ success: true, itemName, photoUrl: url });
        } catch (uploadError: any) {
          console.error('[upload-inspection-photo] storage proxy upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para o storage (proxy Forge)' });
        }
      });
    } catch (error: any) {
      console.error('[upload-inspection-photo] Error:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // ─── Webhook Asaas (endpoint raw — deve ficar ANTES do middleware tRPC) ───
  // O Asaas envia POST com JSON puro; não usa o protocolo tRPC.
  // Story 9 (Fase 1, SYS-19): NÃO responde 200 antecipado — aguarda o
  // resultado real do processamento (idempotente e atômico, ver
  // ./asaasWebhookHandler.ts) e só então escolhe o status HTTP. Um erro de
  // processamento deve reportar falha ao Asaas (que reenvia), não mascarar
  // com 200 como antes.
  app.post('/api/webhooks/asaas', async (req, res) => {
    const receivedToken = (req.headers['asaas-access-token'] as string) || '';
    const { processAsaasWebhookEvent } = await import('./asaasWebhookHandler');
    const result = await processAsaasWebhookEvent(req.body, receivedToken);

    if (result.accepted) {
      res.status(200).json({ received: true, duplicate: result.duplicate ?? false });
      return;
    }

    switch (result.rejectReason) {
      case 'invalid_token':
        res.status(401).json({ error: 'Token inválido' });
        return;
      case 'invalid_payload':
        res.status(400).json({ error: 'Payload inválido' });
        return;
      case 'database_unavailable':
      case 'internal_error':
      default:
        res.status(500).json({ error: 'Erro ao processar webhook' });
        return;
    }
  });

  // ─── Webhook Pluggy/Open Finance ───
  // A Pluggy exige resposta 2XX em menos de 5 segundos. Primeiro registramos
  // o eventId de forma idempotente, respondemos, e só depois processamos a
  // sincronização da conexão. O segredo é configurado como header customizado
  // no webhook da Pluggy e nunca fica exposto no frontend.
  app.post('/api/webhooks/pluggy', async (req, res) => {
    const headerSecret = (req.headers['x-pluggy-webhook-secret'] as string) || '';
    const { validatePluggyWebhookSecret, registerPluggyWebhookEvent, processPluggyWebhookEvent } = await import('../openFinance');
    if (!validatePluggyWebhookSecret(headerSecret)) {
      res.status(401).json({ error: 'Webhook não autorizado' });
      return;
    }

    try {
      const registration = await registerPluggyWebhookEvent(req.body);
      res.status(200).json({ received: true, duplicate: registration.duplicate });
      if (!registration.duplicate) {
        void processPluggyWebhookEvent(registration.eventId, req.body).catch((error) => {
          console.error('[Pluggy webhook] Falha no processamento assíncrono:', error);
        });
      }
    } catch (error: any) {
      const status = error?.code === 'INVALID_WEBHOOK' ? 400 : 500;
      res.status(status).json({ error: status === 400 ? 'Payload inválido' : 'Erro ao registrar webhook' });
    }
  });

  // tRPC API
  // Backup download route
  const { downloadBackupRoute } = await import('../downloadBackupRoute');
  app.get('/api/backup/download/:id', downloadBackupRoute);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

// Migrações do banco na subida do servidor.
//
// A hospedagem publica o código mas não roda migrações — isso já custou dois
// defeitos nesta auditoria, cada um contornado com um DDL avulso dentro do
// código de negócio. Ver server/_core/autoMigrate.ts para o porquê da adoção
// de baseline, que é o que torna isto seguro num banco que já tem dados.
import("../_core/autoMigrate").then(async ({ aplicarMigracoesPendentes }) => {
  const { getDb } = await import("../db");
  const db = await getDb();
  const path = await import("path");
  const resultado = await aplicarMigracoesPendentes(db, path.resolve(process.cwd(), "drizzle"));

  (globalThis as any).__ultimaMigracao = resultado;

  if (resultado.marcadasSemExecutar.length > 0) {
    console.log(
      `[autoMigrate] Banco existente adotado: ${resultado.marcadasSemExecutar.length} migração(ões) ` +
        `marcada(s) como aplicada(s) sem executar DDL.`,
    );
  }
  if (resultado.aplicadas.length > 0) {
    console.log(`[autoMigrate] Aplicadas: ${resultado.aplicadas.join(", ")}`);
  }
  if (resultado.erro) {
    console.error(`[autoMigrate] Pendência: ${resultado.erro}`);
  }
}).catch(err => console.error("[autoMigrate] Falha ao registrar:", err));

// Registrar cron jobs (sincronização BPO às 03:00, reconciliação às 04:00, mensalidades às 00:30)
import("../cronJobs").then(({ registerCronJobs }) => {
  registerCronJobs();
}).catch(err => console.error("[CronJobs] Falha ao registrar:", err));

// Job diário: atualizar cobranças vencidas para status 'overdue' às 00:05
import("../jobs/updateOverdueStatus").then(({ scheduleUpdateOverdueStatus, runUpdateOverdueStatus }) => {
  scheduleUpdateOverdueStatus();
  // Executar imediatamente na inicialização para corrigir registros históricos
  runUpdateOverdueStatus().catch(err => console.error("[updateOverdueStatus] Erro na execução inicial:", err));
}).catch(err => console.error("[updateOverdueStatus] Falha ao registrar job:", err));

// Backup do BANCO: automático uma vez por dia, às 03:00 (São Paulo).
// O botão da tela continua livre para quantos backups manuais se quiser.
import("../jobs/scheduledBackup").then(({ scheduleDailyBackup }) => {
  scheduleDailyBackup();
}).catch(err => console.error("[backupDiario] Falha ao registrar job:", err));

// Backup dos ANEXOS (fotos e documentos): automático uma vez por semana,
// domingo às 04:00 — depois do backup do banco, para não competirem pela
// instância. Fazer isso pelo botão da tela dependia de uma requisição HTTP que
// o proxy encerrava no meio (HTTP 503); aqui não há requisição para estourar
// nem tela para manter aberta. O botão continua livre para antecipar.
import("../jobs/archiveAttachments").then(({ scheduleArchiveAttachments }) => {
  scheduleArchiveAttachments();
}).catch(err => console.error("[archiveAttachments] Falha ao registrar job:", err));
