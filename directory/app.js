/* =============================================================================
   SmileVirtual — Find a Doctor (directory)
   Simulation-first lead engine: browse NPI-verified local doctors, matched by
   goal + distance, then route into the free-preview consult flow. The featured
   doctor's response-time badge is computed LIVE from the practice console
   (SmileStore) — fast, great consults literally earn better directory ranking.
   ============================================================================= */
(function (global) {
  'use strict';
  const D = global.SmileDirectory;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const state = {
    loc: D.coordsFor('Trabuco Canyon'),
    locLabel: 'Trabuco Canyon, CA',
    name: '',
    dist: 50,
    sort: 'distance',
    goals: new Set()
  };

  // seeded response times (hrs); featured doctor is overridden with the live
  // console median so the directory reflects real practice performance.
  const RESP = { harris:18, aminikharrazi:22, abidali:30, adames:18, abdelmalek:26, addonizio:14, allen:36 };
  function responseHrs(doc){
    if(doc.featured && global.SmileStore){
      const m = SmileStore.metrics();
      if(m.medianTimeToSendH!=null) return Math.max(1, Math.round(m.medianTimeToSendH));
    }
    return RESP[doc.id] || 24;
  }

  /* ---- enrich + filter + sort ---- */
  function enriched(){
    return D.DOCTORS.map(doc=>{
      const coords = D.coordsFor(doc.city);
      return Object.assign({}, doc, {
        distance: D.haversineMi(state.loc, coords),
        respHrs: responseHrs(doc),
        coords
      });
    });
  }
  function filtered(){
    let list = enriched().filter(d=>{
      if(d.distance > state.dist) return false;
      if(state.name && !(d.name+' '+d.clinic).toLowerCase().includes(state.name.toLowerCase())) return false;
      if(state.goals.size && ![...state.goals].every(g=>d.goals.includes(g))) return false;
      return true;
    });
    list.sort((a,b)=>{
      if(a.featured!==b.featured) return a.featured?-1:1;            // featured pinned on top
      if(state.sort==='rating') return b.rating-a.rating;
      if(state.sort==='response') return a.respHrs-b.respHrs;
      return a.distance-b.distance;
    });
    return list;
  }

  /* ---- render ---- */
  function render(){
    const list = filtered();
    $('#resCount').textContent = list.length + (list.length===1?' doctor':' doctors') + ' near you';
    $('#resSub').textContent = `Within ${state.dist} mi of ${state.locLabel}` + (state.goals.size?` · for ${[...state.goals].join(', ')}`:'');
    $('#docList').innerHTML = list.length ? list.map(cardHtml).join('')
      : `<div class="empty">No verified doctors match these filters. Try widening the distance or clearing goals.</div>`;
    renderMap(list);
  }

  function stars(r){ const full=Math.round(r); return '★★★★★'.slice(0,full)+'☆☆☆☆☆'.slice(0,5-full); }
  function cardHtml(d){
    const fast = d.respHrs<=18;
    return `<div class="doc ${d.featured?'featured':''}">
      <div class="ava" style="background:linear-gradient(135deg,${d.accent},${shade(d.accent)})">${initials(d.name)}</div>
      <div class="body">
        <div class="nm">
          <b>${esc(d.name)}</b><span class="cred">${esc(d.credential)}</span>
          ${d.verified?`<span class="verified" title="${d.npi?'Verified against the CMS NPPES registry · NPI '+d.npi:'SmileVirtual verified provider'}">✓ NPI-verified</span>`:''}
          ${d.featured?'<span class="feat-badge">Featured</span>':''}
        </div>
        <div class="spec">${esc(d.specialty)}</div>
        <div class="where">
          <span class="rate"><span class="stars">${stars(d.rating)}</span> <b>${d.rating}</b> · ${d.reviews} reviews</span>
          <span>${esc(d.clinic)}, ${esc(d.city)} · <span class="dist">${d.distance} mi</span></span>
        </div>
        <div class="resp ${fast?'fast':''}">⏱ ${fast?'Usually responds same day':'Typically responds in ~'+Math.round(d.respHrs/24*10)/10+'d'}</div>
        <div class="gtags">${d.goals.slice(0,5).map(g=>`<span class="gt">${g}</span>`).join('')}</div>
      </div>
      <div class="right">
        <div class="fin">Financing from<b>$${d.financingFrom}/mo</b></div>
        <div class="btns">
          <a class="cta-d" href="../patient/?from=directory&doctor=${d.id}">✨ Free preview</a>
          <button class="cta-d viewbtn" onclick="Dir.openProfile('${d.id}')">View profile</button>
        </div>
      </div>
    </div>`;
  }

  /* ---- map with positioned pins ---- */
  function renderMap(list){
    const map = $('#map');
    map.querySelectorAll('.pin').forEach(p=>p.remove());
    const pts = list.map(d=>d.coords).concat([state.loc]);
    if(pts.length<2){ return; }
    const lats=pts.map(p=>p[0]), lngs=pts.map(p=>p[1]);
    let minLat=Math.min(...lats),maxLat=Math.max(...lats),minLng=Math.min(...lngs),maxLng=Math.max(...lngs);
    const padLat=(maxLat-minLat)*0.18+0.01, padLng=(maxLng-minLng)*0.18+0.01;
    minLat-=padLat;maxLat+=padLat;minLng-=padLng;maxLng+=padLng;
    const xy = c => ({
      x: ((c[1]-minLng)/(maxLng-minLng))*100,
      y: (1-(c[0]-minLat)/(maxLat-minLat))*100
    });
    // "you" pin
    const you=xy(state.loc);
    map.insertAdjacentHTML('beforeend',
      `<div class="pin you" style="left:${you.x}%;top:${you.y}%"><div class="dot"></div><div class="tip">You · ${esc(state.locLabel)}</div></div>`);
    // doctor pins
    list.forEach((d,i)=>{
      const p=xy(d.coords);
      map.insertAdjacentHTML('beforeend',
        `<div class="pin ${d.featured?'featured':''}" style="left:${p.x}%;top:${p.y}%" onclick="Dir.openProfile('${d.id}')">
          <div class="dot"><i>${i+1}</i></div><div class="tip">${esc(d.name)} · ${d.distance}mi</div></div>`);
    });
  }

  /* ---- profile modal ---- */
  function openProfile(id){
    const d = enriched().find(x=>x.id===id); if(!d) return;
    const fast=d.respHrs<=18;
    $('#profCard').innerHTML = `
      <button class="modal-x" onclick="Dir.closeProfile()">✕</button>
      <div class="prof-top" style="background:linear-gradient(135deg,${d.accent},${shade(d.accent)})">
        <div class="ava">${initials(d.name)}</div>
        <div>
          <h3>${esc(d.name)}, ${esc(d.credential)}</h3>
          <div class="sub">${esc(d.specialty)} · ${esc(d.clinic)}, ${esc(d.city)}</div>
          <div class="badges">
            ${d.verified?`<span class="verified" style="background:rgba(255,255,255,.9)">✓ NPI-verified</span>`:''}
            <span class="verified" style="background:rgba(255,255,255,.9)">${stars(d.rating)} ${d.rating}</span>
          </div>
        </div>
      </div>
      <div class="prof-body">
        <div class="prof-stats">
          <div class="pstat"><div class="big">${d.distance}mi</div><div class="l">from you</div></div>
          <div class="pstat"><div class="big">${fast?'Same day':'~'+Math.round(d.respHrs/24*10)/10+'d'}</div><div class="l">response time</div></div>
          <div class="pstat"><div class="big">${d.beforeAfters}</div><div class="l">before / afters</div></div>
        </div>
        <p style="font-size:14px;line-height:1.55;color:rgba(30,42,42,.75)">${esc(d.bio)}</p>

        <h4>Recent results</h4>
        <div class="ba-row">
          <div class="ba-mini"><canvas width="200" height="150" data-ba="0"></canvas><span class="tag">Before</span></div>
          <div class="ba-mini"><canvas width="200" height="150" data-ba="1"></canvas><span class="tag">After</span></div>
        </div>

        <h4>Treats</h4>
        <div class="gtags">${d.goals.map(g=>`<span class="gt">${g}</span>`).join('')}</div>

        <div class="prof-cta">
          <a class="cta-d coral-d big" href="../patient/?from=directory&doctor=${d.id}">✨ Start my free smile preview with ${esc(firstWord(d.name))}</a>
          <span style="text-align:center;font-size:12px;color:rgba(30,42,42,.5)">Free · no office visit to begin · personal video to follow</span>
        </div>
        <div class="npi-line">
          ${d.npi?`Identity verified against the CMS NPPES registry — NPI ${d.npi}.`:'SmileVirtual featured provider.'}
          Ratings & results are illustrative demo data.
        </div>
      </div>`;
    $('#profModal').classList.add('show');
    drawSmile($('[data-ba="0"]'), false);
    drawSmile($('[data-ba="1"]'), true);
  }
  function closeProfile(){ $('#profModal').classList.remove('show'); }

  /* ---- stylized before/after (placeholder render) ---- */
  function drawSmile(cv, after){
    if(!cv) return; const c=cv.getContext('2d'),W=cv.width,H=cv.height; c.clearRect(0,0,W,H);
    const sk=c.createLinearGradient(0,0,0,H); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78');
    c.fillStyle=sk; c.fillRect(0,0,W,H);
    const cx=W/2,cy=H*0.52,mw=W*0.6,mh=mw*0.42;
    c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+11,mh/2+11,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.05,mw/2-4,mh/2-3,0,0,7); c.clip();
    const n=8,gap=2,tw=(mw-10)/n,x0=cx-(mw-10)/2,ty=cy-mh/2+2;
    for(let i=0;i<n;i++){let x=x0+i*tw,h=mh-10,y=ty;c.fillStyle=after?'#fff':'#E2D4AE';
      if(!after){if(i===3)y+=5;if(i===4)x+=3;} c.fillRect(x,y,tw-gap,h);}
    c.restore();
  }

  /* ---- inputs ---- */
  function bind(){
    $('#goalFilters').innerHTML = D.GOALS.map(g=>`<button class="gf" data-g="${g}">${g}</button>`).join('');
    $('#goalFilters').addEventListener('click', e=>{ const b=e.target.closest('.gf'); if(!b) return;
      const g=b.dataset.g; if(state.goals.has(g)){state.goals.delete(g);b.classList.remove('on');}else{state.goals.add(g);b.classList.add('on');} render(); });

    $('#nameInput').addEventListener('input', e=>{ state.name=e.target.value.trim(); render(); });
    $('#distRange').addEventListener('input', e=>{ state.dist=+e.target.value; $('#distVal').textContent=e.target.value; render(); });
    $('#sortSel').addEventListener('change', e=>{ state.sort=e.target.value; render(); });
    $('#locInput').addEventListener('change', e=>{ setLocationByText(e.target.value); });
    $('#useLoc').addEventListener('click', useMyLocation);
    $('#profModal').addEventListener('click', e=>{ if(e.target.id==='profModal') closeProfile(); });
  }
  // match typed text to a known city; otherwise keep default coords but update label
  function setLocationByText(txt){
    state.locLabel = txt || 'your area';
    const key = Object.keys(D.CITY).find(c=>txt.toLowerCase().includes(c.toLowerCase()));
    if(key) state.loc = D.CITY[key];
    render();
  }
  function useMyLocation(){
    if(!navigator.geolocation){ return; }
    $('#useLoc').textContent='Locating…';
    navigator.geolocation.getCurrentPosition(pos=>{
      state.loc=[pos.coords.latitude,pos.coords.longitude];
      state.locLabel='your current location';
      $('#locInput').value='Current location';
      $('#useLoc').textContent='Use my location';
      render();
    }, ()=>{ $('#useLoc').textContent='Use my location'; }, {timeout:8000});
  }

  /* ---- utils ---- */
  function initials(n){ return n.replace(/^Dr\.?\s*/,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
  function firstWord(n){ const m=n.replace(/^Dr\.?\s*/,''); return 'Dr. '+m.split(' ')[0]; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  function shade(hex){ // darken a hex for the gradient
    const n=parseInt(hex.slice(1),16); let r=(n>>16)-26,g=((n>>8)&255)-26,b=(n&255)-26;
    r=Math.max(0,r);g=Math.max(0,g);b=Math.max(0,b);
    return '#'+(r<<16|g<<8|b).toString(16).padStart(6,'0');
  }

  global.Dir = { openProfile, closeProfile };
  document.addEventListener('DOMContentLoaded', ()=>{
    if(global.SmileStore) SmileStore.ensureSeeded(); bind(); render();
    // deep link: /directory/?doctor=<id> opens that doctor's public profile directly
    const dq=new URLSearchParams(location.search).get('doctor');
    if(dq) setTimeout(()=>openProfile(dq), 60);
  });
})(window);
