import { FeedStatusRepository } from '../../domain/stocks/feedStatusRepository';
import { FeedStatusResponseDto } from '../dtos/feedStatusDto';

export class GetFeedStatusUseCase {
  constructor(private readonly feedStatusRepository: FeedStatusRepository) {}

  async execute(feedId: string): Promise<FeedStatusResponseDto> {
    const normalizedFeedId = String(feedId ?? '').trim();

    if (!normalizedFeedId || !/^[a-zA-Z0-9-]+$/.test(normalizedFeedId)) {
      throw new Error('Invalid feedId');
    }

    return this.feedStatusRepository.getFeedStatus(normalizedFeedId);
  }
}
