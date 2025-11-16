import dotenv from 'dotenv';

dotenv.config();

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 8080),
  serviceName: process.env.SERVICE_NAME ?? 'dys-api-fsc',

  // Seller Center
  scEndpoint: (process.env.SC_ENDPOINT ?? 'https://sellercenter-api.falabella.com').replace(/\/+$/, ''),
  scUserId: process.env.SC_USER_ID ?? '',
  scApiKey: process.env.SC_API_KEY ?? '',
  scVersion: process.env.SC_VERSION ?? '1.0',
  // ⚠️ Recomendado: usar JSON para simplificar el parsing.
  scFormat: process.env.SC_FORMAT ?? 'JSON',
  scUserAgent: process.env.SC_USER_AGENT ?? 'DYSHOPNOW/dys-api-fsc',

  logLevel: process.env.LOG_LEVEL ?? 'info'
};

if (!env.scUserId || !env.scApiKey) {
  // En Cloud Run igual se verá en logs
  // y es mejor morir temprano que fallar en runtime.
  // En local también te avisará al levantar.
  console.error('❌ Faltan variables de entorno: SC_USER_ID o SC_API_KEY');
}