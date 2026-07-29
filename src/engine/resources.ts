import type {
  CommandValidationError,
  GameEvent,
  GameState,
  HeadquartersState,
  Side,
} from "@/engine/types";

export const RESOURCE_ERROR = {
  INSUFFICIENT_COMMAND_POINTS: "INSUFFICIENT_COMMAND_POINTS",
  INVALID_COMMAND_COST: "INVALID_COMMAND_COST",
  COMMAND_POINTS_ALREADY_SPENT: "COMMAND_POINTS_ALREADY_SPENT",
} as const;

export interface CommandPointCheck {
  ok: boolean;
  hq?: HeadquartersState;
  error?: CommandValidationError;
}

function resourceError(code: keyof typeof RESOURCE_ERROR, message: string): CommandPointCheck {
  return { ok: false, error: { code, message } };
}

export function canSpendCommandPoints(
  state: GameState,
  side: Side,
  amount: number,
  hqId?: string,
): CommandPointCheck {
  if (!Number.isInteger(amount) || amount < 0) {
    return resourceError("INVALID_COMMAND_COST", "Стоимость командования должна быть целым неотрицательным числом.");
  }
  if (amount === 0) return { ok: true };
  const candidates = Object.values(state.headquarters)
    .filter((hq) => hq.side === side && !hq.eliminated && !hq.captured)
    .filter((hq) => !hqId || hq.id === hqId)
    .sort((a, b) => b.commandPoints - a.commandPoints || a.id.localeCompare(b.id));
  const hq = candidates.find((candidate) => candidate.commandPoints >= amount);
  if (!hq) {
    return resourceError(
      "INSUFFICIENT_COMMAND_POINTS",
      `Недостаточно командных очков: требуется ${amount}.`,
    );
  }
  return { ok: true, hq };
}

export function spendCommandPoints(
  state: GameState,
  events: GameEvent[],
  side: Side,
  amount: number,
  hqId?: string,
): CommandPointCheck {
  const check = canSpendCommandPoints(state, side, amount, hqId);
  if (!check.ok || amount === 0) return check;
  const hq = check.hq;
  if (!hq) {
    return resourceError("COMMAND_POINTS_ALREADY_SPENT", "Источник командных очков уже недоступен.");
  }
  hq.commandPoints -= amount;
  events.push({ type: "COMMAND_POINTS_SPENT", side, hqId: hq.id, amount });
  return check;
}

export function canSpendFromAllocations(
  state: GameState,
  allocations: Array<{ side: Side; amount: number; hqId?: string }>,
): CommandPointCheck {
  const reserved = new Map<string, number>();
  for (const allocation of allocations) {
    const check = canSpendCommandPoints(state, allocation.side, allocation.amount, allocation.hqId);
    if (!check.ok) return check;
    if (allocation.amount === 0) continue;
    const hq = check.hq;
    if (!hq) return resourceError("INSUFFICIENT_COMMAND_POINTS", "Не найден штаб для списания.");
    const total = (reserved.get(hq.id) ?? 0) + allocation.amount;
    if (total > hq.commandPoints) {
      return resourceError("INSUFFICIENT_COMMAND_POINTS", "Недостаточно командных очков для всей команды.");
    }
    reserved.set(hq.id, total);
  }
  return { ok: true };
}
