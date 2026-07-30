"use client";

import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { PHASE_LABEL, SIDE_SHORT, ordinalTurn } from "@/lib/labels";
import type { Side } from "@/engine/types";

function scoreOf(s: ReturnType<typeof useGame.getState>["state"], side: Side): number {
  if (!s) return 0;
  const score = s.scores[side];
  return score.operationalPoints + score.territorialPoints + score.delayPoints + score.preservationPoints + score.destructionPoints + score.objectivePoints - score.penalties;
}


export default function TopBar() {
  const state = useGame((s) => s.state);
  if (!state) return null;
  const command = Object.values(state.headquarters).filter((h) => h.side === state.activeSide).reduce((sum, h) => sum + h.commandPoints, 0);
  const commandMax = Object.values(state.headquarters).filter((h) => h.side === state.activeSide).reduce((sum, h) => sum + h.maxCommandPoints, 0);


  return (
    <header className="command-rail flex h-[52px] shrink-0 items-stretch border-b px-3">
      <div className="flex min-w-0 items-center border-r border-staff-edge2 pr-4">
        <div className="font-dispatch text-[15px] leading-none text-[#f1e8d2]">Северо-Западный фронт</div>
        <div className="ml-2 hidden border-l border-[#707064] pl-2 text-[9px] uppercase tracking-[.16em] text-[#bdb7a5] lg:block">Прибалтика · 1941</div>
      </div>
      <div className="flex items-center border-r border-staff-edge2 px-4">
        <div><div className="font-dispatch text-[16px] leading-none text-[#ead08b]">{state.date}</div><div className="mt-1 text-[8px] uppercase tracking-[.13em] text-[#bdb7a5]">{ordinalTurn(state.turn)} / {SCENARIO.totalTurns}</div></div>
      </div>
      <div className="hidden items-center px-4 md:flex">
        <div className="border-l-2 border-staff-gold pl-2"><div className="text-[10px] font-semibold uppercase tracking-[.12em] text-[#f1e8d2]">{PHASE_LABEL[state.phase]}</div><div className="mt-0.5 text-[9px] text-[#bdb7a5]">Ход: {SIDE_SHORT[state.activeSide]} · инициатива: {SIDE_SHORT[state.initiativeSide]}</div></div>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <div className="hidden border-r border-staff-edge2 pr-3 text-right lg:block"><div className="text-[8px] uppercase tracking-[.12em] text-[#bdb7a5]">Командование</div><div className="tabular text-xs text-[#f1e8d2]">{command} / {commandMax} КО</div></div>
        <div className="hidden items-center gap-2 border-r border-staff-edge2 pr-3 sm:flex"><Score side="germany" value={scoreOf(state, "germany")} /><span className="text-[#77796e]">:</span><Score side="ussr" value={scoreOf(state, "ussr")} /></div>

      </div>
    </header>
  );
}
function Score({ side, value }: { side: Side; value: number }) { return <div className="flex items-center gap-1"><i className={`h-2 w-2 border border-black/30 ${side === "germany" ? "bg-ger-fill" : "bg-sov-fill"}`} /><span className="text-[9px] text-[#bdb7a5]">{SIDE_SHORT[side]}</span><b className="tabular text-xs text-[#f1e8d2]">{value}</b></div>; }
