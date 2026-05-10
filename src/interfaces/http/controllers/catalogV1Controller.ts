import type { Request, Response } from 'express';
import { logger } from '../../../infrastructure/logger/logger';
import { CatalogUseCase } from '../../../application/use-cases/catalogUseCase';

export class CatalogV1Controller {
  constructor(private readonly useCase: CatalogUseCase) {}

  getBrands = async (_req: Request, res: Response) => {
    try {
      const data = await this.useCase.getBrands();
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ Error in CatalogV1Controller.getBrands');
      return res.status(502).json({ error: 'Error consultando marcas en Falabella Seller Center' });
    }
  };

  getCategoryTree = async (_req: Request, res: Response) => {
    try {
      const data = await this.useCase.getCategoryTree();
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ Error in CatalogV1Controller.getCategoryTree');
      return res.status(502).json({ error: 'Error consultando árbol de categorías en Falabella Seller Center' });
    }
  };

  getCategoryAttributes = async (req: Request, res: Response) => {
    const categoryId = String(req.params.categoryId ?? '').trim();
    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId inválido' });
    }

    try {
      const data = await this.useCase.getCategoryAttributes(categoryId);
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message, categoryId }, '❌ Error in CatalogV1Controller.getCategoryAttributes');
      return res.status(502).json({ error: 'Error consultando atributos de categoría en Falabella Seller Center' });
    }
  };

  getContentScore = async (req: Request, res: Response) => {
    const body = req.body ?? {};
    const categoryId = String((body as any).categoryId ?? (body as any).primaryCategory ?? '').trim();
    if (!categoryId) {
      return res.status(400).json({ error: 'categoryId is required' });
    }

    try {
      const data = await this.useCase.getContentScore(body);
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message, categoryId }, '❌ Error in CatalogV1Controller.getContentScore');
      return res.status(502).json({ error: 'Error consultando content score en Falabella Seller Center' });
    }
  };

  productCreate = async (req: Request, res: Response) => {
    try {
      const data = await this.useCase.productCreate(req.body ?? {});
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ Error in CatalogV1Controller.productCreate');
      return res.status(502).json({ error: 'Error ejecutando ProductCreate en Falabella Seller Center' });
    }
  };

  image = async (req: Request, res: Response) => {
    try {
      const data = await this.useCase.image(req.body ?? {});
      return res.status(200).json(data);
    } catch (err: any) {
      logger.error({ err: err?.message }, '❌ Error in CatalogV1Controller.image');
      return res.status(502).json({ error: 'Error ejecutando Image en Falabella Seller Center' });
    }
  };
}
