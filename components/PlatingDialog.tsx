import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { Layers, Move, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import type { Meal, Placement } from "@/lib/types";
import { defaultPlacements } from "@/lib/placement";
import { formatMonthDay, weekdayCN } from "@/lib/date";
import { mealKindMeta } from "@/lib/mealKinds";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DishSprite } from "./DishSprite";
import { PlateSurface } from "./PlateScene";
import { cn } from "@/lib/utils";

interface PlatingDialogProps {
  meal: Meal | null;
  onClose: () => void;
  onSave: (meal: Meal, placement: Record<string, Placement>) => Promise<void>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function PlatingDialog({ meal, onClose, onSave }: PlatingDialogProps) {
  const [spots, setSpots] = useState<Record<string, Placement>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!meal) return;
    setSpots(defaultPlacements(meal.dishes, meal.placement));
    setSelected(meal.dishes[0]?.id ?? null);
    setError(null);
    setSaving(false);
    dragRef.current = null;
  }, [meal]);

  if (!meal) return null;

  const kind = mealKindMeta(meal.kind);

  const updateSelected = (patch: (placement: Placement, all: Record<string, Placement>) => Placement) => {
    if (!selected) return;
    setSpots((prev) => {
      const current = prev[selected];
      if (!current) return prev;
      return { ...prev, [selected]: patch(current, prev) };
    });
  };

  const front = (id: string) => {
    setSpots((prev) => {
      const current = prev[id];
      if (!current) return prev;
      const max = Math.max(0, ...Object.values(prev).map((item) => item.z));
      return { ...prev, [id]: { ...current, z: max + 1 } };
    });
  };

  const startDrag = (event: PointerEvent<HTMLImageElement>, id: string) => {
    event.preventDefault();
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const point = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
    const current = spots[id];
    if (!current) return;
    board.setPointerCapture(event.pointerId);
    dragRef.current = { id, dx: point.x - current.x, dy: point.y - current.y };
    setSelected(id);
    setSpots((prev) => {
      const nextZ = Math.max(0, ...Object.values(prev).map((item) => item.z)) + 1;
      const placement = prev[id];
      if (!placement) return prev;
      return { ...prev, [id]: { ...placement, z: nextZ } };
    });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const board = boardRef.current;
    if (!drag || !board) return;
    const rect = board.getBoundingClientRect();
    const x = clamp((event.clientX - rect.left) / rect.width - drag.dx, 0.03, 0.97);
    const y = clamp((event.clientY - rect.top) / rect.height - drag.dy, 0.03, 0.97);
    setSpots((prev) => {
      const placement = prev[drag.id];
      if (!placement) return prev;
      return { ...prev, [drag.id]: { ...placement, x, y } };
    });
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    if (boardRef.current?.hasPointerCapture(event.pointerId)) {
      boardRef.current.releasePointerCapture(event.pointerId);
    }
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(meal, spots);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存摆盘失败，再试一次");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent className="max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-4xl gap-0 overflow-y-auto rounded-[1.75rem] border-line bg-paper p-0 sm:max-w-4xl">
        <div className="p-4 sm:p-6">
          <DialogHeader className="flex-row items-start justify-between gap-3 pr-8 sm:items-center">
            <div>
              <DialogTitle className="font-serif text-2xl text-ink">摆盘</DialogTitle>
              <DialogDescription className="mt-1 text-xs text-ink-soft">
                {formatMonthDay(meal.date)} · {weekdayCN(meal.date)} · {kind.label} · {meal.dishes.length} 道菜
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setSpots(defaultPlacements(meal.dishes))}
                className="h-9 gap-1.5 rounded-full px-3 text-xs text-ink-soft hover:text-clay-deep"
              >
                <Undo2 className="size-3.5" />
                重新摆
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={saving}
                className="h-9 rounded-full bg-clay px-4 text-xs text-paper shadow-[0_14px_24px_-18px_rgba(143,76,50,.95)] hover:bg-clay-deep"
              >
                {saving ? "保存中…" : "摆好了"}
              </Button>
            </div>
          </DialogHeader>

          <div
            ref={boardRef}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="mt-4 select-none"
            style={{ touchAction: "none" }}
          >
            <PlateSurface className="aspect-[4/3] rounded-[1.5rem] border border-line/70">
              {meal.dishes.map((dish) => {
                const spot = spots[dish.id];
                if (!spot) return null;
                return (
                  <DishSprite
                    key={dish.id}
                    dish={dish}
                    placement={spot}
                    interactive
                    selected={selected === dish.id}
                    className="will-change-transform"
                    onPointerDown={(event) => startDrag(event, dish.id)}
                  />
                );
              })}
              {selected ? (
                <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-[#2b1f16]/55 px-2.5 py-1 text-[10px] text-paper/90 backdrop-blur-sm">
                  {meal.dishes.find((dish) => dish.id === selected)?.name}
                </div>
              ) : null}
            </PlateSurface>
          </div>

          <div className="mt-3 flex flex-col gap-3 rounded-2xl bg-secondary/45 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
              {meal.dishes.map((dish) => {
                const active = selected === dish.id;
                return (
                  <button
                    key={dish.id}
                    type="button"
                    onClick={() => {
                      setSelected(dish.id);
                      front(dish.id);
                    }}
                    aria-pressed={active}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1.5 text-[11px] transition-colors",
                      active
                        ? "border-clay/50 bg-paper text-clay-deep shadow-sm"
                        : "border-transparent bg-paper/50 text-ink-soft hover:text-ink",
                    )}
                  >
                    {dish.name}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="缩小"
                disabled={!selected}
                onClick={() => updateSelected((placement) => ({ ...placement, scale: clamp(placement.scale / 1.12, 0.25, 2.8) }))}
                className="rounded-full border-line bg-paper"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="放大"
                disabled={!selected}
                onClick={() => updateSelected((placement) => ({ ...placement, scale: clamp(placement.scale * 1.12, 0.25, 2.8) }))}
                className="rounded-full border-line bg-paper"
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="向左转"
                disabled={!selected}
                onClick={() => updateSelected((placement) => ({ ...placement, rot: placement.rot - 15 }))}
                className="rounded-full border-line bg-paper"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="向右转"
                disabled={!selected}
                onClick={() => updateSelected((placement) => ({ ...placement, rot: placement.rot + 15 }))}
                className="rounded-full border-line bg-paper"
              >
                <RotateCw className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="移到盘子中间"
                disabled={!selected}
                onClick={() => updateSelected((placement) => ({ ...placement, x: 0.5, y: 0.5 }))}
                className="rounded-full border-line bg-paper"
              >
                <Move className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="放到最上层"
                disabled={!selected}
                onClick={() => updateSelected((placement, all) => ({ ...placement, z: Math.max(0, ...Object.values(all).map((item) => item.z)) + 1 }))}
                className="rounded-full border-line bg-paper"
              >
                <Layers className="size-3.5" />
              </Button>
            </div>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-ink-soft/85">
            拖动菜品换位置，点选菜品后用右边的按钮放大、旋转或叠放。摆好之后会作为这一餐的样子保存下来。
          </p>
          {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
