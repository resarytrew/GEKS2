"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import SidePanels from "@/components/SidePanels";
import { getMobileSheetView, type MobileSheetState } from "@/lib/operationalSheet";

interface OperationalSheetProps {
  selectedHexId: string | null;
  hasSelectedUnits: boolean;
}

/** Responsive host for the shared inspect/orders/situation sheet. */
export default function OperationalSheet({ selectedHexId, hasSelectedUnits }: OperationalSheetProps) {
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileState, setMobileState] = useState<MobileSheetState>("collapsed");
  const mobileView = getMobileSheetView(mobileState, Boolean(selectedHexId || hasSelectedUnits));

  return <>
    <aside className={`field-sheet relative hidden shrink-0 border-l-2 border-[#77715e] transition-[width] duration-200 md:block ${desktopOpen ? "w-[340px]" : "w-11"}`}>
      {desktopOpen ? <><button aria-label="Свернуть оперативный лист" title="Свернуть оперативный лист" onClick={() => setDesktopOpen(false)} className="absolute right-0 top-0 z-10 border-l border-b border-staff-edge p-2 text-staff-mute hover:text-staff-ink focus-visible:outline-2 focus-visible:outline-staff-gold"><Icon name="chevron" className="h-4 w-4 rotate-180" /></button><SidePanels /></> : <button aria-label="Открыть оперативный лист" title="Открыть оперативный лист" onClick={() => setDesktopOpen(true)} className="flex h-full w-full flex-col items-center gap-3 border-l-2 border-transparent pt-4 text-staff-ink-dim hover:border-staff-gold hover:text-staff-ink focus-visible:outline-2 focus-visible:outline-staff-gold"><Icon name="chevron" className="h-4 w-4" /><span className="[writing-mode:vertical-rl] text-[9px] font-bold uppercase tracking-[.14em]">Оперативный лист</span></button>}
    </aside>

    <aside className={`field-sheet absolute bottom-0 left-0 right-0 z-20 border-t-2 border-[#77715e] shadow-[0_-5px_16px_rgba(36,40,35,.2)] md:hidden ${mobileView === "full" ? "h-[min(72vh,620px)]" : "h-12"}`} aria-label="Мобильный оперативный лист">
      {mobileView === "full" ? <><div className="flex h-12 items-center justify-between border-b border-staff-edge px-3"><span className="font-dispatch text-sm text-staff-ink">Оперативный лист</span><button aria-label="Свернуть оперативный лист" onClick={() => setMobileState("peek")} className="flex h-10 w-10 items-center justify-center text-staff-ink-dim focus-visible:outline-2 focus-visible:outline-staff-gold"><Icon name="chevron" className="h-4 w-4 rotate-90" /></button></div><div className="h-[calc(100%-3rem)]"><SidePanels /></div></> : <button onClick={() => setMobileState("full")} className="flex h-12 w-full items-center justify-between px-4 text-left focus-visible:outline-2 focus-visible:outline-staff-gold"><span><b className="text-[10px] uppercase tracking-[.12em] text-staff-ink">{selectedHexId ? "Выбранный гекс" : "Оперативный лист"}</b><span className="ml-2 text-[10px] text-staff-ink-dim">{selectedHexId ?? "осмотр, приказы и обстановка"}</span></span><Icon name="chevron" className="h-4 w-4 text-staff-ink-dim -rotate-90" /></button>}
    </aside>
  </>;
}
