import { MapPin, Move, Pencil, Trash2 } from "lucide-react";
import type { Meal } from "@/lib/types";
import { formatCost } from "@/lib/date";
import { mealKindMeta } from "@/lib/mealKinds";
import { PlateScene } from "./PlateScene";
import { Button } from "@/components/ui/button";
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

interface MealCardProps {
  meal: Meal;
  onEdit: (meal: Meal) => void;
  onPlate: (meal: Meal) => void;
  onDelete: (meal: Meal) => void;
}

export function MealCard({ meal, onEdit, onPlate, onDelete }: MealCardProps) {
  const kind = mealKindMeta(meal.kind);
  const cost = formatCost(meal.cost);
  const dishNames = meal.dishes.map((dish) => dish.name).join(" · ");

  return (
    <article className="card-soft animate-rise flex flex-col overflow-hidden rounded-[1.75rem]">
      <div className="relative">
        <PlateScene dishes={meal.dishes} placement={meal.placement} hint={<span className="text-xs text-ink-soft">这一餐还没有菜</span>} />
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full border border-line/70 bg-paper/85 px-2.5 py-1 text-[11px] font-medium text-ink shadow-sm backdrop-blur-sm">
          <kind.Icon className="size-3.5" style={{ color: kind.tint }} />
          {kind.label}
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onPlate(meal)}
          className="absolute right-3 top-3 h-8 gap-1 rounded-full border border-line/70 bg-paper/85 px-2.5 text-[11px] text-ink-soft shadow-sm backdrop-blur-sm hover:bg-paper hover:text-clay-deep"
        >
          <Move className="size-3.5" />
          摆盘
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-serif text-[1.12rem] leading-snug text-ink">{dishNames || "这一餐"}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12px] text-ink-soft">
              {meal.place ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5 opacity-70" />
                  {meal.place}
                </span>
              ) : null}
              {meal.mood ? (
                <span className="inline-flex items-center gap-1">
                  <span className="size-1 rounded-full bg-honey" />
                  {meal.mood}
                </span>
              ) : null}
            </div>
          </div>
          {cost ? (
            <span className="shrink-0 rounded-full bg-secondary/80 px-2.5 py-1 font-serif text-sm text-clay-deep">{cost}</span>
          ) : null}
        </div>

        {meal.story ? (
          <p className="line-clamp-4 border-l-2 border-honey/40 pl-3 font-kai text-[14.5px] leading-[1.75] text-ink-soft">
            {meal.story}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(meal)}
            className="h-8 gap-1.5 rounded-full px-2.5 text-xs text-ink-soft hover:bg-secondary/60 hover:text-clay-deep"
          >
            <Pencil className="size-3.5" />
            编辑
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="删除这一餐"
                className="text-ink-soft/70 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-[1.5rem] border-line bg-paper">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-serif text-xl text-ink">撤掉这一餐？</AlertDialogTitle>
                <AlertDialogDescription className="text-sm text-ink-soft">
                  这一餐的菜品照片和小故事都会一起删除，删掉之后就找不回来了。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">留着</AlertDialogCancel>
                <AlertDialogAction
                  className="rounded-full bg-destructive text-white hover:bg-destructive/90"
                  onClick={() => onDelete(meal)}
                >
                  删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </article>
  );
}
