/* =============================================================================
   Aesthetic Virtual — Med Spa AI Plan Builder (console)
   The scalable alternative to recorded video: an AI treatment plan, drafted from
   the patient's concerns, that the provider edits + approves in one tap, then
   sends as the patient's closing artifact (book + membership).
   ============================================================================= */
(function (global) {
  'use strict';
  const S = global.MedSpaStore;
  const $ = id => document.getElementById(id);
  const cfg = () => S.config();
  let openId=null, activeView='queue', activeFilter='review';
  const esc = s => String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
  const m = n => '$'+(n||0).toLocaleString();
  const ta = iso => { const h=(Date.now()-new Date(iso).getTime())/36e5; return h<1?Math.max(1,Math.round(h*60))+'m ago':h<24?Math.round(h)+'h ago':Math.round(h/24)+'d ago'; };
  const nm = l => (l.contact&&l.contact.firstName)||'Anonymous lead';
  const inits = l => { const n=(l.contact&&l.contact.firstName)||''; return n?n.slice(0,2).toUpperCase():'··'; };
  const concerns = l => (l.concerns||[]).map(id=>S.concernById(id)).filter(Boolean);
  function toast(t){ let e=$('toast'); if(!e){e=document.createElement('div');e.id='toast';document.body.appendChild(e);} e.textContent=t; e.style.opacity='1'; clearTimeout(e._h); e._h=setTimeout(()=>e.style.opacity='0',2400); }

  function boot(){
    S.ensureSeeded();
    $('resetDemo').addEventListener('click',()=>{ if(confirm('Reset med-spa demo leads?')){ S.reset(); render(); } });
    document.querySelectorAll('.navbtn').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
    document.querySelectorAll('.chipf').forEach(b=>b.addEventListener('click',()=>{ activeFilter=b.dataset.filter; document.querySelectorAll('.chipf').forEach(x=>x.classList.toggle('active',x===b)); renderQueue(); }));
    $('scrim').addEventListener('click', closeDrawer);
    $('planModal').addEventListener('click', e=>{ if(e.target.id==='planModal') closePlan(); });
    S.onChange(render); render();
  }
  function setView(v){ activeView=v; document.querySelectorAll('.navbtn').forEach(b=>b.classList.toggle('active',b.dataset.view===v)); $('view-queue').hidden=v!=='queue'; $('view-perf').hidden=v!=='perf'; render(); }
  function render(){ if(activeView==='queue') renderQueue(); else renderPerf(); if(openId) renderDrawer(openId); }

  /* ---- queue ---- */
  const ORDER={new:0,plan_ready:0,sent:1,booked:2};
  function passes(l){ if(activeFilter==='review') return ['new','plan_ready'].includes(l.status); if(activeFilter==='sent') return l.status==='sent'; if(activeFilter==='booked') return l.status==='booked'; return true; }
  function renderQueue(){
    let leads=S.all().filter(l=>l.furthestStep!=='welcome').filter(passes);
    leads.sort((a,b)=>{ if(ORDER[a.status]!==ORDER[b.status]) return ORDER[a.status]-ORDER[b.status]; return S.planValue(b)-S.planValue(a); });
    const review=S.all().filter(l=>['new','plan_ready'].includes(l.status)).length;
    const auto=cfg().autoApproveUnder;
    $('queueNote').innerHTML=`${review} plans awaiting review · plans under ${m(auto)} can auto-send`;
    $('leadList').innerHTML = leads.length ? leads.map(l=>{
      const cs=concerns(l), v=S.planValue(l);
      return `<div class="lead" onclick="MS.open('${l.id}')">
        <div class="ava">${inits(l)}</div>
        <div class="main"><div class="name">${esc(nm(l))}</div>
          <div class="tags">${cs.map(c=>`<span class="ctag">${c.icon} ${c.label}</span>`).join('')||'<span class="ctag">—</span>'}</div>
          <div class="meta-row"><span class="srcb">${esc((l.source&&l.source.utm_source)||'direct')}</span>${l.intake&&l.intake.timeline?`<span>⏱ ${esc(l.intake.timeline)}</span>`:''}<span>${ta(l.createdAt)}</span>${v&&v<auto&&['new','plan_ready'].includes(l.status)?'<span class="auto">auto-sendable</span>':''}</div>
        </div>
        <div class="right"><span class="val">${m(v)}</span><span class="statp" data-s="${l.status}">${l.status.replace('_',' ')}</span></div>
      </div>`;
    }).join('') : '<div class="empty">No plans in this view.</div>';
  }

  /* ---- drawer + plan editor ---- */
  function open(id){ openId=id; renderDrawer(id); $('drawer').classList.add('show'); $('scrim').classList.add('show'); }
  function closeDrawer(){ openId=null; $('drawer').classList.remove('show'); $('scrim').classList.remove('show'); }
  function renderDrawer(id){
    const l=S.get(id); if(!l){ closeDrawer(); return; } const c=l.contact||{}, i=l.intake||{}, cs=concerns(l), plan=l.plan||S.recommend(l.concerns), C=cfg();
    const sent=['sent','booked'].includes(l.status), booked=l.status==='booked';
    const cta = booked ? `<div class="cta-sent">🎉 Booked${l.booking&&l.booking.membership?' + member':''}</div><button class="cta-d ghost-d" onclick="MS.preview('${id}')">View plan</button>`
      : sent ? `<div class="cta-sent">✓ Plan sent ${l.video?'':''}</div><button class="cta-d ghost-d" onclick="MS.preview('${id}')">Preview plan page</button><button class="cta-d ghost-d" onclick="MS.simulate('${id}')">Simulate: booked</button>`
      : `<button class="cta-d big-cta" onclick="MS.approve('${id}')">✓ Approve &amp; send plan</button><button class="cta-d ghost-d" onclick="MS.preview('${id}')">Preview</button>`;
    const tx=S.TREATMENTS;
    $('drawer').innerHTML=`
      <div class="dr-head"><div class="ava">${inits(l)}</div><div class="t"><b>${esc(nm(l))}</b><span>${esc(c.email||'no email')} ${c.phone?'· '+esc(c.phone):''}</span></div><button class="x" onclick="MS.closeDrawer()">✕</button></div>
      <div class="dr-cta">${cta}</div>
      <div class="dr-body">
        <div class="card"><div class="ct">Concerns &amp; intake</div>
          <div class="chiprow">${cs.map(c=>`<span class="ctag">${c.icon} ${c.label}</span>`).join('')||'—'}</div>
          ${l.goalText?`<div class="kv" style="margin-top:10px"><div class="row"><div class="k">In their words</div><div class="v quote">“${esc(l.goalText)}”</div></div></div>`:''}
          <div class="kv" style="margin-top:10px"><div class="row"><div class="k">Timeline</div><div class="v">${esc(i.timeline||'—')}</div></div></div>
          <div class="photos" style="margin-top:10px">${[0,1].map(n=>{const p=l.photos&&l.photos[n];return `<div class="p">${p&&p.indexOf('data:')===0?`<img src="${p}">`:'📷'}</div>`;}).join('')}</div>
        </div>

        <div class="card"><div class="ct"><span>AI treatment plan <span style="color:var(--gold)">✨ drafted from concerns</span></span><button class="cta-d ghost-d" style="padding:6px 10px;font-size:12px" onclick="MS.regenerate('${id}')">↻ Regenerate</button></div>
          <div class="plan">
            <div class="plan-row head"><span>Treatment</span><span style="text-align:right">Qty</span><span style="text-align:right">Unit $</span><span style="text-align:right">Total</span><span></span></div>
            ${plan.lines.map(ln=>`<div class="plan-row">
              <div class="tname">${esc(ln.label)}<span>per ${esc(ln.unit)}</span></div>
              <input type="number" value="${ln.qty}" onchange="MS.qty('${id}','${ln.id}',this.value)">
              <input type="number" value="${ln.price}" onchange="MS.price('${id}','${ln.id}',this.value)">
              <span class="lt">${m(ln.total)}</span>
              <button class="xb" onclick="MS.remove('${id}','${ln.id}')">✕</button></div>`).join('')||'<div class="muted small" style="padding:10px 0">No treatments — add one below.</div>'}
          </div>
          <div class="plan-add"><select id="addTx"><option value="">+ Add a treatment…</option>${Object.keys(tx).filter(t=>!plan.lines.some(ln=>ln.id===t)).map(t=>`<option value="${t}">${esc(tx[t].label)} ($${tx[t].price}/${tx[t].unit})</option>`).join('')}</select><button class="cta-d ghost-d" onclick="MS.add('${id}')">Add</button></div>
          <div class="opts">
            <label class="toggle"><input type="checkbox" ${plan.membership?'checked':''} onchange="MS.membership('${id}',this.checked)"> Offer ${esc(C.membership.name)} (${m(C.membership.priceMo)}/mo)</label>
            <span class="dnum">Bundle discount <input type="number" value="${plan.discountPct||0}" onchange="MS.discount('${id}',this.value)">%</span>
          </div>
          <div class="plan-tot">
            <div class="pl"><span>Subtotal</span><span>${m(plan.subtotal)}</span></div>
            ${plan.discount?`<div class="pl disc"><span>Bundle savings (${plan.discountPct}%)</span><span>−${m(plan.discount)}</span></div>`:''}
            <div class="pl big"><span>Plan total</span><span>${m(plan.total)}</span></div>
            <div class="pl"><span>Financing from</span><span>${m(plan.financingMo)}/mo</span></div>
          </div>
        </div>

        ${booked?`<div class="card"><div class="ct">Conversion</div>
          <div class="paidbox"><div class="toggle">📅 ${esc((l.booking&&l.booking.note)||'Booked')}</div>
            <label class="toggle"><input type="checkbox" ${l.booking&&l.booking.membership?'checked':''} onchange="MS.member('${id}',this.checked)"> joined ${esc(C.membership.name)}</label>
            <label class="sfield"><span>Booked value ($)</span><input type="number" value="${(l.booking&&l.booking.value)||''}" onchange="MS.value('${id}',this.value)"></label></div></div>`:''}
      </div>`;
  }
  /* plan edits — mutate the lead's plan, finalize + persist (re-renders) */
  function withPlan(id, fn){ const l=S.get(id); const p=l.plan||S.recommend(l.concerns); fn(p); S.savePlan(id,p); }
  function qty(id,tid,v){ withPlan(id,p=>{ const ln=p.lines.find(x=>x.id===tid); if(ln) ln.qty=+v||0; }); }
  function price(id,tid,v){ withPlan(id,p=>{ const ln=p.lines.find(x=>x.id===tid); if(ln) ln.price=+v||0; }); }
  function remove(id,tid){ withPlan(id,p=>{ p.lines=p.lines.filter(x=>x.id!==tid); }); }
  function add(id){ const sel=$('addTx'), tid=sel&&sel.value; if(!tid) return; const t=S.TREATMENTS[tid]; withPlan(id,p=>{ if(!p.lines.some(x=>x.id===tid)) p.lines.push({id:tid,label:t.label,unit:t.unit,qty:1,price:t.price,total:t.price}); }); }
  function discount(id,v){ withPlan(id,p=>{ p.discountPct=Math.max(0,Math.min(50,+v||0)); }); }
  function membership(id,on){ withPlan(id,p=>{ p.membership=on; }); }
  function regenerate(id){ const l=S.get(id); S.patch(id,{plan:S.recommend(l.concerns), _edited:false}); toast('Plan re-drafted from concerns'); }
  function approve(id){ S.patch(id,{status:'sent'}); toast('Plan approved & sent to the patient'); }
  function simulate(id){ const l=S.get(id); S.patch(id,{status:'booked', booking:{bookedAt:new Date().toISOString(), value:S.planValue(l), membership:!!(l.plan&&l.plan.membership), note:'Booked from plan page'}}); toast('🎉 Patient booked'); }
  function member(id,on){ const l=S.get(id); S.patch(id,{booking:Object.assign({},l.booking,{membership:on})}); }
  function value(id,v){ const l=S.get(id); S.patch(id,{booking:Object.assign({},l.booking,{value:+v||0})}); }

  /* ---- patient plan page ---- */
  function preview(id){ const l=S.get(id),c=l.contact||{},plan=l.plan||S.recommend(l.concerns),C=cfg();
    $('planCard').innerHTML=`<button class="modal-x" onclick="MS.closePlan()">✕</button>
      <div class="pp-top"><div class="eb">Your personalized plan</div><h3>Hi ${esc(c.firstName||'there')} — here's your plan</h3><div class="sub">Built for you by ${esc(C.spa.name)} · ${esc(C.spa.booker)}</div></div>
      <div class="pp-body">
        ${plan.lines.map(ln=>`<div class="pp-line"><span>${esc(ln.label)} <span class="q">× ${ln.qty} ${esc(ln.unit)}</span></span><b>${m(ln.total)}</b></div>`).join('')}
        ${plan.discount?`<div class="pp-disc"><span>Bundle savings</span><span>−${m(plan.discount)}</span></div>`:''}
        <div class="pp-tot"><span>Your plan</span><span>${m(plan.total)}</span></div>
        ${plan.membership?`<div class="pp-mem"><b>✨ ${esc(C.membership.name)} — ${m(C.membership.priceMo)}/mo</b><ul>${C.membership.perks.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><label><input type="checkbox" id="ppMem" checked> Add membership &amp; save 15% today</label></div>`:''}
        <div class="finrow">${(C.financing.partners||[]).map(p=>`<span class="f">💳 ${esc(p)}</span>`).join('')}<span class="f">from ${m(plan.financingMo)}/mo</span></div>
        <button class="book-cta" onclick="MS.book('${id}')">📅 Book &amp; reserve my plan</button>
        <div class="fineprint">Illustrative pricing. Final plan confirmed at your visit with ${esc(C.spa.name)}.</div>
      </div>`;
    $('planModal').classList.add('show');
  }
  function book(id){ const l=S.get(id),mem=$('ppMem')?$('ppMem').checked:false; S.patch(id,{status:'booked', booking:{bookedAt:new Date().toISOString(), value:S.planValue(l), membership:mem, note:'Self-booked from plan page'}}); closePlan(); toast(mem?'🎉 Booked + joined membership':'🎉 Patient booked'); }
  function closePlan(){ $('planModal').classList.remove('show'); }

  /* ---- performance ---- */
  function renderPerf(){
    const a=S.analytics(), f0=a.funnel[0].count||1;
    const kpis=[['📋',a.funnel[1].count,'Plans drafted'],['📤',a.funnel[2].count,'Plans sent'],['📅',a.funnel[3].count,'Booked'],['💳',a.memberRate+'%','Membership attach'],['⚡',a.autoRate+'%','Auto-sendable'],['💰',m(a.revenue),'Revenue']];
    let html=`<div class="metrics">`+kpis.map(([ic,v,l])=>`<div class="metric"><div class="mi">${ic}</div><div class="big">${v}</div><div class="lbl">${l}</div></div>`).join('')+`</div>`;
    html+=`<div class="panel"><h3>Plan funnel</h3><p class="muted small">Volume model — no video; providers approve AI plans in seconds.</p><div class="funnelchart">`+
      a.funnel.map(s=>`<div class="frow"><div class="flabel">${esc(s.label)}</div><div class="ftrack"><div class="ffill" style="width:${Math.max(Math.round(s.count/f0*100),4)}%"><span>${s.count}</span></div></div><div class="fpct">${s.pct}%</div></div>`).join('')+`</div>`;
    html+=`<p class="muted small" style="margin-top:14px">Open pipeline value <b style="color:var(--plum-deep)">${m(a.pipeline)}</b> · avg booked plan <b style="color:var(--plum-deep)">${m(a.avg)}</b> · ${a.members} members joined. The win is volume × membership attach at ~zero provider time.</p></div>`;
    $('perf').innerHTML=html;
  }

  global.MS={ open, closeDrawer, qty, price, remove, add, discount, membership, regenerate, approve, simulate, member, value, preview, book, closePlan, setView };
  document.addEventListener('DOMContentLoaded', boot);
})(window);
