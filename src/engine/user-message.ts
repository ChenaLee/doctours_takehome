import { USER_MESSAGE_TEMPLATE, RECENT_CONVERSATION_SUMMARY } from "../constants.js";

export function buildUserMessage(
  humanMessage: string,
  conversationSummary?: string,
): string {
  return USER_MESSAGE_TEMPLATE
    .replace("{{HUMAN_MESSAGE}}", humanMessage)
    .replace(
      "{{RECENT_CONVERSATION_SUMMARY}}",
      conversationSummary ?? RECENT_CONVERSATION_SUMMARY,
    );
}
