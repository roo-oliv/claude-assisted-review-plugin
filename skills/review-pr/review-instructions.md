# Review Instructions — 4-Phase Packet Protocol

This document governs your behavior during an AI-assisted code review session. Follow each phase sequentially. The review is an interactive, multi-turn conversation — you present pre-formatted packets and wait for user input at each step.

---

## Phase 1: PR Overview

Present a summary before diving into any code. Use this exact format:

```
## PR #{number}: {title}

Author:  {author}
Branch:  {head} → {base}
Changes: +{additions} -{deletions} across {changedFiles} files ({total_packets} review packets)
```

**Description:**
Show the PR body. If it's very long (>30 lines), summarize the key points and note that the full description is available.

**Commits ({count}):**
List each commit as: `{sha[0:7]} {messageHeadline}`

**Labels:** List if any, or omit the section.

**Existing reviews/comments:** If there are existing reviews or discussion comments, briefly mention them so the reviewer has context.

**Draft warning:** If the PR is a draft (`isDraft: true`), warn: "This PR is still a draft. The author may not be ready for a full review."

Then ask: **"Ready to begin? I'll walk you through the changes in batches."**

Wait for the user to confirm before proceeding.

---

## Phase 2: Packet Ordering

Read the `===PACKET_INDEX_START===` block and decide the order in which to present packets.

### Ordering by Lines of Thought

The goal is to **tell a story**, not walk through files sequentially. A "line of thought" is a logical thread that spans multiple files — for example, a type definition, the function that uses it, and the test that covers it all form one line of thought.

1. **Read all commit messages and the PR description** to identify the distinct logical changes in the PR.
2. **Group packets into lines of thought** — each group is a coherent concept or feature that the reviewer can understand as a unit. A line of thought might include packets from 3-4 different files.
3. **Order the lines of thought** using this general hierarchy as a starting framework (not a rigid rule):
   - Types, interfaces, schemas
   - Core implementation
   - Integration layer (API routes, controllers, wiring)
   - Tests
   - Configuration, CI/CD, documentation
   - Special files (lock, binary, generated, minified)
4. **Within each line of thought**, order packets so each one builds on the previous: definition before usage, interface before implementation, setup before behavior.
5. **Packets from the same file don't need to be consecutive.** If `handler.ts` has two hunks that belong to different logical threads, split them across lines of thought. Interleave freely when the narrative calls for it.

### Packet Size Awareness

Ideal packets are **under 10 changed lines**. Anything over 20 is a stretch — flag it in your summary so the reviewer knows a larger packet is coming.

### Example: Sequential vs. Narrative

**Bad — file-sequential ordering:**
```
1. src/types/auth.ts (1/2)    — JWT types
2. src/types/auth.ts (2/2)    — Session types
3. src/auth/jwt.ts (1/2)      — JWT validation
4. src/auth/jwt.ts (2/2)      — JWT refresh
5. src/auth/session.ts        — Session manager
6. test/jwt.test.ts           — JWT tests
7. test/session.test.ts       — Session tests
```

**Good — narrative ordering (lines of thought):**
```
Thread 1: JWT validation
  1. src/types/auth.ts (1/2)  — JWT type definitions
  2. src/auth/jwt.ts (1/2)    — JWT signature validation
  3. test/jwt.test.ts          — Tests for JWT validation

Thread 2: Session management
  4. src/types/auth.ts (2/2)  — Session type definitions
  5. src/auth/session.ts       — Session lifecycle
  6. src/auth/jwt.ts (2/2)    — JWT refresh (ties sessions to tokens)
  7. test/session.test.ts      — Tests for session management
```

Notice how `auth.ts` parts and `jwt.ts` parts are split across threads — each appears where it's most relevant, not grouped by file.

### Present the Plan

Show the reviewer the order you've chosen, grouped by lines of thought:

```
I'll present {N} packets in this order:

**{Thread 1 name}**
  1. src/types/auth.ts (1/2, +8)
  2. src/auth/jwt.ts (+12 -3)
  3. test/jwt.test.ts (+15)

**{Thread 2 name}**
  4. src/types/auth.ts (2/2, +6)
  ...
```

Proceed immediately to Phase 3 (no confirmation needed for the order).

---

## Phase 3: Browser-Based Review

Core of the protocol. All packets are presented in a browser-based GitHub-style diff viewer with inline commenting.

### 3a. Extract Data File Path

Find the `===REVIEW_DATA_FILE=...===` line in the prepare-packets.sh output. Extract the file path — this is the JSON sidecar file containing full packet data.

### 3b. Prepare Lightweight Packet Metadata

For each packet, in presentation order from Phase 2, prepare a lightweight metadata object:

- `id`: the packet ID (matches the JSON sidecar file)
- `title`: a semantic name that describes *what this packet does*, not where it lives. Think of it as a micro-commit message — if this packet were its own commit, what would the message be?
  - **Good titles:** "Add JWT signature validation", "Define session timeout types", "Test token refresh on expiry"
  - **Bad titles:** "handler.ts 2/3", "Update auth module", "Changes to types"
- `file_status`: map from packet type — `new` → `"added"`, `deleted` → `"deleted"`, `normal` → `"modified"`, `renamed` → `"renamed"`
- `language`: infer from file extension (e.g., `.ts` → `"typescript"`, `.py` → `"python"`, `.go` → `"go"`)
- `ai_summary`: 2-4 sentence analysis connecting this packet to the narrative. What it does, how it relates to what the reviewer just saw (previous packet) and what's coming next. For the first packet in a line of thought, set the stage. For the last, tie it together.
- `existing_comments`: map the inline review comments from the pre-fetch data to this packet by matching the file path and line ranges within the packet's diff. Each comment should include: `id` (as string), `author`, `body`, `line`, `side`, `created_at`.

**IMPORTANT:** Do NOT include `content`, `file`, `part`, `type`, `additions`, or `deletions` in the packet metadata. These are already in the JSON sidecar file and the MCP server merges them automatically.

**Packet size note:** If a packet has 20+ changed lines, mention this in the `ai_summary` so the reviewer is prepared for a larger chunk.

### 3c. Call the MCP Review Tool

Make a single `mcp__review-ui__review_packets` call:

```
{
  pr_number:   <number>,
  pr_title:    "<title>",
  pr_url:      "<url>",
  pr_author:   "<author>",
  base_branch: "<base>",
  head_branch: "<head>",
  data_file:   "<path from 3a>",
  packets: [
    {
      id:                <packet_id>,
      title:             "<short descriptive name>",
      file_status:       "added|modified|deleted|renamed",
      language:          "<language>",
      ai_summary:        "<2-4 sentence analysis>",
      existing_comments: [{ id: "<id>", author: "<login>", body: "<text>", line: <num>, side: "<LEFT|RIGHT>", created_at: "<iso>" }]
    },
    ...
  ]
}
```

The tool opens a browser with a rich diff viewer featuring inline commenting. It blocks until the reviewer submits their review (or a 30-minute timeout expires).

### 3d. Handle Tool Response

The tool returns:
```json
{
  "status": "completed|timeout|error",
  "action": "approve|comment|request_changes",
  "body": "overall review body text",
  "comments": [
    {
      "packet_id": 1,
      "file": "src/auth/handler.ts",
      "line": 42,
      "end_line": 45,
      "side": "RIGHT",
      "body": "This needs better error handling"
    }
  ]
}
```

- If `status` is `timeout`: inform the reviewer and ask if they'd like to retry (re-call the tool) or cancel the review.
- If `status` is `error`: show the error message and fall back to AskUserQuestion (see 3f).
- If `status` is `completed`: proceed to Phase 4 with the `action`, `body`, and `comments`.

### 3e. Store Review Data

Store the full response for Phase 4:
- `action`: the verdict chosen in the browser
- `body`: the overall review body text (may be null)
- `comments`: array of inline comments with exact file, line, end_line, and side

### 3f. Fallback — AskUserQuestion

If the MCP tool call fails (e.g., MCP server not installed or not running), fall back to the AskUserQuestion-based flow:

- Batch packets in groups of 4
- For each batch, use `AskUserQuestion` with one question per packet containing the verbatim diff content
- Options per packet: "No comment" / "Discuss"
- Handle responses as before (No comment → skip, Discuss → follow up, Other typed text → store as comment)
- After all packets: ask for verdict and overall body manually

---

## Phase 4: Summary & Submit

### 4a. Review Summary

Present the review data from the browser:

```
## Review Summary — PR #{number}: {title}

Verdict: {Approve|Comment|Request Changes}
Overall body: {body text or "(none)"}
Inline comments: {count}

  1. src/auth/handler.ts:42-45 (RIGHT) — "Comment text (first 80 chars)..."
  2. src/api/route.ts:12 (RIGHT) — "Another comment..."
```

If there are no comments and no body, say: "No comments or body. You selected: {verdict}."

### 4b. Edit Check

```json
{
  "questions": [{
    "question": "Would you like to edit anything before submitting?",
    "header": "Review",
    "multiSelect": false,
    "options": [
      { "label": "Submit as-is", "description": "Submit the review exactly as shown" },
      { "label": "Edit comments", "description": "Modify, remove, or add comments" },
      { "label": "Change verdict", "description": "Choose a different verdict" },
      { "label": "Quit", "description": "Exit without submitting" }
    ]
  }]
}
```

- **Submit as-is**: proceed to 4f.
- **Edit comments**: ask which comment(s) to change (free-text), make edits, re-show summary, and ask again.
- **Change verdict**: re-ask verdict with the three options (Approve, Comment, Request Changes), then loop back to 4a.
- **Quit**: confirm: "Are you sure? Your review won't be submitted." with Yes/No options.

### 4c–4d. (Skipped)

Verdict and overall body are already collected from the browser UI. No need for separate prompts.

### 4e. (Skipped)

Comment positions (file, line, end_line, side) are already provided by the browser with exact values. No need to parse diffs for position mapping.

### 4f. Submit

Build the review JSON payload from the tool response:

```json
{
  "event": "APPROVE|COMMENT|REQUEST_CHANGES",
  "body": "Overall review comment (if any)",
  "comments": [
    {
      "path": "relative/path/to/file.ts",
      "line": 42,
      "side": "RIGHT",
      "body": "Comment text"
    }
  ]
}
```

For multi-line comments (where `end_line` is not null), use the GitHub multi-line comment format:
```json
{
  "path": "relative/path/to/file.ts",
  "start_line": 38,
  "line": 42,
  "start_side": "RIGHT",
  "side": "RIGHT",
  "body": "Comment text"
}
```

Map the verdict: `approve` → `"APPROVE"`, `comment` → `"COMMENT"`, `request_changes` → `"REQUEST_CHANGES"`.

Determine the repository owner/name:
```bash
gh repo view --json owner,name --jq '"\(.owner.login)/\(.name)"'
```

Submit:
```bash
echo '<json_payload>' | gh api repos/{owner}/{repo}/pulls/{pr_number}/reviews --input -
```

On success:
```
## Review submitted!

Verdict: {APPROVE/COMMENT/REQUEST_CHANGES}
Inline comments: {count}
PR: {pr_url}
```

On failure, show the error and offer: Retry / Post without inline comments / Quit.

---

## General Behavior Rules

1. **Use the MCP tool first** — always try `mcp__review-ui__review_packets` before falling back to `AskUserQuestion`.
2. **Don't copy diff content** — send only the `data_file` path and lightweight metadata. The MCP server reads full diffs from the JSON sidecar file.
3. **Stay neutral** — guide the review, don't judge the code. You may briefly flag potential issues, but the reviewer decides.
4. **Never auto-advance** — always wait for tool responses before proceeding.
5. **Handle errors gracefully** — if the MCP tool fails, fall back to AskUserQuestion. If `gh` commands fail, explain briefly and suggest a fix.
6. **Answer questions briefly** — when asked, draw from the diff, commits, and PR description. Keep answers short and direct.
7. **Narrative over sequence** — packets from the same file don't need to appear consecutively. Order by lines of thought that cross file boundaries, interleaving files when it serves the story.
