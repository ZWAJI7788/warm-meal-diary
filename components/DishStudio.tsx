import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Brush, Camera, Check, Crop, Eraser, Image as ImageIcon, Loader2, RefreshCw, RotateCcw, Scissors, Sparkles } from "lucide-react";
import type { CropRect, EditableDish } from "@/lib/types";
import { cropPhoto, removeFoodBackground } from "@/lib/cutout";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface Photo {
  blob: Blob;
  url: string;
}

interface Preview {
  url: string;
  blob: Blob;
  aspect: number;
  /** true when the picture stays opaque (whole photo or crop without removal) */
  opaque: boolean;
  removed: boolean;
  /** Where the cutout sits inside the original photo, so brush "restore" can bring photo pixels back */
  sourceRect?: { x: number; y: number; w: number; h: number };
}

type StudioMode = "whole" | "crop";
type Corner = "nw" | "ne" | "sw" | "se";
type Point = { x: number; y: number };
type Gesture =
  | { kind: "new"; from: Point; to: Point }
  | { kind: "move"; start: Point; base: CropRect }
  | { kind: "resize"; corner: Corner; start: Point; base: CropRect };

interface DishStudioProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (dish: EditableDish) => void;
  addedCount: number;
}

const MIN_BOX = 0.06;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function boxFrom(from: Point, to: Point): CropRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    w: Math.abs(to.x - from.x),
    h: Math.abs(to.y - from.y),
  };
}

function strengthLabel(value: number) {
  if (value < 20) return "很轻柔";
  if (value < 30) return "标准";
  if (value < 40) return "比较彻底";
  return "只留菜本身";
}

export function DishStudio({ open, onOpenChange, onAdd, addedCount }: DishStudioProps) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [mode, setMode] = useState<StudioMode>("whole");
  const [peel, setPeel] = useState(true);
  const [crop, setCrop] = useState<CropRect | null>(null);
  const [strength, setStrength] = useState(26);
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [brush, setBrush] = useState<"erase" | "restore">("erase");
  const [brushSize, setBrushSize] = useState(6);
  const [edited, setEdited] = useState<{ blob: Blob; url: string; aspect: number } | null>(null);

  const surfaceRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const nextMode = useRef<StudioMode>("whole");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const restoreRef = useRef<HTMLCanvasElement | null>(null);
  const editedUrlRef = useRef<string | null>(null);
  const editedOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const painting = useRef(false);
  const lastPoint = useRef<Point | null>(null);
  const cursorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setMode("whole");
    setPeel(true);
    setCrop(null);
    setStrength(26);
    setGesture(null);
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setName("");
    setNameError(false);
    setError(null);
    setBusy(false);
    setEditing(false);
    setBrush("erase");
    setBrushSize(6);
    editedOffsetRef.current = { x: 0, y: 0 };
    setEdited((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      editedUrlRef.current = null;
      return null;
    });
  }, [open]);

  useEffect(() => {
    if (!photo) {
      setPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return null;
      });
      return;
    }
    const cutting = mode === "crop" && peel;
    const area = mode === "crop" ? crop : null;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setBusy(true);
      setEditing(false);
      editedOffsetRef.current = { x: 0, y: 0 };
      setEdited((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        editedUrlRef.current = null;
        return null;
      });
      try {
        let blob: Blob;
        let aspect: number;
        let removed = true;
        let sourceRect: Preview["sourceRect"];
        if (cutting) {
          const result = await removeFoodBackground(photo.blob, area, strength);
          blob = result.blob;
          aspect = result.aspect;
          removed = result.removed;
          sourceRect = result.source;
        } else {
          const result = await cropPhoto(photo.blob, area);
          blob = result.blob;
          aspect = result.aspect;
        }
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setPreview((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { url, blob, aspect, opaque: !cutting, removed, sourceRect };
        });
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "图片没处理好，换一张试试");
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [photo, mode, peel, crop, strength]);

  // Seed the brush canvas from the cutout (or from an earlier round of edits).
  useEffect(() => {
    if (!editing || !preview) return;
    let cancelled = false;
    const load = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("修边用的图片没准备好"));
        image.src = url;
      });
    void (async () => {
      try {
        const baseImage = await load(preview.url);
        const current = editedUrlRef.current ? await load(editedUrlRef.current) : baseImage;
        if (cancelled) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = baseImage.naturalWidth;
        canvas.height = baseImage.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(current, editedOffsetRef.current.x, editedOffsetRef.current.y);
        const base = document.createElement("canvas");
        base.width = canvas.width;
        base.height = canvas.height;
        base.getContext("2d")?.drawImage(baseImage, 0, 0);
        baseRef.current = base;

        // The photo layer sits under the cutout, so "restore" can paint back what the
        // auto cutout threw away — plate edge, table, a whole missing corner.
        const rect = preview.sourceRect;
        restoreRef.current = null;
        if (rect && photo) {
          try {
            const photoImage = await load(photo.url);
            if (cancelled) return;
            const layer = document.createElement("canvas");
            layer.width = canvas.width;
            layer.height = canvas.height;
            layer
              .getContext("2d")
              ?.drawImage(photoImage, rect.x, rect.y, rect.w, rect.h, 0, 0, layer.width, layer.height);
            restoreRef.current = layer;
          } catch {
            restoreRef.current = null;
          }
        }
      } catch {
        if (!cancelled) setError("修边用的图片没准备好，换一张试试");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, preview, photo]);

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  };

  const brushRadius = () => {
    const canvas = canvasRef.current;
    if (!canvas) return 4;
    return Math.max(3, (Math.min(canvas.width, canvas.height) * brushSize) / 100 / 2);
  };

  const strokeSegment = (from: Point, to: Point) => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const radius = brushRadius();
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(distance / Math.max(2, radius * 0.55)));
    for (let step = 1; step <= steps; step += 1) {
      const x = from.x + ((to.x - from.x) * step) / steps;
      const y = from.y + ((to.y - from.y) * step) / steps;
      if (brush === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = "source-over";
        ctx.drawImage(restoreRef.current ?? base, 0, 0);
        ctx.restore();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  };

  const moveCursor = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const node = cursorRef.current;
    if (!canvas || !node) return;
    const rect = canvas.getBoundingClientRect();
    const size = brushRadius() * 2 * (rect.width / canvas.width);
    node.style.width = `${size}px`;
    node.style.height = `${size}px`;
    node.style.left = `${event.clientX - rect.left}px`;
    node.style.top = `${event.clientY - rect.top}px`;
    node.style.opacity = "1";
  };

  const hideCursor = () => {
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
  };

  const startBrush = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    painting.current = true;
    const point = canvasPoint(event);
    lastPoint.current = point;
    strokeSegment(point, point);
    moveCursor(event);
  };

  const dragBrush = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    moveCursor(event);
    if (!painting.current) return;
    const point = canvasPoint(event);
    strokeSegment(lastPoint.current ?? point, point);
    lastPoint.current = point;
  };

  const endBrush = () => {
    if (!painting.current) return;
    painting.current = false;
    lastPoint.current = null;
    hideCursor();
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Strokes can leave transparent margins, so export only the part that still has pixels.
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (data[(y * canvas.width + x) * 4 + 3] > 6) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    const empty = maxX < 0;
    const sx = empty ? 0 : Math.max(0, minX - 1);
    const sy = empty ? 0 : Math.max(0, minY - 1);
    const sw = empty ? canvas.width : Math.min(canvas.width - sx, maxX - minX + 3);
    const sh = empty ? canvas.height : Math.min(canvas.height - sy, maxY - minY + 3);
    const out = document.createElement("canvas");
    out.width = sw;
    out.height = sh;
    out.getContext("2d")?.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    out.toBlob((blob) => {
      if (!blob) return;
      editedOffsetRef.current = { x: sx, y: sy };
      setEdited((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        const url = URL.createObjectURL(blob);
        editedUrlRef.current = url;
        return { blob, url, aspect: sw / sh };
      });
    }, "image/png");
  };

  const resetBrush = () => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    editedOffsetRef.current = { x: 0, y: 0 };
    setEdited((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      editedUrlRef.current = null;
      return null;
    });
  };

  const pick = (wanted: StudioMode) => {
    nextMode.current = wanted;
    photoInputRef.current?.click();
  };

  const chooseFile = (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("请选择一张图片");
      return;
    }
    const url = URL.createObjectURL(file);
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob: file, url };
    });
    setMode(nextMode.current);
    setPeel(true);
    setCrop(null);
    setGesture(null);
    setName("");
    setNameError(false);
    setError(null);
  };

  const pointOf = (clientX: number, clientY: number): Point => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp((clientX - rect.left) / rect.width, 0, 1),
      y: clamp((clientY - rect.top) / rect.height, 0, 1),
    };
  };

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || mode !== "crop") return;
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const point = pointOf(event.clientX, event.clientY);
    surfaceRef.current?.setPointerCapture(event.pointerId);

    if (crop) {
      const corners: Record<Corner, Point> = {
        nw: { x: crop.x, y: crop.y },
        ne: { x: crop.x + crop.w, y: crop.y },
        sw: { x: crop.x, y: crop.y + crop.h },
        se: { x: crop.x + crop.w, y: crop.y + crop.h },
      };
      const hit = (Object.keys(corners) as Corner[]).find((corner) => {
        const spot = corners[corner];
        return (
          Math.abs((point.x - spot.x) * rect.width) <= 20 &&
          Math.abs((point.y - spot.y) * rect.height) <= 20
        );
      });
      if (hit) {
        setGesture({ kind: "resize", corner: hit, start: point, base: crop });
        return;
      }
      const inside =
        point.x >= crop.x && point.x <= crop.x + crop.w && point.y >= crop.y && point.y <= crop.y + crop.h;
      if (inside) {
        setGesture({ kind: "move", start: point, base: crop });
        return;
      }
    }
    setGesture({ kind: "new", from: point, to: point });
  };

  const dragGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!gesture) return;
    const point = pointOf(event.clientX, event.clientY);
    if (gesture.kind === "new") {
      setGesture({ ...gesture, to: point });
      return;
    }
    const dx = point.x - gesture.start.x;
    const dy = point.y - gesture.start.y;
    if (gesture.kind === "move") {
      setCrop({
        ...gesture.base,
        x: clamp(gesture.base.x + dx, 0, 1 - gesture.base.w),
        y: clamp(gesture.base.y + dy, 0, 1 - gesture.base.h),
      });
      return;
    }
    const { base, corner } = gesture;
    let left = base.x;
    let right = base.x + base.w;
    let top = base.y;
    let bottom = base.y + base.h;
    if (corner === "nw" || corner === "sw") left = clamp(base.x + dx, 0, right - MIN_BOX);
    if (corner === "ne" || corner === "se") right = clamp(right + dx, left + MIN_BOX, 1);
    if (corner === "nw" || corner === "ne") top = clamp(base.y + dy, 0, bottom - MIN_BOX);
    if (corner === "sw" || corner === "se") bottom = clamp(bottom + dy, top + MIN_BOX, 1);
    setCrop({ x: left, y: top, w: right - left, h: bottom - top });
  };

  const endGesture = () => {
    if (!gesture) return;
    if (gesture.kind === "new") {
      const box = boxFrom(gesture.from, gesture.to);
      if (box.w > 0.045 && box.h > 0.045) setCrop(box);
    }
    setGesture(null);
  };

  const liveBox = gesture?.kind === "new" ? boxFrom(gesture.from, gesture.to) : crop;

  const addDish = () => {
    if (!photo || !preview || busy) return;
    const clean = name.trim();
    if (!clean) {
      setNameError(true);
      return;
    }
    const cutting = mode === "crop" && peel;
    onAdd({
      id: crypto.randomUUID(),
      name: clean,
      cutoutBlob: edited?.blob ?? preview.blob,
      sourceBlob: photo.blob,
      crop: mode === "crop" ? crop : null,
      tolerance: cutting ? strength : 0,
      opaque: !cutting,
      aspect: edited?.aspect ?? preview.aspect,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-4xl gap-0 overflow-y-auto rounded-[1.75rem] border-line bg-paper p-0 sm:max-w-4xl">
        <div className="p-5 sm:p-7">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-ink">把菜端出来</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-ink-soft">
              整张照片原样放进来，或者框出一道菜。要不要去背，你自己说了算。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-5 md:grid-cols-[1.12fr_1fr]">
            <div className="space-y-3">
              {photo ? (
                <>
                  <div className="grid grid-cols-2 gap-1 rounded-full bg-secondary/60 p-1">
                    {(
                      [
                        { key: "whole", label: "整张照片", Icon: ImageIcon },
                        { key: "crop", label: "框选一块", Icon: Crop },
                      ] as const
                    ).map((item) => {
                      const active = mode === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setMode(item.key)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-8 items-center justify-center gap-1.5 rounded-full text-[11px] transition-colors",
                            active ? "bg-paper text-clay-deep shadow-sm" : "text-ink-soft hover:text-ink",
                          )}
                        >
                          <item.Icon className="size-3.5" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex min-h-[220px] items-center justify-center rounded-2xl bg-secondary/50 p-2">
                    <div
                      ref={surfaceRef}
                      className={cn(
                        "relative max-w-full touch-none select-none overflow-hidden rounded-xl shadow-[0_18px_30px_-24px_rgba(90,55,30,.8)]",
                        mode === "crop" ? "cursor-crosshair" : "cursor-default",
                      )}
                      onPointerDown={beginGesture}
                      onPointerMove={dragGesture}
                      onPointerUp={endGesture}
                      onPointerCancel={() => setGesture(null)}
                    >
                      <img
                        src={photo.url}
                        alt="待处理的照片"
                        draggable={false}
                        className="block max-h-[46vh] w-auto max-w-full rounded-xl"
                      />
                      {mode === "crop" ? (
                        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                          <defs>
                            <mask id="crop-dim">
                              <rect x="0" y="0" width="100" height="100" fill="white" />
                              {liveBox ? (
                                <rect x={liveBox.x * 100} y={liveBox.y * 100} width={liveBox.w * 100} height={liveBox.h * 100} rx="1.2" fill="black" />
                              ) : null}
                            </mask>
                          </defs>
                          {liveBox ? (
                            <rect x="0" y="0" width="100" height="100" fill="rgba(43,31,22,0.42)" mask="url(#crop-dim)" />
                          ) : null}
                          {liveBox ? (
                            <rect
                              x={liveBox.x * 100}
                              y={liveBox.y * 100}
                              width={liveBox.w * 100}
                              height={liveBox.h * 100}
                              fill="none"
                              stroke="#f7ddbd"
                              strokeWidth="1.6"
                              vectorEffect="non-scaling-stroke"
                              rx="1.2"
                            />
                          ) : null}
                        </svg>
                      ) : null}
                      {mode === "crop" && crop && !gesture ? (
                        <div className="pointer-events-none absolute inset-0">
                          {(["nw", "ne", "sw", "se"] as const).map((corner) => (
                            <span
                              key={corner}
                              className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-clay bg-paper shadow-sm"
                              style={{
                                left: `${(corner === "nw" || corner === "sw" ? crop.x : crop.x + crop.w) * 100}%`,
                                top: `${(corner === "nw" || corner === "ne" ? crop.y : crop.y + crop.h) * 100}%`,
                              }}
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className="pointer-events-none absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#2b1f16]/70 px-2.5 py-1 text-[10px] text-paper/90 backdrop-blur-sm">
                        <Scissors className="size-3" />
                        {mode === "whole"
                          ? "整张照片，原样放入"
                          : crop
                            ? "拖动框内可移动，拉四角可微调"
                            : "在照片上拖出一道菜"}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-full border-line bg-paper text-xs text-ink-soft"
                      onClick={() => pick(mode)}
                    >
                      <RefreshCw className="size-3.5" />
                      换一张
                    </Button>
                    {mode === "crop" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5 rounded-full text-xs text-ink-soft"
                        onClick={() => setCrop(null)}
                      >
                        <Crop className="size-3.5" />
                        重新框选
                      </Button>
                    ) : null}
                    {mode === "crop" && crop ? <span className="text-[11px] text-clay-deep">已框选这道菜</span> : null}
                  </div>
                </>
              ) : (
                <div className="flex h-[280px] w-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-clay/35 bg-secondary/40 px-6 text-center">
                  <span className="grid size-12 place-items-center rounded-full bg-paper text-clay shadow-sm">
                    <Camera className="size-5" />
                  </span>
                  <span className="font-serif text-lg text-ink">拍下这一餐</span>
                  <span className="max-w-[16rem] text-xs leading-relaxed text-ink-soft">
                    整张照片直接放进来，或者框出一道菜，再决定要不要去背。
                  </span>
                  <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => pick("whole")}
                      className="h-9 gap-1.5 rounded-full bg-clay px-4 text-xs text-paper hover:bg-clay-deep"
                    >
                      <ImageIcon className="size-3.5" />
                      整张照片
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => pick("crop")}
                      className="h-9 gap-1.5 rounded-full border-clay/30 bg-paper px-4 text-xs text-clay-deep hover:bg-secondary/50"
                    >
                      <Crop className="size-3.5" />
                      框出一道菜
                    </Button>
                  </div>
                </div>
              )}

              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  chooseFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </div>

            <div className="flex flex-col gap-4">
              <div
                className={cn(
                  "relative grid min-h-[150px] place-items-center overflow-hidden rounded-2xl border p-3",
                  preview?.opaque ? "h-[150px] border-line/70 bg-secondary/30 sm:h-[190px]" : "checker border-line/80",
                )}
                style={
                  !editing && preview && !preview.opaque
                    ? { aspectRatio: `${Math.min(Math.max(edited?.aspect ?? preview.aspect, 0.75), 1.6)}` }
                    : undefined
                }
              >
                {editing && preview ? (
                  <div className="relative inline-flex max-w-full">
                    <canvas
                      ref={canvasRef}
                      className="block max-h-[42vh] w-auto max-w-full touch-none rounded-md"
                      onPointerDown={startBrush}
                      onPointerMove={dragBrush}
                      onPointerUp={endBrush}
                      onPointerCancel={endBrush}
                      onPointerLeave={hideCursor}
                      aria-label="修边画板"
                    />
                    <div
                      ref={cursorRef}
                      className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-clay/80 bg-paper/25 opacity-0 shadow-sm"
                    />
                  </div>
                ) : preview ? (
                  <img
                    src={edited?.url ?? preview.url}
                    alt="菜品预览"
                    className={cn(
                      "max-h-[27vh] w-auto max-w-full object-contain",
                      preview.opaque ? "rounded-lg" : "dish-shadow",
                    )}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-center text-[11px] leading-relaxed text-ink-soft/80">
                    <Sparkles className="size-5 text-clay/60" />
                    {photo ? (busy ? "正在准备这张照片…" : "这里会显示最后的样子") : "选一张照片，这里会显示最后的样子"}
                  </div>
                )}
                {busy && preview ? (
                  <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-paper/90 px-2 py-1 text-[10px] text-ink-soft shadow-sm">
                    <Loader2 className="size-3 animate-spin" />
                    更新中
                  </div>
                ) : null}
                {preview && !preview.opaque && !busy && !editing ? (
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-paper/90 px-2.5 py-1 text-[10px] text-clay-deep shadow-sm transition-colors hover:bg-paper"
                  >
                    <Brush className="size-3" />
                    修边
                  </button>
                ) : null}
                {edited && !editing ? (
                  <span className="absolute bottom-2 left-2 rounded-full bg-clay/85 px-2 py-0.5 text-[10px] text-paper">已修边</span>
                ) : null}
              </div>

              {editing ? (
                <div className="space-y-2 rounded-xl border border-line/80 bg-paper/70 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-full bg-secondary/60 p-0.5">
                      {(
                        [
                          { key: "erase", label: "擦掉", Icon: Eraser },
                          { key: "restore", label: "恢复", Icon: RotateCcw },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setBrush(item.key)}
                          aria-pressed={brush === item.key}
                          className={cn(
                            "flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] transition-colors",
                            brush === item.key ? "bg-paper text-clay-deep shadow-sm" : "text-ink-soft hover:text-ink",
                          )}
                        >
                          <item.Icon className="size-3" />
                          {item.label}
                        </button>
                      ))}
                    </div>
                    <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-ink-soft">
                      细
                      <Slider
                        value={[brushSize]}
                        min={2}
                        max={14}
                        step={1}
                        onValueChange={(value) => setBrushSize(value[0] ?? 6)}
                        aria-label="笔刷大小"
                        className="w-24"
                      />
                      粗
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetBrush}
                      className="h-7 gap-1 rounded-full px-2 text-[11px] text-ink-soft"
                    >
                      <RotateCcw className="size-3" />
                      重置
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setEditing(false)}
                      className="h-7 gap-1 rounded-full bg-clay px-3 text-[11px] text-paper hover:bg-clay-deep"
                    >
                      <Check className="size-3" />
                      修好了
                    </Button>
                  </div>
                  <p className="text-[10px] leading-relaxed text-ink-soft/80">
                    擦掉多出来的桌面和盘边；切到“恢复”，连自动去背时删掉的边角也能补回来。
                  </p>
                </div>
              ) : null}

              {mode === "crop" && !editing ? (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-line/80 bg-paper/70 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-medium text-ink">去掉桌面和盘子</p>
                    <p className="mt-0.5 text-[10px] text-ink-soft/80">
                      {peel ? "只留下菜本身" : "保留照片原来的背景"}
                    </p>
                  </div>
                  <Switch checked={peel} onCheckedChange={setPeel} aria-label="去掉桌面和盘子" />
                </div>
              ) : null}

              {preview && !preview.opaque && !preview.removed && !editing ? (
                <p className="rounded-xl bg-honey/15 px-3 py-2 text-[11px] leading-relaxed text-[#8a5a2b]">
                  这张照片的桌面和菜颜色太接近，先保留了整张图。把“去背强度”往右调一点试试。
                </p>
              ) : null}

              {mode === "crop" && peel && !editing ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">去背强度</span>
                    <span className="text-[11px] text-clay-deep">{strengthLabel(strength)}</span>
                  </div>
                  <Slider
                    value={[strength]}
                    min={8}
                    max={46}
                    step={1}
                    onValueChange={(value) => setStrength(value[0] ?? 26)}
                    aria-label="去背强度"
                  />
                  <div className="flex justify-between text-[10px] text-ink-soft/80">
                    <span>多留一点边缘</span>
                    <span>去得更干净</span>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1.5">
                <label htmlFor="dish-name" className="text-xs font-medium text-ink">
                  这道菜叫什么
                </label>
                <Input
                  id="dish-name"
                  value={name}
                  maxLength={24}
                  placeholder="比如：番茄炒蛋"
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addDish();
                    }
                  }}
                  aria-invalid={nameError}
                  className="h-10 rounded-xl border-line bg-paper text-sm"
                />
                {nameError ? <p className="text-[11px] text-destructive">先给它起个名字吧</p> : null}
              </div>

              {error ? <p className="text-[11px] text-destructive">{error}</p> : null}

              <Button
                type="button"
                onClick={addDish}
                disabled={!preview || busy || !photo}
                className="h-11 w-full gap-2 rounded-full bg-clay text-sm text-paper shadow-[0_16px_28px_-18px_rgba(143,76,50,.95)] hover:bg-clay-deep"
              >
                <Check className="size-4" />
                加入这一餐
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-soft/85">加入后会直接回到这一餐，接着填地点和故事。</p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3 border-t border-line/70 pt-4">
            <span className={cn("text-xs", addedCount > 0 ? "text-clay-deep" : "text-ink-soft/70")}>
              {addedCount > 0 ? `这一餐已经有 ${addedCount} 道菜` : "还没有加入菜品"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-full border-line bg-paper px-4 text-xs text-ink"
            >
              完成
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
