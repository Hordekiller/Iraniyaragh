import { Module } from '@nestjs/common';
import { DevSmsSender, SMS_SENDER } from './sms-sender';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [
    NotificationsService,
    { provide: SMS_SENDER, useClass: DevSmsSender },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
