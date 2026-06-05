# SmileVirtual ↔ Clara View — Smile Simulation API Request

> **From:** SmileVirtual (platform partner)
> **To:** Clara View (https://claraview.ai)
> **Purpose:** Define the secure API we need from Clara View to power AI smile
> simulations inside the SmileVirtual patient and doctor experiences. This document
> describes (a) the end-user experience so the endpoints have context, and (b) the
> concrete endpoints, payloads, and security properties we're requesting.
>
> Treat every request/response example as a **proposal** — we want your input on
> shapes, parameters, and limits. Items we explicitly need answered are collected in
> §9 *Open questions*.

---

## 1. Who we are and how we integrate

SmileVirtual is a multi-tenant platform for dental/ortho practices. Each **practice**
(tenant) runs a virtual-consultation funnel: a patient submits goals + photos, gets an
**instant AI smile preview**, and the doctor follows up with a personalized video.

Clara View is our smile-simulation engine. The integration is **server-to-server**:

```
Patient phone ──photos──▶ SmileVirtual backend ──▶ Clara View API ──▶ rendered simulation
                                  ▲                                          │
                                  └──────────── webhook / poll ◀────────────┘
```

Key consequences of this topology, which shape the requests below:

- **The browser never talks to Clara directly** and never holds a Clara credential.
  All calls are made by our backend. Please scope auth to a single platform client
  (SmileVirtual), not to end users.
- **We are multi-tenant.** Every call carries a `practice_id` so you can scope,
  rate-limit, and meter usage per dental practice. We'd like sub-account support if you
  have it (see §9).
- **Simulations are part of a healthcare funnel.** Photos are face/biometric data. We
  need a BAA and the security properties in §6.

---

## 2. The user experience we're powering (why we need each endpoint)

### 2.1 Patient flow — the *instant auto-preview* (drives `create` + `get`)

1. Patient picks **goals** (e.g. *Whiter teeth*, *Straighter teeth*, *Close gaps*,
   *Reshape/veneers*) and optionally free-text describes what they want.
2. Patient captures/uploads **photos** — typically a front smiling shot and a front
   close-up; sometimes a resting/profile shot.
3. We **create a simulation** with those photos + goals and immediately show the patient
   a "generating your new smile…" state.
4. When the render is ready (webhook), we reveal a **before/after slider**. The reward of
   seeing their potential smile is what unlocks the contact step — so **latency and
   reliability matter**; this is the conversion moment.

> We need: submit photos + structured goals → get back a **same-framing before/after
> pair** suitable for a drag-to-compare slider, plus quality signals so we can handle bad
> inputs gracefully.

### 2.2 Doctor flow — *refine before sending* (drives `revisions` / `refine`)

The doctor reviews the auto-preview inside our console before sending the patient their
personalized video. They want to **tune** the result so it's honest and on-brand — today
our prototype exposes two dials:

- **Whiteness** (`white`, 0–1): how bright the post-treatment teeth are.
- **Natural ↔ dramatic** (`natural`, 0–1): how much real-world imperfection is retained
  vs. an idealized result.

The doctor's tuned version is what the patient ultimately sees. The **original
auto-preview must be preserved** (the patient may have already seen it), so editing must
produce a **new revision**, not overwrite.

> We need: take an existing simulation + adjusted parameters → produce a **new revision**
> with the **same framing/alignment** as the original (so the slider still lines up),
> while keeping prior revisions retrievable.

### 2.3 Patient portal — *replay* (drives `get`)

After the doctor sends, the patient can revisit a portal that **replays the (refined)
simulation** alongside the video. This just re-fetches the chosen revision's output, so
we need **durable retrieval** of a specific revision (with refreshable signed URLs).

### 2.4 Compliance — *deletion* (drives `delete`)

Practices and patients can request data deletion. We need to **delete a simulation and
its source photos/derivatives** on demand and receive confirmation, plus a documented
default retention window.

---

## 3. Integration principles we're asking you to honor

1. **Async job model.** Rendering is not instant; don't make us hold an HTTP connection
   open. `create`/`refine` return a job; completion arrives via **webhook** (with polling
   as a fallback).
2. **Idempotency.** `create`/`refine` accept an `Idempotency-Key` so network retries
   don't double-charge or double-render.
3. **Signed, expiring URLs** for both image **input** (we upload to a Clara-issued URL)
   and image **output** (you return short-TTL signed URLs). No image bytes in JSON
   bodies or logs.
4. **Versioned API** (`/v1/...`) with additive, backward-compatible changes.
5. **Correlation, not coupling.** We pass our own `external_ref` (our lead id) on every
   object so we can reconcile; you never need our internal schema.
6. **Sandbox first.** A non-production environment with deterministic test fixtures so we
   can build/CI against you without real PHI or charges.

---

## 4. Authentication & authorization

We request **OAuth 2.0 Client Credentials** (machine-to-machine).

```http
POST /oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=sv_live_xxx
&client_secret=••••••
&scope=simulations:write simulations:read simulations:delete
```

```json
{ "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 3600, "scope": "simulations:write simulations:read simulations:delete" }
```

Requirements:

- **Short-lived bearer tokens** (≤1h) obtained by our backend; never exposed client-side.
- **Scopes**: at minimum `simulations:read`, `simulations:write`, `simulations:delete`.
- **Per-tenant attribution** via a `practice_id` field on requests (and/or, preferably,
  issuable **sub-account credentials** per practice — see §9).
- **Key rotation** without downtime (overlapping valid secrets).
- Optional but welcome: **mTLS** or IP allow-listing for our backend egress.

---

## 5. Endpoints we need

| # | Method & path | Purpose |
|---|---------------|---------|
| 1 | `POST /oauth/token` | Get a bearer token (M2M). |
| 2 | `POST /v1/uploads` | Get a signed URL to upload a source photo. |
| 3 | `POST /v1/simulations` | Create a simulation job from photos + goals. |
| 4 | `GET  /v1/simulations/{id}` | Fetch a simulation + its revisions/outputs. |
| 5 | `POST /v1/simulations/{id}/revisions` | Refine: create a new revision with adjusted params. |
| 6 | `GET  /v1/simulations/{id}/revisions/{rev_id}` | Fetch a specific revision (replay). |
| 7 | `DELETE /v1/simulations/{id}` | Delete a simulation + all source/derived images. |
| 8 | *(webhook → us)* `simulation.completed` / `simulation.failed` | Async completion callback. |

### 5.1 `POST /v1/uploads` — get a signed upload target

Request:

```json
{ "practice_id": "prac_123", "content_type": "image/jpeg", "role": "front_smile" }
```

Response:

```json
{
  "upload_id": "up_abc",
  "upload_url": "https://uploads.claraview.ai/...&X-Signature=...",
  "method": "PUT",
  "expires_at": "2026-06-05T18:25:00Z"
}
```

We `PUT` the image bytes directly to `upload_url`, then reference `upload_id` when
creating the simulation. (If you'd rather accept multipart on `POST /v1/simulations`,
tell us — we just want to avoid base64 in JSON.)

### 5.2 `POST /v1/simulations` — create

```json
{
  "practice_id": "prac_123",
  "external_ref": "lead_7f3a",
  "photos": [
    { "upload_id": "up_abc", "role": "front_smile" },
    { "upload_id": "up_def", "role": "front_closeup" }
  ],
  "goals": ["whiten", "align", "close_gaps"],
  "goal_text": "I'd love a brighter, straighter smile for my wedding.",
  "treatments": ["whitening", "orthodontics", "bonding"],
  "parameters": { "whiteness": 0.9, "naturalness": 0.2 },
  "output": { "comparison": "aligned_pair", "max_dimension": 1600 }
}
```

- `goals` — normalized goal tags (your enum; our current set: `whiten`, `align`,
  `close_gaps`, `reshape`, `veneers`).
- `treatments` — optional scope hint for which modalities to simulate.
- `parameters` — tunable knobs (we currently expose whiteness + naturalness; please tell
  us the full set you support — see §9).
- `output.comparison: "aligned_pair"` — we need before/after in **identical framing** for
  a slider.

Response (job accepted):

```json
{
  "id": "sim_001",
  "status": "processing",
  "external_ref": "lead_7f3a",
  "created_at": "2026-06-05T18:20:00Z",
  "estimated_ready_in_seconds": 25
}
```

### 5.3 `GET /v1/simulations/{id}` — fetch result

```json
{
  "id": "sim_001",
  "status": "completed",
  "external_ref": "lead_7f3a",
  "parameters": { "whiteness": 0.9, "naturalness": 0.2 },
  "current_revision": "rev_001",
  "revisions": [
    {
      "id": "rev_001",
      "created_by": "auto",
      "parameters": { "whiteness": 0.9, "naturalness": 0.2 },
      "outputs": {
        "before_url": "https://cdn.claraview.ai/...sig...",
        "after_url":  "https://cdn.claraview.ai/...sig...",
        "framing": "aligned_pair",
        "expires_at": "2026-06-05T19:20:00Z"
      },
      "quality": { "score": 0.93, "warnings": [] }
    }
  ]
}
```

- **Same-framing `before_url` / `after_url`** is the core deliverable for the slider.
- `quality.warnings` — e.g. `photo_too_dark`, `teeth_not_visible`, `face_not_detected`,
  `multiple_faces` — so we can prompt the patient to retake instead of showing a bad
  result.
- Output URLs are **signed + expiring**; we expect to re-`GET` to refresh them (please
  don't make us re-render to get a fresh URL).

### 5.4 `POST /v1/simulations/{id}/revisions` — refine (the doctor edit)

```json
{ "parameters": { "whiteness": 0.85, "naturalness": 0.3 }, "created_by": "dr_harris" }
```

Returns a **new revision** (async, same lifecycle as create) computed off the original
inputs with the **same framing** as `rev_001`. The original revision remains retrievable.
We'll set `current_revision` (the one patients see) on our side based on which revision
the doctor approves.

### 5.5 `DELETE /v1/simulations/{id}`

Deletes the simulation, all revisions, and all source/derived images. Returns `204`.
Document the default retention window and whether deletes are immediate vs. queued.

### 5.6 Webhook → SmileVirtual

```http
POST https://api.smilevirtual.com/webhooks/claraview
X-ClaraView-Signature: t=1717610400,v1=hex_hmac_sha256
Content-Type: application/json
```

```json
{
  "type": "simulation.completed",
  "id": "sim_001",
  "revision_id": "rev_001",
  "external_ref": "lead_7f3a",
  "occurred_at": "2026-06-05T18:20:25Z"
}
```

- Events: `simulation.completed`, `simulation.failed` (with `error` block).
- **HMAC-signed** with a shared secret, including a timestamp; we reject stale/replayed
  signatures (≥5 min skew).
- We respond `2xx`; please **retry with backoff** on non-2xx.

---

## 6. Security & compliance requirements (the core ask)

1. **TLS 1.2+** on all endpoints; HSTS.
2. **Encryption at rest** for all photos and derivatives.
3. **BAA / HIPAA**: photos are face/biometric PHI. We need a signed BAA and a description
   of how you handle, isolate, and dispose of patient images. Confirm whether images are
   ever used for **model training** — if so we need an explicit opt-out (default off).
4. **Signed, short-TTL URLs** for all image input and output. No image bytes in logs.
5. **HMAC-signed webhooks** with timestamp + replay protection.
6. **Tenant isolation**: one practice can never read another's simulations; `practice_id`
   scoping enforced server-side, not just by obscurity of ids.
7. **Data retention + deletion**: documented default retention, a working `DELETE`, and
   support for a per-practice retention policy.
8. **Data residency**: tell us region(s) where images are stored/processed.
9. **Secret rotation** without downtime; **scoped** credentials.
10. **Audit log**: per-call record (who/when/what) retrievable for a practice.
11. **Subprocessors**: list any third parties that touch the images.

---

## 7. Operational requirements

- **Rate limits**: per-practice and per-platform; return `429` + `Retry-After`; tell us
  default ceilings.
- **Idempotency**: `Idempotency-Key` header on `create`/`refine`.
- **Versioning**: `/v1`; deprecation policy with notice window.
- **Sandbox**: non-prod base URL + test credentials + deterministic fixtures (incl.
  sample "bad photo" inputs that return each `quality.warning`).
- **SLA / latency**: typical and p95 render time; uptime target; status page.
- **Pagination** on any list endpoints.

---

## 8. Error model

Consistent envelope, e.g.:

```json
{
  "error": {
    "code": "invalid_photo",
    "message": "No face detected in upload up_def.",
    "type": "validation",
    "doc_url": "https://docs.claraview.ai/errors/invalid_photo"
  }
}
```

We'd like a stable enum of `code` values for at least: auth failures, invalid/insufficient
photos, unsupported goal/treatment, render failure, rate limiting, not found, and
quota/billing.

---

## 9. Open questions for Clara View

1. **Sync vs async** — do you support async + webhooks as described, or only synchronous
   renders? What are typical/p95 render times?
2. **Multi-tenancy** — can you issue **sub-account credentials** per practice, or should
   we pass `practice_id` and you meter on that? How is per-practice billing reported?
3. **Tunable parameters** — what's the full set of knobs you expose (whiteness,
   naturalness, alignment intensity, gap closure, tooth shape/veneers, gum line, etc.)
   and their ranges? We map our doctor dials to these.
4. **Supported treatments/goals** — which modalities can you simulate today (whitening,
   ortho/alignment, bonding, veneers, gap closure, reshaping)? What's your goal enum?
5. **Input requirements** — required vs optional photo roles/angles, min resolution,
   lighting/quality thresholds, max file size, accepted formats.
6. **Output** — can you guarantee an **aligned before/after pair** in identical framing?
   Do you also return a normalized/cropped "before," masks, or per-treatment layers?
7. **Editing model** — is refine a new **revision** off the original inputs (our
   preference), and does it preserve framing? Any limit on revisions per simulation?
8. **Quality signals** — what warnings/confidence do you return so we can ask patients to
   retake bad photos?
9. **Training & residency** — are images used for training (opt-out?), and where are they
   processed/stored?
10. **Pricing** — per-simulation vs per-revision vs subscription; sandbox/test pricing.

---

## 10. Decisions/assumptions on our side (for your context)

- We will call you **only from our backend**; the patient's browser never holds your key.
- We'll send a **front smiling** photo and usually a **front close-up**; occasionally a
  resting/profile shot. We'll degrade gracefully if you need more.
- We treat the **first render as the patient-facing auto-preview**, and the
  **doctor-approved revision** as the final version shown in the portal.
- We store only your `id`/`revision_id` + signed URLs (refreshed via `GET`), not the image
  bytes long-term, unless you advise otherwise.
- We map our current doctor dials — **whiteness** and **natural↔dramatic** — onto your
  parameter set; we'll expose more dials once we know what you support.

---

*Looking forward to your feedback on shapes, parameters, and limits — especially the §9
items. Happy to jump on a call to align on the async/webhook contract and the BAA.*
