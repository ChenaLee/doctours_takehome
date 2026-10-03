import type { Reply } from "../types.js";

export type EscalationCategory = "human_request" | "cant_handle";

const TEMPLATES: Record<EscalationCategory, string> = {
  human_request: "I'm getting a person for you.",
  cant_handle: "I can't help with that directly. I'm getting a person for you.",
};

/**
 * Validates the planner's cantDo phrase. Anything that could echo patient data
 * (digits, URLs, emails) or isn't a short plain phrase falls back to the template.
 */
export function sanitizeCantDo(phrase: string | null | undefined): string | null {
  if (!phrase) return null;
  const cleaned = phrase
    .trim()
    .replace(/^i\s+(can't|cannot|can not)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (!cleaned || cleaned.length > 50) return null;
  if (/[\d@]|https?:|www\./i.test(cleaned)) return null;
  if (!/^[a-z][a-z' -]*$/i.test(cleaned)) return null;
  return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
}

export function handleEscalation(
  category: EscalationCategory | undefined,
  reason: string,
  cantDo?: string | null,
): Reply {
  const resolved = category ?? "human_request";
  const action = resolved === "cant_handle" ? sanitizeCantDo(cantDo) : null;
  const response = action
    ? `I can't ${action}. I'm getting a person for you.`
    : TEMPLATES[resolved];

  return {
    response,
    escalate: true,
    escalationReason: reason,
    templateId: null,
    intent: "escalation",
    shouldFollowUp: false,
    followUpTiming: null,
    attachmentUrls: null,
    highEngagement: false,
    workingMemoryUpdates: null,
  };
}
