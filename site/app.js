/* =============================================================================
   Virtual Consult — standalone practice landing page
   -----------------------------------------------------------------------------
   Auto-generated, conversion-focused single page for ONE practice. Everything
   is themed + populated at runtime from Store.config(). This surface is
   STANDALONE: it never links back to the directory and reads as the practice's
   own marketing site. The only outbound link is the patient capture flow.
   ============================================================================= */
(function (global) {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  /* derive a darker shade of a hex color for hover/deep states */
  function darken(hex, amt) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    var f = amt == null ? 0.78 : amt;
    var ch = [1, 2, 3].map(function (i) {
      return Math.max(0, Math.min(255, Math.round(parseInt(m[i], 16) * f)));
    });
    return '#' + ch.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }

  /* derive a soft tint of a hex color */
  function tint(hex, amt) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || '').trim());
    if (!m) return hex;
    var f = amt == null ? 0.88 : amt;
    var ch = [1, 2, 3].map(function (i) {
      var v = parseInt(m[i], 16);
      return Math.round(v + (255 - v) * f);
    });
    return '#' + ch.map(function (c) { return ('0' + c.toString(16)).slice(-2); }).join('');
  }

  function initials(name) {
    return String(name || '')
      .replace(/^(Dr\.?|Doctor)\s+/i, '')
      .split(/\s+/).filter(Boolean).slice(0, 2)
      .map(function (w) { return w[0]; }).join('').toUpperCase() || '🦷';
  }

  /* ---------- theme ---------- */
  function applyTheme(cfg) {
    var primary = (cfg.brand && cfg.brand.primary) || '#0E3F3C';
    var accent = (cfg.brand && cfg.brand.accent) || '#E8C07D';
    var root = document.documentElement.style;
    root.setProperty('--brand', primary);
    root.setProperty('--accent', accent);
    root.setProperty('--brand-deep', darken(primary, 0.72));
    root.setProperty('--brand-soft', tint(primary, 0.9));
  }

  /* ---------- brand marks (logo or tooth) ---------- */
  function fillBrandMark(el, brand) {
    if (!el) return;
    if (brand && brand.logo) {
      el.innerHTML = '<img alt="" src="' + esc(brand.logo) + '">';
    } else {
      el.textContent = '🦷';
    }
  }

  /* ---------- review chips ----------
     NOTE: live Google/Yelp ratings require their official APIs called
     server-side (and, for Google, a Places API key). This prototype has no
     backend, so the rating shown here is doctor-entered in config.reviews. */
  function stars(rating) {
    var r = Math.round(Number(rating) || 0);
    var s = '';
    for (var i = 0; i < 5; i++) s += i < r ? '★' : '☆';
    return s;
  }

  function reviewChip(opts) {
    var ratingTxt = (Number(opts.rating) || 0).toFixed(1);
    var countTxt = opts.count ? esc(String(Number(opts.count).toLocaleString())) + ' reviews' : 'reviews';
    var logo = opts.brand === 'google'
      ? '<span class="logo google">' + 'Google'.split('').map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</span>'
      : '<span class="logo yelp">Yelp</span>';
    var inner =
      logo +
      '<span class="rc-main">' +
        '<span class="rc-top"><span class="rating">' + esc(ratingTxt) + '</span>' +
        '<span class="stars">' + stars(opts.rating) + '</span></span>' +
        '<span class="count">' + countTxt + '</span>' +
      '</span>';
    var tag = opts.url ? 'a' : 'div';
    var attrs = opts.url ? ' href="' + esc(opts.url) + '" target="_blank" rel="noopener"' : '';
    return '<' + tag + ' class="review-chip"' + attrs + '>' + inner + '</' + tag + '>';
  }

  function renderReviews(cfg) {
    var row = $('#reviewsRow');
    var heroRow = $('#heroReviews');
    if (!row) return;
    if (!cfg.site || !cfg.site.showReviews) { row.innerHTML = ''; if (heroRow) heroRow.innerHTML = ''; return; }
    var rv = cfg.reviews || {};
    var chips = '';
    if (Number(rv.googleRating) > 0) {
      chips += reviewChip({ brand: 'google', rating: rv.googleRating, count: rv.googleCount, url: rv.googleUrl });
    }
    if (Number(rv.yelpRating) > 0) {
      chips += reviewChip({ brand: 'yelp', rating: rv.yelpRating, count: rv.yelpCount, url: rv.yelpUrl });
    }
    row.innerHTML = chips;
    if (heroRow) heroRow.innerHTML = chips;
  }

  /* ---------- content population ---------- */
  function render(cfg) {
    var brand = cfg.brand || {};
    var site = cfg.site || {};
    var doc = cfg.doctor || {};

    document.title = (brand.name ? brand.name + ' — ' : '') + 'Free Smile Assessment';

    // brand marks + names
    fillBrandMark($('#brandMark'), brand);
    fillBrandMark($('#footMark'), brand);
    if ($('#brandName')) $('#brandName').textContent = brand.name || 'Smile Studio';
    if ($('#footName')) $('#footName').textContent = brand.name || 'Smile Studio';

    // hero copy
    if (site.headline && $('#heroHeadline')) $('#heroHeadline').textContent = site.headline;
    if (site.subhead && $('#heroSubhead')) $('#heroSubhead').textContent = site.subhead;

    // CTAs
    var ctaText = site.ctaText || 'Start my free smile preview';
    ['#heroCta', '#bandCta'].forEach(function (id) { if ($(id)) $(id).textContent = ctaText; });
    if ($('#navCta')) $('#navCta').textContent = 'Start free';

    // hero doctor card
    var docName = doc.name || brand.name || 'Your dentist';
    if ($('#heroDocName')) $('#heroDocName').textContent = docName;
    if ($('#heroDocRole')) $('#heroDocRole').textContent = doc.role || doc.credential || 'Cosmetic Dentist';
    var heroPhoto = $('#heroPhoto');
    if (heroPhoto) {
      heroPhoto.innerHTML = doc.photo
        ? '<img alt="' + esc(docName) + '" src="' + esc(doc.photo) + '">'
        : '😁';
    }

    // meet the doctor
    if ($('#docName')) $('#docName').textContent = docName;
    var cred = [doc.credential, doc.role].filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');
    if ($('#docCred')) $('#docCred').textContent = cred;
    if ($('#docBio')) $('#docBio').textContent = doc.bio || '';
    var locParts = [doc.city, doc.state].filter(Boolean).join(', ');
    if ($('#docLoc')) $('#docLoc').innerHTML = locParts ? '📍 ' + esc(locParts) : '';
    var docPhoto = $('#docPhoto');
    if (docPhoto) {
      docPhoto.innerHTML = doc.photo
        ? '<img alt="' + esc(docName) + '" src="' + esc(doc.photo) + '">'
        : esc(initials(docName));
    }

    // final band copy
    if ($('#bandHeadline')) $('#bandHeadline').textContent = 'Ready to see your new smile?';
    if ($('#bandSubhead')) $('#bandSubhead').textContent = "It's free, and it starts right from your phone.";

    // footer contact (no directory links)
    var contact = [];
    if (doc.phone) contact.push('<a href="tel:' + esc(String(doc.phone).replace(/[^\d+]/g, '')) + '">' + esc(doc.phone) + '</a>');
    if (doc.email) contact.push('<a href="mailto:' + esc(doc.email) + '">' + esc(doc.email) + '</a>');
    var addr = [doc.address, locParts].filter(Boolean).join(', ');
    if (addr) contact.push('<span>' + esc(addr) + '</span>');
    if ($('#footContact')) $('#footContact').innerHTML = contact.join('');
    if ($('#footFine')) {
      $('#footFine').textContent = '© ' + new Date().getFullYear() + ' ' + (brand.name || 'Smile Studio') + '. All rights reserved.';
    }

    renderReviews(cfg);
  }

  /* ---------- before / after smile canvas ----------
     Stylized smile (not a real photo): a warm portrait with a mouth of teeth.
     "before" = cream, slightly uneven teeth; "after" = bright, even white.
     Approach mirrors doctor/app.js drawSmilePanel + the patient sim canvas. */
  function drawSmile(ctx, W, H, after) {
    ctx.clearRect(0, 0, W, H);

    // soft skin-tone backdrop
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    if (after) { bg.addColorStop(0, '#F0D2B6'); bg.addColorStop(1, '#DCA882'); }
    else { bg.addColorStop(0, '#E8C4A8'); bg.addColorStop(1, '#D29A78'); }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // gentle vignette
    var vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.2, W / 2, H * 0.5, W * 0.7);
    vg.addColorStop(0, 'rgba(255,255,255,0)');
    vg.addColorStop(1, 'rgba(60,30,15,0.18)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    var cx = W / 2, cy = H * 0.52, mw = W * 0.52, mh = mw * 0.46;

    // lips
    ctx.fillStyle = after ? '#C9655F' : '#B65C5C';
    ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2 + 18, mh / 2 + 18, 0, 0, 7); ctx.fill();
    // inner mouth
    ctx.fillStyle = '#5E2230';
    ctx.beginPath(); ctx.ellipse(cx, cy, mw / 2, mh / 2, 0, 0, 7); ctx.fill();

    // teeth (clipped to upper arch)
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy - mh * 0.06, mw / 2 - 6, mh / 2 - 4, 0, 0, 7);
    ctx.clip();

    var n = 10, gap = Math.max(2, W * 0.004), tw = (mw - 14) / n, x0 = cx - (mw - 14) / 2, ty = cy - mh / 2 + 4;
    var th = mh - 14;
    for (var i = 0; i < n; i++) {
      var x = x0 + i * tw, y = ty, h = th;
      var col;
      if (after) {
        col = '#FFFFFF';
      } else {
        // cream, with a little variation + a couple unevenly placed teeth
        var creams = ['#E7DCB8', '#E2D4AE', '#EADFBE', '#DCCEA4'];
        col = creams[i % creams.length];
        if (i === 3) y += 8;          // dropped tooth
        if (i === 4) x += 5;          // shifted tooth
        if (i === 6) h -= 6;          // shorter tooth
      }
      // subtle vertical sheen for white teeth
      ctx.fillStyle = col;
      ctx.fillRect(x, y, tw - gap, h);
      if (after) {
        var sh = ctx.createLinearGradient(x, y, x, y + h);
        sh.addColorStop(0, 'rgba(255,255,255,0.0)');
        sh.addColorStop(0.5, 'rgba(255,255,255,0.0)');
        sh.addColorStop(1, 'rgba(200,210,205,0.25)');
        ctx.fillStyle = sh;
        ctx.fillRect(x, y, tw - gap, h);
      }
      ctx.strokeStyle = 'rgba(0,0,0,.06)';
      ctx.strokeRect(x, y, tw - gap, h);
    }
    ctx.restore();
  }

  function initBeforeAfter() {
    var ba = $('#ba');
    var canvas = $('#baCanvas');
    var divider = $('#baDivider');
    if (!ba || !canvas || !divider) return;

    var W = canvas.width, H = canvas.height;
    var ctx = canvas.getContext('2d');

    // The visible canvas shows AFTER; we draw BEFORE on an offscreen canvas and
    // composite the left portion over it based on the divider position.
    var before = document.createElement('canvas');
    before.width = W; before.height = H;
    var bctx = before.getContext('2d');

    function paint(pct) {
      // base = after
      drawSmile(ctx, W, H, true);
      // overlay before on the left
      var w = Math.round(W * pct / 100);
      if (w > 0) {
        drawSmile(bctx, W, H, false);
        ctx.drawImage(before, 0, 0, w, H, 0, 0, w, H);
      }
    }

    var pct = 50;
    function setPct(p) {
      pct = Math.max(4, Math.min(96, p));
      divider.style.left = pct + '%';
      paint(pct);
    }

    var dragging = false;
    function moveTo(clientX) {
      var r = ba.getBoundingClientRect();
      setPct((clientX - r.left) / r.width * 100);
    }
    ba.addEventListener('mousedown', function (e) { dragging = true; moveTo(e.clientX); });
    window.addEventListener('mousemove', function (e) { if (dragging) moveTo(e.clientX); });
    window.addEventListener('mouseup', function () { dragging = false; });
    ba.addEventListener('touchstart', function (e) { dragging = true; moveTo(e.touches[0].clientX); }, { passive: true });
    ba.addEventListener('touchmove', function (e) { if (dragging) moveTo(e.touches[0].clientX); }, { passive: true });
    window.addEventListener('touchend', function () { dragging = false; });

    setPct(50);
  }

  /* ---------- boot ---------- */
  function boot() {
    if (!global.Store) { return; }
    Store.ensureSeeded();
    render(Store.config());
    applyTheme(Store.config());
    initBeforeAfter();
    // live re-theme if the practice edits brand/config elsewhere (same browser)
    Store.onChange(function () {
      var cfg = Store.config();
      applyTheme(cfg);
      render(cfg);
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window);
