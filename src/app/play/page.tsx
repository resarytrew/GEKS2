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
        <div className="flex w-10 shrink-0 flex-col items-center gap-1 border-r border-staff-edge bg-staff-panel py-2">
          <ToolButton title="Справка" onClick={() => setPanel("help")}>?</ToolButton>
          <ToolButton title="Цели" onClick={() => setPanel("objectives")}>★</ToolButton>
          <ToolButton title="Журнал" onClick={() => setPanel("log")}>≡</ToolButton>
          <ToolButton title="Зоны контроля" active={showZOC} onClick={() => setShowZOC((v) => !v)}>⊙</ToolButton>
          <ToolButton title="Сохранить партию" onClick={onSave}>{saving ? "…" : "💾"}</ToolButton>
          <div className="mt-auto" />
          <ToolButton title="Сводка" onClick={() => setPanel("report")}>▥</ToolButton>
        </div>

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

        <aside className="hidden w-[360px] shrink-0 flex-col overflow-hidden border-l border-staff-edge bg-staff-bg md:flex">
          <div className="staff-scroll max-h-[62%] shrink-0 overflow-y-auto">
            <OrderPlanningPanel />
            <ExecutionPanel />
          </div>
          <div className="min-h-0 flex-1">
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
          <div className="max-w-md border border-staff-edge bg-staff-panel p-8 text-center shadow-2xl">
            <div className="text-xs uppercase tracking-[0.25em] text-staff-gold">
              Передача устройства
            </div>
            <h2 className="mt-4 font-dispatch text-2xl text-staff-ink">
              План первой стороны скрыт
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-staff-mute">
              Передайте устройство игроку стороны «{SIDE_SHORT[state.activeSide]}».
              Приказы противника не будут показаны.
            </p>
            <button
              className="mt-6 border border-staff-gold bg-staff-gold px-5 py-2 text-sm font-semibold text-staff-void"
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

function ToolButton({
  children,
  title,
  onClick,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-8 w-8 items-center justify-center rounded text-sm ${
        active ? "bg-staff-gold text-staff-void" : "text-staff-mute hover:bg-staff-panel2 hover:text-staff-ink"
      }`}
    >
      {children}
    </button>
  );
}
