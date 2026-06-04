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
  const KEY='aesthetic.leads.v1', CFG='aesthetic.config.v1', CASES='aesthetic.cases.v1', SEEDED='aesthetic.seeded.v2';

  const uid=()=>'av_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  const now=()=>new Date().toISOString();
  const read=()=>{ try{return JSON.parse(localStorage.getItem(KEY))||[]}catch(e){return[]} };
  const write=(l)=>{ try{localStorage.setItem(KEY,JSON.stringify(l))}catch(e){} notify(); };
  const listeners=new Set(); function notify(){ listeners.forEach(f=>{try{f()}catch(e){}}); }
  global.addEventListener&&global.addEventListener('storage',e=>{ if(e.key===KEY) notify(); });

  /* ---- procedures catalog (illustrative US ballparks — demo only) ----
     `region` + `photos` drive treatment-specific photo requests in the flow. */
  const PROCEDURES=[
    {id:'rhino', label:'Rhinoplasty', icon:'👃', from:8000, to:15000, mo:180, region:'face',
      photos:[{label:'Front — relaxed',hint:'Face the camera, neutral expression, hair back'},{label:'Left profile',hint:'Turn 90° to show your left side'},{label:'Right profile',hint:'Turn 90° the other way'}]},
    {id:'breast_aug', label:'Breast augmentation', icon:'💠', from:7000, to:12000, mo:155, region:'breast',
      photos:[{label:'Front',hint:'Arms relaxed at your sides'},{label:'Left oblique',hint:'Turn slightly to your left'},{label:'Right oblique',hint:'Turn slightly to your right'}]},
    {id:'breast_lift', label:'Breast lift', icon:'🎈', from:8000, to:13000, mo:165, region:'breast',
      photos:[{label:'Front',hint:'Arms relaxed at your sides'},{label:'Left oblique',hint:'Turn slightly to your left'},{label:'Right oblique',hint:'Turn slightly to your right'}]},
    {id:'tummy', label:'Tummy tuck', icon:'➖', from:9000, to:15000, mo:190, region:'body',
      photos:[{label:'Front — abdomen',hint:'Standing, arms raised slightly'},{label:'Side profile',hint:'Full side view, relaxed'}]},
    {id:'lipo', label:'Liposuction', icon:'✨', from:4000, to:9000, mo:120, region:'body',
      photos:[{label:'Front — treatment area',hint:'The area you’d like refined'},{label:'Side — treatment area',hint:'Side view of the same area'}]},
    {id:'facelift', label:'Facelift', icon:'⏳', from:12000, to:20000, mo:240, region:'face',
      photos:[{label:'Front — relaxed',hint:'Neutral expression, hair back'},{label:'Left 3/4',hint:'Turn slightly to your left'},{label:'Right 3/4',hint:'Turn slightly to your right'}]},
    {id:'bleph', label:'Eyelid surgery', icon:'👁️', from:4000, to:7000, mo:110, region:'face',
      photos:[{label:'Eyes — open',hint:'Look straight ahead, relaxed'},{label:'Eyes — gently closed',hint:'Close your eyes softly'}]},
    {id:'mommy', label:'Mommy makeover', icon:'🌸', from:15000, to:30000, mo:330, region:'body',
      photos:[{label:'Front — torso',hint:'Standing, relaxed'},{label:'Side profile',hint:'Full side view'}]}
  ];
  function getProcs(){ try{ const c=JSON.parse(localStorage.getItem(CFG)); if(c&&Array.isArray(c.procedures)) return c.procedures; }catch(e){} return PROCEDURES; }
  const procById=(id)=>getProcs().find(p=>p.id===id);
  const DEFAULT_PHOTOS=[{label:'Front',hint:'Face the camera, good light'},{label:'Profile (side)',hint:'Turn to show your side'}];
  // treatment-specific photo set for the selected procedures (deduped by label, capped)
  function photoSet(ids){
    const seen={}, out=[];
    (ids||[]).map(procById).filter(Boolean).forEach(p=>(p.photos||[]).forEach(ph=>{ const k=ph.label.toLowerCase(); if(!seen[k]){ seen[k]=1; out.push(ph); } }));
    return out.length?out.slice(0,4):DEFAULT_PHOTOS.slice();
  }

  const DEFAULT_CONFIG={
    surgeon:{ name:'Dr. Elena Vance', credential:'MD, FACS', specialty:'Board-Certified Plastic Surgeon',
      photo:null, rating:4.9, reviews:840, city:'Newport Beach', state:'CA', phone:'(949) 555-0100', email:'hello@vanceplastics.com',
      bio:'Board-certified plastic surgeon focused on natural-looking results. 4,000+ procedures, with a same-week personal video consultation for every serious inquiry.' },
    brand:{ name:'Vance Plastic Surgery', primary:'#4A2F50', accent:'#C98B86' },
    financing:{ partners:['Cherry','PatientFi','CareCredit'], aprFrom:0 },
    depositAmount:250,         // refundable consult deposit
    analytics:{ metaPixelId:'', ga4Id:'', googleAdsId:'' },
    links:[ {id:'lk_book',label:'Book a consultation',url:'https://example.com/book',icon:'📅'},
            {id:'lk_ba',label:'See before & afters',url:'https://example.com/gallery',icon:'✨'},
            {id:'lk_ig',label:'Follow on Instagram',url:'https://instagram.com',icon:'📸'} ],
    spendBySource:{ instagram:1500, google:1200, tiktok:400 },   // monthly spend per paid channel (demo)
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

  /* ---- before & afters library (string-based SVG placeholders; no canvas so it
     works in any environment. Uploaded pairs are stored as data URLs.) ---- */
  function svgTile(label, c1, c2, fg){
    const svg="<svg xmlns='http://www.w3.org/2000/svg' width='320' height='240'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='"+c1+"'/><stop offset='1' stop-color='"+c2+"'/></linearGradient></defs><rect width='320' height='240' fill='url(%23g)'/><text x='160' y='128' font-family='sans-serif' font-size='15' fill='"+fg+"' text-anchor='middle'>"+label+"</text></svg>";
    return 'data:image/svg+xml;utf8,'+encodeURIComponent(svg);
  }
  function ba(label, region, dim, bright){ return { before:svgTile(label+' · before', dim, '#9a8f93', 'rgba(255,255,255,.65)'), after:svgTile(label+' · after', bright, '#d8b7b1', 'rgba(74,47,80,.65)') }; }
  function SEED_CASES(){
    return [
      Object.assign({id:'bc_rhino', label:'Rhinoplasty — 3 mo', region:'face'}, ba('Rhinoplasty','face','#b9adb2','#f0e2df')),
      Object.assign({id:'bc_face', label:'Facelift — 6 wks', region:'face'}, ba('Facelift','face','#b3a7ad','#efe1de')),
      Object.assign({id:'bc_breast', label:'Breast aug — 6 wks', region:'breast'}, ba('Breast aug','breast','#b7abb0','#f1e4e1')),
      Object.assign({id:'bc_tummy', label:'Tummy tuck — 3 mo', region:'body'}, ba('Tummy tuck','body','#b5a9af','#eee0dd')),
      Object.assign({id:'bc_lipo', label:'Lipo — 8 wks', region:'body'}, ba('Liposuction','body','#bbafb4','#f2e5e2'))
    ];
  }

  const AestheticStore={
    PROCEDURES, procById, photoSet,
    config(){ try{ const c=JSON.parse(localStorage.getItem(CFG)); return c?Object.assign({},DEFAULT_CONFIG,c):DEFAULT_CONFIG; }catch(e){ return DEFAULT_CONFIG; } },
    saveConfig(c){ localStorage.setItem(CFG,JSON.stringify(c)); notify(); },
    cases(){ try{ const c=JSON.parse(localStorage.getItem(CASES)); return Array.isArray(c)?c:SEED_CASES(); }catch(e){ return SEED_CASES(); } },
    addCase(c){ const l=this.cases(); l.unshift(Object.assign({id:'bc_'+Math.random().toString(36).slice(2,7)},c)); localStorage.setItem(CASES,JSON.stringify(l)); notify(); return l[0]; },
    removeCase(id){ localStorage.setItem(CASES,JSON.stringify(this.cases().filter(c=>c.id!==id))); notify(); },
    onChange(fn){ listeners.add(fn); return ()=>listeners.delete(fn); },
    /* practice analytics — funnel, pipeline value, revenue, by-source ROAS, tier mix */
    analytics(){
      const all=this.all();
      const spend=this.config().spendBySource||{};
      const sentN=all.filter(l=>l.video&&l.video.sentAt).length;
      const F=[
        ['started','Started flow', all.length],
        ['lead','Became a lead', all.filter(l=>l.contact&&l.contact.email).length],
        ['sent','Video sent', sentN],
        ['viewed','Watched video', all.filter(l=>l.video&&l.video.viewedAt).length],
        ['booked','Booked consult', all.filter(l=>l.status==='booked'||(l.booking&&l.booking.bookedAt)).length],
        ['paid','Proceeded / paid', all.filter(l=>l.booking&&l.booking.paid).length]
      ].map((r,i,a)=>{ const prev=i?a[i-1][2]:r[2]; return { key:r[0], label:r[1], count:r[2], pct:a[0][2]?Math.round(r[2]/a[0][2]*100):0, drop:Math.max(0,prev-r[2]) }; });
      const revenue=all.filter(l=>l.booking&&l.booking.paid).reduce((s,l)=>s+(l.booking.value||0),0);
      const pipeline=all.filter(l=>!(l.booking&&l.booking.paid)).reduce((s,l)=>s+(l.qual.value||0),0);
      const paid=F[5].count, booked=F[4].count, lead=F[1].count;
      const bySrc={};
      all.forEach(l=>{ const s=(l.source&&l.source.utm_source)||'direct'; const r=bySrc[s]||(bySrc[s]={source:s,leads:0,sent:0,booked:0,paid:0,revenue:0,pipeline:0,spend:spend[s.toLowerCase()]||0});
        r.leads++; if(l.video&&l.video.sentAt)r.sent++; if(l.status==='booked'||(l.booking&&l.booking.bookedAt))r.booked++; if(l.booking&&l.booking.paid){r.paid++;r.revenue+=l.booking.value||0;} if(!(l.booking&&l.booking.paid))r.pipeline+=l.qual.value||0; });
      const sources=Object.values(bySrc).map(r=>{ r.roas=r.spend?Math.round(r.revenue/r.spend*10)/10:null; r.cpl=r.spend&&r.leads?Math.round(r.spend/r.leads):null; return r; }).sort((a,b)=>b.revenue-a.revenue||b.leads-a.leads);
      const tiers={hot:0,warm:0,cold:0}; all.forEach(l=>tiers[l.qual.tier]=(tiers[l.qual.tier]||0)+1);
      return { funnel:F, revenue, pipeline, avg:paid?Math.round(revenue/paid):0,
        conv:{ leadToBooked:lead?Math.round(booked/lead*100):0, bookedToPaid:booked?Math.round(paid/booked*100):0 },
        sources, tiers, hot:tiers.hot };
    },
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

    reset(){ [KEY,SEEDED,CASES].forEach(k=>localStorage.removeItem(k)); this.seed(); notify(); },
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
