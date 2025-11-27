type FieldsInput = string | string[] | undefined;

function normalizeFields(fields: FieldsInput): string[] {
  if (!fields) {
    return [];
  }

  if (Array.isArray(fields)) {
    return fields
      .flatMap((part) => part.split(','))
      .map((f) => f.trim())
      .filter((f) => f.length > 0);
  }

  return fields
    .split(',')
    .map((f) => f.trim())
    .filter((f) => f.length > 0);
}

function getDeepValue(source: unknown, pathParts: string[]): unknown {
  let current: unknown = source;

  for (const part of pathParts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    current = (current as any)[part];
  }

  return current;
}

function setDeepValue(target: Record<string, unknown>, pathParts: string[], value: unknown): void {
  let current: Record<string, unknown> = target;

  pathParts.forEach((part, index) => {
    const isLast = index === pathParts.length - 1;

    if (isLast) {
      current[part] = value;
      return;
    }

    const existing = current[part];

    if (!existing || typeof existing !== 'object') {
      const next: Record<string, unknown> = {};
      current[part] = next;
      current = next;
    } else {
      current = existing as Record<string, unknown>;
    }
  });
}

function pickFromObject<T>(item: T, fieldPaths: string[]): T {
  if (item === null || item === undefined || typeof item !== 'object') {
    return item;
  }

  const result: Record<string, unknown> = {};

  for (const path of fieldPaths) {
    if (!path) {
      continue;
    }

    const parts = path.split('.');
    const value = getDeepValue(item, parts);

    if (value !== undefined) {
      setDeepValue(result, parts, value);
    }
  }

  return result as T;
}

/**
 * Aplica el patrón Partial Response / Sparse Fieldsets sobre un objeto o lista.
 *
 * - Si `fields` es `undefined` o vacío, devuelve el `data` original.
 * - Si viene algo en `fields`, solo devuelve los campos solicitados.
 * - Soporta paths anidados usando notación de puntos, por ejemplo:
 *   - `fields=orderId,customer.firstName,totals.grandTotal`
 */
export function pickFields<T>(data: T, fields: FieldsInput): T {
  const fieldPaths = normalizeFields(fields);

  if (fieldPaths.length === 0) {
    return data;
  }

  if (Array.isArray(data)) {
    const mapped = data.map((item) => pickFromObject(item, fieldPaths));
    return mapped as unknown as T;
  }

  return pickFromObject(data, fieldPaths);
}

