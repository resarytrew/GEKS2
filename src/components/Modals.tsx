"use client";

import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import { EVENTS, SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { SIDE_SHORT, ordinalTurn } from "@/lib/labels";
import type { GameEvent } from "@/engine/types";

export default function Modals() {
  const openPanel = useGame((s) => s.openPanel);
  const setPanel = useGame((s) => s.setPanel);
  const state = useGame((s) => s.state);
  if (!state || !openPanel || openPanel === "combat") return null;
  const close = () => setPanel(null);
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={close}>
      <div
        className="animate-telegraph flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-staff-edge bg-staff-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {openPanel === "report" && <Report />}
        {openPanel === "objectives" && <Objectives />}
        {openPanel === "log" && <Log />}
        {openPanel === "endgame" && <EndGame />}
        {openPanel === "help" && <Help />}
        <div className="flex justify-end border-t border-staff-edge bg-staff-panel2 px-4 py-2.5">
          <button onClick={close} className="rounded bg-staff-panel2 px-4 py-1.5 text-xs uppercase tracking-wider text-staff-ink-dim hover:text-staff-ink">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="border-b border-staff-edge bg-staff-panel2 px-5 py-3">
      <div className="font-dispatch text-lg text-staff-gold">{title}</div>
      {sub && <div className="text-[10px] uppercase tracking-wider text-staff-mute">{sub}</div>}
    </div>
  );
}

function Report() {
  const state = useGame((s) => s.state)!;
  const dispatch = useGame((s) => s.dispatch);
  if (state.phase === "after_action" && state.afterActionReport) {
    const report = state.afterActionReport;
    return (
      <>
        <Header
          title={`Разбор действий · ${report.date}`}
          sub={`Сутки ${report.turn} · шесть импульсов`}
        />
        <div className="staff-scroll overflow-y-auto p-5 text-sm text-staff-ink-dim">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Mini label="Контакты" value={String(report.combats.length)} />
            <Mini label="Уничтожено" value={String(report.destroyedUnits.length)} />
            <Mini label="Повреждено" value={String(report.damagedUnits.length)} />
            <Mini
              label="Мосты"
              value={String(report.bridgesDestroyed.length)}
            />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <ReportList
              title="Бои"
              values={report.combats.map(
                (combat) =>
                  `${combat.defenderHexId}: ${combat.outcome}, ${combat.odds}:1`,
              )}
            />
            <ReportList
              title="Потери"
              values={[
                ...report.destroyedUnits.map((id) => `${id} — уничтожен`),
                ...report.damagedUnits.map((id) => `${id} — ослаблен`),
              ]}
            />
            <ReportList
              title="Командные сбои"
              values={report.commandFailures}
            />
            <ReportList
              title="Изменения снабжения"
              values={report.supplyChanges}
            />
          </div>
          <div className="mt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">
              Ход исполнения
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {report.impulses.map((impulse) => (
                <div
                  key={impulse.impulse}
                  className="rounded border border-staff-edge bg-staff-panel2/50 p-2"
                >
                  <div className="font-mono text-[10px] text-staff-gold">
                    I{impulse.impulse + 1}
                  </div>
                  <div className="mt-1 text-[9px] text-staff-mute">
                    {impulse.combatIds.length} боёв
                  </div>
                  <div className="text-[9px] text-staff-mute">
                    {impulse.failedOrderIds.length} сбоев
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-staff-edge bg-staff-panel2 px-5 py-3 text-right">
          <button
            onClick={() => dispatch({ type: "END_PHASE" })}
            className="rounded bg-staff-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-staff-void hover:brightness-110"
          >
            Следующие сутки ▶
          </button>
        </div>
      </>
    );
  }
  const todayEvents = EVENTS.filter((e) => e.turn === state.turn);
  const gerCities = Object.values(state.hexes).filter((h) => h.settlement && h.control === "germany" && h.settlement.victoryPoints >= 3).map((h) => h.settlement!.name);
  return (
    <>
      <Header title={`Оперативная сводка · ${state.date}`} sub={ordinalTurn(state.turn)} />
      <div className="staff-scroll overflow-y-auto p-5 text-sm text-staff-ink-dim">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Погода" value={state.weather.label} />
          <Mini label="Инициатива" value={SIDE_SHORT[state.initiativeSide]} />
          <Mini label="Ход" value={SIDE_SHORT[state.activeSide]} />
          <Mini label="Очки (Г/С)" value={`${total(state, "germany")} / ${total(state, "ussr")}`} />
        </div>

        {todayEvents.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">События суток</div>
            {todayEvents.map((e) => (
              <div key={e.id} className="mb-2 rounded border border-staff-edge bg-staff-panel2/50 p-2.5">
                <div className="font-dispatch text-sm text-staff-ink">{e.title}</div>
                <p className="mt-0.5 text-[11px] leading-snug text-staff-mute">{e.text}</p>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">Обстановка</div>
          <p className="text-[11px] leading-relaxed">
            Под контролем Германии: <span className="text-staff-ink">{gerCities.length ? gerCities.join(", ") : "приграничные районы"}</span>.
            Распределите командные очки, назначьте приказы и разыграйте карты в штабной фазе.
          </p>
        </div>
      </div>
      {state.phase === "morning_report" && (
        <div className="border-t border-staff-edge bg-staff-panel2 px-5 py-3 text-right">
          <button
            onClick={() => dispatch({ type: "END_PHASE" })}
            className="rounded bg-staff-gold px-5 py-2 text-xs font-bold uppercase tracking-wider text-staff-void hover:brightness-110"
          >
            Начать сутки ▶
          </button>
        </div>
      )}
    </>
  );
}

function ReportList({ title, values }: { title: string; values: string[] }) {
  return (
    <section className="rounded border border-staff-edge bg-staff-panel2/40 p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-staff-mute">
        {title}
      </h3>
      {values.length === 0 ? (
        <p className="mt-2 text-[10px] text-staff-mute">Нет событий.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-[10px] text-staff-ink-dim">
          {values.slice(0, 12).map((value, index) => (
            <li key={`${value}:${index}`}>· {value}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Objectives() {
  const state = useGame((s) => s.state)!;
  const groups: Array<"germany" | "ussr"> = ["germany", "ussr"];
  return (
    <>
      <Header title="Оперативные цели" sub="Победные очки и исторические ориентиры" />
      <div className="staff-scroll grid grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
        {groups.map((side) => (
          <div key={side}>
            <div className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${side === "germany" ? "text-ger-accent" : "text-sov-accent"}`}>
              {SIDE_SHORT[side]}
            </div>
            <div className="flex flex-col gap-1.5">
              {state.objectives.filter((o) => o.side === side).map((o) => (
                <div key={o.id} className={`rounded border p-2 text-[11px] ${o.status === "completed" ? "border-green-700/50 bg-green-950/20" : o.status === "failed" ? "border-red-800/50 bg-red-950/20 opacity-60" : "border-staff-edge bg-staff-panel2/50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-staff-ink">{o.description}</span>
                    <span className="tabular text-staff-gold">{o.points}</span>
                  </div>
                  {o.historicalBaseline && <div className="mt-1 text-[9px] italic text-staff-mute">{o.historicalBaseline}</div>}
                  <div className="mt-0.5 text-[9px] uppercase tracking-wider text-staff-mute">
                    {o.status === "completed" ? "✓ выполнено" : o.status === "failed" ? "✕ провалено" : "○ активно"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Log() {
  const state = useGame((s) => s.state)!;
  const log = state.eventLog.slice(-90).reverse();
  return (
    <>
      <Header title="Журнал действий" sub="Хроника партии (детерминированная лента событий)" />
      <div className="staff-scroll max-h-[60vh] overflow-y-auto p-3">
        {log.map((e, i) => (
          <div key={i} className="flex items-start gap-2 border-b border-staff-edge/40 py-1 text-[11px]">
            <span className="mt-0.5 shrink-0">{icon(e)}</span>
            <span className="text-staff-ink-dim">{label(e)}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function EndGame() {
  const state = useGame((s) => s.state)!;
  const router = useRouter();
  const g = total(state, "germany");
  const s = total(state, "ussr");
  const captured = Object.values(state.hexes)
    .filter((h) => h.settlement && (h.settlement.importance === "strategic" || h.settlement.importance === "major") && h.control === "germany")
    .map((h) => h.settlement!.name);
  const sovAlive = Object.values(state.units).filter((u) => u.side === "ussr" && !u.eliminated).length;
  const gerMobileAlive = Object.values(state.units).filter((u) => u.side === "germany" && !u.eliminated && (u.unitType === "tank" || u.unitType === "motorized")).length;
  const cardsPlayed = state.eventLog.filter((e) => e.type === "CARD_PLAYED").length;
  return (
    <>
      <Header title="Итог операции" sub={state.resultType ?? "Партия завершена"} />
      <div className="staff-scroll overflow-y-auto p-5 text-sm text-staff-ink-dim">
        <div className="rounded border border-staff-gold/40 bg-staff-gold/10 p-4 text-center">
          <div className="font-dispatch text-2xl text-staff-gold">{state.resultType}</div>
          <div className="mt-1 text-xs">Германия {g} · СССР {s}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Mini label="Ходов сыграно" value={`${state.turn} / ${SCENARIO.totalTurns}`} />
          <Mini label="Под контролем GER" value={captured.length ? captured.slice(0, 3).join(", ") + (captured.length > 3 ? "…" : "") : "—"} />
          <Mini label="Сохранено дивизий РККА" value={String(sovAlive)} />
          <Mini label="Подвижных GER живо" value={String(gerMobileAlive)} />
        </div>
        <div className="mt-4">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-staff-mute">Историческое сравнение</div>
          <p className="text-[11px] leading-relaxed">
            Исторически авангард LVI корпуса вышел к Даугавпилсу 26 июня, Рига была оставлена в начале июля,
            а немецкие войска вышли к Острову и Пскову к 8–9 июля. В вашей партии Германия
            {captured.includes("Даугавпилс") ? " захватила Даугавпилс" : " не достигла Даугавпилса"},
            а советские войска {sovAlive > 8 ? "сохранили основную группировку" : "понесли тяжёлые потери"}.
            Сыгра­но карт: {cardsPlayed}. Каждое событие воспроизводимо по seed партии.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <button onClick={() => router.push("/")} className="rounded bg-staff-panel2 px-4 py-2 text-xs uppercase tracking-wider text-staff-ink-dim hover:text-staff-ink">
            В главное меню
          </button>
          <button
            onClick={() => {
              useGame.getState().newGame({});
              router.push("/play");
            }}
            className="rounded bg-staff-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-staff-void hover:brightness-110"
          >
            Новая партия
          </button>
        </div>
      </div>
    </>
  );
}

function Help() {
  return (
    <>
      <Header title="Как играть" sub="Короткое руководство" />
      <div className="staff-scroll max-h-[60vh] overflow-y-auto p-5 text-[12px] leading-relaxed text-staff-ink-dim">
        <p><b className="text-staff-ink">Цель.</b> Германия рвётся вперёд за темпом и переправами. СССР выигрывает время, сохраняет армии, рвёт мосты и наносит потери подвижным частям.</p>
        <p className="mt-2"><b className="text-staff-ink">Сутки.</b> Нажимайте «Начать сутки ▶» / «Завершить активацию стороны ▶». В фазе активаций ходят обе стороны по очереди.</p>
        <p className="mt-2"><b className="text-staff-ink">Движение.</b> Кликните своё соединение — появятся зелёные гексы. Кликните по ним, чтобы идти. Лес, болото и река без моста замедляют или блокируют движение.</p>
        <p className="mt-2"><b className="text-staff-ink">Атака.</b> Кликните соседний гекс с противником — откроется боевой рапорт с прогнозом. Сосредоточьте силы для благоприятного соотношения.</p>
        <p className="mt-2"><b className="text-staff-ink">Командование и снабжение.</b> Расстояние до штаба и сеть снабжения влияют на стоимость приказов и боеспособность. У СССР в первые дни связь нарушена.</p>
        <p className="mt-2"><b className="text-staff-ink">Карты.</b> В нижней панели — карты событий. Выберите цель (гекс с мостом или соединение) и разыграйте. Каждая карта — конкретный исторический приём, а не абстрактный бонус.</p>
        <p className="mt-2 text-[10px] italic text-staff-mute">Все броски определяются seed партии — партия полностью воспроизводима.</p>
      </div>
    </>
  );
}

function total(state: ReturnType<typeof useGame.getState>["state"], side: "germany" | "ussr"): number {
  if (!state) return 0;
  const sc = state.scores[side];
  return sc.operationalPoints + sc.territorialPoints + sc.delayPoints + sc.preservationPoints + sc.destructionPoints + sc.objectivePoints - sc.penalties;
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-staff-edge bg-staff-panel2/50 p-2">
      <div className="text-[9px] uppercase tracking-wider text-staff-mute">{label}</div>
      <div className="text-[12px] text-staff-ink">{value}</div>
    </div>
  );
}

function icon(e: GameEvent): string {
  switch (e.type) {
    case "UNIT_LOST_STEP":
    case "UNIT_ELIMINATED":
    case "COMBAT_DECLARED":
      return "⚔";
    case "UNIT_MOVED":
      return "→";
    case "BRIDGE_DESTROYED":
      return "✕";
    case "CARD_PLAYED":
    case "CARD_DRAWN":
      return "✦";
    case "OBJECTIVE_COMPLETED":
      return "★";
    case "OBJECTIVE_FAILED":
      return "○";
    case "EVENT_TRIGGERED":
      return "❖";
    case "TURN_ADVANCED":
      return "☼";
    case "PHASE_CHANGED":
      return "›";
    default:
      return "·";
  }
}

function label(e: GameEvent): string {
  switch (e.type) {
    case "ORDER_ASSIGNED": return `Приказ: ${e.unitId} → ${e.order.type}`;
    case "UNIT_MOVED": return `${e.unitId} совершил марш`;
    case "FUEL_SPENT": return `${e.unitId}: расход топлива −${e.amount}`;
    case "COMBAT_DECLARED": return `Начат бой ${e.combatId}`;
    case "DICE_ROLLED": return `Бросок d6 = ${e.value}${e.tag ? ` (${e.tag})` : ""}`;
    case "UNIT_LOST_STEP": return `${e.unitId}: −${e.amount} шаг`;
    case "UNIT_ELIMINATED": return `${e.unitId} уничтожен`;
    case "UNIT_RETREATED": return `${e.unitId} отступил`;
    case "UNIT_ADVANCED": return `${e.unitId} развил успех → ${e.to}`;
    case "UNIT_DISORGANIZED": return `${e.unitId} дезорганизован`;
    case "HEX_CONTROL_CHANGED": return `Контроль гекса ${e.hexId}: ${e.side}`;
    case "BRIDGE_DESTROYED": return `Мост разрушен (${e.hexId}, грань ${e.edge})`;
    case "BRIDGE_DAMAGED": return `Мост повреждён`;
    case "CARD_PLAYED": return `Карта разыграна: ${e.defId}`;
    case "CARD_DRAWN": return `Карта получена: ${e.defId} (${e.side})`;
    case "COMMAND_POINTS_SPENT": return `Командные очки: −${e.amount} (${e.hqId})`;
    case "OBJECTIVE_COMPLETED": return `Цель выполнена (+${e.points}, ${e.side})`;
    case "OBJECTIVE_FAILED": return `Цель провалена (${e.side})`;
    case "PHASE_CHANGED": return `Фаза: ${e.phase}`;
    case "TURN_ADVANCED": return `Сутки ${e.turn} — ${e.date}`;
    case "SUPPLY_UPDATED": return `${e.unitId}: снабжение ${e.state}`;
    case "WEATHER_CHANGED": return `Погода: ${e.condition}`;
    case "EVENT_TRIGGERED": return e.title;
    case "GAME_COMPLETED": return `${e.resultType} — победа: ${e.winner}`;
    default: return JSON.stringify(e);
  }
}
