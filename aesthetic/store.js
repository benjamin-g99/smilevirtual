/* =============================================================================
   AestheticStore — data layer for Aesthetic Virtual (plastics first)
   -----------------------------------------------------------------------------
   Mirrors SmileStore's shape (so the practice console can be reused) but lives in
   its OWN localStorage namespace, so aesthetic leads never mix with dental ones.
   Plastics-specific: procedures (not goals), a qualification/candidacy score
   (value × readiness × budget), financing, and NO simulation.
   ============================================================================= */
(function (global) {
  'use strict';
  const KEY='aesthetic.leads.v1', CFG='aesthetic.config.v1', SEEDED='aesthetic.seeded.v1';

  const uid=()=>'av_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  const now=()=>new Date().toISOString();
  const read=()=>{ try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]} };
  const write=(l)=>{ try{localStorage.setItem(KEY,JSON.stringify(l))}catch(e){} notify(); };
  const listeners=new Set(); function notify(){ listeners.forEach(f=>{try{f()}catch(e){}}); }
  global.addEventListener&&global.addEventListener('storage',e=>{ if(e.key===KEY) notify(); });

  /* ---- procedures catalog (illustrative US ballparks — demo only) ---- */
  const PROCEDURES=[
    {id:'rhino', label:'Rhinoplasty', icon:'👃', from:8000, to:15000, mo:180, angles:['Front','Profile (side)']},
    {id:'breast_aug', label:'Breast augmentation', icon:'💠', from:7000, to:12000, mo:155, angles:['Front','Side (3/4)']},
    {id:'breast_lift', label:'Breast lift', icon:'🎈', from:8000, to:13000, mo:165, angles:['Front','Side (3/4)']},
    {id:'tummy', label:'Tummy tuck', icon:'➖', from:9000, to:15000, mo:190, angles:['Front (abdomen)','Side (profile)']},
    {id:'lipo', label:'Liposuction', icon:'✨', from:4000, to:9000, mo:120, angles:['Front (area)','Side (area)']},
    {id:'facelift', label:'Facelift', icon:'⏳', from:12000, to:20000, mo:240, angles:['Front','Profile (side)']},
    {id:'bleph', label:'Eyelid surgery', icon:'👁️', from:4000, to:7000, mo:110, angles:['Eyes — front','Eyes — closed']},
    {id:'mommy', label:'Mommy makeover', icon:'🌸', from:15000, to:30000, mo:330, angles:['Front','Side (profile)']}
  ];
  const procById=(id)=>PROCEDURES.find(p=>p.id===id);

  const DEFAULT_CONFIG={
    surgeon:{ name:'Dr. Elena Vance', credential:'MD, FACS', specialty:'Board-Certified Plastic Surgeon',
      photo:null, rating:4.9, reviews:840, city:'Newport Beach', state:'CA',
      bio:'Board-certified plastic surgeon focused on natural-looking results. 4,000+ procedures, with a same-week personal video consultation for every serious inquiry.' },
    brand:{ name:'Vance Plastic Surgery', primary:'#4A2F50', accent:'#C98B86' },
    financing:{ partners:['Cherry','PatientFi','CareCredit'], aprFrom:0 },
    depositAmount:250,         // refundable consult deposit
    procedures:PROCEDURES
  };

  /* ---- qualification: value × readiness × budget → score + tier ---- */
  function qualify(lead){
    const procs=(lead.procedures||[]).map(procById).filter(Boolean);
    const value=procs.length?Math.max(...procs.map(p=>p.to)):0;
    const i=lead.intake||{};
    let s=0;
    // value tier (0-40)
    s += Math.min(40, value/30000*40);
    // readiness / timeline (0-30)
    s += /asap|soon/i.test(i.timeline||'')?30 : /1.?3/.test(i.timeline||'')?22 : /3.?6/.test(i.timeline||'')?12 : 4;
    // budget / financing readiness (0-30)
    s += i.budget==='ready'?30 : i.budget==='financing'?22 : i.budget==='exploring'?8 : 0;
    const score=Math.round(s);
    const tier = score>=70?'hot' : score>=45?'warm' : 'cold';
    // simple candidacy flag from health answers (demo)
    const flags=[]; if(i.smoker==='yes') flags.push('smoker'); if(i.priorSurgery==='yes') flags.push('prior surgery');
    return { score, tier, value, flags };
  }

  const AestheticStore={
    PROCEDURES, procById,
    config(){ try{ const c=JSON.parse(localStorage.getItem(CFG)); return c?Object.assign({},DEFAULT_CONFIG,c):DEFAULT_CONFIG; }catch(e){ return DEFAULT_CONFIG; } },
    saveConfig(c){ localStorage.setItem(CFG,JSON.stringify(c)); notify(); },
    onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); },
    all(){ return read().map(l=>Object.assign({},l,{qual:qualify(l)})).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)); },
    get(id){ const l=read().find(x=>x.id===id); return l?Object.assign({},l,{qual:qualify(l)}):null; },

    /* upsert at every step — partial/abandoned leads captured too */
    upsert(partial){
      const leads=read();
      let lead=partial.id?leads.find(l=>l.id===partial.id):null;
      if(!lead){ lead={ id:partial.id||uid(), createdAt:now(), vertical:'plastics', status:'new',
        furthestStep:'welcome', procedures:[], goalText:'', photos:[], consent:false,
        intake:{}, contact:{}, source:{}, video:null, booking:null }; leads.push(lead); }
      ['procedures','goalText','photos','furthestStep','consent'].forEach(k=>{ if(partial[k]!==undefined) lead[k]=partial[k]; });
      if(partial.intake) lead.intake=Object.assign({},lead.intake,partial.intake);
      if(partial.contact) lead.contact=Object.assign({},lead.contact,partial.contact);
      if(partial.source&&Object.keys(partial.source).length) lead.source=partial.source;
      lead.updatedAt=now(); write(leads); return lead.id;
    },
    patch(id,fields){ const leads=read(); const l=leads.find(x=>x.id===id); if(!l)return null; Object.assign(l,fields,{updatedAt:now()}); write(leads); return l; },

    reset(){ [KEY,SEEDED].forEach(k=>localStorage.removeItem(k)); this.seed(); notify(); },
    seed(force){ if(!force&&localStorage.getItem(SEEDED)) return; localStorage.setItem(KEY,JSON.stringify(SEED())); localStorage.setItem(SEEDED,'1'); notify(); },
    ensureSeeded(){ if(!localStorage.getItem(SEEDED)) this.seed(); }
  };

  function hoursAgo(h){ return new Date(Date.now()-h*36e5).toISOString(); }
  function SEED(){
    return [
      { id:uid(), createdAt:hoursAgo(3), vertical:'plastics', status:'new', furthestStep:'complete',
        procedures:['rhino'], goalText:'I’ve always disliked the bump on my profile.', photos:['demo:f','demo:p'], consent:true,
        intake:{timeline:'Within 1–3 months', budget:'financing', smoker:'no', priorSurgery:'no'},
        contact:{firstName:'Olivia', email:'olivia.r@email.com', phone:'(949) 555-0110'},
        source:{utm_source:'instagram', campaign:'rhino-reels'}, video:null, booking:null },
      { id:uid(), createdAt:hoursAgo(26), vertical:'plastics', status:'new', furthestStep:'complete',
        procedures:['mommy','tummy'], goalText:'Two kids later, want my pre-pregnancy body back.', photos:['demo:f','demo:p'], consent:true,
        intake:{timeline:'As soon as possible', budget:'ready', smoker:'no', priorSurgery:'yes'},
        contact:{firstName:'Marisol', email:'marisol.q@email.com', phone:'(714) 555-0188'},
        source:{utm_source:'google', campaign:'mommy-makeover'}, video:null, booking:null },
      { id:uid(), createdAt:hoursAgo(50), vertical:'plastics', status:'new', furthestStep:'questions',
        procedures:['lipo'], goalText:'', photos:['demo:f'], consent:true,
        intake:{timeline:'Just researching', budget:'exploring'},
        contact:{}, source:{utm_source:'tiktok'}, video:null, booking:null }
    ];
  }

  global.AestheticStore=AestheticStore;
})(window);
