import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FeedbackProvider } from "@/components/ui/FeedbackProvider";
import {
  CATALOG_MEDIA_READ,
  CATALOG_MEDIA_WRITE,
} from "@/lib/catalog/catalog-permissions";
import { ProductMediaManager } from "../ProductMediaManager";

const mocks = vi.hoisted(() => ({
  user: { permissions: ["catalog.media.read", "catalog.media.write"] },
  getProduct: vi.fn(),
  listProductMedia: vi.fn(),
  reorderMedia: vi.fn(),
  setPrimaryMedia: vi.fn(),
  updateMediaMetadata: vi.fn(),
  archiveMedia: vi.fn(),
  initiateMediaUpload: vi.fn(),
  uploadMediaObject: vi.fn(),
  confirmMediaUpload: vi.fn(),
}));
vi.mock("@/lib/auth/AuthProvider", () => ({
  useAuth: () => ({ user: mocks.user }),
}));
vi.mock("@/lib/catalog/catalog-api", () => ({ getProduct: mocks.getProduct }));
vi.mock("@/lib/catalog/media-api", () => ({
  listProductMedia: mocks.listProductMedia,
  reorderMedia: mocks.reorderMedia,
  setPrimaryMedia: mocks.setPrimaryMedia,
  updateMediaMetadata: mocks.updateMediaMetadata,
  archiveMedia: mocks.archiveMedia,
  initiateMediaUpload: mocks.initiateMediaUpload,
  uploadMediaObject: mocks.uploadMediaObject,
  confirmMediaUpload: mocks.confirmMediaUpload,
}));

const media = (id: string, position: number, role: "PRIMARY" | "GALLERY") => ({
  id,
  productId: "p1",
  kind: "IMAGE" as const,
  state: "READY" as const,
  role,
  position,
  altText: role === "PRIMARY" ? "قفل اصلی" : null,
  caption: null,
  originalFilename: `${id}.webp`,
  declaredMime: "image/webp",
  declaredBytes: "100",
  detectedMime: "image/webp",
  bytes: "100",
  width: 100,
  height: 100,
  durationMs: null,
  hasAudio: null,
  posterMediaId: null,
  checksumSha256: "a".repeat(64),
  failureCode: null,
  version: 1,
  uploadExpiresAt: "2026-09-15T00:00:00Z",
  createdAt: "2026-09-15T00:00:00Z",
  updatedAt: "2026-09-15T00:00:00Z",
});

function renderManager() {
  return render(
    <FeedbackProvider>
      <ProductMediaManager productId="p1" />
    </FeedbackProvider>,
  );
}

describe("ProductMediaManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { permissions: [CATALOG_MEDIA_READ, CATALOG_MEDIA_WRITE] };
    mocks.getProduct.mockResolvedValue({
      product: { id: "p1", name: "قفل", version: 3 },
    });
    mocks.listProductMedia.mockResolvedValue([
      media("m1", 0, "PRIMARY"),
      media("m2", 1, "GALLERY"),
      media("m3", 2, "GALLERY"),
    ]);
    mocks.reorderMedia.mockResolvedValue([
      media("m1", 0, "PRIMARY"),
      media("m2", 1, "GALLERY"),
    ]);
    mocks.setPrimaryMedia.mockResolvedValue([
      media("m2", 0, "PRIMARY"),
      media("m1", 1, "GALLERY"),
    ]);
    mocks.updateMediaMetadata.mockResolvedValue({
      ...media("m2", 1, "GALLERY"),
      altText: "نمای کنار",
    });
    mocks.initiateMediaUpload.mockResolvedValue({ mediaId: "m4", uploadUrl: "/signed", method: "PUT", requiredHeaders: {}, expiresAt: "", version: 1 });
    mocks.uploadMediaObject.mockImplementation(async (_intent: unknown, _file: File, progress: (value: number) => void) => progress(100));
    mocks.confirmMediaUpload.mockResolvedValue(media("m4", 3, "GALLERY"));
    mocks.archiveMedia.mockResolvedValue({ ...media("m2", 1, "GALLERY"), state: "ARCHIVED" });
  });

  it("renders the Vuexy-aligned upload card and ordered media controls", async () => {
    renderManager();
    expect(await screen.findByText("m1.webp")).toBeInTheDocument();
    expect(screen.getByText("تصویر را اینجا رها کنید")).toBeInTheDocument();
    expect(screen.getAllByLabelText("انتقال به بالا")).toHaveLength(3);
    expect(screen.getByText("تصویر اصلی")).toBeInTheDocument();
  });

  it("shows a permission-denied state without catalog.media.read", async () => {
    mocks.user = { permissions: [] };
    renderManager();
    expect(screen.getByText("دسترسی ندارید")).toBeInTheDocument();
    expect(mocks.listProductMedia).not.toHaveBeenCalled();
  });

  it("promotes a ready gallery image using product and media versions", async () => {
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByLabelText("تنظیم به‌عنوان تصویر اصلی")[1]!);
    await waitFor(() =>
      expect(mocks.setPrimaryMedia).toHaveBeenCalledWith("p1", "m2", {
        expectedProductVersion: 3,
        expectedVersion: 1,
      }),
    );
  });

  it("edits accessible image metadata with an optimistic version", async () => {
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByText("ویرایش متن")[1]!);
    fireEvent.change(screen.getByLabelText("متن جایگزین"), {
      target: { value: "نمای کنار" },
    });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() =>
      expect(mocks.updateMediaMetadata).toHaveBeenCalledWith("p1", "m2", {
        expectedVersion: 1,
        altText: "نمای کنار",
        caption: "",
      }),
    );
  });

  it("supports pointer drag ordering while retaining keyboard move buttons", async () => {
    renderManager();
    const source = (await screen.findByText("m2.webp")).closest(
      '[draggable="true"]',
    );
    const target = screen.getByText("m3.webp").closest('[draggable="true"]');
    expect(source).not.toBeNull();
    expect(target).not.toBeNull();
    fireEvent.dragStart(source!);
    fireEvent.dragOver(target!);
    fireEvent.drop(target!);
    await waitFor(() =>
      expect(mocks.reorderMedia).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({
          expectedProductVersion: 3,
          items: [
            expect.objectContaining({ mediaId: "m1", position: 0 }),
            expect.objectContaining({ mediaId: "m3", position: 1 }),
            expect.objectContaining({ mediaId: "m2", position: 2 }),
          ],
        }),
      ),
    );
  });

  it("uploads through initiate, signed PUT progress and confirmation", async () => {
    const view = renderManager();
    await screen.findByText("m1.webp");
    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["image"], "new.webp", { type: "image/webp" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(mocks.initiateMediaUpload).toHaveBeenCalledWith("p1", expect.objectContaining({
      kind: "IMAGE", role: "GALLERY", position: 3, productVersion: 3,
    })));
    expect(mocks.uploadMediaObject).toHaveBeenCalledWith(expect.objectContaining({ mediaId: "m4" }), file, expect.any(Function));
    expect(mocks.confirmMediaUpload).toHaveBeenCalledWith("p1", "m4");
    expect(await screen.findByText("m4.webp")).toBeInTheDocument();
  });

  it("archives a gallery item only after explicit confirmation", async () => {
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByLabelText("بایگانی رسانه")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "بایگانی" }));
    await waitFor(() => expect(mocks.archiveMedia).toHaveBeenCalledWith("p1", "m2", 1));
    await waitFor(() => expect(screen.queryByText("m2.webp")).not.toBeInTheDocument());
  });

  it("allows read-only staff to inspect media but disables every mutation", async () => {
    mocks.user = { permissions: [CATALOG_MEDIA_READ] };
    renderManager();
    await screen.findByText("m1.webp");
    expect(screen.getByRole("button", { name: "انتخاب تصویر" })).toBeDisabled();
    expect(screen.getAllByLabelText("بایگانی رسانه")[1]!).toBeDisabled();
    expect(screen.getAllByText("ویرایش متن")[1]!).toBeDisabled();
  });

  it("reloads authoritative state after a stale ordering failure", async () => {
    mocks.reorderMedia.mockRejectedValueOnce(new Error("version conflict"));
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByLabelText("انتقال به پایین")[1]!);
    await waitFor(() => expect(mocks.listProductMedia).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("surfaces an initial catalog loading failure and allows retry", async () => {
    mocks.getProduct.mockRejectedValueOnce(new Error("catalog unavailable"));
    renderManager();
    expect(
      await screen.findByText("عملیات رسانه ناموفق بود؛ دوباره تلاش کنید."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByText("m1.webp")).toBeInTheDocument();
  });

  it("rejects unsupported and oversized uploads before creating an intent", async () => {
    const view = renderManager();
    await screen.findByText("m1.webp");
    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    fireEvent.change(input, {
      target: { files: [new File(["bad"], "bad.gif", { type: "image/gif" })] },
    });
    expect(
      await screen.findByText("فقط تصویر JPEG، PNG یا WebP قابل ارسال است."),
    ).toBeInTheDocument();

    const oversized = new File(["large"], "large.webp", {
      type: "image/webp",
    });
    Object.defineProperty(oversized, "size", { value: 20 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(
      await screen.findByText("حجم تصویر باید حداکثر ۲۰ مگابایت باشد."),
    ).toBeInTheDocument();
    expect(mocks.initiateMediaUpload).not.toHaveBeenCalled();
  });

  it("enforces the twelve-media upload limit", async () => {
    mocks.listProductMedia.mockResolvedValue([
      media("m1", 0, "PRIMARY"),
      ...Array.from({ length: 11 }, (_, index) =>
        media(`gallery-${index}`, index + 1, "GALLERY"),
      ),
    ]);
    const view = renderManager();
    await screen.findByText("gallery-10.webp");
    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "extra.webp", { type: "image/webp" })],
      },
    });
    expect(
      await screen.findByText("حداکثر ۱۲ رسانه برای هر کالا مجاز است."),
    ).toBeInTheDocument();
    expect(mocks.initiateMediaUpload).not.toHaveBeenCalled();
  });

  it("reloads authoritative state after a primary-selection failure", async () => {
    mocks.setPrimaryMedia.mockRejectedValueOnce(new Error("primary conflict"));
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByLabelText("تنظیم به‌عنوان تصویر اصلی")[1]!);
    await waitFor(() => expect(mocks.listProductMedia).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("عملیات رسانه ناموفق بود؛ دوباره تلاش کنید."),
    ).toBeInTheDocument();
  });

  it("reloads authoritative state after a metadata failure", async () => {
    mocks.updateMediaMetadata.mockRejectedValueOnce(new Error("metadata conflict"));
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByText("ویرایش متن")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(mocks.listProductMedia).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("عملیات رسانه ناموفق بود؛ دوباره تلاش کنید."),
    ).toBeInTheDocument();
  });

  it("reloads authoritative state after an archive failure", async () => {
    mocks.archiveMedia.mockRejectedValueOnce(new Error("archive conflict"));
    renderManager();
    await screen.findByText("m2.webp");
    fireEvent.click(screen.getAllByLabelText("بایگانی رسانه")[1]!);
    fireEvent.click(screen.getByRole("button", { name: "بایگانی" }));
    await waitFor(() => expect(mocks.listProductMedia).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText("عملیات رسانه ناموفق بود؛ دوباره تلاش کنید."),
    ).toBeInTheDocument();
  });

  it("resets upload state and reports a signed-upload failure", async () => {
    mocks.uploadMediaObject.mockRejectedValueOnce(new Error("upload failed"));
    const view = renderManager();
    await screen.findByText("m1.webp");
    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "failed.webp", { type: "image/webp" })],
      },
    });
    expect(
      await screen.findByText("عملیات رسانه ناموفق بود؛ دوباره تلاش کنید."),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "انتخاب تصویر" })).toBeEnabled(),
    );
  });

  it("supports keyboard reordering and canceling both dialogs", async () => {
    renderManager();
    await screen.findByText("m2.webp");

    fireEvent.click(screen.getAllByLabelText("انتقال به پایین")[1]!);
    await waitFor(() => expect(mocks.reorderMedia).toHaveBeenCalled());

    fireEvent.click(screen.getAllByText("ویرایش متن")[1]!);
    expect(screen.getByRole("dialog", { name: "متادیتای تصویر" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "متادیتای تصویر" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getAllByLabelText("بایگانی رسانه")[1]!);
    expect(screen.getByRole("dialog", { name: "بایگانی رسانه" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "بایگانی رسانه" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("creates the first upload as the primary image at position zero", async () => {
    mocks.listProductMedia.mockResolvedValue([]);
    mocks.confirmMediaUpload.mockResolvedValue(media("m1", 0, "PRIMARY"));
    const view = renderManager();
    await screen.findByText("هنوز تصویری ثبت نشده");
    const input = view.container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "primary.webp", { type: "image/webp" })],
      },
    });
    await waitFor(() =>
      expect(mocks.initiateMediaUpload).toHaveBeenCalledWith(
        "p1",
        expect.objectContaining({ role: "PRIMARY", position: 0 }),
      ),
    );
  });

  it("polls processing media and stops with a recoverable timeout", async () => {
    let poll: TimerHandler | undefined;
    const setIntervalSpy = vi
      .spyOn(window, "setInterval")
      .mockImplementation((handler: TimerHandler, delay?: number) => {
        if (delay === 2000) poll = handler;
        return delay === 2000 ? 123 : 456;
      });
    const clearIntervalSpy = vi
      .spyOn(window, "clearInterval")
      .mockImplementation(() => undefined);
    mocks.listProductMedia.mockResolvedValue([
      { ...media("m1", 0, "PRIMARY"), state: "PROCESSING" },
    ]);

    const view = renderManager();
    await screen.findByText("در حال پردازش");
    await waitFor(() => expect(setIntervalSpy).toHaveBeenCalled());
    await act(async () => {
      for (let attempt = 0; attempt < 150; attempt += 1) {
        if (typeof poll === "function") poll();
      }
      await Promise.resolve();
    });
    expect(
      await screen.findByText(/پردازش تصویر بیش از حد انتظار طول کشید/),
    ).toBeInTheDocument();
    expect(clearIntervalSpy).toHaveBeenCalledWith(123);
    view.unmount();
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
