import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SmsTemplateSettings } from "@iranyaragh/contracts";
import {
  SmsNetworkError,
  SmsSessionExpiredError,
  SmsVersionConflictError,
} from "@/lib/sms/sms-settings-port";
import { SmsTemplatesPanel } from "./SmsTemplatesPanel";
const initial: SmsTemplateSettings = {
  otpTemplateId: null,
  orderPaidTemplateId: null,
  shipmentDispatchedTemplateId: null,
  shipmentDeliveredTemplateId: null,
  version: 0,
  updatedAt: null,
};
const labels = [
  "قالب ورود مشتری",
  "قالب پرداخت سفارش",
  "قالب ارسال مرسوله",
  "قالب تحویل مرسوله",
];
function harness(snapshot = initial) {
  const getTemplates = vi.fn().mockResolvedValue(snapshot);
  const updateTemplates = vi.fn().mockImplementation(async (payload) => ({
    ...payload,
    version: payload.expectedVersion + 1,
    updatedAt: "2026-10-04T12:00:00.000Z",
  }));
  render(<SmsTemplatesPanel service={{ getTemplates, updateTemplates }} />);
  return { getTemplates, updateTemplates };
}
async function edit() {
  await screen.findByLabelText(labels[0]!);
  fireEvent.change(screen.getByLabelText(labels[0]!), {
    target: { value: "۱۲۳" },
  });
}
function save() {
  fireEvent.click(screen.getByRole("button", { name: "ذخیرهٔ قالب‌ها" }));
}

describe("Admin approved template entry", () => {
  it("loads four non-secret fields and saves Persian numeric IDs through the server contract", async () => {
    const service = harness();
    await edit();
    for (const label of labels)
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    save();
    await screen.findByRole("status");
    expect(service.updateTemplates).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        otpTemplateId: 123,
        orderPaidTemplateId: null,
        expectedVersion: 0,
        idempotencyKey: expect.any(String),
      }),
    );
    expect(screen.getByLabelText(labels[0]!)).toHaveValue("123");
    expect(screen.getByText(/سرویس پیامک را فعال نمی‌کند/)).toBeInTheDocument();
  });
  it("rejects malformed IDs without sending a mutation", async () => {
    const service = harness();
    await edit();
    fireEvent.change(screen.getByLabelText(labels[0]!), {
      target: { value: "1.5" },
    });
    save();
    expect(
      await screen.findByText("شناسهٔ قالب باید عدد صحیح مثبت باشد."),
    ).toBeInTheDocument();
    expect(service.updateTemplates).not.toHaveBeenCalled();
  });
  it("reuses the same idempotent request after an ambiguous network result", async () => {
    const service = harness();
    service.updateTemplates.mockRejectedValueOnce(new SmsNetworkError("offline"));
    await edit();
    save();
    await screen.findByText(/نتیجهٔ ذخیره مشخص نیست/);
    const request = service.updateTemplates.mock.calls[0]![0];
    save();
    await screen.findByRole("status");
    expect(service.updateTemplates.mock.calls[1]![0]).toEqual(request);
  });
  it("requires reload after a version conflict and then uses the refreshed version", async () => {
    const service = harness();
    service.updateTemplates.mockRejectedValueOnce(
      new SmsVersionConflictError(),
    );
    await edit();
    save();
    await screen.findByText(/در جای دیگری تغییر/);
    service.getTemplates.mockResolvedValueOnce({
      ...initial,
      version: 4,
      otpTemplateId: 555,
    });
    fireEvent.click(
      screen.getByRole("button", { name: "بارگذاری مجدد قالب‌ها" }),
    );
    await waitFor(() =>
      expect(screen.getByLabelText(labels[0]!)).toHaveValue("555"),
    );
    fireEvent.change(screen.getByLabelText(labels[0]!), {
      target: { value: "556" },
    });
    save();
    await screen.findByRole("status");
    expect(service.updateTemplates.mock.calls[1]![0]).toMatchObject({
      expectedVersion: 4,
      otpTemplateId: 556,
    });
  });
  it("offers recovery from a failed read and prevents mutation after session expiry", async () => {
    const getTemplates = vi
      .fn()
      .mockRejectedValueOnce(new SmsNetworkError("offline"))
      .mockResolvedValue(initial);
    const updateTemplates = vi
      .fn()
      .mockRejectedValue(new SmsSessionExpiredError());
    render(<SmsTemplatesPanel service={{ getTemplates, updateTemplates }} />);
    fireEvent.click(
      await screen.findByRole("button", { name: "تلاش مجدد دریافت قالب‌ها" }),
    );
    await edit();
    save();
    expect(
      await screen.findByRole("link", { name: "ورود مجدد به پنل" }),
    ).toHaveAttribute("href", "/login");
    expect(
      screen.getByRole("button", { name: "ذخیرهٔ قالب‌ها" }),
    ).toBeDisabled();
  });
  it("prevents repeated submit while a mutation is in flight", async () => {
    const service = harness();
    service.updateTemplates.mockReturnValueOnce(new Promise(() => {}));
    await edit();
    save();
    const form = screen.getByLabelText(labels[0]!).closest("form")!;
    fireEvent.submit(form);
    expect(service.updateTemplates).toHaveBeenCalledOnce();
  });
});
