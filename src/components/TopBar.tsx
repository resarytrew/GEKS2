"use client";

import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { PHASE_HINT, PHASE_LABEL, SIDE_LABEL, SIDE_SHORT, ordinalTurn } from "@/lib/labels";
import type { GamePhase, Side } from "@/engine/types";

function scoreOf(s: ReturnType<typeof useGame.getState>["state"], side: Side): number {
  if (!s) return 0;
  const sc = s.scores[side];
  return (
    sc.operationalPoints +
    sc.territorialPoints +
    sc.delayPoints +
    sc.preservationPoints +
    sc.destructionPoints +
    sc.objectivePoints -
    sc.penalties
  );
}

export default function TopBar() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const setPanel = useGame((s) => s.setPanel);
  if (!state) return null;
  const cp = Object.values(state.headquarters)
    .filter((h) => h.side === state.activeSide)
    .reduce((sum, h) => sum + h.commandPoints, 0);
  const cpMax = Object.values(state.headquarters)
    .filter((h) => h.side === state.activeSide)
    .reduce((sum, h) => sum + h.maxCommandPoints, 0);

  const nextLabel = (phase: GamePhase, done: boolean): string => {
    if (done) return "Партия окончена";
    switch (phase) {
      case "morning_report": return "Начать сутки ▶";
      case "events": return "К штабной фазе ▶";
      case "planning": return "Приказы отданы ▶";
      case "plans_locked": return "Начать исполнение ▶";
      case "execution": return "Следующий импульс ▶";
      case "reaction": return "К снабжению ▶";
      case "after_action": return "Подвести итоги ▶";
      case "command": return "К воздушной фазе ▶";
      case "air": return "К активациям ▶";
      case "activation": return "Завершить активацию стороны ▶";
      case "combat": return "Разрешить бои ▶";
      case "exploitation": return "К фазе снабжения ▶";
      case "supply": return "Подвести итоги ▶";
      case "end_of_day": return "Следующие сутки ▶";
    }
  };

  const onNext = () => {
    if (state.phase === "activation") dispatch({ type: "END_ACTIVATION" });
    else if (state.phase === "planning") dispatch({ type: "COMMIT_PLAN", side: state.activeSide });
    else if (state.phase === "execution") dispatch({ type: "EXECUTE_IMPULSE" });
    else dispatch({ type: "END_PHASE" });
  };

  const sideColor = state.activeSide === "germany" ? "text-ger-accent" : "text-sov-accent";

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-staff-edge bg-staff-panel px-4">
      <div className="flex min-w-0 flex-col">
        <div className="font-dispatch text-sm leading-tight text-staff-ink">Северо-Западный фронт</div>
        <div className="text-[10px] uppercase tracking-widest text-staff-mute">Прибалтика · 1941</div>
      </div>

      <div className="h-8 w-px bg-staff-edge" />

      <div className="flex flex-col">
        <div className="font-dispatch text-base leading-tight text-staff-gold">{state.date}</div>
        <div className="text-[10px] uppercase tracking-wider text-staff-mute">{ordinalTurn(state.turn)} из {SCENARIO.totalTurns}</div>
      </div>

      <div className="flex flex-col">
        <div className={`text-sm font-semibold leading-tight ${sideColor}`}>{PHASE_LABEL[state.phase]}</div>
        <div className="text-[10px] text-staff-mute">Ход: {SIDE_SHORT[state.activeSide]}</div>
      </div>

      <div className="hidden flex-col lg:flex">
        <div className="text-xs text-staff-ink-dim">Погода: {state.weather.label}</div>
        <div className="text-[10px] text-staff-mute">Инициатива: {SIDE_SHORT[state.initiativeSide]}</div>
      </div>

      <div className="ml-auto flex items-center gap-4">
        <div className="hidden items-center gap-3 md:flex">
          <ScoreChip side="germany" value={scoreOf(state, "germany")} />
          <span className="text-staff-mute">·</span>
          <ScoreChip side="ussr" value={scoreOf(state, "ussr")} />
        </div>
        <div className="hidden flex-col items-end sm:flex">
          <div className="text-[10px] uppercase tracking-wider text-staff-mute">Командные очки</div>
          <div className="tabular text-sm font-semibold text-staff-ink">{cp} / {cpMax}</div>
        </div>

        <div className="flex items-center gap-1">
          <BarButton label="Цели" onClick={() => setPanel("objectives")} />
          <BarButton label="Журнал" onClick={() => setPanel("log")} />
          <BarButton label="Сводка" onClick={() => setPanel("report")} />
        </div>

        <button
          onClick={onNext}
          disabled={state.status === "completed"}
          className="rounded bg-staff-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-staff-void shadow hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel(state.phase, state.status === "completed")}
        </button>
      </div>
    </header>
  );
}

function ScoreChip({ side, value }: { side: Side; value: number }) {
  const isGer = side === "germany";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-sm ${isGer ? "bg-ger-fill" : "bg-sov-fill"}`} />
      <span className="text-[10px] uppercase tracking-wider text-staff-mute">{SIDE_SHORT[side]}</span>
      <span className="tabular text-sm font-semibold text-staff-ink">{value}</span>
    </div>
  );
}

function BarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-2.5 py-1.5 text-[11px] uppercase tracking-wider text-staff-ink-dim transition hover:bg-staff-panel2 hover:text-staff-ink"
    >
      {label}
    </button>
  );
}
