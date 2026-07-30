import type { GameCommand, GameState } from "@/engine/types";

export interface PrimaryPhaseAction {
  label: string;
  command?: GameCommand;
  disabled: boolean;
  reason?: string;
}

/** One authoritative UI mapping for phase progression; engine validation remains final. */
export function getPrimaryPhaseAction(state: GameState): PrimaryPhaseAction {
  if (state.status === "completed") return { label: "Кампания завершена", disabled: true };
  if (state.phase === "planning") return { label: "Запечатать приказы", command: { type: "COMMIT_PLAN", side: state.activeSide }, disabled: state.plans[state.activeSide].committed, reason: state.plans[state.activeSide].committed ? "План уже зафиксирован." : undefined };
  if (state.phase === "execution") return { label: "Следующий импульс", command: { type: "EXECUTE_IMPULSE" }, disabled: false };
  if (state.phase === "activation") return { label: "Завершить активацию", command: { type: "END_ACTIVATION" }, disabled: false };
  const labels: Partial<Record<GameState["phase"], string>> = {
    morning_report: "Открыть сутки", events: "К штабной фазе", command: "К воздушной фазе", air: "К активациям", combat: "Разрешить бои", exploitation: "К снабжению", plans_locked: "Начать исполнение", reaction: "К снабжению", supply: "Подвести итоги", after_action: "Следующие сутки", end_of_day: "Следующие сутки",
  };
  return { label: labels[state.phase] ?? "Продолжить", command: { type: "END_PHASE" }, disabled: false };
}
