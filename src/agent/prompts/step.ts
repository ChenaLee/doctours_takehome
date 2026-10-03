import type { AgentState, AgentAction } from "../../types.js";
import { getToolsByKind } from "../../tools/registry.js";
import { getSkillDescriptions, getSkillPrompt } from "../../skills/registry.js";

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

  const activeSkills = [
    ...new Set([
      ...state.endGoals.map((g) => g.requiredSkill).filter((s): s is string => s !== null),
      ...state.loadedSkills,
    ]),
  ];
  const skillRules = activeSkills
    .map((name) => ({ name, prompt: getSkillPrompt(name) }))
    .filter((s): s is { name: string; prompt: string } => s.prompt !== null);
  if (skillRules.length > 0) {
    sections.push(
      `# SKILL RULES (from skills your goals require — follow these when choosing tools and arguments)\n${skillRules
        .map((s) => `## skill: ${s.name}\n${s.prompt}`)
        .join("\n\n")}`,
    );
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

  const immediateTools = getToolsByKind("immediate");
  const deferredTools = getToolsByKind("deferred");
  const skills = getSkillDescriptions();
  const formatEntries = (entries: Array<{ name: string; description: string }>) =>
    entries.map((e) => `- ${e.name}: ${e.description}`).join("\n");

  sections.push(`# AVAILABLE TOOLS (call with call_tool; result is available next iteration)\n${formatEntries(immediateTools)}`);
  sections.push(`# DEFERRED TOOLS (queue in writeActions; run after the reply is sent)\n${formatEntries(deferredTools)}`);
  const skillLines = skills.map(
    (s) => `- ${s.name}: ${s.description}${s.tools.length > 0 ? ` (relies on: ${s.tools.join(", ")})` : ""}`,
  );
  sections.push(`# AVAILABLE SKILLS (domain knowledge loaded for response composition)\n${skillLines.join("\n")}`);

  sections.push(`# CRITICAL — CAPABILITY BOUNDARY (check BEFORE choosing any other action)
The tools and skills listed above are your COMPLETE set of capabilities. Nothing else exists.
Each tool does exactly what its description says — no more. Each skill is knowledge only; a skill never performs an action.

- If the patient asks you to DO something, find a tool whose description performs that exact action. If none does → escalate with "cant_handle". Do NOT attempt a partial answer.
- Do NOT substitute a related tool for the requested action. A tool that returns a link or information for the patient to act on is not the same as performing the action for them.
- If the patient shares sensitive data (card numbers, SSN, credentials) → escalate with "cant_handle". NEVER echo sensitive data.
- If the patient demands a human, person, or agent → escalate with "human_request".
- If answering requires knowledge outside ALL of the listed skills' domains → escalate with "cant_handle".

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
- {"type": "call_tool", "tool": "toolName", "args": {...}} — call an available tool to gather data
- {"type": "load_skill", "skill": "skillName"} — load domain knowledge for response composition
- {"type": "escalate", "reason": "short reason", "category": "human_request" or "cant_handle", "cantDo": "short verb phrase or null"} — hand to human. For cant_handle, cantDo names the requested action generically (e.g. "cancel a booking", "send an email"): no numbers, amounts, names, or other personal data. null for human_request.
- {"type": "clarify", "question": "what to ask", "missingInfo": "what's missing"} — ask the patient
- {"type": "respond", "skills": ["skill1", "skill2"]} — all goals resolved, compose response

# RULES
- On iteration 1, populate goalsUpdate with your initial end goal decomposition from the message.
- If a goal can be resolved from data already gathered or from patient context, mark it resolved — no tool call needed.
- If a goal needs tool data, call_tool with the specific tool and arguments.
- The responder can only use data gathered here. When a goal needs a skill, call the AVAILABLE TOOLS that skill relies on whose data the goal needs (links, IDs, statuses) before responding.
- The responder can never write a URL itself. If the patient asks about a page or resource, or the answer will point them to one, and an AVAILABLE TOOL returns that page's link, call that tool before responding so the exact URL can be included. When the patient names a specific page, fetch the link of the page they named, not a different page that serves a similar purpose, and do not send a second link alongside it.
- Call only ONE tool per iteration. Assess the result before choosing the next.
- If ALL goals are resolved, respond with the list of skills the response needs. Choose skills by what the reply must actually do, not by topics the message mentions: a skill whose rules would only add content the patient did not ask for should not be loaded.
- A tool result may reveal that further tool calls are needed. Add new goals if so.
- call_tool may only use AVAILABLE TOOLS. writeActions may only use DEFERRED TOOLS; they execute AFTER the response.
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
        cantDo: typeof raw.cantDo === "string" ? raw.cantDo : null,
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
