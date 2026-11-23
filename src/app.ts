import path from 'path';
import crypto from 'crypto';
import express from 'express';
import helmet from 'helmet';

import config from './config';
import { leerCookies } from './middleware/sesion';
import { rutaNoEncontrada, manejadorErrores } from './middleware/errores';
import authRoutes from './routes/auth.routes';
import productosRoutes from './routes/productos.routes';
import pedidosRoutes from './routes/pedidos.routes';
import reportesRoutes from './routes/reportes.routes';
import comentariosRoutes from './routes/comentarios.routes';
import adminRoutes from './routes/admin.routes';
import debugRoutes from './routes/debug.routes';

const app = express();

const METODOS_MUTACION = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function origenPermitido(req: express.Request): boolean {
  const hostEsperado = (req.get('x-forwarded-host') || req.get('host') || '').trim().toLowerCase();
  if (!hostEsperado) return false;

  const originHeader = req.get('origin');
  if (originHeader) {
    try {
      const parsedOrigin = new URL(originHeader);
      return parsedOrigin.host.toLowerCase() === hostEsperado;
    } catch {
      return false;
    }
  }

  const refererHeader = req.get('referer');
  if (refererHeader) {
    try {
      const parsedReferer = new URL(refererHeader);
      return parsedReferer.host.toLowerCase() === hostEsperado;
    } catch {
      return false;
    }
  }

  // Si no se envía Origin ni Referer (por ejemplo en pruebas automatizadas o peticiones server-to-server),
  // se deja pasar a la siguiente validación (token anti-CSRF).
  return true;
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Archivos subidos por el panel de administración.
app.use('/uploads', express.static(config.uploadsDir));

// Sitio web estático
app.use(express.static(path.join(__dirname, 'public')));

// --- Token anti-CSRF (Double-Submit Cookie) ---------------------------------
app.get('/api/csrf-token', (req, res) => {
  const cookies = leerCookies(req);
  const token = cookies.csrf || crypto.randomBytes(24).toString('hex');

  res.cookie('csrf', token, {
    path: '/',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });

  res.json({ token, csrfToken: token });
});

app.use('/api', (req, res, next) => {
  if (!METODOS_MUTACION.has(req.method)) return next();

  if (!origenPermitido(req)) {
    return res.status(403).json({ error: 'Origen de la petición no permitido (CSRF).' });
  }

  if (req.path === '/auth/login') return next();

  const cookies = leerCookies(req);
  const tokenCookie = cookies.csrf;
  const tokenEnviado =
    req.get('x-csrf-token') ||
    (req.body && typeof req.body._csrf === 'string' ? req.body._csrf : undefined) ||
    (typeof req.query._csrf === 'string' ? req.query._csrf : undefined);

  if (!tokenCookie || !tokenEnviado || tokenCookie !== tokenEnviado) {
    return res.status(403).json({ error: 'Token anti-CSRF inválido o ausente.' });
  }

  return next();
});

// --- API --------------------------------------------------------------------
app.get('/api/salud', (req, res) => {
  res.json({ ok: true, servicio: 'cafeteria-origen', hora: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/comentarios', comentariosRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/_diagnostico', debugRoutes);

app.use('/api', rutaNoEncontrada);

app.use(manejadorErrores);

export default app;