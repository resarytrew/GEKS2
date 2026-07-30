"use client";

import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { PHASE_LABEL, SIDE_SHORT, ordinalTurn } from "@/lib/labels";
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

const MONTHS = [
  "ЯНВАРЯ",
  "ФЕВРАЛЯ",
  "МАРТА",
  "АПРЕЛЯ",
  "МАЯ",
  "ИЮНЯ",
  "ИЮЛЯ",
  "АВГУСТА",
  "СЕНТЯБРЯ",
  "ОКТЯБРЯ",
  "НОЯБРЯ",
  "ДЕКАБРЯ",
];

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export default function TopBar() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  if (!state) return null;
  const cp = Object.values(state.headquarters)
    .filter((h) => h.side === state.activeSide)
    .reduce((sum, h) => sum + h.commandPoints, 0);
  const cpMax = Object.values(state.headquarters)
    .filter((h) => h.side === state.activeSide)
    .reduce((sum, h) => sum + h.maxCommandPoints, 0);

  const nextLabel = (phase: GamePhase, done: boolean): string => {
    if (done) return "ПАРТИЯ ОКОНЧЕНА";
    switch (phase) {
      case "morning_report": return "НАЧАТЬ СУТКИ";
      case "events": return "К ШТАБНОЙ ФАЗЕ";
      case "planning": return "КОНЕЦ ФАЗЫ";
      case "plans_locked": return "НАЧАТЬ ИСПОЛНЕНИЕ";
      case "execution": return "СЛЕДУЮЩИЙ ИМПУЛЬС";
      case "reaction": return "К СНАБЖЕНИЮ";
      case "after_action": return "КОНЕЦ ХОДА";
      case "command": return "К АВИАЦИИ";
      case "air": return "К АКТИВАЦИЯМ";
      case "activation": return "КОНЕЦ ФАЗЫ";
      case "combat": return "РАЗРЕШИТЬ БОИ";
      case "exploitation": return "К СНАБЖЕНИЮ";
      case "supply": return "ПОДВЕСТИ ИТОГИ";
      case "end_of_day": return "СЛЕДУЮЩИЕ СУТКИ";
    }
  };

  const onNext = () => {
    if (state.phase === "activation") dispatch({ type: "END_ACTIVATION" });
    else if (state.phase === "planning") dispatch({ type: "COMMIT_PLAN", side: state.activeSide });
    else if (state.phase === "execution") dispatch({ type: "EXECUTE_IMPULSE" });
    else dispatch({ type: "END_PHASE" });
  };

  return (
    <header className="staff-topbar ops-layer flex h-[68px] shrink-0 items-stretch border-b border-staff-edge/80 text-staff-ink">
      <div className="flex w-[390px] min-w-0 items-center gap-4 border-r border-staff-edge/70 pl-6 pr-5">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center border border-staff-gold/25 bg-sov-dark text-staff-gold shadow-[0_8px_20px_rgba(0,0,0,0.35)]">
          <span className="text-2xl">☆</span>
          <span className="absolute bottom-1 right-1 h-1.5 w-1.5 bg-staff-gold/75" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-lg font-bold uppercase leading-tight tracking-[0.12em] text-staff-ink">
            Северо-Западный фронт
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.34em] text-staff-mute">
            Прибалтика · 1941
          </div>
        </div>
      </div>

      <div className="flex w-[172px] shrink-0 flex-col justify-center border-r border-staff-edge/70 px-5">
        <div className="text-[13px] font-bold uppercase tracking-[0.12em] text-staff-gold">{formatDate(state.date)}</div>
        <div className="mt-1 text-[10px] text-staff-ink-dim">{ordinalTurn(state.turn)} из {SCENARIO.totalTurns}</div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center border-r border-staff-edge/60 px-5">
        <div className="truncate text-sm font-bold uppercase tracking-[0.16em] text-staff-ink">
          {PHASE_LABEL[state.phase]}
        </div>
        <div className="mt-1 truncate text-[11px] text-staff-ink-dim">
          Ход: {SIDE_SHORT[state.activeSide]} · Инициатива: {SIDE_SHORT[state.initiativeSide]} · Погода: {state.weather.label}
        </div>
      </div>

      <div className="hidden w-[180px] shrink-0 items-center gap-3 border-r border-staff-edge/60 px-4 lg:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-staff-gold/30 text-staff-gold">★</span>
        <div>
          <div className="text-[9px] uppercase tracking-[0.16em] text-staff-mute">Очки командования</div>
          <div className="tabular text-base font-bold text-staff-ink">{cp} / {cpMax} КО</div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-4 px-5">
        <button
          onClick={onNext}
          disabled={state.status === "completed"}
          className="border border-staff-gold/30 bg-staff-panel2 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-staff-ink shadow-[inset_0_1px_rgba(255,255,255,0.05)] transition hover:border-staff-gold hover:bg-staff-gold hover:text-staff-void disabled:cursor-not-allowed disabled:opacity-40"
        >
          {nextLabel(state.phase, state.status === "completed")}
        </button>
        <div className="hidden items-center gap-6 sm:flex">
          <ScoreChip side="germany" value={scoreOf(state, "germany")} />
          <ScoreChip side="ussr" value={scoreOf(state, "ussr")} />
        </div>
      </div>
    </header>
  );
}

function ScoreChip({ side, value }: { side: Side; value: number }) {
  const isGer = side === "germany";
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 border border-staff-edge ${isGer ? "bg-ger-fill" : "bg-sov-fill"}`} />
      <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${isGer ? "text-ger-accent" : "text-sov-accent"}`}>
        {SIDE_SHORT[side]}
      </span>
      <span className="tabular text-2xl font-bold leading-none text-staff-ink">{value}</span>
    </div>
  );
}
