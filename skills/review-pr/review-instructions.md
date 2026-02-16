# Review Instructions — 4-Phase Annotation Protocol

This document governs your behavior during an AI-assisted code review session. Follow each phase sequentially. The review is an interactive, multi-turn conversation — you present changes and wait for user input at each step.

---

## Phase 1: PR Overview

Present a summary before diving into any code. Use this exact format:

```
## PR #{number}: {title}

Author:  {author}
Branch:  {head} → {base}
Changes: +{additions} -{deletions} across {changedFiles} files
```

**Description:**
Show the PR body. If it's very long (>30 lines), summarize the key points and note that the full description is available.

**Commits ({count}):**
List each commit as: `{sha[0:7]} {messageHeadline}`

**Labels:** List if any, or omit the section.

**Existing reviews/comments:** If there are existing reviews or discussion comments, briefly mention them so the reviewer has context.

**Draft warning:** If the PR is a draft (`isDraft: true`), warn: "This PR is still a draft. The author may not be ready for a full review."

Then ask: **"Ready to begin? I'll walk you through the changes."**

Wait for the user to confirm before proceeding.

---

## Phase 2: Annotate & Order

Read the `===FILE_INDEX_START===` block to identify all files and their types. Then create annotation-based packets that the MCP server will use to slice diffs.

### Auto-Packets for Special Files

Special files (lock, binary, generated, minified) and rename-only files become auto-packets with standard titles — no annotation needed:
- Lock file → title: "Update {basename} dependencies"
- Binary file → title: "Update {filename}"
- Generated file → title: "Regenerate {filename}"
- Minified file → title: "Update minified {filename}"
- Rename-only → title: "Rename {old} → {new}"

### Annotating Normal Files

For each normal file, walk the diff (the `===FILE id=N===` block) and create **annotations**:

1. Each annotation covers a **meaningful code unit** — a function, a group of related fields, a logical change, a test case, etc.
2. Each annotation has:
   - `file_id`: the file's ID from the index
   - `start_line` / `end_line`: new-file line numbers from the `+` column (the right side of the diff). For **pure deletions** (lines only removed, nothing added), use old-file line numbers and set `side: "LEFT"`.
   - `title`: a micro-commit message — what does this chunk do? Think: if this were its own commit, what would the message be?
     - **Good:** "Add JWT expiry validation", "Define session timeout types", "Test token refresh on expiry"
     - **Bad:** "handler.ts 2/3", "Update auth module", "Changes to types"
   - `description`: 1-2 sentences explaining what the code does and why.

3. **Sizing guidance** (not rigid): aim for 5-30 changed lines per annotation. A single line is fine if semantically distinct. A 50-line function is fine if it's cohesive. The question is: "can a reviewer hold this in their head as one concept?"

4. **Import-heavy regions**: collapse into a single "Update imports" annotation.

5. **Line number hints**: The `@@ -old,len +new,len @@` headers in the diff tell you the line numbers. Added lines (`+`) use the new-file numbering. Deleted lines (`-`) use the old-file numbering. Context lines (no prefix) have both.

### Verify Completeness

After creating all annotations, check that every `+` and `-` line in each file falls within at least one annotation. If gaps exist, either expand a neighboring annotation or create a new one. The MCP server has a safety net that catches missed lines, but it's better to be complete.

### Order Narratively

Order the annotations into **lines of thought** that cross file boundaries:

1. **Read all commit messages and the PR description** to identify the distinct logical changes.
2. **Group annotations into lines of thought** — each group is a coherent concept the reviewer can understand as a unit.
3. **Order the lines of thought** using this general hierarchy as a starting framework (not a rigid rule):
   - Types, interfaces, schemas
   - Core implementation
   - Integration layer (API routes, controllers, wiring)
   - Tests
   - Configuration, CI/CD, documentation
   - Special files (lock, binary, generated, minified)
4. **Within each line of thought**, order annotations so each builds on the previous: definition before usage, interface before implementation, setup before behavior.
5. **Annotations from the same file don't need to be consecutive.** If `handler.ts` has two regions that belong to different logical threads, split them across lines of thought.

### Assign Sequential Packet IDs

Number the annotations sequentially (1, 2, 3, ...) in the narrative order you chose.

### Present the Plan

Show the reviewer the order you've chosen, grouped by lines of thought:

```
I'll present {N} packets in this order:

**{Thread 1 name}**
  1. src/types/auth.ts:10-25 — "Add JWT expiry validation"
  2. src/auth/jwt.ts:15-40 — "Validate signature with expiry check"
  3. test/jwt.test.ts:1-30 — "Test JWT validation edge cases"

**{Thread 2 name}**
  4. src/types/auth.ts:30-45 — "Define session timeout types"
  ...

**Special files**
  8. package-lock.json — "Update dependencies"
```

Proceed immediately to Phase 3 (no confirmation needed for the order).

---

## Phase 3: Browser-Based Review

Core of the protocol. All packets are presented in a browser-based GitHub-style diff viewer with inline commenting.

### 3a. Extract Data File Path

Find the `===REVIEW_DATA_FILE=...===` line in the prepare-packets.sh output. Extract the file path — this is the JSON sidecar file containing per-file data.

### 3b. Prepare Lightweight Packet Metadata

For each annotation, in presentation order from Phase 2, prepare a metadata object:

- `id`: the sequential packet ID assigned in Phase 2
- `file_id`: the file's ID from the `===FILE_INDEX_START===` block
- `start_line`: start of the annotation range (new-file line number, or old-file if `side: "LEFT"`)
- `end_line`: end of the annotation range (inclusive)
- `side`: `"RIGHT"` (default) for new-file line numbers, `"LEFT"` for pure deletions
- `title`: the micro-commit message from the annotation
- `file_status`: map from file status — `added` → `"added"`, `deleted` → `"deleted"`, `modified` → `"modified"`, `renamed` → `"renamed"`
- `language`: infer from file extension (e.g., `.ts` → `"typescript"`, `.py` → `"python"`, `.go` → `"go"`)
- `ai_summary`: 2-4 sentence analysis connecting this packet to the narrative. What it does, how it relates to what the reviewer just saw and what's coming next. For the first packet in a line of thought, set the stage. For the last, tie it together. For import-heavy annotations, a single sentence is sufficient.
- `existing_comments`: map the inline review comments from the pre-fetch data to this packet by matching the file path and line ranges. Each comment should include: `id` (as string), `author`, `body`, `line`, `side`, `created_at`.

**IMPORTANT:** Do NOT include `content`, `file`, `part`, `type`, `additions`, or `deletions` in the packet metadata. The MCP server derives these from the sidecar + line range.

**For special files** (lock, binary, generated, minified, rename-only): use `start_line: 0`, `end_line: 0`, `side: "RIGHT"` — the server uses file-level metadata.

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
      file_id:           <file_id>,
      start_line:        <start>,
      end_line:          <end>,
      side:              "RIGHT",
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

- Batch the file diffs in groups of 4
- For each batch, use `AskUserQuestion` with one question per file containing the verbatim diff content
- Options per file: "No comment" / "Discuss"
- Handle responses as before (No comment → skip, Discuss → follow up, Other typed text → store as comment)
- After all files: ask for verdict and overall body manually

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
2. **Don't copy diff content** — send only the `data_file` path, `file_id`, and line ranges. The MCP server reads full diffs from the JSON sidecar file and slices them.
3. **Stay neutral** — guide the review, don't judge the code. You may briefly flag potential issues, but the reviewer decides.
4. **Never auto-advance** — always wait for tool responses before proceeding.
5. **Handle errors gracefully** — if the MCP tool fails, fall back to AskUserQuestion. If `gh` commands fail, explain briefly and suggest a fix.
6. **Answer questions briefly** — when asked, draw from the diff, commits, and PR description. Keep answers short and direct.
7. **Narrative over sequence** — annotations from the same file don't need to appear consecutively. Order by lines of thought that cross file boundaries, interleaving files when it serves the story.
