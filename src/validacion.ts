export class ErrorValidacion extends Error {
  public readonly status: number;

  constructor(mensaje: string, status = 400) {
    super(mensaje);
    this.name = 'ErrorValidacion';
    this.status = status;
  }
}

export const ESTADOS_PEDIDO_PERMITIDOS = [
  'abierto',
  'preparando',
  'listo',
  'entregado',
  'cancelado',
] as const;

export function validarEntero(
  valor: unknown,
  min: number,
  max: number,
  campo: string,
  permitirString = false
): number {
  let numero: number;

  if (typeof valor === 'number') {
    numero = valor;
  } else if (permitirString && typeof valor === 'string' && /^\d+$/.test(valor.trim())) {
    numero = Number(valor.trim());
  } else {
    throw new ErrorValidacion(`El campo "${campo}" debe ser un número entero válido.`);
  }

  if (!Number.isInteger(numero) || numero < min || numero > max) {
    throw new ErrorValidacion(
      `El campo "${campo}" debe ser un entero entre ${min} y ${max}.`
    );
  }

  return numero;
}

export function validarTexto(
  valor: unknown,
  min: number,
  max: number,
  campo: string
): string {
  if (typeof valor !== 'string') {
    throw new ErrorValidacion(`El campo "${campo}" debe ser una cadena de texto.`);
  }

  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw new ErrorValidacion(
      `El campo "${campo}" debe tener entre ${min} y ${max} caracteres.`
    );
  }

  return limpio;
}

export function validarListaBlanca<T extends string>(
  valor: unknown,
  permitidos: readonly T[],
  campo: string
): T {
  if (typeof valor !== 'string' || !permitidos.includes(valor as T)) {
    throw new ErrorValidacion(
      `El valor del campo "${campo}" no está dentro de los valores permitidos.`
    );
  }
  return valor as T;
}