# CLAUDE.md — Project brief

Read before changing anything. Captures *why* this is built the way it is, so
changes don't undo deliberate conversion/closing decisions.

## What this is

A static, dependency-free, high-fidelity prototype of the SmileVirtual
experience — **three surfaces sharing one data loop**:

1. `patient/` — mobile capture flow (the original conversion redesign, now with
   real camera + persistence).
2. `doctor/` — the practice console: a clinical work queue built to **close more
   business** by compressing time-to-video and turning the video into a closing
   instrument.
3. Directory — spec'd in README §3, not yet built.

No build step, no framework, no server. Both apps share `shared/store.js`
(localStorage) so a patient submission shows up in the console.

## Architecture

- `shared/store.js` — the "backend". `SmileStore.*` is the only data API:
  `upsert` (patient writes, every step), `all/get`, `patch/setStatus/assign/
  addNote/toggleTag/saveVideo`, `funnelBySource/metrics`, `seed/reset`. Lead
  shape, status model (`new→in_review→recorded→sent→viewed→booked`), heat
  (hot/warm/cold/done), and SLA (24h) all live here. **Swap the internals for a
  real API and the surfaces don't change.**
- `shared/script-gen.js` — `ScriptGen.generate(lead, cfg)` builds the
  personalized video script from intake. Deterministic template = the demo seam
  for one Claude API call.
- `shared/tokens.css` — design tokens (also mirrored in `patient/styles.css` so
  the patient app is self-contained).
- `patient/app.js` — flow state machine (`buildFlow/show/next`), real camera
  (`openCamera/capture/frameToDataURL` + file fallback), sim reveal, and
  `persist()` which upserts the lead at every step. **Sim gate replaces the
  contact step when on.**
- `doctor/app.js` — `DoctorApp.*`. Renders queue/dashboard, the consult drawer,
  the **full-screen Consult Studio** (landscape/portrait slide deck auto-built
  from the case + webcam PiP, composited onto a `<canvas>` and recorded via
  `captureStream`+mic; field-based slide editing + add/reorder/delete; before/
  after slides from a persisted, uploadable case library; brand theming —
  logo+colors from `SmileStore.config().brand` applied per-frame), and the patient
  closing-page (`previewEmail`). Subscribes to `SmileStore.onChange`.

## Core principles (do not regress)

**Patient side**
1. *Earned commitment* — never ask for contact while cold. Contact comes after
   goals + photos. Don't move it earlier.
2. *Immediate gratification* — the smile preview is the reward that unlocks
   contact, not a freebie before the ask.
3. *Strongest reward is the unlock* — when sim is on, its gate **replaces** the
   standalone contact step (no second form).
4. *Doctor-forward trust* — real headshot/credentials up front and near the ask.
5. *Honest simulation* — never over-promise; the doctor's video reconciles
   preview vs. reality.

**Doctor side**
6. *Work queue, not CRM* — triage by **heat + SLA**, not arrival. North-star =
   **median time-to-send**. Speed-to-lead is the #1 close-rate lever.
7. *Compress recording time* — the AI-drafted script + teleprompter is the point;
   the doctor riffs, never composes from scratch.
8. *The video is the sales page* — the closing-page (video + sim + ballpark +
   one-tap self-book) is where business closes; treat it as a conversion surface.
9. *Capture partial leads* — every patient step is persisted; abandoned leads are
   a recovery segment (warm/cold), not lost.
10. *Close the marketing loop* — always track Viewed + Booked **by ad source**,
    not just Sent. That funnel decides spend.
11. *Two roles* — front-desk (triage/draft/assign) + doctor (record/send). Keep
    the assignment model intact.

## Conventions

- No framework/bundler. No new deps unless we deliberately add a build setup.
- All data goes through `SmileStore`; don't read localStorage directly elsewhere.
- Things to replace for production are marked `PLACEHOLDER` / noted in README.

## Roadmap / next work

1. **Directory** (README §3): simulation-first lead engine, goal+geo match,
   NPI-verified badges, SLA/response-time badge fed by the console, shareable
   previews, programmatic local-SEO pages. Same `SmileStore` data model.
2. Responsive desktop for the patient flow (story panel + QR-to-phone handoff).
3. Real smile-sim engine on the patient's actual photo.
4. Wire the AI script to a real Claude call; wire the conversion pixel.
5. Real backend behind `SmileStore` for true multi-device (phone → laptop).
