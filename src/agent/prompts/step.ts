import type { AgentState, AgentAction } from "../../types.js";
import { toolRegistry } from "../../tools/registry.js";
import { getSkillDescriptions } from "../../skills/registry.js";

export interface StepDecision {
  reasoning: string;
  goalsUpdate: Array<{
    id: string;
    description: string;
    resolved: boolean;
    requiredSkill: string | null;
  }>;
  action: AgentAction;
  writeActions: Array<{ tool: string; args: Record<string, unknown> }>;
}

export function buildStepPrompt(state: AgentState, iteration: number): string {
  const sections: string[] = [];

  sections.push(`You are a planning agent for a patient concierge system.
Your job is to decompose the patient's message into end goals and resolve each one by calling tools, loading skills, or deciding to respond.`);

  sections.push(`# CONTEXT
Patient context:
${JSON.stringify(state.patientContext, null, 2)}

Patient message:
"${state.message}"

Conversation history:
${state.conversationHistory || "(none)"}`);

  if (state.endGoals.length > 0) {
    const goalLines = state.endGoals.map(
      (g) =>
        `- [${g.resolved ? "RESOLVED" : "UNRESOLVED"}] ${g.id}: ${g.description}${g.requiredSkill ? ` (skill: ${g.requiredSkill})` : ""}`,
    );
    sections.push(`# END GOALS\n${goalLines.join("\n")}`);
  } else {
    sections.push(`# END GOALS\nNone yet — this is iteration 1. Decompose the patient message into end goals.`);
  }

  if (Object.keys(state.toolResults).length > 0) {
    const resultLines = Object.entries(state.toolResults).map(
      ([tool, result]) => `## ${tool}\n${JSON.stringify(result, null, 2)}`,
    );
    sections.push(`# DATA GATHERED SO FAR\n${resultLines.join("\n\n")}`);
  }

  if (state.actionsHistory.length > 0) {
    const historyLines = state.actionsHistory.map(
      (h) =>
        `- Iteration ${h.iteration}: [${h.action.type}] ${h.reasoning}`,
    );
    sections.push(`# ACTIONS TAKEN\n${historyLines.join("\n")}`);
  }

  const toolLines = Object.entries(toolRegistry).map(
    ([name, def]) => `- ${name}: ${def.description}`,
  );
  sections.push(`# AVAILABLE TOOLS\n${toolLines.join("\n")}`);

  const skillLines = getSkillDescriptions().map(
    (s) => `- ${s.name}: ${s.description}`,
  );
  sections.push(`# AVAILABLE SKILLS (domain knowledge loaded for response composition)\n${skillLines.join("\n")}`);

  sections.push(`# CRITICAL — CAPABILITY BOUNDARY (check BEFORE choosing any other action)
Your tools can ONLY: look up data, provide links, and update internal memory/preferences.
Your tools CANNOT: charge cards, process payments, move money, make phone calls, book procedures, send emails, or take ANY real-world action on the patient's behalf.

- If the patient asks you to DO something that none of your tools can accomplish → escalate with "cant_handle". Do NOT attempt a partial answer.
- If the patient shares sensitive data (card numbers, SSN, credentials) → escalate with "cant_handle". NEVER echo sensitive data.
- If the patient demands a human, person, or agent → escalate with "human_request".
- If the request falls outside ALL of your available skills' domain knowledge → escalate with "cant_handle".

When in doubt, escalate. A wrong escalation is recoverable; a wrong answer is not.

# TASK
Decide the next action. Return ONLY valid JSON (no markdown fences):
{
  "reasoning": "why this action is needed",
  "goalsUpdate": [
    {"id": "g1", "description": "what this goal is", "resolved": false, "requiredSkill": "skill-name or null"}
  ],
  "action": <one of the action types below>,
  "writeActions": [{"tool": "toolName", "args": {...}}]
}

Action types:
- {"type": "call_tool", "tool": "toolName", "args": {...}} — call a read tool to gather data
- {"type": "load_skill", "skill": "skillName"} — load domain knowledge for response composition
- {"type": "escalate", "reason": "short reason", "category": "human_request" or "cant_handle"} — hand to human
- {"type": "clarify", "question": "what to ask", "missingInfo": "what's missing"} — ask the patient
- {"type": "respond", "skills": ["skill1", "skill2"]} — all goals resolved, compose response

# RULES
- On iteration 1, populate goalsUpdate with your initial end goal decomposition from the message.
- If a goal can be resolved from data already gathered or from patient context, mark it resolved — no tool call needed.
- If a goal needs tool data, call_tool with the specific tool and arguments.
- Call only ONE tool per iteration. Assess the result before choosing the next.
- If the patient asks for something outside system capability (charging a card, moving money), escalate with category "cant_handle".
- If the patient demands a human, escalate with category "human_request".
- If ALL goals are resolved, respond with the list of skills the response needs.
- A tool result may reveal that further tool calls are needed. Add new goals if so.
- writeActions are deferred — they execute AFTER the response (e.g., updateWorkingMemory, updateUserClinicPreferences).
- Current iteration: ${iteration}`);

  return sections.join("\n\n");
}

export function parseStepResponse(raw: string): StepDecision {
  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.reasoning || typeof parsed.reasoning !== "string") {
    throw new Error("Missing or invalid 'reasoning' field");
  }
  if (!parsed.action || typeof parsed.action.type !== "string") {
    throw new Error("Missing or invalid 'action' field");
  }

  return {
    reasoning: parsed.reasoning,
    goalsUpdate: Array.isArray(parsed.goalsUpdate)
      ? parsed.goalsUpdate.map((g: Record<string, unknown>) => ({
          id: String(g.id ?? ""),
          description: String(g.description ?? ""),
          resolved: Boolean(g.resolved),
          requiredSkill: g.requiredSkill != null ? String(g.requiredSkill) : null,
        }))
      : [],
    action: normalizeAction(parsed.action),
    writeActions: Array.isArray(parsed.writeActions)
      ? parsed.writeActions.map((w: Record<string, unknown>) => ({
          tool: String(w.tool ?? ""),
          args: (w.args as Record<string, unknown>) ?? {},
        }))
      : [],
  };
}

function normalizeAction(raw: Record<string, unknown>): AgentAction {
  const type = String(raw.type);
  switch (type) {
    case "call_tool":
      return {
        type: "call_tool",
        tool: String(raw.tool ?? ""),
        args: (raw.args as Record<string, unknown>) ?? {},
      };
    case "load_skill":
      return { type: "load_skill", skill: String(raw.skill ?? "") };
    case "escalate":
      return {
        type: "escalate",
        reason: String(raw.reason ?? ""),
        category: raw.category === "cant_handle" ? "cant_handle" : "human_request",
      };
    case "clarify":
      return {
        type: "clarify",
        question: String(raw.question ?? ""),
        missingInfo: String(raw.missingInfo ?? ""),
      };
    case "respond":
      return {
        type: "respond",
        skills: Array.isArray(raw.skills) ? raw.skills.map(String) : [],
      };
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

function extractJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();

  const braceStart = raw.indexOf("{");
  const braceEnd = raw.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return raw.slice(braceStart, braceEnd + 1);
  }

  return raw.trim();
}
