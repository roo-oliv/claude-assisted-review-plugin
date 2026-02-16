import fs from "node:fs";
import http from "node:http";
import { execSync } from "node:child_process";
import { generateHTML } from "./template.mjs";

/**
 * Parse raw diff content into structured hunks with line numbers.
 * Input: markdown-wrapped diff string (### header + ```diff ... ```)
 * Output: array of hunks, each with header and lines
 */
export function parseDiffContent(content) {
  const lines = content.split("\n");
  const hunks = [];
  let currentHunk = null;
  let oldLine = 0;
  let newLine = 0;
  let inDiff = false;

  for (const raw of lines) {
    // Skip markdown header lines
    if (raw.startsWith("### ")) continue;
    if (raw === "```diff") { inDiff = true; continue; }
    if (raw === "```") { inDiff = false; continue; }
    if (!inDiff) continue;

    // File headers
    if (raw.startsWith("--- ") || raw.startsWith("+++ ")) continue;

    // Hunk header
    if (raw.startsWith("@@")) {
      const oldMatch = raw.match(/@@ -(\d+)/);
      const newMatch = raw.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      oldLine = oldMatch ? parseInt(oldMatch[1]) - 1 : 0;
      newLine = newMatch ? parseInt(newMatch[1]) - 1 : 0;
      currentHunk = { header: raw, lines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (raw.startsWith("+")) {
      newLine++;
      currentHunk.lines.push({
        type: "add",
        oldNum: null,
        newNum: newLine,
        content: raw.slice(1),
      });
    } else if (raw.startsWith("-")) {
      oldLine++;
      currentHunk.lines.push({
        type: "del",
        oldNum: oldLine,
        newNum: null,
        content: raw.slice(1),
      });
    } else {
      oldLine++;
      newLine++;
      currentHunk.lines.push({
        type: "context",
        oldNum: oldLine,
        newNum: newLine,
        content: raw.startsWith(" ") ? raw.slice(1) : raw,
      });
    }
  }

  markWhitespaceOnlyChanges(hunks);
  return hunks;
}

/**
 * Mark whitespace-only change blocks within hunks.
 * Finds contiguous del lines immediately followed by contiguous add lines
 * of equal count. If every pair matches after stripping all whitespace,
 * sets wsOnly: true on every line in the block.
 */
function markWhitespaceOnlyChanges(hunks) {
  for (const hunk of hunks) {
    const lines = hunk.lines;
    let i = 0;
    while (i < lines.length) {
      // Find a block of contiguous del lines
      if (lines[i].type !== "del") { i++; continue; }
      const delStart = i;
      while (i < lines.length && lines[i].type === "del") i++;
      const delEnd = i;

      // Must be immediately followed by add lines
      if (i >= lines.length || lines[i].type !== "add") continue;
      const addStart = i;
      while (i < lines.length && lines[i].type === "add") i++;
      const addEnd = i;

      const delCount = delEnd - delStart;
      const addCount = addEnd - addStart;
      if (delCount !== addCount) continue;

      // Compare each pair after stripping all whitespace
      let allMatch = true;
      for (let j = 0; j < delCount; j++) {
        const delStripped = lines[delStart + j].content.replace(/\s/g, "");
        const addStripped = lines[addStart + j].content.replace(/\s/g, "");
        if (delStripped !== addStripped) { allMatch = false; break; }
      }

      if (allMatch) {
        for (let j = delStart; j < addEnd; j++) {
          lines[j].wsOnly = true;
        }
      }
    }
  }
}

/**
 * Slice hunks to only include lines within [startLine, endLine].
 * Uses newNum for side="RIGHT" (default), oldNum for side="LEFT".
 * Includes context lines adjacent to matching changed lines (up to 3 lines).
 * Handles paired del/add lines: if a + line is in range, its paired - is included too.
 *
 * Returns a new array of hunks containing only the relevant lines.
 */
function sliceHunksByLineRange(hunks, startLine, endLine, side) {
  const useOld = side === "LEFT";
  const result = [];

  for (const hunk of hunks) {
    const lines = hunk.lines;

    // First pass: mark which lines are "in range" (changed lines matching the range)
    const inRange = new Array(lines.length).fill(false);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.type === "context") continue;

      const num = useOld ? line.oldNum : line.newNum;
      if (num !== null && num >= startLine && num <= endLine) {
        inRange[i] = true;
      }
    }

    // Handle paired del/add lines: if one side is in range, include the other
    let i = 0;
    while (i < lines.length) {
      if (lines[i].type !== "del") { i++; continue; }
      const delStart = i;
      while (i < lines.length && lines[i].type === "del") i++;
      const delEnd = i;
      if (i >= lines.length || lines[i].type !== "add") continue;
      const addStart = i;
      while (i < lines.length && lines[i].type === "add") i++;
      const addEnd = i;

      // If any line in the del or add block is in range, include all of them
      let anyInRange = false;
      for (let j = delStart; j < addEnd; j++) {
        if (inRange[j]) { anyInRange = true; break; }
      }
      if (anyInRange) {
        for (let j = delStart; j < addEnd; j++) inRange[j] = true;
      }
    }

    // Second pass: expand with up to 3 lines of context padding
    const included = new Array(lines.length).fill(false);
    for (let idx = 0; idx < lines.length; idx++) {
      if (!inRange[idx]) continue;
      included[idx] = true;
      // Context before
      for (let b = 1; b <= 3; b++) {
        const bi = idx - b;
        if (bi >= 0 && lines[bi].type === "context") included[bi] = true;
        else break;
      }
      // Context after
      for (let a = 1; a <= 3; a++) {
        const ai = idx + a;
        if (ai < lines.length && lines[ai].type === "context") included[ai] = true;
        else break;
      }
    }

    // Build output hunk from included lines (may split into sub-hunks on gaps)
    let slicedLines = [];
    let prevIncluded = false;
    for (let idx = 0; idx < lines.length; idx++) {
      if (included[idx]) {
        // If there's a gap (non-included lines between included), start a new hunk
        if (!prevIncluded && slicedLines.length > 0) {
          // Flush current sub-hunk
          const subHeader = buildHunkHeader(slicedLines);
          result.push({ header: subHeader, lines: slicedLines });
          slicedLines = [];
        }
        slicedLines.push(lines[idx]);
        prevIncluded = true;
      } else {
        prevIncluded = false;
      }
    }

    if (slicedLines.length > 0) {
      const subHeader = buildHunkHeader(slicedLines);
      result.push({ header: subHeader, lines: slicedLines });
    }
  }

  return result;
}

/**
 * Build a synthetic @@ header from a set of lines.
 */
function buildHunkHeader(lines) {
  if (lines.length === 0) return "@@ -0,0 +0,0 @@";

  let oldStart = null, oldCount = 0;
  let newStart = null, newCount = 0;

  for (const line of lines) {
    if (line.oldNum !== null) {
      if (oldStart === null) oldStart = line.oldNum;
      oldCount++;
    }
    if (line.newNum !== null) {
      if (newStart === null) newStart = line.newNum;
      newCount++;
    }
  }

  return `@@ -${oldStart || 0},${oldCount} +${newStart || 0},${newCount} @@`;
}

/**
 * Read the JSON sidecar file and merge with Claude's annotation-based packets.
 * Each Claude packet references a file_id + line range. The MCP server slices
 * the file's parsed diff to extract per-packet hunks.
 * Returns merged packet array in Claude's presentation order.
 */
function mergePacketData(dataFile, claudePackets) {
  const raw = fs.readFileSync(dataFile, "utf-8");
  const sidecar = JSON.parse(raw);

  // Index files by id
  const filesById = new Map();
  for (const file of sidecar.files) {
    filesById.set(file.id, file);
  }

  // Parse each file's diff into hunks (cached per file)
  const hunksCache = new Map();
  function getFileHunks(fileId) {
    if (hunksCache.has(fileId)) return hunksCache.get(fileId);
    const file = filesById.get(fileId);
    if (!file) return [];
    const isSpecial = ["lock", "binary", "generated", "minified"].includes(file.type);
    const hunks = isSpecial ? [] : parseDiffContent(file.content);
    hunksCache.set(fileId, hunks);
    return hunks;
  }

  // Track which changed lines are covered, per file
  const coveredLines = new Map(); // fileId -> Set of "side:lineNum"

  // Count packets per file for part/total_parts
  const packetsPerFile = new Map();
  for (const cp of claudePackets) {
    const fid = cp.file_id;
    packetsPerFile.set(fid, (packetsPerFile.get(fid) || 0) + 1);
  }

  // Track current part number per file
  const partCounter = new Map();

  const merged = [];
  for (const cp of claudePackets) {
    const file = filesById.get(cp.file_id);
    if (!file) continue;

    const isSpecial = ["lock", "binary", "generated", "minified"].includes(file.type);
    const isRenamedOnly = file.status === "renamed" && file.additions === 0 && file.deletions === 0;
    const side = cp.side || "RIGHT";

    let hunks = [];
    let additions = 0;
    let deletions = 0;

    if (isSpecial || isRenamedOnly) {
      additions = file.additions;
      deletions = file.deletions;
    } else {
      const fileHunks = getFileHunks(cp.file_id);
      hunks = sliceHunksByLineRange(fileHunks, cp.start_line, cp.end_line, side);

      // Compute additions/deletions from sliced hunks
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          if (line.type === "add") additions++;
          else if (line.type === "del") deletions++;
        }
      }

      // Mark covered lines
      if (!coveredLines.has(cp.file_id)) coveredLines.set(cp.file_id, new Set());
      const covered = coveredLines.get(cp.file_id);
      for (const hunk of hunks) {
        for (const line of hunk.lines) {
          if (line.type === "add" && line.newNum !== null) covered.add(`RIGHT:${line.newNum}`);
          if (line.type === "del" && line.oldNum !== null) covered.add(`LEFT:${line.oldNum}`);
        }
      }
    }

    const partNum = (partCounter.get(cp.file_id) || 0) + 1;
    partCounter.set(cp.file_id, partNum);
    const totalParts = packetsPerFile.get(cp.file_id) || 1;

    // Determine file_status → type mapping
    let type = "normal";
    if (isSpecial) {
      type = file.type;
    } else if (file.status === "added") {
      type = "new";
    } else if (file.status === "deleted") {
      type = "deleted";
    } else if (isRenamedOnly) {
      type = "renamed";
    }

    // Build content string for display
    let content = file.content;
    if (!isSpecial && !isRenamedOnly && totalParts > 1) {
      // Rebuild a content header for the slice
      if (type === "new") {
        content = `### \`${file.file}\` (${partNum}/${totalParts}, new file, +${additions})`;
      } else if (type === "deleted") {
        content = `### \`${file.file}\` (${partNum}/${totalParts}, deleted, -${deletions})`;
      } else {
        content = `### \`${file.file}\` (${partNum}/${totalParts}, +${additions} -${deletions})`;
      }
    }

    merged.push({
      id: cp.id,
      file: file.file,
      part: `${partNum}/${totalParts}`,
      total_parts: totalParts,
      type,
      additions,
      deletions,
      content,
      is_imports: false,
      hunks,
      // Claude's metadata
      title: cp.title || null,
      file_status: cp.file_status || null,
      language: cp.language || null,
      ai_summary: cp.ai_summary || null,
      existing_comments: cp.existing_comments || [],
    });
  }

  // === Safety net: catch uncovered changed lines ===
  let nextId = merged.length > 0 ? Math.max(...merged.map(p => p.id)) + 1 : 1;

  for (const file of sidecar.files) {
    const isSpecial = ["lock", "binary", "generated", "minified"].includes(file.type);
    const isRenamedOnly = file.status === "renamed" && file.additions === 0 && file.deletions === 0;
    if (isSpecial || isRenamedOnly) continue;

    const fileHunks = getFileHunks(file.id);
    const covered = coveredLines.get(file.id) || new Set();

    // Find uncovered changed lines
    const uncovered = [];
    for (const hunk of fileHunks) {
      for (const line of hunk.lines) {
        if (line.type === "add" && line.newNum !== null && !covered.has(`RIGHT:${line.newNum}`)) {
          uncovered.push(line);
        }
        if (line.type === "del" && line.oldNum !== null && !covered.has(`LEFT:${line.oldNum}`)) {
          uncovered.push(line);
        }
      }
    }

    if (uncovered.length === 0) continue;

    // Find the bounding range for uncovered lines (use RIGHT for adds, LEFT for dels)
    let minNew = Infinity, maxNew = -Infinity;
    let minOld = Infinity, maxOld = -Infinity;
    let uncoveredAdds = 0, uncoveredDels = 0;

    for (const line of uncovered) {
      if (line.type === "add") {
        uncoveredAdds++;
        if (line.newNum < minNew) minNew = line.newNum;
        if (line.newNum > maxNew) maxNew = line.newNum;
      }
      if (line.type === "del") {
        uncoveredDels++;
        if (line.oldNum < minOld) minOld = line.oldNum;
        if (line.oldNum > maxOld) maxOld = line.oldNum;
      }
    }

    // Use RIGHT side range if there are adds, otherwise LEFT
    const side = uncoveredAdds > 0 ? "RIGHT" : "LEFT";
    const start = side === "RIGHT" ? minNew : minOld;
    const end = side === "RIGHT" ? maxNew : maxOld;

    const hunks = sliceHunksByLineRange(fileHunks, start, end, side);

    // Update part counts for this file
    const existingCount = packetsPerFile.get(file.id) || 0;
    const newTotal = existingCount + 1;
    // Update total_parts on existing packets for this file
    for (const p of merged) {
      if (p.file === file.file) {
        const [partStr] = p.part.split("/");
        p.part = `${partStr}/${newTotal}`;
        p.total_parts = newTotal;
      }
    }

    merged.push({
      id: nextId++,
      file: file.file,
      part: `${newTotal}/${newTotal}`,
      total_parts: newTotal,
      type: file.status === "added" ? "new" : file.status === "deleted" ? "deleted" : "normal",
      additions: uncoveredAdds,
      deletions: uncoveredDels,
      content: `### \`${file.file}\` (remaining changes, +${uncoveredAdds} -${uncoveredDels})`,
      is_imports: false,
      hunks,
      title: `Remaining changes in ${file.file}`,
      file_status: file.status,
      language: null,
      ai_summary: "Changes not covered by other annotations.",
      existing_comments: [],
    });
  }

  return merged;
}

export function handleReviewPackets(params) {
  return new Promise((resolve) => {
    let mergedPackets;
    let dataFile = params.data_file;

    try {
      mergedPackets = mergePacketData(dataFile, params.packets);
    } catch (err) {
      resolve({
        status: "error",
        error: `Failed to read data file: ${err.message}`,
        action: null,
        body: null,
        comments: [],
      });
      return;
    }

    const templateData = {
      pr_number: params.pr_number,
      pr_title: params.pr_title,
      pr_url: params.pr_url,
      pr_author: params.pr_author,
      base_branch: params.base_branch,
      head_branch: params.head_branch,
      packets: mergedPackets,
    };

    const html = generateHTML(templateData);
    let settled = false;

    const httpServer = http.createServer((req, res) => {
      if (req.method === "GET" && req.url === "/") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (req.method === "GET" && req.url === "/api/data") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        });
        res.end(JSON.stringify(templateData));
        return;
      }

      if (req.method === "POST" && req.url === "/api/submit") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          });
          res.end(JSON.stringify({ ok: true }));

          if (!settled) {
            settled = true;
            clearTimeout(timer);
            httpServer.close();
            cleanup();
            try {
              const payload = JSON.parse(body);
              resolve({
                status: "completed",
                action: payload.action || null,
                body: payload.body || null,
                comments: payload.comments || [],
              });
            } catch {
              resolve({
                status: "error",
                error: "Invalid JSON from browser",
                action: null,
                body: null,
                comments: [],
              });
            }
          }
        });
        return;
      }

      // CORS preflight
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(0, "127.0.0.1", () => {
      const port = httpServer.address().port;
      const url = `http://127.0.0.1:${port}`;
      process.stderr.write(`[review-ui] Browser review at ${url}\n`);
      try {
        execSync(`open "${url}"`);
      } catch {
        process.stderr.write(`[review-ui] Could not open browser. Navigate to ${url} manually.\n`);
      }
    });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        httpServer.close();
        cleanup();
        resolve({
          status: "timeout",
          action: null,
          body: null,
          comments: [],
        });
      }
    }, (params.timeout_seconds || 1800) * 1000);

    function cleanup() {
      try {
        if (dataFile && fs.existsSync(dataFile)) {
          fs.unlinkSync(dataFile);
        }
      } catch {
        // ignore cleanup errors
      }
    }
  });
}
