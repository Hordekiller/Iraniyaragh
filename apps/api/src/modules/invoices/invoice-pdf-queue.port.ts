export const INVOICE_PDF_QUEUE = Symbol('INVOICE_PDF_QUEUE');

export const INVOICE_PDF_QUEUE_NAME = 'invoice-pdf-render';
export const INVOICE_PDF_QUEUE_PREFIX = 'iranyaragh';

/** The queue carries only an opaque database job ID, never render input. */
export interface InvoicePdfQueue {
  enqueue(jobId: string): Promise<void>;
}
