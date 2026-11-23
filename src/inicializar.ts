import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as db from './db';
import { CATALOGO } from './catalogo';
import type { Rol } from './tipos';

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

const SALT_ROUNDS = 12;

function resolverPasswordInicial(envKey: string): string {
  const desdeEnv = process.env[envKey];
  if (typeof desdeEnv === 'string' && desdeEnv.length >= 8) {
    return desdeEnv;
  }
  // Genera una clave aleatoria por ejecución si no se provee por entorno
  // (evita tener contraseñas triviales fijas como "admin" o "cliente" en el código).
  return crypto.randomBytes(18).toString('base64url');
}

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: resolverPasswordInicial('SEED_ADMIN_PASSWORD'),
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: resolverPasswordInicial('SEED_VALENTINA_PASSWORD'),
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: resolverPasswordInicial('SEED_BARISTA_PASSWORD'),
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: resolverPasswordInicial('SEED_MOZO_PASSWORD'),
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: resolverPasswordInicial('SEED_CLIENTE_PASSWORD'),
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  for (const usuario of USUARIOS_INICIALES) {
    const hash = await bcrypt.hash(usuario.password, SALT_ROUNDS);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO UPDATE
         SET password = EXCLUDED.password
       WHERE usuarios.password NOT LIKE '$2%'`,
      [usuario.username, hash, usuario.rol, usuario.nombre]
    );
  }

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}