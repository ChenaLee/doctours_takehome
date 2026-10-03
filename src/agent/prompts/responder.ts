import type { AgentState } from "../../types.js";
import { coreSkill } from "../../skills/core.js";
import { getSkillPrompt } from "../../skills/registry.js";
import {
  PATIENT_SUMMARY,
  CLINIC_FLAGS,
  COLLECTION_STATUS,
  WORKING_MEMORY,
  COORDINATOR_DISPLAY_NAME,
} from "../../constants.js";

export function buildResponderPrompt(
  state: AgentState,
  skills: string[],
): string {
  const sections: string[] = [];

  sections.push(coreSkill);

  for (const skill of skills) {
    const prompt = getSkillPrompt(skill);
    if (prompt) sections.push(prompt);
  }

  if (Object.keys(state.toolResults).length > 0) {
    const resultLines = Object.entries(state.toolResults).map(
      ([tool, result]) => `## ${tool}\n${JSON.stringify(result, null, 2)}`,
    );
    sections.push(`# TOOL RESULTS\n${resultLines.join("\n\n")}`);
  }

  sections.push(`# PATIENT CONTEXT
${PATIENT_SUMMARY}

# Clinic flags
${CLINIC_FLAGS}

# Collection Status
${COLLECTION_STATUS}

# Working Memory
${WORKING_MEMORY}

# Coordinator
You are responding as ${COORDINATOR_DISPLAY_NAME}.`);

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
    {"tool": "updateWorkingMemory", "args": {"memory": {...}}}
  ]
}

Rules:
- response is plain text. No markdown. URLs on the last line.
- templateId is always null.
- escalate is false for normal replies. If true, escalationReason must be non-null.
- If escalate is false, escalationReason must be null.
- attachmentUrls: only URLs from tool results, at most 3. null if none.
- actions: deferred write tool calls (updateWorkingMemory, updateUserClinicPreferences).`);

  return sections.join("\n\n");
}
