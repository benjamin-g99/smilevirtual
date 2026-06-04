/* =============================================================================
   MedSpaStore — data layer + AI plan engine for Aesthetic Virtual (med spa)
   -----------------------------------------------------------------------------
   The med-spa model replaces the recorded video with an INSTANT AI TREATMENT PLAN
   the provider approves in one tap (scalable for high volume / lower value).
   `recommend(concerns)` is the deterministic demo seam for a Claude call.
   Own localStorage namespace.
   ============================================================================= */
(function (global) {
  'use strict';
  const KEY='medspa.leads.v1', CFG='medspa.config.v1', SEEDED='medspa.seeded.v1';
  const uid=()=>'ms_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  const now=()=>new Date().toISOString();
  const read=()=>{ try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]} };
  const write=(l)=>{ try{localStorage.setItem(KEY,JSON.stringify(l))}catch(e){} notify(); };
  const listeners=new Set(); function notify(){ listeners.forEach(f=>{try{f()}catch(e){}}); }
  global.addEventListener&&global.addEventListener('storage',e=>{ if(e.key===KEY) notify(); });

  /* ---- concerns (what bothers you) ---- */
  const CONCERNS=[
    {id:'lines', label:'Fine lines & wrinkles', icon:'〰️'},
    {id:'volume', label:'Lost volume / hollows', icon:'🎈'},
    {id:'lips', label:'Lip enhancement', icon:'💋'},
    {id:'texture', label:'Texture & large pores', icon:'✨'},
    {id:'acne', label:'Acne & scarring', icon:'🔬'},
    {id:'pigment', label:'Sun damage & pigment', icon:'☀️'},
    {id:'redness', label:'Redness & rosacea', icon:'🌹'},
    {id:'hair', label:'Unwanted hair', icon:'⚡'},
    {id:'chin', label:'Double chin / contour', icon:'💧'}
  ];
  /* ---- treatments catalog (illustrative pricing — demo) ---- */
  const TREATMENTS={
    tox:        {label:'Wrinkle relaxer (tox)', unit:'units',    price:12},
    filler:     {label:'Dermal filler',         unit:'syringes', price:750},
    lipfiller:  {label:'Lip filler',            unit:'syringes', price:700},
    microneedling:{label:'Microneedling (RF)',  unit:'sessions', price:500},
    peel:       {label:'Chemical peel',         unit:'sessions', price:200},
    ipl:        {label:'IPL photofacial',       unit:'sessions', price:400},
    laser:      {label:'Laser resurfacing',     unit:'sessions', price:900},
    hydrafacial:{label:'HydraFacial',           unit:'sessions', price:250},
    kybella:    {label:'Kybella',               unit:'vials',    price:600},
    lhr:        {label:'Laser hair removal (6-pk)', unit:'package', price:900},
    skincare:   {label:'Medical-grade skincare',unit:'set',      price:300}
  };
  /* ---- the recommendation map: concern → treatments + default quantities ---- */
  const RX={
    lines:[['tox',30]],
    volume:[['filler',2]],
    lips:[['lipfiller',1]],
    texture:[['microneedling',3],['skincare',1]],
    acne:[['microneedling',3],['peel',2],['skincare',1]],
    pigment:[['ipl',3],['skincare',1]],
    redness:[['ipl',3]],
    hair:[['lhr',1]],
    chin:[['kybella',2]]
  };

  /* AI plan from concerns: merge treatments, qty, package discount, membership, financing */
  function recommend(concerns){
    const merged={};
    (concerns||[]).forEach(c=>(RX[c]||[]).forEach(([id,qty])=>{ merged[id]=Math.max(merged[id]||0, qty); }));
    const lines=Object.keys(merged).map(id=>{ const t=TREATMENTS[id]; return { id, label:t.label, unit:t.unit, qty:merged[id], price:t.price, total:merged[id]*t.price }; });
    return finalizePlan({ lines, discountPct: lines.length>=2?10:0, membership:true });
  }
  function finalizePlan(p){
    p.lines=(p.lines||[]).map(l=>Object.assign({}, l, { total:(+l.qty||0)*(+l.price||0) }));
    const subtotal=p.lines.reduce((s,l)=>s+l.total,0);
    const discount=Math.round(subtotal*((+p.discountPct||0)/100));
    const total=subtotal-discount;
    return Object.assign({}, p, { subtotal, discount, total, financingMo:total?Math.max(49,Math.round(total/12)):0 });
  }

  const DEFAULT_CONFIG={
    spa:{ name:'Lumière Aesthetics', tagline:'Look like you, refreshed.', rating:4.9, reviews:1320, city:'Newport Beach', state:'CA', phone:'(949) 555-0140', booker:'Maya · Patient Coordinator' },
    brand:{ primary:'#7A3E55', accent:'#D98E86' },
    membership:{ name:'Glow membership', priceMo:99, perks:['Monthly facial or 10 units of tox','15% off all treatments & products','Priority booking'] },
    financing:{ partners:['Cherry','PatientFi'] },
    autoApproveUnder:600,    // plans under this auto-send; bigger ones get a human glance
    concerns:CONCERNS, treatments:TREATMENTS
  };

  const MedSpaStore={
    CONCERNS, TREATMENTS, recommend, finalizePlan,
    concernById:(id)=>CONCERNS.find(c=>c.id===id),
    config(){ try{ const c=JSON.parse(localStorage.getItem(CFG)); return c?Object.assign({},DEFAULT_CONFIG,c):DEFAULT_CONFIG; }catch(e){ return DEFAULT_CONFIG; } },
    saveConfig(c){ localStorage.setItem(CFG,JSON.stringify(c)); notify(); },
    onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); },
    all(){ return read().slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); },
    get(id){ return read().find(x=>x.id===id)||null; },

    /* upsert at each step; auto-draft a plan from concerns when first created/changed */
    upsert(partial){
      const leads=read(); let lead=partial.id?leads.find(l=>l.id===partial.id):null;
      if(!lead){ lead={ id:partial.id||uid(), createdAt:now(), vertical:'medspa', status:'new', furthestStep:'welcome',
        concerns:[], goalText:'', photos:[], intake:{}, contact:{}, source:{}, plan:null, booking:null }; leads.push(lead); }
      ['concerns','goalText','photos','furthestStep'].forEach(k=>{ if(partial[k]!==undefined) lead[k]=partial[k]; });
      if(partial.intake) lead.intake=Object.assign({},lead.intake,partial.intake);
      if(partial.contact) lead.contact=Object.assign({},lead.contact,partial.contact);
      if(partial.source&&Object.keys(partial.source).length) lead.source=partial.source;
      // (re)draft the AI plan from concerns unless a provider has already edited/sent one
      if(partial.concerns!==undefined && !lead._edited){ lead.plan=recommend(lead.concerns); if(lead.status==='new') lead.status='plan_ready'; }
      lead.updatedAt=now(); write(leads); return lead.id;
    },
    patch(id,fields){ const leads=read(); const l=leads.find(x=>x.id===id); if(!l)return null; Object.assign(l,fields,{updatedAt:now()}); write(leads); return l; },
    savePlan(id,plan){ return this.patch(id,{ plan:finalizePlan(plan), _edited:true }); },
    planValue(l){ return (l.plan&&l.plan.total)||0; },

    /* analytics */
    analytics(){
      const all=this.all(); const spa=this.config();
      const sent=all.filter(l=>['sent','booked'].includes(l.status)).length;
      const booked=all.filter(l=>l.status==='booked').length;
      const members=all.filter(l=>l.booking&&l.booking.membership).length;
      const revenue=all.filter(l=>l.booking).reduce((s,l)=>s+(l.booking.value||0),0);
      const pipeline=all.filter(l=>l.status!=='booked').reduce((s,l)=>s+this.planValue(l),0);
      const F=[['started','Leads',all.length],['plan','Plan ready',all.filter(l=>l.plan).length],['sent','Plan sent',sent],['booked','Booked',booked]]
        .map((r,i,a)=>({label:r[1],count:r[2],pct:a[0][2]?Math.round(r[2]/a[0][2]*100):0}));
      return { funnel:F, revenue, pipeline, members, avg:booked?Math.round(revenue/booked):0,
        memberRate: booked?Math.round(members/booked*100):0, autoRate: all.length?Math.round(all.filter(l=>this.planValue(l)<spa.autoApproveUnder).length/all.length*100):0 };
    },

    reset(){ [KEY,SEEDED].forEach(k=>localStorage.removeItem(k)); this.seed(); notify(); },
    seed(force){ if(!force&&localStorage.getItem(SEEDED)) return; localStorage.setItem(KEY,JSON.stringify(SEED())); localStorage.setItem(SEEDED,'1'); notify(); },
    ensureSeeded(){ if(!localStorage.getItem(SEEDED)) this.seed(); }
  };

  function hoursAgo(h){ return new Date(Date.now()-h*36e5).toISOString(); }
  function mk(o){ const l=Object.assign({id:uid(), vertical:'medspa', createdAt:hoursAgo(o.h||2), furthestStep:'complete', goalText:'', photos:['demo:1'], intake:{}, source:{}, booking:null}, o); delete l.h;
    if(!l.plan) l.plan=recommend(l.concerns); return l; }
  function SEED(){
    return [
      mk({h:1, status:'plan_ready', concerns:['lines','volume'], intake:{timeline:'This month'}, contact:{firstName:'Ava', email:'ava@email.com', phone:'(949) 555-0101'}, source:{utm_source:'instagram'}}),
      mk({h:5, status:'plan_ready', concerns:['lips'], intake:{timeline:'ASAP'}, contact:{firstName:'Bella', email:'bella@email.com'}, source:{utm_source:'tiktok'}}),
      mk({h:9, status:'sent', concerns:['acne','texture'], goalText:'Breakouts and some scarring on my cheeks.', intake:{timeline:'Flexible'}, contact:{firstName:'Chloe', email:'chloe@email.com', phone:'(714) 555-0188'}, source:{utm_source:'google'}}),
      mk({h:30, status:'booked', concerns:['hair'], intake:{}, contact:{firstName:'Dana', email:'dana@email.com'}, source:{utm_source:'instagram'}, booking:{bookedAt:hoursAgo(28), value:900, membership:false, note:'LHR package booked'}}),
      mk({h:54, status:'booked', concerns:['lines','pigment'], intake:{}, contact:{firstName:'Eve', email:'eve@email.com'}, source:{utm_source:'google'}, booking:{bookedAt:hoursAgo(50), value:1560, membership:true, note:'Tox + IPL + Glow membership'}}),
      mk({h:14, status:'new', concerns:['chin'], intake:{}, contact:{}, source:{utm_source:'tiktok'}})
    ];
  }

  global.MedSpaStore=MedSpaStore;
})(window);
