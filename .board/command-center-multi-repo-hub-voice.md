---
status: draft
created: 2026-07-20 15:20
---
# Command center — multi-repo hub + voice

Future direction, staged so the core API and file format never need a rewrite.
Parked on purpose — v1 stays lean.

- v1.1 hub: serve several board dirs at once (`meanboard hub <dirs…>`); tasks
  tagged per repo, per-repo color tint, filter row.
- v2 voice: OpenAI Realtime over WebRTC straight from the browser; the server
  only mints ephemeral session tokens. Agent tools map 1:1 onto the existing
  REST API (create / note / status / enrich). The grilling flow is the
  `.board/README.md` protocol, spoken.
