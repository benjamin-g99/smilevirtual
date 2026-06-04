/* =============================================================================
   Aesthetic Virtual — practice console (plastics)
   Reads AestheticStore. Triages by qualification tier, drafts a surgeon script,
   records a consult video in the studio, and previews the patient closing page.
   ============================================================================= */
(function (global) {
  'use strict';
  const S = global.AestheticStore;
  const $ = id => document.getElementById(id);
  const cfg = () => S.config();
  let openId = null, activeFilter = 'all';
  const recordedBlobs = {};

  const STATUS_ORDER = { new:0, recorded:1, sent:2, viewed:3, booked:4 };
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const money = n => '$'+(n||0).toLocaleString();
  function timeAgo(iso){ const h=(Date.now()-new Date(iso).getTime())/36e5; return h<1?Math.max(1,Math.round(h*60))+'m ago':h<24?Math.round(h)+'h ago':Math.round(h/24)+'d ago'; }
  function initials(l){ const n=(l.contact&&l.contact.firstName)||''; return n?n.slice(0,2).toUpperCase():'··'; }
  function name(l){ return (l.contact&&l.contact.firstName)||'Anonymous lead'; }
  function procLabels(l){ return (l.procedures||[]).map(id=>S.procById(id)).filter(Boolean); }
  function toast(m){ let t=$('toast'); if(!t){ t=document.createElement('div'); t.id='toast'; document.body.appendChild(t);} t.textContent=m; t.style.opacity='1'; clearTimeout(t._h); t._h=setTimeout(()=>t.style.opacity='0',2400); }

  /* ---- plastics plan + script ---- */
  const APPROACH = {
    rhino:'refine the bridge and tip while keeping it natural and balanced to your face',
    breast_aug:'choose an implant size, profile and placement that matches your frame',
    breast_lift:'reposition and reshape for a lifted, natural contour',
    tummy:'remove excess skin and tighten the abdominal muscles',
    lipo:'sculpt the area and refine the contour',
    facelift:'restore a rested, natural look — not "done"',
    bleph:'open up tired-looking eyes with a subtle, refreshed result',
    mommy:'combine procedures into one recovery to restore your pre-pregnancy shape'
  };
  function planFor(l){
    const procs=procLabels(l);
    const from=procs.reduce((s,p)=>s+p.from,0), to=procs.reduce((s,p)=>s+p.to,0);
    const mo=procs.length?Math.min(...procs.map(p=>p.mo)):155;
    return { lines:procs.map(p=>({k:p.label, v:money(p.from)+'–'+money(p.to)})), from, to,
      range: procs.length?money(from)+'–'+money(to):'reviewed at your consult', financingMo:mo };
  }
  function scriptFor(l){
    const doc='Dr. '+(cfg().surgeon.name.split(' ').slice(-1)[0]);
    const nm=name(l); const procs=procLabels(l); const i=l.intake||{}; const q=l.qual||{};
    const lines=[];
    lines.push({cue:'Warm open', text:`Hi ${nm}, it’s ${doc} — thank you for trusting me with this. I reviewed your photos personally.`});
    if(procs.length) lines.push({cue:'Reflect goal', text:`You’re considering ${procs.map(p=>p.label.toLowerCase()).join(' and ')}${l.goalText?` — and I hear you: “${esc(l.goalText)}.”`:'.'}`});
    else if(l.goalText) lines.push({cue:'Reflect goal', text:`You told me: “${esc(l.goalText)}.” Let’s talk through what’s realistic.`});
    const appr=procs.map(p=>APPROACH[p.id]).filter(Boolean);
    if(appr.length) lines.push({cue:'Your approach', text:`Here’s how I’d approach it: ${appr.join('; and ')}.`});
    lines.push({cue:'Candid expectations', text:`From your photos you look like a good candidate — we’ll confirm everything at your visit.${(q.flags&&q.flags.includes('smoker'))?' One important thing: stopping nicotine well before surgery really matters for healing.':''}`});
    lines.push({cue:'Similar results', text:`Let me show you results from patients who started in a similar place.`});
    lines.push({cue:'Investment & financing', text:`Most patients finance this — it can land around ${money(planFor(l).financingMo)}/mo. I’ll include options.`});
    if(/asap|soon|1.?3/i.test(i.timeline||'')) lines.push({cue:'Match timeline', text:`Since you’d like to move soon, my team can hold a couple of consult times for you.`});
    lines.push({cue:'Next step', text:`If this feels right, reserve a consult with a refundable deposit and we’ll map your full plan together.`});
    lines.push({cue:'Warm close', text:`Either way, no pressure at all — I’m looking forward to helping you, ${nm}.`});
    return lines;
  }

  /* ---- queue ---- */
  function boot(){
    S.ensureSeeded();
    $('resetDemo').addEventListener('click', ()=>{ if(confirm('Reset aesthetic demo leads?')){ S.reset(); render(); } });
    document.querySelectorAll('.chipf').forEach(b=>b.addEventListener('click',()=>{ activeFilter=b.dataset.filter; document.querySelectorAll('.chipf').forEach(x=>x.classList.toggle('active',x===b)); renderQueue(); }));
    $('scrim').addEventListener('click', closeDrawer);
    $('emailModal').addEventListener('click', e=>{ if(e.target.id==='emailModal') closeEmail(); });
    S.onChange(render);
    render();
  }
  function render(){ renderQueue(); if(openId) renderDrawer(openId); }
  function done(l){ return ['sent','viewed','booked'].includes(l.status); }
  function passes(l){
    if(activeFilter==='hot') return l.qual.tier==='hot' && !done(l);
    if(activeFilter==='warm') return l.qual.tier==='warm' && !done(l);
    if(activeFilter==='awaiting') return ['sent','viewed'].includes(l.status);
    return true;
  }
  const TIER_RANK={hot:0,warm:1,cold:2};
  function renderQueue(){
    let leads=S.all().filter(l=>l.furthestStep!=='welcome').filter(passes);
    leads.sort((a,b)=>{
      const da=done(a),db=done(b); if(da!==db) return da?1:-1;
      if(!da && TIER_RANK[a.qual.tier]!==TIER_RANK[b.qual.tier]) return TIER_RANK[a.qual.tier]-TIER_RANK[b.qual.tier];
      return new Date(b.createdAt)-new Date(a.createdAt);
    });
    const hot=S.all().filter(l=>l.qual.tier==='hot'&&!done(l)).length;
    $('queueNote').innerHTML = `${leads.length} in view · <b style="color:var(--hot)">${hot} hot</b> · sorted by qualification`;
    const list=$('leadList');
    if(!leads.length){ list.innerHTML='<div class="empty">No leads in this view.</div>'; return; }
    list.innerHTML=leads.map(l=>{
      const procs=procLabels(l); const ava=(l.photos&&l.photos[0]&&l.photos[0].indexOf('data:')===0)?`<img src="${l.photos[0]}">`:initials(l);
      const flags=(l.qual.flags||[]).map(f=>`<span class="flag">⚑ ${f}</span>`).join('');
      return `<div class="lead" onclick="AV.openLead('${l.id}')">
        <div class="ava">${ava}</div>
        <div class="main">
          <div class="name">${esc(name(l))} <span class="tier ${l.qual.tier}">${l.qual.tier}</span></div>
          <div class="procs">${procs.map(p=>`<span class="ptag">${p.icon} ${p.label}</span>`).join('')||'<span class="ptag">—</span>'}</div>
          <div class="meta-row"><span class="srcb">${esc((l.source&&l.source.utm_source)||'direct')}</span>${l.intake&&l.intake.timeline?`<span>⏱ ${esc(l.intake.timeline)}</span>`:''}<span>${timeAgo(l.createdAt)}</span>${flags}</div>
        </div>
        <div class="right">
          <span class="val">~${money(l.qual.value)}</span>
          <span class="statp" data-s="${l.status}">${l.status}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ---- drawer ---- */
  function openLead(id){ openId=id; renderDrawer(id); $('drawer').classList.add('show'); $('scrim').classList.add('show'); }
  function closeDrawer(){ openId=null; $('drawer').classList.remove('show'); $('scrim').classList.remove('show'); }
  function renderDrawer(id){
    const l=S.get(id); if(!l){ closeDrawer(); return; }
    const c=l.contact||{}, q=l.qual||{}, i=l.intake||{}, procs=procLabels(l), plan=planFor(l);
    const ava=(l.photos&&l.photos[0]&&l.photos[0].indexOf('data:')===0)?`<img src="${l.photos[0]}">`:initials(l);
    const hasRec=!!recordedBlobs[id]||(l.video&&l.video.recordedAt);
    const sent=l.video&&l.video.sentAt;
    const cta = !hasRec
      ? `<button class="cta-d big-cta" onclick="AV.openStudio('${id}')">🎬 Record consult video</button>`
      : !sent
        ? `<button class="cta-d big-cta rose-d" onclick="AV.sendVideo('${id}')">📤 Send video consult</button>
           <button class="cta-d ghost-d" onclick="AV.openStudio('${id}')">⟳ Re-record</button>
           <button class="cta-d ghost-d" onclick="AV.previewEmail('${id}')">Preview</button>`
        : `<div class="cta-sent">✓ Sent ${timeAgo(l.video.sentAt)} · ${l.status}</div><button class="cta-d ghost-d" onclick="AV.previewEmail('${id}')">Preview closing page</button>`;
    const ans=[['Timeline',i.timeline],['Budget',{ready:'Budget set aside',financing:'Wants financing',exploring:'Exploring costs'}[i.budget]||i.budget],['Smoker',i.smoker],['Prior surgery',i.priorSurgery]]
      .filter(r=>r[1]).map(r=>`<div class="row"><div class="k">${r[0]}</div><div class="v">${esc(r[1])}</div></div>`).join('');
    const pctRing = Math.round((q.score||0)*3.6);

    $('drawer').innerHTML=`
      <div class="dr-head"><div class="ava">${ava}</div>
        <div class="t"><b>${esc(name(l))}</b><span>${esc(c.email||'no email')} ${c.phone?'· '+esc(c.phone):''}</span></div>
        <button class="x" onclick="AV.closeDrawer()">✕</button></div>
      <div class="dr-cta">${cta}</div>
      <div class="dr-body">

        <div class="card"><div class="ct">Qualification</div>
          <div class="qual">
            <div class="ring" style="--p:${pctRing}deg"><span>${q.score||0}</span></div>
            <div class="qmeta"><b><span class="tier ${q.tier}">${q.tier}</span> · est. value ~${money(q.value)}</b>
              <div>${(q.flags&&q.flags.length)?'⚑ '+q.flags.join(', '):'No candidacy flags'} · ${i.budget==='ready'?'budget ready':i.budget==='financing'?'wants financing':'exploring costs'}</div></div>
          </div></div>

        <div class="card"><div class="ct">Photos (confidential)</div>
          <div class="photos">${[0,1].map(n=>{ const p=l.photos&&l.photos[n]; return `<div class="p">${p&&p.indexOf('data:')===0?`<img src="${p}">`:'📷'}<span class="cap">${n===0?'Front':'Profile'}</span></div>`; }).join('')}</div></div>

        <div class="card"><div class="ct">Procedures & intake</div>
          <div class="kv">
            <div class="row"><div class="k">Considering</div><div class="v">${procs.map(p=>p.label).join(', ')||'—'}</div></div>
            ${l.goalText?`<div class="row"><div class="k">In their words</div><div class="v quote">“${esc(l.goalText)}”</div></div>`:''}
            ${ans}
            <div class="row"><div class="k">Ballpark</div><div class="v">${plan.range} · financing from ${money(plan.financingMo)}/mo</div></div>
          </div></div>

        <div class="card"><div class="ct">Surgeon video script <span style="color:var(--gold)">✨ AI-drafted</span></div>
          <div class="script">${scriptFor(l).map(s=>`<div class="scriptline"><div class="cue">${esc(s.cue)}</div><div class="tx">${esc(s.text)}</div></div>`).join('')}</div></div>

        ${statusFlow(l)}

        <div class="card"><div class="ct">Send & follow-up</div>
          <div class="btnrow">
            ${sent&&l.status==='sent'?`<button class="cta-d ghost-d" onclick="AV.simulate('${id}','viewed')">Simulate: viewed</button>`:''}
            ${l.status==='viewed'?`<button class="cta-d rose-d" onclick="AV.simulate('${id}','booked')">Simulate: booked consult</button>`:''}
            ${!hasRec?'<div class="muted small">Record the surgeon video to send this consult.</div>':''}
          </div>
          ${l.booking?`<div class="paidbox"><div class="perm">📅 ${esc(l.booking.note||'Consult booked')}</div>
            <label class="perm"><input type="checkbox" ${l.booking.paid?'checked':''} onchange="AV.markPaid('${id}',this.checked)"> proceeded to surgery / paid</label>
            <label class="sfield"><span>Case value ($)</span><input type="number" value="${l.booking.value||''}" onchange="AV.setValue('${id}',this.value)" placeholder="e.g. 12000"></label></div>`:''}
        </div>

      </div>`;
  }
  function statusFlow(l){
    const steps=[['new','New'],['recorded','Recorded'],['sent','Sent'],['viewed','Viewed'],['booked','Booked']];
    const ord=STATUS_ORDER[l.status]||0;
    return `<div class="card"><div class="ct">Status</div><div class="statusflow">`+
      steps.map(([k,lb],n)=>`<span class="stp ${l.status===k?'cur':(STATUS_ORDER[k]<ord?'done':'')}">${lb}</span>${n<steps.length-1?'<span class="arr">→</span>':''}`).join('')+`</div></div>`;
  }
  function sendVideo(id){ S.patch(id,{status:'sent', video:Object.assign({},S.get(id).video,{sentAt:new Date().toISOString()})}); toast('Video consult sent to the patient'); }
  function simulate(id,to){ const ex={}; if(to==='viewed') ex.video=Object.assign({},S.get(id).video,{viewedAt:new Date().toISOString()}); if(to==='booked') ex.booking={bookedAt:new Date().toISOString(), note:'Consult booked + deposit paid'}; S.patch(id,Object.assign({status:to},ex)); toast(to==='booked'?'🎉 Consult booked':'Patient viewed the video'); }
  function markPaid(id,on){ const l=S.get(id); S.patch(id,{booking:Object.assign({},l.booking,{paid:on})}); }
  function setValue(id,v){ const l=S.get(id); S.patch(id,{booking:Object.assign({},l.booking,{value:+v||0})}); }

  /* ---- Consult Studio (slides + PiP, canvas record) ---- */
  const PIP=[{k:'br',l:'bottom-right'},{k:'bl',l:'bottom-left'},{k:'full',l:'full (talking head)'},{k:'off',l:'hidden'}];
  let st={ id:null, slides:[], idx:0, raf:0, pip:0, tele:true, cam:null, rec:null, chunks:[], timer:null, t0:0, ready:false };
  const stage=()=>$('stage'), sctx=()=>$('stage').getContext('2d');
  function imgFrom(src){ const i=new Image(); i.src=src; return i; }

  async function openStudio(id){
    st.id=id; st.idx=0; st.pip=0; st.tele=true;
    const l=S.get(id); st.slides=await buildSlides(l);
    $('studioPatient').textContent='— '+name(l);
    renderStrip(); updateSlide(); updatePip();
    $('recUse').hidden=true; $('recDot').hidden=true; $('recVideo').classList.remove('review');
    $('recToggle').textContent='● Start recording'; $('teleToggle').textContent='📝 Script: on'; $('teleprompter').classList.remove('off');
    $('studio').classList.add('show');
    try{ st.cam=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280}},audio:true}); $('recVideo').srcObject=st.cam; await $('recVideo').play().catch(()=>{}); st.ready=true; }
    catch(e){ st.ready=false; st.pip=PIP.findIndex(p=>p.k==='off'); updatePip(); toast('No camera — you can still record slides + audio if mic is allowed.'); }
    startDraw();
  }
  async function buildSlides(l){
    const sc=scriptFor(l); const note=(...c)=>sc.filter(x=>c.some(k=>x.cue.toLowerCase().includes(k))).map(x=>x.text).join(' ');
    const procs=procLabels(l), plan=planFor(l);
    const photoSrcs=(l.photos||[]).filter(p=>p&&p.indexOf('data:')===0);
    const imgs=await Promise.all(photoSrcs.map(src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src;})));
    return [
      {kind:'intro', name:name(l), procs:procs.map(p=>p.label), note:note('warm open','reflect')},
      {kind:'photos', imgs:imgs.filter(Boolean), note:note('candid','approach')},
      {kind:'cases', label:(procs[0]?procs[0].label:'Similar')+' — representative result', note:note('similar')},
      {kind:'plan', plan, note:note('investment','approach')},
      {kind:'next', deposit:cfg().depositAmount, note:note('next step','close')}
    ];
  }
  function startDraw(){ cancelAnimationFrame(st.raf); const loop=()=>{ drawStage(); st.raf=requestAnimationFrame(loop); }; loop(); }
  function drawStage(){ const c=sctx(),W=stage().width,H=stage().height,s=st.slides[st.idx],mode=PIP[st.pip].k;
    if(mode==='full'&&st.ready){ drawVid(c,0,0,W,H); lowerThird(c,W,H); } else { drawSlide(c,s,W,H); if(st.ready&&mode!=='off') drawPip(c,W,H); } }
  function drawVid(c,x,y,w,h){ const v=$('recVideo'),vw=v.videoWidth||1280,vh=v.videoHeight||720,ar=vw/vh,tar=w/h; let dw,dh; if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;}
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip(); c.translate(x+w,y); c.scale(-1,1); c.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh); c.restore(); }
  function drawPip(c,W,H){ const w=Math.round(W*0.26),h=Math.round(w*9/16),pad=28,x=PIP[st.pip].k==='bl'?pad:W-w-pad,y=H-h-pad;
    c.save(); rr(c,x,y,w,h,16); c.clip(); drawVid(c,x,y,w,h); c.restore(); c.save(); rr(c,x,y,w,h,16); c.lineWidth=4; c.strokeStyle='#fff'; c.stroke(); c.restore(); }
  function drawSlide(c,s,W,H){ const B=cfg().brand;
    const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,B.primary); g.addColorStop(1,shade(B.primary)); c.fillStyle=g; c.fillRect(0,0,W,H);
    c.textAlign='left'; if(!s) return;
    if(s.kind==='intro'){ c.fillStyle='rgba(255,255,255,.6)'; c.font='600 26px Plus Jakarta Sans'; c.fillText('Your personal video consultation',80,140);
      c.fillStyle='#fff'; c.font='500 72px Fraunces'; c.fillText(s.name,78,235);
      c.fillStyle=B.accent; c.font='600 30px Plus Jakarta Sans'; c.fillText(s.procs.join(' · ')||'Consultation',80,310);
      c.fillStyle='rgba(255,255,255,.7)'; c.font='500 26px Plus Jakarta Sans'; c.fillText('with '+cfg().surgeon.name+', '+cfg().surgeon.credential,80,H-70); }
    else if(s.kind==='photos'){ title(c,'Your photos',B); if(s.imgs&&s.imgs.length){ const n=s.imgs.length,gap=40,aw=(W-160-gap*(n-1))/n; s.imgs.forEach((im,i)=>{ const x=80+i*(aw+gap),y=170,h=440; c.save(); rr(c,x,y,aw,h,18); c.clip(); cover(c,im,x,y,aw,h); c.restore(); stroke(c,x,y,aw,h,18); }); } else note(c,'Patient photos (this demo lead used placeholders).',W,H); }
    else if(s.kind==='cases'){ title(c,'A result like yours',B); c.fillStyle=B.accent; c.font='600 26px Plus Jakarta Sans'; c.fillText(s.label,80,150);
      const bw=(W-200)/2,y=185,h=420; casePanel(c,80,y,bw,h,'Before'); casePanel(c,120+bw,y,bw,h,'After');
      c.fillStyle='rgba(255,255,255,.6)'; c.textAlign='center'; c.font='500 20px Plus Jakarta Sans'; c.fillText('Illustrative — individual results vary.',W/2,H-50); c.textAlign='left'; }
    else if(s.kind==='plan'){ title(c,'Your plan & investment',B); let y=210; c.font='500 32px Plus Jakarta Sans';
      s.plan.lines.forEach(p=>{ c.fillStyle='#fff'; c.fillText('• '+p.k,90,y); c.textAlign='right'; c.fillStyle=B.accent; c.fillText(p.v,W-90,y); c.textAlign='left'; y+=58; });
      c.fillStyle='rgba(255,255,255,.9)'; c.font='600 26px Plus Jakarta Sans'; c.fillText('Financing from '+money(s.plan.financingMo)+'/mo',90,y+10); }
    else if(s.kind==='next'){ title(c,'Reserve your consult',B); c.fillStyle='rgba(255,255,255,.9)'; c.font='400 30px Plus Jakarta Sans'; wrap(c,'Meet 1-on-1 to finalize your plan. Reserve your spot with a fully refundable deposit.',80,210,W-160,42);
      c.fillStyle=B.accent; rr(c,80,H-170,460,72,16); c.fill(); c.fillStyle=B.primary; c.font='700 28px Plus Jakarta Sans'; c.fillText('Book consult · '+money(s.deposit)+' refundable',104,H-126); } }
  function title(c,t,B){ c.fillStyle='#fff'; c.font='500 52px Fraunces'; c.textAlign='left'; c.fillText(t,80,110); c.strokeStyle=B.accent; c.globalAlpha=.7; c.lineWidth=3; c.beginPath(); c.moveTo(82,128); c.lineTo(82+t.length*20,128); c.stroke(); c.globalAlpha=1; }
  function note(c,t,W,H){ c.fillStyle='rgba(255,255,255,.5)'; c.font='500 26px Plus Jakarta Sans'; c.textAlign='center'; wrap(c,t,W/2,H/2,W-300,36); c.textAlign='left'; }
  function casePanel(c,x,y,w,h,lab){ c.save(); rr(c,x,y,w,h,18); c.clip(); const g=c.createLinearGradient(x,y,x,y+h); g.addColorStop(0,'#E7D6D2'); g.addColorStop(1,'#C9A9A4'); c.fillStyle=g; c.fillRect(x,y,w,h); c.fillStyle='rgba(74,47,80,.35)'; c.font='600 22px Plus Jakarta Sans'; c.textAlign='center'; c.fillText('photo',x+w/2,y+h/2); c.textAlign='left'; c.restore(); stroke(c,x,y,w,h,18); tag(c,x+14,y+14,lab); }
  function cover(c,im,x,y,w,h){ if(!im||!im.complete||!im.naturalWidth)return; const ar=im.width/im.height,tar=w/h; let dw,dh; if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;} c.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh); }
  function tag(c,x,y,t){ c.fillStyle='rgba(0,0,0,.5)'; const w=t.length*11+20; rr(c,x,y,w,30,8); c.fill(); c.fillStyle='#fff'; c.font='700 16px Plus Jakarta Sans'; c.textAlign='left'; c.fillText(t,x+10,y+21); }
  function rr(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function stroke(c,x,y,w,h,r){ c.save(); rr(c,x,y,w,h,r); c.lineWidth=3; c.strokeStyle='rgba(255,255,255,.25)'; c.stroke(); c.restore(); }
  function wrap(c,t,x,y,maxw,lh){ const ws=String(t).split(' '); let line='',yy=y; ws.forEach(w=>{ const test=line+w+' '; if(c.measureText(test).width>maxw&&line){ c.fillText(line.trim(),x,yy); line=w+' '; yy+=lh; } else line=test; }); c.fillText(line.trim(),x,yy); }
  function shade(hex){ const n=parseInt(hex.replace('#',''),16); let r=Math.max(0,(n>>16)-26),g=Math.max(0,((n>>8)&255)-26),b=Math.max(0,(n&255)-26); return '#'+(r<<16|g<<8|b).toString(16).padStart(6,'0'); }

  function renderStrip(){ const ic={intro:'👋',photos:'🖼️',cases:'✨',plan:'📋',next:'📅'}; const lb={intro:'Intro',photos:'Patient photos',cases:'Similar result',plan:'Plan & cost',next:'Book consult'};
    $('slideStrip').innerHTML=st.slides.map((s,i)=>`<div class="sthumb ${i===st.idx?'cur':''}" onclick="AV.goSlide(${i})"><span class="si">${ic[s.kind]}</span>${lb[s.kind]}</div>`).join(''); }
  function updateSlide(){ $('slideCount').textContent=(st.idx+1)+' / '+st.slides.length; document.querySelectorAll('.sthumb').forEach((e,i)=>e.classList.toggle('cur',i===st.idx)); const s=st.slides[st.idx]; $('teleprompter').innerHTML=s&&s.note?`<div class="tl"><b>Talking points</b>${esc(s.note)}</div>`:''; }
  function goSlide(i){ st.idx=Math.max(0,Math.min(st.slides.length-1,i)); updateSlide(); }
  function prevSlide(){ goSlide(st.idx-1); } function nextSlide(){ goSlide(st.idx+1); }
  function cyclePip(){ st.pip=(st.pip+1)%PIP.length; updatePip(); } function updatePip(){ $('pipToggle').textContent='📹 Camera: '+PIP[st.pip].l; }
  function toggleTele(){ st.tele=!st.tele; $('teleprompter').classList.toggle('off',!st.tele); $('teleToggle').textContent='📝 Script: '+(st.tele?'on':'off'); }
  function pickMime(){ return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))||''; }
  function toggleRecord(){
    if(st.rec&&st.rec.state==='recording'){ st.rec.stop(); return; }
    let cs; try{ cs=stage().captureStream(30); }catch(e){ toast('Canvas recording unsupported here.'); return; }
    if(st.cam){ const a=st.cam.getAudioTracks()[0]; if(a) cs.addTrack(a); }
    st.chunks=[]; try{ st.rec=new MediaRecorder(cs,pickMime()?{mimeType:pickMime()}:undefined); }catch(e){ toast('Recording not supported.'); return; }
    st.rec.ondataavailable=e=>{ if(e.data.size) st.chunks.push(e.data); };
    st.rec.onstop=()=>{ const blob=new Blob(st.chunks,{type:'video/webm'}),url=URL.createObjectURL(blob); recordedBlobs[st.id]={url,dur:Math.round((Date.now()-st.t0)/1000)};
      clearInterval(st.timer); $('recDot').hidden=true; const v=$('recVideo'); v.srcObject=null; v.src=url; v.muted=false; v.classList.add('review'); v.play().catch(()=>{}); cancelAnimationFrame(st.raf);
      $('recToggle').textContent='⟳ Re-record'; $('recUse').hidden=false; };
    st.rec.start(); st.t0=Date.now(); $('recDot').hidden=false; $('recToggle').textContent='■ Stop recording'; $('recVideo').classList.remove('review'); startDraw();
    st.timer=setInterval(()=>{ const s=Math.round((Date.now()-st.t0)/1000); $('recTime').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); },500);
  }
  function useRecording(){ const r=recordedBlobs[st.id]; S.patch(st.id,{status:'recorded', video:{recordedAt:new Date().toISOString(), durationSec:r?r.dur:0, hasRecording:true}}); closeStudio(); toast('Take saved. Ready to send.'); }
  function closeStudio(){ if(st.rec&&st.rec.state==='recording') try{st.rec.stop()}catch(e){} if(st.cam){ st.cam.getTracks().forEach(t=>t.stop()); st.cam=null; } cancelAnimationFrame(st.raf); clearInterval(st.timer); st.ready=false; const v=$('recVideo'); v.srcObject=null; v.src=''; v.classList.remove('review'); $('studio').classList.remove('show'); }

  /* ---- closing page preview ---- */
  function previewEmail(id){ const l=S.get(id),c=l.contact||{},plan=planFor(l),rec=recordedBlobs[id],doc=cfg().surgeon;
    const docI=doc.name.replace(/^Dr\.?\s*/,'').split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
    $('emailCard').innerHTML=`<button class="modal-x" onclick="AV.closeEmail()">✕</button>
      <div class="email-top"><div class="ava">${docI}</div><div><b>${esc(doc.name)}</b><span>recorded a personal consultation for you</span></div></div>
      <div class="email-body">
        <p style="font-size:15px;margin-bottom:14px">Hi ${esc(c.firstName||'there')}, I reviewed your case personally — here's your video.</p>
        <div class="email-video">${rec?`<video src="${rec.url}" controls></video>`:`<div class="play">▶</div><span class="vlabel">Your consultation · ${l.video?l.video.durationSec+'s':'~2 min'}</span>`}</div>
        <div class="planbox"><div style="font-size:12px;font-weight:700;color:var(--plum-deep);margin-bottom:6px">Your likely plan</div>
          ${plan.lines.map(p=>`<div class="pl"><span>${esc(p.k)}</span><b>${esc(p.v)}</b></div>`).join('')||'<div class="pl"><span>Custom plan</span><b>reviewed at consult</b></div>'}
          <div class="pl" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span>Financing from</span><b>${money(plan.financingMo)}/mo</b></div></div>
        <div class="finrow">${(cfg().financing.partners||[]).map(p=>`<span class="f">💳 ${esc(p)}</span>`).join('')}</div>
        <button class="book-cta" onclick="AV.bookFromEmail('${id}')">📅 Book my consult — ${money(cfg().depositAmount)} refundable deposit</button>
        <div class="fineprint">Illustrative estimate. Final plan confirmed at your in-person consult with ${esc(doc.name)}.</div>
      </div>`;
    $('emailModal').classList.add('show'); }
  function bookFromEmail(id){ S.patch(id,{status:'booked', booking:{bookedAt:new Date().toISOString(), note:'Self-booked from video — deposit paid', deposit:cfg().depositAmount}}); closeEmail(); toast('🎉 Patient booked a consult + paid the deposit'); }
  function closeEmail(){ $('emailModal').classList.remove('show'); }

  global.AV={ openLead, closeDrawer, openStudio, closeStudio, prevSlide, nextSlide, goSlide, cyclePip, toggleTele, toggleRecord, useRecording, sendVideo, simulate, markPaid, setValue, previewEmail, closeEmail, bookFromEmail };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
