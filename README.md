# Claude Assisted Review

A Claude Code plugin that provides AI-guided Pull Request code reviews. A preprocessing script splits the PR diff into small review packets (~25 changed lines each), which are presented in batches of up to 4. You comment or move on per packet — fast, focused, minimal back-and-forth.

## Prerequisites

- [Claude Code](https://claude.ai/code) installed
- [GitHub CLI (`gh`)](https://cli.github.com/) installed and authenticated (`gh auth login`)
- Access to the repository you want to review PRs in

## Installation

### From GitHub

```bash
claude plugin add roo-oliv/claude-assisted-review-plugin
```

### Local Development

```bash
git clone git@github.com:roo-oliv/claude-assisted-review-plugin.git
claude --plugin-dir ./claude-assisted-review-plugin
```

## Usage

```
/claude-assisted-review:review-pr <PR-number-or-url>
```

Example:

```
/claude-assisted-review:review-pr 42
/claude-assisted-review:review-pr https://github.com/org/repo/pull/42
```

## How It Works

1. **PR Overview** — Claude fetches and presents the PR title, description, author, branch info, commits, and change statistics.

2. **Packet Preparation** — A bash script (`scripts/prepare-packets.sh`) splits the full diff into review packets of ~25 changed lines each. Lock files, binaries, generated files, and minified files get a short summary instead of a full diff. Large files are split at hunk boundaries into multiple packets.

3. **Smart Ordering** — Claude reads the packet index and orders them for narrative flow: types/interfaces first, then core implementation, integration, tests, config, and special files last.

4. **Batch Review** — Packets are presented in batches of up to 4, with a single prompt per batch. For each packet you can:
   - Move on with no comment (default)
   - Discuss the change before commenting
   - Type a comment directly

5. **Submit** — Review all comments, pick a verdict (approve, comment, or request changes), and Claude submits via the GitHub API.

## Architecture

```
skills/review-pr/SKILL.md       — Skill definition, fetches PR metadata + runs prepare-packets.sh
skills/review-pr/review-instructions.md — 4-phase review protocol
scripts/prepare-packets.sh       — Bash+awk script: diff → classified, split, pre-formatted packets
scripts/submit-review.sh         — Pipes review JSON to GitHub API
```

## Known Limitations

- **Context window**: Very large PRs (50+ files, thousands of lines) may approach context limits.
- **Binary files**: Cannot display diffs for binary files — shows metadata summary only.
- **Comment positions**: Inline comments can only be placed on lines that appear in the diff (GitHub API limitation).

## License

MIT
