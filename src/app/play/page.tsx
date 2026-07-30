"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import GameMap from "@/components/GameMap";
import TopBar from "@/components/TopBar";
import SidePanels from "@/components/SidePanels";
import BottomBar from "@/components/BottomBar";
import CombatPanel from "@/components/CombatPanel";
import Modals from "@/components/Modals";
import Toasts from "@/components/Toasts";
import OrderPlanningPanel from "@/components/OrderPlanningPanel";
import ExecutionPanel from "@/components/ExecutionPanel";
import NavRail from "@/components/NavRail";
import { SIDE_SHORT } from "@/lib/labels";
import type { GamePhase, Side } from "@/engine/types";

export default function PlayPage() {
  const router = useRouter();
  const state = useGame((s) => s.state);
  const selectedHexId = useGame((s) => s.selectedHexId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const reachable = useGame((s) => s.reachable);
  const attackTargetHexId = useGame((s) => s.attackTargetHexId);
  const selectHex = useGame((s) => s.selectHex);
  const setPanel = useGame((s) => s.setPanel);
  const saveProgress = useGame((s) => s.saveProgress);
  const [showZOC, setShowZOC] = useState(false);
  const [saving, setSaving] = useState(false);
  const [handoffAcknowledgedFor, setHandoffAcknowledgedFor] = useState<Side | null>(null);

  const onSave = async () => {
    setSaving(true);
    await saveProgress();
    setSaving(false);
  };

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  if (!state) {
    return (
      <div className="ops-shell flex h-screen items-center justify-center text-staff-mute">
        Загрузка партии…
      </div>
    );
  }
  const onePlanCommitted =
    state.phase === "planning" && state.plans.germany.committed !== state.plans.ussr.committed;
  const handoffRequired = onePlanCommitted && handoffAcknowledgedFor !== state.activeSide;

  return (
    <div className="ops-shell flex h-screen flex-col overflow-hidden bg-staff-bg">
      <TopBar />
      <div className="ops-layer relative flex min-h-0 flex-1">
        <NavRail
          active="map"
          saving={saving}
          onPanel={setPanel}
          onToggleRecon={() => setShowZOC((value) => !value)}
          onSave={onSave}
        />

        <main className="relative min-w-0 flex-1 border-r border-staff-edge/70 bg-black">
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

        <aside className="hidden w-[392px] shrink-0 flex-col overflow-hidden border-l border-staff-edge/70 bg-staff-bg/95 shadow-[inset_8px_0_24px_rgba(0,0,0,0.18)] md:flex">
          <RightTabs phase={state.phase} />
          <div className="staff-scroll min-h-0 flex-1 overflow-y-auto">
            <OrderPlanningPanel />
            <ExecutionPanel />
            <SidePanels />
          </div>
        </aside>
      </div>
      <BottomBar />
      <CombatPanel />
      <Modals />
      <Toasts />
      {handoffRequired && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-staff-void/95 p-6">
          <div className="staff-panel-frame max-w-md p-8 text-center shadow-2xl">
            <div className="text-xs uppercase tracking-[0.25em] text-staff-gold">Передача устройства</div>
            <h2 className="mt-4 font-dispatch text-2xl text-staff-ink">План первой стороны скрыт</h2>
            <p className="mt-3 text-sm leading-relaxed text-staff-mute">
              Передайте устройство игроку стороны «{SIDE_SHORT[state.activeSide]}». Приказы
              противника не будут показаны.
            </p>
            <button
              className="mt-6 border border-staff-gold bg-staff-gold px-5 py-2 text-sm font-semibold uppercase tracking-[0.14em] text-staff-void"
              onClick={() => setHandoffAcknowledgedFor(state.activeSide)}
            >
              Устройство передано
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RightTabs({ phase }: { phase: GamePhase }) {
  const setPanel = useGame((s) => s.setPanel);
  const active =
    phase === "planning"
      ? "orders"
      : phase === "execution" || phase === "after_action"
        ? "situation"
        : "inspect";
  return (
    <div className="grid h-10 shrink-0 grid-cols-3 border-b border-staff-edge/80 bg-staff-panel/95 text-[10px] font-bold uppercase tracking-[0.16em]">
      <button
        onClick={() => setPanel(null)}
        className={`border-r border-staff-edge/70 transition ${active === "inspect" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Осмотр
      </button>
      <button
        onClick={() => setPanel("objectives")}
        className={`border-r border-staff-edge/70 transition ${active === "orders" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Приказы
      </button>
      <button
        onClick={() => setPanel("report")}
        className={`transition ${active === "situation" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Обстановка
      </button>
    </div>
  );
}
