---
name: review-pr
description: >
  AI-guided Pull Request code review. A preprocessing script splits the diff into
  small review packets (~10 changed lines each), which are presented in a browser-based
  rich diff viewer with inline commenting. Packets are ordered by narrative flow — logical
  lines of thought that cross file boundaries — not by file sequence. The reviewer adds
  line-level comments and selects a verdict — fast, focused, minimal AI turns.
argument-hint: <PR-number-or-url>
disable-model-invocation: true
allowed-tools: Bash(gh *), Bash(cat *), Bash(bash *), Bash(echo *), Bash(printf *), Read, Grep, AskUserQuestion, mcp__review-ui__review_packets
---

## PR Metadata

!`gh pr view $0 --json number,url,title,body,state,isDraft,author,baseRefName,headRefName,labels,additions,deletions,changedFiles,reviewDecision,mergeStateStatus,commits,files`

## PR Discussion Comments

!`gh pr view $0 --json comments --jq '.comments[] | "[\(.author.login) at \(.createdAt)]: \(.body)"' 2>/dev/null || echo "(no comments)"`

## Existing Reviews

!`gh pr view $0 --json reviews --jq '.reviews[] | "[\(.author.login) - \(.state)]: \(.body)"' 2>/dev/null || echo "(no reviews yet)"`

## Inline Review Comments

!`bash ./scripts/fetch-inline-comments.sh $0`

## Review Packets

!`bash ./scripts/prepare-packets.sh $0`

---

## Instructions

You are conducting an AI-assisted code review. Your goal is to present this PR's changes in a browser-based review UI with inline commenting, letting the reviewer add line-level comments and select a verdict efficiently.

**Read the detailed review behavior guide now:**

Read the file `review-instructions.md` located in the same directory as this skill file. That file contains your complete 4-phase review protocol. Follow it precisely.

**IMPORTANT — Data file:** Look for the `===REVIEW_DATA_FILE=...===` line in the packets output above. Extract the file path — this is the JSON sidecar file. Pass it as `data_file` to the MCP tool. Do NOT copy packet content into the tool call.

**IMPORTANT — Lightweight packets:** When calling the MCP tool, send only metadata per packet (id, title, file_status, language, ai_summary, existing_comments). The MCP server reads full diff content from the JSON sidecar file.

**IMPORTANT — Inline comments:** Map the "Inline Review Comments" data above to packets by matching file paths and line ranges within each packet's diff hunks.

**IMPORTANT — Brevity:** Keep AI summaries concise (2-4 sentences). Let the diff speak for itself.

**Then begin the review by:**

1. Parsing the PR metadata — extract number, title, author, branches, change stats.
2. Reading the `===PACKET_INDEX_START===` block to understand all packets.
3. Extracting the `===REVIEW_DATA_FILE=...===` path for the JSON sidecar file.
4. Following the 4-phase protocol from `review-instructions.md`:
   - Phase 1: PR overview
   - Phase 2: Packet ordering (narrative flow)
   - Phase 3: Browser-based review (MCP tool with inline commenting, falls back to AskUserQuestion)
   - Phase 4: Summary & submit
