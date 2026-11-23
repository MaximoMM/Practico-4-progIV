import * as db from '../db';
import type { Comentario } from '../tipos';

/** Datos de una reseña nueva, tal como llegan en el cuerpo de la petición. */
export interface NuevoComentario {
  autor: string;
  texto: string;
  calificacion: number;
}

const MAX_AUTOR_LEN = 60;
const MAX_TEXTO_LEN = 500;
const CALIFICACION_MIN = 1;
const CALIFICACION_MAX = 5;

function limpiarTextoPlano(valor: unknown, maxLen: number, nombreCampo: string): string {
  if (typeof valor !== 'string') {
    throw new Error(`El campo "${nombreCampo}" debe ser un texto válido.`);
  }

  const normalizado = valor.replace(/\s+/g, ' ').trim();
  if (!normalizado) {
    throw new Error(`El campo "${nombreCampo}" no puede estar vacío.`);
  }
  if (normalizado.length > maxLen) {
    throw new Error(`El campo "${nombreCampo}" supera el límite de ${maxLen} caracteres.`);
  }
  // Evita caracteres de control no imprimibles (excepto espacio normal)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(normalizado)) {
    throw new Error(`El campo "${nombreCampo}" contiene caracteres no permitidos.`);
  }

  return normalizado;
}

function validarCalificacion(valor: unknown): number {
  const num = Number(valor);
  if (!Number.isInteger(num) || num < CALIFICACION_MIN || num > CALIFICACION_MAX) {
    throw new Error(`La calificación debe ser un número entero entre ${CALIFICACION_MIN} y ${CALIFICACION_MAX}.`);
  }
  return num;
}

/** Lista todos los comentarios, del más nuevo al más viejo. */
export async function listar(): Promise<Comentario[]> {
  const { rows } = await db.query<Comentario>(
    'SELECT * FROM comentarios ORDER BY id DESC'
  );
  return rows;
}

/** Crea un comentario validando longitud, formato y calificación. */
export async function crear({ autor, texto, calificacion }: NuevoComentario): Promise<Comentario> {
  const autorLimpio = limpiarTextoPlano(autor, MAX_AUTOR_LEN, 'autor');
  const textoLimpio = limpiarTextoPlano(texto, MAX_TEXTO_LEN, 'texto');
  const calificacionValida = validarCalificacion(calificacion);

  const { rows } = await db.query<Comentario>(
    `INSERT INTO comentarios (autor, texto, calificacion)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [autorLimpio, textoLimpio, calificacionValida]
  );
  return rows[0];
}

/** Elimina un comentario. */
export async function eliminar(id: number | string): Promise<Comentario | null> {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) return null;

  const { rows } = await db.query<Comentario>(
    'DELETE FROM comentarios WHERE id = $1 RETURNING *',
    [idNum]
  );
  return rows[0] || null;
}