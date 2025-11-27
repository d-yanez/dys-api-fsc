import express from 'express';
import pinoHttp from 'pino-http';
import { env } from '../../infrastructure/config/env';
import { logger } from '../../infrastructure/logger/logger';
import { orderRouter } from './routes/orderRoutes';
import { apiKeyAuth } from './middlewares/apiKeyAuth';
import { orderItemsRouter } from './routes/orderItemsRoutes';
import { productRouter } from './routes/productRoutes';
import { documentRouter } from './routes/documentRoutes';
import { applyPartialResponse } from './middlewares/partialResponse';

const app = express();

app.use(express.json());

app.use(
  pinoHttp({
    logger,
    customProps: (req) => ({
      requestId: req.headers['x-request-id'] ?? undefined
    }),
    serializers: {
      // Serializador defensivo para no reventar en logs
      req(req) {
        // pino-http puede pasar distintos tipos de request, así que usamos "any"
        const r: any = req as any;
        const remoteAddress =
          r.ip ??
          r.socket?.remoteAddress ??
          r.connection?.remoteAddress ??
          undefined;

        return {
          method: r.method,
          url: r.url,
          query: r.query,
          params: r.params,
          remoteAddress
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode
        };
      }
    }
  })
);

// Aplica Partial Response / Sparse Fieldsets a todas las respuestas JSON
app.use(applyPartialResponse);
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
app.use('/orderItems', orderItemsRouter);
app.use("/sku", productRouter);
app.use("/label", documentRouter); // quedará: GET /label/order/:orderId

app.listen(env.port, () => {
  logger.info({ port: env.port }, '🚀 HTTP server listening');
});
