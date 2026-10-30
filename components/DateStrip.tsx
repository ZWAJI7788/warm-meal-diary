import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import {
  addDays,
  dayNumber,
  formatMonthDay,
  parseISO,
  startOfWeek,
  todayISO,
  weekdayShort,
  weeksBetween,
  weekDates,
} from "@/lib/date";
import { cn } from "@/lib/utils";

const PHRASES: Record<number, string[]> = {
  1: [
    "周一了，先好好吃顿早饭，再慢慢开工。",
    "新的一周，从一碗热乎的开始。",
    "周一有点长，中午记得坐下来好好吃。",
    "开工第一天，别让午饭在路上将就。",
    "一周的第一口，吃点让自己踏实的。",
    "周一难免忙，饭还是要按时吃。",
    "今天先不着急，把饭吃暖了再往前赶。",
    "周一的好心情，可以从一顿早餐借来。",
  ],
  2: [
    "周二了，日子慢慢进入节奏，饭也要好好吃。",
    "忙到一半，记得给自己留一顿热饭的时间。",
    "今天不必很厉害，吃好一顿就够了。",
    "周二适合吃点好的，给后半周攒点力气。",
    "平平常常的周二，也值得一顿认真的饭。",
    "手头的事再多，也别忘了那碗汤。",
    "周二的傍晚，慢慢吃，慢慢缓过来。",
    "今天吃到什么好吃的了？记下来吧。",
  ],
  3: [
    "周三了，一周过半，给自己加个菜。",
    "走到周三，最该犒劳的是自己。",
    "中间这一天，吃顿舒服的，别硬撑。",
    "周三的饭，可以吃得从容一点。",
    "半周过去啦，今晚想吃点什么？",
    "周三有点累，就多吃一口喜欢的。",
    "日子走到一半，热气腾腾地继续。",
    "把周三吃好，周末就不远了。",
  ],
  4: [
    "周四了，再坚持一下，好饭在等你。",
    "快到周末了，今天也好好吃饭。",
    "周四的胃口，最懂你想吃什么。",
    "再忙一天就歇了，先吃口热的。",
    "周四适合慢慢吃，把力气留到周末。",
    "今天这顿，算是给自己的小小奖励。",
    "一周的尾巴快到了，饭要吃得香一点。",
    "周四也想被好好对待，从一顿饭开始。",
  ],
  5: [
    "周五啦，今晚这顿可以吃得久一点。",
    "一周快收尾了，晚上吃点想吃的。",
    "周五的饭，允许自己多点一个菜。",
    "忙完这一周，先好好吃一顿再说。",
    "周五的傍晚，最适合慢慢坐下来。",
    "周末在门口了，今晚可以吃得热闹些。",
    "这一周辛苦了，用一顿好饭收个尾。",
    "周五了，把紧绷的那根弦松一松。",
  ],
  6: [
    "周六，睡到自然醒，再慢慢吃一顿。",
    "今天不赶时间，饭也可以吃得久一点。",
    "周末的第一天，吃点平时没空吃的。",
    "周六适合逛吃，也适合在家煮一锅。",
    "慢下来的日子，连饭都香一点。",
    "今天想吃什么都行，开心最要紧。",
    "周六的阳光和热饭，都别错过。",
    "给自己放个假，从一顿好饭开始。",
  ],
  0: [
    "周日收个尾，明天也要记得好好吃饭。",
    "周末的最后一天，慢慢吃，慢慢歇。",
    "周日适合煮点热的，把一周安顿好。",
    "今天吃顿好的，给下周留点期待。",
    "周日不慌，饭要一口一口吃。",
    "这一周过得怎么样？吃饭的时候想想。",
    "周日的晚上，吃点让心定下来的。",
    "明天要上班了，今晚早点吃、早点睡。",
  ],
};

// One phrase per day, rotated by week so neighbouring weeks never show the same line.
function phraseFor(iso: string) {
  const start = parseISO(startOfWeek(iso));
  const days = Math.floor(Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) / 86400000);
  const pool = PHRASES[parseISO(iso).getDay()];
  const seed = Math.floor(days / 7);
  return pool[((seed % pool.length) + pool.length) % pool.length];
}

const EARLIEST_WEEK = -104;

interface DateStripProps {
  value: string | "all";
  onChange: (value: string | "all") => void;
  dates: Set<string>;
}

export function DateStrip({ value, onChange, dates }: DateStripProps) {
  const [today, setToday] = useState(todayISO);
  const [offset, setOffset] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);

  const base = startOfWeek(today);

  // The current week follows the calendar on its own: at midnight the strip
  // advances, so a page left open on Sunday still shows the new week.
  useEffect(() => {
    let timer = 0;
    const schedule = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 20);
      timer = window.setTimeout(() => {
        setToday(todayISO());
        schedule();
      }, midnight.getTime() - now.getTime());
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // A date picked elsewhere (date field, meal card) brings its own week into view.
  useEffect(() => {
    if (value === "all") return;
    const shift = weeksBetween(base, startOfWeek(value));
    setOffset(Math.min(0, Math.max(EARLIEST_WEEK, shift)));
  }, [value, base]);

  const week = useMemo(() => weekDates(addDays(base, offset * 7)), [base, offset]);

  useEffect(() => {
    const element = scroller.current;
    const active = element?.querySelector<HTMLElement>('[data-active="true"]');
    if (!element || !active) return;
    element.scrollTo({
      left: active.offsetLeft - (element.clientWidth - active.clientWidth) / 2,
      behavior: "smooth",
    });
  }, [value, offset, today]);

  const focus = value === "all" ? today : value;
  const phrase = week.includes(focus)
    ? phraseFor(focus)
    : offset < 0
      ? "翻翻那几天的饭，也挺好。"
      : undefined;

  const shiftWeek = (delta: number) =>
    setOffset((current) => Math.min(0, Math.max(EARLIEST_WEEK, current + delta)));

  return (
    <section aria-label="按日期筛选" className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-serif text-sm tracking-wide text-ink-soft">沿日子翻一翻</h2>
          <span className="text-[11px] text-ink-soft/70">
            {formatMonthDay(week[0])} – {formatMonthDay(week[6])}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex items-center rounded-full border border-line/90 bg-paper/70 p-0.5">
            <button
              type="button"
              onClick={() => shiftWeek(-1)}
              disabled={offset <= EARLIEST_WEEK}
              aria-label="上一周"
              className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-secondary hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => shiftWeek(1)}
              disabled={offset >= 0}
              aria-label="下一周"
              className="grid size-7 place-items-center rounded-full text-ink-soft transition-colors hover:bg-secondary hover:text-ink disabled:opacity-35 disabled:hover:bg-transparent"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
          <label className="relative inline-flex items-center gap-1.5 rounded-full border border-line/90 bg-paper/80 px-3 py-1.5 text-xs text-ink-soft transition-colors focus-within:border-clay/50">
            <CalendarDays className="size-3.5 opacity-70" />
            <span className="sr-only">选择日期</span>
            <input
              type="date"
              value={value === "all" ? "" : value}
              max={today}
              onChange={(event) => onChange(event.target.value || "all")}
              className="w-[7.4rem] bg-transparent text-xs text-ink outline-none"
              aria-label="选择日期"
            />
          </label>
        </div>
      </div>

      <div
        ref={scroller}
        className="scrollbar-none -mx-1 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 pt-0.5"
      >
        <button
          type="button"
          onClick={() => onChange("all")}
          aria-pressed={value === "all"}
          data-active={value === "all"}
          className={cn(
            "flex h-[62px] w-[58px] shrink-0 snap-start flex-col items-center justify-center rounded-[1.15rem] border text-xs transition-all",
            value === "all"
              ? "border-clay bg-clay text-paper shadow-[0_14px_24px_-16px_rgba(143,76,50,.9)]"
              : "border-line/80 bg-paper/70 text-ink-soft hover:border-clay/40 hover:text-ink",
          )}
        >
          <span className="font-serif text-[15px]">全部</span>
          <span className="mt-1 text-[10px] opacity-70">日子</span>
        </button>

        {week.map((iso) => {
          const active = value === iso;
          const has = dates.has(iso);
          const isToday = iso === today;
          const future = iso > today;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onChange(iso)}
              disabled={future}
              aria-pressed={active}
              data-active={active}
              aria-label={`${iso}${isToday ? "，今天" : ""}${has ? "，有记录" : ""}`}
              className={cn(
                "flex h-[62px] w-[52px] shrink-0 snap-start flex-col items-center justify-center gap-0.5 rounded-[1.15rem] border transition-all",
                active
                  ? "border-clay bg-clay text-paper shadow-[0_14px_24px_-16px_rgba(143,76,50,.9)]"
                  : "border-line/80 bg-paper/70 text-ink-soft hover:border-clay/40 hover:text-ink",
                isToday && !active && "border-honey/60",
                future && "cursor-not-allowed opacity-40 hover:border-line/80 hover:text-ink-soft",
              )}
            >
              <span className="text-[10px] opacity-75">{weekdayShort(iso)}</span>
              <span className="font-serif text-[17px] leading-none">{dayNumber(iso)}</span>
              <span
                className={cn(
                  "mt-1 size-1.5 rounded-full transition-colors",
                  has ? (active ? "bg-paper" : "bg-clay") : "bg-transparent",
                )}
              />
            </button>
          );
        })}
      </div>

      <p className="min-h-[1.1rem] font-kai text-[12px] leading-relaxed text-clay-deep/80">{phrase}</p>
    </section>
  );
}
