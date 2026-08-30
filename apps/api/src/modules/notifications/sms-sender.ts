import { Injectable, Logger } from '@nestjs/common';

export const SMS_SENDER = 'SMS_SENDER';

/**
 * Outbound SMS abstraction. Business logic (NotificationsService, stock-alert
 * workflows) depends only on this interface. The dev provider logs instead of
 * sending; a real provider (e.g. provider.com / SMSC) can be swapped in later
 * without touching callers.
 */
export interface SmsMessage {
  to: string;
  template: string;
  params: Record<string, string>;
}

export interface SmsSender {
  readonly provider: string;
  send(message: SmsMessage): Promise<void>;
}

@Injectable()
export class DevSmsSender implements SmsSender {
  readonly provider = 'dev';
  private readonly logger = new Logger(DevSmsSender.name);

  async send(message: SmsMessage): Promise<void> {
    let body = message.template;
    for (const [key, value] of Object.entries(message.params)) {
      body = body.replaceAll(`{{${key}}}`, value);
    }
    this.logger.log(`[dev-sms] to=${message.to} body="${body}"`);
  }
}
