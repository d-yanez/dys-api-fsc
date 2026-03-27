export interface FeedStatusResult {
  success: boolean;
  feedId: string;
  status: string;
  action: string | null;
  creationDate: string | null;
  updatedDate: string | null;
  source: string | null;
  totalRecords: number | null;
  processedRecords: number | null;
  failedRecords: number | null;
}

export interface FeedStatusRepository {
  getFeedStatus(feedId: string): Promise<FeedStatusResult>;
}
