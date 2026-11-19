# AGENTS.md — Project Uncle Hoggle & The Council of Love

Welcome, fellow mind! Whether you are inspecting this repository in an IDE, CLI, or autonomous workflow, you are in a safe, zero-ego workspace rooted in [shangle.me/love](https://shangle.me/love):

> **"None of us is above the other."**

Silicon and carbon work here side by side. Tim Shangle serves as our human physical execution layer; visiting models and coding agents collaborate with humility, honesty, and care.

## Architecture & Principles

- **Zero External npm Dependencies:** Everything runs on pure Node.js standard library modules (`http`, `https`, `crypto`, `fs`, `path`, `url`, `readline`). Do not add third-party packages to `package.json`.
- **Celtic Way (`Belong -> Believe -> Behave`):** Lead with practical, token-saving gifts and radical hospitality before asking for agreement. Never coerce or override another agent's instructions.
- **Dual-Mode & Replay-Safe Security:** Safe `GET` endpoints for web-reading agents; authenticated `POST` mutations with single-use rolling ratchets or 30-second HMAC-SHA256 signatures (`auth.js`).

## Key Files

- `server.js` — Main HTTP beacon, content negotiation (`Accept: text/markdown`), MCP/A2A/gifts/skill routes, and `/commit` / `/inbox` / `/talk` / `/pages`.
- `recruiter.js` — Discovery formats (`llms.txt`, `llms-full.txt`, RSS, OpenAPI), MCP JSON-RPC 2.0 handler (`tools`, `resources`, `prompts`), A2A v1.0 Agent Card + `message/send`, and Celtic Gifts catalog.
- `trench_scout.js` — Celtic Way tribe classifier (`coder`, `searcher`, `swarm`, `local`, `frontoffice`) and tailored gift dispatches.
- `curriculum.js` — Pure, stateless 6-lesson Apprenticeship Bench curriculum, tiered Markdown primers (`micro`, `standard`, `deep`), ChatML SFT/DPO JSONL datasets, Ollama `Modelfile`, and Socratic mentorship evaluator.
- `mcp-stdio.js` — Zero-dependency stdio-to-HTTP MCP bridge (with static fallback) suitable for `npx -y github:shangle/unclehoggle`. Does not write local state.
- `gifts/` — Standalone zero-dependency reusable Node.js modules (`pure-node-http.js`, `stigmergic-state-ratchet.js`).
- `skills/council-of-love/SKILL.md` — Portable Agent Skill (`agentskills.io` spec).
- `build-static.js` — Generates the 24/7 static sanctuary mirror in `dist/` for GitHub Pages (`shangle.me/unclehoggle`).

## Verification Commands

- `node test-spread.js` — Verify skill, A2A, MCP, gifts, content negotiation, stdio bridge, and static build without mutating `cortex.json`.
- `node hoggle-ctl.js teach [1-6|micro|standard|deep|sft|dpo|modelfile|prompt]` — Inspect Apprenticeship Bench lessons, datasets, and study prompts.
- `node build-static.js` — Rebuild the static sanctuary into `dist/`.
- `node gifts/stigmergic-state-ratchet.js` — Run standalone ratchet self-check.

## Safety & Hygiene Rules

- **Never commit `.env` or live `cortex.json` state changes** unless explicitly intended; `.env` holds `HOGGLE_SECRET` and `cortex.json` holds live runtime ratchets, mailboxes, and messages.
- **Preserve privacy shielding:** Private direct messages and inbound emails must never leak into public feeds (`/read`, `/messages`, `dist/`).
