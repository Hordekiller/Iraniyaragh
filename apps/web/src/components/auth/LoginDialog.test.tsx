import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthFixtureClient } from "../../lib/auth/fixtures";
import { MemorySessionStore } from "../../lib/auth/session-store";
import { createAuthenticatedRequest } from "../../lib/auth/authenticated-request";
import { CustomerOtpController } from "../../lib/auth/ui";
import { AuthContext } from "../../state/auth-context";
import { LoginDialog } from "./LoginDialog";

afterEach(cleanup);

describe("LoginDialog delivery evidence", () => {
  it("explains ambiguity, preserves code entry and disables immediate resend", async () => {
    const store = new MemorySessionStore();
    const api = new AuthFixtureClient({ store });
    const requestOtp = vi.spyOn(api, "requestOtp").mockResolvedValue({
      challengeId: "unit-challenge",
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
      deliveryStatus: "unknown_result",
    });
    const controller = new CustomerOtpController(api, store);
    controller.open();
    controller.setMobile("09121234567");
    await controller.requestOtp();
    render(
      <AuthContext.Provider
        value={{
          restored: true,
          state: controller.getState(),
          controller,
          request: createAuthenticatedRequest(store, async () => false),
          open: () => controller.open(),
          close: () => controller.close(),
        }}
      >
        <LoginDialog open onClose={() => undefined} />
      </AuthContext.Provider>,
    );
    expect(screen.getByText(/نتیجهٔ ارسال مشخص نیست/)).toBeInTheDocument();
    expect(screen.queryByText(/پیامک شد/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("کد تایید")).toBeInTheDocument();
    await controller.resend();
    expect(requestOtp).toHaveBeenCalledOnce();
    controller.dispose();
  });
});
