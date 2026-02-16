import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleReviewPackets } from "./review-tool.mjs";

const server = new McpServer({
  name: "review-ui",
  version: "2.0.0",
});

server.tool(
  "review_packets",
  "Opens a browser-based review UI with GitHub-style inline commenting. Reads full diff data from a sidecar JSON file (written by prepare-packets.sh). Claude sends only lightweight metadata (ordering, AI summaries, titles). The reviewer adds line-level comments and selects a verdict (approve/comment/request_changes). Returns structured review with exact line positions.",
  {
    pr_number: z.number(),
    pr_title: z.string(),
    pr_url: z.string(),
    pr_author: z.string(),
    base_branch: z.string(),
    head_branch: z.string(),
    data_file: z.string().describe("Path to JSON sidecar file from prepare-packets.sh"),
    packets: z.array(
      z.object({
        id: z.number().describe("Packet ID — matches id in the JSON sidecar file"),
        title: z.string().optional().describe("Short descriptive title for the packet"),
        file_status: z.string().optional().describe("added|modified|deleted|renamed"),
        language: z.string().optional().describe("Programming language (e.g. typescript, python)"),
        ai_summary: z.string().optional().describe("2-4 sentence AI analysis of the changes"),
        existing_comments: z.array(
          z.object({
            id: z.string(),
            author: z.string(),
            body: z.string(),
            line: z.number(),
            side: z.string(),
            created_at: z.string(),
          })
        ).optional().describe("Existing GitHub inline review comments mapped to this packet"),
      })
    ).describe("Lightweight packet metadata in presentation order — no content field"),
    timeout_seconds: z.number().optional().default(1800),
  },
  async (params) => {
    try {
      const result = await handleReviewPackets(params);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (err) {
      return {
        content: [
          { type: "text", text: JSON.stringify({ status: "error", error: err.message }) },
        ],
        isError: true,
      };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
