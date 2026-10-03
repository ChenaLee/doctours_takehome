import type { AgentState } from "../../types.js";
import { coreSkill } from "../../skills/core.js";
import { getSkillPrompt } from "../../skills/registry.js";
import { getToolsByKind } from "../../tools/registry.js";
import {
  PATIENT_SUMMARY,
  CLINIC_FLAGS,
  COLLECTION_STATUS,
  WORKING_MEMORY,
  COORDINATOR_DISPLAY_NAME,
  CHAT_KIND,
  CHAT_LIST,
  RECENT_CALLS,
  SAVED_CLINIC_COUNT,
  PATIENT_IMAGE_COUNT,
  SENDER_DISPLAY_NAME,
  SENDER_PARTICIPANT_ROLE,
} from "../../constants.js";

const BASE_PROMPT_VALUES: Record<string, string | number> = {
  PATIENT_SUMMARY,
  CLINIC_FLAGS,
  COLLECTION_STATUS,
  WORKING_MEMORY,
  COORDINATOR_DISPLAY_NAME,
  CHAT_KIND,
  CHAT_LIST,
  RECENT_CALLS,
  SAVED_CLINIC_COUNT,
  PATIENT_IMAGE_COUNT,
  SENDER_DISPLAY_NAME,
  SENDER_PARTICIPANT_ROLE,
};

/** Fills {{KEY}} placeholders; unknown ones (e.g. {{clinic.slug}}) are prompt instructions and stay as-is. */
export function renderBasePrompt(): string {
  return coreSkill.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in BASE_PROMPT_VALUES ? String(BASE_PROMPT_VALUES[key]) : match,
  );
}

export function buildResponderPrompt(
  state: AgentState,
  skills: string[],
): string {
  const sections: string[] = [];

  sections.push(renderBasePrompt());

  for (const skill of new Set(skills)) {
    if (skill === "core") continue; // already included as the base prompt
    const prompt = getSkillPrompt(skill);
    if (prompt) sections.push(prompt);
  }

  if (Object.keys(state.toolResults).length > 0) {
    const resultLines = Object.entries(state.toolResults).map(
      ([tool, result]) => `## ${tool}\n${JSON.stringify(result, null, 2)}`,
    );
    sections.push(`# TOOL RESULTS\n${resultLines.join("\n\n")}`);
  }

  sections.push(`# OUTPUT FORMAT
Return ONLY valid JSON (no markdown fences):
{
  "reply": {
    "response": "plain text reply to the patient — no markdown, no ** or # or *. If including a URL, it must be the last line.",
    "escalate": false,
    "escalationReason": null,
    "templateId": null,
    "intent": "short phrase describing what this response achieves",
    "shouldFollowUp": false,
    "followUpTiming": null,
    "attachmentUrls": null,
    "highEngagement": true or false,
    "workingMemoryUpdates": { ... } or null
  },
  "actions": [
    {"tool": "toolName", "args": {...}}
  ]
}

Rules:
- response is plain text. No markdown. URLs on the last line.
- templateId is always null.
- escalate is false for normal replies. If true, escalationReason must be non-null.
- If escalate is false, escalationReason must be null.
- attachmentUrls: only URLs from tool results, at most 3. null if none.
- When you state a package price, also state that package's deposit amount, both with the currency code from the same tool result (e.g. "3,000 USD"). Do not add other package details the patient did not ask about.
- actions: deferred tool calls, only from: ${getToolsByKind("deferred").map((t) => t.name).join(", ")}.`);

  return sections.join("\n\n");
}
