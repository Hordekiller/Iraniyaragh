export const PRODUCT_MEDIA_PROCESSING_QUEUE = Symbol('PRODUCT_MEDIA_PROCESSING_QUEUE');

export interface ProductMediaProcessingQueue {
  /** Enqueue is idempotent by mediaId; adapters must use mediaId as the stable job id. */
  enqueue(input: { mediaId: string; objectKey: string }): Promise<void>;
}
