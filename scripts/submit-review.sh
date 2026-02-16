#!/usr/bin/env bash
# submit-review.sh — Submit a PR review via GitHub API
#
# Usage:
#   echo '{"event":"APPROVE","body":"...","comments":[...]}' | ./scripts/submit-review.sh <owner/repo> <pr-number>
#
# The review JSON payload is read from stdin.
# See https://docs.github.com/en/rest/pulls/reviews#create-a-review-for-a-pull-request

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: echo '<json>' | $0 <owner/repo> <pr-number>" >&2
  exit 1
fi

REPO="$1"
PR_NUMBER="$2"

gh api "repos/${REPO}/pulls/${PR_NUMBER}/reviews" --input -
