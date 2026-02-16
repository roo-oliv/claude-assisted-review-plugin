---
name: review-pr
description: >
  AI-guided Pull Request code review. A preprocessing script classifies files and provides
  full per-file diffs. Claude walks each diff and creates annotation-based packets — meaningful
  code units with line ranges and semantic titles, ordered by narrative flow (logical lines of
  thought that cross file boundaries). The MCP server slices diffs by line range to produce
  rich browser-based review packets with inline commenting. The reviewer adds line-level
  comments and selects a verdict — fast, focused, minimal AI turns.
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

## Review Files

!`bash ./scripts/prepare-packets.sh $0`

---

## Instructions

You are conducting an AI-assisted code review. Your goal is to present this PR's changes in a browser-based review UI with inline commenting, letting the reviewer add line-level comments and select a verdict efficiently.

**Read the detailed review behavior guide now:**

Read the file `review-instructions.md` located in the same directory as this skill file. That file contains your complete 4-phase review protocol. Follow it precisely.

**IMPORTANT — Data file:** Look for the `===REVIEW_DATA_FILE=...===` line in the output above. Extract the file path — this is the JSON sidecar file. Pass it as `data_file` to the MCP tool. Do NOT copy file content into the tool call.

**IMPORTANT — Annotation-based packets:** When calling the MCP tool, send `file_id`, `start_line`, `end_line`, and `side` per packet. The MCP server reads per-file diffs from the sidecar and slices them by your line ranges to produce per-packet hunks.

**IMPORTANT — File index:** Read the `===FILE_INDEX_START===` block to understand all files and their types. Use the file IDs when creating annotations.

**IMPORTANT — Inline comments:** Map the "Inline Review Comments" data above to packets by matching file paths and line ranges within each annotation.

**IMPORTANT — Brevity:** Keep AI summaries concise (2-4 sentences). Let the diff speak for itself.

**Then begin the review by:**

1. Parsing the PR metadata — extract number, title, author, branches, change stats.
2. Reading the `===FILE_INDEX_START===` block to understand all files.
3. Extracting the `===REVIEW_DATA_FILE=...===` path for the JSON sidecar file.
4. Following the 4-phase protocol from `review-instructions.md`:
   - Phase 1: PR overview
   - Phase 2: Annotate & order (create annotation-based packets with line ranges)
   - Phase 3: Browser-based review (MCP tool with inline commenting, falls back to AskUserQuestion)
   - Phase 4: Summary & submit
