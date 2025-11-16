import { Request, Response, NextFunction } from 'express';
import { logger } from '../../../infrastructure/logger/logger';

export function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  const validKey = process.env.API_KEY;

  if (!validKey) {
    logger.error("❌ API_KEY no está configurada en variables de entorno");
    return res.status(500).json({ error: "Server misconfiguration" });
  }

  if (!apiKey || apiKey !== validKey) {
    logger.warn({ ip: req.ip }, "🔐 Intento de acceso con API Key inválida");
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}