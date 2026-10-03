import { readFileSync } from "node:fs";
import { processMessage } from "./pipeline.js";
import { createClaudeCaller } from "./engine/claude.js";
import { RECENT_CONVERSATION_SUMMARY } from "./constants.js";
import type { Message, Reply } from "./types.js";

async function main() {
  const input = process.argv[2]
    ? readFileSync(process.argv[2], "utf-8")
    : readFileSync(0, "utf-8");

  const messages: Message[] = JSON.parse(input);
  const llm = createClaudeCaller();
  const replies: Reply[] = [];

  for (const msg of messages) {
    process.stderr.write(`Processing: ${msg.id}\n`);
    const reply = await processMessage(msg.text, llm, RECENT_CONVERSATION_SUMMARY);
    replies.push(reply);
    process.stderr.write(`  → escalate=${reply.escalate}, intent="${reply.intent}"\n`);
  }

  process.stdout.write(JSON.stringify(replies, null, 2) + "\n");
}

main().catch((err) => {
  process.stderr.write(`Error: ${err}\n`);
  process.exit(1);
});
