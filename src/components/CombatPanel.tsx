"use client";

import { useEffect, useMemo, useState } from "react";
import { useGame, unitsAt } from "@/store/gameStore";
import { predictCombat } from "@/engine/rules";
import { neighbors, parseKey, sharedEdge, keyOf } from "@/engine/hex";
import { UNIT_TYPE_LABEL } from "@/lib/labels";
import type { CombatResolution } from "@/engine/types";

const OUTCOME_LABEL: Record<string, string> = {
  no_effect: "Без результата",
  defender_disorganized: "Защитник дезорганизован",
  attacker_step_loss: "Атакующий теряет шаг",
  attacker_repulsed: "Атака отбита",
  exchange: "Обмен потерями",
  defender_step_loss: "Защитник теряет шаг",
  defender_retreat: "Защитник отступает",
  breakthrough: "Прорыв!",
  defender_destroyed: "Разгром защитника",
};

export default function CombatPanel() {
  const state = useGame((s) => s.state)!;
  const openPanel = useGame((s) => s.openPanel);
  const targetHexId = useGame((s) => s.attackTargetHexId);
  const dispatch = useGame((s) => s.dispatch);
  const setPanel = useGame((s) => s.setPanel);
  const phase = state.phase;

  const candidates = useMemo(() => {
    if (!targetHexId) return [];
    const side = state.activeSide;
    const a = parseKey(targetHexId);
    const out: string[] = [];
    for (let dir = 0; dir < 6; dir++) {
      const n = neighbors(a)[dir];
      const nId = keyOf(n.q, n.r);
      for (const u of unitsAt(state, nId)) {
        if (u.side === side && !u.acted && u.commandState !== "disorganized" && !out.includes(u.id)) {
          out.push(u.id);
        }
      }
    }
    return out;
  }, [state, targetHexId]);

  const [chosen, setChosen] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (openPanel === "combat" && targetHexId) setChosen(candidates);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openPanel, targetHexId]);

  if (openPanel !== "combat" || !targetHexId) return null;

  const defenders = unitsAt(state, targetHexId);
  const report = state.lastCombat && state.lastCombat.defenderHexId === targetHexId ? state.lastCombat : undefined;
  const prediction =
    chosen.length > 0 && phase === "activation"
      ? predictCombat(state, chosen, targetHexId, { airBonus: state.pendingAirSupport?.side === state.activeSide ? state.pendingAirSupport.value : 0 })
      : null;

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const close = () => {
    setPanel(null);
    useGame.getState().setAttackTarget(null);
  };

  const resolve = () => {
    dispatch({ type: "RESOLVE_COMBAT", unitIds: chosen, defenderHexId: targetHexId });
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        className="animate-telegraph flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-staff-edge bg-staff-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-staff-edge bg-staff-panel2 px-4 py-2.5">
          <div>
            <div className="font-dispatch text-base text-staff-gold">Боевой рапорт</div>
            <div className="text-[10px] uppercase tracking-wider text-staff-mute">Гекс {targetHexId} · {defenders.length} защитн.</div>
          </div>
          <button onClick={close} className="rounded px-2 py-1 text-staff-mute hover:bg-staff-panel hover:text-staff-ink">✕</button>
        </div>

        <div className="staff-scroll overflow-y-auto p-4">
          {!report && (
            <>
              <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">Атакующие соединения</h4>
              <div className="mb-3 flex flex-col gap-1">
                {candidates.length === 0 && (
                  <p className="text-[11px] text-red-300">Нет доступных атакующих рядом с целью (все отыграли или дезорганизованы).</p>
                )}
                {candidates.map((id) => {
                  const u = state.units[id];
                  return (
                    <button
                      key={id}
                      onClick={() => toggle(id)}
                      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-[11px] ${
                        chosen.includes(id) ? "border-staff-gold bg-staff-gold/10" : "border-staff-edge bg-staff-panel/60"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${u.side === "germany" ? "bg-ger-fill" : "bg-sov-fill"}`} />
                      <span className="flex-1 text-staff-ink">{u.shortName}</span>
                      <span className="text-staff-mute">{UNIT_TYPE_LABEL[u.unitType]} · {u.currentSteps} шаг.</span>
                    </button>
                  );
                })}
              </div>

              {prediction && (
                <div className="mb-3 rounded border border-staff-edge bg-staff-panel2/60 p-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-staff-mute">Сила атаки</div>
                      <div className="tabular text-lg font-semibold text-staff-ink">{prediction.attackerStrength}</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-staff-mute">Соотношение</div>
                      <div className="tabular text-lg font-semibold text-staff-gold">{prediction.ratio}:1</div>
                    </div>
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-staff-mute">Сила обороны</div>
                      <div className="tabular text-lg font-semibold text-staff-ink">{prediction.defenderStrength}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-center text-[11px] text-staff-ink-dim">
                    Прогноз: {OUTCOME_LABEL[prediction.expected.outcome]}.{" "}
                    {defenders.some((d) => d.traits.includes("heavy_armor")) &&
                      (prediction.penetrates
                        ? "Тяжёлая броня будет пробита средствами поражения."
                        : "Тяжёлая броня (КВ) — нужны авиация, тяжёлая артиллерия или обход.")}
                  </div>
                  <p className="mt-1 text-center text-[9px] italic text-staff-mute">Прогноз вероятностен и не гарантирует результат.</p>
                </div>
              )}
            </>
          )}

          {report && <CombatReport report={report} />}
        </div>

        <div className="flex items-center justify-between border-t border-staff-edge bg-staff-panel2 px-4 py-2.5">
          <div className="text-[10px] text-staff-mute">
            {state.pendingAirSupport?.side === state.activeSide && "✈ Авиаподдержка назначена. "}
            Бой разрешается детерминированно по seed.
          </div>
          {!report ? (
            <button
              onClick={resolve}
              disabled={chosen.length === 0 || phase !== "activation"}
              className="rounded bg-red-800 px-4 py-2 text-xs font-bold uppercase tracking-wider text-red-50 hover:bg-red-700 disabled:opacity-40"
            >
              Атаковать ▶
            </button>
          ) : (
            <button onClick={close} className="rounded bg-staff-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-staff-void hover:brightness-110">
              Принять ▶
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CombatReport({ report }: { report: CombatResolution }) {
  return (
    <div className="animate-flicker">
      <div className="mb-3 rounded border border-staff-gold/40 bg-staff-gold/10 p-3 text-center">
        <div className="text-[10px] uppercase tracking-widest text-staff-mute">Итог боя</div>
        <div className="font-dispatch text-xl text-staff-gold">{OUTCOME_LABEL[report.outcome]}</div>
        <div className="mt-1 text-[11px] text-staff-ink-dim">
          Соотношение {report.odds}:1 · потери: атакующий −{report.attackerLossSteps}, защитник −{report.defenderLossSteps || (report.outcome === "defender_destroyed" ? "все" : "0")}
        </div>
      </div>
      <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">Этапы боя</h4>
      <div className="flex flex-col gap-1.5">
        {report.steps.map((s, i) => (
          <div key={i} className="rounded border border-staff-edge bg-staff-panel/60 p-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-staff-ink">{s.phase}</span>
              {s.roll != null && <span className="tabular text-[10px] text-staff-gold">d6 = {s.roll}</span>}
            </div>
            <p className="mt-0.5 text-[10px] leading-snug text-staff-mute">{s.description}</p>
          </div>
        ))}
      </div>
      {report.retreatPath.length > 1 && (
        <p className="mt-2 text-[10px] text-staff-mute">Защитник отступил: маршрут пересчитан подальше от атакующих.</p>
      )}
      {report.advanceHexId && <p className="mt-1 text-[10px] text-green-400">Подвижная часть развивает успех и занимает гекс.</p>}
      {report.outcome === "attacker_repulsed" || report.outcome === "attacker_step_loss" ? (
        <p className="mt-2 text-[10px] text-amber-300">Неудачная атака: атакующие соединения потеряли организацию.</p>
      ) : null}
    </div>
  );
}
