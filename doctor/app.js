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

  /* ---------- CONSULT STUDIO (slides + PiP camera + case library) ----------
     The doctor presents the patient's case like a screenshare with their webcam
     picture-in-picture. We composite slides + the camera onto a canvas and
     record THAT canvas + mic — so the output is a reusable presentation video. */
  const PIP_MODES=[
    {k:'br', label:'bottom-right'},{k:'bl', label:'bottom-left'},
    {k:'br-lg', label:'large'},{k:'full', label:'full (talking head)'},{k:'off', label:'hidden'}
  ];
  let studio = { id:null, lead:null, slides:[], idx:0, raf:0, pip:0, tele:true,
    camStream:null, recorder:null, chunks:[], recTimer:null, recStart:0, camReady:false };
  let caseLibrary = null;            // lazily built {id,label,before:Image,after:Image,single?}
  const stage = ()=>document.getElementById('stage');
  const sctx  = ()=>stage().getContext('2d');

  function loadImg(src){ return new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=()=>res(null); i.src=src; }); }

  async function openRecorder(id){
    studio.id=id; studio.lead=SmileStore.get(id); studio.idx=0; studio.pip=0; studio.tele=true;
    if(!caseLibrary) caseLibrary = buildCaseLibrary();
    studio.slides = await buildSlides(studio.lead);
    renderStrip(); renderCaseLib();
    $('#recModal').classList.add('show');
    $('#recUse').hidden=true; $('#recDot').hidden=true; $('#recVideo').classList.remove('review');
    $('#recToggle').textContent='● Start recording'; $('#recToggle').disabled=false;
    $('#teleToggle').textContent='📝 Script: on'; $('#teleprompter').classList.remove('off');
    updatePipLabel(); updateSlideUi();
    // camera + mic (the PiP + the audio track we record)
    try{
      studio.camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280}},audio:true});
      $('#recVideo').srcObject=studio.camStream; $('#recVideo').muted=true; await $('#recVideo').play().catch(()=>{});
      studio.camReady=true;
    }catch(e){
      studio.camReady=false; studio.pip=PIP_MODES.findIndex(m=>m.k==='off'); updatePipLabel();
      toast('No camera/mic — you can still record the slides (audio needs mic permission).');
    }
    startDraw();
  }

  /* ----- slide deck built from the patient's case ----- */
  async function buildSlides(l){
    const script=ScriptGen.generate(l,cfg());
    const byCue=(...cues)=>script.lines.filter(x=>cues.some(c=>x.cue.toLowerCase().includes(c)));
    const slides=[];
    slides.push({type:'intro', title:displayName(l), goals:l.goals||[], note:byCue('warm open','reflect')});
    const photoSrcs=(l.photos||[]).filter(p=>p&&p.indexOf('data:')===0);
    const imgs=await Promise.all(photoSrcs.map(loadImg));
    slides.push({type:'photos', imgs:imgs.filter(Boolean), note:byCue('concern','recommendation')});
    if(l.sim&&l.sim.enabled) slides.push({type:'preview', note:byCue('preview')});
    slides.push({type:'plan', plan:planFor(l), note:byCue('timeline','next step','close')});
    return slides;
  }

  /* ----- the compositor ----- */
  function startDraw(){ cancelAnimationFrame(studio.raf); const loop=()=>{ drawStage(); studio.raf=requestAnimationFrame(loop); }; loop(); }
  function drawStage(){
    const c=sctx(), W=1280, H=720;
    const s=studio.slides[studio.idx]; const full = PIP_MODES[studio.pip].k==='full';
    if(full && studio.camReady){ drawVideoCover(c,0,0,W,H); drawLowerThird(c,W,H,s); }
    else { drawSlide(c,s,W,H); if(studio.camReady && PIP_MODES[studio.pip].k!=='off') drawPip(c,W,H); }
  }
  function drawVideoCover(c,x,y,w,h){
    const v=$('#recVideo'), vw=v.videoWidth||1280, vh=v.videoHeight||720;
    const ar=vw/vh, tar=w/h; let dw,dh; if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;}
    c.save(); c.beginPath(); c.rect(x,y,w,h); c.clip();
    c.translate(x+w,y); c.scale(-1,1);          // mirror
    c.drawImage(v, (w-dw)/2, (h-dh)/2, dw, dh);
    c.restore();
  }
  function drawPip(c,W,H){
    const m=PIP_MODES[studio.pip].k; const big=m==='br-lg';
    const w=big?420:300, h=w*9/16, pad=28;
    const x = m==='bl' ? pad : W-w-pad;
    const y = H-h-pad;
    c.save(); roundRect(c,x,y,w,h,16); c.clip(); drawVideoCover(c,x,y,w,h); c.restore();
    c.save(); roundRect(c,x,y,w,h,16); c.lineWidth=4; c.strokeStyle='#fff'; c.stroke();
    c.shadowColor='rgba(0,0,0,.4)'; c.restore();
  }
  // slide backgrounds + content
  function drawSlide(c,s,W,H){
    // base
    const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0E3F3C'); g.addColorStop(1,'#0A2C2A');
    c.fillStyle=g; c.fillRect(0,0,W,H);
    c.fillStyle='#fff';
    if(!s){ return; }
    if(s.type==='intro'){
      c.textAlign='left';
      c.fillStyle='rgba(255,255,255,.55)'; c.font='600 26px Plus Jakarta Sans'; c.fillText('Personalized smile consultation', 80, 150);
      c.fillStyle='#fff'; c.font='500 76px Fraunces'; c.fillText(s.title, 78, 250);
      c.fillStyle='#E8C07D'; c.font='600 30px Plus Jakarta Sans';
      c.fillText('Goals: '+(s.goals.join(' · ')||'general consultation'), 80, 330);
      c.fillStyle='rgba(255,255,255,.7)'; c.font='500 26px Plus Jakarta Sans'; c.fillText('with '+cfg().doctor.name+', '+cfg().doctor.role.split('·').pop().trim(), 80, 640);
    } else if(s.type==='photos'){
      slideTitle(c,'Your photos',W);
      if(s.imgs.length){ const n=s.imgs.length, gap=40, aw=(W-160-gap*(n-1))/n;
        s.imgs.forEach((im,i)=>{ const x=80+i*(aw+gap), y=170, h=440; c.save(); roundRect(c,x,y,aw,h,18); c.clip(); coverImg(c,im,x,y,aw,h); c.restore(); roundStroke(c,x,y,aw,h,18); });
      } else { placeholderNote(c,'Patient photos appear here (this demo lead used seeded placeholders).',W,H); }
    } else if(s.type==='preview'){
      slideTitle(c,'Your smile preview',W);
      const bw=(W-200)/2, y=180, h=420;
      drawSmilePanel(c,80,y,bw,h,false,'Now');
      drawSmilePanel(c,120+bw,y,bw,h,true,'Preview');
      c.fillStyle='rgba(255,255,255,.6)'; c.textAlign='center'; c.font='500 22px Plus Jakarta Sans';
      c.fillText('Illustrative preview — your real plan is what we’re discussing now.', W/2, 650); c.textAlign='left';
    } else if(s.type==='case'){
      slideTitle(c,'A case like yours',W);
      c.fillStyle='#E8C07D'; c.font='600 28px Plus Jakarta Sans'; c.fillText(s.case.label, 80, 150);
      const y=185;
      if(s.case.single){ const h=430, w=h*4/3, x=(W-w)/2; c.save(); roundRect(c,x,y,w,h,18); c.clip(); coverImg(c,s.case.single,x,y,w,h); c.restore(); roundStroke(c,x,y,w,h,18); }
      else { const bw=(W-200)/2,h=420; imgPanel(c,80,y,bw,h,s.case.before,'Before'); imgPanel(c,120+bw,y,bw,h,s.case.after,'After'); }
    } else if(s.type==='plan'){
      slideTitle(c,'Your recommended plan',W);
      c.font='500 34px Plus Jakarta Sans'; let y=230;
      s.plan.lines.forEach(p=>{ c.fillStyle='#fff'; c.fillText('• '+p.k, 90, y); c.fillStyle='#E8C07D'; c.textAlign='right'; c.fillText(p.v, W-90, y); c.textAlign='left'; y+=64; });
      c.fillStyle='rgba(255,255,255,.85)'; c.font='600 28px Plus Jakarta Sans'; c.fillText('Financing from '+s.plan.financing, 90, y+12);
      c.fillStyle='#E8775B'; roundRect(c,90,H-150,420,70,16); c.fill();
      c.fillStyle='#fff'; c.font='700 28px Plus Jakarta Sans'; c.fillText('Next step: book your visit →', 118, H-105);
    }
  }
  function drawLowerThird(c,W,H,s){ // when talking-head full, show a caption strip
    c.fillStyle='rgba(10,40,38,.78)'; c.fillRect(0,H-110,W,110);
    c.fillStyle='#fff'; c.font='600 30px Plus Jakarta Sans'; c.textAlign='left';
    c.fillText(cfg().doctor.name+' — '+displayName(studio.lead), 60, H-50);
  }
  function slideTitle(c,t,W){ c.fillStyle='#fff'; c.font='500 52px Fraunces'; c.textAlign='left'; c.fillText(t,80,120);
    c.strokeStyle='rgba(232,192,125,.6)'; c.lineWidth=3; c.beginPath(); c.moveTo(82,138); c.lineTo(82+t.length*22,138); c.stroke(); }
  function placeholderNote(c,t,W,H){ c.fillStyle='rgba(255,255,255,.5)'; c.font='500 26px Plus Jakarta Sans'; c.textAlign='center'; wrap(c,t,W/2,H/2,W-300,36); c.textAlign='left'; }
  function coverImg(c,im,x,y,w,h){ if(!im||!im.complete||!im.naturalWidth)return; const ar=im.width/im.height,tar=w/h;let dw,dh;if(ar>tar){dh=h;dw=h*ar;}else{dw=w;dh=w/ar;}c.drawImage(im,x+(w-dw)/2,y+(h-dh)/2,dw,dh); }
  function imgPanel(c,x,y,w,h,im,label){ c.save(); roundRect(c,x,y,w,h,18); c.clip(); if(im)coverImg(c,im,x,y,w,h); else {c.fillStyle='#163f3c';c.fillRect(x,y,w,h);} c.restore(); roundStroke(c,x,y,w,h,18); tagLabel(c,x+14,y+14,label); }
  function tagLabel(c,x,y,t){ c.fillStyle='rgba(0,0,0,.5)'; const w=t.length*11+20; roundRect(c,x,y,w,30,8); c.fill(); c.fillStyle='#fff'; c.font='700 16px Plus Jakarta Sans'; c.fillText(t,x+10,y+21); }
  function roundRect(c,x,y,w,h,r){ c.beginPath(); c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r); c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function roundStroke(c,x,y,w,h,r){ c.save(); roundRect(c,x,y,w,h,r); c.lineWidth=3; c.strokeStyle='rgba(255,255,255,.25)'; c.stroke(); c.restore(); }
  function wrap(c,t,cx,cy,maxw,lh){ const words=t.split(' ');let line='',y=cy;const lines=[];words.forEach(w=>{const test=line+w+' ';if(c.measureText(test).width>maxw){lines.push(line);line=w+' ';}else line=test;});lines.push(line);const start=y-(lines.length-1)*lh/2;lines.forEach((ln,i)=>c.fillText(ln.trim(),cx,start+i*lh)); }
  function drawSmilePanel(c,x,y,w,h,after,label){ c.save(); roundRect(c,x,y,w,h,18); c.clip();
    const sk=c.createLinearGradient(x,y,x,y+h); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78'); c.fillStyle=sk; c.fillRect(x,y,w,h);
    const cx=x+w/2,cy=y+h/2,mw=w*0.6,mh=mw*0.42;
    c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+13,mh/2+13,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.05,mw/2-5,mh/2-3,0,0,7); c.clip();
    const n=8,gap=3,tw=(mw-12)/n,x0=cx-(mw-12)/2,ty=cy-mh/2+3;
    for(let i=0;i<n;i++){let px=x0+i*tw,ph=mh-12,py=ty;c.fillStyle=after?'#fff':'#E2D4AE';if(!after){if(i===3)py+=6;if(i===4)px+=4;}c.fillRect(px,py,tw-gap,ph);} c.restore();
    c.restore(); roundStroke(c,x,y,w,h,18); tagLabel(c,x+14,y+14,label);
  }

  /* ----- slide / pip / teleprompter controls ----- */
  function setSlide(i){ studio.idx=Math.max(0,Math.min(studio.slides.length-1,i)); updateSlideUi(); }
  function prevSlide(){ setSlide(studio.idx-1); }
  function nextSlide(){ setSlide(studio.idx+1); }
  function updateSlideUi(){
    $('#slideCount').textContent=(studio.idx+1)+' / '+studio.slides.length;
    $$('.sthumb').forEach((el,i)=>el.classList.toggle('cur',i===studio.idx));
    const s=studio.slides[studio.idx]; const notes=(s&&s.note&&s.note.length)?s.note:[{cue:'',text:''}];
    $('#teleprompter').innerHTML = notes.map(n=>`<div class="tl">${n.cue?`<b>${esc(n.cue)}</b>`:''}${esc(n.text)}</div>`).join('');
  }
  function cyclePip(){ studio.pip=(studio.pip+1)%PIP_MODES.length; updatePipLabel(); }
  function updatePipLabel(){ $('#pipToggle').textContent='📹 Camera: '+PIP_MODES[studio.pip].label; }
  function toggleTele(){ studio.tele=!studio.tele; $('#teleprompter').classList.toggle('off',!studio.tele); $('#teleToggle').textContent='📝 Script: '+(studio.tele?'on':'off'); }

  /* ----- case library ----- */
  function buildCaseLibrary(){
    const mk=(label,beforeOpts,afterOpts)=>({id:'c'+Math.random().toString(36).slice(2,6),label,
      before:caseImg(beforeOpts), after:caseImg(afterOpts)});
    return [
      mk('Diastema closure · veneers',{gap:true,shade:'#E2D4AE'},{shade:'#fff'}),
      mk('Whitening + bonding',{shade:'#D8C58E'},{shade:'#fff'}),
      mk('Full veneer makeover',{gap:true,chip:true,shade:'#D9C9A0'},{shade:'#fff'}),
      mk('Chipped front tooth',{chip:true,shade:'#E7DCB8'},{shade:'#FBFBF6'})
    ];
  }
  function caseImg(o){ const cv=document.createElement('canvas'); cv.width=200; cv.height=150; const c=cv.getContext('2d');
    const sk=c.createLinearGradient(0,0,0,150); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78'); c.fillStyle=sk; c.fillRect(0,0,200,150);
    const cx=100,cy=80,mw=120,mh=52; c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+10,mh/2+10,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-2,mw/2-4,mh/2-3,0,0,7); c.clip();
    const n=8,gap=2,tw=(mw-8)/n,x0=cx-(mw-8)/2,ty=cy-mh/2+2;
    for(let i=0;i<n;i++){let x=x0+i*tw,h=mh-8,y=ty;c.fillStyle=o.shade;if(o.gap&&i===4)x+=4;if(o.chip&&i===3)h-=8;c.fillRect(x,y,tw-gap,h);} c.restore();
    const img=new Image(); img.src=cv.toDataURL('image/jpeg',0.8); return img;
  }
  function renderCaseLib(){
    const box=$('#caseLib'); box.innerHTML='';
    caseLibrary.forEach(cs=>{
      const el=document.createElement('div'); el.className='casecard'; el.title='Add “'+cs.label+'” as a slide';
      el.innerHTML=`<div class="thumbs"></div><div class="cl">${esc(cs.label)}</div>`;
      const th=el.querySelector('.thumbs');
      [cs.before,cs.single?null:cs.after].filter(Boolean).forEach(im=>{ const cnv=document.createElement('canvas'); cnv.width=100;cnv.height=54; const cc=cnv.getContext('2d'); const draw=()=>cc.drawImage(im,0,0,100,54); if(im.complete)draw(); else im.onload=draw; th.appendChild(cnv); });
      el.onclick=()=>addCaseSlide(cs);
      box.appendChild(el);
    });
    $('#caseUpload').onchange=onCaseUpload;
  }
  function addCaseSlide(cs){
    const note=[{cue:'Show a similar case', text:`Here’s a patient who started in a similar place — this is the kind of result we can aim for.`}];
    studio.slides.push({type:'case', case:cs, note});
    renderStrip(); setSlide(studio.slides.length-1); toast('Added “'+cs.label+'” as a slide');
  }
  async function onCaseUpload(e){
    const files=[...e.target.files]; for(const f of files){ const url=await fileToDataUrl(f); const img=await loadImg(url);
      const cs={id:'up'+Math.random().toString(36).slice(2,6), label:f.name.replace(/\.[^.]+$/,'').slice(0,22), single:img, before:img};
      caseLibrary.push(cs); }
    renderCaseLib(); toast(files.length+' case image(s) added to your library');
    e.target.value='';
  }
  function fileToDataUrl(f){ return new Promise(res=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(f); }); }
  function renderStrip(){
    const ICON={intro:'👋',photos:'🖼️',preview:'✨',case:'🦷',plan:'📋'};
    $('#slideStrip').innerHTML=studio.slides.map((s,i)=>{
      const label={intro:'Intro',photos:'Patient photos',preview:'Smile preview',case:(s.case&&s.case.label)||'Case',plan:'Recommended plan'}[s.type];
      const rm = s.type==='case' ? `<span class="rm" onclick="event.stopPropagation();DoctorApp.removeSlide(${i})">✕</span>`:'';
      return `<div class="sthumb ${i===studio.idx?'cur':''}" onclick="DoctorApp.gotoSlide(${i})"><span class="si">${ICON[s.type]}</span>${esc(label)}${rm}</div>`;
    }).join('');
  }
  function gotoSlide(i){ setSlide(i); }
  function removeSlide(i){ if(studio.slides[i] && studio.slides[i].type==='case'){ studio.slides.splice(i,1); if(studio.idx>=studio.slides.length)studio.idx=studio.slides.length-1; renderStrip(); updateSlideUi(); } }

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
    SmileStore.saveVideo(studio.id,{durationSec:rec?rec.dur:0, hasRecording:true, slides:studio.slides.length});
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
    prevSlide, nextSlide, cyclePip, toggleTele, gotoSlide, removeSlide };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
