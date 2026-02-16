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

  return hunks;
}

/**
 * Read the JSON sidecar file and merge with Claude's lightweight metadata.
 * Returns merged packet array in Claude's presentation order.
 */
function mergePacketData(dataFile, claudePackets) {
  const raw = fs.readFileSync(dataFile, "utf-8");
  const fileData = JSON.parse(raw);

  // Index file packets by id for O(1) lookup
  const byId = new Map();
  for (const pkt of fileData.packets) {
    byId.set(pkt.id, pkt);
  }

  // Merge in Claude's presentation order
  const merged = [];
  for (const cp of claudePackets) {
    const fp = byId.get(cp.id);
    if (!fp) continue;

    const isSpecial = ["lock", "binary", "generated", "minified"].includes(fp.type);
    const hunks = isSpecial ? [] : parseDiffContent(fp.content);

    merged.push({
      id: fp.id,
      file: fp.file,
      part: fp.part,
      total_parts: fp.total_parts,
      type: fp.type,
      additions: fp.additions,
      deletions: fp.deletions,
      content: fp.content,
      hunks,
      // Claude's metadata
      title: cp.title || null,
      file_status: cp.file_status || null,
      language: cp.language || null,
      ai_summary: cp.ai_summary || null,
      existing_comments: cp.existing_comments || [],
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
