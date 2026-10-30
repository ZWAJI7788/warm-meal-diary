import { useEffect, useMemo, useState } from "react";
import { Camera, Loader2, Move, Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Dish, Meal, MealDraft, Placement } from "@/lib/types";
import { deleteImage, deleteMeal, listMeals, putImage, putMeal } from "@/lib/db";
import { forgetImageUrl } from "@/lib/useImage";
import { formatCost, formatMonth, formatMonthDay, relativeDay, todayISO, weekdayCN } from "@/lib/date";
import { defaultPlacements } from "@/lib/placement";
import { MEAL_ORDER, mealKindMeta } from "@/lib/mealKinds";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { DateStrip } from "@/components/DateStrip";
import { MealCard } from "@/components/MealCard";
import { MealEditor } from "@/components/MealEditor";
import { PlatingDialog } from "@/components/PlatingDialog";
import { BowlMark } from "@/components/BowlMark";
import { WeatherCard } from "@/components/WeatherCard";

function sortMeals(list: Meal[]) {
  return [...list].sort((a, b) =>
    a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1,
  );
}

function upsert(list: Meal[], meal: Meal) {
  const index = list.findIndex((item) => item.id === meal.id);
  if (index < 0) return [...list, meal];
  const next = [...list];
  next[index] = meal;
  return next;
}

export default function App() {
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | "all">("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [platingMeal, setPlatingMeal] = useState<Meal | null>(null);

  useEffect(() => {
    let alive = true;
    listMeals()
      .then((list) => {
        if (alive) setMeals(list);
      })
      .catch((error: unknown) => {
        if (!alive) return;
        setLoadError(error instanceof Error ? error.message : "读取本地记录失败了");
        setMeals([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const allMeals = meals ?? [];
  const dates = useMemo(() => new Set(allMeals.map((meal) => meal.date)), [allMeals]);

  const filtered = useMemo(
    () => allMeals.filter((meal) => filter === "all" || meal.date === filter),
    [allMeals, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, Meal[]>();
    filtered.forEach((meal) => {
      const list = map.get(meal.date) ?? [];
      list.push(meal);
      map.set(meal.date, list);
    });
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({
        date,
        meals: items.sort(
          (a, b) => MEAL_ORDER[a.kind] - MEAL_ORDER[b.kind] || a.createdAt - b.createdAt,
        ),
      }));
  }, [filtered]);

  // 顶部小结跟着日期条走：选中哪天就看哪天，没选时看今天；下面的月小结跟着同一月。
  const focusDate = filter === "all" ? todayISO() : filter;
  const dayTotals = useMemo(() => {
    const meals = allMeals.filter((meal) => meal.date === focusDate);
    return {
      meals: meals.length,
      dishes: meals.reduce((sum, meal) => sum + meal.dishes.length, 0),
      spending: meals.reduce((sum, meal) => sum + (meal.cost ?? 0), 0),
    };
  }, [allMeals, focusDate]);

  const monthTotals = useMemo(() => {
    const month = focusDate.slice(0, 7);
    const meals = allMeals.filter((meal) => meal.date.startsWith(month));
    return {
      days: new Set(meals.map((meal) => meal.date)).size,
      meals: meals.length,
      dishes: meals.reduce((sum, meal) => sum + meal.dishes.length, 0),
      spending: meals.reduce((sum, meal) => sum + (meal.cost ?? 0), 0),
    };
  }, [allMeals, focusDate]);

  const openNew = () => {
    setEditingMeal(null);
    setEditorOpen(true);
  };

  const openEdit = (meal: Meal) => {
    setEditingMeal(meal);
    setEditorOpen(true);
  };

  const saveDraft = async (draft: MealDraft) => {
    const prepared: Dish[] = [];
    for (const dish of draft.dishes) {
      let cutoutKey = dish.cutoutKey;
      let sourceKey = dish.sourceKey;
      if (dish.cutoutBlob) {
        cutoutKey = `cutout-${dish.id}`;
        await putImage(cutoutKey, dish.cutoutBlob);
      }
      if (dish.sourceBlob) {
        sourceKey = `source-${dish.id}`;
        await putImage(sourceKey, dish.sourceBlob);
      }
      if (!cutoutKey) throw new Error("有菜品缺少图片，请重新添加一次");
      prepared.push({
        id: dish.id,
        name: dish.name.trim(),
        cutoutKey,
        sourceKey: sourceKey ?? cutoutKey,
        crop: dish.crop,
        tolerance: dish.tolerance,
        opaque: dish.opaque,
        aspect: dish.aspect,
      });
    }

    const validIds = new Set(prepared.map((dish) => dish.id));
    const placement = defaultPlacements(
      prepared,
      Object.fromEntries(Object.entries(draft.placement).filter(([id]) => validIds.has(id))),
    );
    const existing = allMeals.find((meal) => meal.id === draft.id);
    const meal: Meal = {
      id: draft.id,
      date: draft.date,
      kind: draft.kind,
      place: draft.place,
      mood: draft.mood,
      cost: draft.cost,
      story: draft.story,
      dishes: prepared,
      placement,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    await putMeal(meal);
    if (draft.removedImageKeys.length) {
      await Promise.all(
        draft.removedImageKeys.map((key) => {
          forgetImageUrl(key);
          return deleteImage(key);
        }),
      );
    }
    setMeals((prev) => sortMeals(upsert(prev ?? [], meal)));
    toast.success(existing ? "这一餐改好了" : "这一餐记下了", {
      description: `${formatMonthDay(meal.date)} · ${mealKindMeta(meal.kind).label} · ${meal.dishes.length} 道菜`,
    });
  };

  const removeMeal = async (meal: Meal) => {
    try {
      await deleteMeal(meal.id);
      await Promise.all(
        meal.dishes
          .flatMap((dish) => [dish.cutoutKey, dish.sourceKey])
          .map((key) => {
            forgetImageUrl(key);
            return deleteImage(key);
          }),
      );
      setMeals((prev) => (prev ?? []).filter((item) => item.id !== meal.id));
      if (platingMeal?.id === meal.id) setPlatingMeal(null);
      toast.success("这一餐已经撤掉了");
    } catch {
      toast.error("删除失败，再试一次");
    }
  };

  const savePlating = async (meal: Meal, placement: Record<string, Placement>) => {
    const updated: Meal = { ...meal, placement, updatedAt: Date.now() };
    await putMeal(updated);
    setMeals((prev) => sortMeals(upsert(prev ?? [], updated)));
    toast.success("摆盘收好了", { description: "下次打开还是这个摆法" });
  };

  const defaultDate = filter === "all" ? todayISO() : filter;

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="page-glow" />
      <div className="page-grain" />

      <header className="sticky top-0 z-40 border-b border-line/60 bg-cream/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <BowlMark className="size-9" />
            <div className="leading-tight">
              <p className="font-serif text-[1.05rem] tracking-[0.06em] text-ink">一日三餐</p>
              <p className="mt-0.5 text-[10px] tracking-[0.3em] text-ink-soft/80">饭桌日记</p>
            </div>
          </div>
          <Button
            type="button"
            onClick={openNew}
            className="h-10 gap-1.5 rounded-full bg-clay px-4 text-xs text-paper shadow-[0_16px_26px_-18px_rgba(143,76,50,.95)] transition-colors hover:bg-clay-deep"
          >
            <Plus className="size-4" />
            记录一餐
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-7 sm:px-6 sm:pt-10">
        <section className="animate-rise">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.35em] text-clay/80">好好吃饭</p>
              <h1 className="mt-2 font-serif text-[1.8rem] leading-[1.35] text-ink sm:text-[2.35rem]">
                今天，也要好好吃饭<span className="text-clay">。</span>
              </h1>
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-ink-soft">
                记录美食每刻，收藏三餐里的小幸福。
              </p>
            </div>
            <div className="shrink-0 self-start">
              <WeatherCard />
            </div>
          </div>
          {allMeals.length > 0 ? (
            <div className="mt-4 space-y-2.5">
              <div className="flex flex-wrap gap-2">
                {dayTotals.meals > 0 ? (
                  <>
                    <span className="rounded-full border border-line/80 bg-paper/70 px-3 py-1 text-[11px] text-ink-soft">
                      {relativeDay(focusDate) || formatMonthDay(focusDate)} · 已记{" "}
                      <span className="font-serif text-sm text-clay-deep">{dayTotals.meals}</span> 餐
                    </span>
                    <span className="rounded-full border border-line/80 bg-paper/70 px-3 py-1 text-[11px] text-ink-soft">
                      <span className="font-serif text-sm text-clay-deep">{dayTotals.dishes}</span> 道菜
                    </span>
                    {dayTotals.spending > 0 ? (
                      <span className="rounded-full border border-line/80 bg-paper/70 px-3 py-1 text-[11px] text-ink-soft">
                        共花费{" "}
                        <span className="font-serif text-sm text-clay-deep">{formatCost(dayTotals.spending)}</span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="rounded-full border border-dashed border-line/90 bg-paper/50 px-3 py-1 text-[11px] text-ink-soft/80">
                    {relativeDay(focusDate) || formatMonthDay(focusDate)} · 还没记
                  </span>
                )}
              </div>
              {monthTotals.meals > 0 ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-line/70 bg-paper/55 px-3.5 py-2.5 text-[11px] text-ink-soft">
                  <span className="font-serif text-[13px] tracking-[0.04em] text-clay-deep">
                    {formatMonth(focusDate)}小结
                  </span>
                  <span>
                    <span className="font-serif text-[13px] text-clay-deep">{monthTotals.days}</span> 天有记录
                  </span>
                  <span>
                    <span className="font-serif text-[13px] text-clay-deep">{monthTotals.meals}</span> 餐
                  </span>
                  <span>
                    <span className="font-serif text-[13px] text-clay-deep">{monthTotals.dishes}</span> 道菜
                  </span>
                  {monthTotals.spending > 0 ? (
                    <span>
                      共花费 <span className="font-serif text-[13px] text-clay-deep">{formatCost(monthTotals.spending)}</span>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="mt-7">
          <DateStrip value={filter} onChange={setFilter} dates={dates} />
        </div>

        {loadError ? (
          <p className="mt-6 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            {loadError}
          </p>
        ) : null}

        {meals === null ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-ink-soft">
            <Loader2 className="size-6 animate-spin text-clay/70" />
            <p className="text-xs">正在把饭桌收拾出来…</p>
          </div>
        ) : allMeals.length === 0 ? (
          <section className="card-soft animate-rise mt-7 rounded-[2rem] px-6 py-10 text-center sm:px-10 sm:py-12">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-secondary/60">
              <BowlMark className="size-10" />
            </div>
            <h2 className="mt-4 font-serif text-[1.35rem] text-ink">从今天的第一顿饭开始</h2>
            <p className="mx-auto mt-2 max-w-[19rem] text-[12px] leading-relaxed text-ink-soft/75 sm:max-w-lg">
              拍一张饭菜照片，桌面和盘子会自动隐去，只留下菜；
              <br className="sm:hidden" />
              一餐几道菜，就分开框出来。
            </p>
            <div className="mx-auto mt-7 grid max-w-xl gap-2.5 text-left sm:grid-cols-3">
              {[
                { step: "01", icon: Camera, title: "拍一张", text: "拍下这一餐，或者从相册选一张" },
                { step: "02", icon: Sparkles, title: "自动抠图", text: "背景自动去掉，只留下菜本身" },
                { step: "03", icon: Move, title: "摆盘记录", text: "把菜拖到盘子里，记下味道和故事" },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-line/70 bg-paper/60 px-3.5 py-3">
                  <div className="flex items-center justify-between">
                    <item.icon className="size-4 text-clay" />
                    <span className="font-serif text-xs text-clay/60">{item.step}</span>
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ink-soft">{item.text}</p>
                </div>
              ))}
            </div>
            <Button
              type="button"
              onClick={openNew}
              className="mt-7 h-11 gap-1.5 rounded-full bg-clay px-6 text-sm text-paper shadow-[0_18px_30px_-18px_rgba(143,76,50,.95)] hover:bg-clay-deep"
            >
              <Plus className="size-4" />
              记录第一餐
            </Button>
          </section>
        ) : groups.length === 0 ? (
          <section className="card-soft animate-rise mt-7 rounded-[2rem] px-6 py-10 text-center">
            <p className="font-serif text-lg text-ink">{formatMonthDay(filter === "all" ? todayISO() : filter)}还没有记录</p>
            <p className="mt-1.5 text-xs text-ink-soft">换个日子看看，或者把这一天补上。</p>
            <Button
              type="button"
              onClick={openNew}
              className="mt-5 h-10 gap-1.5 rounded-full bg-clay px-5 text-xs text-paper hover:bg-clay-deep"
            >
              <Plus className="size-4" />
              记下这一餐
            </Button>
          </section>
        ) : (
          <div className="mt-7 space-y-9">
            {groups.map((group) => {
              const groupCost = group.meals.reduce((sum, meal) => sum + (meal.cost ?? 0), 0);
              const relative = relativeDay(group.date);
              return (
                <section key={group.date}>
                  <div className="flex items-end justify-between gap-3 border-b border-dashed border-line/90 pb-2">
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-serif text-xl text-ink">{formatMonthDay(group.date)}</h2>
                      <span className="text-xs text-ink-soft">{weekdayCN(group.date)}</span>
                      {relative ? (
                        <span className="rounded-full bg-clay/10 px-2 py-0.5 text-[10px] text-clay-deep">{relative}</span>
                      ) : null}
                    </div>
                    <span className="text-[11px] text-ink-soft/90">
                      {group.meals.length} 餐
                      {groupCost > 0 ? ` · ${formatCost(groupCost)}` : ""}
                    </span>
                  </div>
                  <div className="mt-3.5 grid gap-4 md:grid-cols-2">
                    {group.meals.map((meal) => (
                      <MealCard
                        key={meal.id}
                        meal={meal}
                        onEdit={openEdit}
                        onPlate={setPlatingMeal}
                        onDelete={removeMeal}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>

      <footer className="border-t border-line/60 py-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 text-center text-[11px] leading-relaxed text-ink-soft/80 sm:px-6">
          <p>照片和记录只保存在这台设备的浏览器里，清理浏览器数据会一并清空。</p>
          <p className="font-kai text-[12px] text-ink-soft/70">把饭吃好，就是一件很幸福的事。</p>
        </div>
      </footer>

      <MealEditor
        open={editorOpen}
        meal={editingMeal}
        defaultDate={defaultDate}
        onClose={() => {
          setEditorOpen(false);
          setEditingMeal(null);
        }}
        onSave={saveDraft}
        onDelete={removeMeal}
      />

      <PlatingDialog meal={platingMeal} onClose={() => setPlatingMeal(null)} onSave={savePlating} />

      <Toaster
        position="top-center"
        toastOptions={{
          className: "font-sans",
          style: {
            background: "#fffaf2",
            color: "#3f332a",
            border: "1px solid #e8d9c6",
            borderRadius: "16px",
          },
        }}
      />
    </div>
  );
}
