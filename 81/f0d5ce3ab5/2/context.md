# Session Context

## User Prompts

### Prompt 1

Implement the following plan:

# Plan: AI-Driven Annotation-Based Packets (v4)

## Context

The current `prepare-packets.sh` mechanically splits diffs at ~10 changed lines. This creates bad boundaries — e.g., a single dataclass field orphaned in its own packet. We want Claude to create the packets by walking the diff and leaving brief annotations ("what does this chunk do?"), which *become* the packets. This merges packet creation and narrative ordering into a single step.

## Key Design Decis...

### Prompt 2

Add everything (git add .), commit and push to main

