#!/usr/bin/env bash
# prepare-packets.sh — Split a PR diff into review packets
#
# Usage:
#   bash scripts/prepare-packets.sh <PR-number-or-url>
#
# Output: packet index + pre-formatted packet blocks to stdout

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
  echo "===PACKET_INDEX_START==="
  echo "TOTAL_PACKETS=0 TOTAL_FILES=0"
  echo "===PACKET_INDEX_END==="
  exit 0
fi

# Generate temp file path for JSON sidecar
DATA_FILE="/tmp/review-packets-${PR_NUM}-$(date +%s).json"

# Process the diff with awk (POSIX-compatible — no gawk extensions)
# Classifies files, splits into ~10-line packets, produces index + formatted output
echo "$DIFF" | awk -v data_file="$DATA_FILE" '
BEGIN {
  packet_id = 0
  file_count = 0
  current_file = ""
  TARGET = 10
  MAX_HUNK = 20

  # Lock file basenames
  nlock = split("package-lock.json yarn.lock pnpm-lock.yaml Gemfile.lock Pipfile.lock go.sum Cargo.lock composer.lock poetry.lock", _ln, " ")
  for (_i = 1; _i <= nlock; _i++) lock_files[_ln[_i]] = 1
}

# --- New file diff header ---
/^diff --git / {
  flush_packet()
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
  hunk_lines = ""; hunk_changed = 0; hunk_old_line = 0; hunk_new_line = 0
  packet_diff = ""; packet_changed = 0; packet_parts = 0
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

# --- Hunk header ---
/^@@ / {
  in_header = 0; has_diff_content = 1
  if (hunk_lines != "") maybe_flush_hunk()
  hunk_lines = $0 "\n"; hunk_changed = 0

  # Parse line numbers: @@ -old[,len] +new[,len] @@
  # Use index/substr for BSD awk compat
  _line = $0
  _mpos = index(_line, "-")
  _ppos = index(_line, "+")
  if (_mpos > 0 && _ppos > 0) {
    _oldseg = substr(_line, _mpos + 1, _ppos - _mpos - 2)
    _after_plus = substr(_line, _ppos + 1)
    _sp = index(_after_plus, " ")
    _newseg = (_sp > 0) ? substr(_after_plus, 1, _sp - 1) : _after_plus
    _oc = index(_oldseg, ",")
    hunk_old_line = (_oc > 0) ? int(substr(_oldseg, 1, _oc - 1)) : int(_oldseg)
    _nc = index(_newseg, ",")
    hunk_new_line = (_nc > 0) ? int(substr(_newseg, 1, _nc - 1)) : int(_newseg)
  }
  next
}

# --- Diff content lines ---
!in_header && current_file != "" {
  if (/^\+/)      { file_add++; hunk_changed++; hunk_lines = hunk_lines $0 "\n"; hunk_new_line++ }
  else if (/^-/)  { file_del++; hunk_changed++; hunk_lines = hunk_lines $0 "\n"; hunk_old_line++ }
  else            { hunk_lines = hunk_lines $0 "\n"; hunk_old_line++; hunk_new_line++ }

  # Mid-hunk split: if accumulated changes exceed TARGET, flush now
  if (hunk_changed >= TARGET) {
    maybe_flush_hunk()
    flush_packet()
    # Start continuation with synthetic hunk header
    hunk_lines = "@@ -" hunk_old_line ",0 +" hunk_new_line ",0 @@\n"
    hunk_changed = 0
  }
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

function maybe_flush_hunk() {
  if (packet_changed > 0 && (packet_changed + hunk_changed) > TARGET) flush_packet()
  if (packet_changed > 0 && hunk_changed > MAX_HUNK) flush_packet()
  packet_diff = packet_diff hunk_lines
  packet_changed += hunk_changed
  if (hunk_changed > MAX_HUNK) flush_packet()
  hunk_lines = ""; hunk_changed = 0
}

function flush_packet(    _p_add, _p_del, _nl, _pla, _j) {
  if (packet_diff == "" && packet_changed == 0) return
  if (current_type != "normal") return

  packet_parts++
  _p_add = 0; _p_del = 0
  _nl = split(packet_diff, _pla, "\n")
  for (_j = 1; _j <= _nl; _j++) {
    if (substr(_pla[_j], 1, 1) == "+") _p_add++
    else if (substr(_pla[_j], 1, 1) == "-") _p_del++
  }

  packet_id++
  pkt_file[packet_id] = current_file
  pkt_part[packet_id] = packet_parts
  pkt_add[packet_id] = _p_add
  pkt_del[packet_id] = _p_del
  pkt_type[packet_id] = current_type
  pkt_fhm[packet_id] = file_header_minus
  pkt_fhp[packet_id] = file_header_plus
  pkt_diff[packet_id] = packet_diff
  pkt_fidx[packet_id] = file_count

  packet_diff = ""; packet_changed = 0
}

function flush_file(    _p) {
  if (current_file == "") return
  if (hunk_lines != "") maybe_flush_hunk()

  if (current_type == "normal") {
    flush_packet()

    # Rename with no content changes
    if (is_rename && packet_parts == 0) {
      packet_id++
      pkt_file[packet_id] = current_file; pkt_part[packet_id] = 1
      pkt_add[packet_id] = 0; pkt_del[packet_id] = 0
      pkt_type[packet_id] = "renamed"
      pkt_ren_from[packet_id] = rename_from; pkt_ren_to[packet_id] = rename_to
      pkt_fidx[packet_id] = file_count; fpt[file_count] = 1
    }

    if (packet_parts > 0) fpt[file_count] = packet_parts

    # Tag new/deleted
    if (is_new_file) {
      for (_p = packet_id - packet_parts + 1; _p <= packet_id; _p++) pkt_type[_p] = "new"
    }
    if (is_deleted_file) {
      for (_p = packet_id - packet_parts + 1; _p <= packet_id; _p++) pkt_type[_p] = "deleted"
    }
  } else {
    # Special file — one summary packet
    packet_id++
    pkt_file[packet_id] = current_file; pkt_part[packet_id] = 1
    pkt_add[packet_id] = file_add; pkt_del[packet_id] = file_del
    pkt_type[packet_id] = current_type; pkt_fidx[packet_id] = file_count
    fpt[file_count] = 1
    if (is_rename) { pkt_ren_from[packet_id] = rename_from; pkt_ren_to[packet_id] = rename_to }
  }

  packet_parts = 0
  current_file = ""
}

END {
  flush_packet(); flush_file()

  # Resolve total parts per packet
  for (_p = 1; _p <= packet_id; _p++) {
    _fi = pkt_fidx[_p]
    pkt_tp[_p] = (_fi in fpt) ? fpt[_fi] : 1
  }

  # === Section 1: Packet Index ===
  print "===PACKET_INDEX_START==="
  for (_p = 1; _p <= packet_id; _p++) {
    printf "PACKET id=%d file=%s part=%d/%d add=%d del=%d type=%s\n", \
      _p, pkt_file[_p], pkt_part[_p], pkt_tp[_p], pkt_add[_p], pkt_del[_p], pkt_type[_p]
  }
  printf "TOTAL_PACKETS=%d TOTAL_FILES=%d\n", packet_id, file_count
  print "===PACKET_INDEX_END==="
  print ""

  # === Section 2: Pre-formatted Packets ===
  for (_p = 1; _p <= packet_id; _p++) {
    printf "===PACKET id=%d===\n", _p

    _t = pkt_type[_p]; _f = pkt_file[_p]
    _a = pkt_add[_p]; _d = pkt_del[_p]
    _total = pkt_tp[_p]; _part = pkt_part[_p]

    if (_t == "lock") {
      printf "### `%s` (lock file, +%d -%d)\n\n", _f, _a, _d
      print "Dependency lock file updated. Lock files typically don\047t need detailed review."
    } else if (_t == "binary") {
      printf "### `%s` (binary file)\n\n", _f
      print "Binary file changed. Cannot display diff."
    } else if (_t == "generated") {
      printf "### `%s` (generated, +%d -%d)\n\n", _f, _a, _d
      print "Generated file. Review the source that generates it instead."
    } else if (_t == "minified") {
      printf "### `%s` (minified, +%d -%d)\n\n", _f, _a, _d
      print "Minified file updated. Review the source files instead."
    } else if (_t == "renamed" && _a == 0 && _d == 0) {
      printf "### `%s` (renamed)\n\n", pkt_ren_to[_p]
      printf "Renamed from `%s`. No content changes.\n", pkt_ren_from[_p]
    } else {
      # Normal / new / deleted with diff content
      if (_total > 1) {
        printf "### `%s` (%d/%d, +%d -%d)\n\n", _f, _part, _total, _a, _d
      } else if (_t == "new") {
        printf "### `%s` (new file, +%d)\n\n", _f, _a
      } else if (_t == "deleted") {
        printf "### `%s` (deleted, -%d)\n\n", _f, _d
      } else {
        printf "### `%s` (+%d -%d)\n\n", _f, _a, _d
      }

      print "```diff"
      print pkt_fhm[_p]
      print pkt_fhp[_p]
      _dc = pkt_diff[_p]
      sub(/\n$/, "", _dc)
      print _dc
      print "```"
    }

    print "===END==="
    print ""
  }

  # === Section 3: JSON sidecar file ===
  if (data_file != "" && packet_id > 0) {
    printf "{\"packets\":[" > data_file
    for (_p = 1; _p <= packet_id; _p++) {
      if (_p > 1) printf "," > data_file

      _t = pkt_type[_p]; _f = pkt_file[_p]
      _a = pkt_add[_p]; _d = pkt_del[_p]
      _total = pkt_tp[_p]; _part = pkt_part[_p]

      # Build content string (same as stdout output)
      _content = ""
      if (_t == "lock") {
        _content = "### `" _f "` (lock file, +" _a " -" _d ")\n\nDependency lock file updated. Lock files typically don\047t need detailed review."
      } else if (_t == "binary") {
        _content = "### `" _f "` (binary file)\n\nBinary file changed. Cannot display diff."
      } else if (_t == "generated") {
        _content = "### `" _f "` (generated, +" _a " -" _d ")\n\nGenerated file. Review the source that generates it instead."
      } else if (_t == "minified") {
        _content = "### `" _f "` (minified, +" _a " -" _d ")\n\nMinified file updated. Review the source files instead."
      } else if (_t == "renamed" && _a == 0 && _d == 0) {
        _content = "### `" pkt_ren_to[_p] "` (renamed)\n\nRenamed from `" pkt_ren_from[_p] "`. No content changes."
      } else {
        if (_total > 1) {
          _content = "### `" _f "` (" _part "/" _total ", +" _a " -" _d ")\n\n"
        } else if (_t == "new") {
          _content = "### `" _f "` (new file, +" _a ")\n\n"
        } else if (_t == "deleted") {
          _content = "### `" _f "` (deleted, -" _d ")\n\n"
        } else {
          _content = "### `" _f "` (+" _a " -" _d ")\n\n"
        }
        _dc = pkt_diff[_p]
        sub(/\n$/, "", _dc)
        _content = _content "```diff\n" pkt_fhm[_p] "\n" pkt_fhp[_p] "\n" _dc "\n```"
      }

      printf "{\"id\":%d,\"file\":\"%s\",\"part\":\"%d/%d\",\"total_parts\":%d,\"type\":\"%s\",\"additions\":%d,\"deletions\":%d,\"content\":\"%s\"}", \
        _p, json_escape(_f), _part, _total, _total, json_escape(_t), _a, _d, json_escape(_content) > data_file
    }
    printf "]}\n" > data_file
    close(data_file)
    print "===REVIEW_DATA_FILE=" data_file "==="
  }
}
'
