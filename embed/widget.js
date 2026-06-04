/* =============================================================================
   SmileVirtual — embeddable widget  (embed/widget.js)
   -----------------------------------------------------------------------------
   A self-contained, dependency-free, IIFE widget script a practice can drop on
   ANY external website. It injects its own scoped styles (prefixed .sv-w*) so it
   never collides with the host page, and reads all config from the host's
   <script data-*> attributes. It does NOT depend on SmileStore (it must run on
   third-party sites with no access to the prototype's storage).

   USAGE — drop a script tag where you want the widget (inline/badge), or anywhere
   on the page (floating):

     <script src=".../embed/widget.js"
             data-widget="inline"                  (inline | floating | badge)
             data-target="https://you.com/patient/" (where the CTA goes; defaults ../patient/)
             data-accent="#0E5450"                  (brand color; optional)
             data-headline="See your new smile"     (optional copy override)
             data-cta="✨ Free Smile Preview"        (optional button label)
             data-rating="4.9" data-count="1284"    (badge only)
             data-name="Harris Smile Studio"        (badge/inline practice name)
             data-review-url="https://...">         (badge link override)
     </script>

   Or place a target element and point the script at it:
     <div data-sv-widget="inline" data-accent="#E8775B"></div>
     <script src=".../embed/widget.js" data-mount="auto"></script>
   ============================================================================= */
(function () {
  'use strict';

  var DEFAULT_TARGET = '../patient/';
  var STYLE_ID = 'sv-widget-styles';

  /* ---- find the script tag that loaded us ------------------------------- */
  function selfScript() {
    if (document.currentScript) return document.currentScript;
    // fallback: last script whose src points at widget.js
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (/widget\.js(\?|$)/.test(scripts[i].src || '')) return scripts[i];
    }
    return scripts[scripts.length - 1] || null;
  }

  /* ---- helpers ---------------------------------------------------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function attr(el, name, fallback) {
    if (!el) return fallback;
    var v = el.getAttribute(name);
    return (v === null || v === '') ? fallback : v;
  }
  function safeColor(c, fallback) {
    if (!c) return fallback;
    // accept #hex, rgb()/rgba(), or simple named colors
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return c;
    if (/^rgba?\([\d.,\s%]+\)$/i.test(c)) return c;
    if (/^[a-z]+$/i.test(c)) return c;
    return fallback;
  }
  function safeUrl(u, fallback) {
    var s = String(u || '').trim();
    if (!s) return fallback;
    if (/^https?:/i.test(s)) return s;
    if (/^\//.test(s) || /^\.\.?\//.test(s)) return s; // relative
    return fallback;
  }
  function darken(hex, amt) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
    if (!m) return hex;
    var f = function (h) { return Math.max(0, Math.round(parseInt(h, 16) * (1 - amt))); };
    var toHex = function (n) { return ('0' + n.toString(16)).slice(-2); };
    return '#' + toHex(f(m[1])) + toHex(f(m[2])) + toHex(f(m[3]));
  }
  function stars(rating) {
    var r = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return '★★★★★'.slice(0, r) + '☆☆☆☆☆'.slice(0, 5 - r);
  }

  /* ---- inject scoped styles once ---------------------------------------- */
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      // import body font if available; degrade gracefully on host sites
      "@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');" +
      ".sv-w,.sv-w *{box-sizing:border-box}" +
      ".sv-w{font-family:'Plus Jakarta Sans',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;" +
        "line-height:1.4;-webkit-font-smoothing:antialiased}" +

      /* inline card */
      ".sv-w-card{max-width:420px;width:100%;background:#F6F1E9;border:1px solid rgba(30,42,42,.10);" +
        "border-radius:22px;padding:22px 22px 20px;box-shadow:0 18px 50px -18px rgba(14,84,80,.35);" +
        "color:#1E2A2A;text-align:left;position:relative;overflow:hidden}" +
      ".sv-w-card::before{content:'';position:absolute;top:0;left:0;right:0;height:96px;" +
        "background:radial-gradient(120% 100% at 50% -30%, var(--sv-accent-soft) 0%, transparent 72%);pointer-events:none}" +
      ".sv-w-card > *{position:relative}" +
      ".sv-w-eyebrow{font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;font-weight:700;color:var(--sv-accent);margin:0 0 8px}" +
      ".sv-w-h{font-size:21px;font-weight:700;margin:0;color:#0A2E2C;letter-spacing:-.01em}" +
      ".sv-w-p{font-size:13.5px;color:rgba(30,42,42,.66);margin:8px 0 0}" +
      ".sv-w-stars{margin-top:10px;font-size:13px;color:rgba(30,42,42,.6);display:flex;align-items:center;gap:7px}" +
      ".sv-w-stars .sv-s{color:#C9A24B;letter-spacing:1px;font-size:14px}" +
      ".sv-w-stars b{color:#1E2A2A}" +

      /* button (shared) */
      ".sv-w-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;" +
        "text-decoration:none;border:none;font-family:inherit;font-weight:700;font-size:15px;color:#fff;" +
        "background:var(--sv-accent);padding:14px 20px;border-radius:14px;margin-top:16px;width:100%;" +
        "box-shadow:0 12px 26px -12px var(--sv-accent);transition:transform .15s ease,background .2s ease}" +
      ".sv-w-btn:hover{background:var(--sv-accent-deep);transform:translateY(-1px)}" +
      ".sv-w-btn:active{transform:translateY(0)}" +

      /* floating pill */
      ".sv-w-float{position:fixed;right:18px;bottom:18px;z-index:2147483000;" +
        "display:inline-flex;align-items:center;gap:9px;cursor:pointer;text-decoration:none;" +
        "font-family:'Plus Jakarta Sans',system-ui,sans-serif;font-weight:700;font-size:15px;color:#fff;" +
        "background:var(--sv-accent);padding:14px 20px;border-radius:99px;" +
        "box-shadow:0 14px 34px -10px rgba(14,84,80,.6);transition:transform .15s ease,background .2s ease}" +
      ".sv-w-float:hover{background:var(--sv-accent-deep);transform:translateY(-2px)}" +
      ".sv-w-float .sv-w-x{margin-left:2px;opacity:.7;font-weight:700;font-size:16px;line-height:1;padding:2px 0 2px 4px}" +
      ".sv-w-float .sv-w-x:hover{opacity:1}" +
      "@media (max-width:480px){.sv-w-float{right:12px;bottom:12px;font-size:14px;padding:13px 17px}}" +

      /* review badge */
      ".sv-w-badge{display:inline-flex;align-items:center;gap:12px;text-decoration:none;cursor:pointer;" +
        "background:#fff;border:1px solid rgba(30,42,42,.12);border-radius:16px;padding:11px 16px;" +
        "box-shadow:0 8px 20px -12px rgba(14,84,80,.4);color:#1E2A2A;max-width:340px}" +
      ".sv-w-badge:hover{border-color:var(--sv-accent)}" +
      ".sv-w-badge .sv-g{width:34px;height:34px;border-radius:50%;flex:none;display:grid;place-items:center;" +
        "font-weight:700;font-size:16px;background:var(--sv-accent-soft);color:var(--sv-accent-deep)}" +
      ".sv-w-badge .sv-bmeta{display:flex;flex-direction:column;line-height:1.25}" +
      ".sv-w-badge .sv-brow{display:flex;align-items:center;gap:7px;font-size:14px}" +
      ".sv-w-badge .sv-brow b{font-weight:700}" +
      ".sv-w-badge .sv-bstars{color:#C9A24B;letter-spacing:1px;font-size:13px}" +
      ".sv-w-badge .sv-bsub{font-size:11.5px;color:rgba(30,42,42,.55);font-weight:600}";
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  /* ---- theme vars on a container ---------------------------------------- */
  function themeOn(el, accent) {
    var a = safeColor(accent, '#0E5450');
    el.style.setProperty('--sv-accent', a);
    el.style.setProperty('--sv-accent-deep', /^#[0-9a-f]{6}$/i.test(a) ? darken(a, 0.25) : a);
    // soft tint: rely on hex when possible, else a neutral wash
    el.style.setProperty('--sv-accent-soft', /^#[0-9a-f]{6}$/i.test(a)
      ? hexToRgba(a, 0.14) : 'rgba(14,84,80,.12)');
  }
  function hexToRgba(hex, alpha) {
    var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    if (!m) return 'rgba(14,84,80,' + alpha + ')';
    return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + alpha + ')';
  }

  /* ---- builders --------------------------------------------------------- */
  function buildInline(cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'sv-w';
    themeOn(wrap, cfg.accent);
    var headline = cfg.headline || 'See your new smile — free';
    var copy = cfg.copy || 'Get an instant smile preview and a personal video consultation, right from your phone. No office visit to begin.';
    var cta = cfg.cta || '✨ Start my free preview';
    var ratingHtml = cfg.rating
      ? '<div class="sv-w-stars"><span class="sv-s">' + esc(stars(cfg.rating)) + '</span><b>' +
        esc(cfg.rating) + '</b><span>· ' + esc(cfg.count || '') + ' reviews</span></div>'
      : '';
    wrap.innerHTML =
      '<div class="sv-w-card">' +
        '<p class="sv-w-eyebrow">Free Smile Preview</p>' +
        '<h3 class="sv-w-h">' + esc(headline) + '</h3>' +
        '<p class="sv-w-p">' + esc(copy) + '</p>' +
        ratingHtml +
        '<a class="sv-w-btn" href="' + esc(cfg.target) + '" rel="noopener">' + esc(cta) + '</a>' +
      '</div>';
    return wrap;
  }

  function buildFloating(cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'sv-w';
    themeOn(wrap, cfg.accent);
    var cta = cfg.cta || '✨ Free Smile Preview';
    var a = document.createElement('a');
    a.className = 'sv-w-float';
    a.href = cfg.target;
    a.rel = 'noopener';
    a.innerHTML = '<span>' + esc(cta) + '</span>';
    wrap.appendChild(a);
    return wrap;
  }

  function buildBadge(cfg) {
    var wrap = document.createElement('div');
    wrap.className = 'sv-w';
    themeOn(wrap, cfg.accent);
    var rating = cfg.rating || '4.9';
    var count = cfg.count || '';
    var name = cfg.name || 'our patients';
    var href = cfg.reviewUrl || cfg.target;
    wrap.innerHTML =
      '<a class="sv-w-badge" href="' + esc(href) + '" target="_blank" rel="noopener">' +
        '<span class="sv-g">G</span>' +
        '<span class="sv-bmeta">' +
          '<span class="sv-brow"><b>' + esc(rating) + '</b>' +
            '<span class="sv-bstars">' + esc(stars(rating)) + '</span></span>' +
          '<span class="sv-bsub">' + (count ? esc(count) + ' Google reviews · ' : '') + esc(name) + '</span>' +
        '</span>' +
      '</a>';
    return wrap;
  }

  function buildWidget(type, cfg) {
    if (type === 'floating') return buildFloating(cfg);
    if (type === 'badge') return buildBadge(cfg);
    return buildInline(cfg); // default
  }

  /* ---- read config from a script/element's data-* attributes ------------ */
  function readCfg(el) {
    return {
      type: (attr(el, 'data-widget', null) || attr(el, 'data-sv-widget', null) || 'inline').toLowerCase(),
      target: safeUrl(attr(el, 'data-target', DEFAULT_TARGET), DEFAULT_TARGET),
      accent: attr(el, 'data-accent', '#0E5450'),
      headline: attr(el, 'data-headline', null),
      copy: attr(el, 'data-copy', null),
      cta: attr(el, 'data-cta', null),
      rating: attr(el, 'data-rating', null),
      count: attr(el, 'data-count', null),
      name: attr(el, 'data-name', null),
      reviewUrl: safeUrl(attr(el, 'data-review-url', null), null)
    };
  }

  /* ---- mount ------------------------------------------------------------ */
  function mountAt(scriptEl) {
    injectStyles();
    // 1) explicit mount targets via [data-sv-widget] elements (auto mode)
    var mountMode = attr(scriptEl, 'data-mount', null);
    if (mountMode === 'auto') {
      var targets = document.querySelectorAll('[data-sv-widget]');
      if (targets.length) {
        Array.prototype.forEach.call(targets, function (t) {
          if (t.getAttribute('data-sv-mounted')) return;
          var cfg = readCfg(t);
          // a script-level target/accent acts as a default if the div omits it
          if (!t.getAttribute('data-target')) cfg.target = safeUrl(attr(scriptEl, 'data-target', cfg.target), cfg.target);
          if (!t.getAttribute('data-accent')) cfg.accent = attr(scriptEl, 'data-accent', cfg.accent);
          var w = buildWidget(cfg.type, cfg);
          t.appendChild(w);
          t.setAttribute('data-sv-mounted', '1');
        });
        return;
      }
    }
    // 2) default: config lives on the script tag itself
    var cfg = readCfg(scriptEl);
    var widget = buildWidget(cfg.type, cfg);
    if (cfg.type === 'floating') {
      // fixed-position: append to body, not next to the script
      (document.body || document.documentElement).appendChild(widget);
    } else {
      // inline/badge: render in place, right after the script tag
      if (scriptEl && scriptEl.parentNode) {
        scriptEl.parentNode.insertBefore(widget, scriptEl.nextSibling);
      } else {
        (document.body || document.documentElement).appendChild(widget);
      }
    }
  }

  /* ---- public API (lets the gallery render previews on demand) ---------- */
  window.SmileWidget = {
    render: function (target, opts) {
      injectStyles();
      var el = typeof target === 'string' ? document.querySelector(target) : target;
      if (!el) return null;
      opts = opts || {};
      var cfg = {
        type: (opts.type || 'inline').toLowerCase(),
        target: safeUrl(opts.target, DEFAULT_TARGET),
        accent: opts.accent || '#0E5450',
        headline: opts.headline || null,
        copy: opts.copy || null,
        cta: opts.cta || null,
        rating: opts.rating || null,
        count: opts.count || null,
        name: opts.name || null,
        reviewUrl: safeUrl(opts.reviewUrl, null)
      };
      var w = buildWidget(cfg.type, cfg);
      el.appendChild(w);
      return w;
    }
  };

  /* ---- auto-init on load ------------------------------------------------ */
  var script = selfScript();
  // gallery host opts out of auto-mount by adding data-mount="manual"
  if (attr(script, 'data-mount', null) === 'manual') return;

  function init() { mountAt(script); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
