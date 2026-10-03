import type { AgentState } from "../types.js";
import type { LlmCaller } from "../engine/claude.js";
import {
  createAgentState,
  addToolResult,
  markGoalResolved,
  addGoal,
  setGoals,
  addAction,
  addWriteAction,
} from "./state.js";
import { shouldTerminate, createFallbackAction } from "./safety.js";
import { buildStepPrompt, parseStepResponse } from "./prompts/step.js";
import type { StepDecision } from "./prompts/step.js";
import { callTool } from "../tools/registry.js";
import { getSkillPrompt } from "../skills/registry.js";

export async function runAgentLoop(
  message: string,
  patientContext: Record<string, unknown>,
  conversationHistory: string,
  llm: LlmCaller,
): Promise<AgentState> {
  const state = createAgentState(message, patientContext, conversationHistory);

  for (let iteration = 1; ; iteration++) {
    if (shouldTerminate(state, iteration)) break;

    const systemPrompt = buildStepPrompt(state, iteration);
    const llmResponse = await llm(systemPrompt, message);
    const decision = parseStepResponse(llmResponse);

    applyGoalsUpdate(state, decision, iteration);
    applyWriteActions(state, decision);

    const result = executeAction(state, decision);
    addAction(state, iteration, decision.reasoning, decision.action, result);
  }

  ensureExitAction(state);
  return state;
}

function applyGoalsUpdate(
  state: AgentState,
  decision: StepDecision,
  iteration: number,
): void {
  if (decision.goalsUpdate.length === 0) return;

  if (iteration === 1) {
    setGoals(state, decision.goalsUpdate);
  } else {
    for (const goalUpdate of decision.goalsUpdate) {
      const existing = state.endGoals.find((g) => g.id === goalUpdate.id);
      if (existing) {
        if (goalUpdate.resolved) markGoalResolved(state, goalUpdate.id);
        if (goalUpdate.requiredSkill) {
          existing.requiredSkill = goalUpdate.requiredSkill;
        }
      } else {
        addGoal(state, goalUpdate);
      }
    }
  }
}

function applyWriteActions(
  state: AgentState,
  decision: StepDecision,
): void {
  for (const wa of decision.writeActions) {
    addWriteAction(state, wa.tool, wa.args);
  }
}

function executeAction(
  state: AgentState,
  decision: StepDecision,
): unknown {
  const action = decision.action;

  switch (action.type) {
    case "call_tool": {
      const result = callTool(action.tool, action.args);
      addToolResult(state, action.tool, result);
      return result;
    }
    case "load_skill": {
      const prompt = getSkillPrompt(action.skill);
      if (prompt && !state.loadedSkills.includes(action.skill)) {
        state.loadedSkills.push(action.skill);
      }
      return { loaded: !!prompt };
    }
    case "escalate":
    case "clarify":
    case "respond":
      return null;
  }
}

function ensureExitAction(state: AgentState): void {
  const last = state.actionsHistory.at(-1);
  if (last && ["respond", "escalate", "clarify"].includes(last.action.type)) {
    return;
  }
  const fallback = createFallbackAction(state);
  const iteration = (last?.iteration ?? 0) + 1;
  addAction(state, iteration, "Max iterations reached — responding with gathered data", fallback, null);
}
