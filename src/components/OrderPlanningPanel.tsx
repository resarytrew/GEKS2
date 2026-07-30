"use client";

import { useMemo, useState } from "react";
import { useGame } from "@/store/gameStore";
import {
  assessOrderReliability,
  IMPULSE_LABELS,
  LAST_EXECUTION_IMPULSE,
} from "@/engine/wego";
import { getEligibleSupportUnits } from "@/engine/support";
import {
  ORDER_RELIABILITY_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from "@/engine/presentation";
import { CARD_DEFS } from "@/scenarios/baltic-1941/scenario";
import {
  SUPPORTED_RESERVE_TRIGGER_CONDITIONS,
  type PlannedOrder,
  type PlannedOrderType,
  type PlannedReaction,
  type ReactionCondition,
} from "@/engine/types";

const ROUTE_ORDERS = new Set<PlannedOrderType>([
  "march",
  "advance",
  "withdraw",
]);

export default function OrderPlanningPanel() {
  const state = useGame((store) => store.state);
  const selectedUnitIds = useGame((store) => store.selectedUnitIds);
  const selectedHexId = useGame((store) => store.selectedHexId);
  const attackTargetHexId = useGame((store) => store.attackTargetHexId);
  const planningRoute = useGame((store) => store.planningRoute);
  const dispatch = useGame((store) => store.dispatch);
  const clearSelection = useGame((store) => store.clearSelection);
  const [orderType, setOrderType] = useState<PlannedOrderType>("march");
  const [startImpulse, setStartImpulse] = useState(0);
  const [priority, setPriority] = useState(2);
  const [contactPolicy, setContactPolicy] =
    useState<PlannedOrder["contactPolicy"]>("attack");
  const [lossTolerance, setLossTolerance] =
    useState<PlannedOrder["lossTolerance"]>("normal");
  const [targetHexId, setTargetHexId] = useState("");
  const [bridgeEdge, setBridgeEdge] = useState(0);
  const [waitFor, setWaitFor] = useState<string[]>([]);
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [cardIds, setCardIds] = useState<string[]>([]);

  const side = state?.activeSide;
  const plan = side && state ? state.plans[side] : undefined;
  const lead = state && selectedUnitIds[0] ? state.units[selectedUnitIds[0]] : undefined;
  const derivedTarget =
    targetHexId ||
    attackTargetHexId ||
    planningRoute?.at(-1) ||
    selectedHexId ||
    "";
  const supportCandidates = useMemo(() => {
    if (!state || !side) return [];
    if (!derivedTarget) return [];
    return getEligibleSupportUnits(
      state,
      side,
      derivedTarget,
      undefined,
      startImpulse,
    )
      .filter((entry) => entry.eligible)
      .map((entry) => state.units[entry.unitId])
      .filter((unit) => !!unit && !selectedUnitIds.includes(unit.id));
  }, [derivedTarget, selectedUnitIds, side, startImpulse, state]);

  if (!state || state.phase !== "planning" || !side || !plan) return null;

  const draft: PlannedOrder | undefined =
    lead && selectedUnitIds.length > 0
      ? {
          id: `order:${state.turn}:${side}:${[...selectedUnitIds].sort().join("+")}`,
          side,
          entityIds: [...selectedUnitIds],
          orderType,
          route: ROUTE_ORDERS.has(orderType)
            ? planningRoute ?? undefined
            : undefined,
          targetHexId:
            orderType === "prepared_attack" ? derivedTarget || undefined : undefined,
          startImpulse,
          priority,
          contactPolicy,
          lossTolerance,
          supportIds,
          waitForEntityIds: [...waitFor],
          cardIds,
          bridgeHexId:
            orderType === "prepare_demolition" || orderType === "build_pontoon"
              ? derivedTarget || lead.hexId
              : undefined,
          bridgeEdge:
            orderType === "prepare_demolition" || orderType === "build_pontoon"
              ? bridgeEdge
              : undefined,
          reserveData:
            orderType === "reserve"
              ? {
                  triggerRadius: 2,
                  triggerConditions: [
                    ...SUPPORTED_RESERVE_TRIGGER_CONDITIONS,
                  ],
                  targetPriority: derivedTarget ? [derivedTarget] : [],
                  maxCommitImpulse: LAST_EXECUTION_IMPULSE,
                }
              : undefined,
          status: "draft",
        }
      : undefined;
  const reliability = draft ? assessOrderReliability(state, draft) : undefined;

  const submit = () => {
    if (!draft) return;
    if (dispatch({ type: "UPSERT_PLANNED_ORDER", side, plannedOrder: draft })) {
      clearSelection();
      setSupportIds([]);
      setCardIds([]);
      setWaitFor([]);
      setTargetHexId("");
    }
  };

  return (
    <section className="border-b border-staff-edge/80 bg-staff-bg/40 p-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="staff-section-title">Приказы</h2>
          <p className="mt-1 text-[9px] uppercase tracking-[0.18em] text-staff-mute">
            Планирование · скрыто до контакта
          </p>
        </div>
        <span className="border border-staff-edge px-2 py-1 text-[10px] text-staff-mute">
          {plan.orders.length} приказов
        </span>
      </div>

      {plan.committed ? (
        <p className="mt-3 border border-staff-gold/30 bg-staff-gold/10 p-2 text-[11px] text-staff-gold">
          План зафиксирован. Передайте устройство второй стороне.
        </p>
      ) : (
        <>
          <StepLabel number={1} title="Выбранные части" />
          <div className="mt-2 border border-staff-edge/70 bg-staff-void/45 px-3 py-2 text-[10px] text-staff-ink-dim">
            {selectedUnitIds.length > 0
              ? `${selectedUnitIds.length} соединений готовы получить приказ`
              : "Выберите свои соединения на карте"}
          </div>

          <StepLabel number={2} title="Тип и параметры приказа" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[10px] text-staff-mute">
              Тип приказа
              <select
                value={orderType}
                onChange={(event) =>
                  setOrderType(event.target.value as PlannedOrderType)
                }
                className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1.5 text-[11px] text-staff-ink"
              >
                {Object.entries(ORDER_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <SmallSelect
              label="Старт"
              value={startImpulse}
              onChange={setStartImpulse}
              options={IMPULSE_LABELS.map((label, index) => ({
                value: index,
                label: `${index + 1}. ${label}`,
              }))}
            />
            <SmallSelect
              label="Приоритет"
              value={priority}
              onChange={setPriority}
              options={[1, 2, 3, 4, 5].map((value) => ({
                value,
                label: String(value),
              }))}
            />
            <label className="text-[10px] text-staff-mute">
              Контакт
              <select
                value={contactPolicy}
                onChange={(event) =>
                  setContactPolicy(
                    event.target.value as PlannedOrder["contactPolicy"],
                  )
                }
                className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1 text-[11px] text-staff-ink"
              >
                <option value="avoid">избегать</option>
                <option value="fix">остановиться и связать боем</option>
                <option value="attack">атаковать</option>
                <option value="assault">штурмовать</option>
              </select>
            </label>
            <label className="text-[10px] text-staff-mute">
              Потери
              <select
                value={lossTolerance}
                onChange={(event) =>
                  setLossTolerance(
                    event.target.value as PlannedOrder["lossTolerance"],
                  )
                }
                className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1 text-[11px] text-staff-ink"
              >
                <option value="low">низкий порог</option>
                <option value="normal">обычный</option>
                <option value="high">высокий</option>
              </select>
            </label>
          </div>

          <StepLabel number={3} title="Маршрут и цель" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <TextField
              label="Целевой гекс"
              value={targetHexId || derivedTarget}
              onChange={setTargetHexId}
              placeholder="выберите на карте"
            />
            {(orderType === "prepare_demolition" ||
              orderType === "build_pontoon") && (
              <label className="text-[10px] text-staff-mute">
                Ребро 0–5
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={bridgeEdge}
                  onChange={(event) => setBridgeEdge(Number(event.target.value))}
                  className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1 text-[11px] text-staff-ink"
                />
                <span className="mt-1 block text-[8px] text-staff-mute">
                  0 В · 1 СВ · 2 ЮВ · 3 З · 4 ЮЗ · 5 СЗ
                </span>
              </label>
            )}
          </div>

          <StepLabel number={4} title="Поддержка и условия" />
          {supportCandidates.length > 0 && (
            <ChoiceRow
              title="Поддержка"
              choices={supportCandidates.map((unit) => ({
                id: unit.id,
                label: unit.shortName,
              }))}
              selected={supportIds}
              onToggle={(id) =>
                setSupportIds((current) =>
                  current.includes(id)
                    ? current.filter((value) => value !== id)
                    : [...current, id],
                )
              }
            />
          )}
          {selectedUnitIds.length > 0 && (
            <ChoiceRow
              title="Ожидать соединения"
              choices={Object.values(state.units)
                .filter(
                  (unit) =>
                    unit.side === side &&
                    !unit.eliminated &&
                    !selectedUnitIds.includes(unit.id),
                )
                .map((unit) => ({
                  id: unit.id,
                  label: unit.shortName,
                }))}
              selected={waitFor}
              onToggle={(id) =>
                setWaitFor((current) =>
                  current.includes(id)
                    ? current.filter((value) => value !== id)
                    : [...current, id],
                )
              }
            />
          )}
          {state.playerHands[side].length > 0 && (
            <ChoiceRow
              title="Карты к приказу"
              choices={state.playerHands[side].map((id) => ({
                id,
                label:
                  CARD_DEFS.find(
                    (definition) => definition.defId === state.cards[id]?.defId,
                  )?.title ?? id,
              }))}
              selected={cardIds}
              onToggle={(id) =>
                setCardIds((current) =>
                  current.includes(id)
                    ? current.filter((value) => value !== id)
                    : [...current, id],
                )
              }
            />
          )}

          <StepLabel number={5} title="Надёжность и стоимость" />
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0 text-[10px] text-staff-mute">
              <div>
                Выбрано:{" "}
                <span className="text-staff-ink">{selectedUnitIds.length}</span>
                {planningRoute && ` · маршрут ${planningRoute.length - 1} гекс.`}
              </div>
              {reliability && (
                <div className="mt-0.5">
                  Надёжность:{" "}
                  <span className="text-staff-gold">
                    {ORDER_RELIABILITY_LABELS[reliability.level]}
                  </span>{" "}
                  ·
                  задержка {reliability.delay.minimum}–{reliability.delay.maximum}
                </div>
              )}
            </div>
            <button
              disabled={
                !draft ||
                (ROUTE_ORDERS.has(orderType) && !planningRoute) ||
                (orderType === "prepared_attack" && !derivedTarget)
              }
              onClick={submit}
              className="shrink-0 border border-red-900/70 bg-sov-fill px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-sov-text hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Добавить
            </button>
          </div>
        </>
      )}

      {plan.orders.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-staff-edge pt-2">
          {plan.orders.map((order) => (
            <div
              key={order.id}
              className="flex items-center gap-2 border border-staff-edge/60 bg-staff-void/55 px-2 py-1.5 text-[10px]"
            >
              <span className="min-w-0 flex-1 truncate text-staff-ink-dim">
                {ORDER_TYPE_LABELS[order.orderType]} · {order.entityIds.length} · I
                {order.startImpulse + 1}
              </span>
              <span className="text-staff-mute">
                {ORDER_STATUS_LABELS[order.status]}
              </span>
              {!plan.committed && (
                <button
                  onClick={() =>
                    dispatch({
                      type: "REMOVE_PLANNED_ORDER",
                      side,
                      plannedOrderId: order.id,
                    })
                  }
                  className="text-red-300 hover:text-red-200"
                  title="Удалить приказ"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!plan.committed && (
        <ReactionTemplates
          reactions={plan.reactions}
          entityIds={selectedUnitIds}
          targetHexId={derivedTarget}
          edge={bridgeEdge}
        />
      )}
    </section>
  );
}

function StepLabel({ number, title }: { number: number; title: string }) {
  return (
    <div className="mt-4 flex items-center gap-2 border-b border-staff-edge/55 pb-1.5 first:mt-3">
      <span className="flex h-5 w-5 items-center justify-center bg-[#c0af86] text-[10px] font-black text-[#272116]">
        {number}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-staff-ink-dim">
        {title}
      </span>
    </div>
  );
}

function ReactionTemplates({
  reactions,
  entityIds,
  targetHexId,
  edge,
}: {
  reactions: PlannedReaction[];
  entityIds: string[];
  targetHexId: string;
  edge: number;
}) {
  const state = useGame((store) => store.state)!;
  const dispatch = useGame((store) => store.dispatch);
  const templates: Array<{ condition: ReactionCondition; label: string }> = [
    { condition: "enemy_approaches_bridge", label: "Подрыв моста" },
    { condition: "encirclement_threat", label: "Отход от окружения" },
  ];
  return (
    <details className="mt-3 border-t border-staff-edge pt-2">
      <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-staff-mute">
        Условные реакции ({reactions.length})
      </summary>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {templates.map((template) => (
          <button
            key={template.condition}
            disabled={entityIds.length === 0}
            onClick={() => {
              const reaction: PlannedReaction = {
                id: `reaction:${state.turn}:${state.activeSide}:${template.condition}:${reactions.length}`,
                side: state.activeSide,
                entityIds: [...entityIds],
                condition: template.condition,
                targetHexId: targetHexId || undefined,
                edge:
                  template.condition === "enemy_approaches_bridge"
                    ? edge
                    : undefined,
                commandCost: 1,
                priority: 2,
                fromImpulse: 0,
                toImpulse: LAST_EXECUTION_IMPULSE,
                maxUses: 1,
                uses: 0,
                status: "draft",
              };
              dispatch({
                type: "UPSERT_REACTION",
                side: state.activeSide,
                reaction,
              });
            }}
            className="border border-staff-edge bg-staff-void/50 px-2 py-1.5 text-left text-[9px] text-staff-ink-dim hover:border-staff-edge2 disabled:opacity-30"
          >
            {template.label}
          </button>
        ))}
      </div>
    </details>
  );
}

function SmallSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  options: Array<{ value: number; label: string }>;
}) {
  return (
    <label className="text-[10px] text-staff-mute">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1 text-[11px] text-staff-ink"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="text-[10px] text-staff-mute">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-staff-edge bg-staff-void px-2 py-1 text-[11px] text-staff-ink placeholder:text-staff-mute/50"
      />
    </label>
  );
}

function ChoiceRow({
  title,
  choices,
  selected,
  onToggle,
}: {
  title: string;
  choices: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="mt-2">
      <div className="text-[9px] uppercase tracking-wider text-staff-mute">
        {title}
      </div>
      <div className="staff-scroll mt-1 flex gap-1 overflow-x-auto pb-1">
        {choices.map((choice) => (
          <button
            key={choice.id}
            onClick={() => onToggle(choice.id)}
            className={`shrink-0 border px-2 py-1 text-[9px] ${
              selected.includes(choice.id)
                ? "border-staff-gold bg-staff-gold/10 text-staff-gold"
                : "border-staff-edge text-staff-ink-dim"
            }`}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
