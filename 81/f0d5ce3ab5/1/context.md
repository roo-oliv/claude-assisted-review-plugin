# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: Settings Cog Menu with "Hide Whitespace" and "Collapse Imports"

## Context

The review UI currently has no settings/preferences menu. Two common code review annoyances — whitespace-only diffs cluttering the view and import sections distracting from logic changes — need dedicated toggles. GitHub offers similar features in its diff viewer. This plan adds a cog menu in the counter bar with two toggles, both enabled by default.

---

## 1. Whitespace-Only ...

