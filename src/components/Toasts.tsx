"use client";

import { useEffect } from "react";
import { useGame } from "@/store/gameStore";
import type { Toast } from "@/store/gameStore";

const KIND_STYLE: Record<Toast["kind"], string> = {
  info: "border-staff-edge bg-staff-panel",
  combat: "border-red-800/60 bg-red-950/70",
  objective: "border-staff-gold/50 bg-staff-gold/15",
  event: "border-ger-edge/60 bg-staff-panel2",
};

export default function Toasts() {
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => dismiss(t.id), 4200));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <div className="pointer-events-none fixed bottom-36 right-4 z-20 flex w-72 flex-col gap-1.5">
      {toasts.map((t) => (
        <div key={t.id} className={`animate-flicker pointer-events-auto rounded border px-3 py-2 text-[11px] text-staff-ink shadow-lg ${KIND_STYLE[t.kind]}`}>
          {t.side && <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${t.side === "germany" ? "bg-ger-accent" : "bg-sov-accent"}`} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
