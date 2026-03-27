import { StockRepository } from '../../domain/stocks/stockRepository';
import { StockBySkuDto } from '../dtos/stockBySkuDto';

export class GetStockBySkuUseCase {
  constructor(private readonly stockRepository: StockRepository) {}

  async execute(sku: string): Promise<StockBySkuDto> {
    if (!sku || !/^\d+$/.test(sku)) {
      throw new Error('Invalid sku');
    }

    return this.stockRepository.getStockBySku(sku);
  }
}
