import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorOrderFloatingLink } from "./DoorOrderFloatingLink";
import { CustomDoorsPage } from "../../views/CustomDoorsPage";
import { AuthContext, type AuthContextValue } from "../../state/auth-context";
import type { DoorCatalog, DoorQuoteSnapshot } from "@iranyaragh/contracts";

const { load, preview, open } = vi.hoisted(() => ({
  load: vi.fn(),
  preview: vi.fn(),
  open: vi.fn(),
}));
vi.mock("../../services/custom-doors/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/custom-doors/api")>()),
  loadDoorCatalog: load,
  previewDoors: preview,
}));
const cfg = {
  technical: null,
  manualApproval: true,
  slots: [
    {
      key: "glass",
      title: "شیشه تأییدشده",
      materialIds: ["test-glass"],
      required: true,
    },
  ],
  incompatible: [],
  components: [],
  labor: null,
  additional: [],
  taxBps: 0,
  discount: "0",
  minimumTotal: "0",
  deposit: null,
} as const;
const catalog: DoorCatalog = {
  floatingEnabled: true,
  settingsVersion: 0,
  models: [
    {
      id: "test-model",
      code: "test-model",
      title: "مدل آزمون جداگانه",
      type: "FORMLEX",
      active: true,
      version: 1,
      configuration: structuredClone(
        cfg,
      ) as unknown as DoorCatalog["models"][number]["configuration"],
      imageMediaId: null,
      imageUrl: null,
    },
  ],
  materials: [
    {
      id: "test-glass",
      code: "test-glass",
      title: "شیشه آزمون",
      category: "GLASS",
      active: true,
      version: 1,
      variantId: null,
      configuration: {
        unit: "M2",
        rate: null,
        validUntil: null,
        specifications: "TEST ONLY",
        color: "",
        thicknessMm: null,
        processingFee: "0",
        stockUnit: null,
      },
    },
  ],
};
const auth = {
  identityVersion: 0,
  restored: true,
  state: { phase: "closed" },
  open,
  close: vi.fn(),
  request: vi.fn(),
  controller: {},
} as unknown as AuthContextValue;
function configurator() {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={auth}>
        <CustomDoorsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  load.mockResolvedValue(catalog);
});
describe("Door floating link", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { enabled: true } }), {
            status: 200,
          }),
      ),
    );
  });
  it("uses a named keyboard-accessible link with measured product clearance class", async () => {
    render(
      <MemoryRouter initialEntries={["/products/test"]}>
        <DoorOrderFloatingLink />
      </MemoryRouter>,
    );
    const link = await screen.findByRole("link", { name: "سفارش ساخت درب" });
    expect(link).toHaveAttribute("href", "/custom-doors");
    expect(link).toHaveClass("custom-door-floating-product");
  });
  it.each([
    "/custom-doors",
    "/checkout",
    "/cart",
    "/payment/test",
    "/account/custom-doors/test",
    "/orders/test",
  ])("does not obstruct %s", async (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <DoorOrderFloatingLink />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(
      screen.queryByRole("link", { name: "سفارش ساخت درب" }),
    ).not.toBeInTheDocument();
  });
  it("honors disabled visibility and fails closed on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ data: { enabled: false } }), {
            status: 200,
          }),
      ),
    );
    render(
      <MemoryRouter>
        <DoorOrderFloatingLink />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
describe("Door configurator", () => {
  it("shows configured models, accepts Persian dimensions, retains rows through review and supports duplicate/edit/delete", async () => {
    const quote: DoorQuoteSnapshot = {
      currency: "IRR",
      lines: [],
      reasons: ["تعرفه آزمون تعیین نشده"],
      calculatedTotal: null,
      total: null,
      deposit: null,
      depositPolicy: null,
      adjustments: [],
      approvalReason: null,
    };
    preview.mockResolvedValue(quote);
    configurator();
    fireEvent.click(
      await screen.findByRole("button", { name: /مدل آزمون جداگانه/ }),
    );
    fireEvent.change(screen.getByLabelText(/شیشه تأییدشده/), {
      target: { value: "test-glass" },
    });
    fireEvent.change(screen.getByLabelText("عرض (میلی‌متر)"), {
      target: { value: "۵۰۰" },
    });
    fireEvent.change(screen.getByLabelText("ارتفاع (میلی‌متر)"), {
      target: { value: "۱۰۰۰" },
    });
    fireEvent.change(screen.getByLabelText("تعداد"), {
      target: { value: "۲" },
    });
    fireEvent.click(screen.getByRole("button", { name: "افزودن این درب" }));
    fireEvent.click(screen.getByRole("button", { name: "تکثیر درب 1" }));
    expect(screen.getByText(/مجموع تعداد: ۴/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف درب 2" }));
    expect(screen.getByText(/مجموع تعداد: ۲/)).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "محاسبه و بررسی سفارش" }),
    );
    await screen.findByText("تعرفه آزمون تعیین نشده");
    expect(preview).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({
          widthMm: 500,
          heightMm: 1000,
          quantity: 2,
          selections: [{ slot: "glass", materialId: "test-glass" }],
        }),
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "بازگشت به انتخاب درب" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "ویرایش" }));
    expect(screen.getByLabelText("عرض (میلی‌متر)")).toHaveValue("500");
  });
  it("publishes no invented models or prices when the catalog is empty", async () => {
    load.mockResolvedValue({ ...catalog, models: [], materials: [] });
    configurator();
    expect(
      await screen.findByText(/مدل تأییدشده‌ای برای فرملکس منتشر نشده است/),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /مدل آزمون جداگانه/ }),
    ).not.toBeInTheDocument();
  });
  it("shows recoverable catalog failure without claiming successful configuration", async () => {
    load.mockRejectedValue(new Error("test network"));
    configurator();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "نتیجه عملیات تأیید نشد",
    );
    expect(screen.getByRole("button", { name: "دریافت دوباره" })).toBeVisible();
  });
});
