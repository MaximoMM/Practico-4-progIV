/**
 * Gestión de sesiones.
 *
 * -----------------------------------------------------------------------------
 * FALLA — Gestión de sesiones insegura (Autenticación insegura)
 * -----------------------------------------------------------------------------
 * 1. El identificador de sesión es un contador incremental (`sesion_1`,
 *    `sesion_2`, ...): es PREDECIBLE y adivinable. Un atacante puede recorrer
 *    los valores y usurpar la sesión de otro usuario (fijación de sesión).
 * 2. La cookie se emite SIN `httpOnly` (JavaScript puede leerla), SIN `secure`
 *    (viaja en texto plano por HTTP) y SIN `sameSite` (el navegador la manda
 *    también en peticiones desde otros sitios → facilita CSRF).
 * 3. Las sesiones NO expiran nunca.
 * 4. Al iniciar sesión no se regenera el identificador.
 * 5. El cierre de sesión sólo borra la cookie del cliente: la sesión sigue
 *    viva en el servidor.
 *
 * Corrección: usar crypto.randomUUID() (o crypto.randomBytes -> hex) para el
 * id, con expiración por inactividad y absoluta, cookie con
 * { httpOnly: true, secure: true, sameSite: 'lax' }, regeneración del id tras
 * el login y borrado de la sesión en el servidor al hacer logout.
 * -----------------------------------------------------------------------------
 */

import crypto from 'crypto';
import type { Request, Response } from 'express';

import type { Sesion, UsuarioSesion } from '../tipos';

export const sesiones = new Map<string, Sesion>();

const TTL_INACTIVIDAD_MS = 30 * 60 * 1000; // 30 minutos
const MAX_VIDA_ABSOLUTA_MS = 8 * 60 * 60 * 1000; // 8 horas

/** Lee las cookies de la petición (parser mínimo, sin dependencias). */
export function leerCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (nombre) cookies[nombre] = decodeURIComponent(valor);
  }
  return cookies;
}

/** Crea una sesión nueva para el usuario, regenerando cualquier sid previo, y setea la cookie. */
export function crearSesion(req: Request, res: Response, usuario: UsuarioSesion): string {
  // Regeneración tras el login: invalida cualquier sesión previa (previene session fixation).
  destruirSesion(req);

  const id = crypto.randomBytes(32).toString('hex');
  const ahora = Date.now();

  sesiones.set(id, {
    usuario,
    creadaEn: ahora,
    expiraEn: ahora + TTL_INACTIVIDAD_MS,
  });

  res.cookie('sid', id, {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: TTL_INACTIVIDAD_MS,
  });

  return id;
}

/** Devuelve la sesión de la petición si existe y no expiró. */
export function obtenerSesion(req: Request): Sesion | null {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (!id) return null;

  const sesion = sesiones.get(id);
  if (!sesion) return null;

  const ahora = Date.now();
  const expiroInactividad = sesion.expiraEn !== null && ahora > sesion.expiraEn;
  const expiroAbsoluto = ahora - sesion.creadaEn > MAX_VIDA_ABSOLUTA_MS;

  if (expiroInactividad || expiroAbsoluto) {
    sesiones.delete(id);
    return null;
  }

  // Renueva ventana por inactividad sin superar el máximo absoluto.
  const nuevoVencimiento = Math.min(
    ahora + TTL_INACTIVIDAD_MS,
    sesion.creadaEn + MAX_VIDA_ABSOLUTA_MS
  );
  sesion.expiraEn = nuevoVencimiento;

  return sesion;
}

/** Cierra la sesión en el servidor (debe llamarse en el logout). */
export function destruirSesion(req: Request): void {
  const cookies = leerCookies(req);
  const id = cookies.sid;
  if (id) sesiones.delete(id);
}