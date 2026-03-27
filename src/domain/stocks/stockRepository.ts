import { StockBySku } from './stock';

export interface StockRepository {
  getStockBySku(sku: string): Promise<StockBySku>;
}
