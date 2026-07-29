"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import GameMap from "@/components/GameMap";
import TopBar from "@/components/TopBar";
import OperationalSheet from "@/components/OperationalSheet";
import BottomBar from "@/components/BottomBar";
import CombatPanel from "@/components/CombatPanel";
import Modals from "@/components/Modals";
import Toasts from "@/components/Toasts";
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

        <OperationalSheet selectedHexId={selectedHexId} hasSelectedUnits={selectedUnitIds.length > 0} />
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

