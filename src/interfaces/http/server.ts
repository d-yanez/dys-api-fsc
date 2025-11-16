import express from 'express';
import pinoHttp from 'pino-http';
import { env } from '../../infrastructure/config/env';
import { logger } from '../../infrastructure/logger/logger';
import { orderRouter } from './routes/orderRoutes';
import { apiKeyAuth } from './middlewares/apiKeyAuth';

const app = express();

app.use(express.json());

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: req.headers['x-request-id'] ?? undefined
    })
  })
);



// Health abierto
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: env.serviceName,
    env: env.nodeEnv
  });
});
// 🔐 Protección con API Key para todas las rutas
app.use(apiKeyAuth);
app.use('/order', orderRouter);

app.listen(env.port, () => {
  logger.info({ port: env.port }, '🚀 HTTP server listening');
});