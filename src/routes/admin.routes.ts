import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';;

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import type { Usuario } from '../tipos';

const router = express.Router();

const EXTENSIONES_PERMITIDAS = ['.png', '.jpg', '.jpeg', '.webp'] as const;
const TAMANO_MAX_ARCHIVO = 2 * 1024 * 1024; // 2 MB

/** Verifica los magic numbers reales del archivo para confirmar su tipo MIME. */
function detectarMimeReal(buffer: Buffer): string | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Rutas del panel de administración.
 */
router.use(requiereSesion);
router.use(requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 */
const ROLES_PERMITIDOS = ['admin', 'barista', 'mozo', 'cliente'] as const;

router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};
    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;

    if (rol !== undefined) {
      if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({ error: 'No tenés permisos para modificar roles.' });
      }
      if (!ROLES_PERMITIDOS.includes(rol)) {
        return res.status(400).json({ error: 'Rol no válido.' });
      }
      cambios.rol = rol;
    }

    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    res.json(usuario);
  } catch (err) {
    next(err);
  }
});
/** POST /api/admin/productos — alta de producto. */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    // El nombre del producto es único en la base.
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese nombre.' });
    }
    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(req.params.id, req.body || {});
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }
    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};
    if (!nueva) {
      return res.status(400).json({ error: 'Falta la contraseña nueva.' });
    }
    const usuario = await usuarios.cambiarPassword(req.usuario!.id, nueva);
    res.json({ mensaje: 'Contraseña actualizada.', usuario });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/probar-conexion
 */
const HOSTS_PERMITIDOS = [
  '127.0.0.1',
  'localhost',
  'proveedor-cafe.local',
  'api.mercadopago.com',
];

router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (typeof host !== 'string' || !HOSTS_PERMITIDOS.includes(host)) {
    return res.status(400).json({ error: 'Host no permitido.' });
  }

  const proceso = spawn('ping', ['-c', '3', host], { shell: false });
  let salida = '';
  let errorSalida = '';

  proceso.stdout.on('data', (chunk) => {
    salida += chunk.toString();
  });

  proceso.stderr.on('data', (chunk) => {
    errorSalida += chunk.toString();
  });

  proceso.on('error', (err) => {
    res.status(500).json({ error: err.message });
  });

  proceso.on('close', (code) => {
    res.json({
      comando: `ping -c 3 ${host}`,
      salida,
      error: errorSalida || (code !== 0 ? `El proceso finalizó con código ${code}` : null),
    });
  });
});

/**
 * POST /api/admin/subir-archivo
 * Valida extensión contra lista blanca, MIME real por magic numbers,
 * tamaño máximo y genera un nombre aleatorio para evitar path traversal.
 */
router.post('/subir-archivo', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (typeof nombre !== 'string' || typeof contenidoBase64 !== 'string' || !nombre || !contenidoBase64) {
      return res.status(400).json({ error: 'Falta el archivo.' });
    }

    const extension = path.extname(path.basename(nombre)).toLowerCase();
    if (!EXTENSIONES_PERMITIDAS.includes(extension as (typeof EXTENSIONES_PERMITIDAS)[number])) {
      return res.status(400).json({ error: 'Extensión de archivo no permitida.' });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');
    if (buffer.length === 0 || buffer.length > TAMANO_MAX_ARCHIVO) {
      return res.status(400).json({ error: 'El archivo excede el tamaño máximo permitido (2 MB) o está vacío.' });
    }

    const mimeReal = detectarMimeReal(buffer);
    const mimePorExtension: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
    };

    if (!mimeReal || mimeReal !== mimePorExtension[extension]) {
      return res.status(400).json({ error: 'El contenido del archivo no coincide con una imagen válida.' });
    }

    const carpetaUploads = path.resolve(config.uploadsDir);
    fs.mkdirSync(carpetaUploads, { recursive: true });

    const nombreSeguro = `${crypto.randomUUID()}${extension}`;
    const destino = path.resolve(carpetaUploads, nombreSeguro);
    if (!destino.startsWith(`${carpetaUploads}${path.sep}`)) {
      return res.status(400).json({ error: 'Ruta de destino inválida.' });
    }

    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombreSeguro}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;