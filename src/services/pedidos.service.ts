import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import {
  ErrorValidacion,
  ESTADOS_PEDIDO_PERMITIDOS,
  validarEntero,
  validarListaBlanca,
  validarTexto,
} from '../validacion';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

const MAX_ITEMS_PEDIDO = 30;
const MAX_CANTIDAD_ITEM = 50;

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
export async function crear({ mesa, cliente, items }: NuevoPedido): Promise<PedidoConItems | null> {
  const mesaNormalizada = typeof mesa === 'number' ? String(mesa) : mesa;
  const mesaValida = validarTexto(mesaNormalizada, 1, 20, 'mesa');
  const clienteValido = validarTexto(cliente, 1, 80, 'cliente');

  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS_PEDIDO) {
    throw new ErrorValidacion(
      `El pedido debe contener entre 1 y ${MAX_ITEMS_PEDIDO} items.`
    );
  }

  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new ErrorValidacion('Cada item del pedido debe ser un objeto válido.');
    }

    const productoId = validarEntero(item.productoId, 1, 1_000_000, 'productoId');
    const cantidad = validarEntero(item.cantidad, 1, MAX_CANTIDAD_ITEM, 'cantidad');

    const producto = await buscarProducto(productoId);
    if (!producto) {
      throw new ErrorValidacion('Uno de los productos seleccionados no existe.', 400);
    }

    const precioUnitario = calcularPrecio(producto);
    filas.push({
      productoId: producto.id,
      cantidad,
      precioUnitario,
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesaValida, clienteValido, total]
  );
  const pedido = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [pedido.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(pedido.id);
}

/** Busca un producto por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto | undefined> {
  const { rows } = await db.query<Producto>('SELECT * FROM productos WHERE id = $1', [productoId]);
  return rows[0];
}

/** Lista pedidos (con filtro opcional por mesa). */
export async function listar(mesa?: string): Promise<Pedido[]> {
  let sql = 'SELECT * FROM pedidos';
  const valores: unknown[] = [];

  if (mesa !== undefined && mesa !== '') {
    const mesaValida = validarTexto(mesa, 1, 20, 'mesa');
    sql += ' WHERE mesa = $1';
    valores.push(mesaValida);
  }

  sql += ' ORDER BY id DESC';

  const { rows } = await db.query<Pedido>(sql, valores);
  return rows;
}

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const idValido = validarEntero(id, 1, 1_000_000_000, 'id', true);

  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [idValido]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [idValido]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido. */
export async function cambiarEstado(id: Id, estado: string): Promise<Pedido | null> {
  const idValido = validarEntero(id, 1, 1_000_000_000, 'id', true);
  const estadoValido = validarListaBlanca(estado, ESTADOS_PEDIDO_PERMITIDOS, 'estado');

  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estadoValido, idValido]
  );
  return rows[0] || null;
}