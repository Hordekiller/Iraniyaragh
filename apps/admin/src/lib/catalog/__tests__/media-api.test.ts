import { afterEach, describe, expect, it, vi } from "vitest";
import { setAccessToken } from "@/lib/auth/token-store";
import {
  archiveMedia,
  confirmMediaUpload,
  initiateMediaUpload,
  listProductMedia,
  listProductMediaPicker,
  reorderMedia,
  setPrimaryMedia,
  updateMediaMetadata,
  uploadMediaObject,
} from "../media-api";

const baseUrl = "http://localhost:4000/api/v1/catalog/admin/products/p1/media";
const response = (data: unknown) =>
  ({
    ok: true,
    status: 200,
    text: vi.fn(async () => JSON.stringify({ data })),
  }) as unknown as Response;

describe("media-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("reads media with bearer authentication", async () => {
    setAccessToken("media-token");
    const fetchMock = vi.fn(async () => response({ items: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listProductMedia("p1")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      baseUrl,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer media-token",
        }),
      }),
    );
  });

  it("reads the ready-image picker projection from the picker endpoint", async () => {
    setAccessToken("picker-token");
    const items = [
      {
        id: "m1",
        url: "http://localhost:9000/products/p1/r-1200.webp",
        alt: "قفل",
        caption: null,
        width: 1200,
        height: 900,
      },
    ];
    const fetchMock = vi.fn(async () => response({ items }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listProductMediaPicker("p1")).resolves.toEqual(items);
    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/picker`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer picker-token",
        }),
      }),
    );
  });

  it("sends versioned metadata, ordering and primary commands with idempotency keys", async () => {
    const fetchMock = vi.fn(async () => response({ items: [], media: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await updateMediaMetadata("p1", "m1", {
      expectedVersion: 2,
      altText: "قفل",
    });
    await reorderMedia("p1", {
      expectedProductVersion: 3,
      items: [{ mediaId: "m1", expectedVersion: 3, position: 0 }],
    });
    await setPrimaryMedia("p1", "m1", {
      expectedProductVersion: 4,
      expectedVersion: 4,
    });
    for (const [, init] of fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >) {
      expect(init.headers).toEqual(
        expect.objectContaining({
          "Idempotency-Key": expect.stringMatching(/^media-/u),
        }),
      );
    }
    expect(
      (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>)[2]![0],
    ).toBe(`${baseUrl}/m1/primary`);
  });

  it("covers initiate, confirm and archive command contracts", async () => {
    const upload = { mediaId: "m1", uploadUrl: "/signed", method: "PUT", requiredHeaders: {}, expiresAt: "", version: 1 };
    const media = { id: "m1" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ upload }))
      .mockResolvedValueOnce(response({ media }))
      .mockResolvedValueOnce(response({ media }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(initiateMediaUpload("p1", { kind: "IMAGE", role: "PRIMARY", position: 0, originalFilename: "a.webp", declaredMime: "image/webp", bytes: 10, productVersion: 3 })).resolves.toEqual(upload);
    await expect(confirmMediaUpload("p1", "m1")).resolves.toEqual(media);
    await expect(archiveMedia("p1", "m1", 2)).resolves.toBeUndefined();
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `${baseUrl}/uploads`, `${baseUrl}/m1/confirm`, `${baseUrl}/m1/archive`,
    ]);
    for (const [, init] of fetchMock.mock.calls as unknown as Array<[string, RequestInit]>) {
      expect(init.headers).toEqual(expect.objectContaining({ "Idempotency-Key": expect.stringMatching(/^media-/u) }));
    }
  });

  it("uploads directly to the exact presigned URL and reports progress without an API token", async () => {
    const progress = vi.fn();
    class FakeRequest extends EventTarget {
      static instance: FakeRequest;
      upload = new EventTarget();
      status = 200;
      headers: Record<string, string> = {};
      url = "";
      constructor() {
        super();
        FakeRequest.instance = this;
      }
      open(_method: string, url: string) {
        this.url = url;
      }
      setRequestHeader(name: string, value: string) {
        this.headers[name] = value;
      }
      send() {
        this.upload.dispatchEvent(
          new ProgressEvent("progress", {
            lengthComputable: true,
            loaded: 5,
            total: 10,
          }),
        );
        this.dispatchEvent(new Event("load"));
      }
    }
    vi.stubGlobal("XMLHttpRequest", FakeRequest);
    await uploadMediaObject(
      {
        mediaId: "m1",
        uploadUrl: "https://storage.example/signed",
        method: "PUT",
        requiredHeaders: { "content-type": "image/webp" },
        expiresAt: "",
        version: 1,
      },
      new File(["image"], "image.webp", { type: "image/webp" }),
      progress,
    );
    expect(FakeRequest.instance.url).toBe("https://storage.example/signed");
    expect(FakeRequest.instance.headers).toEqual({
      "content-type": "image/webp",
    });
    expect(progress).toHaveBeenCalledWith(50);
  });
});
