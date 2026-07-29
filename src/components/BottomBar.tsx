"use client";

import { useGame } from "@/store/gameStore";
import { CARD_DEFS } from "@/scenarios/baltic-1941/scenario";
import { PHASE_HINT, SIDE_SHORT } from "@/lib/labels";
import type { CardDefinition, CardEffect } from "@/engine/types";

export default function BottomBar() {
  const state = useGame((s) => s.state);
  const dispatch = useGame((s) => s.dispatch);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const selectedHexId = useGame((s) => s.selectedHexId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const clearSelection = useGame((s) => s.clearSelection);
  if (!state) return null;

  const hand = state.playerHands[state.activeSide];
  const canPlayCards =
    state.phase === "planning" ||
    state.phase === "command" ||
    state.phase === "activation" ||
    state.phase === "air";

  const buildTargets = (def: CardDefinition): string[] | null => {
    const needs = (k: CardEffect["kind"]) => def.effects.some((e) => e.kind === k);
    if (needs("destroy_bridge") || needs("build_pontoon")) {
      const hex = selectedHexId ? state.hexes[selectedHexId] : null;
      const bridge = hex?.bridgeEdges[0];
      if (!hex || bridge == null) return null;
      return [selectedHexId!, String(bridge.edge)];
    }
    if (needs("add_trait") || needs("restore_org") || needs("activate_ooc")) {
      if (selectedUnitIds.length === 0) return null;
      return [selectedUnitIds[0]];
    }
    if (needs("temp_initiative")) {
      if (selectedUnitIds.length === 0) return null;
      const hq = state.units[selectedUnitIds[0]]?.parentCorpsId;
      return hq ? [hq] : null;
    }
    return [];
  };

  return (
    <footer className="flex h-32 shrink-0 flex-col border-t border-staff-edge bg-staff-panel">
      {error && (
        <div className="flex items-center justify-between bg-red-950/70 px-4 py-1 text-[11px] text-red-200">
          <span>⚠ {error}</span>
          <button onClick={clearError} className="text-red-300 hover:text-red-100">✕</button>
        </div>
      )}
      <div className="flex flex-1 items-stretch gap-3 px-3 py-2">
        <div className="hidden w-56 shrink-0 flex-col justify-center border-r border-staff-edge pr-3 md:flex">
          <div className="text-[10px] uppercase tracking-widest text-staff-mute">Фаза · {SIDE_SHORT[state.activeSide]}</div>
          <p className="mt-1 text-[11px] leading-snug text-staff-ink-dim">{PHASE_HINT[state.phase]}</p>
          {(state.phase === "activation" || state.phase === "exploitation") && selectedUnitIds.length > 0 && (
            <button onClick={clearSelection} className="mt-1.5 self-start rounded bg-staff-panel2 px-2 py-1 text-[10px] uppercase tracking-wide text-staff-ink-dim hover:text-staff-ink">
              Сбросить выделение
            </button>
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto staff-scroll">
          {hand.length === 0 && (
            <div className="flex items-center text-[11px] text-staff-mute">Карт на руке нет.</div>
          )}
          {hand.map((cardId) => {
            const inst = state.cards[cardId];
            const def = CARD_DEFS.find((d) => d.defId === inst.defId)!;
            const targets = buildTargets(def);
            const inWindow = (!def.availableFromTurn || state.turn >= def.availableFromTurn);
            const enabled = canPlayCards && inWindow && targets !== null;
            return (
              <button
                key={cardId}
                disabled={!enabled}
                onClick={() => targets && dispatch({ type: "PLAY_CARD", cardId, targets })}
                title={!inWindow ? "Карта ещё недоступна по сроку" : targets === null ? "Укажите цель: выберите гекс с мостом или соединение" : def.text}
                className={`flex w-44 shrink-0 flex-col rounded border p-2 text-left transition ${
                  enabled
                    ? def.side === "germany"
                      ? "border-ger-edge bg-ger-dark/40 hover:border-ger-accent"
                      : "border-sov-edge bg-sov-dark/40 hover:border-sov-accent"
                    : "cursor-not-allowed border-staff-edge bg-staff-panel/40 opacity-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-dispatch text-[12px] ${def.side === "germany" ? "text-ger-accent" : "text-sov-accent"}`}>{def.title}</span>
                  <span className="rounded bg-black/40 px-1 text-[8px] uppercase text-staff-mute">{def.commandCost} КО</span>
                </div>
                <span className="mt-0.5 text-[8px] uppercase tracking-wider text-staff-mute">{def.type}</span>
                <p className="mt-1 line-clamp-3 text-[9px] leading-snug text-staff-ink-dim">{def.text}</p>
              </button>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
