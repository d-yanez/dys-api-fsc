import { Request, Response, NextFunction } from 'express';
import { pickFields } from '../../../shared/utils/pickFields';

export function applyPartialResponse(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = ((body?: unknown) => {
    const rawFields = req.query.fields;

    let fields: string | string[] | undefined;

    if (typeof rawFields === 'string') {
      fields = rawFields;
    } else if (Array.isArray(rawFields)) {
      // Los query params múltiples se representan como string[]
      fields = rawFields as string[];
    } else {
      fields = undefined;
    }

    const filteredBody = pickFields(body, fields);
    return originalJson(filteredBody);
  }) as typeof res.json;

  next();
}

