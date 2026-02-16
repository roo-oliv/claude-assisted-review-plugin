#!/usr/bin/env bash
set -euo pipefail

PR="${1:?Usage: $0 <PR-number-or-url>}"
PR_NUM="${PR##*/}"

gh api "repos/{owner}/{repo}/pulls/${PR_NUM}/comments" \
  --jq '[.[] | {id: (.id | tostring), author: .user.login, body: .body, path: .path, line: .line, side: .side, created_at: .created_at}]' \
  2>/dev/null || echo "[]"
