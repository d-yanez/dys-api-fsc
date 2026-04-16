import { ReadyToShipRepository } from '../../domain/status/readyToShipRepository';
import { ReadyToShipRequestDto, ReadyToShipResponseDto } from '../dtos/readyToShipDto';

export class SetStatusToReadyToShipUseCase {
  constructor(private readonly readyToShipRepository: ReadyToShipRepository) {}

  async execute(input: ReadyToShipRequestDto): Promise<ReadyToShipResponseDto> {
    const packageId = String(input.packageId ?? '').trim();
    const rawOrderItemIds = Array.isArray(input.orderItemIds) ? input.orderItemIds : [];

    if (rawOrderItemIds.length === 0) {
      throw new Error('Invalid orderItemIds');
    }

    const orderItemIds = rawOrderItemIds.map((id) => String(id).trim());

    const hasInvalidOrderItemId = orderItemIds.some((id) => !/^\d+$/.test(id));

    if (hasInvalidOrderItemId) {
      throw new Error('Invalid orderItemIds');
    }

    if (!packageId) {
      throw new Error('Invalid packageId');
    }

    return this.readyToShipRepository.setStatusToReadyToShip({
      orderItemIds,
      packageId
    });
  }
}
