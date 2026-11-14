import { useRef, useState, type CSSProperties } from "react";
import type { DoorMaterial, DoorType } from "@iranyaragh/contracts";

/** Visual-only preview. It never computes price; the server quote is authoritative. */
type Finish = { fill: string; mirror: boolean; label: string };

function doorFinish(material: DoorMaterial | undefined): Finish {
  const text = `${material?.configuration.color ?? ""} ${material?.title ?? ""}`;
  const mirror = text.includes("آینه");
  const smoke = text.includes("دودی");
  const dark = text.includes("تیره");
  const light = text.includes("روشن");
  if (mirror && smoke)
    return {
      mirror,
      label: "آینه دودی",
      fill: "linear-gradient(125deg,#2f3236 0%,#6b7076 38%,#3a3d42 55%,#8a9096 78%,#34373b 100%)",
    };
  if (mirror)
    return {
      mirror,
      label: "آینه ساده",
      fill: "linear-gradient(125deg,#b9c1c8 0%,#f4f7f9 35%,#c5ccd2 52%,#ffffff 72%,#aeb6bd 100%)",
    };
  if (text.includes("برنز"))
    return { mirror, label: "برنزی", fill: "rgba(150,98,48,0.62)" };
  if (smoke)
    return {
      mirror,
      label: dark ? "دودی تیره" : light ? "دودی روشن" : "دودی",
      fill: dark ? "rgba(38,40,44,0.8)" : "rgba(96,102,110,0.6)",
    };
  return { mirror, label: "ساده", fill: "rgba(186,226,232,0.45)" };
}

const MAX_BOX = 250; // px for the tallest object in the scene
const PERSON_MM = 1700;

export function DoorPreview3D({
  widthMm,
  heightMm,
  type,
  material,
}: {
  widthMm: number;
  heightMm: number;
  type: DoorType;
  material: DoorMaterial | undefined;
}) {
  const sample = !(widthMm > 0 && heightMm > 0);
  const w = widthMm > 0 ? widthMm : 900;
  const h = heightMm > 0 ? heightMm : 2100;
  const scale = Math.min(MAX_BOX / Math.max(h, PERSON_MM), 230 / w);
  const W = Math.max(1, w * scale);
  const H = Math.max(1, h * scale);
  const framed = type === "DECOFIX";
  const T = framed ? 10 : 5; // exaggerated depth so the slab reads as 3D
  const profile = framed ? Math.max(4, 35 * scale) : 0;
  const finish = doorFinish(material);

  const [angle, setAngle] = useState(-28);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; a: number } | null>(null);

  const face = (extra: CSSProperties): CSSProperties => ({
    position: "absolute",
    backfaceVisibility: "hidden",
    ...extra,
  });
  const edge = framed ? "#9aa0a7" : "rgba(170,205,200,0.9)";
  const glass = (
    <div
      style={{
        position: "absolute",
        inset: profile,
        background: finish.fill,
        borderRadius: framed ? 1 : 3,
        boxShadow: framed
          ? "inset 0 0 0 1px rgba(0,0,0,0.25)"
          : "inset 0 0 0 1px rgba(255,255,255,0.5)",
        overflow: "hidden",
      }}
    >
      {/* light streak */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: finish.mirror
            ? "linear-gradient(105deg,transparent 30%,rgba(255,255,255,0.35) 42%,transparent 50%)"
            : "linear-gradient(105deg,transparent 25%,rgba(255,255,255,0.45) 35%,transparent 45%,transparent 60%,rgba(255,255,255,0.25) 66%,transparent 72%)",
        }}
      />
    </div>
  );
  const leafFace = (back: boolean) => (
    <div
      style={face({
        width: W,
        height: H,
        transform: `${back ? "rotateY(180deg) " : ""}translateZ(${T / 2}px)`,
        background: framed
          ? "linear-gradient(90deg,#c3c8ce,#e6e9ec 50%,#b5bbc2)"
          : "transparent",
        borderRadius: framed ? 2 : 3,
      })}
    >
      {glass}
      {/* handle */}
      <div
        style={{
          position: "absolute",
          [back ? "right" : "left"]: Math.max(6, W * 0.08),
          top: H * 0.38,
          width: 4,
          height: Math.max(18, H * 0.22),
          borderRadius: 3,
          background: "linear-gradient(90deg,#6b7280,#e5e7eb,#6b7280)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
        }}
      />
      {/* frameless patch fittings on the hinge side */}
      {!framed &&
        [0.06, 0.88].map((y) => (
          <div
            key={y}
            style={{
              position: "absolute",
              [back ? "left" : "right"]: 0,
              top: H * y,
              width: Math.max(8, W * 0.1),
              height: Math.max(6, H * 0.05),
              background: "linear-gradient(180deg,#d1d5db,#9ca3af)",
              borderRadius: 1,
            }}
          />
        ))}
    </div>
  );

  return (
    <div className="rounded-2xl bg-gradient-to-b from-slate-100 to-slate-50 p-4">
      <div
        role="img"
        aria-label={`پیش‌نمایش سه‌بعدی درب ${framed ? "دکوفیکس" : "فریم‌لس"} با ${finish.label}، عرض ${w} و ارتفاع ${h} میلی‌متر`}
        className="relative mx-auto flex h-[300px] cursor-grab touch-none select-none items-end justify-center active:cursor-grabbing"
        style={{ perspective: 900 }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, a: angle };
          setDragging(true);
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            setAngle(
              Math.max(
                -80,
                Math.min(
                  80,
                  drag.current.a + (e.clientX - drag.current.x) * 0.5,
                ),
              ),
            );
        }}
        onPointerUp={() => {
          drag.current = null;
          setDragging(false);
        }}
        onPointerCancel={() => {
          drag.current = null;
          setDragging(false);
        }}
      >
        {/* scale reference: 170 cm person */}
        <div
          aria-hidden="true"
          className="absolute bottom-6 flex flex-col items-center opacity-30"
          style={{ height: PERSON_MM * scale, insetInlineStart: 8 }}
        >
          <div
            className="aspect-square w-[22%] min-w-[10px] rounded-full bg-slate-500"
            style={{ height: PERSON_MM * scale * 0.13 }}
          />
          <div
            className="mt-0.5 flex-1 rounded-t-full bg-slate-500"
            style={{ width: PERSON_MM * scale * 0.22 }}
          />
          <span className="absolute -bottom-5 whitespace-nowrap text-[10px] text-slate-700">
            ۱۷۰ سانتی‌متر
          </span>
        </div>
        <div
          className="relative mb-6 transition-transform duration-500 ease-in-out motion-reduce:transition-none"
          style={{
            width: W,
            height: H,
            transformStyle: "preserve-3d",
            transform: `rotateX(-6deg) rotateY(${angle}deg)`,
            transition: dragging ? "none" : undefined,
          }}
        >
          {/* floor shadow */}
          <div
            style={{
              position: "absolute",
              left: -W * 0.15,
              width: W * 1.3,
              height: 60,
              top: H - 30,
              transform: "rotateX(90deg)",
              background:
                "radial-gradient(ellipse at center,rgba(15,23,42,0.28),transparent 70%)",
            }}
          />
          {/* leaf, hinged on the right edge */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              transformStyle: "preserve-3d",
              transformOrigin: "right center",
              transform: `rotateY(${open ? 70 : 0}deg)`,
            }}
            className="transition-transform duration-700 motion-reduce:transition-none"
          >
            {leafFace(false)}
            {leafFace(true)}
            {/* edges: centred on each border, then turned 90° out of the plane */}
            {[-T / 2, W - T / 2].map((left) => (
              <div
                key={`v${left}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left,
                  width: T,
                  height: H,
                  background: edge,
                  transform: "rotateY(90deg)",
                }}
              />
            ))}
            {[-T / 2, H - T / 2].map((top) => (
              <div
                key={`h${top}`}
                style={{
                  position: "absolute",
                  left: 0,
                  top,
                  width: W,
                  height: T,
                  background: edge,
                  transform: "rotateX(90deg)",
                }}
              />
            ))}
          </div>
        </div>
        {/* dimension labels (2D) */}
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded bg-white/90 px-2 text-xs font-bold text-slate-700"
          dir="rtl"
        >
          ← عرض {w.toLocaleString("fa-IR")} →
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          {sample ? "ابعاد نمونه — " : ""}
          {(w / 10).toLocaleString("fa-IR")} ×{" "}
          {(h / 10).toLocaleString("fa-IR")} سانتی‌متر ·{" "}
          {((w * h) / 1e6).toLocaleString("fa-IR", {
            maximumFractionDigits: 2,
          })}{" "}
          متر مربع · {finish.label}
        </span>
        <span className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold focus-visible:ring-2 focus-visible:ring-orange-700"
            onClick={() => setOpen((v) => !v)}
            aria-pressed={open}
          >
            {open ? "بستن درب" : "باز کردن درب"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold focus-visible:ring-2 focus-visible:ring-orange-700"
            onClick={() => setAngle((a) => (a > 0 ? -28 : 28))}
          >
            چرخش
          </button>
        </span>
      </div>
      <p className="mt-2 text-center text-[11px] leading-5 text-slate-500">
        برای چرخاندن، روی تصویر بکشید. پیش‌نمایش تقریبی است و ابعاد و رنگ نهایی
        هنگام ساخت بررسی می‌شود.
      </p>
    </div>
  );
}
