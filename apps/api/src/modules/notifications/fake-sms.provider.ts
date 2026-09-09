import type {
  SmsProvider,
  SmsSendRequest,
  SmsSendResult,
} from "./sms-provider";

export class FakeSmsProvider implements SmsProvider {
  readonly requests: SmsSendRequest[] = [];

  constructor(
    private readonly result: SmsSendResult = {
      status: "accepted",
      providerMessageId: "fake-message-1",
    },
  ) {}

  async send(request: SmsSendRequest): Promise<SmsSendResult> {
    this.requests.push(structuredClone(request));
    return this.result;
  }
}
