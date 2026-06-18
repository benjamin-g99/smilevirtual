/* =============================================================================
   Virtual Consult — Patient Portal
   -----------------------------------------------------------------------------
   The patient's post-capture home: watch the personalized video, replay the
   smile simulation, message the practice, share with a partner, and book.
   All data flows through window.Store (the shared "backend").
   NOTE: the recorded video blob lives only in-memory in the doctor app and is
   NOT available here, so the player is a polished placeholder by design.
   ============================================================================= */
(function (global) {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };

  /* ---- tiny HTML escaper (any lead/config text injected into HTML) -------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var leadId = null;          // active lead id
  var unsubscribe = null;     // Store.onChange teardown

  /* ---- lead resolution ---------------------------------------------------- */
  function resolveLeadId() {
    var params = new URLSearchParams(global.location.search);
    var fromUrl = params.get('lead');
    if (fromUrl && Store.get(fromUrl)) return fromUrl;
    var all = Store.all();
    var sent = all.find(function (l) { return l.video && l.video.sentAt; });
    return (sent || all[0] || {}).id || null;
  }
  function lead() { return leadId ? Store.get(leadId) : null; }

  function patientName() {
    var l = lead();
    return (l && l.contact && l.contact.firstName) || 'there';
  }
  function docInitials(cfg) {
    var n = (cfg.doctor && cfg.doctor.name) || '';
    var parts = n.replace(/^Dr\.?\s*/i, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Dr';
    return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function brandInitials(cfg) {
    var n = (cfg.brand && cfg.brand.name) || '';
    var parts = n.trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || 'S')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' +
      d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ========================================================================
     PASSWORD GATE
     ===================================================================== */
  function showGate() {
    var cfg = Store.config();
    var doc = cfg.doctor || {};
    var av = $('#gateAv');
    if (doc.photo) { av.innerHTML = '<img src="' + esc(doc.photo) + '" alt="">'; }
    else { av.textContent = docInitials(cfg); }
    $('#gateHead').innerHTML = 'Set your <em>password</em>';
    $('#gate').style.display = '';
    $('#portal').style.display = 'none';
  }
  function validatePw() {
    var pw = $('#pw').value, pw2 = $('#pw2').value, hint = $('#pwHint'), btn = $('#pwBtn');
    var ok = pw.length >= 6 && pw === pw2;
    if (pw && pw.length < 6) hint.textContent = 'Use at least 6 characters.';
    else if (pw2 && pw !== pw2) hint.textContent = 'Passwords don’t match.';
    else hint.textContent = '';
    btn.disabled = !ok;
  }
  function submitPassword() {
    if (leadId) Store.setPassword(leadId);
    enterPortal();
  }
  function skipPassword() {
    // demo affordance — enter without persisting a password
    enterPortal();
  }

  /* ========================================================================
     ENTER PORTAL + RENDER
     ===================================================================== */
  function enterPortal() {
    $('#gate').style.display = 'none';
    $('#portal').style.display = '';
    render();
    if (!unsubscribe) unsubscribe = Store.onChange(onStoreChange);
  }

  function onStoreChange() {
    // live-refresh the message thread (and the rest, cheaply)
    if ($('#portal').style.display !== 'none') render();
  }

  function render() {
    var l = lead();
    var cfg = Store.config();
    if (!l) {
      $('#portal').innerHTML = '<div class="card sec"><h2>No consultation found</h2><p class="sub">We couldn’t find your smile consultation. Please use the link your dentist sent you.</p></div>';
      return;
    }
    renderHeader(l, cfg);
    renderVideo(l, cfg);
    renderSim(l);
    renderCtas(l, cfg);
    renderShare(l, cfg);
    renderMessages(l);
    renderDoctor(cfg);
  }

  function renderHeader(l, cfg) {
    var brand = cfg.brand || {};
    var logo = $('#brandLogo');
    if (brand.logo) logo.innerHTML = '<img src="' + esc(brand.logo) + '" alt="">';
    else logo.textContent = brandInitials(cfg);
    $('#brandName').textContent = brand.name || 'Your Smile Studio';
    $('#greeting').textContent = 'Welcome back, ' + patientName();
  }

  /* ---- VIDEO -------------------------------------------------------------- */
  function renderVideo(l, cfg) {
    var doc = cfg.doctor || {};
    var player = $('#player');
    var cap = $('#videoCap');
    var title = $('#videoTitle');
    var v = l.video;

    if (!v) {
      // pending state
      title.textContent = 'Your video is being prepared';
      player.className = 'player pending';
      player.innerHTML =
        '<div class="pmsg"><div class="spin"></div>' +
        '<b>Your video is being prepared</b>' +
        '<p>' + esc(doc.name || 'Your dentist') + ' is personally reviewing your photos and recording your consultation. We’ll text you the moment it’s ready.</p></div>';
      cap.textContent = '';
      player.onclick = null;
      return;
    }

    title.textContent = 'A personal video, just for you';
    player.className = 'player';
    var avatar = doc.photo
      ? '<span class="pdoc"><img src="' + esc(doc.photo) + '" alt=""></span>'
      : '<span class="pdoc">' + esc(docInitials(cfg)) + '</span>';
    player.innerHTML =
      '<span class="ptag">For ' + esc(patientName()) + '</span>' +
      avatar +
      '<div class="play" id="playBtn" role="button" aria-label="Play video"></div>' +
      '<span class="pby">' + (doc.photo ? '' : '') + 'Recorded by ' + esc(doc.name || 'your dentist') + '</span>' +
      '<span class="pdur">' + esc(fmtDur(v.durationSec)) + '</span>';

    var sentTxt = v.sentAt ? 'Sent ' + fmtTime(v.sentAt) : (v.recordedAt ? 'Recorded ' + fmtTime(v.recordedAt) : '');
    cap.textContent = sentTxt + (v.viewedAt ? ' · You watched this ' + fmtTime(v.viewedAt) : '');

    $('#playBtn').onclick = function () { playVideoPlaceholder(player, cfg); };
  }

  function playVideoPlaceholder(player, cfg) {
    // the recorded blob isn't available in this surface — show a graceful note
    player.className = 'player playing';
    player.innerHTML =
      '<div class="pinfo">▶︎ In the live product your personal video plays here.' +
      '<br><br>(This prototype records the video in the dentist’s app; the file isn’t shared into this demo portal.)' +
      '<br><br><span style="color:#fff;font-weight:700;cursor:pointer" id="rewind">↺ Back</span></div>';
    var rw = $('#rewind');
    if (rw) rw.onclick = function () { renderVideo(lead(), cfg); };
  }

  /* ---- SIMULATION (draggable before/after) -------------------------------- */
  function renderSim(l) {
    var sec = $('#simSec');
    if (!l.sim || !l.sim.enabled) { sec.style.display = 'none'; return; }
    sec.style.display = '';
    var tweak = (l.sim.tweak) || { white: 0.9, natural: 0.2 };
    drawSmile($('#simBefore'), false, tweak);
    drawSmile($('#simAfter'), true, tweak);
    setupSlider();
  }

  // stylized smile: before = cream, slightly uneven w/ a gap; after = lerp toward
  // white by `white`, imperfection scaled by `natural`.
  function drawSmile(cv, after, tweak) {
    var c = cv.getContext('2d'), W = cv.width, H = cv.height;
    c.clearRect(0, 0, W, H);
    // skin / lips backdrop
    var sk = c.createLinearGradient(0, 0, 0, H);
    sk.addColorStop(0, '#E8C4A8'); sk.addColorStop(1, '#D29A78');
    c.fillStyle = sk; c.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H * 0.5, mw = W * 0.62, mh = mw * 0.5;
    c.fillStyle = '#B65C5C'; c.beginPath(); c.ellipse(cx, cy, mw / 2 + 14, mh / 2 + 14, 0, 0, 7); c.fill();
    c.fillStyle = '#5E2230'; c.beginPath(); c.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, 7); c.fill();
    c.save();
    c.beginPath(); c.ellipse(cx, cy - mh * 0.06, mw / 2 - 5, mh / 2 - 3, 0, 0, 7); c.clip();

    var white = Math.max(0.55, Math.min(1, (tweak && tweak.white != null) ? tweak.white : 0.9));
    var natural = Math.max(0, Math.min(1, (tweak && tweak.natural != null) ? tweak.natural : 0.2));

    // base cream tooth color, lerp toward pure white by `white` (only for "after")
    var cream = [231, 220, 184]; // #E7DCB8
    var target = after ? lerpColor(cream, [255, 255, 255], white) : cream;
    var toothCol = rgb(target);

    var n = 8, gap = 3, tw = (mw - 12) / n, x0 = cx - (mw - 12) / 2, ty = cy - mh / 2 + 3, h = mh - 12;
    // imperfection amounts: full on "before"; on "after" kept but scaled by `natural`
    var dropTooth = after ? Math.round(7 * natural) : 7;   // a lower/uneven tooth
    var gapShift = after ? Math.round(4 * natural) : 4;    // a slight gap nudge
    for (var i = 0; i < n; i++) {
      var x = x0 + i * tw, y = ty;
      if (i === 3) y += dropTooth;
      if (i === 4) x += gapShift;
      c.fillStyle = toothCol;
      c.fillRect(x, y, tw - gap, h);
      c.strokeStyle = 'rgba(0,0,0,.06)'; c.strokeRect(x, y, tw - gap, h);
    }
    c.restore();
  }
  function lerpColor(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function rgb(a) { return 'rgb(' + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + ')'; }

  function setupSlider() {
    var reveal = $('#reveal'), before = $('#beforeWrap'), handle = $('#handle');
    if (reveal._wired) { setPos(50); return; }
    reveal._wired = true;
    var dragging = false;
    function setPos(p) {
      p = Math.max(4, Math.min(96, p));
      before.style.width = p + '%';
      handle.style.left = p + '%';
    }
    reveal._setPos = setPos;
    function fromEvent(clientX) {
      var r = reveal.getBoundingClientRect();
      setPos((clientX - r.left) / r.width * 100);
    }
    reveal.addEventListener('mousedown', function (e) { dragging = true; fromEvent(e.clientX); });
    global.addEventListener('mousemove', function (e) { if (dragging) fromEvent(e.clientX); });
    global.addEventListener('mouseup', function () { dragging = false; });
    reveal.addEventListener('touchstart', function (e) { dragging = true; fromEvent(e.touches[0].clientX); }, { passive: true });
    reveal.addEventListener('touchmove', function (e) { if (dragging) fromEvent(e.touches[0].clientX); }, { passive: true });
    reveal.addEventListener('touchend', function () { dragging = false; });
    setPos(50);
  }
  function setPos(p) { var r = $('#reveal'); if (r && r._setPos) r._setPos(p); }

  /* ---- CTAs --------------------------------------------------------------- */
  function renderCtas(l, cfg) {
    var primary = $('#primaryCta');
    var links = cfg.links || [];
    // primary CTA: prefer a config "book" link, else the patient flow
    var bookLink = links.find(function (k) { return /book/i.test(k.id) || /book/i.test(k.label); });
    primary.textContent = '📅  Book / inquire';
    primary.onclick = function () {
      if (leadId) try { Store.trackClick('portal_primary_cta'); } catch (e) {}
      if (bookLink && bookLink.url) global.open(bookLink.url, '_blank');
      else global.location.href = '../patient/';
    };

    var box = $('#links');
    var secondary = links.filter(function (k) { return k !== bookLink; });
    box.innerHTML = secondary.map(function (k) {
      return '<a class="linkrow" href="' + esc(k.url) + '" target="_blank" rel="noopener" data-id="' + esc(k.id) + '">' +
        '<span class="lkico">' + esc(k.icon || '🔗') + '</span>' + esc(k.label) +
        '<span class="lkarrow">→</span></a>';
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.linkrow'), function (a) {
      a.addEventListener('click', function () { try { Store.trackClick(a.getAttribute('data-id')); } catch (e) {} });
    });
  }

  /* ---- SHARE -------------------------------------------------------------- */
  function renderShare(l, cfg) {
    var url = global.location.href;
    var docName = (cfg.doctor && cfg.doctor.name) || 'my dentist';
    var subject = 'My personalized smile consultation';
    var body = 'I got a personal video smile consultation from ' + docName + '. Take a look with me: ' + url;
    $('#mailBtn').setAttribute('href',
      'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
  }
  function share() {
    var url = global.location.href;
    var conf = $('#shareConf');
    function ok() { conf.textContent = '✓ Link copied — paste it to your partner.'; setTimeout(function () { conf.textContent = ''; }, 4000); }
    function fail() { conf.textContent = 'Couldn’t copy automatically — here it is: ' + url; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(ok, fail);
    } else {
      // legacy fallback
      try {
        var ta = document.createElement('textarea');
        ta.value = url; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta); ok();
      } catch (e) { fail(); }
    }
  }

  /* ---- MESSAGES ----------------------------------------------------------- */
  function renderMessages(l) {
    var cfg = Store.config();
    $('#msgHead').textContent = 'Message ' + ((cfg.doctor && cfg.doctor.name) || 'your dentist');
    var thread = $('#thread');
    var msgs = l.messages || [];
    var atBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 40;
    if (!msgs.length) {
      thread.innerHTML = '<div class="empty">No messages yet. Have a question about your video or your options? Send a note below.</div>';
      return;
    }
    thread.innerHTML = msgs.map(function (m) {
      var who = m.from === 'patient' ? 'patient' : 'doctor';
      return '<div class="bubble ' + who + '">' + esc(m.body) +
        '<span class="at">' + (who === 'patient' ? 'You' : esc((cfg.doctor && cfg.doctor.name) || 'Dentist')) +
        ' · ' + esc(fmtTime(m.at)) + '</span></div>';
    }).join('');
    if (atBottom) thread.scrollTop = thread.scrollHeight;
  }
  function sendMessage() {
    var input = $('#msgInput');
    var body = (input.value || '').trim();
    if (!body || !leadId) return;
    input.value = '';
    Store.addMessage(leadId, 'patient', body);  // onChange re-renders the thread
    var thread = $('#thread');
    requestAnimationFrame(function () { thread.scrollTop = thread.scrollHeight; });
  }

  /* ---- DOCTOR INFO -------------------------------------------------------- */
  function renderDoctor(cfg) {
    var doc = cfg.doctor || {};
    var av = $('#docAv');
    if (doc.photo) av.innerHTML = '<img src="' + esc(doc.photo) + '" alt="">';
    else av.textContent = docInitials(cfg);
    $('#docName').textContent = doc.name || 'Your dentist';
    // role often already includes the credential; avoid duplicating
    var roleTxt = doc.role || (doc.credential ? doc.credential : '');
    $('#docRole').textContent = roleTxt;
    $('#docBio').textContent = doc.bio || '';

    var rows = [];
    if (doc.phone) rows.push('<a href="tel:' + esc(doc.phone.replace(/[^+\d]/g, '')) + '"><span class="cico">📞</span>' + esc(doc.phone) + '</a>');
    if (doc.email) rows.push('<a href="mailto:' + esc(doc.email) + '"><span class="cico">✉️</span>' + esc(doc.email) + '</a>');
    var loc = [doc.address, [doc.city, doc.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    if (loc) {
      var maps = 'https://maps.google.com/?q=' + encodeURIComponent([doc.address, doc.city, doc.state].filter(Boolean).join(', '));
      rows.push('<a href="' + esc(maps) + '" target="_blank" rel="noopener"><span class="cico">📍</span>' + esc(loc) + '</a>');
    }
    $('#docContact').innerHTML = rows.join('');
  }

  /* ========================================================================
     BOOT
     ===================================================================== */
  function init() {
    Store.ensureSeeded();
    leadId = resolveLeadId();
    var l = lead();
    var passwordSet = !!(l && l.account && l.account.passwordSet);
    if (passwordSet) enterPortal();
    else showGate();
  }

  var Portal = {
    validatePw: validatePw,
    submitPassword: submitPassword,
    skipPassword: skipPassword,
    share: share,
    sendMessage: sendMessage,
    setSliderPos: setPos
  };
  global.Portal = Portal;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window);
