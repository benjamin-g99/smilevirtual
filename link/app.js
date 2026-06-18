/* =============================================================================
   Virtual Consult — link-in-bio page
   -----------------------------------------------------------------------------
   A Linktree-style bio page a practice links to from Instagram/TikTok.
   - Brand-themed from Store.config().brand
   - Prominent primary CTA -> ../patient/?from=link
   - Doctor's custom links from config.links
   - Every tap (incl. the primary CTA, id 'primary') calls Store.trackClick
     BEFORE navigating, so the doctor console's clickStats() reflects engagement.
   ============================================================================= */
(function () {
  'use strict';

  var Store = window.Store;
  if (Store && Store.ensureSeeded) Store.ensureSeeded();

  /* ---- helpers ---------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // only allow safe-ish URL schemes for the doctor's custom links
  function safeUrl(u) {
    var s = String(u || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(s)) return s;
    if (/^\//.test(s) || /^\.\.?\//.test(s)) return s; // relative paths ok
    return null;
  }
  function initialsOf(name) {
    var parts = String(name || '').replace(/^(dr\.?|doctor)\s+/i, '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '🦷';
    var a = parts[0][0] || '';
    var b = parts.length > 1 ? parts[parts.length - 1][0] : '';
    return (a + b).toUpperCase();
  }
  function stars(rating) {
    var r = Math.round(Number(rating) || 0);
    r = Math.max(0, Math.min(5, r));
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
  }
  function fmtCount(n) {
    n = Number(n) || 0;
    if (n >= 1000) return (Math.round(n / 100) / 10).toString().replace(/\.0$/, '') + 'k';
    return String(n);
  }

  /* ---- click tracking + navigation -------------------------------------- */
  // Tracks the click via the store, THEN navigates. External links open in a
  // new tab; the patient flow + relative links navigate in-place.
  function go(linkId, url, external) {
    try { if (Store && Store.trackClick) Store.trackClick(linkId); } catch (e) {}
    if (!url) return;
    if (external) {
      window.open(url, '_blank', 'noopener');
    } else {
      window.location.href = url;
    }
  }

  /* ---- theming ---------------------------------------------------------- */
  function applyTheme(el, brand) {
    var primary = (brand && brand.primary) || '#0E5450';
    var accent = (brand && brand.accent) || '#C9A24B';
    el.style.setProperty('--brand', primary);
    el.style.setProperty('--brand-deep', primary);
    el.style.setProperty('--accent', accent);
  }

  /* ---- render ----------------------------------------------------------- */
  function render() {
    var root = document.getElementById('bio');
    if (!root) return;
    var cfg = (Store && Store.config) ? Store.config() : {};
    var doctor = cfg.doctor || {};
    var brand = cfg.brand || {};
    var reviews = cfg.reviews || {};
    var site = cfg.site || {};
    var links = Array.isArray(cfg.links) ? cfg.links : [];
    var stats = (Store && Store.clickStats) ? Store.clickStats() : {};

    applyTheme(root, brand);

    var practiceName = brand.name || doctor.name || 'Smile Studio';
    var docName = doctor.name || practiceName;
    var role = [doctor.role, [doctor.city, doctor.state].filter(Boolean).join(', ')]
      .filter(Boolean).join(' · ');
    var tagline = site.subhead || doctor.bio || '';
    var ctaText = site.ctaText || 'Start my free smile preview';
    if (!/[✨🦷📸]/.test(ctaText)) ctaText = '✨ ' + ctaText;

    // brand mark: logo image if set, else 🦷 glyph + practice name
    var markHtml = brand.logo
      ? '<img src="' + esc(brand.logo) + '" alt="' + esc(practiceName) + '">'
      : '<span class="glyph">🦷</span><span>' + esc(practiceName) + '</span>';

    // avatar: doctor photo if set, else initials
    var avatarInner = doctor.photo
      ? '<img src="' + esc(doctor.photo) + '" alt="' + esc(docName) + '">'
      : esc(initialsOf(docName));

    // rating block (only if a Google rating exists)
    var ratingHtml = '';
    if (reviews.googleRating) {
      ratingHtml =
        '<div class="stars" aria-label="' + esc(reviews.googleRating) + ' star Google rating">' +
          '<span class="s">' + esc(stars(reviews.googleRating)) + '</span>' +
          '<b>' + esc(reviews.googleRating) + '</b>' +
          '<span>· ' + esc(fmtCount(reviews.googleCount)) + ' Google reviews</span>' +
        '</div>';
    }

    // primary CTA -> patient flow
    var ctaCount = stats.primary ? '' : '';
    var primaryHtml =
      '<a class="primary" id="primaryCta" href="../patient/?from=link" role="button">' +
        '<span class="ctawrap"><span>' + esc(ctaText) + '</span>' +
        '<span class="sub">Free · 60 seconds · from your phone</span></span>' +
      '</a>';

    // custom link rows
    var rowsHtml = links.map(function (lk) {
      var url = safeUrl(lk.url);
      if (!url) return '';
      var id = lk.id || ('lk_' + Math.random().toString(36).slice(2, 7));
      var icon = lk.icon || '🔗';
      var count = stats[id] ? '<span class="lcount">' + esc(fmtCount(stats[id])) + ' taps</span>' : '';
      return '<a class="lrow" data-link-id="' + esc(id) + '" data-url="' + esc(url) +
        '" data-external="1" href="' + esc(url) + '" target="_blank" rel="noopener">' +
        '<span class="lico">' + esc(icon) + '</span>' +
        '<span class="llabel">' + esc(lk.label || url) + '</span>' +
        count +
        '<span class="larrow">›</span>' +
      '</a>';
    }).join('');

    var reviewLink = reviews.googleUrl
      ? '<a href="' + esc(safeUrl(reviews.googleUrl) || '#') + '" target="_blank" rel="noopener">See our reviews</a> · '
      : '';

    root.innerHTML =
      '<div class="bhead">' +
        '<div class="brandmark">' + markHtml + '</div>' +
        '<div class="avatar">' + avatarInner + '</div>' +
        '<div class="bname">' + esc(docName) + '</div>' +
        (role ? '<div class="brole">' + esc(role) + '</div>' : '') +
        ratingHtml +
        (tagline ? '<div class="btag">' + esc(tagline) + '</div>' : '') +
      '</div>' +
      primaryHtml +
      (rowsHtml ? '<nav class="links">' + rowsHtml + '</nav>' : '') +
      '<div class="bfoot">' + reviewLink +
        (doctor.phone ? esc(doctor.phone) : '') +
      '</div>';

    wire(root);
  }

  /* ---- wiring (track-then-navigate; no inline handlers) ----------------- */
  function wire(root) {
    var primary = root.querySelector('#primaryCta');
    if (primary) {
      primary.addEventListener('click', function (e) {
        e.preventDefault();
        go('primary', '../patient/?from=link', false);
      });
    }
    var rows = root.querySelectorAll('.lrow');
    Array.prototype.forEach.call(rows, function (row) {
      row.addEventListener('click', function (e) {
        e.preventDefault();
        var id = row.getAttribute('data-link-id');
        var url = row.getAttribute('data-url');
        var external = row.getAttribute('data-external') === '1';
        go(id, url, external);
      });
    });
  }

  // re-render if config or click counts change (e.g. doctor edits brand in another tab)
  if (Store && Store.onChange) Store.onChange(render);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
