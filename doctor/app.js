/* =============================================================================
   SmileVirtual — Practice Console (doctor + front-desk)
   A clinical work queue with an SLA clock, a consult workspace built to compress
   time-to-video, and a source-level performance loop. Reads/writes the same
   SmileStore the patient flow writes to.
   ============================================================================= */
(function (global) {
  'use strict';

  let role = 'Dr. Brian Harris';
  let activeView = 'queue';
  let activeFilter = 'all';
  let openLeadId = null;
  const recordedBlobs = {};        // in-memory recorded takes, keyed by lead id (demo)

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const cfg = () => SmileStore.config();

  /* ---------- boot ---------- */
  function boot(){
    SmileStore.ensureSeeded();
    role = $('#rolePick').value;
    $('#rolePick').addEventListener('change', e=>{ role=e.target.value; render(); });
    $('#resetDemo').addEventListener('click', ()=>{ if(confirm('Reset all demo leads to the seeded set?')){ SmileStore.reset(); render(); } });
    $('#brandBtn').addEventListener('click', openBrand);
    $('#brandModal').addEventListener('click', e=>{ if(e.target.id==='brandModal') closeBrand(); });
    $$('.navbtn').forEach(b=>b.addEventListener('click', ()=>setView(b.dataset.view)));
    $$('.chipf').forEach(b=>b.addEventListener('click', ()=>{ activeFilter=b.dataset.filter; $$('.chipf').forEach(x=>x.classList.toggle('active',x===b)); renderQueue(); }));
    $('#scrim').addEventListener('click', closeDrawer);
    SmileStore.onChange(render);   // live refresh (incl. patient submissions in other tab)
    render();
  }

  function setView(v){
    activeView=v;
    $$('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
    $('#view-queue').hidden = v!=='queue';
    $('#view-dash').hidden  = v!=='dash';
    render();
  }

  function render(){
    const m = SmileStore.metrics();
    $('#queueBadge').textContent = m.queueSize;
    if(activeView==='queue') renderQueue(); else renderDash();
    if(openLeadId) renderDrawer(openLeadId);  // keep workspace in sync
  }

  /* ---------- helpers ---------- */
  function initials(lead){
    const n=(lead.contact&&lead.contact.firstName)||''; return n? n.slice(0,2).toUpperCase() : '··';
  }
  function displayName(lead){
    const c=lead.contact||{};
    if(c.firstName) return c.firstName + (c.email? '' : '');
    return 'Anonymous lead';
  }
  function photoTile(p, cap, big){
    if(p && p.indexOf('data:')===0) return `<div class="p"><img src="${p}" alt=""><span class="cap">${cap}</span></div>`;
    return `<div class="p">${big}<span class="cap">${cap}</span></div>`;
  }
  function slaText(lead){
    if(lead.slaLeft==null) return {cls:'', txt:''};
    if(lead.slaLeft<0) return {cls:'over', txt:`SLA overdue ${Math.abs(lead.slaLeft)}h`};
    if(lead.slaLeft<6) return {cls:'warn', txt:`${lead.slaLeft}h left on SLA`};
    return {cls:'ok', txt:`${lead.slaLeft}h left on SLA`};
  }
  function heatLabel(h){ return {hot:'🔥 Hot',warm:'Warm',cold:'Cold',done:'Closed loop'}[h]||h; }
  function srcOf(lead){ return (lead.source&&lead.source.utm_source)||'direct'; }

  /* ---------- QUEUE ---------- */
  function passesFilter(l){
    switch(activeFilter){
      case 'mine': return l.assignedTo===role;
      case 'unassigned': return !l.assignedTo && !['booked','no_response'].includes(l.status);
      case 'hot': return l.heat==='hot';
      case 'recover': return (l.heat==='warm'||l.heat==='cold') && !['sent','viewed','booked'].includes(l.status);
      case 'awaiting': return ['sent','viewed'].includes(l.status);
      default: return true;
    }
  }
  // sort: live work first (hot→warm→cold), by SLA urgency, then closed-loop by recency
  const HEAT_RANK={hot:0,warm:1,cold:2,done:3};
  function renderQueue(){
    const m = SmileStore.metrics();
    $('#queueSla').innerHTML = `${m.queueSize} awaiting a video · `+
      (m.overdue? `<b style="color:var(--coral)">${m.overdue} overdue</b> · ` : '')+
      `median time-to-send <b>${m.medianTimeToSendH==null?'—':m.medianTimeToSendH+'h'}</b>`;

    const leads = SmileStore.all().filter(passesFilter).sort((a,b)=>{
      if(HEAT_RANK[a.heat]!==HEAT_RANK[b.heat]) return HEAT_RANK[a.heat]-HEAT_RANK[b.heat];
      if(a.slaLeft!=null && b.slaLeft!=null) return a.slaLeft-b.slaLeft;
      return new Date(b.createdAt)-new Date(a.createdAt);
    });

    const list=$('#leadList');
    if(!leads.length){ list.innerHTML=`<div class="empty-state"><div class="big">📭</div>No leads in this view.</div>`; return; }
    list.innerHTML = leads.map(l=>{
      const sla=slaText(l);
      const goals=(l.goals||[]).slice(0,3).map(g=>`<span class="gtag">${g}</span>`).join('')
        || (l.goalText? `<span class="gtag">“${esc(l.goalText).slice(0,28)}”</span>`:'');
      const ava = (l.photos&&l.photos[0]&&l.photos[0].indexOf('data:')===0)
        ? `<img src="${l.photos[0]}" alt="">` : initials(l);
      const drop = l.furthestStep!=='complete' && !['sent','viewed','booked'].includes(l.status)
        ? `<span class="srcb" style="background:var(--hot-soft);color:#B6442A">dropped at ${l.furthestStep}</span>`:'';
      return `<div class="lead" onclick="DoctorApp.openLead('${l.id}')">
        <div class="ava">${ava}</div>
        <div class="main">
          <div class="name">${esc(displayName(l))} <span class="heat ${l.heat}">${heatLabel(l.heat)}</span></div>
          <div class="goals">${goals}</div>
          <div class="meta-row">
            <span class="srcb">${esc(srcOf(l))}</span>${drop}
            ${sla.txt?`<span class="sla ${sla.cls}">⏱ ${sla.txt}</span>`:''}
            <span>${timeAgo(l.createdAt)}</span>
            ${l.assignedTo?`<span class="assignee">→ ${esc(l.assignedTo)}</span>`:''}
          </div>
        </div>
        <div class="right">
          <span class="statp" data-s="${l.status}">${l.statusLabel}</span>
          ${l.sim&&l.sim.enabled?'<span class="assignee">✨ preview unlocked</span>':''}
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- DASHBOARD ---------- */
  function renderDash(){
    const m = SmileStore.metrics();
    $('#metrics').innerHTML = [
      ['queue', m.queueSize, 'Awaiting a video'],
      ['overdue', m.overdue, 'Past 24h SLA', m.overdue>0],
      ['ttv', m.medianTimeToSendH==null?'—':m.medianTimeToSendH+'h', 'Median time-to-send'],
      ['sent', m.sent, 'Videos sent'],
      ['booked', m.booked, 'Booked consults']
    ].map(([k,v,l,alert])=>`<div class="metric ${alert?'alert':''}"><div class="big">${v}</div><div class="lbl">${l}</div></div>`).join('');

    const rows = SmileStore.funnelBySource();
    const max = Math.max(1,...rows.map(r=>r.leads));
    $('#funnel').innerHTML =
      `<tr><th>Source</th><th class="barcell">Leads</th><th>Sent</th><th>Viewed</th><th>Booked</th><th>Lead→Book</th></tr>`+
      rows.map(r=>{
        const conv = r.leads? Math.round(r.booked/r.leads*100):0;
        return `<tr>
          <td class="src">${esc(r.source)}</td>
          <td class="barcell">${r.leads}<div class="fbar"><i style="width:${r.leads/max*100}%;background:var(--teal)"></i></div></td>
          <td>${r.sent}</td><td>${r.viewed}</td><td>${r.booked}</td>
          <td class="conv">${conv}%</td>
        </tr>`;
      }).join('');
  }

  /* ---------- DRAWER / CONSULT WORKSPACE ---------- */
  function openLead(id){ openLeadId=id; SmileStore.setStatus && maybeMarkReview(id); renderDrawer(id); $('#drawer').classList.add('show'); $('#scrim').classList.add('show'); }
  function maybeMarkReview(id){ const l=SmileStore.get(id); if(l && l.status==='new'){ SmileStore.setStatus(id,'in_review'); } }
  function closeDrawer(){ openLeadId=null; $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show'); }

  function renderDrawer(id){
    const l = SmileStore.get(id); if(!l){ closeDrawer(); return; }
    const c = l.contact||{};
    const ava = (l.photos&&l.photos[0]&&l.photos[0].indexOf('data:')===0)?`<img src="${l.photos[0]}">`:initials(l);
    const questions = cfg().questions||[];
    const ans = l.questionAnswers||{};
    const answered = questions.map((q,i)=> ans[i]!==undefined
      ? `<div class="row"><div class="k">${esc(q.label)}</div><div class="v ${i===0?'quote':''}">${esc(ans[i])}</div></div>`:'')
      .filter(Boolean).join('') || '<div class="muted small">No intake questions answered.</div>';

    const script = ScriptGen.generate(l, cfg());
    const hasRec = !!recordedBlobs[id] || (l.video && l.video.recordedAt);
    const sent = l.video && l.video.sentAt;

    $('#drawer').innerHTML = `
      <div class="dr-head">
        <div class="ava">${ava}</div>
        <div class="t"><b>${esc(displayName(l))}</b><span>${esc(c.email||'no email yet')} ${c.phone?'· '+esc(c.phone):''}</span></div>
        <button class="x" onclick="DoctorApp.closeDrawer()">✕</button>
      </div>
      <div class="dr-cta">
        ${ !hasRec
          ? `<button class="cta-d big-cta" onclick="DoctorApp.openRecorder('${id}')">🎬 Open Consult Studio</button>`
          : !sent
            ? `<button class="cta-d big-cta coral-d" onclick="DoctorApp.sendVideo('${id}')">📤 Send video consult</button>
               <button class="cta-d ghost-d" onclick="DoctorApp.openRecorder('${id}')">⟳ Re-record</button>
               <button class="cta-d ghost-d" onclick="DoctorApp.previewEmail('${id}')">Preview</button>`
            : `<div class="cta-sent">✓ Sent ${timeAgo(l.video.sentAt)} <span class="statp" data-s="${l.status}">${l.statusLabel}</span></div>
               <button class="cta-d ghost-d" onclick="DoctorApp.previewEmail('${id}')">Preview email</button>` }
      </div>
      <div class="dr-body">

        ${statusFlowHtml(l)}

        <div class="card">
          <div class="ct">Patient photos ${l.sim&&l.sim.enabled?'<span style="color:var(--teal)">✨ preview unlocked</span>':''}</div>
          <div class="photos">
            ${photoTile(l.photos&&l.photos[0],'Big smile','😀')}
            ${photoTile(l.photos&&l.photos[1],'Close-up','🦷')}
          </div>
        </div>

        <div class="card">
          <div class="ct">Goals & intake</div>
          <div class="kv">
            <div class="row"><div class="k">Goals</div><div class="v">${(l.goals||[]).join(', ')||'—'}</div></div>
            ${l.goalText?`<div class="row"><div class="k">In their words</div><div class="v quote">“${esc(l.goalText)}”</div></div>`:''}
            ${answered}
            <div class="row"><div class="k">Source</div><div class="v">${esc(srcOf(l))}${l.source&&l.source.campaign?' · '+esc(l.source.campaign):''}</div></div>
          </div>
        </div>

        <div class="card">
          <div class="ct">Personalized video script <span style="color:var(--gold)">✨ AI-drafted from intake</span></div>
          <div class="script" id="scriptBox">
            ${script.lines.map(ln=>`<div class="scriptline"><div class="cue">${esc(ln.cue)}</div><div class="tx">${esc(ln.text)}</div></div>`).join('')}
          </div>
          <div class="scripttools">
            <button class="cta-d" onclick="DoctorApp.openRecorder('${id}')">${hasRec?'⟳ Re-record in studio':'🎬 Open consult studio'}</button>
            <button class="ghost-d cta-d" onclick="DoctorApp.copyScript('${id}')">Copy script</button>
            ${hasRec?`<button class="ghost-d cta-d" onclick="DoctorApp.previewEmail('${id}')">Preview patient email</button>`:''}
          </div>
        </div>

        <div class="card">
          <div class="ct">Send & follow-up</div>
          <div class="btnrow">
            ${hasRec && !sent ? `<button class="cta-d coral-d" onclick="DoctorApp.sendVideo('${id}')">📤 Send video consult</button>`:''}
            ${sent && l.status==='sent' ? `<button class="ghost-d cta-d" onclick="DoctorApp.simulate('${id}','viewed')">Simulate: patient viewed</button>`:''}
            ${l.status==='viewed' ? `<button class="cta-d coral-d" onclick="DoctorApp.simulate('${id}','booked')">Simulate: patient booked</button>
               <button class="ghost-d cta-d" onclick="DoctorApp.nudge('${id}','viewed')">Send booking nudge</button>`:''}
            ${l.status==='sent' ? `<button class="ghost-d cta-d" onclick="DoctorApp.nudge('${id}','sent')">Send watch nudge</button>`:''}
            ${l.heat!=='hot' && !['sent','viewed','booked'].includes(l.status) && c.email ? `<button class="ghost-d cta-d" onclick="DoctorApp.nudge('${id}','recover')">Send recovery nudge</button>`:''}
            ${!c.email ? `<div class="muted small">No contact captured — abandoned before the ask. Retarget via the originating ad audience.</div>`:''}
          </div>
          ${l.booking?`<div class="note" style="margin-top:12px">📅 ${esc(l.booking.apptTime||'Booked')}</div>`:''}
        </div>

        <div class="card">
          <div class="ct">Assignment</div>
          <select class="assignsel" onchange="DoctorApp.assign('${id}', this.value)">
            <option value="">— Unassigned —</option>
            <option ${l.assignedTo==='Dr. Brian Harris'?'selected':''}>Dr. Brian Harris</option>
            ${(cfg().coordinators||[]).map(co=>`<option ${l.assignedTo===co?'selected':''}>${esc(co)}</option>`).join('')}
          </select>
        </div>

        <div class="card">
          <div class="ct">Tags</div>
          <div class="tagrow">
            ${['high-intent','veneers','whitening','financing','abandoned','VIP'].map(t=>
              `<button class="tagb ${(l.tags||[]).includes(t)?'on':''}" onclick="DoctorApp.toggleTag('${id}','${t}')">${t}</button>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="ct">Internal notes</div>
          ${(l.notes||[]).map(n=>`<div class="note">${esc(n.body)}<div class="nmeta">${esc(n.author||'')} · ${timeAgo(n.at)}</div></div>`).join('')||'<div class="muted small">No notes yet.</div>'}
          <div class="noteform">
            <input id="noteInput" placeholder="Add a note for the team…" onkeydown="if(event.key==='Enter')DoctorApp.addNote('${id}')">
            <button class="cta-d" onclick="DoctorApp.addNote('${id}')">Add</button>
          </div>
        </div>

      </div>`;
  }

  function statusFlowHtml(l){
    const steps=[['new','New'],['in_review','In review'],['recorded','Recorded'],['sent','Sent'],['viewed','Viewed'],['booked','Booked']];
    const order=SmileStore.STATUS[l.status]?SmileStore.STATUS[l.status].order:0;
    return `<div class="card"><div class="ct">Status</div><div class="statusflow">`+
      steps.map(([k,lbl],i)=>{
        const o=SmileStore.STATUS[k].order;
        const cls = l.status===k?'cur':(o<order?'done':'');
        return `<span class="stp ${cls}">${lbl}</span>${i<steps.length-1?'<span class="arr">→</span>':''}`;
      }).join('')+`</div></div>`;
  }

  /* ---------- workspace actions ---------- */
  function assign(id,who){ SmileStore.assign(id, who||null); }
  function toggleTag(id,t){ SmileStore.toggleTag(id,t); }
  function addNote(id){
    const inp=$('#noteInput'); const v=inp.value.trim(); if(!v) return;
    SmileStore.addNote(id, v, role); inp.value='';
  }
  function copyScript(id){
    const l=SmileStore.get(id); const s=ScriptGen.generate(l,cfg()).plain;
    navigator.clipboard && navigator.clipboard.writeText(s);
    toast('Script copied to clipboard');
  }
  function sendVideo(id){
    SmileStore.setStatus(id,'sent');
    toast('Video consult sent — patient notified by text + email');
  }
  function simulate(id,to){ SmileStore.setStatus(id,to); toast(to==='booked'?'🎉 Patient booked a visit':'Patient viewed the video'); }
  function nudge(id,kind){
    const map={sent:'Watch-reminder sent (“your video is waiting”).',viewed:'Booking nudge sent (limited-time new-patient offer).',recover:'Recovery nudge sent (“finish your free preview”).'};
    SmileStore.addNote(id, 'Automated follow-up: '+map[kind], 'System');
    toast(map[kind]);
  }

  /* ---------- CONSULT STUDIO (full-screen slides + PiP camera + case library) ----------
     The doctor presents the patient's case like a screenshare with their webcam
     picture-in-picture, in landscape or phone-portrait, on brand-themed slides
     they can edit. We composite slides + camera onto a canvas and record THAT
     canvas + mic, so the output is a reusable, branded presentation video. */
  const PIP_MODES=[
    {k:'br', label:'bottom-right'},{k:'bl', label:'bottom-left'},
    {k:'br-lg', label:'large'},{k:'full', label:'full (talking head)'},{k:'avatar', label:'off — show photo'}
  ];
  let docPhotoImg=null, audioCtx=null, analyser=null, freqData=null;
  let studio = { id:null, lead:null, slides:[], idx:0, raf:0, pip:0, tele:true, orient:'land',
    camStream:null, recorder:null, chunks:[], recTimer:null, recStart:0, camReady:false };
  let library = [];                  // merged seed + persisted cases (with Image objects)
  let libFilter = '';
  let brandLogoImg = null;
  const stage = ()=>document.getElementById('stage');
  const sctx  = ()=>stage().getContext('2d');

  function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }
  function imgFrom(src){ const i=new Image(); i.src=src; return i; }

  /* ----- brand ----- */
  function brand(){ const b=cfg().brand||{}; return { name:b.name||'', logo:b.logo||null, primary:b.primary||'#0E3F3C', accent:b.accent||'#E8C07D' }; }
  function loadBrandLogo(){ const l=brand().logo; if(!l){ brandLogoImg=null; return; } if(!brandLogoImg || brandLogoImg._src!==l){ brandLogoImg=imgFrom(l); brandLogoImg._src=l; } }
  function loadDocPhoto(){ const p=(cfg().doctor||{}).photo; if(!p){ docPhotoImg=null; return; } if(!docPhotoImg || docPhotoImg._src!==p){ docPhotoImg=imgFrom(p); docPhotoImg._src=p; } }

  /* audio level meter (for the camera-off pulsing avatar) */
  function initAudioMeter(stream){
    try{ audioCtx=new (window.AudioContext||window.webkitAudioContext)(); audioCtx.resume&&audioCtx.resume();
      const src=audioCtx.createMediaStreamSource(stream); analyser=audioCtx.createAnalyser(); analyser.fftSize=256;
      freqData=new Uint8Array(analyser.frequencyBinCount); src.connect(analyser); }catch(e){ analyser=null; }
  }
  function audioLevel(){ if(!analyser) return 0; analyser.getByteFrequencyData(freqData); let s=0; for(let i=0;i<freqData.length;i++) s+=freqData[i]; return Math.min(1,(s/freqData.length)/120); }

  async function openRecorder(id){
    studio.id=id; studio.lead=SmileStore.get(id); studio.idx=0; studio.pip=0; studio.tele=true;
    setOrient('land');
    buildLibrary(); loadBrandLogo(); loadDocPhoto();
    studio.slides = await buildSlides(studio.lead);
    $('#studioPatient').textContent='— '+displayName(studio.lead);
    renderStrip(); renderCaseLib(); renderBrandTab(); tab('edit');
    $('#recModal').classList.add('show');
    $('#recUse').hidden=true; $('#recDot').hidden=true; $('#recVideo').classList.remove('review');
    $('#recToggle').textContent='● Start recording'; $('#recToggle').disabled=false;
    $('#teleToggle').textContent='📝 Script: on'; $('#teleprompter').classList.remove('off');
    updatePipLabel(); updateSlideUi();
    try{
      studio.camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280}},audio:true});
      $('#recVideo').srcObject=studio.camStream; $('#recVideo').muted=true; await $('#recVideo').play().catch(()=>{});
      studio.camReady=true; initAudioMeter(studio.camStream);
    }catch(e){
      // mic-only? still useful for the camera-off avatar (audio pulsation)
      try{ studio.camStream=await navigator.mediaDevices.getUserMedia({audio:true}); initAudioMeter(studio.camStream); }catch(e2){}
      studio.camReady=false; studio.pip=PIP_MODES.findIndex(m=>m.k==='avatar'); updatePipLabel();
      toast('No camera — using your profile photo. You can still record the slides + audio.');
    }
    startDraw();
  }

  function setOrient(o){
    studio.orient=o; const cv=stage();
    if(o==='port'){ cv.width=720; cv.height=1280; } else { cv.width=1280; cv.height=720; }
    const land=o==='land';
    document.getElementById('orientLand').classList.toggle('on',land);
    document.getElementById('orientPort').classList.toggle('on',!land);
  }

  /* ----- slide deck built from the patient's case (editable fields) ----- */
  async function buildSlides(l){
    const script=ScriptGen.generate(l,cfg());
    const noteFor=(...cues)=>script.lines.filter(x=>cues.some(c=>x.cue.toLowerCase().includes(c))).map(x=>x.text).join(' ');
    const slides=[];
    slides.push({kind:'intro', heading:displayName(l), sub:'Goals: '+((l.goals||[]).join(' · ')||'general consultation'),
      note:noteFor('warm open','reflect')});
    const photoSrcs=(l.photos||[]).filter(p=>p&&p.indexOf('data:')===0);
    const imgs=await Promise.all(photoSrcs.map(loadImg));
    slides.push({kind:'photos', heading:'Your photos', imgs:imgs.filter(Boolean), note:noteFor('concern','recommendation')});
    if(l.sim&&l.sim.enabled) slides.push({kind:'preview', heading:'Your smile preview',
      caption:'Illustrative preview — your real plan is what we’re discussing now.', note:noteFor('preview'),
      sim:{ white:0.9, natural:0.2 } });   // doctor-tweakable if the auto-sim looks off
    const plan=planFor(l);
    slides.push({kind:'plan', heading:'Your recommended plan', lines:plan.lines.slice(), financing:plan.financing,
      cta:'Next step: book your visit →', note:noteFor('timeline','next step','close')});
    return slides;
  }
  function addTextSlide(){
    studio.slides.push({kind:'text', heading:'New slide', body:'Add your talking point here…', note:''});
    renderStrip(); setSlide(studio.slides.length-1); tab('edit'); toast('Blank slide added — edit it on the right');
  }

  /* ----- the compositor ----- */
  function startDraw(){ cancelAnimationFrame(studio.raf); const loop=()=>{ drawStage(); studio.raf=requestAnimationFrame(loop); }; loop(); }
  function drawStage(){
    const c=sctx(), W=stage().width, H=stage().height;
    const s=studio.slides[studio.idx]; const mode=PIP_MODES[studio.pip].k;
    if(mode==='full' && studio.camReady){ drawVideoCover(c,0,0,W,H); drawLowerThird(c,W,H); }
    else { drawSlide(c,s,W,H);
      if(mode==='avatar') drawAvatarPip(c,W,H);
      else if(studio.camReady) drawPip(c,W,H); }
  }
  function drawVideoCover(c,x,y,w,h){
    const v=$('#recVideo'), vw=v.videoWidth||1280, vh=v.videoHeight||720;
    const ar=vw/vh, tar=w/h; let dw,dh; if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;}
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip();
    c.translate(x+w,y); c.scale(-1,1); c.drawImage(v,(w-dw)/2,(h-dh)/2,dw,dh); c.restore();
  }
  function drawPip(c,W,H){
    const m=PIP_MODES[studio.pip].k; const big=m==='br-lg'; const port=H>W;
    // portrait needs a noticeably larger PiP to read on a phone
    const frac = big ? (port?0.50:0.34) : (port?0.40:0.24);
    const w=Math.round(W*frac), h=Math.round(w*9/16), pad=Math.round(W*0.025)+8;
    const x = m==='bl' ? pad : W-w-pad, y = H-h-pad;
    c.save(); roundRect(c,x,y,w,h,16); c.clip(); drawVideoCover(c,x,y,w,h); c.restore();
    c.save(); roundRect(c,x,y,w,h,16); c.lineWidth=4; c.strokeStyle='#fff'; c.stroke(); c.restore();
  }
  // camera-off: doctor's profile photo with an audio-reactive pulse ring
  function drawAvatarPip(c,W,H){
    const port=H>W, B=brand(); const level=audioLevel();
    const d=Math.round(W*(port?0.40:0.22)), pad=Math.round(W*0.025)+8;
    const cx=W-pad-d/2, cy=H-pad-d/2, r=d/2;
    // pulsing rings driven by mic level (gentle idle pulse when quiet)
    const t=Date.now()/600, idle=(Math.sin(t)+1)/2*0.08, amp=Math.max(idle, level)*0.5;
    c.save();
    c.beginPath(); c.arc(cx,cy,r+10+amp*r*0.9,0,7); c.fillStyle=hexA(B.accent,0.18+amp*0.25); c.fill();
    c.beginPath(); c.arc(cx,cy,r+4,0,7); c.fillStyle=B.accent; c.fill();
    c.beginPath(); c.arc(cx,cy,r,0,7); c.closePath(); c.save(); c.clip();
    if(docPhotoImg&&docPhotoImg.complete&&docPhotoImg.naturalWidth){ coverImg(c,docPhotoImg,cx-r,cy-r,d,d); }
    else { c.fillStyle=B.primary; c.fillRect(cx-r,cy-r,d,d); c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='middle';
      c.font='800 '+Math.round(d*0.34)+'px Plus Jakarta Sans'; c.fillText(docInitials(),cx,cy); c.textBaseline='alphabetic'; c.textAlign='left'; }
    c.restore();
    // tiny mic glyph
    c.fillStyle='rgba(0,0,0,.5)'; c.beginPath(); c.arc(cx, cy+r-14, 15,0,7); c.fill(); c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='middle'; c.font='14px Plus Jakarta Sans'; c.fillText(level>0.04?'🔊':'🎙',cx,cy+r-13); c.textAlign='left'; c.textBaseline='alphabetic';
    c.restore();
  }
  function docInitials(){ const n=(cfg().doctor||{}).name||'Dr'; return n.replace(/^Dr\.?\s*/,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase(); }
  function hexA(hex,a){ const n=parseInt(hex.replace('#',''),16); return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`; }

  /* slide backgrounds + content (brand-themed, orientation-aware) */
  function drawSlide(c,s,W,H){
    const B=brand(), port=H>W, m=Math.round(W*0.06);
    const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,B.primary); g.addColorStop(1,darken(B.primary,34));
    c.fillStyle=g; c.fillRect(0,0,W,H);
    drawLogo(c,W,m);
    if(!s) return;
    c.textAlign='left';
    if(s.kind==='intro'){
      c.fillStyle='rgba(255,255,255,.55)'; c.font='600 26px Plus Jakarta Sans'; c.fillText('Personalized smile consultation', m, 132);
      c.fillStyle='#fff'; c.font='500 72px Fraunces'; wrapL(c, s.heading||'', m, 210, W-2*m, 76);
      c.fillStyle=B.accent; c.font='600 30px Plus Jakarta Sans'; wrapL(c, s.sub||'', m, port?360:330, W-2*m, 38);
      c.fillStyle='rgba(255,255,255,.7)'; c.font='500 26px Plus Jakarta Sans'; c.fillText('with '+cfg().doctor.name, m, H-70);
    } else if(s.kind==='photos'){
      slideTitle(c,s.heading,m,B);
      if(s.imgs && s.imgs.length){ rects2(W,H,m,s.imgs.length,port).forEach((r,i)=>{ c.save(); roundRect(c,r.x,r.y,r.w,r.h,18); c.clip(); coverImg(c,s.imgs[i],r.x,r.y,r.w,r.h); c.restore(); roundStroke(c,r.x,r.y,r.w,r.h,18); }); }
      else placeholderNote(c,'Patient photos appear here (this demo lead used seeded placeholders).',W,H);
    } else if(s.kind==='preview'){
      slideTitle(c,s.heading,m,B); const r=rects2(W,H,m,2,port);
      drawSmilePanel(c,r[0].x,r[0].y,r[0].w,r[0].h,false,'Now',null);
      drawSmilePanel(c,r[1].x,r[1].y,r[1].w,r[1].h,true,'Preview',s.sim);
      c.fillStyle='rgba(255,255,255,.65)'; c.textAlign='center'; c.font='500 22px Plus Jakarta Sans'; wrapL(c,s.caption||'',W/2,H-60,W-2*m,28); c.textAlign='left';
    } else if(s.kind==='case'){
      slideTitle(c,s.heading,m,B); const top=port?H*0.16:160;
      if(s.single){ const h=port?W*0.9:H*0.62, w=h*4/3, x=(W-w)/2; c.save(); roundRect(c,x,top,Math.min(w,W-2*m),h,18); c.clip(); coverImg(c,s.before,x,top,Math.min(w,W-2*m),h); c.restore(); roundStroke(c,x,top,Math.min(w,W-2*m),h,18); }
      else { const r=rects2(W,H,m,2,port); imgPanel(c,r[0].x,r[0].y,r[0].w,r[0].h,s.before,'Before'); imgPanel(c,r[1].x,r[1].y,r[1].w,r[1].h,s.after,'After'); }
    } else if(s.kind==='plan'){
      slideTitle(c,s.heading,m,B); let y=port?H*0.2:210; c.font='500 34px Plus Jakarta Sans';
      (s.lines||[]).forEach(p=>{ c.textAlign='left'; c.fillStyle='#fff'; c.fillText('• '+p.k, m+10, y); c.textAlign='right'; c.fillStyle=B.accent; c.fillText(p.v||'', W-m, y); y+=58; });
      c.textAlign='left'; c.fillStyle='rgba(255,255,255,.85)'; c.font='600 26px Plus Jakarta Sans'; if(s.financing) c.fillText('Financing from '+s.financing, m+10, y+8);
      c.fillStyle='#E8775B'; roundRect(c,m,H-150,Math.min(460,W-2*m),68,16); c.fill();
      c.fillStyle='#fff'; c.font='700 26px Plus Jakarta Sans'; c.fillText(s.cta||'Book your visit →', m+26, H-108);
    } else if(s.kind==='text'){
      slideTitle(c,s.heading,m,B); c.fillStyle='rgba(255,255,255,.9)'; c.font='400 30px Plus Jakarta Sans';
      wrapL(c,s.body||'', m, port?H*0.18:200, W-2*m, 42);
    }
  }
  function drawLogo(c,W,m){ if(!brandLogoImg||!brandLogoImg.complete||!brandLogoImg.naturalWidth) return;
    const h=Math.round(stage().height*0.07), w=h*(brandLogoImg.width/brandLogoImg.height); c.drawImage(brandLogoImg, W-m-w, m-14, w, h); }
  function drawLowerThird(c,W,H){ const B=brand(); c.fillStyle='rgba(10,40,38,.78)'; c.fillRect(0,H-110,W,110);
    c.fillStyle=B.accent; c.font='600 30px Plus Jakarta Sans'; c.textAlign='left'; c.fillText(cfg().doctor.name+' — '+displayName(studio.lead), 50, H-50); }
  function slideTitle(c,t,m,B){ c.fillStyle='#fff'; c.font='500 50px Fraunces'; c.textAlign='left'; c.fillText(t||'',m,108);
    c.strokeStyle=B.accent; c.globalAlpha=.7; c.lineWidth=3; c.beginPath(); c.moveTo(m+2,126); c.lineTo(m+2+Math.min((t||'').length*20,360),126); c.stroke(); c.globalAlpha=1; }
  function placeholderNote(c,t,W,H){ c.fillStyle='rgba(255,255,255,.5)'; c.font='500 26px Plus Jakarta Sans'; c.textAlign='center'; wrapL(c,t,W/2,H/2,W-300,36); c.textAlign='left'; }
  // two-panel layout: side-by-side (landscape) or stacked (portrait)
  function rects2(W,H,m,n,port){
    if(port){ const w=W-2*m, gap=24, h=(H*0.66 - gap*(n-1))/n, top=H*0.18; const out=[]; for(let i=0;i<n;i++) out.push({x:m,y:top+i*(h+gap),w,h}); return out; }
    const gap=30, w=(W-2*m-gap*(n-1))/n, h=H*0.56, top=H*0.22; const out=[]; for(let i=0;i<n;i++) out.push({x:m+i*(w+gap),y:top,w,h}); return out;
  }
  function coverImg(c,im,x,y,w,h){ if(!im||!im.complete||!im.naturalWidth)return; const ar=im.width/im.height,tar=w/h;let dw,dh;if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;}c.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh); }
  function imgPanel(c,x,y,w,h,im,label){ c.save(); roundRect(c,x,y,w,h,18); c.clip(); if(im)coverImg(c,im,x,y,w,h); else {c.fillStyle='rgba(255,255,255,.08)';c.fillRect(x,y,w,h);} c.restore(); roundStroke(c,x,y,w,h,18); tagLabel(c,x+14,y+14,label); }
  function tagLabel(c,x,y,t){ c.fillStyle='rgba(0,0,0,.5)'; const w=t.length*11+20; roundRect(c,x,y,w,30,8); c.fill(); c.fillStyle='#fff'; c.font='700 16px Plus Jakarta Sans'; c.textAlign='left'; c.fillText(t,x+10,y+21); }
  function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function roundStroke(c,x,y,w,h,r){ c.save(); roundRect(c,x,y,w,h,r); c.lineWidth=3; c.strokeStyle='rgba(255,255,255,.25)'; c.stroke(); c.restore(); }
  function wrapL(c,t,x,y,maxw,lh){ const words=String(t).split(' ');let line='',yy=y;words.forEach(w=>{const test=line+w+' ';if(c.measureText(test).width>maxw && line){c.fillText(line.trim(),x,yy);line=w+' ';yy+=lh;}else line=test;});c.fillText(line.trim(),x,yy); }
  function darken(hex,amt){ const n=parseInt(hex.replace('#',''),16); let r=Math.max(0,(n>>16)-amt),g=Math.max(0,((n>>8)&255)-amt),b=Math.max(0,(n&255)-amt); return '#'+(r<<16|g<<8|b).toString(16).padStart(6,'0'); }
  function drawSmilePanel(c,x,y,w,h,after,label,sim){ c.save(); roundRect(c,x,y,w,h,18); c.clip();
    const sk=c.createLinearGradient(x,y,x,y+h); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78'); c.fillStyle=sk; c.fillRect(x,y,w,h);
    const cx=x+w/2,cy=y+h/2,mw=w*0.6,mh=mw*0.42;
    c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+13,mh/2+13,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.05,mw/2-5,mh/2-3,0,0,7); c.clip();
    // doctor-tweakable "after": whiteness lerps tooth color; naturalness keeps slight imperfection
    const white = sim ? sim.white : 1, natural = sim ? sim.natural : 0;
    const toothCol = after ? lerpHex('#E2D4AE','#FFFFFF', white) : '#E2D4AE';
    const n=8,gap=3,tw=(mw-12)/n,x0=cx-(mw-12)/2,ty=cy-mh/2+3;
    for(let i=0;i<n;i++){let px=x0+i*tw,ph=mh-12,py=ty;c.fillStyle=toothCol;
      if(!after){ if(i===3)py+=6; if(i===4)px+=4; }
      else { if(natural>0.5 && i===4) px+=2*natural; if(natural>0.3 && i===3) py+=4*natural; }   // keep it believable
      c.fillRect(px,py,tw-gap,ph);} c.restore();
    c.restore(); roundStroke(c,x,y,w,h,18); tagLabel(c,x+14,y+14,label);
  }
  function lerpHex(a,b,t){ t=Math.max(0,Math.min(1,t)); const pa=parseInt(a.slice(1),16),pb=parseInt(b.slice(1),16);
    const r=Math.round((pa>>16)+(((pb>>16)-(pa>>16))*t)), g=Math.round(((pa>>8)&255)+((((pb>>8)&255)-((pa>>8)&255))*t)), bl=Math.round((pa&255)+(((pb&255)-(pa&255))*t));
    return '#'+(r<<16|g<<8|bl).toString(16).padStart(6,'0'); }

  /* ----- slide / pip / teleprompter controls ----- */
  function setSlide(i){ studio.idx=Math.max(0,Math.min(studio.slides.length-1,i)); updateSlideUi(); }
  function prevSlide(){ setSlide(studio.idx-1); }
  function nextSlide(){ setSlide(studio.idx+1); }
  function gotoSlide(i){ setSlide(i); }
  function moveSlide(dir){ const i=studio.idx, j=i+dir; if(j<0||j>=studio.slides.length) return; const a=studio.slides; [a[i],a[j]]=[a[j],a[i]]; studio.idx=j; renderStrip(); updateSlideUi(); }
  function removeSlide(i){ if(studio.slides.length<=1) return; studio.slides.splice(i,1); if(studio.idx>=studio.slides.length)studio.idx=studio.slides.length-1; renderStrip(); updateSlideUi(); }
  function updateSlideUi(){
    $('#slideCount').textContent=(studio.idx+1)+' / '+studio.slides.length;
    document.querySelectorAll('.sthumb').forEach((el,i)=>el.classList.toggle('cur',i===studio.idx));
    const s=studio.slides[studio.idx];
    $('#teleprompter').innerHTML = (s&&s.note)? `<div class="tl">${esc(s.note)}</div>` : '';
    renderEditPanel();
  }
  function cyclePip(){ studio.pip=(studio.pip+1)%PIP_MODES.length; applyCamEnabled(); updatePipLabel(); }
  function applyCamEnabled(){ // truly turn the camera off in avatar mode
    if(!studio.camStream) return; const off=PIP_MODES[studio.pip].k==='avatar';
    studio.camStream.getVideoTracks().forEach(t=>t.enabled=!off);
  }
  function updatePipLabel(){ $('#pipToggle').textContent='📹 Camera: '+PIP_MODES[studio.pip].label; }
  function toggleTele(){ studio.tele=!studio.tele; $('#teleprompter').classList.toggle('off',!studio.tele); $('#teleToggle').textContent='📝 Script: '+(studio.tele?'on':'off'); }

  /* ----- right-panel tabs ----- */
  function tab(name){
    document.querySelectorAll('.ptab').forEach(b=>b.classList.toggle('on',b.dataset.tab===name));
    $('#tabEdit').hidden=name!=='edit'; $('#tabCases').hidden=name!=='cases'; $('#tabBrand').hidden=name!=='brand';
  }

  /* ----- slide editor (field-based) ----- */
  const KIND_LABEL={intro:'Intro slide',photos:'Patient photos',preview:'Smile preview',case:'Case study',plan:'Recommended plan',text:'Text slide'};
  function renderEditPanel(){
    const s=studio.slides[studio.idx]; if(!s){ $('#tabEdit').innerHTML=''; return; }
    let html=`<span class="kindtag">${KIND_LABEL[s.kind]||s.kind}</span>`;
    const txt=(prop,label,val)=>`<div class="fld"><label>${label}</label><input type="text" value="${esc(val||'')}" oninput="DoctorApp.edit('${prop}',this.value)"></div>`;
    const area=(prop,label,val,hint)=>`<div class="fld"><label>${label}</label><textarea oninput="DoctorApp.edit('${prop}',this.value)">${esc(val||'')}</textarea>${hint?`<div class="hint">${hint}</div>`:''}</div>`;
    if(s.kind==='intro'){ html+=txt('heading','Patient name / title',s.heading)+txt('sub','Subhead (goals)',s.sub); }
    else if(s.kind==='photos'){ html+=txt('heading','Heading',s.heading)+`<div class="hint">Photos come from the patient's submission.</div>`; }
    else if(s.kind==='preview'){ const sm=s.sim||{white:0.9,natural:0.2};
      html+=txt('heading','Heading',s.heading)
        +`<div class="fld"><label>Tweak the simulation</label>
            <div class="rng"><span>Whiteness</span><input type="range" min="0.55" max="1" step="0.01" value="${sm.white}" oninput="DoctorApp.editSim('white',this.value)"></div>
            <div class="rng"><span>Keep it natural</span><input type="range" min="0" max="1" step="0.05" value="${sm.natural}" oninput="DoctorApp.editSim('natural',this.value)"></div>
            <div class="hint">If the automated preview looks too white or too perfect, dial it back so it matches what you'd realistically deliver.</div></div>`
        +area('caption','Caption',s.caption); }
    else if(s.kind==='case'){ html+=txt('heading','Case label',s.heading)+`<div class="hint">Swap the case from the Cases tab.</div>`; }
    else if(s.kind==='text'){ html+=txt('heading','Heading',s.heading)+area('body','Body',s.body); }
    else if(s.kind==='plan'){ html+=txt('heading','Heading',s.heading)
      +area('_lines','Plan items (one per line: Item | Price)', (s.lines||[]).map(l=>`${l.k} | ${l.v||''}`).join('\n'),'Edit the bullets and prices.')
      +txt('financing','Financing from',s.financing)+txt('cta','Call-to-action',s.cta); }
    html+=area('note','Teleprompter note',s.note,'Shows over the video while you record this slide.');
    html+=`<div class="editrow"><button class="cta-d ghost-d" onclick="DoctorApp.moveSlide(-1)">↑ Up</button><button class="cta-d ghost-d" onclick="DoctorApp.moveSlide(1)">↓ Down</button>${studio.slides.length>1?`<button class="cta-d delbtn" onclick="DoctorApp.removeSlide(${studio.idx})">Delete</button>`:''}</div>`;
    $('#tabEdit').innerHTML=html;
  }
  function editSim(prop,val){ const s=studio.slides[studio.idx]; if(!s) return; if(!s.sim) s.sim={white:0.9,natural:0.2}; s.sim[prop]=+val; }
  function edit(prop,val){
    const s=studio.slides[studio.idx]; if(!s) return;
    if(prop==='_lines'){ s.lines=val.split('\n').filter(x=>x.trim()).map(line=>{const [k,v]=line.split('|');return {k:(k||'').trim(),v:(v||'').trim()};}); }
    else s[prop]=val;
    if(prop==='heading'||prop==='note') renderStrip();
    if(prop==='note'){ const cur=studio.slides[studio.idx]; $('#teleprompter').innerHTML=cur.note?`<div class="tl">${esc(cur.note)}</div>`:''; }
    document.querySelectorAll('.sthumb').forEach((el,i)=>el.classList.toggle('cur',i===studio.idx));
  }

  /* ----- case library (seeded + persisted uploads) ----- */
  function buildLibrary(){
    library = SEED_CASES().concat(SmileStore.cases().map(c=>Object.assign({persisted:true}, c)));
    library.forEach(c=>{ c.beforeImg=imgFrom(c.before); if(c.after) c.afterImg=imgFrom(c.after); });
  }
  function SEED_CASES(){
    return [
      {id:'sd1',label:'Diastema closure · veneers',tags:'gap veneers',before:caseDataURL({gap:true,shade:'#E2D4AE'}),after:caseDataURL({shade:'#fff'})},
      {id:'sd2',label:'Whitening + bonding',tags:'whitening',before:caseDataURL({shade:'#D8C58E'}),after:caseDataURL({shade:'#fff'})},
      {id:'sd3',label:'Full veneer makeover',tags:'veneers makeover',before:caseDataURL({gap:true,chip:true,shade:'#D9C9A0'}),after:caseDataURL({shade:'#fff'})},
      {id:'sd4',label:'Chipped front tooth',tags:'chip bonding',before:caseDataURL({chip:true,shade:'#E7DCB8'}),after:caseDataURL({shade:'#FBFBF6'})},
      {id:'sd5',label:'Gummy smile reshaping',tags:'gums',before:caseDataURL({shade:'#E0D2A8'}),after:caseDataURL({shade:'#fff'})},
      {id:'sd6',label:'Aligners — crowding',tags:'aligners straighten',before:caseDataURL({gap:true,shade:'#E2D4AE'}),after:caseDataURL({shade:'#FAFAF4'})}
    ];
  }
  function caseDataURL(o){ const cv=document.createElement('canvas'); cv.width=200; cv.height=150; const c=cv.getContext('2d');
    const sk=c.createLinearGradient(0,0,0,150); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78'); c.fillStyle=sk; c.fillRect(0,0,200,150);
    const cx=100,cy=80,mw=120,mh=52; c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+10,mh/2+10,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-2,mw/2-4,mh/2-3,0,0,7); c.clip();
    const n=8,gap=2,tw=(mw-8)/n,x0=cx-(mw-8)/2,ty=cy-mh/2+2;
    for(let i=0;i<n;i++){let x=x0+i*tw,h=mh-8,y=ty;c.fillStyle=o.shade;if(o.gap&&i===4)x+=4;if(o.chip&&i===3)h-=8;c.fillRect(x,y,tw-gap,h);} c.restore();
    return cv.toDataURL('image/jpeg',0.8);
  }
  function filterCases(v){ libFilter=(v||'').toLowerCase(); renderCaseLib(); }
  function renderCaseLib(){
    const box=$('#caseLib'); box.innerHTML='';
    library.filter(cs=>!libFilter || (cs.label+' '+(cs.tags||'')).toLowerCase().includes(libFilter)).forEach(cs=>{
      const el=document.createElement('div'); el.className='casecard'; el.title='Add “'+cs.label+'” as a slide';
      const imgs = cs.after ? `<img src="${cs.before}"><img src="${cs.after}">` : `<img class="solo" src="${cs.before}">`;
      el.innerHTML=`<div class="thumbs">${imgs}</div><div class="cl">${esc(cs.label)}</div>`+
        (cs.persisted?`<button class="cx" title="Remove from library">✕</button>`:'');
      el.querySelector('.thumbs').onclick=()=>addCaseSlide(cs);
      el.querySelector('.cl').onclick=()=>addCaseSlide(cs);
      const cx=el.querySelector('.cx'); if(cx) cx.onclick=(e)=>{ e.stopPropagation(); SmileStore.removeCase(cs.id); buildLibrary(); renderCaseLib(); toast('Removed from library'); };
      box.appendChild(el);
    });
    if(!box.children.length) box.innerHTML='<div class="hint" style="grid-column:1/-1">No matching cases.</div>';
    $('#caseUpload').onchange=onCaseUpload;
  }
  function addCaseSlide(cs){
    studio.slides.push({kind:'case', heading:cs.label, before:cs.beforeImg||imgFrom(cs.before),
      after:cs.after?(cs.afterImg||imgFrom(cs.after)):null, single:!cs.after,
      note:'Here’s a patient who started in a similar place — this is the kind of result we can aim for.'});
    renderStrip(); setSlide(studio.slides.length-1); toast('Added “'+cs.label+'” as a slide');
  }
  async function onCaseUpload(e){
    const files=[...e.target.files];
    for(const f of files){ const url=await fileToDataUrl(f); const img=await loadImg(url); if(!img) continue;
      const thumb=downscale(img,460);
      SmileStore.addCase({label:f.name.replace(/\.[^.]+$/,'').slice(0,26), tags:'uploaded', before:thumb, single:true});
    }
    buildLibrary(); renderCaseLib(); toast(files.length+' case image(s) saved to your library');
    e.target.value='';
  }
  function downscale(img,max){ const r=Math.min(1,max/Math.max(img.width,img.height)); const w=Math.round(img.width*r),h=Math.round(img.height*r);
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); return c.toDataURL('image/jpeg',0.72); }
  function fileToDataUrl(f){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(f); }); }

  function renderStrip(){
    const ICON={intro:'👋',photos:'🖼️',preview:'✨',case:'🦷',plan:'📋',text:'💬'};
    $('#slideStrip').innerHTML=studio.slides.map((s,i)=>{
      const label=s.heading||KIND_LABEL[s.kind]||s.kind;
      const rm = `<span class="rm" onclick="event.stopPropagation();DoctorApp.removeSlide(${i})">✕</span>`;
      return `<div class="sthumb ${i===studio.idx?'cur':''}" onclick="DoctorApp.gotoSlide(${i})"><span class="num">${i+1}</span><span class="si">${ICON[s.kind]||'▫'}</span><span class="lbl">${esc(label)}</span>${studio.slides.length>1?rm:''}</div>`;
    }).join('');
  }

  /* ----- brand setup (one practice brand; themes the slides live) ----- */
  function renderBrandTab(){
    const B=brand();
    $('#tabBrand').innerHTML=`
      <div class="hint" style="margin-bottom:12px">Your brand themes every slide — colors, and your logo in the corner.</div>
      <div class="swatchrow">
        <div class="swatch"><label>Slide color</label><div style="height:38px;border-radius:9px;border:1.5px solid var(--line);background:${B.primary}"></div></div>
        <div class="swatch"><label>Accent</label><div style="height:38px;border-radius:9px;border:1.5px solid var(--line);background:${B.accent}"></div></div>
      </div>
      <div class="fld"><label>Practice name</label><input type="text" value="${esc(B.name)}" disabled></div>
      <button class="cta-d" style="width:100%;justify-content:center" onclick="DoctorApp.openBrand()">🎨 Edit brand & theme</button>`;
  }
  function brandFormHtml(){
    const B=brand();
    return `<h3 style="font-family:var(--display);font-weight:500;font-size:22px;color:var(--teal-deep);margin-bottom:4px">Brand & slide theme</h3>
      <p class="muted small" style="margin-bottom:18px">Set once — applies to every Consult Studio slide.</p>
      <label class="logo-drop" for="logoUp"><div class="lp" id="logoPrev">${B.logo?`<img src="${B.logo}">`:'<span style="font-size:22px">🦷</span>'}</div>
        <div><b style="font-size:13.5px">Practice logo</b><div class="hint">PNG/SVG with transparency works best. Shown top-right on slides.</div></div>
        <input type="file" id="logoUp" accept="image/*" hidden></label>
      <label class="logo-drop" for="docUp"><div class="lp" id="docPrev" style="border-radius:50%">${(cfg().doctor||{}).photo?`<img src="${cfg().doctor.photo}">`:'<span style="font-size:22px">👤</span>'}</div>
        <div><b style="font-size:13.5px">Doctor profile photo</b><div class="hint">Shown (with an audio pulse) when the camera is off in the studio.</div></div>
        <input type="file" id="docUp" accept="image/*" hidden></label>
      <div class="swatchrow">
        <div class="swatch"><label>Slide color</label><input type="color" id="cPrimary" value="${B.primary}"></div>
        <div class="swatch"><label>Accent color</label><input type="color" id="cAccent" value="${B.accent}"></div>
      </div>
      <div class="fld"><label>Practice name</label><input type="text" id="bName" value="${esc(B.name)}"></div>
      <div class="brand-prev"><canvas id="brandPrev" width="420" height="236"></canvas></div>
      <button class="cta-d" style="width:100%;justify-content:center" onclick="DoctorApp.closeBrand()">Done</button>`;
  }
  function openBrand(){
    loadBrandLogo();
    $('#brandForm').innerHTML=brandFormHtml();
    $('#cPrimary').oninput=e=>{ SmileStore.saveBrand({primary:e.target.value}); drawBrandPrev(); refreshBrand(); };
    $('#cAccent').oninput=e=>{ SmileStore.saveBrand({accent:e.target.value}); drawBrandPrev(); refreshBrand(); };
    $('#bName').oninput=e=>{ SmileStore.saveBrand({name:e.target.value}); drawBrandPrev(); };
    $('#logoUp').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const img=await loadImg(await fileToDataUrl(f)); if(!img) return;
      const logo=downscalePng(img,240); SmileStore.saveBrand({logo}); $('#logoPrev').innerHTML=`<img src="${logo}">`; loadBrandLogo(); drawBrandPrev(); };
    $('#docUp').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const img=await loadImg(await fileToDataUrl(f)); if(!img) return;
      const photo=downscale(img,300); const c=cfg(); c.doctor=Object.assign({},c.doctor,{photo}); SmileStore.saveConfig(c); $('#docPrev').innerHTML=`<img src="${photo}">`; loadDocPhoto(); };
    $('#brandModal').classList.add('show'); drawBrandPrev();
  }
  function refreshBrand(){ renderBrandTab(); }
  function closeBrand(){ $('#brandModal').classList.remove('show'); renderBrandTab(); }
  function downscalePng(img,max){ const r=Math.min(1,max/Math.max(img.width,img.height)); const w=Math.round(img.width*r),h=Math.round(img.height*r);
    const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); return c.toDataURL('image/png'); }
  function drawBrandPrev(){ const cv=$('#brandPrev'); if(!cv) return; const c=cv.getContext('2d'),W=cv.width,H=cv.height,B=brand();
    const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,B.primary); g.addColorStop(1,darken(B.primary,34)); c.fillStyle=g; c.fillRect(0,0,W,H);
    c.fillStyle='#fff'; c.font='500 26px Fraunces'; c.fillText('Your recommended plan',26,52);
    c.fillStyle=B.accent; c.font='600 16px Plus Jakarta Sans'; c.fillText('Veneers · Whitening',26,84);
    c.fillStyle='rgba(255,255,255,.85)'; c.font='400 14px Plus Jakarta Sans'; c.fillText('with '+(B.name||'your practice'),26,H-24);
    if(brandLogoImg&&brandLogoImg.complete&&brandLogoImg.naturalWidth){ const lh=40,lw=lh*(brandLogoImg.width/brandLogoImg.height); c.drawImage(brandLogoImg,W-lw-20,16,lw,lh); }
  }

  /* ----- recording the composited canvas + mic ----- */
  function pickMime(){ return ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>window.MediaRecorder&&MediaRecorder.isTypeSupported(m))||''; }
  function toggleRecord(){
    if(studio.recorder && studio.recorder.state==='recording'){ studio.recorder.stop(); return; }
    let cs; try{ cs=stage().captureStream(30); }catch(e){ toast('Canvas recording unsupported in this browser.'); return; }
    if(studio.camStream){ const a=studio.camStream.getAudioTracks()[0]; if(a) cs.addTrack(a); }
    studio.chunks=[];
    try{ studio.recorder=new MediaRecorder(cs, pickMime()?{mimeType:pickMime()}:undefined); }catch(e){ toast('Recording not supported here.'); return; }
    studio.recorder.ondataavailable=e=>{ if(e.data.size) studio.chunks.push(e.data); };
    studio.recorder.onstop=()=>{
      const blob=new Blob(studio.chunks,{type:'video/webm'}); const url=URL.createObjectURL(blob);
      recordedBlobs[studio.id]={url, dur:Math.round((Date.now()-studio.recStart)/1000)};
      clearInterval(studio.recTimer); $('#recDot').hidden=true;
      const v=$('#recVideo'); v.srcObject=null; v.src=url; v.muted=false; v.classList.add('review'); v.play().catch(()=>{});
      cancelAnimationFrame(studio.raf);
      $('#recToggle').textContent='⟳ Re-record'; $('#recUse').hidden=false;
    };
    studio.recorder.start(); studio.recStart=Date.now();
    $('#recDot').hidden=false; $('#recToggle').textContent='■ Stop recording';
    $('#recVideo').classList.remove('review'); startDraw();
    studio.recTimer=setInterval(()=>{ const s=Math.round((Date.now()-studio.recStart)/1000); $('#recTime').textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); },500);
  }
  function useRecording(){
    const rec=recordedBlobs[studio.id];
    SmileStore.saveVideo(studio.id,{durationSec:rec?rec.dur:0, hasRecording:true, slides:studio.slides.length, orient:studio.orient});
    closeRecorder(); toast('Presentation saved. Ready to send.');
  }
  function closeRecorder(){
    if(studio.recorder && studio.recorder.state==='recording') try{studio.recorder.stop()}catch(e){}
    if(studio.camStream){ studio.camStream.getTracks().forEach(t=>t.stop()); studio.camStream=null; }
    cancelAnimationFrame(studio.raf); clearInterval(studio.recTimer); studio.camReady=false;
    const v=$('#recVideo'); v.srcObject=null; v.src=''; v.classList.remove('review');
    $('#recModal').classList.remove('show');
  }

  /* ---------- PATIENT CLOSING-PAGE / EMAIL PREVIEW ---------- */
  function previewEmail(id){
    const l=SmileStore.get(id); const c=l.contact||{};
    const rec=recordedBlobs[id];
    const plan=planFor(l);
    $('#emailCard').innerHTML=`
      <button class="modal-x" onclick="DoctorApp.closeEmail()">✕</button>
      <div class="email-top">
        <div style="width:44px;height:44px;border-radius:11px;background:rgba(255,255,255,.18);display:grid;place-items:center;font-weight:800">BH</div>
        <div><b>${esc(cfg().doctor.name)}</b><span>recorded a personal video for you</span></div>
      </div>
      <div class="email-body">
        <p style="font-size:15px;margin-bottom:14px">Hi ${esc(c.firstName||'there')}, I took a look at your smile — here's your personalized video.</p>
        <div class="email-video" id="emVideo">
          ${rec?`<video src="${rec.url}" controls></video>`:`<div class="play">▶</div><span class="vlabel">Your video consult · ${l.video?l.video.durationSec+'s':'~90s'}</span>`}
        </div>
        ${l.sim&&l.sim.enabled?`<div style="font-size:12px;font-weight:700;color:var(--teal-deep);margin-bottom:4px">Your preview</div>
        <div class="ba" id="emBa">
          <canvas id="emAfter" width="320" height="240"></canvas>
          <div class="bw" id="emBw"><canvas id="emBefore" width="320" height="240"></canvas></div>
          <span class="lab b">Now</span><span class="lab a">Preview</span>
          <div class="h" id="emH"><div class="g">⇄</div></div>
        </div>`:''}
        <div class="planbox">
          <div style="font-size:12px;font-weight:700;color:var(--teal-deep);margin-bottom:6px">Your likely plan</div>
          ${plan.lines.map(p=>`<div class="pl"><span>${esc(p.k)}</span><b>${esc(p.v)}</b></div>`).join('')}
          <div class="pl" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span>Financing from</span><b>${esc(plan.financing)}</b></div>
        </div>
        <button class="book-cta" onclick="DoctorApp.bookFromEmail('${id}')">📅 Book my visit — hold my times</button>
        <div class="fineprint">Illustrative preview & estimate only. Final plan confirmed at your visit with ${esc(cfg().doctor.name)}.</div>
      </div>`;
    $('#emailModal').classList.add('show');
    if(l.sim&&l.sim.enabled){ drawBA(); initBaDrag(); }
  }
  function bookFromEmail(id){ SmileStore.setStatus(id,'booked',{booking:{bookedAt:new Date().toISOString(),apptTime:'Self-booked from video — next available'}}); closeEmail(); toast('🎉 Patient self-booked from the video page'); }
  function closeEmail(){ $('#emailModal').classList.remove('show'); }

  // ballpark plan from goals (demo heuristic)
  function planFor(l){
    const g=l.goals||[]; const lines=[];
    if(g.includes('Whiter teeth')) lines.push({k:'Professional whitening',v:'$350–$600'});
    if(g.includes('Straighter teeth')) lines.push({k:'Clear aligners',v:'$3,500–$5,500'});
    if(g.includes('Close gaps')) lines.push({k:'Bonding or veneers',v:'$600–$2,400'});
    if(g.includes('Fix chips & cracks')) lines.push({k:'Bonding / veneer',v:'$400–$1,500'});
    if(g.includes('Full makeover')) lines.push({k:'Smile design (veneers)',v:'$8,000–$18,000'});
    if(!lines.length) lines.push({k:'Custom plan',v:'reviewed in your visit'});
    return {lines, financing:'$99/mo'};
  }
  // before/after canvas (reuse the stylized smile)
  function drawSmile(cv, after){
    const c=cv.getContext('2d'),W=cv.width,H=cv.height; c.clearRect(0,0,W,H);
    const sk=c.createLinearGradient(0,0,0,H); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78');
    c.fillStyle=sk; c.fillRect(0,0,W,H);
    const cx=W/2,cy=H*0.5,mw=W*0.6,mh=mw*0.5;
    c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+13,mh/2+13,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.06,mw/2-5,mh/2-3,0,0,7); c.clip();
    const n=8,gap=3,tw=(mw-12)/n,x0=cx-(mw-12)/2,ty=cy-mh/2+3;
    for(let i=0;i<n;i++){let x=x0+i*tw,h=mh-12,y=ty;let col=after?'#fff':'#E7DCB8';
      if(!after){if(i===3)y+=7;if(i===4)x+=4;} c.fillStyle=col;
      c.fillRect(x,y,tw-gap,h); c.strokeStyle='rgba(0,0,0,.06)'; c.strokeRect(x,y,tw-gap,h);}
    c.restore();
  }
  function drawBA(){ drawSmile($('#emBefore'),false); drawSmile($('#emAfter'),true);
    const ba=$('#emBa'); const b=$('#emBefore'); if(ba&&b) b.style.width=ba.clientWidth+'px'; setBa(50); }
  function setBa(p){ p=Math.max(4,Math.min(96,p)); $('#emBw').style.width=p+'%'; $('#emH').style.left=p+'%'; }
  function initBaDrag(){ const ba=$('#emBa'); if(!ba) return; let d=false;
    const mv=x=>{const r=ba.getBoundingClientRect(); setBa((x-r.left)/r.width*100);};
    ba.addEventListener('mousedown',e=>{d=true;mv(e.clientX);}); window.addEventListener('mousemove',e=>{if(d)mv(e.clientX);}); window.addEventListener('mouseup',()=>d=false);
    ba.addEventListener('touchstart',e=>{d=true;mv(e.touches[0].clientX);},{passive:true}); ba.addEventListener('touchmove',e=>{if(d)mv(e.touches[0].clientX);},{passive:true}); window.addEventListener('touchend',()=>d=false);
  }

  /* ---------- misc ---------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  function timeAgo(iso){ const h=(Date.now()-new Date(iso).getTime())/36e5;
    if(h<1) return Math.max(1,Math.round(h*60))+'m ago'; if(h<24) return Math.round(h)+'h ago'; return Math.round(h/24)+'d ago'; }
  let toastT=null;
  function toast(msg){
    let t=$('#toast'); if(!t){ t=document.createElement('div'); t.id='toast'; t.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--teal-deep);color:#fff;padding:13px 20px;border-radius:12px;font-weight:600;font-size:14px;z-index:99;box-shadow:var(--shadow);transition:opacity .3s'; document.body.appendChild(t); }
    t.textContent=msg; t.style.opacity='1'; clearTimeout(toastT); toastT=setTimeout(()=>t.style.opacity='0',2600);
  }

  global.DoctorApp = { openLead, closeDrawer, assign, toggleTag, addNote, copyScript, sendVideo, simulate, nudge,
    openRecorder, toggleRecord, useRecording, closeRecorder, previewEmail, closeEmail, bookFromEmail,
    prevSlide, nextSlide, cyclePip, toggleTele, gotoSlide, removeSlide,
    setOrient, addTextSlide, tab, filterCases, moveSlide, edit, editSim, openBrand, closeBrand };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
