"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import GameMap from "@/components/GameMap";
import TopBar from "@/components/TopBar";
import SidePanels from "@/components/SidePanels";
import BottomBar from "@/components/BottomBar";
import CombatPanel from "@/components/CombatPanel";
import Modals from "@/components/Modals";
import Toasts from "@/components/Toasts";
import { Icon } from "@/components/Icon";
import ToolRail from "@/components/ToolRail";
import { SIDE_SHORT } from "@/lib/labels";
import type { Side } from "@/engine/types";

export default function PlayPage() {
  const router = useRouter();
  const state = useGame((s) => s.state);
  const selectedHexId = useGame((s) => s.selectedHexId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const reachable = useGame((s) => s.reachable);
  const attackTargetHexId = useGame((s) => s.attackTargetHexId);
  const selectHex = useGame((s) => s.selectHex);
  const setPanel = useGame((s) => s.setPanel);
  const openPanel = useGame((s) => s.openPanel);
  const saveProgress = useGame((s) => s.saveProgress);
  const [showZOC, setShowZOC] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [mobileSheet, setMobileSheet] = useState<"collapsed" | "peek" | "full">("collapsed");
  const [saving, setSaving] = useState(false);
  const [handoffAcknowledgedFor, setHandoffAcknowledgedFor] = useState<Side | null>(null);

  const onSave = useCallback(async () => {
    setSaving(true);
    await saveProgress();
    setSaving(false);
  }, [saveProgress]);

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  const mobileSheetView = mobileSheet === "collapsed" && (selectedHexId || selectedUnitIds.length > 0) ? "peek" : mobileSheet;

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || event.altKey || target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      const key = event.key.toLowerCase();
      if (key === "m") setShowZOC((value) => !value);
      if (key === "l") setPanel("log");
      if (key === "o") setPanel("objectives");
      if (key === "s") { event.preventDefault(); void onSave(); }
      if (key === "escape") {
        if (openPanel) setPanel(null);
        else useGame.getState().clearSelection();
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [onSave, openPanel, setPanel]);

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center text-staff-mute">
        Загрузка партии…
      </div>
    );
  }
  const onePlanCommitted =
    state.phase === "planning" &&
    state.plans.germany.committed !== state.plans.ussr.committed;
  const handoffRequired =
    onePlanCommitted && handoffAcknowledgedFor !== state.activeSide;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-staff-bg">
      <TopBar />
      <div className="relative flex min-h-0 flex-1">
        <ToolRail
          showZOC={showZOC}
          saving={saving}
          onHelp={() => setPanel("help")}
          onObjectives={() => setPanel("objectives")}
          onLog={() => setPanel("log")}
          onReport={() => setPanel("report")}
          onToggleZOC={() => setShowZOC((value) => !value)}
          onSave={() => void onSave()}
        />

        <main className="relative min-w-0 flex-1">
          <GameMap
            state={state}
            selectedHexId={selectedHexId}
            selectedUnitIds={selectedUnitIds}
            reachable={reachable}
            attackTargetHexId={attackTargetHexId}
            showZOC={showZOC}
            activeSide={state.activeSide}
            onHexClick={selectHex}
          />
        </main>

        <aside className={`field-sheet relative hidden shrink-0 border-l-2 border-[#77715e] transition-[width] duration-200 md:block ${sheetOpen ? "w-[340px]" : "w-11"}`}>
          {sheetOpen ? <><button aria-label="Свернуть оперативный лист" title="Свернуть оперативный лист" onClick={() => setSheetOpen(false)} className="absolute right-0 top-0 z-10 border-l border-b border-staff-edge p-2 text-staff-mute hover:text-staff-ink"><Icon name="chevron" className="h-4 w-4 rotate-180" /></button><SidePanels /></> : <button aria-label="Открыть оперативный лист" title="Открыть оперативный лист" onClick={() => setSheetOpen(true)} className="flex h-full w-full flex-col items-center gap-3 border-l-2 border-transparent pt-4 text-staff-ink-dim hover:border-staff-gold hover:text-staff-ink"><Icon name="chevron" className="h-4 w-4" /><span className="[writing-mode:vertical-rl] text-[9px] font-bold uppercase tracking-[.14em]">Оперативный лист</span></button>}
        </aside>

        <aside className={`field-sheet absolute bottom-0 left-0 right-0 z-20 border-t-2 border-[#77715e] shadow-[0_-5px_16px_rgba(36,40,35,.2)] md:hidden ${mobileSheetView === "full" ? "h-[min(72vh,620px)]" : "h-12"}`} aria-label="Мобильный оперативный лист">
          {mobileSheetView === "full" ? <><div className="flex h-12 items-center justify-between border-b border-staff-edge px-3"><span className="font-dispatch text-sm text-staff-ink">Оперативный лист</span><button aria-label="Свернуть оперативный лист" onClick={() => setMobileSheet("peek")} className="flex h-10 w-10 items-center justify-center text-staff-ink-dim"><Icon name="chevron" className="h-4 w-4 rotate-90" /></button></div><div className="h-[calc(100%-3rem)]"><SidePanels /></div></> : <button onClick={() => setMobileSheet("full")} className="flex h-12 w-full items-center justify-between px-4 text-left"><span><b className="text-[10px] uppercase tracking-[.12em] text-staff-ink">{selectedHexId ? "Выбранный гекс" : "Оперативный лист"}</b><span className="ml-2 text-[10px] text-staff-ink-dim">{selectedHexId ?? "осмотр, приказы и обстановка"}</span></span><Icon name="chevron" className="h-4 w-4 text-staff-ink-dim -rotate-90" /></button>}
        </aside>
      </div>
      <BottomBar />
      <CombatPanel />
      <Modals />
      <Toasts />
      {handoffRequired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-staff-void/95 p-6">
          <div className="max-w-md border border-staff-edge bg-staff-panel p-8 text-center shadow-2xl">
            <div className="text-xs uppercase tracking-[0.25em] text-staff-gold">
              План запечатан
            </div>
            <h2 className="mt-4 font-dispatch text-2xl text-staff-ink">
              Передайте управление следующей стороне
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-staff-mute">
              Передайте устройство игроку стороны «{SIDE_SHORT[state.activeSide]}».
              Приказы противника не будут показаны.
            </p>
            <button
              className="mt-6 border border-staff-gold bg-staff-gold px-5 py-2 text-sm font-semibold text-staff-void"
              onClick={() => setHandoffAcknowledgedFor(state.activeSide)}
            >
              Продолжить за {SIDE_SHORT[state.activeSide]}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

