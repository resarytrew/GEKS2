"use client";

import { useGame } from "@/store/gameStore";
import { CARD_DEFS } from "@/scenarios/baltic-1941/scenario";
import { IMPULSE_LABELS } from "@/engine/wego";
import { PHASE_HINT, SIDE_SHORT } from "@/lib/labels";
import type { CardDefinition, CardEffect, Side } from "@/engine/types";

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
    state.phase === "planning" || state.phase === "command" || state.phase === "activation" || state.phase === "air";

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

  const errorStrip = error ? (
    <div className="flex items-center justify-between border-t border-red-800/60 bg-red-950/75 px-4 py-1 text-[11px] text-red-100">
      <span>⚠ {error}</span>
      <button onClick={clearError} className="text-red-300 hover:text-red-100">✕</button>
    </div>
  ) : null;

  if (state.phase === "after_action" || state.phase === "execution") {
    return (
      <footer className="ops-layer shrink-0 border-t border-staff-edge/80 bg-staff-panel/95">
        {errorStrip}
        <div className="grid h-[164px] grid-cols-[1fr_520px] gap-3 px-3 py-2">
          <section className="staff-panel-inset flex min-w-0 flex-col p-3">
            <div className="flex items-center justify-between">
              <h3 className="staff-section-title">Хронология хода</h3>
              <span className="text-[10px] uppercase tracking-[0.16em] text-staff-mute">импульсы 1–6</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              {IMPULSE_LABELS.map((label, index) => {
                const completed = index < state.impulse || state.phase === "after_action";
                const current = index === state.impulse && state.phase === "execution";
                return (
                  <div key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                    <div
                      title={label}
                      className={`flex h-8 w-full items-center justify-center border text-[12px] font-bold tabular ${
                        current
                          ? "border-staff-gold bg-staff-gold/20 text-staff-gold"
                          : completed
                            ? "border-staff-edge2 bg-staff-panel2 text-staff-ink"
                            : "border-staff-edge bg-staff-void/50 text-staff-mute"
                      }`}
                    >
                      {index + 1}
                    </div>
                    <span className="truncate text-[8px] uppercase tracking-[0.08em] text-staff-mute">{label}</span>
                  </div>
                );
              })}
              <button
                onClick={() => dispatch(state.phase === "execution" ? { type: "EXECUTE_IMPULSE" } : { type: "END_PHASE" })}
                className="ml-2 h-10 border border-staff-edge2 px-4 text-[12px] font-bold text-staff-ink-dim hover:border-staff-gold hover:text-staff-gold"
              >
                ▸▸
              </button>
            </div>
            <div className="mt-auto grid grid-cols-4 gap-2 text-center">
              <Metric label="контакты" value={String(state.contacts.length)} />
              <Metric label="бои" value={String(state.combatResolutions.length)} />
              <Metric label="приказы" value={String(state.plans.germany.orders.length + state.plans.ussr.orders.length)} />
              <Metric label="события" value={String(state.eventLog.length)} />
            </div>
          </section>
          <section className="staff-panel-inset flex min-w-0 flex-col p-3">
            <div className="flex items-center justify-between">
              <h3 className="staff-section-title">Хроника событий</h3>
              <button onClick={() => useGame.getState().setPanel("log")} className="text-[10px] uppercase tracking-[0.14em] text-staff-mute hover:text-staff-gold">
                Все события
              </button>
            </div>
            <div className="mt-3 grid flex-1 grid-cols-2 gap-2">
              {state.eventLog.slice(-4).reverse().map((entry, index) => (
                <div key={index} className="border border-staff-edge/70 bg-staff-void/45 px-3 py-2 text-[10px] leading-snug text-staff-ink-dim">
                  <span className="mr-2 text-staff-gold">{eventIcon(entry.type)}</span>
                  {entry.type.replaceAll("_", " ").toLowerCase()}
                </div>
              ))}
            </div>
          </section>
        </div>
        <TinyFooter />
      </footer>
    );
  }

  if (canPlayCards) {
    return (
      <footer className="ops-layer shrink-0 border-t border-staff-edge/80 bg-staff-panel/95">
        {errorStrip}
        <div className="flex h-[156px] items-stretch gap-3 px-3 py-2">
          <section className="staff-panel-inset hidden w-[270px] shrink-0 flex-col justify-between p-3 md:flex">
            <div>
              <div className="staff-section-title">Карты приказов</div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-staff-mute">Командная колода · {hand.length} / 7</div>
              <p className="mt-3 text-[11px] leading-relaxed text-staff-ink-dim">{PHASE_HINT[state.phase]}</p>
            </div>
            {(state.phase === "activation" || state.phase === "exploitation") && selectedUnitIds.length > 0 && (
              <button onClick={clearSelection} className="self-start border border-staff-edge2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-staff-ink-dim hover:border-staff-gold hover:text-staff-gold">
                Сбросить выделение
              </button>
            )}
          </section>

          <div className="flex min-w-0 flex-1 items-stretch gap-2 overflow-x-auto staff-scroll pb-1">
            <CommandBack side={state.activeSide} />
            {hand.length === 0 && (
              <div className="flex w-56 shrink-0 items-center justify-center border border-dashed border-staff-edge text-[11px] text-staff-mute">
                Карт на руке нет.
              </div>
            )}
            {hand.map((cardId) => {
              const inst = state.cards[cardId];
              const def = CARD_DEFS.find((d) => d.defId === inst.defId)!;
              const targets = buildTargets(def);
              const inWindow = !def.availableFromTurn || state.turn >= def.availableFromTurn;
              const enabled = canPlayCards && inWindow && targets !== null;
              return (
                <button
                  key={cardId}
                  disabled={!enabled}
                  onClick={() => targets && dispatch({ type: "PLAY_CARD", cardId, targets })}
                  title={!inWindow ? "Карта ещё недоступна по сроку" : targets === null ? "Укажите цель: выберите гекс с мостом или соединение" : def.text}
                  className={`relative flex w-[184px] shrink-0 flex-col overflow-hidden border p-0 text-left shadow-[0_8px_18px_rgba(0,0,0,0.25)] transition ${
                    enabled
                      ? "border-staff-edge2 bg-[#c7b58e] hover:-translate-y-0.5 hover:border-staff-gold"
                      : "cursor-not-allowed border-staff-edge bg-staff-panel/60 opacity-45"
                  }`}
                >
                  <div className={`h-12 border-b bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.28),transparent_36%),linear-gradient(135deg,rgba(67,80,70,0.78),rgba(72,48,28,0.78))] ${def.side === "germany" ? "border-ger-edge" : "border-sov-edge"}`} />
                  <div className="flex flex-1 flex-col px-3 py-2 text-[#2a2116]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 text-[11px] font-black uppercase leading-tight tracking-[0.06em]">{def.title}</span>
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d6c398] text-xs font-bold text-[#3a2a15]">{def.commandCost}</span>
                    </div>
                    <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-[#6a5840]">{def.type}</span>
                    <p className="mt-2 line-clamp-3 text-[9px] leading-snug text-[#433522]">{def.text}</p>
                  </div>
                </button>
              );
            })}
            <button className="flex w-[150px] shrink-0 flex-col items-center justify-center border border-dashed border-staff-edge2/60 text-staff-mute transition hover:border-staff-gold hover:text-staff-gold">
              <span className="text-4xl leading-none">＋</span>
              <span className="mt-2 text-[10px] uppercase tracking-[0.18em]">Добавить карту</span>
            </button>
          </div>
        </div>
        <TinyFooter />
      </footer>
    );
  }

  return (
    <footer className="ops-layer shrink-0 border-t border-staff-edge/80 bg-staff-panel/95">
      {errorStrip}
      <TinyFooter />
    </footer>
  );
}

function TinyFooter() {
  return (
    <div className="flex h-7 items-center gap-5 border-t border-staff-edge/60 bg-staff-void/65 px-4 text-[10px] uppercase tracking-[0.12em] text-staff-mute">
      <span>v.1.0.0.1941</span>
      <button className="hover:text-staff-gold">↶ Отменить</button>
      <button className="hover:text-staff-gold">↷ Повторить ход</button>
      <div className="ml-auto flex items-center gap-5">
        <button className="hover:text-staff-gold">▱ Фильтры</button>
        <button onClick={() => useGame.getState().setPanel("log")} className="hover:text-staff-gold">Лог хода⌃</button>
      </div>
    </div>
  );
}

function CommandBack({ side }: { side: Side }) {
  return (
    <div className={`relative flex w-[128px] shrink-0 flex-col items-center justify-center border ${side === "ussr" ? "border-sov-edge bg-sov-dark" : "border-ger-edge bg-ger-dark"}`}>
      <div className="absolute inset-3 border border-staff-gold/25" />
      <div className="text-4xl text-staff-gold/65">☆</div>
      <div className="mt-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-staff-ink-dim">
        Приказ<br />штаба<br />{SIDE_SHORT[side]}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-staff-edge/70 bg-staff-void/45 px-2 py-1.5">
      <div className="tabular text-sm font-bold text-staff-ink">{value}</div>
      <div className="text-[8px] uppercase tracking-[0.16em] text-staff-mute">{label}</div>
    </div>
  );
}

function eventIcon(type: string): string {
  if (type.includes("COMBAT") || type.includes("LOST") || type.includes("ELIMINATED")) return "✹";
  if (type.includes("MOVED")) return "➜";
  if (type.includes("BRIDGE")) return "▰";
  if (type.includes("CARD")) return "✦";
  if (type.includes("OBJECTIVE")) return "★";
  return "•";
}
