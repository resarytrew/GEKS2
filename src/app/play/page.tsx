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
import OrderPlanningPanel from "@/components/OrderPlanningPanel";
import ExecutionPanel from "@/components/ExecutionPanel";
import NavRail from "@/components/NavRail";
import StrategicSituationPanel from "@/components/StrategicSituationPanel";
import { SIDE_SHORT } from "@/lib/labels";
import type { GamePhase, Side } from "@/engine/types";
import type { RailItemId } from "@/components/NavRail";

type WorkspaceTab = "inspect" | "orders" | "situation";

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
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(() =>
    defaultWorkspaceTab(useGame.getState().state?.phase ?? "morning_report"),
  );
  const phase = state?.phase;

  const onSave = useCallback(async () => {
    setSaving(true);
    await saveProgress();
    setSaving(false);
  }, [saveProgress]);

  useEffect(() => {
    if (!state) router.replace("/");
  }, [state, router]);

  useEffect(() => {
    if (!phase) return;
    const frame = window.requestAnimationFrame(() =>
      setWorkspaceTab(defaultWorkspaceTab(phase)),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  useEffect(() => {
    const shortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")
      ) return;
      const key = event.key.toLowerCase();
      if (key === "m") setWorkspaceTab("inspect");
      if (key === "o") setWorkspaceTab("orders");
      if (key === "l") setPanel("log");
      if (key === "s") {
        event.preventDefault();
        void onSave();
      }
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
      <div className="ops-shell flex h-screen items-center justify-center text-staff-mute">
        Загрузка партии…
      </div>
    );
  }
  const onePlanCommitted =
    state.phase === "planning" && state.plans.germany.committed !== state.plans.ussr.committed;
  const handoffRequired = onePlanCommitted && handoffAcknowledgedFor !== state.activeSide;

  const navigateRail = (item: RailItemId) => {
    if (item === "map") setWorkspaceTab("inspect");
    else if (item === "situation" || item === "supply") setWorkspaceTab("situation");
    else if (item === "orders") setWorkspaceTab("orders");
    else if (item === "recon") setShowZOC((value) => !value);
    else if (item === "radio") void onSave();
    else if (item === "journal") setPanel("log");
    else if (item === "settings") setPanel("help");
  };

  const railActive: RailItemId =
    workspaceTab === "orders"
      ? "orders"
      : workspaceTab === "situation"
        ? "situation"
        : "map";

  return (
    <div className="ops-shell flex h-screen flex-col overflow-hidden bg-staff-bg">
      <TopBar />
      <div className="ops-layer relative flex min-h-0 flex-1">
        <NavRail
          active={railActive}
          saving={saving}
          toggledRecon={showZOC}
          onNavigate={navigateRail}
        />

        <main className="relative min-w-0 flex-1 border-r border-staff-edge/70 bg-black">
          <GameMap
            state={state}
            selectedHexId={selectedHexId}
            selectedUnitIds={selectedUnitIds}
            reachable={reachable}
            attackTargetHexId={attackTargetHexId}
            showZOC={showZOC}
            onToggleZOC={() => setShowZOC((value) => !value)}
            activeSide={state.activeSide}
            onHexClick={selectHex}
          />
        </main>

        <aside className="operation-sheet hidden w-[410px] shrink-0 flex-col overflow-hidden border-l border-staff-edge/70 bg-staff-bg/95 shadow-[inset_8px_0_24px_rgba(0,0,0,0.18)] lg:flex">
          <RightTabs active={workspaceTab} onChange={setWorkspaceTab} />
          <div className="staff-scroll min-h-0 flex-1 overflow-y-auto">
            {workspaceTab === "orders" && (
              state.phase === "planning" ? <OrderPlanningPanel /> : <OrdersUnavailable phase={state.phase} />
            )}
            {workspaceTab === "situation" && (
              <>
                {state.phase === "execution" && <ExecutionPanel />}
                <StrategicSituationPanel />
              </>
            )}
            {workspaceTab === "inspect" && <SidePanels />}
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

function RightTabs({
  active,
  onChange,
}: {
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="grid h-10 shrink-0 grid-cols-3 border-b border-staff-edge/80 bg-staff-panel/95 text-[10px] font-bold uppercase tracking-[0.16em]">
      <button
        onClick={() => onChange("inspect")}
        className={`border-r border-staff-edge/70 transition ${active === "inspect" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Осмотр
      </button>
      <button
        onClick={() => onChange("orders")}
        className={`border-r border-staff-edge/70 transition ${active === "orders" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Приказы
      </button>
      <button
        onClick={() => onChange("situation")}
        className={`transition ${active === "situation" ? "bg-staff-gold/15 text-staff-gold" : "text-staff-mute hover:text-staff-ink"}`}
      >
        Обстановка
      </button>
    </div>
  );
}

function OrdersUnavailable({ phase }: { phase: GamePhase }) {
  const setPanel = useGame((state) => state.setPanel);
  return (
    <div className="flex min-h-full items-center justify-center p-5">
      <section className="staff-panel-inset max-w-sm p-5 text-center">
        <div className="staff-section-title">Архив приказов</div>
        <h2 className="mt-3 font-dispatch text-xl text-staff-ink">Планирование сейчас закрыто</h2>
        <p className="mt-3 text-xs leading-relaxed text-staff-mute">
          Текущая фаза: {phase}. Просмотреть цели операции и состояние ранее отданных приказов можно в сводке.
        </p>
        <button
          onClick={() => setPanel("objectives")}
          className="mt-5 border border-staff-edge2 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-staff-ink-dim hover:border-staff-gold hover:text-staff-gold"
        >
          Оперативные цели
        </button>
      </section>
    </div>
  );
}

function defaultWorkspaceTab(phase: GamePhase): WorkspaceTab {
  if (phase === "planning" || phase === "plans_locked") return "orders";
  if (phase === "execution" || phase === "after_action" || phase === "supply") return "situation";
  return "inspect";
}
