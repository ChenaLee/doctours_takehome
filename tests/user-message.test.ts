import { describe, it, expect } from "vitest";
import { buildUserMessage } from "../src/engine/user-message.js";

describe("buildUserMessage", () => {
  it("inserts the human message into the template", () => {
    const result = buildUserMessage("What packages does Heva have?");
    expect(result).toContain("What packages does Heva have?");
  });

  it("wraps the message in the Incoming thread message format", () => {
    const result = buildUserMessage("Hello");
    expect(result).toMatch(/Incoming thread message:\s*\n"Hello"/);
  });

  it("uses default conversation summary when none provided", () => {
    const result = buildUserMessage("Hi");
    expect(result).toContain("Jordan Hale");
    expect(result).toContain("Did any clinic catch your eye");
  });

  it("uses custom conversation summary when provided", () => {
    const result = buildUserMessage("Hi", "Custom summary here");
    expect(result).toContain("Custom summary here");
    expect(result).not.toContain("Did any clinic catch your eye");
  });

  it("includes chat kind", () => {
    const result = buildUserMessage("Hi");
    expect(result).toContain("Chat kind: DIRECT");
  });

  it("includes triggering sender", () => {
    const result = buildUserMessage("Hi");
    expect(result).toContain("Triggering sender: Jordan Hale");
  });

  it("includes image count", () => {
    const result = buildUserMessage("Hi");
    expect(result).toContain("Incoming image count: 0");
  });
});
