import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // Upload receipt endpoint
  app.post('/api/upload-receipt', async (req, res) => {
    try {
      const multer = await import('multer');
      const upload = multer.default({ storage: multer.memoryStorage() });
      
      upload.single('file')(req, res, async (err: any) => {
        if (err) {
          console.error('[upload-receipt] Multer error:', err);
          return res.status(400).json({ error: 'Erro ao processar arquivo' });
        }

        const file = (req as any).file;
        if (!file) {
          return res.status(400).json({ error: 'Nenhum arquivo enviado' });
        }

        try {
          const { storagePut } = await import('../storage');
          const fileKey = `receipts/${Date.now()}-${file.originalname}`;
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

  // tRPC API
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
