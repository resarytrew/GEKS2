"use client";

import { useState, type ReactNode } from "react";
import { useGame, unitsAt } from "@/store/gameStore";
import { COMMANDERS, SOURCES } from "@/scenarios/baltic-1941/scenario";
import {
  COMMAND_LABEL,
  ECHELON_LABEL,
  SUPPLY_COLOR,
  SUPPLY_LABEL,
  TERRAIN_LABEL,
  UNIT_TYPE_LABEL,
} from "@/lib/labels";
import type { UnitState } from "@/engine/types";

export default function SidePanels() {
  const state = useGame((s) => s.state);
  const selectedHexId = useGame((s) => s.selectedHexId);
  const selectedUnitIds = useGame((s) => s.selectedUnitIds);
  const toggle = useGame((s) => s.toggleUnitInSelection);
  const [tab, setTab] = useState<"inspect" | "orders" | "situation">("inspect");
  if (!state) return null;
  const hex = selectedHexId ? state.hexes[selectedHexId] : null;
  const stack = hex ? unitsAt(state, selectedHexId!) : [];
  const inspectedId = selectedUnitIds[0] ?? stack[0]?.id;
  const inspected = inspectedId ? state.units[inspectedId] : undefined;

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b-2 border-[#77715e] bg-[#e2d6b9]" role="tablist" aria-label="Оперативный лист">
        <SheetTab active={tab === "inspect"} onClick={() => setTab("inspect")}>Осмотр</SheetTab>
        <SheetTab active={tab === "orders"} onClick={() => setTab("orders")}>Приказы</SheetTab>
        <SheetTab active={tab === "situation"} onClick={() => setTab("situation")}>Обстановка</SheetTab>
      </div>
      {tab === "orders" ? <OrdersSheet /> : tab === "situation" ? <SituationSheet /> : !hex ? (
        <div className="flex h-full flex-col items-center justify-center p-6 text-center text-staff-mute"><div className="font-dispatch text-lg text-staff-ink">Оперативный лист</div><p className="mt-2 text-xs leading-relaxed">Выберите гекс, чтобы изучить местность. Выберите своё соединение, чтобы увидеть доступные маршруты и создать приказ.</p></div>
      ) : (
      <div className="staff-scroll flex h-full flex-col gap-3 overflow-y-auto p-3">
      <HexInfo />
      {stack.length > 0 && (
        <section className="border border-staff-edge bg-staff-panel2/60 p-2.5">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">
            Стек соединений ({stack.length})
          </h3>
          <div className="flex flex-col gap-1.5">
            {stack.map((u) => (
              <UnitRow
                key={u.id}
                unit={u}
                selected={selectedUnitIds.includes(u.id)}
                onToggle={() => toggle(u.id)}
              />
            ))}
          </div>
          {selectedUnitIds.length > 1 && (
            <p className="mt-2 text-[10px] text-staff-mute">
              Выбрано {selectedUnitIds.length} — перемещаются и атакуют вместе.
            </p>
          )}
        </section>
      )}
      {inspected && <UnitInspector unit={inspected} />}
      </div>
      )}
    </div>
  );
}

function SheetTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button role="tab" aria-selected={active} onClick={onClick} className={`flex-1 border-b-2 px-2 py-3 text-[9px] font-bold uppercase tracking-[.1em] ${active ? "border-staff-gold text-staff-ink" : "border-transparent text-staff-mute hover:text-staff-ink"}`}>{children}</button>;
}

function OrdersSheet() {
  const state = useGame((s) => s.state)!;
  const remove = useGame((s) => s.dispatch);
  const orders = state.plans[state.activeSide].orders;
  return <div className="staff-scroll h-full overflow-y-auto p-3"><div className="sheet-title pb-2 font-dispatch text-lg">Приказы · {state.activeSide === "germany" ? "Германия" : "СССР"}</div><p className="mt-2 text-[11px] leading-relaxed text-staff-ink-dim">{orders.length ? "Статус приказов берётся из плана движка." : "Черновиков нет. Выберите свои соединения и укажите достижимый гекс на карте."}</p><div className="mt-3 space-y-2">{orders.map((order) => <article key={order.id} className="border-l-2 border-staff-gold bg-staff-panel2/50 p-2"><div className="flex items-start justify-between gap-2"><div><b className="text-[11px] text-staff-ink">{orderLabel(order.orderType)}</b><div className="mt-1 text-[10px] text-staff-ink-dim">{order.entityIds.map((id) => state.units[id]?.shortName ?? id).join(", ")}</div></div><span className="text-[9px] uppercase tracking-wide text-staff-mute">{order.status}</span></div>{order.delayReasons?.length ? <p className="mt-1 text-[10px] text-staff-mute">{order.delayReasons.join("; ")}</p> : null}{order.status === "draft" && <button onClick={() => remove({ type: "REMOVE_PLANNED_ORDER", side: state.activeSide, plannedOrderId: order.id })} className="mt-2 border border-staff-edge px-2 py-1 text-[9px] uppercase tracking-wide text-staff-ink-dim hover:border-staff-edge2">Отменить черновик</button>}</article>)}</div></div>;
}

function SituationSheet() {
  const state = useGame((s) => s.state)!;
  const setPanel = useGame((s) => s.setPanel);
  const objectives = state.objectives.filter((objective) => objective.side === state.activeSide && objective.status === "active");
  return <div className="staff-scroll h-full overflow-y-auto p-3"><div className="sheet-title pb-2 font-dispatch text-lg">Оперативная обстановка</div><div className="mt-3 border-l-2 border-staff-gold pl-3"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-staff-mute">Текущий этап</div><p className="mt-1 text-[11px] leading-relaxed text-staff-ink-dim">{state.phase === "planning" ? "Составьте и подтвердите приказы. Противник их не увидит." : "Следуйте указанию фазовой ленты; результаты определяются движком."}</p></div><div className="mt-4"><div className="text-[9px] font-bold uppercase tracking-[.12em] text-staff-mute">Активные цели</div>{objectives.slice(0, 3).map((objective) => <p className="mt-2 text-[11px] text-staff-ink-dim" key={objective.id}>{objective.description} <b className="tabular text-staff-ink">{objective.points}</b></p>)}</div><button onClick={() => setPanel("log")} className="mt-4 border border-staff-edge px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-staff-ink-dim hover:border-staff-edge2">Открыть журнал</button></div>;
}

function orderLabel(type: string): string { return ({ march: "Марш", advance: "Продвижение", prepared_attack: "Подготовленная атака", defend: "Оборона", delay: "Сдерживание", withdraw: "Отход", reserve: "Резерв", recover: "Восстановление", prepare_demolition: "Подготовка подрыва", build_pontoon: "Понтон" } as Record<string, string>)[type] ?? type; }

function HexInfo() {
  const state = useGame((s) => s.state)!;
  const hexId = useGame((s) => s.selectedHexId)!;
  const hex = state.hexes[hexId];
  const hasRiver = hex.riverEdges.length > 0;
  const bridges = hex.bridgeEdges;
  return (
    <section className="rounded border border-staff-edge bg-staff-panel2/60 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-staff-mute">Гекс</h3>
        <span className="font-mono text-[10px] text-staff-mute">{hexId}</span>
      </div>
      {hex.settlement ? (
        <div className="mt-1 font-dispatch text-lg text-staff-gold">{hex.settlement.name}</div>
      ) : (
        <div className="mt-1 text-sm text-staff-ink-dim">{TERRAIN_LABEL[hex.terrain]}</div>
      )}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Field label="Местность" value={TERRAIN_LABEL[hex.terrain]} />
        <Field
          label="Контроль"
          value={hex.control === "germany" ? "Германия" : hex.control === "ussr" ? "СССР" : hex.control === "contested" ? "Спорный" : "Нейтрально"}
        />
        {hex.settlement && <Field label="Очки" value={String(hex.settlement.victoryPoints)} />}
        {hex.fortificationLevel > 0 && <Field label="Укрепления" value={`ур. ${hex.fortificationLevel}`} />}
        {hasRiver && <Field label="Река" value="по грани" />}
        {hex.majorRoadEdges.length > 0 && <Field label="Шоссе" value="есть" />}
        {hex.railwayEdges.length > 0 && <Field label="Ж/д" value="есть" />}
      </div>
      {bridges.length > 0 && (
        <div className="mt-2 border-t border-staff-edge pt-2 text-[11px]">
          <span className="text-staff-mute">Переправы: </span>
          {bridges.map((b, i) => (
            <span key={i} className="mr-2">
              {b.state === "intact" ? "мост исправен" : b.state === "destroyed" ? "мост разрушен" : b.state === "pontoon" ? "понтонная переправа" : "мост повреждён"}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] uppercase tracking-wider text-staff-mute">{label}</span>
      <span className="text-staff-ink-dim">{value}</span>
    </div>
  );
}

function UnitRow({ unit, selected, onToggle }: { unit: UnitState; selected: boolean; onToggle: () => void }) {
  const isGer = unit.side === "germany";
  const canAct = unit.side === useGame.getState().state?.activeSide && !unit.acted && !unit.eliminated;
  return (
    <button
      onClick={onToggle}
      className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left transition ${
        selected ? "border-staff-gold bg-staff-gold/10" : "border-staff-edge bg-staff-panel/60 hover:border-staff-edge2"
      }`}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded text-[9px] font-bold ${isGer ? "bg-ger-fill text-ger-text" : "bg-sov-fill text-sov-text"}`}>
        {unit.shortName.slice(0, 3)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] text-staff-ink">{unit.shortName}</span>
        <span className="block text-[9px] text-staff-mute">{UNIT_TYPE_LABEL[unit.unitType]} · {unit.currentSteps}/{unit.maxSteps} шаг.</span>
      </span>
      <span className="flex flex-col items-end gap-0.5">
        {selected && <span className="h-1.5 w-1.5 rounded-full bg-staff-gold" />}
        {unit.acted && <span className="text-[8px] uppercase text-staff-mute">отыграл</span>}
        {!canAct && !unit.acted && <span className="text-[8px] uppercase text-staff-mute">чужая</span>}
      </span>
    </button>
  );
}

function UnitInspector({ unit }: { unit: UnitState }) {
  const state = useGame((s) => s.state)!;
  const hq = unit.parentCorpsId ? state.headquarters[unit.parentCorpsId] : undefined;
  const commander = unit.commanderId ? COMMANDERS[unit.commanderId] : undefined;
  const isGer = unit.side === "germany";
  return (
    <section className="rounded border border-staff-edge bg-staff-panel2/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-dispatch text-base text-staff-ink">{unit.historicalName}</h3>
          <div className="text-[10px] uppercase tracking-wider text-staff-mute">
            {ECHELON_LABEL[unit.echelon]} · {UNIT_TYPE_LABEL[unit.unitType]}
          </div>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-bold uppercase ${isGer ? "bg-ger-dark text-ger-accent" : "bg-sov-dark text-sov-accent"}`}>
          {isGer ? "GER" : "SOV"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1.5 text-center">
        <Stat label="Атк" value={unit.attack} />
        <Stat label="Защ" value={unit.defense} />
        <Stat label="Двж" value={unit.movement} />
        <Stat label="Кач" value={unit.quality} />
      </div>

      <div className="mt-2 space-y-1.5">
        <Bar label="Организация" value={unit.organization} color="#8da0bd" />
        <Bar label="Мораль" value={unit.morale} color="#c9a24b" />
        {unit.movementClass !== "foot" && <Bar label="Топливо" value={unit.fuel} color="#7bbf6a" />}
        <Bar label="Боеприпасы" value={unit.ammunition} color="#cf8a3a" />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div>
          <span className="text-[9px] uppercase tracking-wider text-staff-mute">Снабжение</span>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: SUPPLY_COLOR[unit.supplyState] }} />
            <span className="text-staff-ink-dim">{SUPPLY_LABEL[unit.supplyState]}</span>
          </div>
        </div>
        <div>
          <span className="text-[9px] uppercase tracking-wider text-staff-mute">Командование</span>
          <div className="text-staff-ink-dim">{COMMAND_LABEL[unit.commandState]}</div>
        </div>
      </div>

      {hq && (
        <div className="mt-2 text-[10px] text-staff-mute">
          Подчинение: <span className="text-staff-ink-dim">{hq.name}</span>
        </div>
      )}
      {unit.traits.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {unit.traits.map((t) => (
            <span key={t} className="rounded bg-staff-panel px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-staff-ink-dim">
              {traitLabel(t)}
            </span>
          ))}
        </div>
      )}
      {commander && (
        <div className="mt-2 border-t border-staff-edge pt-2">
          <div className="text-[10px] font-semibold text-staff-ink">{commander.name}</div>
          <div className="text-[9px] uppercase tracking-wider text-staff-mute">{commander.role}</div>
          <p className="mt-1 text-[10px] leading-relaxed text-staff-mute">{commander.bio}</p>
        </div>
      )}
      <div className="mt-2 border-t border-staff-edge pt-2">
        <div className="text-[9px] uppercase tracking-wider text-staff-mute">Источники</div>
        {unit.historicalSources.map((s, i) => (
          <div key={i} className="mt-1 text-[10px] leading-snug text-staff-mute">
            <span className={`mr-1 rounded px-1 py-px text-[8px] uppercase ${confClass(s.confidence)}`}>{s.confidence}</span>
            {s.title}
          </div>
        ))}
        <div className="mt-1 text-[9px] italic text-staff-mute">
          География театра — {SOURCES.geo.confidence}.
        </div>
      </div>
    </section>
  );
}

function confClass(c: string): string {
  switch (c) {
    case "confirmed": return "bg-green-900/60 text-green-300";
    case "probable": return "bg-amber-900/60 text-amber-300";
    case "reconstructed": return "bg-sky-900/60 text-sky-300";
    case "disputed": return "bg-orange-900/60 text-orange-300";
    default: return "bg-stone-700/60 text-stone-300";
  }
}

function traitLabel(t: string): string {
  const map: Record<string, string> = {
    tracked: "гусеничный ход",
    motorized: "моторизов.",
    foot: "пешая",
    heavy_armor: "тяжёлая броня",
    combined_arms: "комбинир. родов",
    heavy_at: "тяжёлые ПТО",
    engineer: "сапёры",
  };
  return map[t] ?? t;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-staff-panel py-1">
      <div className="text-[8px] uppercase tracking-wider text-staff-mute">{label}</div>
      <div className="tabular text-sm font-semibold text-staff-ink">{value}</div>
    </div>
  );
}

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[9px] text-staff-mute">
        <span>{label}</span>
        <span className="tabular">{Math.round(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded bg-staff-void">
        <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
      </div>
    </div>
  );
}
