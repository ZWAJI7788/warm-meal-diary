import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Navigation, Search } from "lucide-react";
import { nearbyPlaces, searchPlaces, type PlaceOption } from "@/lib/places";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface PlacePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (name: string) => void;
}

export function PlacePicker({ open, onOpenChange, onPick }: PlacePickerProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [from, setFrom] = useState<"none" | "search" | "nearby">("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ticketRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    ticketRef.current += 1;
    setQuery("");
    setOptions([]);
    setFrom("none");
    setBusy(false);
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const word = query.trim();
    const ticket = (ticketRef.current += 1);
    if (word.length < 2) {
      setOptions([]);
      setFrom("none");
      setBusy(false);
      setError(null);
      return;
    }
    setBusy(true);
    setError(null);
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchPlaces(word);
        if (ticket !== ticketRef.current) return;
        setOptions(found);
        setFrom("search");
        setBusy(false);
      } catch (err) {
        if (ticket !== ticketRef.current) return;
        setOptions([]);
        setFrom("search");
        setBusy(false);
        setError(err instanceof Error ? err.message : "没搜到，先手动写吧");
      }
    }, 420);
    return () => window.clearTimeout(timer);
  }, [open, query]);

  const lookAround = async () => {
    const ticket = (ticketRef.current += 1);
    setBusy(true);
    setError(null);
    try {
      const found = await nearbyPlaces();
      if (ticket !== ticketRef.current) return;
      setOptions(found);
      setFrom("nearby");
    } catch (err) {
      if (ticket !== ticketRef.current) return;
      setOptions([]);
      setError(err instanceof Error ? err.message : "附近的地点没取到");
    } finally {
      if (ticket === ticketRef.current) setBusy(false);
    }
  };

  const pick = (name: string) => {
    onPick(name);
    onOpenChange(false);
  };

  const typed = query.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="block max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md gap-0 overflow-y-auto rounded-[1.75rem] border-line bg-paper p-0">
        <div className="p-5 sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-ink">在哪儿吃的</DialogTitle>
            <DialogDescription className="text-xs leading-relaxed text-ink-soft">
              搜一下店名，或者看看附近。选中只留下地点名字，随时还能改。
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft/70" />
              <Input
                autoFocus
                value={query}
                maxLength={30}
                placeholder="搜餐厅、小吃、咖啡…"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索就餐地点"
                className="h-10 rounded-xl border-line bg-paper pl-8 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={lookAround}
              disabled={busy}
              className="h-10 shrink-0 gap-1.5 rounded-xl border-clay/30 bg-paper px-3 text-[11px] text-clay-deep hover:bg-secondary/50"
            >
              <Navigation className="size-3.5" />
              附近
            </Button>
          </div>

          <div className="mt-3">
            {busy ? (
              <div className="flex h-[190px] flex-col items-center justify-center gap-2 text-[11px] text-ink-soft">
                <Loader2 className="size-4 animate-spin text-clay/70" />
                正在找找看…
              </div>
            ) : error ? (
              <div className="flex h-[190px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-clay/25 bg-secondary/20 px-6 text-center">
                <MapPin className="size-5 text-clay/60" />
                <p className="text-[11px] leading-relaxed text-ink-soft">{error}</p>
              </div>
            ) : options.length ? (
              <>
                <p className="mb-1.5 text-[10px] text-ink-soft/70">
                  {from === "nearby" ? "离你近的小馆" : "搜到的地点"}
                </p>
                <ul className="max-h-[46vh] space-y-0.5 overflow-y-auto">
                  {options.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => pick(option.name)}
                        className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-secondary/50"
                      >
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-clay/80" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-ink">{option.name}</span>
                          {option.detail ? (
                            <span className="mt-0.5 block truncate text-[10px] text-ink-soft/80">{option.detail}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex h-[190px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-clay/25 bg-secondary/20 px-6 text-center">
                <MapPin className="size-5 text-clay/60" />
                <p className="text-[11px] leading-relaxed text-ink-soft">
                  {typed ? "没搜到，换个说法试试；也可以直接手写。" : "打两个字就能搜，或者点“附近”看看身边的小馆。"}
                </p>
              </div>
            )}
          </div>

          <p className="mt-3 border-t border-line/60 pt-3 text-[10px] leading-relaxed text-ink-soft/70">
            地点来自高德地图。选中后只填名字，地址不会被存下来。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
