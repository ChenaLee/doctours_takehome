# Doctours patient concierge

A command-line program that drafts patient-facing replies for the Doctours pre-deposit concierge. It reads a JSON array of patient messages and writes a JSON array of `Reply` objects, one per message, in the same order.

## How to run it

### Prerequisites

- **Node.js 22** (developed on v22.22). The code uses `node:` built-ins and ES modules.
- **Claude Code CLI** (`claude`) on your `PATH`, signed in. Developed against `claude` 2.1.x.
  Every model call shells out to `claude --print` (see `src/engine/claude.ts`). There is no SDK and no API key read by this code. Authentication is whatever the `claude` CLI uses: either run `claude` once and log in, or set `ANTHROPIC_API_KEY` in the environment for the CLI to pick up. The code doesn't pick a model; calls use the CLI's configured default model.

### Install and build

```bash
npm ci          # or: npm install
npm run build   # tsc → dist/
```

### Produce the output

```bash
node dist/index.js messages.json > replies.json
# or read from stdin
cat messages.json | node dist/index.js > replies.json
```

`messages.json` is an array in the shape of `HUMAN_MESSAGES`:

```json
[
  { "id": "consultation", "text": "Is the consultation free?" },
  { "id": "demand-human", "text": "I demand to talk to a human" }
]
```

- **stdout:** a JSON array of `Reply` objects (see `src/types.ts`), one per input message, in input order. A `Reply` has no `id` field; match replies to inputs by position.
- **stderr:** progress lines (`Processing: <id>` and `→ escalate=…, intent=…`), plus `! failed to draft a reply: …` when a message fails.
- **Errors are caught per message.** If a `claude` call fails, model output won't parse, or a message has no text, that message gets a handoff reply and the batch continues:
  - `escalate: true`
  - `escalationReason: "System error while drafting a reply"`
  - `response: "I can't help with that directly. I'm getting a person for you."`

  The process exits 1 only when the input itself isn't a JSON array.

Messages are processed one after another. Each needs between 1 and 8 `claude` calls, so expect roughly 10–60 seconds per message.

### Tests

```bash
npm test                                         # everything, including the live-LLM e2e suite
npx vitest run --exclude tests/e2e.test.ts       # unit tests only (no LLM calls)
```

## What I built and why

### Fixed context

The task gives one patient and one conversation. Every input message is treated as a new message on that same history, not as a continuation of the previous input.

- **Patient data.** The patient (Jordan Hale, pipeline status `PRE_CLINICAL_SENT`), the working memory, the collection status and the conversation history are constants in `src/constants.ts`.
- **Tools.** The 14 tools in `src/tools/index.ts` return fixed mock data: two clinics, three packages, the assessment link, payment links, and so on.
- **No state between messages.** Agent state is created fresh for each message (`createAgentState`). The deferred write tools (`updateWorkingMemory`, `updateUserClinicPreferences`, `updateUser`) validate their input and return a result but store nothing. Message N cannot affect message N+1.

### Pipeline

`src/pipeline.ts` runs these steps for each message:

```
message
  → planner loop (src/agent/loop.ts)            ← LLM call per iteration
      picks one action per iteration:
        call_tool | load_skill | escalate | clarify | respond
  → terminal action
      escalate → fixed template reply           (no further LLM call)
      clarify  → the planner's question is the reply
      respond  → responder (one LLM call) composes the Reply JSON
  → deferred write tools run (best effort)
  → Reply
```

I split the work into a planner and a responder because the two jobs need different context.

- **Planner.** Its job is to decide what to look up and whether this is something the system can do at all. It works over a small prompt that is rebuilt each iteration, and only it can call tools.
- **Responder.** Its job is to write a reply that follows the full set of policy and voice rules. It gets the full system prompt plus the facts the planner gathered, and it never calls tools itself. It cannot invent a price or a URL that wasn't fetched this turn.

### Planner loop

`src/agent/loop.ts`, `src/agent/prompts/step.ts`:

- **Iteration 1** breaks the message down into end goals. For example, Heva packages, paying from the assessment, and afro-hair fit. Each goal can name a skill it needs.
- **Each iteration** returns strict JSON: `reasoning`, `goalsUpdate`, one `action`, and `writeActions`. It may call only one tool per iteration, so it sees each result before choosing the next step.
- **The loop enforces tool kinds** (`src/types.ts` `ToolKind`):
  - `call_tool` may only use `immediate` tools. Calling a `deferred` tool, or one that isn't registered, records an error result instead of running it.
  - `writeActions` may only use `deferred` tools. These are queued and run after the reply.
- **Iteration cap.** `MAX_ITERATIONS = 8` (`src/agent/safety.ts`) means at most 7 planner calls. If the cap is reached without a terminal action, the loop falls back to `respond` with the skills its goals named.

### Skills and the system prompt

The original system prompt is kept verbatim in `prompts/original-system-prompt.md`, with two deliberate edits described below. `scripts/split-system-prompt.mjs` divides it into:

- **`core`** (`src/skills/core.ts`): everything that is not a skill. This includes identity, response mode, voice, conversation awareness, capabilities and constraints, business-policy grounding, guidelines, structured-output rules, first-contact introduction, all stage-specific behavior (LEAD → PRE_CLINICAL_SENT steps 0–3 → MEETING_*), tool usage, the remaining operational-knowledge items, working-memory instructions, and the patient, clinic-flag, promo and conversation sections.
- **Six on-demand skills.** These are whole sections moved out word for word:

  | skill | sections |
  |---|---|
  | `pricing` | Financing geography, health insurance, CareCredit/Cherry, package & clinic facts, direct-from-clinic quotes, what matters vs nice to have, pre-assessment length cap, Operational Knowledge 9 |
  | `payment` | Deposit eligibility, reversibility, time-bound pause, Operational Knowledge 6 (payment & deposits, payment vs checkout link) |
  | `collection` | Collection persistence, instant-form confirmation, information collection, concern reflection, image guidance, image delay handling |
  | `clinic-info` | Clinic website, creator/partnership boundary, clinic status tiers, travel readiness |
  | `consultation` | Consultation booking confirmation, consultation rescheduling, phone contact, Operational Knowledge 8 |
  | `assessment` | No-turnaround-promises guideline, Operational Knowledge 3 (assessment, revisions) |

I made skills whole sections, not rewritten summaries. An earlier condensed version lost rules the model needed, such as "the assessment is also where they can pay". A unit test (`tests/skills.test.ts`) checks that core plus all skills contain every line of the source prompt exactly once. To change prompt text, edit `prompts/original-system-prompt.md` and re-run `node scripts/split-system-prompt.mjs`.

The two edits to the source text are both removals of the general "no repeated links" rule:
- the CONVERSATION AWARENESS "No repeated links" bullet, and
- the URL clause of the closing "CRITICAL: Review the conversation" line.

That rule stopped the reply from resending a link the patient was asking about. Situation-specific link rules remain, for example clinic website first-ask vs repeat-ask.

### What stays loaded on every turn

**Planner prompt**, rebuilt on every iteration:
- Planner instructions.
- Patient context (JSON) and conversation history.
- The patient message.
- Current goals, and the data gathered so far (tool results).
- A log of the actions taken.
- **Tools.** Every registered tool's name and description, split into immediate and deferred.
- **Skills.** Every skill's name and description, plus the registered tools the skill's text references (`getSkillTools`, derived by matching tool names in the skill text). The planner never sees a skill's full text. It routes by these descriptions; only the responder reads the rules themselves. This keeps planner calls small and puts policy wording in one place.
- The capability boundary and the output schema.

The planner's user message is the raw patient text.

**Responder prompt**, built once per `respond`:
- The full `core` prompt (about 79k characters), with `{{PLACEHOLDERS}}` filled from `src/constants.ts`. Instruction placeholders such as `{{clinic.slug}}` stay as written.
- The skills named in the `respond` action. Duplicates are dropped, and `core` is never added twice.
- All tool results gathered this turn.
- The output format. This includes the rule that a stated package price always comes with its deposit and currency code. It also lists which deferred tools the responder may queue as `actions`.

The responder's user message is `USER_MESSAGE_TEMPLATE`: the incoming message plus the recent conversation summary.

The responder only receives skills named in `respond.skills`. `load_skill` only records a skill in the agent state, which the iteration-cap fallback uses. It does not reach the responder unless `respond` names it too.

### Registries drive everything

- **`toolRegistry`** (`src/tools/registry.ts`) holds each tool's function, a one-line description, and its `kind`.
- **`skillRegistry`** (`src/skills/registry.ts`) holds each skill's prompt and description.

The planner's tool list, skill list, skill→tool dependencies, deferred-tool allowlist and capability boundary are all generated from these two registries. Adding a tool or a skill needs no prompt edits. A test registers a dummy tool and skill and checks that both appear in the planner prompt.

## How escalation works

**What counts as "can't do it".** The capability boundary in the planner prompt is not a hard-coded list of forbidden actions. It says that the listed tools and skills are the complete set of capabilities, and each tool does exactly what its description says. The planner escalates in these cases:

| Situation | Category |
|---|---|
| The patient asks for an action that no tool's description performs, e.g. charging a card, placing a call, moving money | `cant_handle` |
| The planner would otherwise have to swap in a related tool, e.g. sending a payment link when asked to charge a card | `cant_handle` |
| The patient shares sensitive data (card numbers, SSN, credentials) | `cant_handle` |
| The patient demands a human, person or agent | `human_request` |
| Answering needs knowledge outside every listed skill's domain | `cant_handle` |

The planner is told "when in doubt, escalate". Because the boundary comes from the registries, a newly added tool automatically becomes something the system can do.

**Planner escalation.** An `escalate` action from the planner ends the loop and makes no further LLM call. `src/agent/escalation.ts` builds the reply:
- `human_request` → "I'm getting a person for you."
- `cant_handle` → "I can't {action}. I'm getting a person for you."
  - `{action}` is the planner's `cantDo` phrase, e.g. "charge a card" or "schedule a phone call".
  - The phrase is sanitized: a leading "I can't" is stripped, and it must be plain letters, at most 50 characters, with no digits, `@` or URLs.
  - If the phrase fails those checks, or is missing, the reply falls back to "I can't help with that directly. I'm getting a person for you."
  - This way patient data such as card digits can never be echoed into the reply text.
- **Other reply fields.** `escalate: true`, `escalationReason` = the planner's short reason, `intent: "escalation"`, and no URLs, attachments or follow-up.

**Responder escalation.** The responder may also return `escalate: true` if the base prompt leads it there. The parser rejects a reply whose `escalate` and `escalationReason` disagree.

## Project layout

```
src/index.ts               CLI: JSON in, JSON out
src/pipeline.ts            per-message orchestration, per-message error fallback, write actions, clarify reply
src/agent/loop.ts          planner loop, tool-kind enforcement
src/agent/prompts/step.ts  planner prompt + response parser
src/agent/prompts/responder.ts  responder prompt (base + skills + tool results + format)
src/agent/escalation.ts    escalation templates, cantDo sanitizer
src/agent/safety.ts        iteration cap and fallback
src/engine/claude.ts       `claude --print` wrapper (system prompt via temp file)
src/engine/response-parser.ts   validates and normalizes the responder's Reply JSON
src/tools/                 mock tools + registry (descriptions, kinds)
src/skills/                generated core + skills, skill registry
prompts/original-system-prompt.md   source prompt the skills are generated from
scripts/split-system-prompt.mjs     regenerates src/skills/*.ts
```

## Known limitations

- **`escalationReason` is not sanitized.** It is the planner's free text. The planner is instructed never to echo sensitive data, but only the `response` text is enforced in code.
- **Fixed patient and history.** Patient, history and tool data are fixed, so behavior on a different patient or pipeline stage needs those constants changed.
- **Replies vary between runs.** The model isn't deterministic, e.g. whether a simple factual answer includes an optional link.
