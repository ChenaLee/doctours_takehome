import type { Reply } from "../types.js";

export type EscalationCategory = "human_request" | "cant_handle";

const TEMPLATES: Record<EscalationCategory, string> = {
  human_request: "I'm getting a person for you.",
  cant_handle: "I can't help with that directly. I'm getting a person for you.",
};

export function handleEscalation(
  category: EscalationCategory | undefined,
  reason: string,
): Reply {
  const response = TEMPLATES[category ?? "human_request"];

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
