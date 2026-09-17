import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type {
  PublicProductMedia,
  PublicProductMediaImage,
} from "@iranyaragh/contracts";
import { ChevronLeft, ChevronRight, Play, AlertTriangle } from "lucide-react";
import { toPersianDigits } from "../../lib/format";

const PLACEHOLDER_IMAGE = "/images/tool1.jpg";

type StageMedia =
  | { kind: "IMAGE"; item: PublicProductMediaImage; label: string }
  | {
      kind: "VIDEO";
      item: Extract<PublicProductMedia, { kind: "VIDEO" }>;
      label: string;
    };

function hasUsableSource(item: PublicProductMediaImage): boolean {
  return item.sources.length > 0;
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${toPersianDigits(minutes)}:${toPersianDigits(String(seconds).padStart(2, "0"))}`;
}

function pickBestSource(
  item: PublicProductMediaImage,
): PublicProductMediaImage["sources"][number] | undefined {
  // Intrinsic width/height are authoritative. The stage never upscales, so the
  // largest available source that still fits the container ratio is preferred.
  return item.sources[item.sources.length - 1] ?? item.sources[0];
}

/**
 * Ordered, responsive product media gallery (primary image first).
 *
 * Behavior follows PRODUCT_MEDIA_SPEC §2:
 * - only the poster/primary is loaded initially; the video source byte stream
 *   is attached when the user actually selects the video;
 * - selecting a thumbnail changes the stage without moving keyboard focus;
 * - previous/next controls stop at the ends (no silent wrap);
 * - playback stays on the native `<video>` baseline (no autoplay, no muted
 *   default), with a Persian failure fallback + retry action;
 * - intrinsic aspect-ratio space is reserved to avoid CLS.
 */
export function MediaGallery({
  media,
  productName,
  badge,
  fallbackImage,
}: {
  media: PublicProductMedia[];
  productName: string;
  badge?: string | null;
  fallbackImage?: string;
}) {
  const items = useMemo(() => {
    return media
      .filter((item): item is StageMedia["item"] => {
        if (item.kind === "IMAGE") return hasUsableSource(item);
        if (item.kind === "VIDEO")
          return item.sources.length > 0 && item.poster.sources.length > 0;
        return false;
      })
      .sort((a, b) => a.position - b.position);
  }, [media]);

  const itemIds = items.map((item) => item.id).join("|");
  const [selection, setSelection] = useState<{
    ids: string;
    id: string | null;
  }>({ ids: "", id: null });
  const [videoFailedId, setVideoFailedId] = useState<string | null>(null);
  if (selection.ids !== itemIds) {
    const primaryIndex = items.findIndex(
      (item) => item.kind === "IMAGE" && item.role === "PRIMARY",
    );
    const initial =
      primaryIndex >= 0 ? primaryIndex : items.length > 0 ? 0 : -1;
    setSelection({ ids: itemIds, id: initial >= 0 ? items[initial].id : null });
  }
  const activeIndex =
    selection.ids === itemIds
      ? items.findIndex((item) => item.id === selection.id)
      : -1;

  const active = ((): StageMedia | null => {
    const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
    if (!activeItem) return null;
    if (activeItem.kind === "IMAGE")
      return {
        kind: "IMAGE",
        item: activeItem,
        label: activeItem.alt || productName,
      };
    return { kind: "VIDEO", item: activeItem, label: "ویدیو" };
  })();

  if (items.length === 0 || !active) {
    return (
      <div className="relative rounded-[28px] bg-slate-50 overflow-hidden">
        <img
          src={fallbackImage ?? PLACEHOLDER_IMAGE}
          alt={productName}
          className="w-full aspect-square object-cover"
        />
      </div>
    );
  }

  function select(index: number) {
    setSelection({ ids: itemIds, id: items[index].id });
    setVideoFailedId(null);
  }

  function prev() {
    if (activeIndex > 0) select(activeIndex - 1);
  }

  function next() {
    if (activeIndex < items.length - 1) select(activeIndex + 1);
  }

  const stageRatio: CSSProperties = {
    aspectRatio: `${active.item.width} / ${active.item.height}`,
  };

  const videoFailed =
    active.kind === "VIDEO" && videoFailedId === active.item.id;
  const isInitialPrimary =
    active.kind === "IMAGE" &&
    active.item.role === "PRIMARY" &&
    activeIndex ===
      items.findIndex(
        (item) => item.kind === "IMAGE" && item.role === "PRIMARY",
      );

  return (
    <div className="relative rounded-[28px] bg-slate-50 overflow-hidden lg:sticky lg:top-24 self-start">
      <div
        className="relative flex items-center justify-center bg-slate-50"
        style={stageRatio}
      >
        {active.kind === "IMAGE" ? (
          <img
            src={pickBestSource(active.item)!.url}
            srcSet={active.item.sources
              .slice()
              .sort((a, b) => a.width - b.width)
              .map((source) => `${source.url} ${source.width}w`)
              .join(", ")}
            sizes="(min-width: 1024px) 560px, 92vw"
            width={active.item.width}
            height={active.item.height}
            alt={active.item.alt || productName}
            fetchPriority={isInitialPrimary ? "high" : undefined}
            className="w-full h-full object-contain"
          />
        ) : videoFailed ? (
          <div className="text-center px-6 py-10">
            <AlertTriangle
              size={28}
              className="mx-auto text-slate-400"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-bold text-slate-700">
              پخش ویدیو ممکن نیست
            </p>
            <p className="mt-1 text-xs text-slate-500">
              لطفاً کمی بعد دوباره تلاش کنید.
            </p>
            <button
              type="button"
              onClick={() => setVideoFailedId(null)}
              className="mt-4 h-10 px-5 rounded-full bg-[#0F172A] text-white text-sm font-bold hover:bg-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2"
            >
              تلاش دوباره
            </button>
          </div>
        ) : (
          <video
            key={active.item.id}
            controls
            playsInline
            preload="metadata"
            poster={active.item.poster.sources[0].url}
            width={active.item.width}
            height={active.item.height}
            onError={() => setVideoFailedId(active.item.id)}
            className="w-full h-full bg-black"
            aria-label={`ویدیوی ${productName}`}
          >
            <source
              src={active.item.sources[0].url}
              type={active.item.sources[0].type}
            />
            {active.item.captions.map((caption) => (
              <track
                key={caption.url}
                kind={caption.kind}
                srcLang={caption.srclang}
                label={caption.label}
                src={caption.url}
              />
            ))}
          </video>
        )}

        {isInitialPrimary && badge && (
          <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-[#C2410C] text-white text-xs font-black">
            {badge}
          </span>
        )}
      </div>

      {activeIndex > 0 && (
        <button
          type="button"
          onClick={prev}
          aria-label="تصویر قبلی"
          className="absolute top-1/2 right-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center text-slate-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      )}
      {activeIndex < items.length - 1 && (
        <button
          type="button"
          onClick={next}
          aria-label="تصویر بعدی"
          className="absolute top-1/2 left-3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center text-slate-900 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 motion-reduce:transition-none"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      )}

      <span className="sr-only" aria-live="polite">
        {active.kind === "IMAGE"
          ? `در حال نمایش ${active.label}`
          : "در حال نمایش ویدیو"}
      </span>

      {active.kind === "VIDEO" && !active.item.hasAudio && (
        <p className="mx-4 mt-3 text-xs leading-6 text-slate-600">
          {active.item.description}
        </p>
      )}

      {items.length > 1 && (
        <div className="flex gap-2 mt-4 px-4 pb-4 overflow-x-auto">
          {items.map((item, index) => {
            const isActive = index === activeIndex;
            const imageItem = item.kind === "IMAGE" ? item : item.poster;
            const label =
              item.kind === "IMAGE"
                ? `عکس ${toPersianDigits(item.position + 1)}`
                : `ویدیو ${toPersianDigits(item.position + 1)}`;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => select(index)}
                aria-pressed={isActive}
                aria-label={label}
                className={`relative shrink-0 w-[72px] h-14 rounded-xl overflow-hidden bg-white border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D00] focus-visible:ring-offset-2 motion-reduce:transition-none ${isActive ? "border-[#FF4D00]" : "border-slate-200 hover:border-slate-400"}`}
              >
                <img
                  src={pickBestSource(imageItem)!.url}
                  alt=""
                  loading="lazy"
                  width={imageItem.width}
                  height={imageItem.height}
                  className="w-full h-full object-cover"
                />
                {item.kind === "VIDEO" && (
                  <>
                    <span
                      className="absolute inset-0 flex items-center justify-center bg-black/30"
                      aria-hidden="true"
                    >
                      <Play size={16} className="fill-white text-white" />
                    </span>
                    {item.durationMs > 0 && (
                      <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-black/70 text-white text-[9px] font-bold">
                        {formatDuration(item.durationMs)}
                      </span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
