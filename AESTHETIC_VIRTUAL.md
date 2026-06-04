# Aesthetic Virtual — concept & strategy

A parallel concept to **SmileVirtual**, purpose-built for the aesthetic-medicine
market: **med spas, plastic surgeons, and cosmetic/medical dermatology.**

SmileVirtual proved a loop: *capture intent → reward with a preview → personal
video from the doctor → close*. Aesthetics shares the spine but the economics and
the "right" personalization differ enormously by specialty. The product's job here
is **routing the right amount of human effort to the right lead** — a recorded
surgeon video for a $20k rhinoplasty, an AI-built plan for a $12 Botox unit count.

---

## 0. The thesis: one engine, three playbooks

Shared spine (reused from SmileVirtual): **Capture → Qualify → Respond → Book → Grow**,
all on one data loop, one console, one analytics surface.

What changes per specialty is the **Respond** step (the artifact the patient gets)
and the **Qualify** step (who deserves which artifact). That routing decision is the
core new intelligence Aesthetic Virtual adds.

| | Plastic surgery | Med spa | Dermatology |
|---|---|---|---|
| Typical value | $5k–$50k+ | $100–$1,500 (+ memberships) | Cosmetic like med spa; medical = visit-fee/insurance |
| Volume | Low | High | High |
| Consideration | Weeks–months | Days | Hours–days |
| Hero response | **Surgeon recorded video** | **AI treatment plan** (+ assembled clips) | **Async triage** (medical) / AI plan (cosmetic) |
| Provider effort/lead | High, but worth it | Near-zero (review/approve) | Low (protocol + exceptions) |
| Who staffs the queue | Coordinator triages → surgeon records | Front desk / injector PA / aesthetician | MA triage → derm/NP reviews |
| North-star metric | Consult booked & **deposit taken** | Lead→booked + **membership attach** | Async-visit throughput + **cosmetic conversion** |

The unifying principle: **never spend a $400/hr provider on a $12 lead, and never
let a $20k lead get an automated form letter.** A qualification/routing engine
decides; the rest of the workflow flexes around it.

---

## 1. Specialty workflows

### Plastic surgery — "high-consideration concierge"
Closest to SmileVirtual; lean into the personal video, add money + patience.

1. **Intake (procedure-led):** procedure interest (rhino, breast aug/lift, tummy
   tuck, lipo, face), goals in their words, timeline, budget band + financing
   readiness, medical-history red flags (BMI, smoking, prior surgery, meds).
2. **Photos:** procedure-specific multi-angle guidance (rhino → profile/base;
   breast → AP/oblique with explicit consent + privacy handling). Sensitive-content
   capture with consent gating.
3. **Qualify:** candidacy × budget × readiness → route. Serious, in-budget,
   plausible candidates → surgeon video. Out-of-scope/under-budget → automated plan
   + nurture (or a graceful "here's what's realistic" decline).
4. **Respond:** **personalized recorded video from the surgeon** on a premium
   closing page — addresses *their* anatomy honestly, shows before/afters of similar
   cases, explains the procedure, gives a ballpark + financing pre-qual, and books a
   (virtual or in-person) consult **with a deposit**.
5. **Book + deposit:** deposit-gated consults signal seriousness and crush no-shows.
6. **Grow:** long nurture (weeks–months) — education, financing reminders, seasonal
   offers, "still considering?" check-ins; track the full lead→consult→surgery cycle.

*Optional premium add:* 3D visualization (Crisalix-style) for breast/rhino/body.
Not required, sits behind the same gate as the dental sim did.

### Med spa — "personalization at volume, without filming"
The recorded-video model breaks here. Replace the artifact, keep the magic.

1. **Intake (concern-led):** "what bothers you" (lines/wrinkles, lost volume, skin
   texture/tone, acne scars, unwanted hair, body contour), areas, history, how soon.
2. **Photos:** concern-appropriate, light-guided.
3. **Respond — the AI treatment plan is the hero** (no video required): a branded,
   named, instant plan mapping concerns → treatments (Botox unit ranges, filler
   syringes, laser/peel packages, **membership**), transparent pricing, before/afters
   of similar cases, financing, and one **Book & save** CTA.
4. **Provider effort = review/approve in the queue:** AI drafts the plan; the
   injector/PA tweaks units/price and one-taps approve — or it auto-sends for
   standard plans. Only high-value/complex plans get a 15–30s personal voice note or
   an **assembled video** (see §4).
5. **Book + deposit + membership upsell:** convert one-off into recurring (monthly
   tox/facial memberships) — the real med-spa LTV lever.
6. **Grow:** automated rebooking cadence (tox ~every 3–4 mo), win-back, reviews,
   package replenishment.

### Dermatology — split medical vs cosmetic
Two modes under one roof; route at intake by intent.

- **Cosmetic derm** → behaves like the med-spa playbook (AI plan, scalable).
- **Medical / condition derm** → **async store-and-forward teledermatology triage:**
  1. Structured intake for a specific concern (acne, rosacea, suspicious lesion,
     hair loss, rash) + guided condition photos + symptom questionnaire.
  2. **AI pre-assessment** flags urgency (benign / needs-eval / urgent-refer) and
     drafts a structured note — never a diagnosis, always human-reviewed.
  3. **Derm/NP reviews asynchronously** and routes: reassure + skincare plan (with a
     cosmetic upsell), e-prescribe + plan, book in-person, or **urgent referral**.
  4. May be **insurance-billable** or a flat async-visit fee.
- Derm's hidden value: **converting medical patients to cosmetic** and using async
  triage to fill the schedule with the *right* visit type.

---

## 2. Reuse vs. redesign (vs. the existing SmileVirtual code)

**Reuse almost as-is (the platform spine):**
- `shared/store.js` data loop, lead model, status pipeline, heat + SLA.
- The **practice console**: work queue, triage, assignment, notes/tags, roles/perms.
- The **Consult Studio** (recorded video + slides + PiP) — primarily for **plastics**.
- The **closing page** as a conversion surface (video/plan + CTA + book).
- **Landing-page generator, link-in-bio, embeddable widgets, directory, settings,
  brand/theme, attribution & performance analytics.** All specialty-agnostic.

**Redesign / replace:**
- **The "reward/unlock":** dental used a *smile simulation*. Aesthetics replaces it
  with **before/after galleries of similar patients + instant ballpark pricing + a
  candidacy/plan preview** (sim is optional, plastics-only).
- **Intake + qualification logic** (per specialty; the new routing brain).
- **The response artifact:** video (plastics) → **AI plan / assembled video / async
  triage note** (med spa, derm). New "Plan Builder" surface replaces "record" for
  low-value flows.
- **Money first:** pricing, packages, **memberships**, financing pre-qual (Cherry /
  PatientFi / CareCredit), and **deposits** become first-class, not afterthoughts.
- **Booking types:** instant self-serve vs virtual consult vs in-person vs async.
- **Photo capture:** multi-angle/body, **consent & sensitive-content handling.**
- **Compliance:** HIPAA, photo/before-after advertising rules, async-telederm
  regulation, medical-advice disclaimers, MD-supervision/scope rules for injectables
  (varies by state).

---

## 3. Scalable alternatives to recorded video (the core of the brief)

For lower-value, higher-volume work, personalization can't mean "film every lead."
Options, roughly in order of provider effort:

1. **AI personalized treatment plan (hero):** branded, named, concern→treatment
   mapping, pricing, similar-case before/afters, financing, one CTA. *Zero filming.*
2. **Assembled video from a clip library:** the injector records short clips **once**
   per treatment/concern; the system stitches a personalized montage (greeting +
   relevant clips + offer). "Record once, send thousands."
3. **30-second provider voice note** annotating the AI plan — a fraction of video
   effort, keeps the human warmth.
4. **Optional AI voice/avatar** reading the plan in the provider's likeness —
   scalable but requires clear disclosure + consent (flag ethics).
5. **Live group "consult events"** / webinars for common treatments.
6. **Instant self-serve** for standardized treatments (tox units, memberships):
   instant quote → book → deposit; provider reviews only at the appointment.
7. **Tiered triage (the meta-answer):** the qualification engine routes each lead to
   the *cheapest sufficient* response; humans only touch what moves money.

---

## 4. Per-specialty configuration, intake, qualification, AI, conversion

**Configuration (Settings, extended from SmileVirtual):**
- Specialty mode (med spa / plastics / derm) → preset intake, qualification rules,
  response modes, and copy.
- Treatment/service catalog with pricing, units, packages, **memberships**.
- Financing partners + deposit rules. Before/after gallery library (by procedure,
  consented). Clip library (for assembled video). Provider scope/permissions.

**Intake forms:** procedure-led (plastics), concern-led (med spa/cosmetic derm),
condition-led + symptom questionnaire (medical derm). Branching by selection.

**Qualification logic:** score on **value tier × readiness × candidacy × budget**
(+ red-flag/contraindication detection from history). Output = a route:
`instant self-serve | AI plan | assembled video | provider video | in-person | decline/nurture`.

**AI-assisted recommendations:** concern/photo → treatment mapping; unit/syringe
estimation; package & membership suggestions; candidacy & contraindication flags;
financing pre-qual; auto-drafted personalized plan copy + the surgeon's video script.
Guardrails: human-in-the-loop, disclaimers, **not diagnosis**, escalate red flags.

**Conversion workflows:** deposit-gated consults (plastics), Book-&-save + membership
attach (med spa), reassure→cosmetic-upsell and in-person routing (derm); behavior-based
nurture tuned to each consideration cycle.

---

## 5. Business model, operations, ROI

**Platform monetization:** SaaS tiered by specialty + seats + lead/AI-plan volume;
**directory lead-gen** (pay-per-qualified-lead) as a growth channel; payments
take-rate / affiliate on deposits + financing referrals.

**Practice ROI:**
- **Plastics:** one extra $15k case/month dwarfs the subscription; deposits cut
  no-shows; qualification saves scarce surgeon time. Highest willingness-to-pay.
- **Med spa:** convert more web leads to bookings **and memberships** at ~zero
  marginal provider time; rebooking lifts LTV. ROI = volume × attach rate.
- **Derm:** async-triage throughput + **cosmetic conversion** off the medical base;
  reclaim low-value in-person slots.

**Operations:** who staffs the queue differs (coordinator→surgeon; injector/PA;
MA→derm). SLA norms differ (med spa near-instant/automated; plastics 1–3 days
personal). Content/clip/gallery library setup is a real onboarding step. Integrations:
EHR/PM (Nextech, Symplast, ModMed, Aesthetic Record, PatientNow), booking (Boulevard,
Zenoti), payments/financing (Cherry, PatientFi, CareCredit), CRM/marketing.
Compliance: HIPAA, consent, before/after ad rules, telederm regs, injectable
supervision scope.

---

*Build status:* this document + the `aesthetic/` concept hub articulate the vision.
No specialty apps are built yet — see "Suggested build order" in the hub. The
existing SmileVirtual code is the reusable spine.
