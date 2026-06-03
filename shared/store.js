/* =============================================================================
   SmileVirtual — shared data layer
   -----------------------------------------------------------------------------
   A tiny, dependency-free "backend" that lives in localStorage so the patient
   flow and the doctor portal share the SAME data inside one browser. A patient
   submission written here shows up in the doctor's queue on the next load.

   This is the demo seam: in production, swap the read/write/seed internals for
   real API calls (the public method surface — SmileStore.* — stays the same).
   ============================================================================= */
(function (global) {
  'use strict';

  const KEY = 'smilevirtual.leads.v1';
  const CFG_KEY = 'smilevirtual.config.v1';
  const SEEDED_KEY = 'smilevirtual.seeded.v1';

  /* ---- SLA + status model -------------------------------------------------
     The portal's north-star is MEDIAN TIME-TO-SEND. Target SLA below. */
  const SLA_HOURS = 24;

  const STATUS = {
    new:         { label: 'New',          order: 0 },
    in_review:   { label: 'In review',    order: 1 },
    recorded:    { label: 'Recorded',     order: 2 },
    sent:        { label: 'Sent',         order: 3 },
    viewed:      { label: 'Viewed',       order: 4 },
    booked:      { label: 'Booked',       order: 5 },
    no_response: { label: 'No response',  order: 6 }
  };

  /* ---- helpers ------------------------------------------------------------ */
  const uid = () => 'ld_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const now = () => new Date().toISOString();
  const hoursSince = (iso) => (Date.now() - new Date(iso).getTime()) / 36e5;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function write(leads) {
    try { localStorage.setItem(KEY, JSON.stringify(leads)); }
    catch (e) { console.warn('[SmileStore] write failed (quota?)', e); }
    notify();
  }

  /* ---- change notification (so the portal can live-refresh) -------------- */
  const listeners = new Set();
  function notify() { listeners.forEach(fn => { try { fn(); } catch (e) {} }); }
  // cross-tab updates
  global.addEventListener('storage', (e) => { if (e.key === KEY) notify(); });

  /* ---- lead heat (triage priority, not just arrival order) ---------------
     hot  = a complete submission (has contact) still awaiting a video
     warm = got through photos but abandoned before giving contact info
     cold = dropped early (welcome/goals) — low intent
     done = already sent/viewed/booked  */
  function heatOf(lead) {
    if (['sent', 'viewed', 'booked', 'no_response'].includes(lead.status)) return 'done';
    const hasContact = !!(lead.contact && lead.contact.email);
    const hasPhotos = (lead.photos || []).filter(Boolean).length >= 1;
    if (hasContact && hasPhotos) return 'hot';
    if (hasPhotos) return 'warm';
    return 'cold';
  }

  // hours left on the SLA clock (only meaningful while awaiting a send)
  function slaHoursLeft(lead) {
    if (['recorded', 'sent', 'viewed', 'booked', 'no_response'].includes(lead.status)) return null;
    return Math.round((SLA_HOURS - hoursSince(lead.createdAt)) * 10) / 10;
  }

  function decorate(lead) {
    return Object.assign({}, lead, {
      heat: heatOf(lead),
      slaLeft: slaHoursLeft(lead),
      statusLabel: (STATUS[lead.status] || {}).label || lead.status
    });
  }

  /* ---- public API --------------------------------------------------------- */
  const SmileStore = {
    STATUS, SLA_HOURS,

    config() {
      try { return JSON.parse(localStorage.getItem(CFG_KEY)) || DEFAULT_CONFIG; }
      catch (e) { return DEFAULT_CONFIG; }
    },
    saveConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); notify(); },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    all() { return read().map(decorate).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); },
    get(id) { const l = read().find(x => x.id === id); return l ? decorate(l) : null; },

    /* Patient flow calls this repeatedly — at EVERY step — so partial /
       abandoned leads are captured for recovery, not just completed ones. */
    upsert(partial) {
      const leads = read();
      let lead = partial.id ? leads.find(l => l.id === partial.id) : null;
      if (!lead) {
        lead = {
          id: partial.id || uid(),
          createdAt: now(),
          status: 'new',
          furthestStep: 'welcome',
          goals: [], goalText: '', photos: [],
          questionAnswers: {}, contact: {},
          source: {}, assignedTo: null, notes: [], tags: [],
          video: null, booking: null,
          sim: { enabled: false }
        };
        leads.push(lead);
      }
      // shallow merge, with nested merge for the structured bits
      ['goals', 'goalText', 'photos', 'furthestStep', 'sim'].forEach(k => {
        if (partial[k] !== undefined) lead[k] = partial[k];
      });
      if (partial.contact) lead.contact = Object.assign({}, lead.contact, partial.contact);
      if (partial.questionAnswers) lead.questionAnswers = Object.assign({}, lead.questionAnswers, partial.questionAnswers);
      if (partial.source && Object.keys(partial.source).length) lead.source = partial.source;
      lead.updatedAt = now();
      write(leads);
      return lead.id;
    },

    /* doctor-side mutations */
    patch(id, fields) {
      const leads = read();
      const lead = leads.find(l => l.id === id);
      if (!lead) return null;
      Object.assign(lead, fields, { updatedAt: now() });
      write(leads);
      return decorate(lead);
    },
    setStatus(id, status, extra) {
      const stamp = {};
      if (status === 'sent') stamp.sentAt = now();
      if (status === 'viewed') stamp.viewedAt = now();
      if (status === 'booked') stamp.bookedAt = now();
      return this.patch(id, Object.assign({ status }, stamp, extra || {}));
    },
    assign(id, who) { return this.patch(id, { assignedTo: who }); },
    addNote(id, body, author) {
      const lead = read().find(l => l.id === id); if (!lead) return null;
      const notes = (lead.notes || []).concat([{ body, author, at: now() }]);
      return this.patch(id, { notes });
    },
    toggleTag(id, tag) {
      const lead = read().find(l => l.id === id); if (!lead) return null;
      const has = (lead.tags || []).includes(tag);
      const tags = has ? lead.tags.filter(t => t !== tag) : (lead.tags || []).concat([tag]);
      return this.patch(id, { tags });
    },
    saveVideo(id, video) {
      return this.patch(id, { video: Object.assign({ recordedAt: now() }, video), status: 'recorded' });
    },

    /* ---- analytics: the marketing loop -------------------------------- */
    funnelBySource() {
      const rows = {};
      read().forEach(l => {
        const src = (l.source && l.source.utm_source) || 'direct';
        const r = rows[src] || (rows[src] = { source: src, leads: 0, sent: 0, viewed: 0, booked: 0 });
        r.leads++;
        const o = (STATUS[l.status] || {}).order || 0;
        if (o >= STATUS.sent.order && l.status !== 'no_response') r.sent++;
        if (o >= STATUS.viewed.order && l.status !== 'no_response') r.viewed++;
        if (l.status === 'booked') r.booked++;
      });
      return Object.values(rows).sort((a, b) => b.leads - a.leads);
    },
    metrics() {
      const leads = read();
      const sendable = leads.filter(l => l.video && l.video.sentAt);
      const times = sendable.map(l => hoursSince(l.createdAt) - hoursSince(l.video.sentAt))
        .filter(n => n >= 0).sort((a, b) => a - b);
      const median = times.length ? times[Math.floor(times.length / 2)] : null;
      const queue = leads.filter(l => ['new', 'in_review'].includes(l.status));
      const overdue = queue.filter(l => slaHoursLeft(l) < 0).length;
      return {
        queueSize: queue.length,
        overdue,
        medianTimeToSendH: median == null ? null : Math.round(median * 10) / 10,
        sent: sendable.length,
        booked: leads.filter(l => l.status === 'booked').length,
        total: leads.length
      };
    },

    reset() { localStorage.removeItem(KEY); localStorage.removeItem(SEEDED_KEY); this.seed(); notify(); },

    /* ---- demo seed ----------------------------------------------------- */
    seed(force) {
      if (!force && localStorage.getItem(SEEDED_KEY)) return;
      localStorage.setItem(KEY, JSON.stringify(SEED()));
      localStorage.setItem(SEEDED_KEY, '1');
      notify();
    },
    ensureSeeded() { if (!localStorage.getItem(SEEDED_KEY)) this.seed(); }
  };

  /* ---- default practice config ------------------------------------------ */
  const DEFAULT_CONFIG = {
    doctor: { name: 'Dr. Brian Harris', role: 'Cosmetic Dentist · DMD', npi: '' },
    coordinators: ['Maya R.'],
    questions: [
      { type: 'text',   label: 'Is there anything specific bothering you?' },
      { type: 'choice', label: 'Have you had orthodontic treatment before?', options: ['No, never', 'Yes, in the past', 'Currently in treatment'] },
      { type: 'select', label: 'How soon are you hoping to start?', options: ['As soon as possible', 'Within 1–3 months', '3–6 months', 'Just exploring for now'] }
    ]
  };

  /* ---- seed leads: a realistic, alive queue ------------------------------ */
  function hoursAgo(h) { return new Date(Date.now() - h * 36e5).toISOString(); }
  function SEED() {
    return [
      { id: uid(), createdAt: hoursAgo(2), updatedAt: hoursAgo(2), status: 'new',
        furthestStep: 'complete', goals: ['Whiter teeth', 'Close gaps'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(2) },
        questionAnswers: { 0: 'My two front teeth have a gap I have always hated.', 1: 'No, never', 2: 'As soon as possible' },
        contact: { firstName: 'Jordan', email: 'jordan.m@email.com', phone: '(949) 555-0142' },
        source: { utm_source: 'meta', campaign: 'smile-spring', content: 'video-a' },
        assignedTo: null, notes: [], tags: ['high-intent'], video: null, booking: null },

      { id: uid(), createdAt: hoursAgo(6), updatedAt: hoursAgo(6), status: 'in_review',
        furthestStep: 'complete', goals: ['Full makeover'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(6) },
        questionAnswers: { 0: 'Getting married in the fall and want a full set of veneers.', 1: 'Yes, in the past', 2: 'Within 1–3 months' },
        contact: { firstName: 'Priya', email: 'priya.k@email.com', phone: '(714) 555-0199' },
        source: { utm_source: 'google', campaign: 'veneers-brand', content: 'search' },
        assignedTo: 'Maya R.', notes: [{ body: 'Wedding in October — flag for priority + financing.', author: 'Maya R.', at: hoursAgo(5) }],
        tags: ['high-intent', 'veneers'], video: null, booking: null },

      { id: uid(), createdAt: hoursAgo(20), updatedAt: hoursAgo(19), status: 'new',
        furthestStep: 'complete', goals: ['Straighter teeth'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: false },
        questionAnswers: { 1: 'No, never', 2: 'Just exploring for now' },
        contact: { firstName: 'Marcus', email: 'marcus.t@email.com', phone: '' },
        source: { utm_source: 'meta', campaign: 'smile-spring', content: 'carousel-b' },
        assignedTo: null, notes: [], tags: [], video: null, booking: null },

      // HOT recovery: photos done, NEVER gave contact — the segment to nudge hard
      { id: uid(), createdAt: hoursAgo(9), updatedAt: hoursAgo(9), status: 'new',
        furthestStep: 'photos', goals: ['Fix chips & cracks'], goalText: 'chipped a front tooth',
        photos: ['demo:f'], sim: { enabled: false }, questionAnswers: {},
        contact: {}, source: { utm_source: 'tiktok', campaign: 'ugc-test', content: 'creator-1' },
        assignedTo: null, notes: [], tags: ['abandoned'], video: null, booking: null },

      // COLD: dropped at goals
      { id: uid(), createdAt: hoursAgo(30), updatedAt: hoursAgo(30), status: 'new',
        furthestStep: 'goals', goals: ['Not sure yet'], goalText: '',
        photos: [], sim: { enabled: false }, questionAnswers: {},
        contact: {}, source: { utm_source: 'meta', campaign: 'smile-spring', content: 'video-a' },
        assignedTo: null, notes: [], tags: ['abandoned'], video: null, booking: null },

      // SENT, awaiting view
      { id: uid(), createdAt: hoursAgo(40), updatedAt: hoursAgo(16), status: 'sent',
        furthestStep: 'complete', goals: ['Whiter teeth'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(40) },
        questionAnswers: { 2: '3–6 months' },
        contact: { firstName: 'Dana', email: 'dana.w@email.com', phone: '(310) 555-0173' },
        source: { utm_source: 'google', campaign: 'whitening', content: 'search' },
        assignedTo: 'Dr. Brian Harris',
        notes: [], tags: [], booking: null,
        video: { recordedAt: hoursAgo(17), sentAt: hoursAgo(16), durationSec: 96, script: '' } },

      // VIEWED, not booked — the other follow-up segment
      { id: uid(), createdAt: hoursAgo(72), updatedAt: hoursAgo(30), status: 'viewed',
        furthestStep: 'complete', goals: ['Straighter teeth', 'Whiter teeth'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(72) },
        questionAnswers: { 1: 'No, never', 2: 'Within 1–3 months' },
        contact: { firstName: 'Sam', email: 'sam.r@email.com', phone: '(657) 555-0121' },
        source: { utm_source: 'meta', campaign: 'smile-spring', content: 'video-a' },
        assignedTo: 'Dr. Brian Harris', notes: [], tags: [], booking: null,
        video: { recordedAt: hoursAgo(50), sentAt: hoursAgo(48), viewedAt: hoursAgo(30), durationSec: 118, script: '' } },

      // BOOKED — closed business, ties revenue back to source
      { id: uid(), createdAt: hoursAgo(120), updatedAt: hoursAgo(60), status: 'booked',
        furthestStep: 'complete', goals: ['Full makeover'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(120) },
        questionAnswers: { 2: 'As soon as possible' },
        contact: { firstName: 'Alex', email: 'alex.j@email.com', phone: '(949) 555-0188' },
        source: { utm_source: 'google', campaign: 'veneers-brand', content: 'search' },
        assignedTo: 'Dr. Brian Harris', notes: [], tags: ['veneers'],
        booking: { bookedAt: hoursAgo(60), apptTime: 'Consult booked for next Tue 2:00pm' },
        video: { recordedAt: hoursAgo(100), sentAt: hoursAgo(98), viewedAt: hoursAgo(70), durationSec: 134, script: '' } }
    ];
  }

  global.SmileStore = SmileStore;
})(window);
