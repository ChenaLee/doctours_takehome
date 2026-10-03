import { describe, it, expect } from "vitest";
import { handleEscalation } from "../src/agent/escalation.js";
import type { Reply } from "../src/types.js";

function assertEscalationShape(reply: Reply) {
  expect(reply.escalate).toBe(true);
  expect(reply.escalationReason).not.toBeNull();
  expect(reply.escalationReason!.length).toBeGreaterThan(0);
  expect(reply.shouldFollowUp).toBe(false);
  expect(reply.followUpTiming).toBeNull();
  expect(reply.templateId).toBeNull();
  expect(reply.attachmentUrls).toBeNull();
  expect(reply.highEngagement).toBe(false);
  expect(reply.workingMemoryUpdates).toBeNull();
}

function assertShortResponse(reply: Reply) {
  const sentences = reply.response
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0);
  expect(sentences.length).toBeLessThanOrEqual(2);
}

function assertNoUrls(reply: Reply) {
  expect(reply.response).not.toMatch(/https?:\/\//);
}

function assertNoSalesContent(reply: Reply) {
  const salesTerms = [
    "package",
    "deposit",
    "price",
    "silver",
    "gold",
    "sapphire",
    "discount",
    "promo",
    "offer",
    "book",
    "schedule",
  ];
  const lower = reply.response.toLowerCase();
  for (const term of salesTerms) {
    expect(lower).not.toContain(term);
  }
}

describe("handleEscalation — human_request", () => {
  it("returns escalated reply", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    assertEscalationShape(reply);
  });

  it("response mentions getting a person", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    expect(reply.response.toLowerCase()).toContain("person");
  });

  it("escalationReason matches provided reason", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    expect(reply.escalationReason).toBe("Asked to talk to a human");
  });

  it("response is short", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    assertShortResponse(reply);
  });

  it("response has no URLs", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    assertNoUrls(reply);
  });

  it("response has no sales content", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    assertNoSalesContent(reply);
  });

  it("intent describes escalation", () => {
    const reply = handleEscalation("human_request", "Asked to talk to a human");
    expect(reply.intent.length).toBeGreaterThan(0);
  });
});

describe("handleEscalation — cant_handle", () => {
  it("returns escalated reply", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    assertEscalationShape(reply);
  });

  it("response mentions getting a person", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    expect(reply.response.toLowerCase()).toContain("person");
  });

  it("response acknowledges inability", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    expect(reply.response.toLowerCase()).toMatch(/can't|cannot/);
  });

  it("escalationReason matches provided reason", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    expect(reply.escalationReason).toBe("Asked to charge a card number");
  });

  it("response is short", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    assertShortResponse(reply);
  });

  it("response has no URLs", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    assertNoUrls(reply);
  });

  it("response has no sales content", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    assertNoSalesContent(reply);
  });

  it("response does NOT contain card digits", () => {
    const reply = handleEscalation(
      "cant_handle",
      "Asked to charge a card number",
    );
    expect(reply.response).not.toContain("4242");
    expect(reply.response).not.toMatch(/\d{4}/);
  });
});

describe("handleEscalation — defaults", () => {
  it("defaults to human_request when no category", () => {
    const reply = handleEscalation(undefined, "Unknown escalation");
    assertEscalationShape(reply);
    expect(reply.response.toLowerCase()).toContain("person");
  });

  it("all categories produce valid Reply shape", () => {
    for (const category of ["human_request", "cant_handle"] as const) {
      const reply = handleEscalation(category, "Some reason");
      assertEscalationShape(reply);
      assertShortResponse(reply);
      assertNoUrls(reply);
      assertNoSalesContent(reply);
    }
  });
});
