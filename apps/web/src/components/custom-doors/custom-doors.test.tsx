import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DoorProformaNotice } from "./DoorProformaNotice";
import { DoorSummary } from "./DoorSummary";
import { DoorOrderFloatingLink } from "./DoorOrderFloatingLink";
import { CustomDoorsPage } from "../../views/CustomDoorsPage";
import { AuthContext, type AuthContextValue } from "../../state/auth-context";
import type { DoorCatalog, DoorQuoteSnapshot } from "@iranyaragh/contracts";
import { AuthApiError } from "../../lib/auth/errors";

const { load, preview, open, create, account, request } = vi.hoisted(() => ({
  load: vi.fn(),
  preview: vi.fn(),
  open: vi.fn(),
  create: vi.fn(),
  account: vi.fn(),
  request: vi.fn(),
}));
vi.mock("../../services/customer-account", () => ({
  getCustomerAccount: account,
}));
vi.mock("../../services/custom-doors/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/custom-doors/api")>()),
  loadDoorCatalog: load,
  previewDoors: preview,
  createDoorOrder: create,
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
function configurator(identity = auth) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={identity}>
        <CustomDoorsPage />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  load.mockResolvedValue(catalog);
  account.mockResolvedValue({});
  preview.mockResolvedValue({
    currency: "IRR",
    lines: [],
    reasons: ["تعرفه آزمون تعیین نشده"],
    calculatedTotal: null,
    total: null,
    adjustments: [],
    approvalReason: null,
  });
});

const testItem = {
  modelId: "test-model",
  widthMm: 500,
  heightMm: 1000,
  quantity: 1,
  selections: [{ slot: "glass", materialId: "test-glass" }],
  notes: "TEST ONLY",
};
const customerAuth = {
  ...auth,
  identityVersion: 1,
  state: { phase: "authenticated", principal: { userId: "test-customer" } },
  request: { forCurrentPrincipal: () => request },
} as unknown as AuthContextValue;
function restoreRow(user = "anonymous") {
  sessionStorage.setItem(
    `iranyaragh:door-draft:v1:${user}`,
    JSON.stringify([testItem]),
  );
}
async function reviewRestored(identity = auth) {
  configurator(identity);
  await screen.findByRole("button", { name: /مدل آزمون جداگانه/ });
  fireEvent.click(screen.getByRole("button", { name: "محاسبه و بررسی سفارش" }));
  await screen.findByText("تعرفه آزمون تعیین نشده");
}
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
    const link = await screen.findByRole("link", {
      name: "سفارش درب فریم‌لس و دکوفیکس",
    });
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
      screen.queryByRole("link", { name: "سفارش درب فریم‌لس و دکوفیکس" }),
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
  it("keeps the action hidden when the visibility request fails", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("TEST ONLY offline"));
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
  it("requests authentication before creating an anonymous customer's restored order", async () => {
    restoreRow();
    await reviewRestored();
    fireEvent.click(screen.getByRole("button", { name: "ورود و ثبت سفارش" }));
    expect(open).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });
  it("retains an uncertain submission across a reload and replays its exact idempotency key", async () => {
    restoreRow();
    create.mockRejectedValueOnce(new Error("TEST ONLY response lost"));
    const view = configurator(customerAuth);
    await screen.findByRole("button", { name: /مدل آزمون جداگانه/ });
    fireEvent.click(
      screen.getByRole("button", { name: "محاسبه و بررسی سفارش" }),
    );
    await screen.findByText("تعرفه آزمون تعیین نشده");
    fireEvent.click(
      screen.getByRole("button", { name: "ثبت سفارش و بررسی نهایی سرور" }),
    );
    await screen.findByText(/نتیجه ثبت مشخص نیست/);
    const first = create.mock.calls[0];
    expect(first[1]).toEqual({ items: [testItem] });
    expect(screen.getByRole("button", { name: "حذف درب 1" })).toBeDisabled();
    expect(
      sessionStorage.getItem("iranyaragh:door-draft:v1:anonymous"),
    ).toBeNull();
    view.unmount();
    create.mockResolvedValueOnce({
      id: "test-order",
      number: "TEST-ONLY-1",
      status: "PENDING_QUOTE_APPROVAL",
    });
    configurator(customerAuth);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "تلاش دوباره با همان درخواست",
      }),
    );
    await screen.findByRole("heading", { name: "سفارش ساخت درب ثبت شد" });
    expect(create.mock.calls[1]).toEqual(first);
    expect(
      sessionStorage.getItem(
        "iranyaragh:door-draft:v1:test-customer:submission",
      ),
    ).toBeNull();
    expect(
      screen.getByRole("link", { name: /مشاهده و پیگیری سفارش/ }),
    ).toHaveAttribute("href", "/account/custom-doors/test-order");
  });
  it("clears a definitively rejected command and leaves the rows editable", async () => {
    restoreRow("test-customer");
    create.mockRejectedValueOnce(
      new AuthApiError({
        message: "اطلاعات سفارش معتبر نیست",
        statusCode: 422,
        code: "VALIDATION_ERROR",
      }),
    );
    await reviewRestored(customerAuth);
    fireEvent.click(
      screen.getByRole("button", { name: "ثبت سفارش و بررسی نهایی سرور" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "اطلاعات سفارش معتبر نیست",
    );
    expect(screen.getByRole("button", { name: "حذف درب 1" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "تلاش دوباره با همان درخواست" }),
    ).not.toBeInTheDocument();
    expect(
      sessionStorage.getItem(
        "iranyaragh:door-draft:v1:test-customer:submission",
      ),
    ).toBeNull();
  });
  it("preserves rows after a failed preview and succeeds on a deliberate retry", async () => {
    restoreRow();
    preview.mockRejectedValueOnce(new Error("TEST ONLY offline"));
    configurator();
    fireEvent.click(
      await screen.findByRole("button", { name: "محاسبه و بررسی سفارش" }),
    );
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "ویرایش" })).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "محاسبه و بررسی سفارش" }),
    );
    await screen.findByText("تعرفه آزمون تعیین نشده");
    expect(preview).toHaveBeenCalledTimes(2);
    expect(preview.mock.calls[0]).toEqual(preview.mock.calls[1]);
  });
  it("shows configured models, accepts Persian dimensions, retains rows through review and supports duplicate/edit/delete", async () => {
    const quote: DoorQuoteSnapshot = {
      currency: "IRR",
      lines: [],
      reasons: ["تعرفه آزمون تعیین نشده"],
      calculatedTotal: null,
      total: null,
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
    fireEvent.change(screen.getByLabelText("رنگ پروفیل"), { target: { value: "BRONZE" } });
    fireEvent.change(screen.getByLabelText("سمت دستگیره"), { target: { value: "LEFT" } });
    fireEvent.change(screen.getByLabelText("محل گازور / لولا"), { target: { value: "RIGHT" } });
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
          manufacturing: { profileColor: "BRONZE", handleSide: "LEFT", hingeSide: "RIGHT", drillingMode: "STANDARD", holes: [] },
          selections: [{ slot: "glass", materialId: "test-glass" }],
        }),
      ],
    });
    fireEvent.click(
      screen.getByRole("button", { name: "بازگشت به انتخاب درب" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "ویرایش" }));
    expect(screen.getByLabelText("عرض (میلی‌متر)")).toHaveValue("500");
    expect(screen.getByLabelText("رنگ پروفیل")).toHaveValue("BRONZE");
  });
  it("publishes no invented models or prices when the catalog is empty", async () => {
    load.mockResolvedValue({ ...catalog, models: [], materials: [] });
    configurator();
    expect(
      await screen.findByText(/مدل تأییدشده‌ای برای فریم‌لس منتشر نشده است/),
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


it("shows final payment guidance without exposing historical deposit installments", () => {
  const quote = {
    currency: "IRR", lines: [], reasons: [], calculatedTotal: "1000000",
    total: "1000000", deposit: "300000",
    depositPolicy: { kind: "PERCENT", value: "3000", minimum: "0" },
    adjustments: [], approvalReason: null,
  } as DoorQuoteSnapshot;
  const { container } = render(<DoorSummary quote={quote} approved />);
  expect(screen.getByText("مبلغ قطعی")).toBeInTheDocument();
  expect(screen.getByText(/مبلغ نهایی یکجا پرداخت می‌شود/)).toBeInTheDocument();
  expect(container.textContent).not.toContain("بیعانه");
});

describe("DoorProformaNotice", () => {
  it.each([
    ["UNPAID", "پیش‌فاکتور — پرداخت نشده"],
    ["UNPRICED", "پیش‌فاکتور — پرداخت نشده"],
    ["PARTIAL", "پیش‌فاکتور — پرداخت کامل نشده"],
  ] as const)("states the %s payment state on the proforma", (status, text) => {
    render(<DoorProformaNotice financialStatus={status} />);
    expect(screen.getByRole("note")).toHaveTextContent(text);
    expect(screen.getByRole("note")).toHaveTextContent("رسید پرداخت نیست");
  });
  it("is absent once payment is settled", () => {
    const { container } = render(<DoorProformaNotice financialStatus="SETTLED" />);
    expect(container).toBeEmptyDOMElement();
  });
});
