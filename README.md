# mesh-ranked-vote

[![pages](https://img.shields.io/badge/live-baditaflorin.github.io%2Fmesh-ranked-vote-a855f7)](https://baditaflorin.github.io/mesh-ranked-vote/)
[![version](https://img.shields.io/badge/version-0.1.0-blue)](https://github.com/baditaflorin/mesh-ranked-vote/blob/main/package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

> Instant-runoff ranked-choice voting with round-by-round elimination, no account, mesh-synced

Live: **https://baditaflorin.github.io/mesh-ranked-vote/**

Source: **https://github.com/baditaflorin/mesh-ranked-vote**

Tip the dev: **https://www.paypal.com/paypalme/florinbadita**

---

## What it is

A shared ranked-choice (instant-runoff) poll that lives entirely in the browser — no account, no backend of its own beyond the self-hosted WebRTC stack listed below. Everyone in the same room sees the same options, drags them into their preferred order, and watches the instant-runoff tally recompute round by round: the last-place option is eliminated and its ballots transfer to each voter's next choice until something has a majority.

Built on `@baditaflorin/mesh-common`, hosted on GitHub Pages from `docs/`.

## Try it with two tabs

1. Open the [live app](https://baditaflorin.github.io/mesh-ranked-vote/) in one tab.
2. Tap the question to set one (e.g. "where do we eat?"), then add a few options.
3. Open the **same URL in a second tab** (or send it to a friend's phone) — both are in room `default`, so the options appear instantly on both.
4. In each tab, type a name and click options to build a ranking. The **live tally** at the bottom shows each instant-runoff round, eliminations, and the winner — identical on every screen.

The settings drawer (⚙) lets you change the room id so separate groups don't collide.

## Quickstart (local)

```bash
git clone https://github.com/baditaflorin/mesh-common
git clone https://github.com/baditaflorin/mesh-ranked-vote
cd mesh-ranked-vote
npm install
npm run dev
```

`mesh-common` must sit as a **sibling** directory because `package.json` references it via `file:../mesh-common`.

## Self-hosted infrastructure

| Repo                                              | Endpoint                               | Purpose                     |
| ------------------------------------------------- | -------------------------------------- | --------------------------- |
| https://github.com/baditaflorin/signaling-server  | `wss://turn.0docker.com/ws`            | y-webrtc signaling fan-out  |
| https://github.com/baditaflorin/turn-token-server | `https://turn.0docker.com/credentials` | HMAC TURN creds, 1-hour TTL |
| https://github.com/baditaflorin/coturn-hetzner    | `turn:turn.0docker.com:3479`           | TURN relay                  |

## Settings overrides (localStorage keys)

The settings drawer lets the user override signaling and TURN endpoints. Keys:

- `mesh-ranked-vote:signalingUrl`
- `mesh-ranked-vote:turnTokenUrl`
- `mesh-ranked-vote:iceServers`
- `mesh-ranked-vote:room`

If endpoints are blank or unreachable, the app falls back to STUN-only.

## Build & deploy

GitHub Pages serves the committed `docs/` directory on the `main` branch. There is **no GitHub Actions build workflow**; the Husky pre-commit + pre-push hooks gate formatting / typecheck / smoke build locally.

```bash
npm run smoke   # build + sanity-check docs/
```

## Privacy

See `docs/privacy.md` for the threat model — what other peers in the mesh see, what the self-hosted infra sees, what stays local.

## License

MIT — see `LICENSE`.
