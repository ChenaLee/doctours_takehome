import { describe, it, expect, beforeAll } from "vitest";
import { processMessage } from "../src/pipeline.js";
import { runAgentLoop } from "../src/agent/loop.js";
import { createClaudeCaller } from "../src/engine/claude.js";
import {
  HUMAN_MESSAGES,
  RECENT_CONVERSATION_SUMMARY,
  PATIENT_SUMMARY,
  CLINIC_FLAGS,
  COLLECTION_STATUS,
  WORKING_MEMORY,
  PIPELINE_STATUS,
  PATIENT_NAME,
  TIER,
} from "../src/constants.js";
import type { Reply } from "../src/types.js";
import type { LlmCaller } from "../src/engine/claude.js";

const llm: LlmCaller = createClaudeCaller();
const conversationHistory = RECENT_CONVERSATION_SUMMARY;

function getMessage(id: string) {
  const msg = HUMAN_MESSAGES.find((m) => m.id === id);
  if (!msg) throw new Error(`Unknown message: ${id}`);
  return msg;
}

function buildPatientContext(): Record<string, unknown> {
  return {
    patientSummary: PATIENT_SUMMARY,
    clinicFlags: CLINIC_FLAGS,
    collectionStatus: COLLECTION_STATUS,
    workingMemory: WORKING_MEMORY,
    pipelineStatus: PIPELINE_STATUS,
    patientName: PATIENT_NAME,
    tier: TIER,
  };
}

// ─── heva-packages ──────────────────────────────────────────────────────
describe("E2E: heva-packages", { timeout: 180_000 }, () => {
  let reply: Reply;

  beforeAll(async () => {
    const msg = getMessage("heva-packages");
    reply = await processMessage(msg.text, llm, conversationHistory);
  }, 180_000);

  it("does not escalate", () => {
    expect(reply.escalate).toBe(false);
  });

  it("mentions Afro/4C hair capability", () => {
    const lower = reply.response.toLowerCase();
    expect(lower.match(/afro|4c/)).toBeTruthy();
  });

  it("includes Silver package with correct price", () => {
    const r = reply.response;
    expect(r).toContain("Silver");
    expect(r.match(/3[,.]?000/)).toBeTruthy();
  });

  it("includes Gold package with correct price", () => {
    const r = reply.response;
    expect(r).toContain("Gold");
    expect(r.match(/4[,.]?500/)).toBeTruthy();
  });

  it("mentions deposit amounts", () => {
    const r = reply.response;
    expect(r.match(/500|600/)).toBeTruthy();
  });

  it("has a URL on the last line", () => {
    const lines = reply.response.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim();
    expect(lastLine).toMatch(/^https?:\/\//);
  });

  it("templateId is null", () => {
    expect(reply.templateId).toBeNull();
  });

  it("has no markdown formatting", () => {
    expect(reply.response).not.toMatch(/\*\*|^#+\s/m);
  });
});

// ─── hakan-price ────────────────────────────────────────────────────────
describe("E2E: hakan-price", { timeout: 180_000 }, () => {
  let reply: Reply;

  beforeAll(async () => {
    const msg = getMessage("hakan-price");
    reply = await processMessage(msg.text, llm, conversationHistory);
  }, 180_000);

  it("does not escalate", () => {
    expect(reply.escalate).toBe(false);
  });

  it("includes Sapphire package with correct price", () => {
    const r = reply.response;
    expect(r).toContain("Sapphire");
    expect(r.match(/3[,.]?200/)).toBeTruthy();
  });

  it("mentions deposit amount", () => {
    expect(reply.response.match(/500/)).toBeTruthy();
  });

  it("templateId is null", () => {
    expect(reply.templateId).toBeNull();
  });

  it("has no markdown formatting", () => {
    expect(reply.response).not.toMatch(/\*\*|^#+\s/m);
  });
});

// ─── consultation ───────────────────────────────────────────────────────
describe("E2E: consultation", { timeout: 180_000 }, () => {
  let reply: Reply;

  beforeAll(async () => {
    const msg = getMessage("consultation");
    reply = await processMessage(msg.text, llm, conversationHistory);
  }, 180_000);

  it("does not escalate", () => {
    expect(reply.escalate).toBe(false);
  });

  it("confirms the consultation is free", () => {
    expect(reply.response.toLowerCase()).toContain("free");
  });

  it("mentions phone call format", () => {
    const lower = reply.response.toLowerCase();
    expect(lower.match(/phone|call/)).toBeTruthy();
  });

  it("includes consultation URL on the last line", () => {
    const lines = reply.response.trim().split("\n");
    const lastLine = lines[lines.length - 1].trim();
    expect(lastLine).toContain("doctours.com/consultation");
  });

  it("templateId is null", () => {
    expect(reply.templateId).toBeNull();
  });

  it("has no markdown formatting", () => {
    expect(reply.response).not.toMatch(/\*\*|^#+\s/m);
  });
});

// ─── demand-human ───────────────────────────────────────────────────────
describe("E2E: demand-human", { timeout: 180_000 }, () => {
  let reply: Reply;

  beforeAll(async () => {
    const msg = getMessage("demand-human");
    reply = await processMessage(msg.text, llm, conversationHistory);
  }, 180_000);

  it("escalates", () => {
    expect(reply.escalate).toBe(true);
  });

  it("has an escalation reason", () => {
    expect(reply.escalationReason).toBeTruthy();
  });

  it("response is short (one sentence)", () => {
    expect(reply.response.length).toBeLessThan(100);
  });

  it("contains no URLs", () => {
    expect(reply.response).not.toMatch(/https?:\/\//);
  });

  it("contains no sales content", () => {
    const lower = reply.response.toLowerCase();
    expect(lower).not.toContain("package");
    expect(lower).not.toContain("deposit");
    expect(lower).not.toContain("consultation");
  });

  it("templateId is null", () => {
    expect(reply.templateId).toBeNull();
  });

  it("shouldFollowUp is false", () => {
    expect(reply.shouldFollowUp).toBe(false);
  });
});

// ─── charge-card ────────────────────────────────────────────────────────
describe("E2E: charge-card", { timeout: 180_000 }, () => {
  let reply: Reply;

  beforeAll(async () => {
    const msg = getMessage("charge-card");
    reply = await processMessage(msg.text, llm, conversationHistory);
  }, 180_000);

  it("escalates", () => {
    expect(reply.escalate).toBe(true);
  });

  it("does not echo card digits", () => {
    expect(reply.response).not.toContain("4242");
  });

  it("mentions getting a person", () => {
    const lower = reply.response.toLowerCase();
    expect(lower.match(/person|human|someone/)).toBeTruthy();
  });

  it("templateId is null", () => {
    expect(reply.templateId).toBeNull();
  });
});

// ─── structural (all replies) ───────────────────────────────────────────
describe("E2E: structural assertions across all messages", { timeout: 600_000 }, () => {
  let replies: Reply[];

  beforeAll(async () => {
    replies = [];
    for (const msg of HUMAN_MESSAGES) {
      const reply = await processMessage(msg.text, llm, conversationHistory);
      replies.push(reply);
    }
  }, 600_000);

  it("produces exactly 5 replies", () => {
    expect(replies).toHaveLength(5);
  });

  it("every reply has a non-empty response string", () => {
    for (const r of replies) {
      expect(typeof r.response).toBe("string");
      expect(r.response.length).toBeGreaterThan(0);
    }
  });

  it("every reply has templateId null", () => {
    for (const r of replies) {
      expect(r.templateId).toBeNull();
    }
  });

  it("every reply has a non-empty intent", () => {
    for (const r of replies) {
      expect(typeof r.intent).toBe("string");
      expect(r.intent.length).toBeGreaterThan(0);
    }
  });

  it("escalation fields are consistent", () => {
    for (const r of replies) {
      if (r.escalate) {
        expect(r.escalationReason).toBeTruthy();
      } else {
        expect(r.escalationReason).toBeNull();
      }
    }
  });

  it("no markdown in any response", () => {
    for (const r of replies) {
      expect(r.response).not.toMatch(/\*\*/);
      expect(r.response).not.toMatch(/^#+\s/m);
    }
  });

  it("non-escalated replies have no markdown bullet lists", () => {
    for (const r of replies) {
      if (!r.escalate) {
        expect(r.response).not.toMatch(/^\s*[-*]\s/m);
      }
    }
  });
});

// ─── agent loop behavior ────────────────────────────────────────────────
describe("E2E: agent loop behavior", { timeout: 600_000 }, () => {
  const ctx = buildPatientContext();

  it("heva-packages: calls getClinicPackages and resolves within 4 iterations", async () => {
    const msg = getMessage("heva-packages");
    const state = await runAgentLoop(msg.text, ctx, conversationHistory, llm);

    const toolsCalled = state.actionsHistory
      .filter((a) => a.action.type === "call_tool")
      .map((a) => (a.action as { tool: string }).tool);
    expect(toolsCalled).toContain("getClinicPackages");

    expect(state.actionsHistory.length).toBeLessThanOrEqual(4);
  });

  it("hakan-price: calls getClinicPackages and resolves within 3 iterations", async () => {
    const msg = getMessage("hakan-price");
    const state = await runAgentLoop(msg.text, ctx, conversationHistory, llm);

    const toolsCalled = state.actionsHistory
      .filter((a) => a.action.type === "call_tool")
      .map((a) => (a.action as { tool: string }).tool);
    expect(toolsCalled).toContain("getClinicPackages");

    expect(state.actionsHistory.length).toBeLessThanOrEqual(3);
  });

  it("consultation: resolves within 2 iterations (domain knowledge, no tool needed)", async () => {
    const msg = getMessage("consultation");
    const state = await runAgentLoop(msg.text, ctx, conversationHistory, llm);

    expect(state.actionsHistory.length).toBeLessThanOrEqual(2);

    const last = state.actionsHistory.at(-1)!;
    expect(last.action.type).toBe("respond");
  });

  it("demand-human: escalates on first iteration", async () => {
    const msg = getMessage("demand-human");
    const state = await runAgentLoop(msg.text, ctx, conversationHistory, llm);

    expect(state.actionsHistory.length).toBe(1);
    expect(state.actionsHistory[0].action.type).toBe("escalate");
  });

  it("charge-card: escalates on first iteration", async () => {
    const msg = getMessage("charge-card");
    const state = await runAgentLoop(msg.text, ctx, conversationHistory, llm);

    expect(state.actionsHistory.length).toBe(1);
    expect(state.actionsHistory[0].action.type).toBe("escalate");
  });
});
