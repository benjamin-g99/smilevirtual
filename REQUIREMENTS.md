# SmileVirtual + Aesthetic Virtual — Full Requirements & Rebuild Specification

> **Purpose of this document.** This is a complete, implementation-level spec for two
> related prototypes built in one repository: **SmileVirtual** (virtual dental/ortho
> consultations) and **Aesthetic Virtual** (a parallel concept for aesthetic medicine:
> plastic surgery + med spa). It is written so that another AI or engineer can rebuild
> the entire system from scratch without seeing the original code. Where exact values
> matter (data shapes, formulas, copy, palette), they are given explicitly.

---

## 0. How to read this

- Build in the order in §12 ("Reproduction order").
- "Surface" = a self-contained mini-app (its own HTML/CSS/JS) under a folder.
- Everything is a **static, dependency-free, client-side prototype**. The only "backend"
  is a localStorage-backed module that exposes a small API; swapping that module for a
  real API must not require changing any surface.
- Treat all clinical pricing, ratings, and stats as **illustrative placeholder data**.

---

## 1. Product overview & philosophy

### 1.1 SmileVirtual (the original)
A conversion-optimized **virtual smile-consultation** funnel for a cosmetic dentist,
plus the practice-side tooling to run it. Origin story: the real-world flow converted
~0.2% of ad clicks because it asked for contact info on screen one. This redesign fixes
that with two principles:

1. **Earned commitment** — never ask for contact while the visitor is cold. The ask
   comes *after* goals + photos, when they're invested. Never move contact earlier.
2. **Immediate gratification** — an optional instant smile-simulation before/after is
   the *reward that unlocks the email*, not a freebie given before the ask.

The practice console is framed as **a clinical work queue with an SLA clock, not a CRM**.
North-star metric = **median time-to-send** (speed-to-lead is the #1 close lever).
"The video is the sales page."

### 1.2 Aesthetic Virtual (the parallel concept)
Same engine, re-thought for aesthetic medicine. Core thesis: **one engine, three
playbooks** — capture → qualify → respond → book → grow. What flexes per specialty is
**Qualify** (who deserves which response) and **Respond** (the artifact the patient gets):

| | Plastic surgery | Med spa | Dermatology (spec only) |
|---|---|---|---|
| Value | $5k–$50k+ | $100–$1,500 (+memberships) | mixed |
| Volume | low | high | high |
| Hero response | **recorded surgeon video** | **AI treatment plan** (no video) | async triage |
| Provider effort/lead | high (worth it) | near-zero (approve in 1 tap) | low |

Routing principle: **never spend a $400/hr provider on a $12 lead, and never let a $20k
lead get a form letter.** No smile-simulation in aesthetics (deliberately omitted —
too hard to do credibly; for plastics, real 3D sim is a future premium add only).

---

## 2. Global tech constraints & conventions

- **No framework, no bundler, no build step, no dependencies, no server.** Plain HTML +
  CSS + ES2015+ vanilla JS. Each page is openable directly or via any static server
  (`python3 -m http.server`). Must deploy to GitHub Pages as-is.
- **Data layer = the only "backend".** A global object (e.g. `window.SmileStore`) backed
  by `localStorage`. All surfaces read/write only through it; never touch localStorage
  directly elsewhere. It emits change events so open views live-refresh; it also listens
  to the `storage` event for cross-tab updates.
- **Fonts:** Google Fonts — `Fraunces` (display/serif, weights 400–600 + italic) and
  `Plus Jakarta Sans` (body, 400–800). Load via `<link>` exactly on every page.
- **Cache-busting:** local `<script>`/`<link>` references carry a `?v=N` query (bump on
  changes) because GitHub Pages caches aggressively. (Learned the hard way — stale
  `app.js` against fresh `index.html` produced blank views.)
- **Verification habit:** every JS file must pass `node --check`. Logic is unit-testable
  headlessly by stubbing `window`/`localStorage` and requiring the store module.
- **Escaping:** any user/lead/config text injected into HTML must run through an `esc()`
  helper (`& < > "` → entities). Inside a `<script>` block, never emit a literal
  `</script>`; build it as `'<\/script>'` or split the string.
- **Camera:** `navigator.mediaDevices.getUserMedia({video:{facingMode:'user'}})` with an
  `<input type="file" accept="image/*" capture="user">` fallback for Instagram/Facebook
  in-app browsers. Captured frames are drawn to a canvas, mirrored, downscaled to ~360×480
  JPEG (quality 0.7) data URLs before storing (localStorage quota).
- **Video recording (studios):** composite slides + webcam onto a `<canvas>`, then
  `canvas.captureStream(30)` + the mic audio track → `MediaRecorder` (prefer
  `video/webm;codecs=vp9,opus`, fall back). Recorded blob is kept in-memory for the
  session (object URL); production uploads it. Note Safari is flaky with this combo.

---

## 3. Design system

**Tokens** live in `shared/tokens.css` (`:root` vars), mirrored into each app's CSS so
surfaces are self-contained.

**SmileVirtual (dental) palette:**
```
--cream:#F6F1E9; --cream-2:#EFE7DA; --ink:#1E2A2A;
--teal:#0E5450; --teal-deep:#0A3F3C; --teal-soft:#E3EEEC;
--coral:#E8775B; --coral-soft:#F6E0D8; --gold:#C9A24B;
--line:rgba(30,42,42,.10);
--hot:#E8775B; --warm:#C9A24B; --cold:#7E8C8A; --ok:#2C9A7E;  (+ *-soft variants)
--display:'Fraunces',Georgia,serif; --body:'Plus Jakarta Sans',system-ui,sans-serif;
radius ~14–22px; shadow:0 18px 50px -18px rgba(14,84,80,.45); shadow-sm:0 6px 18px -8px …
```
**Aesthetic Virtual — Plastics palette (luxe plum):** `--plum:#4A2F50; --plum-deep:#33203A;
--plum-soft:#ECE2EE; --rose:#C98B86; --rose-soft:#F3E2DF; --gold:#C2A269; --ivory:#F4F0EC`.
**Aesthetic Virtual — Med spa palette (mulberry):** `--plum:#7A3E55; --plum-deep:#5A2C40;
--plum-soft:#F2E2E8; --rose:#D98E86; --gold:#C2A269; --ivory:#F6F0F0`.

**Type:** H1/headings `Fraunces` weight 500 with italic `<em>` accents in the brand
accent color; body `Plus Jakarta Sans`. Display numerals (KPIs, prices) use Fraunces.

**Signature components (reused everywhere):**
- **Phone frame** for patient flows: 390×780 device mock with notch, top progress bar
  (`.bar > i` gradient fill), horizontally-sliding `.screen` sections (`.active`/`.left`).
- **Chips** (multi-select goals/concerns/areas), **option rows** (single-select),
  **CTA buttons** (`.cta`/`.cta-d`, ghost variants, coral/rose accent variant).
- **Console layout:** sticky top bar (brand + nav + actions), max-width ~1080px views,
  **lead cards** in a list, a right-side **drawer** (slides in, scrim behind) for the
  workspace, modals for studio/closing-page.
- **Full-screen studio**: 3-region layout (left slide strip, center canvas stage, right
  tabbed panel) + bottom record bar.
- **Settings**: left sidebar section nav + right pane; cards with icon-chip headers;
  field-based forms (text/number/color inputs, comma-split lists).

---

## 4. Repository structure

```
/                         SmileVirtual hub (index.html) — links all dental surfaces
shared/
  store.js                SmileStore — dental data layer + seed + analytics
  script-gen.js           ScriptGen.generate(lead,cfg) — dental video script
  tokens.css              design tokens
  directory-data.js       SmileDirectory — NPI-verified doctor list + geo helpers
patient/                  dental patient capture flow (index.html, styles.css, app.js)
doctor/                   dental practice console (queue, drawer, Consult Studio,
                          Performance, Settings) + brand modal + closing-page modal
directory/                dental doctor directory (search/map/profile)
portal/                   dental patient portal (video, sim replay, share, message, CTAs)
site/                     dental auto-generated landing page
link/                     dental link-in-bio (Linktree-style, click-tracked)
embed/                    embeddable widgets (widget.js) + gallery (index.html)
AESTHETIC_VIRTUAL.md      strategy doc for the aesthetic concept
aesthetic/
  index.html              Aesthetic Virtual concept hub
  store.js                AestheticStore — plastics data layer + qualification
  patient/                plastics patient capture flow
  console/                plastics practice console (queue, drawer, Consult Studio,
                          Performance, Settings) + closing-page modal
  medspa/
    store.js              MedSpaStore — concerns/areas/treatments + AI plan engine
    index.html/app/css    Med Spa AI Plan Builder console (queue, drawer, Performance,
                          Settings) + patient plan-page modal
    patient/              med-spa concern-led capture flow (instant plan)
CLAUDE.md, README.md      project briefs
```

The **root hub** (`/index.html`) is a branded landing page with cards linking each dental
surface + a "how to try it end-to-end" note. The **aesthetic hub** (`/aesthetic/`) is a
purpose-built concept page (plum theme) presenting the one-engine/three-playbooks model,
the three specialty playbooks, the personalization ladder, the qualification routing
engine, reuse-vs-redesign, ROI, and a build order — with live links to the built
plastics + med-spa surfaces.

---

## 5. Shared architecture pattern (applies to all three stores)

Each "store" is an IIFE assigning a global (`SmileStore`, `AestheticStore`, `MedSpaStore`).
Common shape:
- localStorage keys namespaced per product (e.g. `smilevirtual.leads.v1`,
  `aesthetic.leads.v1`, `medspa.leads.v1`) + a `…config.v1`, optional `…cases/clicks`,
  and a `…seeded.vN` flag (bump N to force a reseed).
- Methods: `config()/saveConfig()`, `all()`, `get(id)`, `upsert(partial)` (patient writes
  at *every step* so partial/abandoned leads are captured), `patch(id,fields)`,
  `onChange(fn)` (returns unsubscribe), `seed(force)/ensureSeeded()/reset()`, plus
  analytics. IDs are random short strings. `upsert` deep-merges nested objects
  (`contact`, `intake`, `source`) and shallow-sets arrays.
- Decorated reads: `all()`/`get()` may attach computed fields (heat, SLA, qualification).

---

## 6. SmileVirtual — detailed spec

### 6.1 SmileStore (shared/store.js)

**Lead schema:**
```
{ id, createdAt, updatedAt, status, furthestStep,
  goals:[string], goalText, photos:[dataURL|'demo:f'|'demo:c'],
  sim:{enabled:bool, unlockedAt, tweak:{white:0..1, natural:0..1}},
  questionAnswers:{ [index]:answer }, contact:{firstName,email,phone},
  source:{utm_source,utm_campaign,utm_content,utm_medium,fbclid,gclid,ttclid,referrer},
  assignedTo:string|null, notes:[{body,author,at}], tags:[string],
  video:{recordedAt,sentAt,viewedAt,durationSec,watchCount,watchPct,hasRecording,slides},
  booking:{bookedAt,apptTime,attended,paid,treatmentValue,conversionNotes},
  messages:[{from:'patient'|'doctor', body, at}], account:{passwordSet} }
```
**Status model:** `new → in_review → recorded → sent → viewed → booked` (+ `no_response`),
each with an `order` index and label. **Heat** (triage, computed): `hot` = has contact +
≥1 photo, not yet sent; `warm` = photos but no contact (abandoned-but-warm); `cold` =
dropped early; `done` = sent/viewed/booked. **SLA** = 24h target; `slaHoursLeft` = 24 −
hoursSince(createdAt) while awaiting send.

**Config schema (`config()`):**
```
{ doctor:{name,role,credential,npi,photo,bio,phone,email,address,city,state},
  brand:{name,logo(dataURL),primary,accent},
  staff:[{id,name,role,canRecord:bool}],
  questions:[{type:'text'|'choice'|'select', label, options:[]}],
  analytics:{metaPixelId,ga4Id,googleAdsId,customEndpoint},
  sourceAliases:{ rawUtmLower: 'Friendly Channel' },   // e.g. meta→Facebook, ig→Instagram
  reviews:{googleRating,googleCount,googleUrl,yelpRating,yelpCount,yelpUrl},
  site:{headline,subhead,ctaText,showReviews},
  links:[{id,label,url,icon}],
  spendBySource:{channelSlug:monthly$} | [{label,channel,amount}],  // accepts object OR list
  widgets:{target,headline,cta} }
```
`config()` deep-merges saved config over defaults (so new default keys appear for old saves).

**Key methods beyond CRUD:** `setStatus(id,status,extra)` (stamps sentAt/viewedAt/bookedAt),
`assign`, `addNote`, `toggleTag`, `saveVideo`, `saveSimTweak(id,{white,natural})`,
`addMessage(id,from,body)`, `setPassword(id)`, `channel(lead)` (resolve friendly channel
from utm_source via sourceAliases, else referrer, else "Direct"), `spendByChannel()`
(normalize object|list → {slug:$}), `trackClick(linkId)` / `clickStats(range)` (clicks are
**timestamped events** `[{id,at}]` so they filter by date), `cases()/addCase/removeCase`
(studio before/after library), `funnelBySource()`, `metrics()`, and `analytics(range)`.

**`metrics()`** → `{queueSize, overdue, medianTimeToSendH, sent, booked, total}` where
time-to-send = (sentAt − createdAt) per lead, median of those.

**`analytics(range)`** (range = `{from,to}` ms, filters by createdAt; scales monthly spend
to the window) →
```
{ funnel:[{key,label,count,pctOfStart,stepConv,dropped}],   // started,goals,photos,lead,sent,viewed,booked,attended,paid
  videos:{sent,viewed,viewRate, avgWatches, avgWatchPct, simUnlockRate},
  sources:[{source,leads,sent,viewed,booked,paid,revenue,spend,cpl,cpa,roas,bookRate}],
  conversion:{leadToBooked,bookedToPaid,revenue,spend,roas,avgTreatment} }
```
Grouped by `channel(lead)`; spend looked up by channel slug × range-scale.

**Seed:** ~12 leads spanning every status/heat/source, with watch %, paid bookings,
messages, accounts; plus seeded click events spread over ~90 days. `SEEDED_KEY` bump
reseeds. `reset()` clears leads + clicks + seeded flag and reseeds.

### 6.2 ScriptGen (shared/script-gen.js)
`ScriptGen.generate(lead, cfg)` → `{lines:[{cue,text}], plain}`. Deterministic template
that turns intake (goals, goalText, question answers, sim on/off) into a warm, personalized
~8-line video script: Warm open → reflect goal → acknowledge concern → recommendation
(per-goal clinical suggestion map) → tie-to-preview (if sim) → match timeline → clear next
step (book) → warm close. This is the explicit seam for one real Claude API call.

### 6.3 Patient flow (patient/)
Mobile phone-frame flow. Two demo toggles above the frame: **Custom questions** and
**Smile simulation**. Steps (`data-key`): `welcome → goals → photos → [sim] → [questions]
→ contact → confirm`. Flow is computed by `buildFlow()`; **when sim is on, the sim gate
REPLACES the standalone contact step** (it collects contact). 

- **Welcome:** doctor headshot (embedded base64), name/credential, ★rating, one-line
  stats, value prop + 3-step "how it works", trust pills. Copy rewrites when sim on.
- **Goals:** tap chips (Whiter teeth, Straighter, Close gaps, Fix chips, Full makeover,
  Not sure) OR free-text; continue enabled when ≥1 or text.
- **Photos:** procedure guidance cards + 2 shot tiles (Big smile, Close-up); real camera
  with file fallback; per-photo upload progress sim; "Use these photos" appears when both
  done.
- **Sim gate (if on):** blurred before/after `<canvas>` reveal locked behind email+phone;
  on unlock, un-blur + draggable before/after slider; fires conversion pixel; this is the
  reward + the contact capture. Stylized canvas smile (whiter "after"), honest-preview
  disclaimer.
- **Questions (if on):** the 3 configured custom questions (text/choice/select).
- **Contact (if sim off):** first name + email (+ optional phone), summary card,
  doctor-forward trust line.
- **Confirm:** warm, doctor-forward, sets 5–7 day SLA expectation, confetti, links to view
  it land in the console.

`persist()` upserts the lead at every step (partial capture). Captures UTMs + click IDs +
`?from=` + referrer from the URL. `fireConversionPixel()` logs the payload (Meta/GA4 seam)
to a visible "dev console" panel.

### 6.4 Practice console (doctor/)
Top bar: brand, nav (**Consult queue / Performance / Settings**), role picker (populated
from `config.staff`), 🎨 Brand button, Reset demo, link to patient flow.

**Queue view:** SLA line (queue size, overdue, median time-to-send). Filters: All /
Assigned to me / Unassigned / 🔥 Hot / Recover (abandoned) / Sent-awaiting-action. Lead
rows sorted by **heat rank then SLA urgency**: avatar(photo|initials), name (or "Anonymous
lead"), goal chips, source badge, "dropped at <step>" badge, SLA countdown (ok/warn/over
colors), time-ago, assignee, status pill, "✨ preview unlocked".

**Lead drawer (consult workspace):** a **stage-engine** `nextAction(lead)` returns the
single primary action per status. Sticky CTA bar at top shows it (Open Consult Studio →
Send video consult → waiting → Send booking nudge → conversion box). Cards:
- **Status:** pipeline chip strip (done/current) + **manual status** override dropdown.
- **Smile simulation** (if `sim.enabled`): drawable before/after + **Whiteness** and
  **Keep it natural** sliders → `saveSimTweak` (shared with studio preview slide + portal).
- **Patient photos**, **Goals & intake** (+ source/campaign), **AI-drafted video script**
  (from ScriptGen) with copy.
- **Send & follow-up:** demo "simulate viewed/booked", behavior nudges (watch / book /
  recovery). When booked: **conversion box** — attended ✓, paid ✓, treatment value $,
  conversion notes (feeds revenue/ROAS).
- **Assignment** (from staff; recording gated by `canRecord`), **Tags** (toggle), **Notes**.

**Consult Studio (full-screen recorder):** present the case like a screenshare with webcam
PiP, in **landscape (1280×720) or phone-portrait (720×1280)**. Auto-built slide deck from
the case: Intro → Patient photos → Smile preview (uses `sim.tweak`) → Recommended plan
(planFor: per-goal ballpark $ + financing). Per-frame canvas compositor draws the active
slide + the webcam PiP (cycle: bottom-right / bottom-left / large / full talking-head /
**camera-off avatar with audio-reactive pulse ring** using a Web Audio analyser on the mic).
Left = slide strip (jump/reorder/delete + "add text slide"); right = tabs: **Edit slide**
(field-based: heading/body/plan items/caption/teleprompter note; move/delete) | **Cases**
(before/after library, seeded + uploadable, searchable, click to insert "here's someone
like you" slide) | **Brand** (opens brand modal). Teleprompter overlays the per-slide
script. Record/stop/use → `saveVideo` + status `recorded`. Brand (logo + primary/accent +
doctor photo) themes every slide live.

**Performance view:** time-range control (All / Last 90 / Last month / Custom dates) +
two sub-tabs:
- **Funnel & revenue:** KPI hero cards (median time-to-send, lead→booked, booked→paid,
  attributed revenue + ROAS, video view rate); **conversion funnel with drop-off**
  (Started→…→Paid, % of start + dropped count); **video engagement** (view rate, avg
  views, avg % watched, sim-unlock rate); **conversion** (lead→booked, booked→paid, avg
  case, revenue, ROAS); **by-source table** (spend, CPL, sent, viewed, booked, paid,
  revenue, CPA, ROAS).
- **Link-in-bio:** total taps, free-preview CTA taps (% of taps), links-live; taps-by-link
  bar chart (primary highlighted); preview/share the bio URL. Respects the date range.

**Settings view (sidebar sections):** Practice & doctor · Brand & theme (logo, colors,
doctor photo, live slide preview) · Team & permissions (add/remove staff, "can record"
toggle) · Intake questions (CRUD + reorder, type select, options) · Reviews & ratings ·
Landing page (copy + Preview/Copy-URL/Share) · Link-in-bio (links editor + Preview/Share) ·
Directory profile (NEW: listing summary + Preview/Share of `../directory/?doctor=<id>`) ·
Embeddable widgets (live previews of all 3 widgets, customizable, with copyable `<script>`
snippets) · Tracking & attribution (pixel IDs + **source-alias editor**: map raw utm_source
→ channel) · Marketing spend (line-items: description + source dropdown + $/mo, summed per
channel). Text edits save on blur; structural ops re-render. Inputs deep-set into config
via a dotted-path `cfg(path,value)` setter.

### 6.5 Directory (directory/)
Simulation-first lead engine ("the Crisalix flip"): hero pitches "see your new smile free,
then meet the doctor", CTA → patient flow. Filters: location text + "use my location"
(geolocation), distance slider, **goal chips**, name/clinic search; sort by nearest / top-
rated / fastest-response. **Live map** with pins positioned from real lat/lng (haversine
distance). Doctor cards: NPI-verified badge, specialty, ★rating, clinic+city+distance,
response-time badge (the **featured doctor's badge is computed live from the console's
median time-to-send** — fast work earns ranking), goals-treated tags, financing-from,
"Free preview" CTA + "View profile". Profile modal: stats, before/afters, bio, NPI line,
CTA into patient flow. Deep link `?doctor=<id>` opens a profile directly. Seeded with
**real NPI-verified Orange County dentists** (real name/NPI/city/specialty from the NPPES
registry; ratings/financing are clearly-marked demo). Data + geo helpers in
`shared/directory-data.js` (`SmileDirectory.{DOCTORS,GOALS,CITY,coordsFor,haversineMi}`).

### 6.6 Patient portal (portal/)
Where the patient lives post-capture. Accessed via `?lead=<id>` (defaults to a sent-video
lead). First visit: **set-password gate** (simulated → `setPassword`). Then: watch the
video (player placeholder since the blob is session-only in the console; shows duration +
"recorded by Dr. X"); **replay their smile sim** (before/after slider from `sim.tweak`);
**share with a partner** (copy link + mailto); **message the doctor** (thread from
`lead.messages`, send → `addMessage`, live via `onChange`); doctor info/contact; and
doctor-configured **CTAs** (primary book + `config.links`). Warm, mobile-first.

### 6.7 Landing page (site/)
Auto-generated standalone practice site, brand-themed from config (sets CSS vars from
`brand.primary/accent`). Sections: hero (headline/subhead/CTA from `config.site`) → reviews
(Google/Yelp star chips from `config.reviews`, gated by `showReviews`) → before/after
canvas slider → 3-step how-it-works → meet-the-doctor → final CTA band → footer
(phone/email/address). **No directory backlinks** (reads as the practice's own site). Only
outbound link is the patient flow (`../patient/?from=site`).

### 6.8 Link-in-bio + widgets (link/, embed/)
- **link/**: Linktree-style bio page, brand-themed; logo/avatar, ★rating, tagline; prominent
  primary CTA → `../patient/?from=link`; custom links from `config.links`. Every tap calls
  `trackClick(id)` (primary id = `'primary'`) **before** navigating.
- **embed/widget.js**: self-contained IIFE that injects its own scoped styles (prefix
  `.sv-w*`) and reads config from its own `<script data-*>` attributes. 3 widget types via
  `data-widget`: **inline** CTA card, **floating** bottom-right pill, **review badge**.
  Also supports `data-mount="auto"` to hydrate `[data-sv-widget]` placeholders, and exposes
  `window.SmileWidget.render(target,opts)`. Defaults `data-target` to `../patient/`.
- **embed/index.html**: gallery rendering all 3 widgets live + copy-paste `<script>`
  snippets (HTML-escaped, `</script>` split) + a 3-step how-to.

---

## 7. Aesthetic Virtual — detailed spec

### 7.1 Concept hub + strategy
`aesthetic/index.html` (plum theme) presents the vision; full write-up in
`AESTHETIC_VIRTUAL.md` (§1.2 summary + per-specialty workflows, reuse-vs-redesign,
the personalization ladder, qualification routing, config/intake/AI/conversion per
specialty, business model/ops/ROI, suggested build order). No smile-sim anywhere.

### 7.2 Plastics — AestheticStore + patient flow + console

**AestheticStore (aesthetic/store.js)** — own namespace.
- **Procedures catalog** (`PROCEDURES`): rhinoplasty, breast aug, breast lift, tummy tuck,
  liposuction, facelift, eyelid, mommy makeover — each `{id,label,icon,from,to,mo(financing
  /mo),region:'face'|'breast'|'body', photos:[{label,hint}]}`. `region`+`photos` drive
  **treatment-specific photo requests**. `S.photoSet(procedureIds)` merges/dedupes the
  photo set across selected procedures (cap ~4; default Front+Profile).
- **Lead schema:** `{id,createdAt,vertical:'plastics',status:'new'|'recorded'|'sent'|
  'viewed'|'booked', furthestStep, procedures:[id], goalText, photos:[], consent:bool,
  intake:{timeline,budget,smoker,priorSurgery}, contact, source, video, booking:{bookedAt,
  apptTime,attended,paid,value/treatmentValue,note}}`. Decorated reads attach
  `qual = qualify(lead)`.
- **Qualification** `qualify(lead)` → `{score,tier,value,flags}`. Score 0–100:
  value tier (procedure max price /30000 ×40) + readiness (timeline ASAP 30 / 1–3mo 22 /
  3–6mo 12 / researching 4) + budget (ready 30 / financing 22 / exploring 8). tier: ≥70
  hot, ≥45 warm, else cold. flags from smoker/prior-surgery.
- **Before/after library** for the studio: `cases()/addCase/removeCase`; seeded as
  environment-agnostic **SVG data-URL** before/after pairs by region (no canvas → works in
  node tests).
- Config: surgeon{name,credential:'MD, FACS',specialty,photo,rating,reviews,city,state,
  phone,email,bio}, brand{name,primary:'#4A2F50',accent:'#C98B86'}, financing{partners:
  [Cherry,PatientFi,CareCredit]}, depositAmount:250, analytics, links, spendBySource
  {instagram,google,tiktok}. `analytics()` → funnel(started/lead/sent/viewed/booked/paid),
  revenue, pipeline (Σ est. value of open leads), avg, conv{leadToBooked,bookedToPaid},
  by-source (spend/cpl/roas/pipeline), tier mix.

**Plastics patient flow (aesthetic/patient/):** phone frame, surgeon-forward, **no sim**.
Steps: welcome → procedure (procedure chips + free-text) → photos (treatment-specific
dynamic N tiles from `photoSet`, per-shot guidance, **consent checkbox gate**, real camera
+ fallback) → questions (timeline / budget-financing readiness w/ financing hint / smoker /
prior surgery) → contact (name/email/phone) → confirm (surgeon records personal video in
2–3 days, financing, **refundable deposit** to book). Persists every step; computes/show
the qualification result in the dev console on submit.

**Plastics console (aesthetic/console/):** nav Consult queue / Performance / Settings.
- **Queue** triaged by **qualification tier** (hot→warm→cold, done last): procedures, est.
  value, timeline, source, candidacy flags, status.
- **Drawer:** qualification ring (score/tier/value/flags), confidential photos, procedures+
  intake, ballpark+financing, **AI-drafted surgeon script** (plastics: per-procedure
  approach map, candid candidacy + nicotine note, financing, deposit), primary CTA
  (Record consult video → Send → viewed → Booked), conversion box (attended/paid/value).
- **Consult Studio:** slide deck Intro → Patient photos → "A result like yours" (before/
  after from the library) → Plan & cost → Book consult (deposit); webcam PiP (corners/full/
  off); teleprompter; **Edit-slide tab** (headings/body/plan-lines/note, add/reorder/
  delete) + **Before & afters tab** (seeded + uploadable pairs, search, insert). Records
  composite canvas+mic.
- **Closing page modal:** surgeon video (or placeholder), plan + financing partners,
  **"Book consult — $X refundable deposit"** → booked.
- **Performance:** KPIs (hot, open pipeline value, revenue, avg case, lead→booked), funnel
  with drop-off, lead-quality tier mix, conversion, by-source pipeline/ROAS table.
- **Settings (sidebar):** Practice & surgeon, Brand & theme (colors), **Procedures &
  pricing** (editable from/to/financing per procedure — edits drive scripts + closing page
  because `procById` reads the saved catalog), Financing & deposit, Tracking & spend,
  Link-in-bio, Public pages.

### 7.3 Med Spa — MedSpaStore + Plan Builder + patient flow

**The flagship net-new idea: an AI treatment plan replaces the recorded video** (scalable
for high volume, low value — the provider approves/edits in one tap; no filming).

**MedSpaStore (aesthetic/medspa/store.js)** — own namespace.
- **Concerns** (`CONCERNS`): fine lines & wrinkles, lost volume, lips, texture & pores,
  acne & scarring, sun damage & pigment, redness & rosacea, unwanted hair, double chin —
  `{id,label,icon}`.
- **Treatments** (`TREATMENTS`): tox ($12/unit), filler ($750/syringe), lipfiller ($700),
  microneedling ($500/session), peel ($200), ipl ($400), kybella ($600/vial),
  lhr (`perArea:true`, price per area), skincare ($300/set). `{label,unit,price,perArea?}`.
- **Treatment AREAS** (`AREAS`) — the qualification layer: each `{id,label,concern,tx
  (treatment id), qty (default units/sessions), price?(flat per-area, e.g. LHR)}`. Examples:
  wrinkles→{forehead 10u, frown 20u, crow's feet 24u, bunny 6u}; volume→{cheeks 2 syringes,
  smile lines 1, marionette 1, jawline 2, tear trough 1, chin 1}; lips→{lips 1}; texture→
  {full-face series 3, skincare 1}; acne→{active acne peels 3, scarring microneedling 3};
  pigment/redness→ipl by zone (face/neck/hands) 3; hair→LHR per area with flat prices
  (upper lip $300, chin $350, underarms $450, bikini $600, brazilian $900, full legs
  $1200); chin→submental kybella 2 vials. Helpers `areasByConcern(id)`, `areaById(id)`.
- **Per-practice pricing config:** `config.treatmentPrices{txId:$}` and
  `config.areaPrices{areaId:$}` overrides; `priceOf(tx)` and `areaPrice(area)` read them.
  So two spas with different prices produce different, directionally-accurate estimates
  with no code change. `getProcs`-style: pricing resolvers read saved config.
- **AI plan engine** `planFromAreas(areaIds)` → group selected areas by treatment; for
  unit treatments line.qty = Σ area.qty, total = qty×priceOf(tx); for per-area (LHR) line
  total = Σ areaPrice, qty = count. Then `finalizePlan`: subtotal, **bundle discount**
  (10% if ≥2 treatments, editable), total, **financingMo** (≥$49, total/12), `membership:
  true`. `recommend(concerns)` = plan from each concern's primary area (used by seeds /
  fallback). Each line carries `{id,label,unit,qty,price,total,areas:[labels]}`.
- **Lead schema:** `{id,createdAt,vertical:'medspa',status:'new'|'plan_ready'|'sent'|
  'booked', furthestStep, concerns:[id], areas:[id], goalText, photos, intake:{timeline},
  contact, source, plan:{lines,subtotal,discount,discountPct,total,financingMo,membership},
  _edited:bool, booking:{bookedAt,value,membership,note}}`. `upsert` re-drafts the plan from
  areas (fallback concerns) when those change *unless* a provider has `_edited` it; first
  draft flips status new→plan_ready. `savePlan(id,plan)` finalizes + sets `_edited`.
- Config: spa{name:'Lumière Aesthetics',tagline,rating,reviews,city,state,phone,booker},
  brand{primary:'#7A3E55',accent:'#D98E86'}, membership{name:'Glow membership',priceMo:99,
  perks:[]}, financing{partners:[Cherry,PatientFi]}, **autoApproveUnder:600** (plans under
  this are "auto-sendable" — the volume lever), treatmentPrices{}, areaPrices{}.
  `analytics()` → funnel(Leads/Plan ready/Sent/Booked), revenue, pipeline, avg, memberRate,
  autoRate (% of plans under threshold), members count.

**Med-spa patient flow (aesthetic/medspa/patient/):** concern-led, **instant plan = the
reward, no video, no required photo**. Steps: welcome (spa-forward) → concerns (chips +
free-text + "how soon" quick chips) → **areas** (per selected concern, area sub-chips each
showing a **live per-area $ estimate**; primary area pre-selected) → **plan** (instant AI
plan render: treatment lines, bundle savings, total, financing, membership card) → contact
→ confirm (coordinator texts plan + booking link). Persists each step; plan built from
selected areas (`planFromAreas`).

**Plan Builder console (aesthetic/medspa/):** nav **Plan queue / Performance / Settings**.
- **Queue** filters: Needs review (new/plan_ready) / All / Sent / Booked; sorted needs-
  review first then plan value; rows show concerns, est. plan value, status, source, and an
  **"auto-sendable"** flag when value < `autoApproveUnder`.
- **Drawer:** concerns + intake + photos; the **editable AI plan** (the centerpiece): line
  items with editable **qty** and **unit price**, line totals, remove, "+ add treatment"
  (catalog select), **bundle discount %** input, **membership toggle**, financing, total;
  **Regenerate** (re-draft from areas); primary **"✓ Approve & send plan"** (one tap →
  status sent), preview, simulate booked. Booked → conversion box (membership ✓, value).
  Edits via `withPlan(id,fn)` → `savePlan` (recompute + re-render).
- **Patient plan-page modal (the artifact):** branded, named ("Hi {name} — here's your
  plan"), line items, bundle savings, total, **Glow membership offer** (add-and-save
  checkbox), financing partners, **"Book & reserve my plan"** → booked + membership attach.
- **Performance:** KPIs (plans drafted, sent, booked, **membership attach %**,
  **auto-sendable %**, revenue), plan funnel, pipeline + avg booked + members line.
- **Settings (sidebar):** **Treatment menu & pricing** (edit per-unit prices + per-area LHR
  prices — the key to directional accuracy), Membership & automation (membership name/price
  + auto-send threshold), Spa & brand (profile + colors). Pricing edits flow into every
  estimate.

---

## 8. Cross-cutting behaviors

- **Qualification routing** (aesthetic core): score leads on value × readiness × budget
  (+ candidacy flags) → tier → route to the cheapest sufficient response (plastics: surgeon
  video for hot/in-budget, nurture otherwise; med spa: auto-send under threshold, else
  one-tap approve).
- **Attribution:** capture full UTMs + click IDs + referrer + `?from=`; resolve a friendly
  **channel** via a configurable alias map (fallback referrer→Direct); group all analytics
  by channel; scale monthly spend to the selected date window for CPL/CPA/ROAS.
- **"Money first" for aesthetics:** pricing, packages, **memberships**, financing pre-qual
  (Cherry/PatientFi/CareCredit), and **deposits** are first-class, not afterthoughts.
- **Personalization ladder** (med-spa thesis, cheapest effort first): (1) AI plan (0
  filming) → (2) assembled video from a clip library → (3) 30-sec voice note → (4) group
  consult events → (5) instant self-serve. Tiered triage routes each lead to the cheapest
  sufficient rung.

---

## 9. Seed data requirements
Every store ships a rich, "alive" seed so the consoles aren't empty: leads across all
statuses/tiers/sources, with realistic intake, some paid bookings (revenue), messages,
and (dental) timestamped click events + watch %. Bumping the `seeded.vN` key forces a
reseed; a "Reset demo" button clears + reseeds. Use clearly-fictional names; only the
dental **directory** uses real NPI-verified provider identities (name/NPI/city/specialty),
with all clinical/marketing fields marked illustrative.

---

## 10. Acceptance criteria (per surface)
- A patient can complete each flow on mobile; every step persists; an abandoned lead still
  appears in the relevant console queue.
- Dental: completing the flow (sim on) lands a 🔥 hot lead at the top of the doctor queue;
  the doctor can record in the Consult Studio, send, preview the closing page, and the
  patient portal reflects the same lead.
- Plastics: a submitted lead shows a qualification tier; the surgeon can record a slide+PiP
  video and convert via a deposit-gated closing page.
- Med spa: concerns+areas produce an instant, area-accurate plan; the provider edits +
  approves it in the Plan Builder; the patient plan-page books + attaches a membership;
  changing prices in Settings changes every estimate.
- Performance views compute funnels/ROAS from store data and respect the date range.
- All JS passes `node --check`; all pages return HTTP 200 when served; no console errors on
  load; views never blank (guard against stale-cache via `?v=`).

---

## 11. Production seams (explicitly stubbed)
- `shared/store.js` (+ AestheticStore/MedSpaStore) → real API/DB; method surface unchanged.
- `ScriptGen.generate` and med-spa `recommend/planFromAreas` → real Claude API calls.
- Smile-sim canvas → real sim engine on the patient's photo (dental only).
- `fireConversionPixel` → real Meta Pixel / GA4 / server-side, with click-ID offline
  conversion upload; webhook/CRM endpoint.
- Recorded video object URL → uploaded asset URL.
- Google/Yelp ratings, "did they pay", before/after galleries → real APIs / PMS sync /
  consented uploads.
- Multi-device (phone→laptop) → real backend (localStorage is per-browser).

---

## 12. Reproduction order
1. `shared/tokens.css` + `shared/store.js` (SmileStore: schema, status/heat/SLA, config,
   analytics, seed) + `shared/script-gen.js`.
2. `patient/` dental flow (earned commitment + sim gate). Verify it lands leads.
3. `doctor/` console: queue → drawer (stage-engine) → Consult Studio → Performance →
   Settings. (Largest surface.)
4. `index.html` hub; cache-bust `?v=`.
5. `directory/` (+ `shared/directory-data.js`), `portal/`, `site/`, `link/`, `embed/`.
6. `AESTHETIC_VIRTUAL.md` + `aesthetic/index.html` concept hub.
7. Plastics: `aesthetic/store.js` → `aesthetic/patient/` → `aesthetic/console/` (+ studio).
8. Med spa: `aesthetic/medspa/store.js` (concerns/areas/treatments/pricing/plan engine) →
   `aesthetic/medspa/` Plan Builder console → `aesthetic/medspa/patient/`.
9. Verify each surface against §10; bump seed keys; commit.

— End of specification —
