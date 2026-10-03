import { describe, it, expect } from "vitest";
import { processMessage, processMessageSafely, executeWriteActions } from "../src/pipeline.js";
import type { LlmCaller } from "../src/engine/claude.js";

function mockLlm(responses: string[]): LlmCaller {
  let call = 0;
  return async () => {
    if (call >= responses.length) {
      throw new Error(
        `Mock LLM called ${call + 1} times but only ${responses.length} responses provided`,
      );
    }
    return responses[call++];
  };
}

const ESCALATE_RESPONSE = JSON.stringify({
  reasoning: "Patient demands human",
  goalsUpdate: [
    { id: "g1", description: "Transfer", resolved: true, requiredSkill: null },
  ],
  action: {
    type: "escalate",
    reason: "Asked to talk to a human",
    category: "human_request",
  },
  writeActions: [],
});

const CANT_HANDLE_RESPONSE = JSON.stringify({
  reasoning: "Cannot charge cards",
  goalsUpdate: [
    { id: "g1", description: "Charge card", resolved: true, requiredSkill: null },
  ],
  action: {
    type: "escalate",
    reason: "Asked to charge a card number",
    category: "cant_handle",
  },
  writeActions: [],
});

const CLARIFY_RESPONSE = JSON.stringify({
  reasoning: "Need clinic name",
  goalsUpdate: [
    { id: "g1", description: "Answer pricing", resolved: false, requiredSkill: "pricing" },
  ],
  action: {
    type: "clarify",
    question: "Which clinic are you asking about?",
    missingInfo: "clinic",
  },
  writeActions: [],
});

function makeToolCallResponse(tool: string, args: Record<string, unknown>) {
  return JSON.stringify({
    reasoning: `Calling ${tool}`,
    goalsUpdate: [
      { id: "g1", description: "Get data", resolved: false, requiredSkill: "pricing" },
    ],
    action: { type: "call_tool", tool, args },
    writeActions: [],
  });
}

function makeRespondResponse(skills: string[]) {
  return JSON.stringify({
    reasoning: "All goals resolved",
    goalsUpdate: [
      { id: "g1", description: "Get data", resolved: true, requiredSkill: "pricing" },
    ],
    action: { type: "respond", skills },
    writeActions: [
      { tool: "updateWorkingMemory", args: { memory: { keyConcerns: "pricing" } } },
    ],
  });
}

function makeComposerResponse(response: string, intent: string) {
  return JSON.stringify({
    reply: {
      response,
      escalate: false,
      escalationReason: null,
      templateId: null,
      intent,
      shouldFollowUp: false,
      followUpTiming: null,
      attachmentUrls: null,
      highEngagement: true,
      workingMemoryUpdates: null,
    },
    actions: [],
  });
}

describe("processMessage — escalation path", () => {
  it("human_request returns escalated reply", async () => {
    const llm = mockLlm([ESCALATE_RESPONSE]);
    const reply = await processMessage("I demand to talk to a human", llm);

    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBe("Asked to talk to a human");
    expect(reply.response).toContain("person");
    expect(reply.templateId).toBeNull();
    expect(reply.shouldFollowUp).toBe(false);
  });

  it("cant_handle returns escalated reply", async () => {
    const llm = mockLlm([CANT_HANDLE_RESPONSE]);
    const reply = await processMessage(
      "Charge the deposit on my card ending in 4242",
      llm,
    );

    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBe("Asked to charge a card number");
    expect(reply.response).toContain("can't");
    expect(reply.response).not.toContain("4242");
  });
});

describe("processMessage — clarify path", () => {
  it("returns the clarifying question as response", async () => {
    const llm = mockLlm([CLARIFY_RESPONSE]);
    const reply = await processMessage("How much is it?", llm);

    expect(reply.escalate).toBe(false);
    expect(reply.response).toBe("Which clinic are you asking about?");
    expect(reply.intent).toBe("clarify missing information");
  });
});

describe("processMessage — respond path", () => {
  it("calls tool, then composes response via LLM", async () => {
    const llm = mockLlm([
      makeToolCallResponse("getClinicPackages", { clinicName: "Heva" }),
      makeRespondResponse(["pricing"]),
      makeComposerResponse(
        "Heva has Silver at $3,000 and Gold at $4,500.",
        "answer pricing question",
      ),
    ]);

    const reply = await processMessage(
      "What packages does Heva have?",
      llm,
    );

    expect(reply.escalate).toBe(false);
    expect(reply.response).toContain("Silver");
    expect(reply.response).toContain("3,000");
    expect(reply.response).toContain("Gold");
    expect(reply.intent).toBe("answer pricing question");
    expect(reply.templateId).toBeNull();
  });

  it("respond without tool calls passes to composer", async () => {
    const llm = mockLlm([
      JSON.stringify({
        reasoning: "Can answer from context",
        goalsUpdate: [
          { id: "g1", description: "Consultation info", resolved: true, requiredSkill: "consultation" },
        ],
        action: { type: "respond", skills: ["consultation"] },
        writeActions: [],
      }),
      makeComposerResponse(
        "Yes, the consultation is a free phone call.\nhttps://www.doctours.com/consultation",
        "answer consultation question",
      ),
    ]);

    const reply = await processMessage("Is the consultation free?", llm);

    expect(reply.response).toContain("free phone call");
    expect(reply.response).toContain("https://www.doctours.com/consultation");
  });
});

describe("executeWriteActions", () => {
  it("executes valid write actions without throwing", () => {
    expect(() =>
      executeWriteActions([
        {
          tool: "updateWorkingMemory",
          args: { memory: { patientName: "Jordan" } },
        },
      ]),
    ).not.toThrow();
  });

  it("silently ignores unknown tools", () => {
    expect(() =>
      executeWriteActions([{ tool: "nonexistentTool", args: {} }]),
    ).not.toThrow();
  });

  it("executes multiple actions", () => {
    expect(() =>
      executeWriteActions([
        { tool: "updateWorkingMemory", args: { memory: {} } },
        { tool: "updateUserClinicPreferences", args: { clinicSelection: {} } },
      ]),
    ).not.toThrow();
  });

  it("handles empty actions array", () => {
    expect(() => executeWriteActions([])).not.toThrow();
  });
});

describe("processMessageSafely", () => {
  it("returns a handoff reply when the LLM call fails", async () => {
    const llm = async () => { throw new Error("claude exited 1"); };
    const reply = await processMessageSafely("What does Heva cost?", llm);
    expect(reply.escalate).toBe(true);
    expect(reply.escalationReason).toBe("System error while drafting a reply");
    expect(reply.response).toBe("I can't help with that directly. I'm getting a person for you.");
  });

  it("returns a handoff reply when the model output is not JSON", async () => {
    const llm = async () => "not json at all";
    const reply = await processMessageSafely("Hi", llm);
    expect(reply.escalate).toBe(true);
  });

  it("returns a handoff reply for missing message text", async () => {
    const llm = async () => { throw new Error("should not be called"); };
    const reply = await processMessageSafely(undefined as unknown as string, llm);
    expect(reply.escalate).toBe(true);
  });
});
