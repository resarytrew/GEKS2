import type { GameEvent, GameState, HistoricalDeadline, Side, SideScore } from "@/engine/types";

export function scoreHistoricalDeadline(
  deadline: HistoricalDeadline,
  achievedTurn: number,
  basePoints: number,
): number {
  const delta = deadline.targetTurn - achievedTurn;
  const adjusted =
    delta >= 0
      ? basePoints + delta * deadline.scoringCurve.earlyPerTurn
      : basePoints + delta * deadline.scoringCurve.latePerTurn;
  return Math.max(deadline.scoringCurve.minimum, Math.min(deadline.scoringCurve.maximum, adjusted));
}

export function awardScoreEvent(
  state: GameState,
  events: GameEvent[],
  scoreEventId: string,
  side: Side,
  category: keyof SideScore,
  points: number,
): boolean {
  if (state.scoreEventIds.includes(scoreEventId)) return false;
  state.scoreEventIds.push(scoreEventId);
  state.scores[side][category] += points;
  events.push({ type: "SCORE_AWARDED", scoreEventId, side, category, points });
  return true;
}
