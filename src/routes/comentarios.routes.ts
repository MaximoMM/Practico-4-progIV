import express from 'express';
import * as comentarios from '../services/comentarios.service';
import { validarEntero, validarTexto } from '../validacion';

const router = express.Router();

/**
 * GET /api/comentarios — reseñas públicas de la cafetería.
 */
router.get('/', async (req, res, next) => {
  try {
    res.json({ comentarios: await comentarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comentarios
 * Valida longitud, tipo y rango de autor, texto y calificación en el servidor.
 */
router.post('/', async (req, res, next) => {
  try {
    const { autor, texto, calificacion } = req.body || {};

    const autorValido = validarTexto(autor, 2, 40, 'autor');
    const textoValido = validarTexto(texto, 3, 280, 'texto');
    const calificacionValida = validarEntero(calificacion, 1, 5, 'calificacion');

    const comentario = await comentarios.crear({
      autor: autorValido,
      texto: textoValido,
      calificacion: calificacionValida,
    });
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/comentarios/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    const idValido = validarEntero(req.params.id, 1, 1_000_000_000, 'id', true);
    const comentario = await comentarios.eliminar(idValido);
    if (!comentario) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }
    res.json(comentario);
  } catch (err) {
    next(err);
  }
});

export default router;