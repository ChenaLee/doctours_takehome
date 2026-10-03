import type { AgentState, AgentAction } from "../types.js";

export const MAX_ITERATIONS = 8;

export function shouldTerminate(state: AgentState, iteration: number): boolean {
  if (iteration >= MAX_ITERATIONS) return true;

  const last = state.actionsHistory.at(-1);
  if (!last) return false;

  const exitTypes: AgentAction["type"][] = ["escalate", "respond", "clarify"];
  return exitTypes.includes(last.action.type);
}

export function createFallbackAction(state: AgentState): AgentAction {
  const skills = [
    ...new Set(
      state.endGoals
        .map((g) => g.requiredSkill)
        .filter((s): s is string => s !== null),
    ),
  ];
  return { type: "respond", skills };
}
