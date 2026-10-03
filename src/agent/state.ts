import type { AgentState, AgentAction } from "../types.js";

export function createAgentState(
  message: string,
  patientContext: Record<string, unknown>,
  conversationHistory: string,
): AgentState {
  return {
    message,
    patientContext,
    conversationHistory,
    endGoals: [],
    toolResults: {},
    loadedSkills: [],
    actionsHistory: [],
    writeActions: [],
  };
}

export function addToolResult(
  state: AgentState,
  toolName: string,
  result: unknown,
): void {
  state.toolResults[toolName] = result;
}

export function addGoal(
  state: AgentState,
  goal: AgentState["endGoals"][number],
): void {
  state.endGoals.push(goal);
}

export function setGoals(
  state: AgentState,
  goals: AgentState["endGoals"],
): void {
  state.endGoals = goals;
}

export function markGoalResolved(state: AgentState, goalId: string): void {
  const goal = state.endGoals.find((g) => g.id === goalId);
  if (goal) goal.resolved = true;
}

export function getUnresolvedGoals(
  state: AgentState,
): AgentState["endGoals"] {
  return state.endGoals.filter((g) => !g.resolved);
}

export function allGoalsResolved(state: AgentState): boolean {
  return state.endGoals.every((g) => g.resolved);
}

export function addAction(
  state: AgentState,
  iteration: number,
  reasoning: string,
  action: AgentAction,
  result: unknown,
): void {
  state.actionsHistory.push({ iteration, reasoning, action, result });
}

export function addWriteAction(
  state: AgentState,
  tool: string,
  args: Record<string, unknown>,
): void {
  state.writeActions.push({ tool, args });
}
