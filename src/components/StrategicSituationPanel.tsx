"use client";

import { useGame } from "@/store/gameStore";
import { SIDE_SHORT } from "@/lib/labels";
import { Icon } from "@/components/Icon";

export default function StrategicSituationPanel() {
  const state = useGame((store) => store.state);
  const setPanel = useGame((store) => store.setPanel);
  if (!state) return null;

  const units = Object.values(state.units);
  const activeUnits = units.filter((unit) => !unit.eliminated);
  const understrength = activeUnits
    .filter((unit) => unit.currentSteps < unit.maxSteps || unit.supplyState !== "full")
    .sort((a, b) => a.currentSteps / a.maxSteps - b.currentSteps / b.maxSteps);
  const eliminated = units.filter((unit) => unit.eliminated);
  const bridges = Object.values(state.hexes).flatMap((hex) => hex.bridgeEdges);
  const destroyedBridges = bridges.filter((bridge) => bridge.state === "destroyed");
  const supplied = activeUnits.filter((unit) => unit.supplyState === "full").length;
  const strained = activeUnits.filter((unit) => unit.supplyState === "low").length;
  const critical = activeUnits.filter(
    (unit) => unit.supplyState === "none" || unit.supplyState === "isolated",
  ).length;
  const report = state.afterActionReport;

  return (
    <div className="staff-scroll flex min-h-full flex-col gap-2 overflow-y-auto p-3">
      <section className="staff-panel-inset p-3">
        <div className="flex items-center gap-2 border-b border-staff-edge/60 pb-2">
          <Icon name="report" className="h-4 w-4 text-staff-gold" />
          <h2 className="staff-section-title">
            {state.phase === "after_action" ? "Послесуточный рапорт" : "Оперативная обстановка"}
          </h2>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden border border-staff-edge/60 bg-staff-edge/60">
          <SituationMetric label="Контакты" value={state.contacts.length} />
          <SituationMetric label="Бои" value={state.combatResolutions.length} />
          <SituationMetric label="Потеряно частей" value={eliminated.length} tone="danger" />
          <SituationMetric label="Мостов разрушено" value={destroyedBridges.length} />
        </div>
      </section>

      <section className="staff-panel-inset p-3">
        <div className="flex items-center justify-between">
          <h3 className="staff-section-title">Состояние снабжения</h3>
          <span className="tabular text-[10px] text-staff-mute">{activeUnits.length} соединений</span>
        </div>
        <div className="mt-3 h-3 overflow-hidden border border-staff-edge bg-staff-void">
          <div className="flex h-full">
            <span className="bg-[#697b39]" style={{ width: `${ratio(supplied, activeUnits.length)}%` }} />
            <span className="bg-[#b58b35]" style={{ width: `${ratio(strained, activeUnits.length)}%` }} />
            <span className="bg-[#8d3329]" style={{ width: `${ratio(critical, activeUnits.length)}%` }} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-[9px] uppercase tracking-[0.08em] text-staff-mute">
          <LegendDot color="#697b39" label={`Штат ${supplied}`} />
          <LegendDot color="#b58b35" label={`Низкое ${strained}`} />
          <LegendDot color="#8d3329" label={`Критично ${critical}`} />
        </div>
      </section>

      <section className="staff-panel-inset p-3">
        <div className="flex items-center justify-between">
          <h3 className="staff-section-title">Соединения в недостатке</h3>
          <span className="tabular text-[10px] text-staff-mute">{understrength.length}</span>
        </div>
        <div className="mt-2 space-y-1">
          {understrength.length === 0 && (
            <p className="border border-dashed border-staff-edge/70 px-3 py-4 text-center text-[10px] text-staff-mute">
              Критических отклонений не зафиксировано.
            </p>
          )}
          {understrength.slice(0, 6).map((unit) => {
            const readiness = Math.round((unit.currentSteps / unit.maxSteps) * 100);
            return (
              <div
                key={unit.id}
                className="grid grid-cols-[1fr_62px_44px] items-center gap-2 border-b border-staff-edge/45 py-2 text-[10px]"
              >
                <div className="min-w-0">
                  <div className="truncate text-staff-ink">{unit.shortName}</div>
                  <div className="mt-0.5 text-[8px] uppercase tracking-[0.1em] text-staff-mute">
                    {SIDE_SHORT[unit.side]} · {unit.supplyState}
                  </div>
                </div>
                <div className="h-1.5 overflow-hidden bg-staff-void">
                  <div
                    className={readiness < 50 ? "h-full bg-sov-fill" : "h-full bg-staff-gold"}
                    style={{ width: `${readiness}%` }}
                  />
                </div>
                <span className={`tabular text-right ${readiness < 50 ? "text-[#d76a58]" : "text-staff-ink-dim"}`}>
                  {readiness}%
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {report && (
        <section className="staff-panel-inset p-3">
          <h3 className="staff-section-title">Итоги суток</h3>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <SituationMetric label="Импульсы" value={report.impulses.length} compact />
            <SituationMetric label="Повреждены" value={report.damagedThisTurn.length} compact />
            <SituationMetric label="Сбои связи" value={report.commandFailures.length} compact />
          </div>
        </section>
      )}

      <section className="staff-panel-inset p-3">
        <div className="flex items-center justify-between">
          <h3 className="staff-section-title">Ключевые события</h3>
          <button
            onClick={() => setPanel("log")}
            className="text-[9px] uppercase tracking-[0.12em] text-staff-mute hover:text-staff-gold"
          >
            Весь журнал
          </button>
        </div>
        <div className="mt-2 space-y-1.5">
          {state.eventLog.slice(-5).reverse().map((event, index) => (
            <div key={`${event.type}:${index}`} className="flex gap-2 text-[10px] leading-snug text-staff-ink-dim">
              <span className="text-staff-gold">›</span>
              <span>{eventLabel(event.type)}</span>
            </div>
          ))}
          {state.eventLog.length === 0 && (
            <p className="text-[10px] text-staff-mute">Хроника начнётся после первого действия.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function SituationMetric({
  label,
  value,
  tone,
  compact = false,
}: {
  label: string;
  value: number;
  tone?: "danger";
  compact?: boolean;
}) {
  return (
    <div className={`${compact ? "bg-staff-void/45 px-2 py-2" : "bg-staff-panel px-3 py-3"}`}>
      <div className="text-[8px] uppercase tracking-[0.13em] text-staff-mute">{label}</div>
      <div className={`tabular mt-1 font-bold ${compact ? "text-sm" : "text-lg"} ${tone === "danger" ? "text-[#d76a58]" : "text-staff-ink"}`}>
        {value}
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2 w-2" style={{ background: color }} />
      {label}
    </span>
  );
}

function ratio(value: number, total: number): number {
  return total ? (value / total) * 100 : 0;
}

function eventLabel(type: string): string {
  if (type.includes("COMBAT")) return "Зафиксирован новый боевой контакт.";
  if (type.includes("BRIDGE")) return "Изменилось состояние переправы.";
  if (type.includes("SUPPLY")) return "Пересчитана сеть снабжения.";
  if (type.includes("ORDER")) return "Обновлено исполнение приказа.";
  if (type.includes("CARD")) return "Штаб разыграл оперативную карту.";
  if (type.includes("MOVED")) return "Соединение завершило марш.";
  return type.replaceAll("_", " ").toLowerCase();
}
