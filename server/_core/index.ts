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
          console.error('[upload-receipt] S3 upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para S3' });
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
          console.error('[upload-client-document] S3 upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para S3' });
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
          console.error('[upload] S3 upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para S3' });
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
          console.error('[upload-inspection-photo] S3 upload error:', uploadError);
          res.status(500).json({ error: 'Erro ao fazer upload para S3' });
        }
      });
    } catch (error: any) {
      console.error('[upload-inspection-photo] Error:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  });

  // ─── Webhook Asaas (endpoint raw — deve ficar ANTES do middleware tRPC) ───
  // O Asaas envia POST com JSON puro; não usa o protocolo tRPC.
  // Responde 200 imediatamente para evitar penalização.
  app.post('/api/webhooks/asaas', async (req, res) => {
    res.status(200).json({ received: true });
    try {
      const payload = req.body;
      const receivedToken = (req.headers['asaas-access-token'] as string) || '';
      const webhookToken = process.env.ASAAS_WEBHOOK_TOKEN || '';
      console.log('[Webhook Asaas] Evento recebido:', payload?.event, '| ID:', payload?.payment?.id);
      if (!webhookToken) {
        console.error('[Webhook Asaas] ASAAS_WEBHOOK_TOKEN não configurado — rejeitando evento por segurança');
        return;
      }
      if (receivedToken !== webhookToken) {
        console.warn('[Webhook Asaas] Token inválido — ignorando evento');
        return;
      }
      const { event, payment } = payload || {};
      if (!event || !payment?.id) {
        console.warn('[Webhook Asaas] Payload inválido:', JSON.stringify(payload));
        return;
      }
      const relevantEvents = [
        'PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED', 'PAYMENT_OVERDUE',
        'PAYMENT_DELETED', 'PAYMENT_REFUNDED', 'PAYMENT_UPDATED',
      ];
      if (!relevantEvents.includes(event)) {
        console.log('[Webhook Asaas] Evento ignorado:', event);
        return;
      }
      const { normalizeBpoStatus } = await import('../routers/bpoRouter');
      const { getDb } = await import('../db');
      const { sql: drizzleSql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) { console.error('[Webhook Asaas] Database não disponível'); return; }
      const asaasId = String(payment.id);
      const newStatus = normalizeBpoStatus(payment.status || '');
      const isPaid = ['received', 'confirmed', 'receivedInCash'].includes(newStatus);
      const paidDate: Date | null = payment.paymentDate ? new Date(payment.paymentDate) : null;
      const value = payment.value ?? null;
      const amountPaidVal = isPaid && value !== null ? Number(value) : 0;
      const [bpoResult] = (await db.execute(drizzleSql`
        UPDATE bpo_charges
        SET status = ${newStatus}, paid_date = ${paidDate},
            amount_paid = ${amountPaidVal}, synced_at = NOW(), source = 'asaas_webhook'
        WHERE asaas_charge_id = ${asaasId}
      `)) as any;
      const affectedRows = (bpoResult as any)?.affectedRows ?? 0;
      console.log('[Webhook Asaas] bpo_charges atualizado:', asaasId, '->', newStatus, '| rows:', affectedRows);

      // Sincronizar status para inspection_charges e fuel_records
      try {
        const { syncStatusToSources } = await import('../routers/bpoRouter');
        await syncStatusToSources(db, asaasId, newStatus);
      } catch (syncErr: any) {
        console.warn('[Webhook Asaas] Falha ao sincronizar tabelas de origem:', syncErr?.message);
      }

      // Se é pagamento de cobrança CONSOLIDADA, marcar cobranças originais como pagas
      if (isPaid) {
        try {
          const externalRef: string = payment.externalReference || '';
          if (externalRef.startsWith('consolidated-')) {
            // Formato: "consolidated-{ids separados por vírgula}-{timestamp}"
            const parts = externalRef.split('-');
            if (parts.length >= 3) {
              // parts[0] = 'consolidated', parts[1] = ids, parts[n-1] = timestamp
              const idsStr = parts.slice(1, -1).join('-');
              const originalIds = idsStr.split(',').map((s: string) => parseInt(s, 10)).filter((n: number) => !isNaN(n) && n > 0);
              if (originalIds.length > 0) {
                const idsSQL = drizzleSql.join(originalIds.map((id: number) => drizzleSql`${id}`), drizzleSql`, `);
                await db.execute(drizzleSql`
                  UPDATE bpo_charges
                  SET status = 'receivedInCash', paid_date = ${paidDate}, synced_at = NOW(), source = 'asaas_webhook'
                  WHERE id IN (${idsSQL})
                    AND status NOT IN ('receivedInCash','received','confirmed','cancelled')
                `);
                console.log('[Webhook Asaas] Cobranças originais marcadas como pagas:', originalIds.join(','));
                // Sincronizar inspection_charges e fuel_records para cada cobrança original
                const [origRows] = (await db.execute(drizzleSql`
                  SELECT asaas_charge_id FROM bpo_charges WHERE id IN (${idsSQL})
                `)) as any;
                for (const row of (Array.isArray(origRows) ? origRows : [])) {
                  if (row?.asaas_charge_id) {
                    const { syncStatusToSources } = await import('../routers/bpoRouter');
                    await syncStatusToSources(db, row.asaas_charge_id, 'receivedInCash');
                  }
                }
              }
            }
          }
        } catch (consolidatedErr: any) {
          console.warn('[Webhook Asaas] Falha ao processar cobranças consolidadas:', consolidatedErr?.message);
        }
      }
      // Gravar log do webhook para auditoria
      try {
        const payloadStr = JSON.stringify(payload).substring(0, 4000);
        const errorMsg: string | null = affectedRows === 0 ? `Cobrança não encontrada: ${asaasId.substring(0, 100)}` : null;
        await db.execute(drizzleSql`
          INSERT INTO webhook_logs (event, asaas_payment_id, payload, processed, error, created_at)
          VALUES (${event}, ${asaasId}, ${payloadStr}, ${affectedRows > 0 ? 1 : 0}, ${errorMsg}, NOW())
        `);
      } catch (logErr: any) {
        console.warn('[Webhook Asaas] Falha ao gravar log:', logErr?.message);
      }
      console.log('[Webhook Asaas] Processamento concluído para:', asaasId);
    } catch (err: any) {
      console.error('[Webhook Asaas] Erro ao processar:', err?.message || err);
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
