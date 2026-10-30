import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { MapPin, Plus, Trash2, X } from "lucide-react";
import type { EditableDish, Meal, MealDraft, MealKind, Placement } from "@/lib/types";
import { guessMealKind, MEAL_KINDS } from "@/lib/mealKinds";
import { todayISO } from "@/lib/date";
import { placesEnabled } from "@/lib/places";
import { useImageUrl } from "@/lib/useImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DishStudio } from "./DishStudio";
import { PlacePicker } from "./PlacePicker";
import { cn } from "@/lib/utils";

const MOODS = ["满足", "清爽", "暖胃", "解馋", "有点想家"];

function DishThumb({ dish }: { dish: EditableDish }) {
  const stored = useImageUrl(dish.cutoutKey);
  const [local, setLocal] = useState<string>();
  useEffect(() => {
    if (!dish.cutoutBlob) {
      setLocal(undefined);
      return;
    }
    const url = URL.createObjectURL(dish.cutoutBlob);
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [dish.cutoutBlob]);
  const url = local ?? stored;
  if (!url) return null;
  return (
    <img
      src={url}
      alt={dish.name}
      draggable={false}
      className={cn(
        "max-h-full max-w-full object-contain",
        dish.opaque ? "rounded-lg shadow-[0_10px_20px_-16px_rgba(62,40,24,.7)]" : "dish-shadow",
      )}
    />
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-ink">{label}</span>
        {hint ? <span className="text-[10px] text-ink-soft/80">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

interface MealEditorProps {
  open: boolean;
  meal: Meal | null;
  defaultDate: string;
  onClose: () => void;
  onSave: (draft: MealDraft) => Promise<void>;
  onDelete: (meal: Meal) => Promise<void> | void;
}

export function MealEditor({ open, meal, defaultDate, onClose, onSave, onDelete }: MealEditorProps) {
  const [date, setDate] = useState(defaultDate);
  const [kind, setKind] = useState<MealKind>(guessMealKind());
  const [place, setPlace] = useState("");
  const [mood, setMood] = useState("");
  const [cost, setCost] = useState("");
  const [story, setStory] = useState("");
  const [dishes, setDishes] = useState<EditableDish[]>([]);
  const [placement, setPlacement] = useState<Record<string, Placement>>({});
  const [removedKeys, setRemovedKeys] = useState<string[]>([]);
  const [studioOpen, setStudioOpen] = useState(false);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setStudioOpen(false);
      setPlacePickerOpen(false);
      return;
    }
    setDate(meal?.date ?? defaultDate);
    setKind(meal?.kind ?? guessMealKind());
    setPlace(meal?.place ?? "");
    setMood(meal?.mood ?? "");
    setCost(meal?.cost != null ? String(meal.cost) : "");
    setStory(meal?.story ?? "");
    setDishes(meal ? meal.dishes.map((dish) => ({ ...dish })) : []);
    setPlacement(meal?.placement ?? {});
    setRemovedKeys([]);
    setError(null);
    setSaving(false);
  }, [open, meal, defaultDate]);

  const addDish = (dish: EditableDish) => {
    setDishes((prev) => [...prev, dish]);
    setError(null);
  };

  const removeDish = (dish: EditableDish) => {
    setDishes((prev) => prev.filter((item) => item.id !== dish.id));
    setPlacement((prev) => {
      const next = { ...prev };
      delete next[dish.id];
      return next;
    });
    const keys = [dish.cutoutKey, dish.sourceKey].filter((key): key is string => Boolean(key));
    if (keys.length) setRemovedKeys((prev) => [...prev, ...keys]);
  };

  const submit = async () => {
    if (!dishes.length) {
      setError("先加一道菜，再把这一餐记下来");
      return;
    }
    if (dishes.some((dish) => !dish.name.trim())) {
      setError("每道菜都需要一个名字");
      return;
    }
    const parsed = Number(cost);
    setSaving(true);
    setError(null);
    try {
      await onSave({
        id: meal?.id ?? crypto.randomUUID(),
        date,
        kind,
        place: place.trim(),
        mood: mood.trim(),
        cost: cost.trim() === "" || Number.isNaN(parsed) ? null : parsed,
        story: story.trim(),
        dishes,
        placement,
        removedImageKeys: removedKeys,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败了，再试一次");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
        <DialogContent className="max-h-[93dvh] w-[calc(100%-1.5rem)] max-w-3xl gap-0 overflow-y-auto rounded-[1.75rem] border-line bg-paper p-0 sm:max-w-3xl">
          <div className="p-5 sm:p-7">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl text-ink">{meal ? "改一改这一餐" : "记下这一餐"}</DialogTitle>
              <DialogDescription className="text-xs leading-relaxed text-ink-soft">
                整张放进来，或者框出一道菜，要不要去背由你决定。地点、花费和故事，都是以后翻回来的理由。
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="哪一天">
                  <Input
                    type="date"
                    value={date}
                    max={todayISO()}
                    onChange={(event) => setDate(event.target.value || todayISO())}
                    className="h-10 rounded-xl border-line bg-paper text-sm"
                  />
                </Field>
                <Field label="哪一餐">
                  <div className="grid grid-cols-4 gap-1 rounded-xl bg-secondary/60 p-1">
                    {MEAL_KINDS.map((item) => {
                      const active = item.key === kind;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setKind(item.key)}
                          aria-pressed={active}
                          className={cn(
                            "flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] transition-colors",
                            active ? "bg-paper text-clay-deep shadow-sm" : "text-ink-soft hover:text-ink",
                          )}
                        >
                          <item.Icon className="size-3.5" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="在哪儿吃的" hint={placesEnabled() ? "可以从地图选" : undefined}>
                  <div className="flex items-center gap-2">
                    <Input
                      value={place}
                      maxLength={30}
                      placeholder="家里 · 楼下小馆 · 公司食堂"
                      onChange={(event) => setPlace(event.target.value)}
                      className="h-10 min-w-0 flex-1 rounded-xl border-line bg-paper text-sm"
                    />
                    {placesEnabled() ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPlacePickerOpen(true)}
                        className="h-10 shrink-0 gap-1 rounded-xl border-clay/30 bg-paper px-3 text-[11px] text-clay-deep hover:bg-secondary/50"
                      >
                        <MapPin className="size-3.5" />
                        地图
                      </Button>
                    ) : null}
                  </div>
                </Field>
                <Field label="花了多少" hint="可不填">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-serif text-sm text-ink-soft">
                      ¥
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.5"
                      value={cost}
                      placeholder="0"
                      onChange={(event) => setCost(event.target.value)}
                      className="h-10 rounded-xl border-line bg-paper pl-7 text-sm"
                    />
                  </div>
                </Field>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-medium text-ink">这一口的心情</span>
                <div className="flex flex-wrap gap-1.5">
                  {MOODS.map((item) => {
                    const active = mood === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setMood(active ? "" : item)}
                        aria-pressed={active}
                        className={cn(
                          "rounded-full border px-3 py-1 text-[11px] transition-colors",
                          active
                            ? "border-clay/50 bg-clay text-paper"
                            : "border-line/90 bg-paper text-ink-soft hover:border-clay/40 hover:text-ink",
                        )}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
                <Input
                  value={mood}
                  maxLength={24}
                  placeholder="也可以自己写一句"
                  onChange={(event) => setMood(event.target.value)}
                  className="h-9 rounded-xl border-line bg-paper text-xs"
                  aria-label="心情"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-ink">
                    菜品 <span className="font-normal text-ink-soft/80">{dishes.length > 0 ? `· ${dishes.length} 道` : ""}</span>
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setStudioOpen(true)}
                    className="h-8 gap-1 rounded-full border-clay/30 bg-paper px-3 text-[11px] text-clay-deep hover:bg-secondary/50"
                  >
                    <Plus className="size-3.5" />
                    添加菜品
                  </Button>
                </div>

                {dishes.length ? (
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                    {dishes.map((dish) => (
                      <div key={dish.id} className="group relative">
                        <div
                          className={cn(
                            "grid aspect-square place-items-center overflow-hidden rounded-2xl border border-line/80 p-2",
                            dish.opaque ? "bg-secondary/40" : "checker",
                          )}
                        >
                          <DishThumb dish={dish} />
                        </div>
                        <p className="mt-1 truncate text-center text-[11px] text-ink">{dish.name}</p>
                        <button
                          type="button"
                          onClick={() => removeDish(dish)}
                          aria-label={`移除${dish.name}`}
                          className="absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full border border-line bg-paper text-ink-soft shadow-sm transition-colors hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setStudioOpen(true)}
                      className="grid aspect-square place-items-center rounded-2xl border border-dashed border-clay/30 bg-secondary/25 text-clay transition-colors hover:border-clay/60 hover:bg-secondary/50"
                    >
                      <span className="flex flex-col items-center gap-1">
                        <Plus className="size-4" />
                        <span className="text-[10px]">再加一道</span>
                      </span>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStudioOpen(true)}
                    className="flex w-full flex-col items-center gap-1.5 rounded-2xl border border-dashed border-clay/30 bg-secondary/25 py-6 text-clay transition-colors hover:border-clay/60 hover:bg-secondary/50"
                  >
                    <Plus className="size-5" />
                    <span className="text-xs">上传照片，加第一道菜</span>
                    <span className="text-[10px] text-ink-soft/80">整张放进来，或框出一道菜</span>
                  </button>
                )}
              </div>

              <Field label="这顿饭的故事" hint="可不填">
                <Textarea
                  value={story}
                  maxLength={400}
                  placeholder="和谁一起吃的？味道像什么？为什么今天想吃它……"
                  onChange={(event) => setStory(event.target.value)}
                  className="min-h-24 rounded-2xl border-line bg-paper font-kai text-[14.5px] leading-[1.8]"
                />
              </Field>

              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>

            <div className="mt-6 flex items-center justify-between gap-3 border-t border-line/70 pt-4">
              {meal ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 gap-1.5 rounded-full px-2.5 text-xs text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                      删除这一餐
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-[1.5rem] border-line bg-paper">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="font-serif text-xl text-ink">撤掉这一餐？</AlertDialogTitle>
                      <AlertDialogDescription className="text-sm text-ink-soft">
                        照片和小故事会一起删除，删掉之后就找不回来了。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-full">留着</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-full bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => {
                          onDelete(meal);
                          onClose();
                        }}
                      >
                        删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : (
                <span />
              )}

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onClose}
                  className="h-9 rounded-full border-line bg-paper px-4 text-xs text-ink-soft"
                >
                  先不记
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={submit}
                  disabled={saving}
                  className="h-9 rounded-full bg-clay px-5 text-xs text-paper shadow-[0_14px_24px_-18px_rgba(143,76,50,.95)] hover:bg-clay-deep"
                >
                  {saving ? "保存中…" : "记下来"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DishStudio open={studioOpen} onOpenChange={setStudioOpen} onAdd={addDish} addedCount={dishes.length} />
      <PlacePicker open={placePickerOpen} onOpenChange={setPlacePickerOpen} onPick={setPlace} />
    </>
  );
}
