export interface FeedStatusResponseDto {
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
