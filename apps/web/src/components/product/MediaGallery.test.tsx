import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type {
  PublicProductMedia,
  PublicProductMediaImage,
} from "@iranyaragh/contracts";
import { MediaGallery } from "./MediaGallery";

function img(
  id: string,
  position: number,
  role: PublicProductMediaImage["role"],
  alt: string,
): PublicProductMediaImage {
  return {
    id,
    kind: "IMAGE",
    position,
    role,
    alt,
    caption: null,
    width: 1200,
    height: 1200,
    sources: [
      {
        url: `/media/${id}-480.webp`,
        width: 480,
        height: 480,
        type: "image/webp",
      },
      {
        url: `/media/${id}-1200.webp`,
        width: 1200,
        height: 1200,
        type: "image/webp",
      },
    ],
  };
}

const silentVideo: PublicProductMedia = {
  id: "video-1",
  kind: "VIDEO",
  position: 2,
  caption: "ویدیوی معرفی",
  description: "نمایش دقیق عملکرد دریل در ویدیو.",
  durationMs: 183_000,
  width: 1280,
  height: 720,
  hasAudio: true,
  poster: img("poster-1", 2, "VIDEO_POSTER", "ویدیوی معرفی محصول"),
  sources: [
    { url: "/media/video-1.mp4", type: "video/mp4", width: 1280, height: 720 },
  ],
  captions: [
    {
      url: "/media/captions-fa.vtt",
      kind: "captions",
      srclang: "fa",
      label: "فارسی",
    },
  ],
};

const mixedGallery: PublicProductMedia[] = [
  img("m-0", 0, "PRIMARY", "دریل چکشی از نمای جلو"),
  img("m-1", 1, "GALLERY", "دریل چکشی از نمای کنار"),
  silentVideo,
  img("m-3", 3, "GALLERY", "دریل چکشی و متعلقات"),
];

describe("MediaGallery", () => {
  it("shows the ready primary image first with reserved intrinsic space", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);

    const stage = screen.getByAltText("دریل چکشی از نمای جلو");
    expect(stage.tagName).toBe("IMG");
    expect(stage).toHaveAttribute("width", "1200");
    expect(stage).toHaveAttribute("height", "1200");
    expect(stage).toHaveAttribute(
      "srcset",
      expect.stringContaining("/media/m-0-480.webp 480w"),
    );
    expect(stage).toHaveAttribute("fetchpriority", "high");
    expect(
      screen.getByText("در حال نمایش دریل چکشی از نمای جلو"),
    ).toBeInTheDocument();
  });

  it("changes the stage when a thumbnail is selected without moving focus", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);

    const thumbnail = screen.getByRole("button", { name: "عکس ۲" });
    thumbnail.focus();
    fireEvent.click(thumbnail);

    expect(screen.getByAltText("دریل چکشی از نمای کنار")).toBeInTheDocument();
    expect(thumbnail).toHaveAttribute("aria-pressed", "true");
    expect(document.activeElement).toBe(thumbnail);
  });

  it("stops previous/next navigation at the gallery ends", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);

    expect(
      screen.queryByRole("button", { name: "تصویر قبلی" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تصویر بعدی" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "تصویر بعدی" }));

    fireEvent.click(screen.getByRole("button", { name: "عکس ۴" }));
    expect(
      screen.queryByRole("button", { name: "تصویر بعدی" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "تصویر قبلی" }),
    ).toBeInTheDocument();
  });

  it("mounts the native video player with lazy source attachment and captions", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);
    const videoThumb = screen.getByRole("button", { name: "ویدیو ۳" });
    expect(videoThumb).toHaveTextContent("۳:۰۳");

    fireEvent.click(videoThumb);

    const video = document.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("controls");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("preload", "metadata");
    expect(video).toHaveAttribute("poster", "/media/poster-1-480.webp");
    expect(video).not.toHaveAttribute("autoplay");
    expect(video).not.toHaveAttribute("muted");
    expect(video!.querySelector("source")).toHaveAttribute(
      "src",
      "/media/video-1.mp4",
    );
    const tracks = Array.from(video!.querySelectorAll("track"));
    expect(tracks.map((track) => track.getAttribute("srclang"))).toEqual([
      "fa",
    ]);
    expect(tracks[0].getAttribute("label")).toBe("فارسی");
    expect(tracks[0].getAttribute("src")).toBe("/media/captions-fa.vtt");
  });

  it("does not attach the video byte source before the video is selected", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);
    expect(document.querySelector("video")).toBeNull();
    expect(document.querySelector('source[type="video/mp4"]')).toBeNull();
  });

  it("shows a Persian failure fallback with a retry action on video error", () => {
    render(<MediaGallery media={mixedGallery} productName="دریل" />);
    fireEvent.click(screen.getByRole("button", { name: "ویدیو ۳" }));

    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.error(video);

    expect(screen.getByText("پخش ویدیو ممکن نیست")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(document.querySelector("video")).not.toBeNull();
  });

  it("renders a descriptive caption for silent demonstration videos", () => {
    const media = [
      img("m-0", 0, "PRIMARY", "دریل از نمای جلو"),
      {
        ...silentVideo,
        position: 1,
        hasAudio: false,
        description: "نمایش نحوه تعویض مته دریل.",
      },
    ];
    render(<MediaGallery media={media} productName="دریل" />);
    fireEvent.click(screen.getByRole("button", { name: "ویدیو ۲" }));

    expect(screen.getByText("نمایش نحوه تعویض مته دریل.")).toBeInTheDocument();
  });

  it("falls back to a safe placeholder when the product has no usable media", () => {
    const { container } = render(
      <MediaGallery media={[]} productName="دریل" />,
    );
    expect(screen.getByAltText("دریل")).toHaveAttribute(
      "src",
      "/images/tool1.jpg",
    );
    expect(container.querySelector("video")).toBeNull();
    expect(container.textContent).not.toContain("فیلم");
  });

  it("uses the provided fallback image when no usable media is available", () => {
    render(
      <MediaGallery
        media={[]}
        productName="دریل"
        fallbackImage="/images/hero1.jpg"
      />,
    );
    expect(screen.getByAltText("دریل")).toHaveAttribute(
      "src",
      "/images/hero1.jpg",
    );
  });

  it("ignores media items that have no usable sources", () => {
    const broken: PublicProductMedia[] = [
      img("m-0", 0, "PRIMARY", "دریل از نمای جلو"),
      { ...img("m-broken", 1, "GALLERY", "عکس خراب"), sources: [] },
      {
        ...silentVideo,
        poster: { ...silentVideo.poster, sources: [] },
        sources: [],
      },
    ];
    render(<MediaGallery media={broken} productName="دریل" />);

    expect(screen.getByAltText("دریل از نمای جلو")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "عکس ۲" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /ویدیو/ }),
    ).not.toBeInTheDocument();
  });

  it("does not show thumbnails for single-asset galleries", () => {
    render(
      <MediaGallery
        media={[img("m-0", 0, "PRIMARY", "دریل از نمای جلو")]}
        productName="دریل"
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("recovers cleanly when the underlying gallery changes mid-session", () => {
    const { rerender } = render(
      <MediaGallery media={mixedGallery} productName="دریل" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "ویدیو ۳" }));
    const video = document.querySelector("video") as HTMLVideoElement;
    fireEvent.error(video);
    expect(screen.getByText("پخش ویدیو ممکن نیست")).toBeInTheDocument();

    rerender(
      <MediaGallery
        media={[img("n-0", 0, "PRIMARY", "دریل جدید")]}
        productName="دریل"
      />,
    );
    expect(screen.getByAltText("دریل جدید")).toBeInTheDocument();
  });
});
