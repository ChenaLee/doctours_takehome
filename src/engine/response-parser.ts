import type { Reply } from "../types.js";

export interface ComposedResponse {
  reply: Reply;
  actions: Array<{ tool: string; args: Record<string, unknown> }>;
}

export function parseReplyResponse(raw: string): ComposedResponse {
  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);

  if (!parsed.reply || typeof parsed.reply !== "object") {
    throw new Error("Missing 'reply' object in response");
  }

  const r = parsed.reply;

  if (typeof r.response !== "string" || r.response.length === 0) {
    throw new Error("reply.response must be a non-empty string");
  }
  if (typeof r.escalate !== "boolean") {
    throw new Error("reply.escalate must be a boolean");
  }
  if (typeof r.intent !== "string" || r.intent.length === 0) {
    throw new Error("reply.intent must be a non-empty string");
  }

  if (r.escalate && (r.escalationReason == null || r.escalationReason === "")) {
    throw new Error("escalationReason must be non-null when escalate is true");
  }
  if (!r.escalate && r.escalationReason != null) {
    throw new Error("escalationReason must be null when escalate is false");
  }

  const reply: Reply = {
    response: r.response,
    escalate: r.escalate,
    escalationReason: r.escalationReason ?? null,
    templateId: null,
    intent: r.intent,
    shouldFollowUp: Boolean(r.shouldFollowUp),
    followUpTiming: r.followUpTiming ?? null,
    attachmentUrls: normalizeAttachments(r.attachmentUrls),
    highEngagement: Boolean(r.highEngagement),
    workingMemoryUpdates: r.workingMemoryUpdates ?? null,
  };

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map((a: Record<string, unknown>) => ({
        tool: String(a.tool ?? ""),
        args: (a.args as Record<string, unknown>) ?? {},
      }))
    : [];

  return { reply, actions };
}

function normalizeAttachments(val: unknown): string[] | null {
  if (!Array.isArray(val) || val.length === 0) return null;
  const urls = val.filter((v): v is string => typeof v === "string");
  return urls.length > 0 ? urls.slice(0, 3) : null;
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
