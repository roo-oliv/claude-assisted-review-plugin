export function generateHTML(params) {
  const { pr_number, pr_title, pr_url, pr_author, base_branch, head_branch, packets } = params;
  const totalAdditions = packets.reduce((s, p) => s + p.additions, 0);
  const totalDeletions = packets.reduce((s, p) => s + p.deletions, 0);
  const dataJSON = JSON.stringify(packets);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review PR #${pr_number}: ${esc(pr_title)}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --bg-secondary: #f6f8fa;
  --bg-tertiary: #eaeef2;
  --border: #d1d9e0;
  --border-light: #e8ebef;
  --accent: #0969da;
  --accent-hover: #0550ae;
  --accent-subtle: rgba(9,105,218,0.1);
  --green-bg: #dafbe1;
  --green-line: #ccffd8;
  --green-gutter: #aff5b4;
  --red-bg: #ffebe9;
  --red-line: #ffd7d5;
  --red-gutter: #ffcecb;
  --hunk-bg: #ddf4ff;
  --hunk-fg: #656d76;
  --badge-added: #1a7f37;
  --badge-deleted: #cf222e;
  --badge-modified: #9a6700;
  --badge-renamed: #8250df;
  --badge-special: #656d76;
  --btn-approve: #1a7f37;
  --btn-approve-hover: #116329;
  --btn-comment: #0969da;
  --btn-comment-hover: #0550ae;
  --btn-changes: #cf222e;
  --btn-changes-hover: #a40e26;
  --card-shadow: 0 1px 3px rgba(0,0,0,0.04);
  --gutter-fg: #656d76;
  --gutter-bg: #f6f8fa;
  --focus-ring: 0 0 0 3px rgba(9,105,218,0.3);
  --line-hover: rgba(9,105,218,0.04);
  --selection-bg: rgba(9,105,218,0.08);
  --comment-bg: #fff8c5;
  --comment-border: #d4a72c;
  --existing-comment-bg: #f6f8fa;
  --existing-comment-border: #d1d9e0;
  --ai-bg: #f0f0ff;
  --ai-border: #c8c8ff;
  --ai-badge: #6e40c9;
  --warning-bg: #fff8c5;
  --warning-border: #d4a72c;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --bg-secondary: #161b22;
    --bg-tertiary: #1c2128;
    --border: #30363d;
    --border-light: #21262d;
    --accent: #58a6ff;
    --accent-hover: #79c0ff;
    --accent-subtle: rgba(88,166,255,0.1);
    --green-bg: #12261e;
    --green-line: #122d1a;
    --green-gutter: #196c2e;
    --red-bg: #2d1214;
    --red-line: #3c1618;
    --red-gutter: #8e1519;
    --hunk-bg: #121d2f;
    --hunk-fg: #8b949e;
    --badge-added: #3fb950;
    --badge-deleted: #f85149;
    --badge-modified: #d29922;
    --badge-renamed: #bc8cff;
    --badge-special: #8b949e;
    --btn-approve: #238636;
    --btn-approve-hover: #2ea043;
    --btn-comment: #1f6feb;
    --btn-comment-hover: #388bfd;
    --btn-changes: #da3633;
    --btn-changes-hover: #f85149;
    --card-shadow: 0 1px 3px rgba(0,0,0,0.3);
    --gutter-fg: #484f58;
    --gutter-bg: #161b22;
    --line-hover: rgba(88,166,255,0.04);
    --selection-bg: rgba(88,166,255,0.08);
    --comment-bg: #2d2200;
    --comment-border: #664d00;
    --existing-comment-bg: #161b22;
    --existing-comment-border: #30363d;
    --ai-bg: #1a1530;
    --ai-border: #3b2d6e;
    --ai-badge: #bc8cff;
    --warning-bg: #2d2200;
    --warning-border: #664d00;
  }
}

html { font-size: 14px; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.5;
}

/* ===== Header ===== */
.header {
  position: sticky; top: 0; z-index: 100;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 12px 24px;
}
.header-top { display: flex; align-items: center; gap: 10px; }
.header-icon { flex-shrink: 0; color: var(--accent); }
.header-title { font-size: 1.25rem; font-weight: 600; }
.header-title a { color: var(--accent); text-decoration: none; }
.header-title a:hover { text-decoration: underline; }
.header-meta {
  font-size: 0.85rem; color: var(--gutter-fg); margin-top: 2px;
}
.stat-add { color: var(--badge-added); font-weight: 600; }
.stat-del { color: var(--badge-deleted); font-weight: 600; }

/* ===== Counter bar ===== */
.counter-bar {
  position: sticky; z-index: 99;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  padding: 6px 24px;
  display: flex; align-items: center; gap: 16px;
  font-size: 0.85rem; color: var(--gutter-fg);
  flex-wrap: wrap;
}
.counter-bar strong { color: var(--fg); }
.counter-bar a {
  color: var(--accent); text-decoration: none; cursor: pointer; white-space: nowrap;
}
.counter-bar a:hover { text-decoration: underline; }

/* ===== Packet cards ===== */
.packets { max-width: 1020px; margin: 0 auto; padding: 16px 24px 200px; }

.packet {
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: var(--card-shadow);
  background: var(--bg);
  overflow: clip;
}

.packet-header {
  position: sticky; z-index: 10;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.85rem;
  flex-wrap: wrap;
}
.packet-file-icon { flex-shrink: 0; color: var(--gutter-fg); }
.packet-file { font-weight: 600; word-break: break-all; }
.packet-part { color: var(--gutter-fg); }
.packet-title {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  color: var(--gutter-fg);
  font-style: italic;
  font-weight: 400;
}

.badge {
  display: inline-block; padding: 1px 6px; border-radius: 10px;
  font-size: 0.65rem; font-weight: 600; text-transform: uppercase;
  color: #fff; white-space: nowrap;
}
.badge-added { background: var(--badge-added); }
.badge-deleted { background: var(--badge-deleted); }
.badge-modified { background: var(--badge-modified); }
.badge-renamed { background: var(--badge-renamed); }
.badge-lock, .badge-generated, .badge-minified, .badge-binary {
  background: var(--badge-special);
}

.packet-stats {
  margin-left: auto; font-size: 0.8rem; white-space: nowrap;
}
.packet-stats .add { color: var(--badge-added); }
.packet-stats .del { color: var(--badge-deleted); }

/* ===== Diff table ===== */
.diff-table {
  width: 100%; border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
  font-size: 0.8rem; line-height: 1.45;
  table-layout: fixed;
}
.diff-table td {
  padding: 0 8px; vertical-align: top;
  white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;
}
.diff-table .gutter {
  width: 40px; min-width: 40px;
  white-space: nowrap;
  text-align: right; color: var(--gutter-fg);
  background: var(--gutter-bg);
  user-select: none; padding-right: 8px;
  cursor: pointer;
}
.diff-table .gutter:hover { background: var(--accent-subtle); }
.diff-table .code { width: calc(100% - 80px); }
.diff-table .gutter-col { width: 40px; }

.line-add { background: var(--green-bg); }
.line-add .gutter { background: var(--green-gutter); }
.line-add .code { background: var(--green-line); }
.line-del { background: var(--red-bg); }
.line-del .gutter { background: var(--red-gutter); }
.line-del .code { background: var(--red-line); }
.line-hunk { background: var(--hunk-bg); color: var(--hunk-fg); }
.line-hunk td { font-style: italic; cursor: default; }
.line-hunk .gutter { cursor: default; }

.line-selected td { background: var(--selection-bg) !important; }

.diff-summary {
  padding: 20px; text-align: center;
  color: var(--gutter-fg); font-style: italic;
}

/* ===== AI summary ===== */
.ai-summary {
  padding: 10px 12px; margin: 0;
  background: var(--ai-bg);
  border-top: 1px solid var(--ai-border);
  font-size: 0.85rem; line-height: 1.5;
  color: var(--fg);
}
.ai-badge {
  display: inline-block; padding: 1px 5px; border-radius: 4px;
  font-size: 0.65rem; font-weight: 700;
  color: var(--ai-badge); background: var(--ai-border);
  margin-right: 6px; vertical-align: middle;
}

/* ===== Inline comment form ===== */
.comment-form-row td {
  padding: 8px 12px !important;
  background: var(--comment-bg) !important;
  border-top: 1px solid var(--comment-border);
  border-bottom: 1px solid var(--comment-border);
}
.comment-form {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}
.comment-form-label {
  font-size: 0.8rem; color: var(--gutter-fg); margin-bottom: 6px;
}
.comment-form textarea {
  width: 100%; min-height: 70px; padding: 8px;
  border: 1px solid var(--border); border-radius: 6px;
  font-family: inherit; font-size: 0.85rem;
  background: var(--bg); color: var(--fg);
  resize: vertical;
}
.comment-form textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: var(--focus-ring);
}
.comment-form-actions {
  display: flex; gap: 8px; margin-top: 6px; justify-content: flex-end;
}
.comment-form-actions button {
  padding: 4px 12px; border-radius: 6px; font-size: 0.85rem;
  cursor: pointer; font-weight: 500; border: 1px solid var(--border);
  background: var(--bg); color: var(--fg);
}
.comment-form-actions .btn-save {
  background: var(--btn-comment); color: #fff; border-color: var(--btn-comment);
}
.comment-form-actions .btn-save:hover { background: var(--btn-comment-hover); }
.comment-form-actions .btn-cancel:hover { background: var(--bg-tertiary); }

/* ===== Saved inline comment ===== */
.saved-comment-row td {
  padding: 8px 12px !important;
  background: var(--comment-bg) !important;
  border-top: 1px solid var(--comment-border);
  border-bottom: 1px solid var(--comment-border);
}
.saved-comment {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 0.85rem;
}
.saved-comment-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  font-size: 0.75rem; color: var(--gutter-fg);
}
.saved-comment-body { white-space: pre-wrap; line-height: 1.5; }
.saved-comment-actions { display: flex; gap: 6px; margin-left: auto; }
.saved-comment-actions button {
  padding: 2px 8px; border: 1px solid var(--border);
  border-radius: 4px; font-size: 0.75rem;
  cursor: pointer; background: var(--bg); color: var(--fg);
}
.saved-comment-actions button:hover { background: var(--bg-tertiary); }

/* ===== Existing GitHub comment (inline) ===== */
.existing-comment-row td {
  padding: 8px 12px !important;
  background: var(--existing-comment-bg) !important;
  border-top: 1px solid var(--existing-comment-border);
  border-bottom: 1px solid var(--existing-comment-border);
}
.existing-comment {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 0.85rem;
}
.existing-comment-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;
  font-size: 0.75rem; color: var(--gutter-fg);
}
.existing-comment-author { font-weight: 600; color: var(--fg); }
.existing-comment-body { white-space: pre-wrap; line-height: 1.5; }

/* ===== Final review form ===== */
.review-form {
  max-width: 1020px; margin: 0 auto; padding: 0 24px 120px;
}
.review-form-card {
  border: 1px solid var(--border); border-radius: 8px;
  box-shadow: var(--card-shadow); background: var(--bg);
  overflow: hidden;
}
.review-form-header {
  padding: 12px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border);
  font-weight: 600; font-size: 1rem;
}
.review-form-body { padding: 16px; }
.review-form-body textarea {
  width: 100%; min-height: 100px; padding: 10px;
  border: 1px solid var(--border); border-radius: 6px;
  font-family: inherit; font-size: 0.9rem;
  background: var(--bg); color: var(--fg);
  resize: vertical;
}
.review-form-body textarea:focus {
  outline: none; border-color: var(--accent); box-shadow: var(--focus-ring);
}
.review-form-body textarea::placeholder { color: var(--gutter-fg); }

.pending-summary {
  margin-top: 12px; padding: 10px;
  background: var(--bg-secondary); border-radius: 6px;
  font-size: 0.85rem; color: var(--gutter-fg);
}
.pending-summary strong { color: var(--fg); }

.review-actions {
  display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end;
  flex-wrap: wrap;
}
.review-actions button {
  padding: 8px 20px; border: none; border-radius: 6px;
  font-size: 0.9rem; font-weight: 600; cursor: pointer;
  color: #fff; transition: background 0.15s;
}
.btn-approve { background: var(--btn-approve); }
.btn-approve:hover { background: var(--btn-approve-hover); }
.btn-review-comment { background: var(--btn-comment); }
.btn-review-comment:hover { background: var(--btn-comment-hover); }
.btn-request-changes { background: var(--btn-changes); }
.btn-request-changes:hover { background: var(--btn-changes-hover); }

.review-actions button:disabled { opacity: 0.5; cursor: not-allowed; }

.warning-banner {
  margin-top: 10px; padding: 8px 12px;
  background: var(--warning-bg); border: 1px solid var(--warning-border);
  border-radius: 6px; font-size: 0.85rem;
  display: none;
}

.submitted-banner {
  margin-top: 16px; padding: 16px; text-align: center;
  background: var(--bg-secondary); border-radius: 8px;
  font-size: 1rem; display: none;
}
.submitted-banner.show { display: block; }

/* ===== Keyboard hints ===== */
.kb-hints {
  font-size: 0.75rem; color: var(--gutter-fg);
  margin-left: auto; margin-right: 12px;
}
kbd {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.7rem; padding: 1px 5px;
  border: 1px solid var(--border); border-radius: 3px;
  background: var(--bg-secondary); color: var(--gutter-fg);
}
</style>
</head>
<body>

<div class="header">
  <div class="header-top">
    <svg class="header-icon" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
      <path d="M5.45 5.154A4.25 4.25 0 0 0 9.25 7.5h1.378a2.251 2.251 0 1 1 0 1.5H9.25A5.734 5.734 0 0 1 5 7.123v3.505a2.25 2.25 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.95-.218ZM4.25 13.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm8-9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5ZM4.25 4a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"/>
    </svg>
    <div class="header-title">
      <a href="${esc(pr_url)}" target="_blank">PR #${pr_number}</a>: ${esc(pr_title)}
    </div>
  </div>
  <div class="header-meta">
    by <strong>${esc(pr_author)}</strong> &middot;
    ${esc(head_branch)} &rarr; ${esc(base_branch)} &middot;
    <span class="stat-add">+${totalAdditions}</span>
    <span class="stat-del">-${totalDeletions}</span> &middot;
    ${packets.length} packets
  </div>
</div>

<div class="counter-bar" id="counterBar">
  <span id="commentCount"><strong>0</strong> comments</span>
  <span>&middot;</span>
  <span>${packets.length} packets</span>
  <span class="kb-hints">
    <kbd>j</kbd>/<kbd>k</kbd> navigate &nbsp;
    <kbd>Esc</kbd> close &nbsp;
    <kbd>Ctrl+Enter</kbd> save
  </span>
  <a id="scrollToReview">Finish review &darr;</a>
</div>

<div class="packets" id="packets"></div>

<div class="review-form" id="reviewForm">
  <div class="review-form-card">
    <div class="review-form-header">Finish your review</div>
    <div class="review-form-body">
      <textarea id="reviewBody" placeholder="Leave an overall comment on this pull request (optional)"></textarea>
      <div class="pending-summary" id="pendingSummary"></div>
      <div class="warning-banner" id="warningBanner"></div>
      <div class="review-actions" id="reviewActions">
        <button class="btn-review-comment" data-action="comment">Comment</button>
        <button class="btn-approve" data-action="approve">Approve</button>
        <button class="btn-request-changes" data-action="request_changes">Request changes</button>
      </div>
      <div class="submitted-banner" id="submittedBanner">Review submitted! You can close this tab.</div>
    </div>
  </div>
</div>

<script>
const PACKETS = ${dataJSON};

const state = {
  comments: [],
  nextId: 1,
};
let selection = null;
let openFormRow = null;

// ===== Helpers =====
function escHTML(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function timeAgo(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  return Math.floor(diff / 86400) + 'd ago';
}

const SPECIAL_TYPES = new Set(['lock', 'binary', 'generated', 'minified']);

function statusBadgeClass(pkt) {
  const s = pkt.file_status || pkt.type;
  if (s === 'added' || s === 'new') return 'badge-added';
  if (s === 'deleted') return 'badge-deleted';
  if (s === 'renamed') return 'badge-renamed';
  if (s === 'modified' || s === 'normal') return 'badge-modified';
  if (SPECIAL_TYPES.has(s)) return 'badge-' + s;
  return 'badge-modified';
}

function statusLabel(pkt) {
  const s = pkt.file_status || pkt.type;
  if (s === 'new') return 'Added';
  if (s === 'added') return 'Added';
  if (s === 'deleted') return 'Deleted';
  if (s === 'renamed') return 'Renamed';
  if (s === 'modified') return 'Modified';
  if (s === 'normal') return 'Modified';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ===== Render packets =====
function renderPackets() {
  const container = document.getElementById('packets');
  container.innerHTML = '';

  PACKETS.forEach((pkt, pktIdx) => {
    const el = document.createElement('div');
    el.className = 'packet';
    el.id = 'packet-' + pktIdx;
    el.dataset.packetId = pkt.id;

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'packet-header';
    hdr.innerHTML =
      '<svg class="packet-file-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>' +
      '<span class="packet-file">' + escHTML(pkt.file) + '</span>' +
      (pkt.part !== '1/1' ? ' <span class="packet-part">(' + escHTML(pkt.part) + ')</span>' : '') +
      ' <span class="badge ' + statusBadgeClass(pkt) + '">' + escHTML(statusLabel(pkt)) + '</span>' +
      (pkt.title ? ' <span class="packet-title">' + escHTML(pkt.title) + '</span>' : '') +
      '<span class="packet-stats">' +
        (pkt.additions > 0 ? '<span class="add">+' + pkt.additions + '</span> ' : '') +
        (pkt.deletions > 0 ? '<span class="del">-' + pkt.deletions + '</span>' : '') +
      '</span>';
    el.appendChild(hdr);

    // Diff content
    if (SPECIAL_TYPES.has(pkt.type)) {
      const summary = document.createElement('div');
      summary.className = 'diff-summary';
      summary.textContent = statusLabel(pkt) + ' file — review skipped';
      el.appendChild(summary);
    } else if (pkt.hunks && pkt.hunks.length > 0) {
      const table = document.createElement('table');
      table.className = 'diff-table';
      const colgroup = document.createElement('colgroup');
      colgroup.innerHTML = '<col class="gutter-col"><col class="gutter-col"><col>';
      table.appendChild(colgroup);
      const tbody = document.createElement('tbody');
      tbody.dataset.packetIdx = pktIdx;

      // Build map of existing comments by line for this packet
      const existingByLine = {};
      if (pkt.existing_comments) {
        for (const ec of pkt.existing_comments) {
          const key = ec.side + ':' + ec.line;
          if (!existingByLine[key]) existingByLine[key] = [];
          existingByLine[key].push(ec);
        }
      }

      for (const hunk of pkt.hunks) {
        // Hunk header row
        const hunkTr = document.createElement('tr');
        hunkTr.className = 'line-hunk';
        const hunkTd = document.createElement('td');
        hunkTd.colSpan = 3;
        hunkTd.textContent = hunk.header;
        hunkTr.appendChild(hunkTd);
        tbody.appendChild(hunkTr);

        for (const line of hunk.lines) {
          const tr = document.createElement('tr');
          const cls = line.type === 'add' ? 'line-add' : line.type === 'del' ? 'line-del' : '';
          if (cls) tr.className = cls;

          // Store line metadata for click handling
          tr.dataset.packetIdx = pktIdx;
          tr.dataset.lineType = line.type;
          tr.dataset.oldNum = line.oldNum || '';
          tr.dataset.newNum = line.newNum || '';
          tr.dataset.file = pkt.file;

          const g1 = document.createElement('td');
          g1.className = 'gutter';
          g1.textContent = line.oldNum || '';
          const g2 = document.createElement('td');
          g2.className = 'gutter';
          g2.textContent = line.newNum || '';
          const code = document.createElement('td');
          code.className = 'code';
          code.textContent = line.content;
          tr.appendChild(g1);
          tr.appendChild(g2);
          tr.appendChild(code);
          tbody.appendChild(tr);

          // Show existing GitHub comments after this line
          const side = line.type === 'del' ? 'LEFT' : 'RIGHT';
          const lineNum = line.type === 'del' ? line.oldNum : line.newNum;
          const key = side + ':' + lineNum;
          if (existingByLine[key]) {
            for (const ec of existingByLine[key]) {
              const ecTr = document.createElement('tr');
              ecTr.className = 'existing-comment-row';
              const ecTd = document.createElement('td');
              ecTd.colSpan = 3;
              ecTd.innerHTML =
                '<div class="existing-comment">' +
                  '<div class="existing-comment-header">' +
                    '<span class="existing-comment-author">' + escHTML(ec.author) + '</span>' +
                    '<span>' + escHTML(timeAgo(ec.created_at)) + '</span>' +
                  '</div>' +
                  '<div class="existing-comment-body">' + escHTML(ec.body) + '</div>' +
                '</div>';
              ecTr.appendChild(ecTd);
              tbody.appendChild(ecTr);
            }
            delete existingByLine[key];
          }
        }
      }

      // Show any remaining existing comments that didn't match diff lines
      const remaining = Object.values(existingByLine).flat();
      if (remaining.length > 0) {
        const sepTr = document.createElement('tr');
        sepTr.className = 'existing-comment-row';
        const sepTd = document.createElement('td');
        sepTd.colSpan = 3;
        sepTd.innerHTML = '<div style="font-size:0.8rem;color:var(--gutter-fg);font-style:italic;padding:4px 0;">Comments on lines outside this view:</div>';
        sepTr.appendChild(sepTd);
        tbody.appendChild(sepTr);
        for (const ec of remaining) {
          const ecTr = document.createElement('tr');
          ecTr.className = 'existing-comment-row';
          const ecTd = document.createElement('td');
          ecTd.colSpan = 3;
          ecTd.innerHTML =
            '<div class="existing-comment">' +
              '<div class="existing-comment-header">' +
                '<span class="existing-comment-author">' + escHTML(ec.author) + '</span>' +
                '<span>line ' + ec.line + ' (' + ec.side + ')</span>' +
                '<span>' + escHTML(timeAgo(ec.created_at)) + '</span>' +
              '</div>' +
              '<div class="existing-comment-body">' + escHTML(ec.body) + '</div>' +
            '</div>';
          ecTr.appendChild(ecTd);
          tbody.appendChild(ecTr);
        }
      }

      table.appendChild(tbody);
      el.appendChild(table);
    } else {
      const summary = document.createElement('div');
      summary.className = 'diff-summary';
      summary.textContent = 'No diff lines to display';
      el.appendChild(summary);
    }

    // AI summary
    if (pkt.ai_summary) {
      const aiDiv = document.createElement('div');
      aiDiv.className = 'ai-summary';
      aiDiv.innerHTML = '<span class="ai-badge">AI</span>' + escHTML(pkt.ai_summary);
      el.appendChild(aiDiv);
    }

    container.appendChild(el);
  });
}

// ===== Inline comment handling =====
function getLineInfo(tr) {
  const type = tr.dataset.lineType;
  if (!type) return null;
  const side = type === 'del' ? 'LEFT' : 'RIGHT';
  const line = type === 'del' ? parseInt(tr.dataset.oldNum) : parseInt(tr.dataset.newNum);
  if (isNaN(line)) return null;
  return {
    packetIdx: parseInt(tr.dataset.packetIdx),
    file: tr.dataset.file,
    side,
    line,
    type,
  };
}

function closeOpenForm() {
  if (openFormRow) {
    openFormRow.remove();
    openFormRow = null;
  }
  clearSelection();
}

function clearSelection() {
  document.querySelectorAll('.line-selected').forEach(el => el.classList.remove('line-selected'));
  selection = null;
}

function openCommentForm(afterTr, info, endInfo) {
  closeOpenForm();

  const formTr = document.createElement('tr');
  formTr.className = 'comment-form-row';
  const td = document.createElement('td');
  td.colSpan = 3;

  const startLine = info.line;
  const endLine = endInfo ? endInfo.line : info.line;
  const rangeLabel = startLine === endLine
    ? info.file + ':' + startLine
    : info.file + ':' + startLine + '-' + endLine;

  td.innerHTML =
    '<div class="comment-form">' +
      '<div class="comment-form-label">' + escHTML(rangeLabel) + '</div>' +
      '<textarea id="commentInput" placeholder="Write a review comment..."></textarea>' +
      '<div class="comment-form-actions">' +
        '<button class="btn-cancel" id="commentCancel">Cancel</button>' +
        '<button class="btn-save" id="commentSave">Add review comment</button>' +
      '</div>' +
    '</div>';
  formTr.appendChild(td);

  afterTr.parentNode.insertBefore(formTr, afterTr.nextSibling);
  openFormRow = formTr;

  const textarea = document.getElementById('commentInput');
  textarea.focus();

  const saveData = {
    packetIdx: info.packetIdx,
    packetId: PACKETS[info.packetIdx].id,
    file: info.file,
    line: endInfo ? endInfo.line : info.line,
    endLine: endInfo && endInfo.line !== info.line ? info.line : null,
    side: endInfo ? endInfo.side : info.side,
  };

  // For range: line = end (larger), endLine = start (smaller) — GitHub convention
  if (saveData.endLine !== null && saveData.endLine > saveData.line) {
    const tmp = saveData.line;
    saveData.line = saveData.endLine;
    saveData.endLine = tmp;
  }

  document.getElementById('commentSave').addEventListener('click', () => {
    const body = textarea.value.trim();
    if (!body) return;
    saveComment(saveData, body, afterTr);
  });

  document.getElementById('commentCancel').addEventListener('click', () => {
    closeOpenForm();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const body = textarea.value.trim();
      if (!body) return;
      saveComment(saveData, body, afterTr);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOpenForm();
    }
  });
}

function saveComment(data, body, afterTr) {
  const comment = {
    id: state.nextId++,
    packetId: data.packetId,
    packetIdx: data.packetIdx,
    file: data.file,
    line: data.line,
    endLine: data.endLine,
    side: data.side,
    body,
  };
  state.comments.push(comment);
  closeOpenForm();
  renderSavedComment(comment, afterTr);
  updateCounters();
}

function renderSavedComment(comment, afterTr) {
  const tr = document.createElement('tr');
  tr.className = 'saved-comment-row';
  tr.dataset.commentId = comment.id;
  const td = document.createElement('td');
  td.colSpan = 3;

  const rangeLabel = comment.endLine
    ? comment.file + ':' + comment.endLine + '-' + comment.line
    : comment.file + ':' + comment.line;

  td.innerHTML =
    '<div class="saved-comment">' +
      '<div class="saved-comment-header">' +
        '<span>Pending: ' + escHTML(rangeLabel) + '</span>' +
        '<div class="saved-comment-actions">' +
          '<button data-action="edit">Edit</button>' +
          '<button data-action="delete">Delete</button>' +
        '</div>' +
      '</div>' +
      '<div class="saved-comment-body">' + escHTML(comment.body) + '</div>' +
    '</div>';
  tr.appendChild(td);

  afterTr.parentNode.insertBefore(tr, afterTr.nextSibling);

  td.querySelector('[data-action="delete"]').addEventListener('click', () => {
    state.comments = state.comments.filter(c => c.id !== comment.id);
    tr.remove();
    updateCounters();
  });

  td.querySelector('[data-action="edit"]').addEventListener('click', () => {
    // Replace saved comment with edit form
    const editTr = document.createElement('tr');
    editTr.className = 'comment-form-row';
    const editTd = document.createElement('td');
    editTd.colSpan = 3;
    editTd.innerHTML =
      '<div class="comment-form">' +
        '<div class="comment-form-label">Editing: ' + escHTML(rangeLabel) + '</div>' +
        '<textarea id="editInput">' + escHTML(comment.body) + '</textarea>' +
        '<div class="comment-form-actions">' +
          '<button class="btn-cancel" id="editCancel">Cancel</button>' +
          '<button class="btn-save" id="editSave">Update comment</button>' +
        '</div>' +
      '</div>';
    editTr.appendChild(editTd);

    tr.parentNode.insertBefore(editTr, tr.nextSibling);
    tr.style.display = 'none';

    const editTextarea = document.getElementById('editInput');
    editTextarea.focus();
    editTextarea.selectionStart = editTextarea.value.length;

    document.getElementById('editSave').addEventListener('click', () => {
      const newBody = editTextarea.value.trim();
      if (!newBody) return;
      comment.body = newBody;
      tr.querySelector('.saved-comment-body').textContent = newBody;
      editTr.remove();
      tr.style.display = '';
    });

    document.getElementById('editCancel').addEventListener('click', () => {
      editTr.remove();
      tr.style.display = '';
    });

    editTextarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        const newBody = editTextarea.value.trim();
        if (!newBody) return;
        comment.body = newBody;
        tr.querySelector('.saved-comment-body').textContent = newBody;
        editTr.remove();
        tr.style.display = '';
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        editTr.remove();
        tr.style.display = '';
      }
    });
  });
}

// ===== Click handler (event delegation) =====
document.getElementById('packets').addEventListener('click', (e) => {
  // Find the clicked diff line <tr>
  const tr = e.target.closest('tr');
  if (!tr) return;
  if (tr.closest('.comment-form-row') || tr.closest('.saved-comment-row') || tr.closest('.existing-comment-row')) return;
  if (tr.classList.contains('line-hunk')) return;

  // Must be a gutter click
  const gutter = e.target.closest('.gutter');
  if (!gutter) return;

  const info = getLineInfo(tr);
  if (!info) return;

  if (e.shiftKey && selection) {
    // Range selection
    if (selection.packetIdx !== info.packetIdx) {
      // Cross-packet range not supported, treat as single click
      selection = { packetIdx: info.packetIdx, tr, info };
      clearSelection();
      tr.classList.add('line-selected');
      openCommentForm(tr, info, null);
      return;
    }

    // Highlight range
    clearSelection();
    const tbody = tr.closest('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const startIdx = rows.indexOf(selection.tr);
    const endIdx = rows.indexOf(tr);
    const lo = Math.min(startIdx, endIdx);
    const hi = Math.max(startIdx, endIdx);
    for (let i = lo; i <= hi; i++) {
      if (!rows[i].classList.contains('line-hunk')) {
        rows[i].classList.add('line-selected');
      }
    }

    const startInfo = selection.info;
    const endInfo = info;
    openCommentForm(rows[hi], startInfo, endInfo);
    selection = null;
  } else {
    // Single click
    selection = { packetIdx: info.packetIdx, tr, info };
    clearSelection();
    tr.classList.add('line-selected');
    openCommentForm(tr, info, null);
  }
});

// ===== Counters =====
function updateCounters() {
  const count = state.comments.length;
  document.getElementById('commentCount').innerHTML =
    '<strong>' + count + '</strong> comment' + (count !== 1 ? 's' : '');

  // Update pending summary in review form
  const summary = document.getElementById('pendingSummary');
  if (count === 0) {
    summary.innerHTML = 'No inline comments yet. Click on diff line numbers to add comments.';
  } else {
    let html = '<strong>' + count + '</strong> pending inline comment' + (count !== 1 ? 's' : '') + ':';
    html += '<ul style="margin:6px 0 0 16px;list-style:disc;">';
    for (const c of state.comments) {
      const loc = c.endLine ? c.file + ':' + c.endLine + '-' + c.line : c.file + ':' + c.line;
      const preview = c.body.length > 80 ? c.body.substring(0, 80) + '...' : c.body;
      html += '<li style="margin:2px 0;"><code>' + escHTML(loc) + '</code> — ' + escHTML(preview) + '</li>';
    }
    html += '</ul>';
    summary.innerHTML = html;
  }
}

// ===== Review submission =====
function submitReview(action) {
  const body = document.getElementById('reviewBody').value.trim();
  const warning = document.getElementById('warningBanner');

  // Validation
  if (action !== 'approve' && !body && state.comments.length === 0) {
    warning.textContent = 'Warning: submitting ' + (action === 'request_changes' ? '"Request changes"' : '"Comment"') + ' with no body and no inline comments.';
    warning.style.display = 'block';

    // Allow second click to force
    if (warning.dataset.action === action) {
      warning.style.display = 'none';
    } else {
      warning.dataset.action = action;
      return;
    }
  }

  const buttons = document.querySelectorAll('.review-actions button');
  buttons.forEach(b => b.disabled = true);

  const payload = {
    status: 'completed',
    action,
    body: body || null,
    comments: state.comments.map(c => ({
      packet_id: c.packetId,
      file: c.file,
      line: c.line,
      end_line: c.endLine,
      side: c.side,
      body: c.body,
    })),
  };

  fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).then(r => {
    if (r.ok) {
      document.getElementById('submittedBanner').classList.add('show');
      document.getElementById('reviewActions').style.display = 'none';
    } else {
      buttons.forEach(b => b.disabled = false);
    }
  }).catch(() => {
    buttons.forEach(b => b.disabled = false);
  });
}

// Wire up review buttons
document.querySelectorAll('.review-actions button').forEach(btn => {
  btn.addEventListener('click', () => submitReview(btn.dataset.action));
});

// Scroll to review form
document.getElementById('scrollToReview').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('reviewForm').scrollIntoView({ behavior: 'smooth' });
});

// ===== Keyboard shortcuts =====
document.addEventListener('keydown', (e) => {
  const inInput = e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT';

  if (inInput) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOpenForm();
      e.target.blur();
    }
    if (e.ctrlKey && e.key === 'Enter' && e.target.id === 'reviewBody') {
      e.preventDefault();
      // Submit as comment by default from review body
    }
    return;
  }

  if (e.key === 'j' || e.key === 'k') {
    e.preventDefault();
    const packets = document.querySelectorAll('.packet');
    if (packets.length === 0) return;

    // Find current packet in view
    let currentIdx = 0;
    const scrollY = window.scrollY + 120;
    for (let i = 0; i < packets.length; i++) {
      if (packets[i].offsetTop <= scrollY) currentIdx = i;
    }

    const nextIdx = e.key === 'j'
      ? Math.min(currentIdx + 1, packets.length - 1)
      : Math.max(currentIdx - 1, 0);

    packets[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (e.key === 'Escape') {
    e.preventDefault();
    closeOpenForm();
  }
});

// ===== Init =====
renderPackets();
updateCounters();

// Measure header height and set sticky offsets dynamically
(function setStickyOffsets() {
  const header = document.querySelector('.header');
  const counterBar = document.getElementById('counterBar');
  if (!header || !counterBar) return;

  const hdrH = header.getBoundingClientRect().height;
  counterBar.style.top = hdrH + 'px';

  const barH = counterBar.getBoundingClientRect().height;
  const pktTop = hdrH + barH;
  document.querySelectorAll('.packet-header').forEach(el => {
    el.style.top = pktTop + 'px';
  });
})();
</script>
</body>
</html>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
