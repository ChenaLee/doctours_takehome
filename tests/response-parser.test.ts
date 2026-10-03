import { describe, it, expect } from "vitest";
import { parseReplyResponse } from "../src/engine/response-parser.js";

const validReply = {
  reply: {
    response: "Heva has two packages. Silver is $3,000 and Gold is $4,500.",
    escalate: false,
    escalationReason: null,
    templateId: null,
    intent: "answer pricing question",
    shouldFollowUp: false,
    followUpTiming: null,
    attachmentUrls: null,
    highEngagement: true,
    workingMemoryUpdates: null,
  },
  actions: [],
};

describe("parseReplyResponse — valid input", () => {
  it("extracts reply from valid JSON", () => {
    const raw = JSON.stringify(validReply);
    const result = parseReplyResponse(raw);
    expect(result.reply.response).toBe(
      "Heva has two packages. Silver is $3,000 and Gold is $4,500.",
    );
    expect(result.reply.escalate).toBe(false);
    expect(result.reply.intent).toBe("answer pricing question");
  });

  it("forces templateId to null", () => {
    const input = {
      ...validReply,
      reply: { ...validReply.reply, templateId: "some-id" },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.templateId).toBeNull();
  });

  it("preserves highEngagement", () => {
    const result = parseReplyResponse(JSON.stringify(validReply));
    expect(result.reply.highEngagement).toBe(true);
  });

  it("preserves shouldFollowUp and followUpTiming", () => {
    const input = {
      ...validReply,
      reply: {
        ...validReply.reply,
        shouldFollowUp: true,
        followUpTiming: "1 month",
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.shouldFollowUp).toBe(true);
    expect(result.reply.followUpTiming).toBe("1 month");
  });

  it("preserves workingMemoryUpdates", () => {
    const input = {
      ...validReply,
      reply: {
        ...validReply.reply,
        workingMemoryUpdates: {
          keyConcerns: "pricing",
          communicationStyle: "casual" as const,
        },
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.workingMemoryUpdates).toEqual({
      keyConcerns: "pricing",
      communicationStyle: "casual",
    });
  });

  it("extracts actions array", () => {
    const input = {
      ...validReply,
      actions: [
        {
          tool: "updateWorkingMemory",
          args: { memory: { patientName: "Jordan" } },
        },
      ],
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].tool).toBe("updateWorkingMemory");
  });

  it("defaults actions to empty when missing", () => {
    const input = { reply: validReply.reply };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.actions).toEqual([]);
  });
});

describe("parseReplyResponse — escalation consistency", () => {
  it("accepts escalate true with reason", () => {
    const input = {
      reply: {
        ...validReply.reply,
        escalate: true,
        escalationReason: "Patient wants human",
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.escalate).toBe(true);
    expect(result.reply.escalationReason).toBe("Patient wants human");
  });

  it("rejects escalate true without reason", () => {
    const input = {
      reply: {
        ...validReply.reply,
        escalate: true,
        escalationReason: null,
      },
    };
    expect(() => parseReplyResponse(JSON.stringify(input))).toThrow(
      "escalationReason must be non-null",
    );
  });

  it("rejects escalate false with reason", () => {
    const input = {
      reply: {
        ...validReply.reply,
        escalate: false,
        escalationReason: "Some reason",
      },
    };
    expect(() => parseReplyResponse(JSON.stringify(input))).toThrow(
      "escalationReason must be null",
    );
  });
});

describe("parseReplyResponse — validation", () => {
  it("rejects missing reply object", () => {
    expect(() => parseReplyResponse(JSON.stringify({}))).toThrow(
      "Missing 'reply'",
    );
  });

  it("rejects empty response string", () => {
    const input = { reply: { ...validReply.reply, response: "" } };
    expect(() => parseReplyResponse(JSON.stringify(input))).toThrow(
      "non-empty string",
    );
  });

  it("rejects missing escalate boolean", () => {
    const input = {
      reply: { ...validReply.reply, escalate: "false" },
    };
    expect(() => parseReplyResponse(JSON.stringify(input))).toThrow(
      "boolean",
    );
  });

  it("rejects empty intent", () => {
    const input = { reply: { ...validReply.reply, intent: "" } };
    expect(() => parseReplyResponse(JSON.stringify(input))).toThrow(
      "intent",
    );
  });
});

describe("parseReplyResponse — attachmentUrls", () => {
  it("normalizes null attachmentUrls", () => {
    const result = parseReplyResponse(JSON.stringify(validReply));
    expect(result.reply.attachmentUrls).toBeNull();
  });

  it("normalizes empty array to null", () => {
    const input = {
      reply: { ...validReply.reply, attachmentUrls: [] },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.attachmentUrls).toBeNull();
  });

  it("preserves up to 3 URLs", () => {
    const input = {
      reply: {
        ...validReply.reply,
        attachmentUrls: ["url1", "url2", "url3"],
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.attachmentUrls).toEqual(["url1", "url2", "url3"]);
  });

  it("truncates to 3 URLs", () => {
    const input = {
      reply: {
        ...validReply.reply,
        attachmentUrls: ["a", "b", "c", "d"],
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.attachmentUrls).toHaveLength(3);
  });

  it("filters non-string values", () => {
    const input = {
      reply: {
        ...validReply.reply,
        attachmentUrls: ["url1", 123, null, "url2"],
      },
    };
    const result = parseReplyResponse(JSON.stringify(input));
    expect(result.reply.attachmentUrls).toEqual(["url1", "url2"]);
  });
});

describe("parseReplyResponse — JSON extraction", () => {
  it("extracts from markdown fences", () => {
    const raw = `Here's the reply:
\`\`\`json
${JSON.stringify(validReply)}
\`\`\``;
    const result = parseReplyResponse(raw);
    expect(result.reply.response).toContain("Heva");
  });

  it("extracts from surrounding prose", () => {
    const raw = `I composed: ${JSON.stringify(validReply)} — done.`;
    const result = parseReplyResponse(raw);
    expect(result.reply.intent).toBe("answer pricing question");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseReplyResponse("not json at all")).toThrow();
  });
});
