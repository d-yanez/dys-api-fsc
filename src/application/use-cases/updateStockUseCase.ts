import { StockUpdateRepository } from '../../domain/stocks/stockUpdateRepository';
import { UpdateStockRequestDto, UpdateStockResponseDto } from '../dtos/updateStockDto';

export class UpdateStockUseCase {
  constructor(private readonly stockUpdateRepository: StockUpdateRepository) {}

  async execute(input: UpdateStockRequestDto): Promise<UpdateStockResponseDto> {
    const sellerSku = String(input.sellerSku ?? '').trim();
    const quantity = input.quantity;

    if (!sellerSku || !/^\d+$/.test(sellerSku)) {
      throw new Error('Invalid sellerSku');
    }

    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new Error('Invalid quantity');
    }

    return this.stockUpdateRepository.updateStock({
      sellerSku,
      quantity
    });
  }
}
