"use client";

import { useState } from "react";
import { useGame } from "@/store/gameStore";
import { CARD_DEFS } from "@/scenarios/baltic-1941/scenario";
import { PHASE_HINT, PHASE_LABEL, SIDE_SHORT } from "@/lib/labels";
import { Icon } from "@/components/Icon";
import { getVisiblePhaseFlow } from "@/lib/phaseRail";
import type { CardDefinition, CardEffect } from "@/engine/types";

export default function BottomBar() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const selectedHexId = useGame((s) => s.selectedHexId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const [tray, setTray] = useState(false);
  if (!state) return null;
  const hand = state.playerHands[state.activeSide];
  const canPlay = ["planning", "command", "activation", "air"].includes(state.phase);
  const targetFor = (def: CardDefinition): string[] | null => {
    const needs = (kind: CardEffect["kind"]) => def.effects.some((effect) => effect.kind === kind);
    if (needs("destroy_bridge") || needs("build_pontoon")) { const bridge = selectedHexId ? state.hexes[selectedHexId]?.bridgeEdges[0] : null; return bridge && selectedHexId ? [selectedHexId, String(bridge.edge)] : null; }
    if (needs("add_trait") || needs("restore_org") || needs("activate_ooc")) return selectedUnitIds[0] ? [selectedUnitIds[0]] : null;
    if (needs("temp_initiative")) { const hq = selectedUnitIds[0] ? state.units[selectedUnitIds[0]]?.parentCorpsId : null; return hq ? [hq] : null; }
    return [];
  };
  return <footer className="relative z-20 shrink-0 border-t-2 border-[#55564b] bg-[#272b26] text-[#eee5ce]">
    {tray && <div className="field-sheet absolute bottom-full left-0 right-0 border-t-2 border-[#77715e] px-4 py-3 shadow-[0_-8px_24px_rgba(30,28,22,.24)]">
      <div className="mb-2 flex items-center justify-between sheet-title pb-1"><div><span className="text-[9px] font-bold uppercase tracking-[.15em] text-staff-mute">Приказы и специальные меры</span><span className="ml-2 text-[10px] text-staff-ink-dim">{SIDE_SHORT[state.activeSide]} · {hand.length} карт</span></div><button onClick={() => setTray(false)} aria-label="Закрыть лоток приказов" className="p-1 text-staff-ink-dim"><Icon name="close" className="h-4 w-4" /></button></div>
      <div className="staff-scroll flex max-h-48 gap-2 overflow-x-auto pb-1">{hand.length === 0 ? <p className="py-5 text-xs text-staff-mute">В распоряжении штаба нет карт.</p> : hand.map((cardId) => { const instance = state.cards[cardId]; const def = CARD_DEFS.find((item) => item.defId === instance.defId)!; const targets = targetFor(def); const enabled = canPlay && targets !== null && (!def.availableFromTurn || state.turn >= def.availableFromTurn); return <button key={cardId} disabled={!enabled} onClick={() => targets && dispatch({ type: "PLAY_CARD", cardId, targets })} className={`w-52 shrink-0 border-2 p-2 text-left ${def.side === "germany" ? "border-ger-fill bg-ger-dark/10" : "border-sov-fill bg-sov-dark/10"} disabled:opacity-40`}><div className="flex justify-between gap-2 font-dispatch text-sm"><span>{def.title}</span><b className="font-sans text-[10px]">{def.commandCost} КО</b></div><div className="mt-1 border-t border-black/20 pt-1 text-[10px] leading-snug text-staff-ink-dim">{def.text}</div></button>; })}</div>
    </div>}
    {error && <div className="flex items-center justify-between border-b border-[#844239] bg-[#71352e] px-4 py-1 text-[11px] text-[#fff1df]"><span>{error}</span><button onClick={clearError}><Icon name="close" className="h-3.5 w-3.5" /></button></div>}
    <div className="flex h-[60px] items-center gap-3 px-3">
      <div className="hidden w-60 border-r border-[#55564b] pr-3 md:block"><div className="text-[9px] font-bold uppercase tracking-[.14em] text-[#c6beaa]">{PHASE_LABEL[state.phase]} · {SIDE_SHORT[state.activeSide]}</div><p className="mt-1 text-[10px] leading-tight text-[#c6beaa]">{PHASE_HINT[state.phase]}</p></div>
      <div className="phase-track hidden flex-1 items-center justify-center gap-4 lg:flex">{getVisiblePhaseFlow(state).map((phase, index) => <span key={phase.id} className={`text-[9px] uppercase tracking-[.11em] ${phase.status === "current" ? "font-bold text-[#e4c572]" : phase.status === "completed" ? "text-[#d2ccba]" : "text-[#a9a695]"}`}><b className="mr-1 font-serif">{index + 1}</b>{phase.label}</span>)}</div>
      <div className="ml-auto flex items-center gap-2"><button onClick={() => setTray((value) => !value)} className={`flex items-center gap-2 border px-2.5 py-2 text-[10px] font-bold uppercase tracking-[.1em] ${tray ? "border-[#d3ad59] text-[#e4c572]" : "border-[#66675d] text-[#ddd4bd] hover:border-[#a7a18d]"}`}><Icon name="orders" className="h-4 w-4" />Приказы <span className="border-l border-current pl-2">{hand.length}</span></button></div>
    </div>
  </footer>;
}
