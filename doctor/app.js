/* =============================================================================
   Virtual Consult — Practice Console (doctor + front-desk)
   A clinical work queue with an SLA clock, a consult workspace built to compress
   time-to-video, and a source-level performance loop. Reads/writes the same
   Store the patient flow writes to.
   ============================================================================= */
(function (global) {
  'use strict';

  let role = 'Dr. Brian Harris';
  let activeView = 'queue';
  let activeFilter = 'all';
  let openLeadId = null;
  let perfRange = { key:'all', from:null, to:null };   // Performance time window
  let perfTab = 'funnel';                               // Performance sub-tab: funnel | links
  let settingsSection = 'profile';                     // active Settings sub-section
  const recordedBlobs = {};        // in-memory recorded takes, keyed by lead id (demo)

  const $ = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => [...r.querySelectorAll(s)];
  const cfg = () => Store.config();

  /* ---------- boot ---------- */
  function boot(){
    Store.ensureSeeded();
    refreshRolePick();
    role = $('#rolePick').value;
    $('#rolePick').addEventListener('change', e=>{ role=e.target.value; render(); });
    $('#resetDemo').addEventListener('click', ()=>{ if(confirm('Reset all demo leads to the seeded set?')){ Store.reset(); render(); } });
    $('#brandBtn').addEventListener('click', openBrand);
    $('#brandModal').addEventListener('click', e=>{ if(e.target.id==='brandModal') closeBrand(); });
    $$('.navbtn').forEach(b=>b.addEventListener('click', ()=>setView(b.dataset.view)));
    $$('.chipf').forEach(b=>b.addEventListener('click', ()=>{ activeFilter=b.dataset.filter; $$('.chipf').forEach(x=>x.classList.toggle('active',x===b)); renderQueue(); }));
    $('#scrim').addEventListener('click', closeDrawer);
    Store.onChange(render);   // live refresh (incl. patient submissions in other tab)
    render();
  }

  function setView(v){
    activeView=v;
    $$('.navbtn').forEach(b=>b.classList.toggle('active', b.dataset.view===v));
    $('#view-queue').hidden = v!=='queue';
    $('#view-dash').hidden  = v!=='dash';
    $('#view-settings').hidden = v!=='settings';
    render();
  }

  function render(){
    const m = Store.metrics();
    $('#queueBadge').textContent = m.queueSize;
    if(activeView==='queue') renderQueue();
    else if(activeView==='dash') renderPerf();
    else if(activeView==='settings') renderSettings();
    if(openLeadId) renderDrawer(openLeadId);  // keep workspace in sync
  }
  // current signed-in user + their permission to record consults
  function currentUser(){ const s=(cfg().staff||[]).find(u=>u.name===role); return s||{name:role,canRecord:true}; }
  function canRecord(){ return !!currentUser().canRecord; }
  function refreshRolePick(){
    const sel=$('#rolePick'); const prev=role||sel.value; const staff=cfg().staff||[];
    sel.innerHTML=staff.map(u=>`<option value="${esc(u.name)}">${esc(u.name)} (${esc(u.role)})</option>`).join('');
    if(staff.some(u=>u.name===prev)) sel.value=prev; role=sel.value;
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
  function srcOf(lead){ return Store.channel(lead); }

  /* ---- stage engine: the single source of truth for "what stage is this lead
     in and what's the ONE next action?" Consumed by the queue row hint, the
     drawer CTA bar, and the Send & follow-up card so they can never disagree.
     Returns: { stage, waiting (bool), hint (one-liner), nextLabel (short verb
     for the queue), primary {label,fn}, secondaries [{label,fn,cls}] }.
     `fn` is a method name on DoctorApp; the caller wires the onclick. ---- */
  function nextAction(l){
    const id=l.id, c=l.contact||{};
    const hasRec = !!recordedBlobs[id] || (l.video && l.video.recordedAt);
    const sent   = l.video && l.video.sentAt;
    const noEmail = !c.email;

    // RECORDED-but-not-sent: ready to ship the video.
    if(hasRec && !sent){
      return { stage:'Recorded — not sent yet', waiting:false,
        hint:'The consult video is filmed. Send it so the patient can watch and book.',
        nextLabel:'Send video',
        primary:{ label:'📤 Send video consult', fn:'sendVideo', cls:'coral-d' },
        secondaries:[ canRecord()?{label:'⟳ Re-record', fn:'openRecorder'}:null,
                      {label:'Preview patient email', fn:'previewEmail'} ].filter(Boolean) };
    }
    // SENT: ball is in the patient's court — waiting on a watch.
    if(l.status==='sent'){
      return { stage:'Sent — waiting on the patient to watch', waiting:true,
        hint:'Sent '+timeAgo(l.video&&l.video.sentAt)+'. They haven’t opened it yet. A nudge is your best lever now.',
        nextLabel:'Nudge to watch',
        primary:{ label:'🔔 Send watch reminder', fn:["nudge",'sent'] },
        secondaries:[ {label:'Preview patient email', fn:'previewEmail'} ] };
    }
    // VIEWED: they watched — push for the booking.
    if(l.status==='viewed'){
      return { stage:'Viewed — they watched, not booked yet', waiting:true,
        hint:'They’ve seen your video. Send a booking nudge to convert the interest before it cools.',
        nextLabel:'Nudge to book',
        primary:{ label:'🔔 Send booking nudge', fn:["nudge",'viewed'] },
        secondaries:[ {label:'✓ Mark as booked', fn:["setStatusManual",'booked']},
                      {label:'Preview patient email', fn:'previewEmail'} ] };
    }
    // BOOKED: the conversion box below is the work.
    if(l.status==='booked'){
      return { stage:'Booked', waiting:false,
        hint:'Booked. Log attendance + treatment value below so it counts toward revenue and ROAS.',
        nextLabel:'Log outcome', primary:null, secondaries:[] };
    }
    if(l.status==='no_response'){
      return { stage:'No response', waiting:false,
        hint: noEmail ? 'Abandoned before leaving contact — retarget via the originating ad audience.'
                      : 'Went cold. Try one recovery nudge to reopen the conversation.',
        nextLabel: noEmail?'Retarget':'Recover',
        primary: noEmail?null:{ label:'🔔 Send recovery nudge', fn:["nudge",'recover'] },
        secondaries:[] };
    }
    // NEW / IN_REVIEW (no video yet): record the consult.
    if(canRecord()){
      return { stage:'New lead — needs a consult video', waiting:false,
        hint:'AI script is drafted from their intake. Open the studio, riff, and film — speed-to-send is the #1 close lever.',
        nextLabel:'Record consult',
        primary:{ label:'🎬 Open Consult Studio', fn:'openRecorder' },
        secondaries:[ {label:'Copy script', fn:'copyScript'} ] };
    }
    // front-desk view of a fresh lead: drafted, needs handing to a recorder.
    const recorder=(cfg().staff.find(u=>u.canRecord)||{}).name||'';
    return { stage:'New lead — drafted & ready to film', waiting:false,
      hint:'Script is drafted. You can’t record — assign it to someone who can so the clock keeps moving.',
      nextLabel:'Assign recorder',
      primary:{ label:'Assign to a recorder →', fn:["assign",recorder] },
      secondaries:[ {label:'Copy script', fn:'copyScript'} ] };
  }
  // build an onclick from a stage action's `fn` (string method, or [method,arg]).
  function actCall(id, fn){
    if(Array.isArray(fn)) return `DoctorApp.${fn[0]}('${id}','${esc(String(fn[1]))}')`;
    return `DoctorApp.${fn}('${id}')`;
  }

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
    const m = Store.metrics();
    $('#queueSla').innerHTML = `${m.queueSize} awaiting a video · `+
      (m.overdue? `<b style="color:var(--coral)">${m.overdue} overdue</b> · ` : '')+
      `median time-to-send <b>${m.medianTimeToSendH==null?'—':m.medianTimeToSendH+'h'}</b>`;

    const leads = Store.all().filter(passesFilter).sort((a,b)=>{
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
      // one clear next action per row, from the shared stage engine.
      const na = nextAction(l);
      const nextPill = na.primary
        ? `<span class="nextact ${na.waiting?'waiting':''}">${na.waiting?'⏳ ':'→ '}${esc(na.nextLabel)}</span>`
        : `<span class="nextact done">${esc(na.nextLabel)}</span>`;
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
          ${nextPill}
          ${l.sim&&l.sim.enabled?'<span class="assignee">✨ preview unlocked</span>':''}
        </div>
      </div>`;
    }).join('');
  }

  /* ---------- DASHBOARD ---------- */
  function renderPerf(){
    const subnav = `<div class="perfsub">
      <button class="psub ${perfTab==='funnel'?'on':''}" onclick="DoctorApp.setPerfTab('funnel')">📊 Funnel &amp; revenue</button>
      <button class="psub ${perfTab==='links'?'on':''}" onclick="DoctorApp.setPerfTab('links')">🔗 Link-in-bio</button>
    </div>`;
    if(perfTab==='links'){ $('#perf').innerHTML = subnav + renderLinkPerf(); return; }
    const m = Store.metrics(), a = Store.analytics(perfRange), cv=a.conversion;
    const money = n => '$'+(n||0).toLocaleString();
    let html = subnav + rangeBarHtml(' · <b>'+a.funnel[0].count+'</b> leads');
    // headline KPIs
    const kpis = [
      ['Median time-to-send', m.medianTimeToSendH==null?'—':m.medianTimeToSendH+'h', m.overdue>0?m.overdue+' overdue':'on pace', m.overdue>0],
      ['Lead → booked', cv.leadToBooked+'%', a.funnel.find(f=>f.key==='booked').count+' booked'],
      ['Booked → paid', cv.bookedToPaid+'%', cv.avgTreatment?('avg '+money(cv.avgTreatment)):''],
      ['Revenue (attributed)', money(cv.revenue), cv.roas!=null?(cv.roas+'× ROAS'):''],
      ['Video view rate', a.videos.viewRate+'%', a.videos.avgWatchPct+'% avg watched']
    ];
    const kicons=['⏱','📅','💳','💰','▶'];
    html += `<div class="metrics kpirow">`+kpis.map(([l,v,sub,alert],i)=>
      `<div class="metric kpi ${alert?'alert':''}"><div class="kpi-ic">${kicons[i]}</div><div class="big">${v}</div><div class="lbl">${l}</div>${sub?`<div class="msub">${esc(sub)}</div>`:''}</div>`).join('')+`</div>`;

    // FUNNEL with drop-off
    const f0 = a.funnel[0].count||1;
    html += `<div class="panel"><h3><span class="ph-ic">🫥</span>Conversion funnel</h3><p class="muted small">Where people advance — and where you lose them. % is of everyone who started.</p>
      <div class="funnelchart">`+
      a.funnel.map((s,i)=>{
        const w = Math.round(s.count/f0*100);
        const drop = i>0 && s.dropped>0 ? `<span class="drop">▼ ${s.dropped} dropped (${100-s.stepConv}%)</span>`:'';
        return `<div class="frow"><div class="flabel">${esc(s.label)}</div>
          <div class="ftrack"><div class="ffill" style="width:${Math.max(w,3)}%"><span>${s.count}</span></div></div>
          <div class="fpct">${s.pctOfStart}%</div><div class="fdrop">${drop}</div></div>`;
      }).join('')+`</div></div>`;

    // ENGAGEMENT
    const v=a.videos;
    html += `<div class="grid2">
      <div class="panel"><h3><span class="ph-ic">▶</span>Video engagement</h3>
        <div class="kpis">
          <div><b>${v.sent}</b><span>videos sent</span></div>
          <div><b>${v.viewed}</b><span>watched (${v.viewRate}%)</span></div>
          <div><b>${v.avgWatches}</b><span>avg views / lead</span></div>
          <div><b>${v.avgWatchPct}%</b><span>avg watched</span></div>
          <div><b>${v.simUnlockRate}%</b><span>unlocked a preview</span></div>
        </div>
        <p class="muted small" style="margin-top:10px">Watch-rate & completion are your strongest leading indicators of a booking — chase the sent-not-viewed segment from the queue.</p>
      </div>
      <div class="panel"><h3><span class="ph-ic">💰</span>Conversion</h3>
        <div class="kpis">
          <div><b>${cv.leadToBooked}%</b><span>lead → booked</span></div>
          <div><b>${cv.bookedToPaid}%</b><span>booked → paid</span></div>
          <div><b>${money(cv.avgTreatment)}</b><span>avg case value</span></div>
          <div><b>${money(cv.revenue)}</b><span>revenue</span></div>
          <div><b>${cv.roas!=null?cv.roas+'×':'—'}</b><span>ROAS</span></div>
        </div>
        <p class="muted small" style="margin-top:10px">“Paid” is set when you mark a booked patient attended + treatment value in their consult. <em>(Production: sync from your PMS.)</em></p>
      </div></div>`;

    // BY SOURCE — full economics
    html += `<div class="panel"><h3><span class="ph-ic">📊</span>By source — full economics</h3>
      <p class="muted small">Where leads come from — paid or organic. Spend (paid channels only) is set in Settings; organic sources show “—”. This is the table that decides where the next dollar goes.</p>
      <table class="funnel"><tr><th>Source</th><th>Spend</th><th>Leads</th><th>CPL</th><th>Sent</th><th>Viewed</th><th>Booked</th><th>Paid</th><th>Revenue</th><th>CPA</th><th>ROAS</th></tr>`+
      a.sources.map(r=>`<tr>
        <td class="src">${esc(r.source)}</td><td>${r.spend?money(r.spend):'—'}</td>
        <td>${r.leads}</td><td>${r.cpl!=null?money(r.cpl):'—'}</td>
        <td>${r.sent}</td><td>${r.viewed}</td><td>${r.booked}</td><td>${r.paid}</td>
        <td class="conv">${money(r.revenue)}</td><td>${r.cpa!=null?money(r.cpa):'—'}</td>
        <td class="conv">${r.roas!=null?r.roas+'×':'—'}</td></tr>`).join('')+`</table></div>`;

    $('#perf').innerHTML = html;
  }
  function setPerfTab(tab){ perfTab=tab; renderPerf(); }
  // shared time-range control (used by both Performance sub-tabs)
  function rangeBarHtml(suffixHtml){
    const RANGES=[['all','All time'],['90','Last 90 days'],['month','Last month'],['custom','Custom range']];
    const fmt = ms => new Date(ms).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const rlabel = perfRange.key==='all' ? 'All time'
      : perfRange.key==='90' ? 'Last 90 days'
      : perfRange.key==='month' ? 'Last 30 days'
      : (perfRange.from||perfRange.to) ? `${perfRange.from?fmt(perfRange.from):'…'} → ${perfRange.to?fmt(perfRange.to):'now'}` : 'Pick dates';
    return `<div class="perfbar">
      <div class="seg-group">${RANGES.map(([k,l])=>`<button class="seg ${perfRange.key===k?'on':''}" onclick="DoctorApp.setPerfRange('${k}')">${l}</button>`).join('')}</div>
      <div class="daterange" ${perfRange.key==='custom'?'':'hidden'}>
        <input type="date" id="perfFrom" value="${perfRange.from?new Date(perfRange.from).toISOString().slice(0,10):''}" onchange="DoctorApp.setPerfRange('custom')">
        <span>→</span>
        <input type="date" id="perfTo" value="${perfRange.to?new Date(perfRange.to).toISOString().slice(0,10):''}" onchange="DoctorApp.setPerfRange('custom')">
      </div>
      <span class="rangelabel">📅 ${esc(rlabel)}${suffixHtml||''}</span>
    </div>`;
  }
  function renderLinkPerf(){
    const c=cfg(); const clicks=Store.clickStats(perfRange); const links=c.links||[];
    const rows=[{id:'primary', label:'✨ '+((c.site&&c.site.ctaText)||'Free smile preview'), primary:true}]
      .concat(links.map(l=>({id:l.id, label:(l.icon?l.icon+' ':'')+l.label})));
    const total=Object.values(clicks).reduce((s,n)=>s+(+n||0),0);
    const max=Math.max(1,...rows.map(r=>clicks[r.id]||0));
    const primaryClicks=clicks['primary']||0;
    const pct=n=>total?Math.round(n/total*100):0;
    return rangeBarHtml(' · <b>'+total+'</b> taps') + `<div class="metrics kpirow">
        <div class="metric kpi"><div class="kpi-ic">👆</div><div class="big">${total}</div><div class="lbl">Total bio taps</div></div>
        <div class="metric kpi"><div class="kpi-ic">✨</div><div class="big">${primaryClicks}</div><div class="lbl">Free-preview CTA taps</div><div class="msub">${pct(primaryClicks)}% of taps</div></div>
        <div class="metric kpi"><div class="kpi-ic">🔗</div><div class="big">${links.length}</div><div class="lbl">Links live</div></div>
      </div>
      <div class="panel"><h3><span class="ph-ic">🔗</span>Taps by link</h3>
        <p class="muted small">Every tap on your Linktree-style bio page. The free-preview CTA is the one that feeds the consult queue.</p>
        <div class="taps">`+
        rows.map(r=>{ const n=clicks[r.id]||0, w=Math.round(n/max*100);
          return `<div class="taprow">
            <div class="tap-label"><span class="tap-name">${esc(r.label)}</span>${r.primary?'<span class="prim">Primary</span>':''}</div>
            <div class="tap-bar"><div class="tap-fill ${r.primary?'':'alt'}" style="width:${Math.max(w,2)}%"></div></div>
            <div class="tap-n">${n}</div>
            <div class="tap-pct">${pct(n)}%</div>
          </div>`;
        }).join('')+`</div>
        <div class="sharerow" style="margin-top:16px">
          <a class="cta-d" href="../link/" target="_blank">👁 Open bio page</a>
          <input class="shareurl" readonly value="${esc(pubUrl('../link/'))}" onclick="this.select()">
          <button class="cta-d ghost-d" onclick="DoctorApp.share('../link/','My Virtual Consult bio link')">🔗 Share</button>
        </div>
        <div class="hint" style="margin-top:8px">Counts respect the date range above. Manage the links themselves in <b>Settings → Link-in-bio</b>.</div>
      </div>`;
  }
  function setPerfRange(key){
    perfRange.key=key; const now=Date.now();
    if(key==='all'){ perfRange.from=null; perfRange.to=null; }
    else if(key==='90'){ perfRange.from=now-90*864e5; perfRange.to=null; }
    else if(key==='month'){ perfRange.from=now-30*864e5; perfRange.to=null; }
    else if(key==='custom'){ const f=$('#perfFrom')&&$('#perfFrom').value, t=$('#perfTo')&&$('#perfTo').value;
      perfRange.from=f?new Date(f).getTime():null; perfRange.to=t?new Date(t).getTime()+(864e5-1):null; }
    renderPerf();
  }

  /* ---------- SETTINGS ---------- */
  function cfgSet(path, value){ const c=cfg(); const p=path.split('.'); let o=c; for(let i=0;i<p.length-1;i++){ o[p[i]]=o[p[i]]||{}; o=o[p[i]]; } o[p[p.length-1]]=value; Store.saveConfig(c); }
  const SET_ICONS={'Practice & doctor':'🦷','Brand & theme':'🎨','Team & permissions':'👥','Intake questions':'❓','Tracking & attribution':'📈','Reviews & ratings':'⭐','Landing page':'🌐','Marketing spend':'💸','Link-in-bio':'🔗','Directory profile':'📍','Embeddable widgets':'🧩'};
  function pubUrl(path){ try{ return new URL(path, location.href).href; }catch(e){ return path; } }
  function shareRow(path, label){ const url=pubUrl(path);
    return `<div class="sharerow">
      <a class="cta-d" href="${esc(path)}" target="_blank">👁 Preview</a>
      <input class="shareurl" readonly value="${esc(url)}" onclick="this.select()" title="Public URL">
      <button class="cta-d ghost-d" onclick="DoctorApp.share('${esc(path)}','${esc(label)}')">🔗 Share</button>
    </div>`; }
  function scard(title, sub, body){ const ic=SET_ICONS[title]||'⚙️';
    return `<div class="panel sset"><div class="seth"><span class="setic">${ic}</span><div class="seth-t"><h3>${esc(title)}</h3>${sub?`<p class="muted small">${sub}</p>`:''}</div></div><div class="sbody">${body}</div></div>`; }
  function fld(label,path,val,type){ return `<label class="sfield"><span>${esc(label)}</span><input type="${type||'text'}" value="${esc(val==null?'':val)}" onchange="DoctorApp.cfg('${path}',this.value)"></label>`; }

  function renderSettings(){
    const c=cfg(), clicks=Store.clickStats();
    const doctor=c.doctor||{}, rev=c.reviews||{}, an=c.analytics||{}, site=c.site||{}, spend=c.spendBySource||{};

    const profile = scard('Practice & doctor', 'Shown across the patient flow, landing page, directory and video pages.',
      `<div class="srow">${fld('Doctor name','doctor.name',doctor.name)}${fld('Credential','doctor.credential',doctor.credential)}</div>
       <div class="srow">${fld('Role / specialty','doctor.role',doctor.role)}${fld('NPI','doctor.npi',doctor.npi)}</div>
       <div class="srow">${fld('Phone','doctor.phone',doctor.phone)}${fld('Email','doctor.email',doctor.email,'email')}</div>
       <div class="srow">${fld('Address','doctor.address',doctor.address)}${fld('City','doctor.city',doctor.city)}${fld('State','doctor.state',doctor.state)}</div>
       <label class="sfield"><span>Bio</span><textarea onchange="DoctorApp.cfg('doctor.bio',this.value)">${esc(doctor.bio||'')}</textarea></label>`);

    const brandCard = scard('Brand & theme', 'Your logo, colors and doctor photo — applied to consult slides, the landing page, widgets and your bio link.',
      brandBodyHtml());

    const team = scard('Team & permissions', 'The only permission is whether a member can record & send consults.',
      `<div class="stafflist">`+(c.staff||[]).map((u,i)=>`
        <div class="staffrow">
          <input class="sn" value="${esc(u.name)}" onchange="DoctorApp.staffField(${i},'name',this.value)">
          <input class="sr" value="${esc(u.role)}" onchange="DoctorApp.staffField(${i},'role',this.value)">
          <label class="perm"><input type="checkbox" ${u.canRecord?'checked':''} onchange="DoctorApp.staffRec(${i},this.checked)"> can record</label>
          <button class="xbtn" onclick="DoctorApp.staffDel(${i})">✕</button>
        </div>`).join('')+`</div>
       <button class="cta-d ghost-d" onclick="DoctorApp.staffAdd()">+ Add team member</button>`);

    const qs = scard('Intake questions', 'Custom questions shown in the patient flow. Drag-free reorder with the arrows.',
      `<div class="qlist">`+(c.questions||[]).map((q,i)=>`
        <div class="qrow">
          <select onchange="DoctorApp.qField(${i},'type',this.value)">
            ${['text','choice','select'].map(t=>`<option value="${t}" ${q.type===t?'selected':''}>${t==='text'?'Text':t==='choice'?'Multiple choice':'Dropdown'}</option>`).join('')}
          </select>
          <input class="ql" value="${esc(q.label)}" onchange="DoctorApp.qField(${i},'label',this.value)" placeholder="Question text">
          ${q.type!=='text'?`<input class="qo" value="${esc((q.options||[]).join(', '))}" onchange="DoctorApp.qField(${i},'options',this.value)" placeholder="Options, comma-separated">`:'<span class="qo muted small">free text</span>'}
          <div class="qbtns"><button class="xbtn" onclick="DoctorApp.qMove(${i},-1)">↑</button><button class="xbtn" onclick="DoctorApp.qMove(${i},1)">↓</button><button class="xbtn" onclick="DoctorApp.qDel(${i})">✕</button></div>
        </div>`).join('')+`</div>
       <button class="cta-d ghost-d" onclick="DoctorApp.qAdd()">+ Add question</button>`);

    const aliases=c.sourceAliases||{};
    const tracking = scard('Tracking & analytics',
      'Your existing pixels fire on every step + conversion. Tag your ad/bio/website links with <code>?utm_source=…</code> and we attribute automatically; click IDs (fbclid/gclid) are captured for offline conversion upload.',
      `<div class="srow">${fld('Meta Pixel ID','analytics.metaPixelId',an.metaPixelId)}${fld('GA4 Measurement ID','analytics.ga4Id',an.ga4Id)}</div>
       <div class="srow">${fld('Google Ads ID','analytics.googleAdsId',an.googleAdsId)}${fld('Server / webhook endpoint','analytics.customEndpoint',an.customEndpoint)}</div>
       <div class="submini">Source mapping <span class="muted small">— map the <code>utm_source</code> you use → the channel name in reports</span></div>
       <div class="aliaslist">`+Object.keys(aliases).map(k=>`
         <div class="aliasrow"><input value="${esc(k)}" disabled class="ak"><span>→</span><input value="${esc(aliases[k])}" onchange="DoctorApp.aliasField('${esc(k)}',this.value)"><button class="xbtn" onclick="DoctorApp.aliasDel('${esc(k)}')">✕</button></div>`).join('')+`</div>
       <div class="aliasadd"><input id="aliasKey" placeholder="utm_source (e.g. ig)"><span>→</span><input id="aliasVal" placeholder="Channel (e.g. Instagram)"><button class="cta-d ghost-d" onclick="DoctorApp.aliasAdd()">Add</button></div>`);

    const reviews = scard('Reviews & ratings', 'Shown on your landing page & directory profile. Paste your public ratings (live Google/Yelp sync needs their API server-side).',
      `<div class="srow">${fld('Google rating','reviews.googleRating',rev.googleRating,'number')}${fld('Google # reviews','reviews.googleCount',rev.googleCount,'number')}</div>
       ${fld('Google reviews URL','reviews.googleUrl',rev.googleUrl)}
       <div class="srow">${fld('Yelp rating','reviews.yelpRating',rev.yelpRating,'number')}${fld('Yelp # reviews','reviews.yelpCount',rev.yelpCount,'number')}</div>
       ${fld('Yelp URL','reviews.yelpUrl',rev.yelpUrl)}
       <label class="perm"><input type="checkbox" ${site.showReviews?'checked':''} onchange="DoctorApp.cfg('site.showReviews',this.checked)"> show reviews on landing page</label>`);

    const sitecard = scard('Landing page', 'Your standalone, brand-themed practice site. Edit the copy, then preview or share the public link.',
      `${fld('Headline','site.headline',site.headline)}
       <label class="sfield"><span>Subhead</span><textarea onchange="DoctorApp.cfg('site.subhead',this.value)">${esc(site.subhead||'')}</textarea></label>
       ${fld('Primary CTA text','site.ctaText',site.ctaText)}
       ${shareRow('../site/','My practice landing page')}`);

    const channels = Store.channelsInUse();
    const spendRows = spendList().map((r,i)=>`
      <div class="spendrow">
        <input value="${esc(r.label||'')}" onchange="DoctorApp.spendField(${i},'label',this.value)" placeholder="e.g. Google Search">
        <select onchange="DoctorApp.spendField(${i},'channel',this.value)">
          ${channels.map(ch=>`<option ${r.channel===ch?'selected':''}>${esc(ch)}</option>`).join('')}
          ${channels.includes(r.channel)?'':`<option selected>${esc(r.channel||'')}</option>`}
        </select>
        <input type="number" class="amt" value="${r.amount||''}" onchange="DoctorApp.spendField(${i},'amount',this.value)" placeholder="$/mo">
        <button class="xbtn" onclick="DoctorApp.spendDel(${i})">✕</button>
      </div>`).join('');
    const spendCard = scard('Marketing spend',
      'Add a line item per campaign and map it to a source. Several lines can map to the same source (they’re summed for that channel). Leave organic sources out. Monthly $ drives CPL / CPA / ROAS.',
      `<div class="spendhead"><span>Description</span><span>Source</span><span>$/mo</span><span></span></div>
       <div class="spendlist">${spendRows||'<div class="hint">No spend lines yet — add one.</div>'}</div>
       <button class="cta-d ghost-d" onclick="DoctorApp.spendAdd()">+ Add spend line</button>`);

    const links = scard('Link-in-bio', 'Your Linktree-style bio page for Instagram/TikTok. Reorder-free list below; preview or share the public link. Click counts are tracked.',
      `${shareRow('../link/','My Virtual Consult bio link')}
       <div class="submini" style="margin-top:4px">Links</div>
       <div class="linklist">`+(c.links||[]).map((lk,i)=>`
        <div class="linkrow">
          <input class="li" value="${esc(lk.icon||'')}" onchange="DoctorApp.linkField(${i},'icon',this.value)" style="width:44px;text-align:center">
          <input value="${esc(lk.label)}" onchange="DoctorApp.linkField(${i},'label',this.value)" placeholder="Label">
          <input value="${esc(lk.url)}" onchange="DoctorApp.linkField(${i},'url',this.value)" placeholder="https://">
          <span class="clicks" title="clicks">${clicks[lk.id]||0} clicks</span>
          <button class="xbtn" onclick="DoctorApp.linkDel(${i})">✕</button>
        </div>`).join('')+`</div>
       <button class="cta-d ghost-d" onclick="DoctorApp.linkAdd()">+ Add link</button>`);

    const dirId = (c.doctor && c.doctor.directoryId) || 'harris';
    const directoryCard = scard('Directory profile', 'Your public listing in the Virtual Consult doctor directory — NPI-verified, with reviews, response time and before/afters. Patients find you by goal + location.',
      `<div class="dirsum">
         <div><b>${esc((c.doctor||{}).name||'Dr.')}</b> · ${esc((c.doctor||{}).city||'')}, ${esc((c.doctor||{}).state||'')}</div>
         <div class="muted small">★ ${esc((c.reviews||{}).googleRating||'—')} · ${esc((c.reviews||{}).googleCount||0)} reviews · ✓ NPI-verified</div>
       </div>
       ${shareRow('../directory/?doctor='+encodeURIComponent(dirId),'My Virtual Consult directory profile')}`);

    // self-contained widget previews + copy-paste snippets (no external dependency)
    const wb=c.widgets||{}, br=c.brand||{};
    const wAccent=br.primary||'#0E5450';
    const wHead=wb.headline||'See your new smile — free';
    const wCta=wb.cta||'✨ Free Smile Preview';
    const wTarget=wb.target||pubUrl('../patient/');
    const wRating=(rev.googleRating!=null?rev.googleRating:4.9), wCount=(rev.googleCount!=null?rev.googleCount:1284);
    const wName=br.name||'our patients';
    const widgetSrc=pubUrl('../embed/widget.js');
    const wsnip=(attrs)=>{ const lines=['<script src="'+widgetSrc+'"']; attrs.forEach(p=>lines.push('        '+p[0]+'="'+p[1]+'"')); return lines.join('\n')+'></'+'script>'; };
    const snipInline=wsnip([['data-widget','inline'],['data-target',wTarget],['data-accent',wAccent],['data-headline',wHead],['data-cta',wCta],['data-rating',String(wRating)],['data-count',String(wCount)]]);
    const snipFloat=wsnip([['data-widget','floating'],['data-target',wTarget],['data-accent',wAccent],['data-cta',wCta]]);
    const snipBadge=wsnip([['data-widget','badge'],['data-accent',wAccent],['data-rating',String(wRating)],['data-count',String(wCount)],['data-name',wName],['data-review-url',(rev.googleUrl||wTarget)]]);
    const pvInline=`<div class="wpv-card" style="--wa:${esc(wAccent)}"><div class="wpv-eb">Free Smile Preview</div><div class="wpv-h">${esc(wHead)}</div><div class="wpv-sub">An instant preview + a personal video from the doctor.</div><div class="wpv-stars">★★★★★ <b>${esc(wRating)}</b> <span>· ${esc(wCount)} reviews</span></div><div class="wpv-btn">${esc(wCta)}</div></div>`;
    const pvFloat=`<div class="wpv-floatbox"><span class="wpv-pill" style="--wa:${esc(wAccent)}">${esc(wCta)}</span></div>`;
    const pvBadge=`<div class="wpv-badge"><span class="wpv-g" style="--wa:${esc(wAccent)}">G</span><span class="wpv-bm"><span class="wpv-brow"><b>${esc(wRating)}</b> <span class="wpv-bstars">★★★★★</span></span><span class="wpv-bsub">${esc(wCount)} Google reviews · ${esc(wName)}</span></span></div>`;
    const wblock=(title,desc,preview,snip,key)=>`<div class="wblock">
        <div class="wb-head"><b>${title}</b><span class="muted small">${desc}</span><button class="cta-d ghost-d wbcopy" onclick="DoctorApp.copyEl('wsnip-${key}')">Copy code</button></div>
        <div class="wb-cols"><div class="wb-preview">${preview}</div><pre class="wsnip"><code id="wsnip-${key}">${esc(snip)}</code></pre></div>
      </div>`;
    const widgetsCard = scard('Embeddable widgets', 'Live previews themed to your brand. Customize, then copy the &lt;script&gt; to paste on any site — no dependencies.',
      `<label class="sfield"><span>Target URL (your patient flow)</span><input value="${esc(wTarget)}" onchange="DoctorApp.widgetField('target',this.value)"></label>
       <div class="srow"><label class="sfield"><span>Headline (inline card)</span><input value="${esc(wHead)}" onchange="DoctorApp.widgetField('headline',this.value)"></label><label class="sfield"><span>Button text</span><input value="${esc(wCta)}" onchange="DoctorApp.widgetField('cta',this.value)"></label></div>
       <div class="muted small" style="margin:2px 0 12px">Colors come from <b>Brand &amp; theme</b>; rating from <b>Reviews</b>.</div>
       ${wblock('Inline card','for service/blog pages',pvInline,snipInline,'i')}
       ${wblock('Floating button','sticks to the corner',pvFloat,snipFloat,'f')}
       ${wblock('Review badge','social proof anywhere',pvBadge,snipBadge,'b')}`);

    const sections=[
      ['profile','Practice & doctor','🦷',profile],
      ['brand','Brand & theme','🎨',brandCard],
      ['team','Team & permissions','👥',team],
      ['questions','Intake questions','❓',qs],
      ['reviews','Reviews & ratings','⭐',reviews],
      ['site','Landing page','🌐',sitecard],
      ['links','Link-in-bio','🔗',links],
      ['directory','Directory profile','📍',directoryCard],
      ['widgets','Embeddable widgets','🧩',widgetsCard],
      ['tracking','Tracking & attribution','📈',tracking],
      ['spend','Marketing spend','💸',spendCard]
    ];
    if(!sections.some(s=>s[0]===settingsSection)) settingsSection='profile';
    const active=sections.find(s=>s[0]===settingsSection);
    $('#settings').innerHTML=`<div class="setlayout">
      <nav class="setnav">${sections.map(([k,l,ic])=>`<button class="setnav-i ${k===settingsSection?'on':''}" onclick="DoctorApp.setSection('${k}')"><span class="ni">${ic}</span><span>${l}</span></button>`).join('')}</nav>
      <div class="setpane">${active[3]}</div>
    </div>`;
    if(settingsSection==='brand'){ loadBrandLogo(); wireBrandForm(); drawBrandPrev(); }
  }
  function setSection(k){ settingsSection=k; renderSettings(); }
  function share(path, label){
    const url=pubUrl(path);
    if(navigator.share){ navigator.share({title:label, url}).catch(()=>{}); return; }
    if(navigator.clipboard){ navigator.clipboard.writeText(url); }
    toast('Public link copied to clipboard');
  }

  /* settings mutations */
  function staffAdd(){ const c=cfg(); c.staff=(c.staff||[]).concat([{id:'u_'+Math.random().toString(36).slice(2,6),name:'New member',role:'Front desk',canRecord:false}]); Store.saveConfig(c); renderSettings(); refreshRolePick(); }
  function staffDel(i){ const c=cfg(); c.staff.splice(i,1); Store.saveConfig(c); renderSettings(); refreshRolePick(); }
  function staffRec(i,on){ const c=cfg(); c.staff[i].canRecord=on; Store.saveConfig(c); }
  function staffField(i,f,v){ const c=cfg(); c.staff[i][f]=v; Store.saveConfig(c); refreshRolePick(); }
  function qAdd(){ const c=cfg(); c.questions=(c.questions||[]).concat([{type:'text',label:'New question'}]); Store.saveConfig(c); renderSettings(); }
  function qDel(i){ const c=cfg(); c.questions.splice(i,1); Store.saveConfig(c); renderSettings(); }
  function qMove(i,d){ const c=cfg(); const j=i+d; if(j<0||j>=c.questions.length) return; const a=c.questions; [a[i],a[j]]=[a[j],a[i]]; Store.saveConfig(c); renderSettings(); }
  function qField(i,f,v){ const c=cfg(); if(f==='options'){ c.questions[i].options=v.split(',').map(s=>s.trim()).filter(Boolean); } else { c.questions[i][f]=v; } Store.saveConfig(c); if(f==='type') renderSettings(); }
  function linkAdd(){ const c=cfg(); c.links=(c.links||[]).concat([{id:'lk_'+Math.random().toString(36).slice(2,6),label:'New link',url:'https://',icon:'🔗'}]); Store.saveConfig(c); renderSettings(); }
  function linkDel(i){ const c=cfg(); c.links.splice(i,1); Store.saveConfig(c); renderSettings(); }
  function linkField(i,f,v){ const c=cfg(); c.links[i][f]=v; Store.saveConfig(c); }
  // marketing spend as custom line-items {label,channel,amount}; normalizes the legacy object form
  function spendList(){ const s=cfg().spendBySource; if(Array.isArray(s)) return s.map(x=>Object.assign({},x));
    return Object.keys(s||{}).map(k=>({label:k.charAt(0).toUpperCase()+k.slice(1), channel:k.charAt(0).toUpperCase()+k.slice(1), amount:+s[k]||0})); }
  function spendSave(list){ const c=cfg(); c.spendBySource=list; Store.saveConfig(c); }
  function spendAdd(){ const l=spendList(); l.push({label:'New campaign', channel:(Store.channelsInUse()[0]||'Google'), amount:0}); spendSave(l); renderSettings(); }
  function spendDel(i){ const l=spendList(); l.splice(i,1); spendSave(l); renderSettings(); }
  function spendField(i,f,v){ const l=spendList(); if(!l[i]) return; l[i][f]= f==='amount'? (+v||0) : v; spendSave(l); }
  function aliasField(k,v){ const c=cfg(); c.sourceAliases=c.sourceAliases||{}; c.sourceAliases[k]=v; Store.saveConfig(c); }
  function widgetField(k,v){ const c=cfg(); c.widgets=Object.assign({},c.widgets); c.widgets[k]=v; Store.saveConfig(c); renderSettings(); }
  function copyEl(id){ const el=document.getElementById(id); if(!el) return; const t=el.textContent;
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).catch(()=>{}); }
    else { const ta=document.createElement('textarea'); ta.value=t; document.body.appendChild(ta); ta.select(); try{document.execCommand('copy');}catch(e){} document.body.removeChild(ta); }
    toast('Embed code copied'); }
  function aliasDel(k){ const c=cfg(); if(c.sourceAliases) delete c.sourceAliases[k]; Store.saveConfig(c); renderSettings(); }
  function aliasAdd(){ const k=($('#aliasKey').value||'').trim().toLowerCase(), v=($('#aliasVal').value||'').trim(); if(!k||!v) return; const c=cfg(); c.sourceAliases=c.sourceAliases||{}; c.sourceAliases[k]=v; Store.saveConfig(c); renderSettings(); }

  /* ---------- DRAWER / CONSULT WORKSPACE ---------- */
  function openLead(id){ openLeadId=id; Store.setStatus && maybeMarkReview(id); renderDrawer(id); $('#drawer').classList.add('show'); $('#scrim').classList.add('show'); }
  function maybeMarkReview(id){ const l=Store.get(id); if(l && l.status==='new'){ Store.setStatus(id,'in_review'); } }
  function closeDrawer(){ openLeadId=null; $('#drawer').classList.remove('show'); $('#scrim').classList.remove('show'); }

  function renderDrawer(id){
    const l = Store.get(id); if(!l){ closeDrawer(); return; }
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
    const na = nextAction(l);   // single source of truth for stage + next action

    // CTA bar: ONE primary action (or a "waiting on patient" state), with
    // stage-appropriate secondaries demoted to quiet ghost buttons.
    const ctaHtml = na.primary
      ? `<button class="cta-d big-cta ${na.primary.cls||''}" onclick="${actCall(id,na.primary.fn)}">${na.primary.label}</button>`
        + na.secondaries.map(s=>`<button class="cta-d ghost-d" onclick="${actCall(id,s.fn)}">${s.label}</button>`).join('')
      : `<div class="cta-sent">${l.status==='booked'?'✓ Booked':'No automated action — see below'} <span class="statp" data-s="${l.status}">${l.statusLabel}</span></div>`
        + na.secondaries.map(s=>`<button class="cta-d ghost-d" onclick="${actCall(id,s.fn)}">${s.label}</button>`).join('');

    $('#drawer').innerHTML = `
      <div class="dr-head">
        <div class="ava">${ava}</div>
        <div class="t"><b>${esc(displayName(l))}</b><span>${esc(c.email||'no email yet')} ${c.phone?'· '+esc(c.phone):''}</span></div>
        <button class="x" onclick="DoctorApp.closeDrawer()">✕</button>
      </div>
      <div class="dr-cta ${na.waiting?'waiting':''}">
        ${ctaHtml}
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

        ${ l.sim && l.sim.enabled ? `<div class="card">
          <div class="ct">Smile simulation <span class="muted small" style="text-transform:none;letter-spacing:0;font-weight:600">tweak it before you record</span></div>
          <div class="drsim" id="drsim">
            <canvas id="drsimAfter" width="340" height="260"></canvas>
            <div class="drsim-bw" id="drsimBW"><canvas id="drsimBefore" width="340" height="260"></canvas></div>
            <span class="drlab b">Now</span><span class="drlab a">Preview</span>
            <div class="drsim-h" id="drsimH"><div class="g">⇄</div></div>
          </div>
          <div class="rng"><span>Whiteness</span><input type="range" min="0.55" max="1" step="0.01" value="${(l.sim.tweak||{}).white??0.9}" oninput="DoctorApp.simPreview('white',this.value)" onchange="DoctorApp.simTweak('${id}','white',this.value)"></div>
          <div class="rng"><span>Keep it natural</span><input type="range" min="0" max="1" step="0.05" value="${(l.sim.tweak||{}).natural??0.2}" oninput="DoctorApp.simPreview('natural',this.value)" onchange="DoctorApp.simTweak('${id}','natural',this.value)"></div>
          <div class="hint" style="font-size:11.5px;color:rgba(30,42,42,.5);margin-top:6px">If the automated preview looks off, adjust it here — it carries into the Consult Studio preview slide and the patient's portal.</div>
        </div>` : '' }

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
          <div class="ct">Next step</div>
          <!-- The ONE action for this stage, mirrored from the sticky CTA so the
               workspace reads coherently top-to-bottom. -->
          <div class="nextstep ${na.waiting?'waiting':''}">
            <div class="ns-text"><b>${na.waiting?'⏳ ':''}${esc(na.stage)}</b><span>${esc(na.hint)}</span></div>
            ${ na.primary
              ? `<button class="cta-d ${na.primary.cls||''}" onclick="${actCall(id,na.primary.fn)}">${na.primary.label}</button>`
              : '' }
          </div>
          ${ na.secondaries.length ? `<div class="btnrow ns-secondary">
            ${na.secondaries.map(s=>`<button class="ghost-d cta-d" onclick="${actCall(id,s.fn)}">${s.label}</button>`).join('')}
          </div>`:'' }
          ${ !c.email && !['booked'].includes(l.status) ? `<div class="muted small" style="margin-top:10px">No contact captured — abandoned before the ask. Retarget via the originating ad audience.</div>`:'' }

          <!-- DEMO controls: these FAKE patient behavior to walk the funnel.
               Set apart so they never read as a real workflow step. -->
          ${ (sent && l.status==='sent') || l.status==='viewed' ? `<div class="demobox">
            <span class="demolab">Demo</span>
            ${ sent && l.status==='sent' ? `<button class="demobtn" onclick="DoctorApp.simulate('${id}','viewed')">Simulate: patient viewed</button>`:'' }
            ${ l.status==='viewed' ? `<button class="demobtn" onclick="DoctorApp.simulate('${id}','booked')">Simulate: patient booked</button>`:'' }
          </div>`:'' }
          ${l.booking?`<div class="note" style="margin-top:12px">📅 ${esc(l.booking.apptTime||'Booked')}</div>`:''}
          ${ l.status==='booked' ? `<div class="paidbox">
            <label class="perm"><input type="checkbox" ${l.booking&&l.booking.attended?'checked':''} onchange="DoctorApp.markAttended('${id}',this.checked)"> attended consult</label>
            <label class="perm"><input type="checkbox" ${l.booking&&l.booking.paid?'checked':''} onchange="DoctorApp.markPaid('${id}',this.checked)"> converted — started treatment / paid</label>
            <label class="sfield" style="margin-top:6px"><span>Booked / converted value ($)</span><input type="number" value="${(l.booking&&l.booking.treatmentValue)||''}" onchange="DoctorApp.setTreatmentValue('${id}',this.value)" placeholder="e.g. 9500"></label>
            <label class="sfield"><span>Conversion notes</span><textarea onchange="DoctorApp.setConversionNotes('${id}',this.value)" placeholder="What did they book? Plan, deposit, financing terms, follow-up…">${esc((l.booking&&l.booking.conversionNotes)||'')}</textarea></label>
            <div class="hint" style="font-size:11px;color:rgba(30,42,42,.5)">Value feeds revenue, avg case value & ROAS on the Performance tab. <em>(Production: sync from your PMS.)</em></div>
          </div>`:'' }
        </div>

        <div class="card">
          <div class="ct">Assignment</div>
          <select class="assignsel" onchange="DoctorApp.assign('${id}', this.value)">
            <option value="">— Unassigned —</option>
            ${(cfg().staff||[]).map(u=>`<option value="${esc(u.name)}" ${l.assignedTo===u.name?'selected':''}>${esc(u.name)} · ${esc(u.role)}</option>`).join('')}
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
    if(l.sim && l.sim.enabled) initDrawerSim(l);
  }

  /* drawer smile-sim: before/after with reveal + live tweak ----------- */
  let drTweak = { white:0.9, natural:0.2 };
  function initDrawerSim(l){
    drTweak = Object.assign({ white:0.9, natural:0.2 }, l.sim.tweak||{});
    drawDrawerSmile($('#drsimBefore'), false);
    drawDrawerSmile($('#drsimAfter'), true);
    const bw=$('#drsimBW'); if(bw){ bw.style.width='50%'; } const h=$('#drsimH'); if(h) h.style.left='50%';
    const wrap=$('#drsim'); if(!wrap) return;
    const before=$('#drsimBefore'); if(before && wrap.clientWidth) before.style.width=wrap.clientWidth+'px'; // keep aligned while clipped
    let drag=false;
    const mv=x=>{ const r=wrap.getBoundingClientRect(); let p=Math.max(4,Math.min(96,(x-r.left)/r.width*100)); $('#drsimBW').style.width=p+'%'; $('#drsimH').style.left=p+'%'; };
    wrap.onmousedown=e=>{drag=true;mv(e.clientX);}; window.addEventListener('mousemove',e=>{if(drag)mv(e.clientX);}); window.addEventListener('mouseup',()=>drag=false);
    wrap.ontouchstart=e=>{drag=true;mv(e.touches[0].clientX);}; wrap.ontouchmove=e=>{if(drag)mv(e.touches[0].clientX);}; window.addEventListener('touchend',()=>drag=false);
  }
  function drawDrawerSmile(cv, after){ if(!cv) return; const c=cv.getContext('2d'),W=cv.width,H=cv.height; c.clearRect(0,0,W,H);
    const sk=c.createLinearGradient(0,0,0,H); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78'); c.fillStyle=sk; c.fillRect(0,0,W,H);
    const cx=W/2,cy=H*0.52,mw=W*0.6,mh=mw*0.42;
    c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+13,mh/2+13,0,0,7); c.fill();
    c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,7); c.fill();
    c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.05,mw/2-5,mh/2-3,0,0,7); c.clip();
    const col = after ? lerpHex('#E2D4AE','#FFFFFF', drTweak.white) : '#E2D4AE';
    const n=8,gap=3,tw=(mw-12)/n,x0=cx-(mw-12)/2,ty=cy-mh/2+3;
    for(let i=0;i<n;i++){let px=x0+i*tw,ph=mh-12,py=ty;c.fillStyle=col;
      if(!after){ if(i===3)py+=6; if(i===4)px+=4; }
      else { if(drTweak.natural>0.5&&i===4)px+=2*drTweak.natural; if(drTweak.natural>0.3&&i===3)py+=4*drTweak.natural; }
      c.fillRect(px,py,tw-gap,ph);} c.restore();
  }
  function simPreview(prop,v){ drTweak[prop]=+v; drawDrawerSmile($('#drsimAfter'), true); }
  function simTweak(id,prop,v){ Store.saveSimTweak(id,{[prop]:+v}); }
  function markAttended(id,on){ const l=Store.get(id); Store.patch(id,{booking:Object.assign({},l.booking,{attended:on})}); }
  function markPaid(id,on){ const l=Store.get(id); Store.patch(id,{booking:Object.assign({},l.booking,{paid:on})}); }
  function setTreatmentValue(id,v){ const l=Store.get(id); Store.patch(id,{booking:Object.assign({},l.booking,{treatmentValue:+v||0})}); }
  function setConversionNotes(id,v){ const l=Store.get(id); Store.patch(id,{booking:Object.assign({},l.booking,{conversionNotes:v})}); }
  // manual status override; ensure a booking object exists when moved to booked
  function setStatusManual(id,status){ const extra = (status==='booked') ? { booking: Object.assign({ bookedAt:new Date().toISOString(), apptTime:'Manually marked booked' }, (Store.get(id)||{}).booking) } : {}; Store.setStatus(id,status,extra); toast('Status set to '+(Store.STATUS[status]||{}).label); }

  function statusFlowHtml(l){
    const steps=[['new','New'],['in_review','In review'],['recorded','Recorded'],['sent','Sent'],['viewed','Viewed'],['booked','Booked']];
    const order=Store.STATUS[l.status]?Store.STATUS[l.status].order:0;
    const na=nextAction(l);
    // headline: where this lead IS + the one-line "what's next / waiting on".
    const banner=`<div class="stagebanner ${na.waiting?'waiting':''}">
        <div class="sb-stage">${na.waiting?'⏳ ':''}${esc(na.stage)}</div>
        <div class="sb-hint">${esc(na.hint)}</div>
      </div>`;
    return `<div class="card"><div class="ct">Current stage</div>
      ${banner}
      <div class="statusflow">`+
      steps.map(([k,lbl],i)=>{
        const o=Store.STATUS[k].order;
        const cls = l.status===k?'cur':(o<order?'done':'');
        return `<span class="stp ${cls}">${lbl}</span>${i<steps.length-1?'<span class="arr">→</span>':''}`;
      }).join('')+`</div>
      <div class="statusset">
        <span>Override stage</span>
        <select class="assignsel" onchange="DoctorApp.setStatusManual('${l.id}',this.value)">
          ${Object.keys(Store.STATUS).map(k=>`<option value="${k}" ${l.status===k?'selected':''}>${Store.STATUS[k].label}</option>`).join('')}
        </select>
      </div></div>`;
  }

  /* ---------- workspace actions ---------- */
  function assign(id,who){ Store.assign(id, who||null); }
  function toggleTag(id,t){ Store.toggleTag(id,t); }
  function addNote(id){
    const inp=$('#noteInput'); const v=inp.value.trim(); if(!v) return;
    Store.addNote(id, v, role); inp.value='';
  }
  function copyScript(id){
    const l=Store.get(id); const s=ScriptGen.generate(l,cfg()).plain;
    navigator.clipboard && navigator.clipboard.writeText(s);
    toast('Script copied to clipboard');
  }
  function sendVideo(id){
    Store.setStatus(id,'sent');
    toast('Video consult sent — patient notified by text + email');
  }
  function simulate(id,to){ Store.setStatus(id,to); toast(to==='booked'?'🎉 Patient booked a visit':'Patient viewed the video'); }
  function nudge(id,kind){
    const map={sent:'Watch-reminder sent (“your video is waiting”).',viewed:'Booking nudge sent (limited-time new-patient offer).',recover:'Recovery nudge sent (“finish your free preview”).'};
    Store.addNote(id, 'Automated follow-up: '+map[kind], 'System');
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
    studio.id=id; studio.lead=Store.get(id); studio.idx=0; studio.pip=0; studio.tele=true;
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
      sim: Object.assign({ white:0.9, natural:0.2 }, l.sim.tweak||{}) });   // shares the doctor's tweak from the drawer
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
  function editSim(prop,val){ const s=studio.slides[studio.idx]; if(!s) return; if(!s.sim) s.sim={white:0.9,natural:0.2}; s.sim[prop]=+val; if(studio.id) Store.saveSimTweak(studio.id,{[prop]:+val}); }
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
    library = SEED_CASES().concat(Store.cases().map(c=>Object.assign({persisted:true}, c)));
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
      const cx=el.querySelector('.cx'); if(cx) cx.onclick=(e)=>{ e.stopPropagation(); Store.removeCase(cs.id); buildLibrary(); renderCaseLib(); toast('Removed from library'); };
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
      Store.addCase({label:f.name.replace(/\.[^.]+$/,'').slice(0,26), tags:'uploaded', before:thumb, single:true});
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
  // the brand form body (shared by the modal AND the Settings > Brand & theme section)
  function brandBodyHtml(){
    const B=brand();
    return `<label class="logo-drop" for="logoUp"><div class="lp" id="logoPrev">${B.logo?`<img src="${B.logo}">`:'<span style="font-size:22px">🦷</span>'}</div>
        <div><b style="font-size:13.5px">Practice logo</b><div class="hint">PNG/SVG with transparency works best. Shown on slides, landing page & bio.</div></div>
        <input type="file" id="logoUp" accept="image/*" hidden></label>
      <label class="logo-drop" for="docUp"><div class="lp" id="docPrev" style="border-radius:50%">${(cfg().doctor||{}).photo?`<img src="${cfg().doctor.photo}">`:'<span style="font-size:22px">👤</span>'}</div>
        <div><b style="font-size:13.5px">Doctor profile photo</b><div class="hint">Shown (with an audio pulse) when the camera is off in the studio.</div></div>
        <input type="file" id="docUp" accept="image/*" hidden></label>
      <div class="swatchrow">
        <div class="swatch"><label>Primary color</label><input type="color" id="cPrimary" value="${B.primary}"></div>
        <div class="swatch"><label>Accent color</label><input type="color" id="cAccent" value="${B.accent}"></div>
      </div>
      <div class="fld"><label>Practice name</label><input type="text" id="bName" value="${esc(B.name)}"></div>
      <div class="brand-prev"><canvas id="brandPrev" width="420" height="236"></canvas></div>`;
  }
  function brandFormHtml(){
    return `<h3 style="font-family:var(--display);font-weight:500;font-size:22px;color:var(--teal-deep);margin-bottom:4px">Brand &amp; theme</h3>
      <p class="muted small" style="margin-bottom:18px">Set once — applies to consult slides, landing page, widgets & bio.</p>`
      + brandBodyHtml()
      + `<button class="cta-d" style="width:100%;justify-content:center;margin-top:14px" onclick="DoctorApp.closeBrand()">Done</button>`;
  }
  // wire the brand inputs (works wherever the form is rendered — modal or settings)
  function wireBrandForm(){
    const p=$('#cPrimary'); if(!p) return;
    p.oninput=e=>{ Store.saveBrand({primary:e.target.value}); drawBrandPrev(); };
    $('#cAccent').oninput=e=>{ Store.saveBrand({accent:e.target.value}); drawBrandPrev(); };
    $('#bName').oninput=e=>{ Store.saveBrand({name:e.target.value}); drawBrandPrev(); };
    $('#logoUp').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const img=await loadImg(await fileToDataUrl(f)); if(!img) return;
      const logo=downscalePng(img,240); Store.saveBrand({logo}); $('#logoPrev').innerHTML=`<img src="${logo}">`; loadBrandLogo(); drawBrandPrev(); };
    $('#docUp').onchange=async e=>{ const f=e.target.files[0]; if(!f) return; const img=await loadImg(await fileToDataUrl(f)); if(!img) return;
      const photo=downscale(img,300); const c=cfg(); c.doctor=Object.assign({},c.doctor,{photo}); Store.saveConfig(c); $('#docPrev').innerHTML=`<img src="${photo}">`; loadDocPhoto(); };
  }
  function openBrand(){ loadBrandLogo(); $('#brandForm').innerHTML=brandFormHtml(); wireBrandForm(); $('#brandModal').classList.add('show'); drawBrandPrev(); }
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
    Store.saveVideo(studio.id,{durationSec:rec?rec.dur:0, hasRecording:true, slides:studio.slides.length, orient:studio.orient});
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
    const l=Store.get(id); const c=l.contact||{};
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
  function bookFromEmail(id){ Store.setStatus(id,'booked',{booking:{bookedAt:new Date().toISOString(),apptTime:'Self-booked from video — next available'}}); closeEmail(); toast('🎉 Patient self-booked from the video page'); }
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
    setOrient, addTextSlide, tab, filterCases, moveSlide, edit, editSim, openBrand, closeBrand,
    cfg: cfgSet, staffAdd, staffDel, staffRec, staffField, qAdd, qDel, qMove, qField, linkAdd, linkDel, linkField,
    aliasField, aliasDel, aliasAdd, setSection, share, spendAdd, spendDel, spendField, widgetField, copyEl,
    simPreview, simTweak, markAttended, markPaid, setTreatmentValue, setConversionNotes, setStatusManual, setPerfRange, setPerfTab };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
