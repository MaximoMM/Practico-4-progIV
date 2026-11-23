import crypto from 'crypto';
import path from 'path';

function resolverPasswordDefecto(): string {
  const desdeEnv = process.env.DEFAULT_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD;
  if (typeof desdeEnv === 'string' && desdeEnv.length >= 8) {
    return desdeEnv;
  }
  return crypto.randomBytes(18).toString('base64url');
}

/**
 * Configuración de la aplicación.
 */
export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    user: process.env.DB_USER || 'origen_app',
    password: process.env.DB_PASSWORD || '',
  },

  sessionSecret: process.env.SESSION_SECRET || crypto.randomUUID(),

  credencialesPorDefecto: {
    username: process.env.DEFAULT_ADMIN_USERNAME || 'admin',
    password: resolverPasswordDefecto(),
  },

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};