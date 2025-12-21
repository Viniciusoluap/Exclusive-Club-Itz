import type { Request, Response } from 'express';
import multer from 'multer';
import { storagePut } from './storage';

// Configurar multer para memória (não salvar em disco)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido. Use JPG, PNG ou PDF.'));
    }
  },
});

export const uploadMiddleware = upload.single('photo');

export async function uploadInspectionPhoto(req: Request, res: Response) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { itemName, vesselId } = req.body;
    if (!itemName || !vesselId) {
      return res.status(400).json({ error: 'itemName e vesselId são obrigatórios' });
    }

    // Gerar chave única para o arquivo
    const ext = req.file.originalname.split('.').pop() || 'jpg';
    const fileKey = `inspections/${vesselId}/${Date.now()}-${itemName.replace(/\s+/g, '-')}.${ext}`;

    // Upload para S3
    const { url } = await storagePut(
      fileKey,
      req.file.buffer,
      req.file.mimetype
    );

    return res.json({
      success: true,
      itemName,
      photoUrl: url,
    });
  } catch (error: any) {
    console.error('[uploadInspectionPhoto] Error:', error);
    return res.status(500).json({ error: error.message || 'Erro ao fazer upload' });
  }
}
