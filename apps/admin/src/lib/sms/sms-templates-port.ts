import type { SmsTemplateSettings, SmsTemplateSettingsUpdate } from '@iranyaragh/contracts';
export interface SmsTemplatesPort {
  getTemplates(): Promise<SmsTemplateSettings>;
  updateTemplates(input: SmsTemplateSettingsUpdate): Promise<SmsTemplateSettings>;
}
