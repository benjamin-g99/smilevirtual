/* =============================================================================
   Virtual Consult — shared data layer
   -----------------------------------------------------------------------------
   A tiny, dependency-free "backend" that lives in localStorage so the patient
   flow and the doctor portal share the SAME data inside one browser. A patient
   submission written here shows up in the doctor's queue on the next load.

   This is the demo seam: in production, swap the read/write/seed internals for
   real API calls (the public method surface — Store.* — stays the same).
   ============================================================================= */
(function (global) {
  'use strict';

  const KEY = 'vconsult.leads.v1';
  const CFG_KEY = 'vconsult.config.v1';
  const CASES_KEY = 'vconsult.cases.v1';
  const CLICKS_KEY = 'vconsult.clicks.v1';
  const SEEDED_KEY = 'vconsult.seeded.v6';

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
    catch (e) { console.warn('[Store] write failed (quota?)', e); }
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
  const Store = {
    STATUS, SLA_HOURS,

    config() {
      try { const c = JSON.parse(localStorage.getItem(CFG_KEY)); return c ? Object.assign({}, DEFAULT_CONFIG, c, { brand: Object.assign({}, DEFAULT_CONFIG.brand, c.brand) }) : DEFAULT_CONFIG; }
      catch (e) { return DEFAULT_CONFIG; }
    },
    saveConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); notify(); },
    saveBrand(brand) { const c = this.config(); c.brand = Object.assign({}, c.brand, brand); this.saveConfig(c); },

    /* persisted case library (uploaded before/after cases) */
    cases() { try { return JSON.parse(localStorage.getItem(CASES_KEY)) || []; } catch (e) { return []; } },
    addCase(c) { const list = this.cases(); list.unshift(Object.assign({ id: 'cs_' + uid(), at: now() }, c)); localStorage.setItem(CASES_KEY, JSON.stringify(list)); notify(); return list[0]; },
    removeCase(id) { localStorage.setItem(CASES_KEY, JSON.stringify(this.cases().filter(c => c.id !== id))); notify(); },

    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /* total monthly spend per channel-slug. Accepts either the legacy object
       form { google:900,... } OR a list [{label,channel,amount}] of custom
       line-items (multiple lines can map to the same channel and are summed). */
    spendByChannel() {
      const s = (this.config() || {}).spendBySource;
      const m = {};
      if (Array.isArray(s)) { s.forEach(r => { if (r && r.channel) { const k = String(r.channel).toLowerCase(); m[k] = (m[k] || 0) + (+r.amount || 0); } }); }
      else { Object.keys(s || {}).forEach(k => { m[k.toLowerCase()] = +s[k] || 0; }); }
      return m;
    },
    // distinct channels seen across leads (+ the common defaults) — for spend mapping UIs
    channelsInUse() {
      const set = new Set(['Google', 'Facebook', 'Instagram', 'TikTok', 'Website', 'Direct']);
      read().forEach(l => set.add(this.channel(l)));
      return [...set];
    },

    /* resolve a lead's friendly marketing channel from utm_source (via the
       configurable alias map), falling back to the referrer, then Direct. */
    channel(lead) {
      const al = this.config().sourceAliases || {};
      const s = (lead.source && lead.source.utm_source) || '';
      if (s) { const k = s.toLowerCase(); return al[k] || (s.charAt(0).toUpperCase() + s.slice(1)); }
      const ref = (lead.source && lead.source.referrer) || '';
      if (/instagram/i.test(ref)) return al.instagram || 'Instagram';
      if (/facebook|fb\./i.test(ref)) return al.facebook || 'Facebook';
      if (/google/i.test(ref)) return al.google || 'Google';
      if (/tiktok/i.test(ref)) return al.tiktok || 'TikTok';
      if (ref) return 'Website';
      return al.direct || 'Direct';
    },

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
    // doctor-tuned smile-sim parameters (shared by drawer, studio, email, patient portal)
    saveSimTweak(id, tweak) {
      const lead = read().find(l => l.id === id); if (!lead) return null;
      const sim = Object.assign({}, lead.sim, { tweak: Object.assign({ white: 0.9, natural: 0.2 }, (lead.sim || {}).tweak, tweak) });
      return this.patch(id, { sim });
    },
    // messages between patient and practice (both portals read/write here)
    addMessage(id, from, body) {
      const lead = read().find(l => l.id === id); if (!lead) return null;
      const messages = (lead.messages || []).concat([{ from, body, at: now() }]);
      return this.patch(id, { messages });
    },
    // patient account (created at lead capture; password set later from the portal)
    setPassword(id /*, pw */) { return this.patch(id, { account: Object.assign({}, (this.get(id) || {}).account, { passwordSet: true }) }); },

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

    /* ---- deep analytics: the full lead-capture workflow ----------------
       range = { from:ms|null, to:ms|null } filters leads by createdAt; monthly
       ad spend is scaled to the window so CPL/CPA/ROAS stay meaningful. */
    analytics(range) {
      range = range || {};
      const all = read();
      const from = range.from || null, to = range.to || null;
      const leads = all.filter(l => { const t = new Date(l.createdAt).getTime(); if (from && t < from) return false; if (to && t > to) return false; return true; });
      // scale monthly spend → number of 30-day "months" the window covers
      const MO = 30 * 864e5;
      let months;
      if (from && to) months = Math.max(0.1, (to - from) / MO);
      else if (from) months = Math.max(0.1, (Date.now() - from) / MO);
      else { const ts = all.map(l => new Date(l.createdAt).getTime()); months = ts.length ? Math.max(1, (Date.now() - Math.min(...ts)) / MO) : 1; }
      const spendScale = months;
      const cfg = this.config();
      // top-of-funnel → bottom, with where people drop
      const reached = (steps) => leads.filter(l => steps.includes(l.furthestStep)).length;
      const started = leads.length;
      const gotGoals = leads.filter(l => (l.goals && l.goals.length) || l.goalText || ['photos','sim','questions','contact','complete'].includes(l.furthestStep)).length;
      const gotPhotos = leads.filter(l => (l.photos || []).filter(Boolean).length >= 1).length;
      const becameLead = leads.filter(l => l.contact && l.contact.email).length;
      const sent = leads.filter(l => l.video && l.video.sentAt).length;
      const viewed = leads.filter(l => l.video && l.video.viewedAt).length;
      const booked = leads.filter(l => l.status === 'booked' || (l.booking && l.booking.bookedAt)).length;
      const attended = leads.filter(l => l.booking && l.booking.attended).length;
      const paid = leads.filter(l => l.booking && l.booking.paid).length;
      const funnel = [
        { key:'started',  label:'Started flow',     count:started },
        { key:'goals',    label:'Picked goals',     count:gotGoals },
        { key:'photos',   label:'Took photos',      count:gotPhotos },
        { key:'lead',     label:'Became a lead',    count:becameLead },
        { key:'sent',     label:'Video sent',       count:sent },
        { key:'viewed',   label:'Watched video',    count:viewed },
        { key:'booked',   label:'Booked visit',     count:booked },
        { key:'attended', label:'Attended',         count:attended },
        { key:'paid',     label:'Paid / started tx',count:paid }
      ].map((s, i, arr) => {
        const prev = i ? arr[i-1].count : s.count;
        s.pctOfStart = started ? Math.round(s.count/started*100) : 0;
        s.stepConv = prev ? Math.round(s.count/prev*100) : 100;
        s.dropped = Math.max(0, prev - s.count);
        return s;
      });
      // engagement on the video closing-page
      const viewedLeads = leads.filter(l => l.video && l.video.viewedAt);
      const avg = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
      const videos = {
        sent, viewed,
        viewRate: sent ? Math.round(viewed/sent*100) : 0,
        avgWatches: Math.round(avg(viewedLeads.map(l => l.video.watchCount || 1)) * 10) / 10,
        avgWatchPct: Math.round(avg(viewedLeads.map(l => l.video.watchPct || 0)) * 100),
        simUnlockRate: started ? Math.round(leads.filter(l => l.sim && l.sim.enabled).length / started * 100) : 0
      };
      // revenue + ROAS by source
      const spend = this.spendByChannel();               // {channelSlug: monthly $} (object or custom list)
      const bySrc = {};
      leads.forEach(l => {
        const src = this.channel(l);                       // friendly channel via alias map
        const r = bySrc[src] || (bySrc[src] = { source:src, leads:0, sent:0, viewed:0, booked:0, paid:0, revenue:0, spend:Math.round((spend[src.toLowerCase()]||0)*spendScale) });
        r.leads++;
        if (l.video && l.video.sentAt) r.sent++;
        if (l.video && l.video.viewedAt) r.viewed++;
        if (l.status === 'booked' || (l.booking && l.booking.bookedAt)) r.booked++;
        if (l.booking && l.booking.paid) { r.paid++; r.revenue += (l.booking.treatmentValue || 0); }
      });
      const sources = Object.values(bySrc).map(r => {
        r.cpl = r.spend && r.leads ? Math.round(r.spend / r.leads) : null;
        r.cpa = r.spend && r.paid ? Math.round(r.spend / r.paid) : null;
        r.roas = r.spend ? Math.round(r.revenue / r.spend * 10) / 10 : null;
        r.bookRate = r.leads ? Math.round(r.booked / r.leads * 100) : 0;
        return r;
      }).sort((a,b)=> b.revenue - a.revenue || b.leads - a.leads);
      const revenue = sources.reduce((s,r)=>s+r.revenue,0);
      const totalSpend = sources.reduce((s,r)=>s+(r.spend||0),0);
      return {
        funnel, videos, sources,
        conversion: {
          leadToBooked: becameLead ? Math.round(booked/becameLead*100) : 0,
          bookedToPaid: booked ? Math.round(paid/booked*100) : 0,
          revenue, spend: totalSpend, roas: totalSpend ? Math.round(revenue/totalSpend*10)/10 : null,
          avgTreatment: paid ? Math.round(revenue/paid) : 0
        }
      };
    },

    /* ---- link-in-bio + click tracking --------------------------------- */
    // clicks are stored as TIMESTAMPED events so reporting can filter by date range
    trackClick(linkId) {
      let evs; try { evs = JSON.parse(localStorage.getItem(CLICKS_KEY)); } catch (e) { evs = null; }
      if (!Array.isArray(evs)) evs = [];
      evs.push({ id: linkId, at: now() });
      localStorage.setItem(CLICKS_KEY, JSON.stringify(evs)); notify();
    },
    // returns { linkId: count }, optionally filtered to { from, to } ms. Back-compat
    // with the legacy count-object form (returned as-is, unfilterable).
    clickStats(range) {
      let evs; try { evs = JSON.parse(localStorage.getItem(CLICKS_KEY)); } catch (e) { evs = null; }
      if (!Array.isArray(evs)) return (evs && typeof evs === 'object') ? evs : {};
      const from = range && range.from, to = range && range.to, m = {};
      evs.forEach(e => { const t = new Date(e.at).getTime(); if (from && t < from) return; if (to && t > to) return; m[e.id] = (m[e.id] || 0) + 1; });
      return m;
    },

    reset() { [KEY, SEEDED_KEY, CLICKS_KEY].forEach(k => localStorage.removeItem(k)); this.seed(); notify(); },

    /* ---- demo seed ----------------------------------------------------- */
    seed(force) {
      if (!force && localStorage.getItem(SEEDED_KEY)) return;
      localStorage.setItem(KEY, JSON.stringify(SEED()));
      localStorage.setItem(CLICKS_KEY, JSON.stringify(SEED_CLICKS()));
      localStorage.setItem(SEEDED_KEY, '1');
      notify();
    },
    ensureSeeded() { if (!localStorage.getItem(SEEDED_KEY)) this.seed(); }
  };

  /* ---- default practice config ------------------------------------------ */
  const DEFAULT_CONFIG = {
    doctor: { name: 'Dr. Brian Harris', role: 'Cosmetic Dentist · DMD', npi: '', credential: 'DMD',
      photo: null, bio: 'Smile-design focused practice. 15+ years, 10,000+ smiles. Known for natural-looking veneers and same-week video consultations.',
      phone: '(949) 555-0100', email: 'hello@harrissmile.com', address: '16100 Sand Canyon Ave', city: 'Irvine', state: 'CA' },
    brand: { name: 'Harris Smile Studio', logo: null, primary: '#0E3F3C', accent: '#E8C07D' },
    staff: [
      { id: 'u_doc',  name: 'Dr. Brian Harris', role: 'Dentist',    canRecord: true },
      { id: 'u_maya', name: 'Maya R.',          role: 'Front desk', canRecord: false }
    ],
    questions: [
      { type: 'text',   label: 'Is there anything specific bothering you?' },
      { type: 'choice', label: 'Have you had orthodontic treatment before?', options: ['No, never', 'Yes, in the past', 'Currently in treatment'] },
      { type: 'select', label: 'How soon are you hoping to start?', options: ['As soon as possible', 'Within 1–3 months', '3–6 months', 'Just exploring for now'] }
    ],
    analytics: { metaPixelId: '', ga4Id: '', googleAdsId: '', customEndpoint: '' },
    // map raw utm_source values (lowercased) → friendly channel labels shown in reporting.
    // Lets each practice plug their existing UTM tagging into our attribution.
    sourceAliases: { meta: 'Facebook', fb: 'Facebook', facebook: 'Facebook', ig: 'Instagram', instagram: 'Instagram',
      google: 'Google', 'google-ads': 'Google', adwords: 'Google', tiktok: 'TikTok', tt: 'TikTok',
      website: 'Website', site: 'Website', direct: 'Direct', email: 'Email', yelp: 'Yelp' },
    reviews: { googleRating: 4.9, googleCount: 1284, googleUrl: '', yelpRating: 0, yelpCount: 0, yelpUrl: '' },
    site: { headline: 'See your dream smile — free, from your phone', subhead: 'Get an instant preview and a personal video consultation from Dr. Harris. No office visit to begin.', ctaText: 'Start my free smile preview', showReviews: true },
    links: [
      { id: 'lk_book', label: 'Book an appointment', url: 'https://example.com/book', icon: '📅' },
      { id: 'lk_site', label: 'Our website', url: 'https://example.com', icon: '🌐' },
      { id: 'lk_ig',   label: 'Follow us on Instagram', url: 'https://instagram.com', icon: '📸' }
    ],
    spendBySource: { google: 900, facebook: 700, instagram: 500, tiktok: 300 },   // monthly spend per PAID channel (demo) — drives ROAS/CPA
    widgets: { target: '', headline: 'See your new smile — free', cta: '✨ Free Smile Preview' }
  };

  /* ---- seed timestamped link taps spread over the last ~90 days --------- */
  function SEED_CLICKS() {
    const counts = { primary: 84, lk_book: 31, lk_site: 22, lk_ig: 18 };
    const evs = [], now = Date.now();
    Object.keys(counts).forEach(id => {
      for (let i = 0; i < counts[id]; i++) {
        const daysAgo = Math.pow(Math.random(), 1.4) * 90;   // skew toward recent
        evs.push({ id, at: new Date(now - daysAgo * 864e5).toISOString() });
      }
    });
    return evs;
  }

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
        source: { utm_source: 'instagram', campaign: 'reels-organic' },
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
        contact: {}, source: { utm_source: 'website', referrer: 'https://harrissmile.com' },
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
        account: { passwordSet: true },
        messages: [{ from: 'patient', body: 'Loved the video! Roughly how long does Invisalign take in my case?', at: hoursAgo(28) }],
        video: { recordedAt: hoursAgo(50), sentAt: hoursAgo(48), viewedAt: hoursAgo(30), durationSec: 118, watchCount: 2, watchPct: 0.78, script: '' } },

      // BOOKED + PAID — closed business, ties revenue back to source
      { id: uid(), createdAt: hoursAgo(120), updatedAt: hoursAgo(60), status: 'booked',
        furthestStep: 'complete', goals: ['Full makeover'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(120), tweak: { white: 0.85, natural: 0.3 } },
        questionAnswers: { 2: 'As soon as possible' },
        contact: { firstName: 'Alex', email: 'alex.j@email.com', phone: '(949) 555-0188' },
        source: { utm_source: 'google', campaign: 'veneers-brand', content: 'search' },
        assignedTo: 'Dr. Brian Harris', notes: [], tags: ['veneers'],
        account: { passwordSet: true },
        messages: [{ from: 'patient', body: 'Booked! Can my husband join the consult?', at: hoursAgo(64) }, { from: 'doctor', body: 'Absolutely — bring him along. See you Tuesday!', at: hoursAgo(62) }],
        booking: { bookedAt: hoursAgo(60), apptTime: 'Consult booked for next Tue 2:00pm', attended: true, paid: true, treatmentValue: 11500 },
        video: { recordedAt: hoursAgo(100), sentAt: hoursAgo(98), viewedAt: hoursAgo(70), durationSec: 134, watchCount: 4, watchPct: 0.92, script: '' } },

      // BOOKED + PAID via meta — gives the meta source revenue/ROAS
      { id: uid(), createdAt: hoursAgo(160), updatedAt: hoursAgo(90), status: 'booked',
        furthestStep: 'complete', goals: ['Veneers', 'Whiter teeth'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: true, unlockedAt: hoursAgo(160) },
        questionAnswers: { 2: 'Within 1–3 months' },
        contact: { firstName: 'Bianca', email: 'bianca.l@email.com', phone: '(949) 555-0155' },
        source: { utm_source: 'meta', campaign: 'smile-spring', content: 'video-a' },
        assignedTo: 'Dr. Brian Harris', notes: [], tags: ['veneers'], account: { passwordSet: false },
        booking: { bookedAt: hoursAgo(90), apptTime: 'Booked — last Thursday', attended: true, paid: true, treatmentValue: 8200 },
        video: { recordedAt: hoursAgo(150), sentAt: hoursAgo(148), viewedAt: hoursAgo(120), durationSec: 102, watchCount: 3, watchPct: 0.88, script: '' } },

      // SENT, not yet viewed (meta)
      { id: uid(), createdAt: hoursAgo(50), updatedAt: hoursAgo(20), status: 'sent',
        furthestStep: 'complete', goals: ['Whiter teeth'], goalText: '',
        photos: ['demo:f', 'demo:c'], sim: { enabled: false },
        questionAnswers: { 2: '3–6 months' },
        contact: { firstName: 'Theo', email: 'theo.n@email.com', phone: '(562) 555-0144' },
        source: { utm_source: 'meta', campaign: 'smile-spring', content: 'carousel-b' },
        assignedTo: 'Dr. Brian Harris', notes: [], tags: [], booking: null,
        video: { recordedAt: hoursAgo(21), sentAt: hoursAgo(20), durationSec: 88, watchCount: 0, watchPct: 0, script: '' } },

      // Dropped at WELCOME (bounced) — top-of-funnel leakage
      { id: uid(), createdAt: hoursAgo(11), updatedAt: hoursAgo(11), status: 'new',
        furthestStep: 'welcome', goals: [], goalText: '', photos: [], sim: { enabled: false },
        questionAnswers: {}, contact: {}, source: { utm_source: 'tiktok', campaign: 'ugc-test', content: 'creator-2' },
        assignedTo: null, notes: [], tags: ['abandoned'], video: null, booking: null },
      { id: uid(), createdAt: hoursAgo(15), updatedAt: hoursAgo(15), status: 'new',
        furthestStep: 'goals', goals: ['Whiter teeth'], goalText: '', photos: [], sim: { enabled: false },
        questionAnswers: {}, contact: {}, source: {},
        assignedTo: null, notes: [], tags: ['abandoned'], video: null, booking: null }
    ];
  }

  global.Store = Store;
})(window);
