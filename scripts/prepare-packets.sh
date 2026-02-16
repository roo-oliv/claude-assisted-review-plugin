#!/usr/bin/env bash
# prepare-packets.sh — Preprocess a PR diff into per-file entries
#
# Usage:
#   bash scripts/prepare-packets.sh <PR-number-or-url>
#
# Output: file index + pre-formatted per-file blocks to stdout
# Also writes a JSON sidecar file with full per-file data for the MCP server.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <PR-number-or-url>" >&2
  exit 1
fi

PR="$1"

# Extract numeric PR number (strip URL prefix if given)
PR_NUM="${PR##*/}"

# Get the full unified diff
DIFF=$(gh pr diff "$PR" 2>&1) || {
  echo "Error: Failed to get diff for PR $PR" >&2
  echo "$DIFF" >&2
  exit 1
}

if [[ -z "$DIFF" ]]; then
  echo "===FILE_INDEX_START==="
  echo "TOTAL_FILES=0"
  echo "===FILE_INDEX_END==="
  exit 0
fi

# Generate temp file path for JSON sidecar
DATA_FILE="/tmp/review-files-${PR_NUM}-$(date +%s).json"

# Process the diff with awk (POSIX-compatible — no gawk extensions)
# Classifies files, produces per-file index + formatted output
echo "$DIFF" | awk -v data_file="$DATA_FILE" '
BEGIN {
  file_count = 0
  current_file = ""

  # Lock file basenames
  nlock = split("package-lock.json yarn.lock pnpm-lock.yaml Gemfile.lock Pipfile.lock go.sum Cargo.lock composer.lock poetry.lock", _ln, " ")
  for (_i = 1; _i <= nlock; _i++) lock_files[_ln[_i]] = 1
}

# --- New file diff header ---
/^diff --git / {
  flush_file()

  file_count++

  # Extract b/... path — everything after " b/"
  _line = $0
  _pos = index(_line, " b/")
  current_file = substr(_line, _pos + 3)

  current_type = "normal"
  file_add = 0; file_del = 0
  is_new_file = 0; is_deleted_file = 0
  is_rename = 0; rename_from = ""; rename_to = ""
  is_binary = 0; has_diff_content = 0
  file_header_minus = ""; file_header_plus = ""
  raw_diff = ""
  in_header = 1

  # Basename
  _n = split(current_file, _pp, "/")
  _base = _pp[_n]
  if (_base in lock_files) current_type = "lock"
  if (_base ~ /\.min\.(js|css|mjs)$/) current_type = "minified"
  if (current_file ~ /(^|\/)generated\//) current_type = "generated"
  if (current_file ~ /(^|\/)__generated__\//) current_type = "generated"
  next
}

# --- Extra header lines ---
in_header && /^(index |old mode |new mode |similarity |rename |copy )/ {
  if (/^rename from /) { is_rename = 1; rename_from = substr($0, 13) }
  if (/^rename to /)   { rename_to = substr($0, 11) }
  next
}

# --- File headers ---
/^--- / { in_header = 0; file_header_minus = $0; if ($0 == "--- /dev/null") is_new_file = 1; next }
/^\+\+\+ / { file_header_plus = $0; if ($0 == "+++ /dev/null") is_deleted_file = 1; next }

# --- Binary ---
/^Binary files .* differ$/ { current_type = "binary"; is_binary = 1; in_header = 0; next }

# --- Hunk header and diff content lines ---
/^@@ / {
  in_header = 0; has_diff_content = 1
  raw_diff = raw_diff $0 "\n"
  next
}

!in_header && current_file != "" {
  if (/^\+/)      { file_add++ }
  else if (/^-/)  { file_del++ }
  raw_diff = raw_diff $0 "\n"
  next
}

# ===== Functions =====

function json_escape(s,    _out, _len, _i, _c) {
  _out = ""
  _len = length(s)
  for (_i = 1; _i <= _len; _i++) {
    _c = substr(s, _i, 1)
    if (_c == "\\") _out = _out "\\\\"
    else if (_c == "\"") _out = _out "\\\""
    else if (_c == "\n") _out = _out "\\n"
    else if (_c == "\r") _out = _out "\\r"
    else if (_c == "\t") _out = _out "\\t"
    else _out = _out _c
  }
  return _out
}

function is_import_line(line,    _trimmed) {
  # Strip leading whitespace
  _trimmed = line
  gsub(/^[ \t]+/, "", _trimmed)
  # JS/TS: import, export...from, } from, require(
  if (_trimmed ~ /^import[ ({]/) return 1
  if (_trimmed ~ /^import "/) return 1
  if (_trimmed ~ /^import \047/) return 1
  if (_trimmed ~ /^export .* from /) return 1
  if (_trimmed ~ /^\} from /) return 1
  if (_trimmed ~ /require\(/) return 1
  # Python
  if (_trimmed ~ /^import /) return 1
  if (_trimmed ~ /^from .* import/) return 1
  # C/C++
  if (_trimmed ~ /^#include/) return 1
  # Rust
  if (_trimmed ~ /^use /) return 1
  # Go
  if (_trimmed ~ /^import$/ || _trimmed ~ /^import \(/ || _trimmed ~ /^import "/) return 1
  # C#/Java
  if (_trimmed ~ /^using /) return 1
  return 0
}

function flush_file(    _status) {
  if (current_file == "") return

  _status = "modified"
  if (is_new_file) _status = "added"
  else if (is_deleted_file) _status = "deleted"
  else if (is_rename) _status = "renamed"

  # Store file data
  fdata_file[file_count] = current_file
  fdata_type[file_count] = current_type
  fdata_status[file_count] = _status
  fdata_add[file_count] = file_add
  fdata_del[file_count] = file_del
  fdata_rename_from[file_count] = (is_rename ? rename_from : "")

  # Build content string
  if (current_type == "lock") {
    fdata_content[file_count] = "### `" current_file "` (lock file, +" file_add " -" file_del ")\nDependency lock file updated."
  } else if (current_type == "binary") {
    fdata_content[file_count] = "### `" current_file "` (binary file)\nBinary file changed. Cannot display diff."
  } else if (current_type == "generated") {
    fdata_content[file_count] = "### `" current_file "` (generated, +" file_add " -" file_del ")\nGenerated file. Review the source that generates it instead."
  } else if (current_type == "minified") {
    fdata_content[file_count] = "### `" current_file "` (minified, +" file_add " -" file_del ")\nMinified file updated. Review the source files instead."
  } else if (is_rename && file_add == 0 && file_del == 0) {
    fdata_content[file_count] = "### `" rename_to "` (renamed)\nRenamed from `" rename_from "`. No content changes."
  } else {
    # Normal file with diff content
    _header = ""
    if (_status == "added") {
      _header = "### `" current_file "` (new file, +" file_add ")\n\n"
    } else if (_status == "deleted") {
      _header = "### `" current_file "` (deleted, -" file_del ")\n\n"
    } else if (is_rename) {
      _header = "### `" current_file "` (renamed from `" rename_from "`, +" file_add " -" file_del ")\n\n"
    } else {
      _header = "### `" current_file "` (+" file_add " -" file_del ")\n\n"
    }

    _dc = raw_diff
    sub(/\n$/, "", _dc)
    fdata_content[file_count] = _header "```diff\n" file_header_minus "\n" file_header_plus "\n" _dc "\n```"
  }

  current_file = ""
}

END {
  flush_file()

  # === Section 1: File Index ===
  print "===FILE_INDEX_START==="
  for (_f = 1; _f <= file_count; _f++) {
    printf "FILE id=%d file=%s add=%d del=%d type=%s status=%s\n", \
      _f, fdata_file[_f], fdata_add[_f], fdata_del[_f], fdata_type[_f], fdata_status[_f]
  }
  printf "TOTAL_FILES=%d\n", file_count
  print "===FILE_INDEX_END==="
  print ""

  # === Section 2: Pre-formatted File Blocks ===
  for (_f = 1; _f <= file_count; _f++) {
    printf "===FILE id=%d===\n", _f
    print fdata_content[_f]
    print "===END==="
    print ""
  }

  # === Section 3: JSON sidecar file ===
  if (data_file != "" && file_count > 0) {
    printf "{\"files\":[" > data_file
    for (_f = 1; _f <= file_count; _f++) {
      if (_f > 1) printf "," > data_file

      _ren = "null"
      if (fdata_rename_from[_f] != "") _ren = "\"" json_escape(fdata_rename_from[_f]) "\""

      printf "{\"id\":%d,\"file\":\"%s\",\"type\":\"%s\",\"status\":\"%s\",\"additions\":%d,\"deletions\":%d,\"rename_from\":%s,\"content\":\"%s\"}", \
        _f, json_escape(fdata_file[_f]), json_escape(fdata_type[_f]), json_escape(fdata_status[_f]), \
        fdata_add[_f], fdata_del[_f], _ren, json_escape(fdata_content[_f]) > data_file
    }
    printf "]}\n" > data_file
    close(data_file)
    print "===REVIEW_DATA_FILE=" data_file "==="
  }
}
'
