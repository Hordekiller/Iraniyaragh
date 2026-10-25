export const REPORT_EXPORT_QUEUE = Symbol('REPORT_EXPORT_QUEUE');
export const REPORT_EXPORT_QUEUE_NAME = 'report-export-render';
export const REPORT_EXPORT_QUEUE_PREFIX = 'iranyaragh';

/** Wake-up hint only. The durable lease lives on the ReportExportJob row. */
export type ReportExportQueue = { enqueue(jobId: string): Promise<void> };
