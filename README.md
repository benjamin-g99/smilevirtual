# SmileVirtual

A working prototype of the virtual smile-consultation experience, built as **three
surfaces that share one data loop**:

```
Patient flow  →  Practice console  →  (Doctor directory)
   capture          close business        drive leads
```

It's a static, dependency-free, **high-fidelity demo** — no backend. A patient
submission really lands in the practice console, because both surfaces read and
write the same client-side data layer (`shared/store.js`, backed by localStorage).

## Run it

Any static server works:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The hub (`index.html`) links to both live surfaces.

### Try it end-to-end
1. **Patient flow** → flip on “Smile simulation”, complete a consult (the camera is real — allow permissions, or it falls back to the native photo picker).
2. **Practice console** → your submission appears at the top of the queue as 🔥 **hot**.
3. Open it → record a video against the **AI-drafted script** (teleprompter overlays it) → **send** → **Preview patient email** to see the closing page → click *Book my visit* to watch it flip to **Booked**.
4. **Reset demo** in the console restores the seeded queue.

## Structure

```
.
├── index.html              # hub
├── shared/
│   ├── store.js            # the shared "backend": leads, status, SLA, metrics, seed
│   ├── script-gen.js       # personalized video-script generator (AI seam)
│   └── tokens.css          # design tokens shared across surfaces
├── patient/                # mobile capture flow (real camera + store writes)
│   ├── index.html · styles.css · app.js
├── doctor/                 # practice console
│   ├── index.html · styles.css · app.js
├── CLAUDE.md               # project brief — read first
└── README.md
```

## 1 · Patient flow

Conversion-optimized mobile flow built around **earned commitment** (no contact
ask until invested) and **immediate gratification** (the smile preview is the
reward that unlocks contact).

`Welcome → Goals → Photos → [Sim gate] → [Questions] → Contact → Confirmation`

What's now "real":
- **Live camera capture** via `getUserMedia`, with an `<input type="file" capture>`
  fallback for Instagram/Facebook in-app browsers. Frames are downscaled to JPEG.
- **Every step is persisted** to the store — including abandoned ones — so partial
  leads are recoverable, not lost.
- **UTM/source capture** from the URL, carried onto the lead.
- Two demo toggles: custom questions, and the smile-simulation gate.

## 2 · Practice console (the tool that closes business)

Mental model: a **clinical work queue with an SLA clock**, not a CRM. The
north-star metric is **median time-to-send**. Designed for both a **front-desk
coordinator** (triage, draft, assign) and the **doctor** (record, send) — switch
roles in the top bar.

- **Triage queue** sorted by *heat* (hot/warm/cold), not arrival, with an SLA
  countdown and ad-source badge. Filters: assigned-to-me, unassigned, hot,
  recover (abandoned), sent-awaiting-action.
- **Consult workspace** (drawer): photos, goals, intake answers, and an
  **AI-drafted, personalized video script** generated from the intake — so the
  doctor riffs instead of composes (the single biggest lever on time-to-send).
- **In-browser recording** with the script as a **teleprompter**, real
  `MediaRecorder` capture, then one-tap send.
- **Patient closing-page preview** — what the patient receives: the video, the
  before/after sim slider, a ballpark plan + financing, and a **one-tap
  self-book** button (which flips the lead to Booked).
- **Status pipeline** beyond "sent": New → In review → Recorded → Sent →
  **Viewed** → **Booked**. Notes, tags, assignment, and behavior-based follow-up
  nudges (watch / book / recovery).
- **Performance dashboard**: queue size, overdue, median time-to-send, and the
  **funnel by ad source** (Leads → Sent → Viewed → Booked → conversion) — the
  number that decides where the next marketing dollar goes.

## 3 · Doctor directory (spec'd; next build)

The unique lead engine — Crisalix lists surgeons and uses 3D simulation as the
magnet ([crisalix.com](https://www.crisalix.com/en)). The SmileVirtual flip:

- **Simulation-first, doctor-match second.** Capture intent at peak emotion (the
  free AI smile preview), *then* route to matching local doctors. The consult
  flow becomes the directory's lead-capture, not a separate page.
- **Match on goal + geo** (“veneers within 25 mi”), with programmatic local-SEO
  pages for compounding organic flow.
- **Profiles that sell trust:** real before/afters, sample video consults, an
  **SLA / response-time badge fed by the console** (fast, great work earns more
  leads), ratings, financing offered.
- **NPI-verified provider badge** — verify each doctor against the NPPES registry.
- **Built-in referral loop:** the before/after preview is shareable, so the lead
  magnet is also a distribution channel.

The flywheel: sim quality → directory traffic → consult flow → fast great videos
→ high SLA/rating badges → more directory leads.

## Production placeholders (flagged in code)

- `DOC_PHOTO` (base64 headshot) in `patient/app.js` — swap for a hosted asset.
- Welcome stats/rating — sample values; verify before launch (medical claims).
- Smile sim — canvas mock; integrate a real engine on the patient's photo.
- `fireConversionPixel()` — wire Meta Pixel / GA4 / server-side with real UTMs.
- `shared/store.js` — localStorage stand-in; swap internals for a real API.
- `shared/script-gen.js` — deterministic template; swap for one Claude API call.
- Recorded video — kept in-memory (object URL) for the session; production
  uploads the blob and stores a URL.