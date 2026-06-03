/* =============================================================================
   Smile Consult — patient flow
   Real(ish) build: live camera capture (getUserMedia) with a file-input fallback
   for in-app browsers, and every step is persisted to SmileStore so the lead —
   complete OR abandoned — shows up in the doctor portal.
   ============================================================================= */

const protoState = { questions:false, sim:false };
const selectedGoals = new Set();
let shotsTaken = 0;
let camStep = 0;
let leadId = null;                 // server id once the lead exists
const photoData = [null, null];    // captured JPEG data URLs
const progress = document.getElementById('progress');
const barFill = document.getElementById('barFill');
const backBtn = document.getElementById('backBtn');

/* seed demo data on first run so the doctor portal isn't empty */
if (window.SmileStore) SmileStore.ensureSeeded();

/* ---- UTM / source capture (real, from the URL) ------------------------- */
function getSource(){
  const p = new URLSearchParams(location.search);
  const s = {};
  ['utm_source','utm_campaign','utm_content','utm_medium','utm_term'].forEach(k=>{
    const v = p.get(k); if(v) s[k.replace('utm_','')] = v;
  });
  return s;
}
const SOURCE = getSource();

/* ---- persistence: upsert the lead as the visitor progresses ------------ */
function persist(partial){
  if(!window.SmileStore) return;
  leadId = SmileStore.upsert(Object.assign({ id:leadId, source:SOURCE }, partial));
}

/* keyed screens + dynamic flow */
const SCREENS = {};
document.querySelectorAll('.screen').forEach(s=>{ if(s.dataset.key) SCREENS[s.dataset.key]=s; });
let flow = [];
let currentKey = 'welcome';
function buildFlow(){
  flow = ['welcome','goals','photos'];
  if(protoState.questions) flow.push('questions');
  flow.push(protoState.sim ? 'sim' : 'contact');  // sim gate collects contact when on
}
buildFlow();

/* ===== Doctor photo (real headshot, embedded) ===== */
const DOC_PHOTO = "data:image/jpeg;base64,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";
['docPhoto','docPhotoSm','docPhotoConf','docPhotoSm2'].forEach(id=>{
  const el=document.getElementById(id); if(el) el.src=DOC_PHOTO;
});

function show(key){
  const order = [...flow, 'confirm'];
  const ti = order.indexOf(key);
  Object.entries(SCREENS).forEach(([k,el])=>{
    el.classList.remove('active','left');
    if(k===key) el.classList.add('active');
    else { const ki=order.indexOf(k); if(ki>-1 && ki<ti) el.classList.add('left'); }
  });
  currentKey = key;
  if(key==='sim') drawSimReveal();
  if(key==='contact') buildSummary();
  if(key==='confirm') fireConfetti();
  const i = flow.indexOf(key);
  const showProg = key!=='welcome' && key!=='confirm';
  progress.classList.toggle('hidden', !showProg);
  backBtn.classList.toggle('invis', !(i>1));
  let pct = key==='confirm' ? 100 : (i>0 ? (i/(flow.length-1))*100 : 0);
  barFill.style.width = pct+'%';
  SCREENS[key].scrollTop = 0;
  // capture progress at every step (incomplete-lead recovery)
  persist({ furthestStep: key==='confirm' ? 'complete' : key });
}
function next(){
  const i=flow.indexOf(currentKey);
  if(i<0) return;
  if(i < flow.length-1) show(flow[i+1]);
  else show('confirm');
}
function goBack(){ const i=flow.indexOf(currentKey); if(i>0) show(flow[i-1]); }

/* prototype toggles rebuild the active step sequence */
function setToggle(which,on){
  protoState[which]=on; buildFlow();
  if(which==='sim') updateWelcome();
  if(flow.indexOf(currentKey)===-1 && currentKey!=='confirm') show('welcome');
  else if(currentKey!=='confirm') show(currentKey);
}
document.getElementById('togQuestions').addEventListener('change',e=>setToggle('questions',e.target.checked));
document.getElementById('togSim').addEventListener('change',e=>setToggle('sim',e.target.checked));

/* welcome value prop reacts to the smile-simulation toggle */
const STEPS_SELFIE = `<div class="step"><div class="n">1</div><div><b>Snap 2 quick selfies</b><p>We'll guide you — the camera opens right here.</p></div></div>
      <div class="step"><div class="n">2</div><div><b>Tell us your goal</b><p>What you'd love to change about your smile.</p></div></div>`;
function updateWelcome(){
  const eb=document.getElementById('welcomeEyebrow');
  const sub=document.getElementById('welcomeSub');
  const steps=document.getElementById('welcomeSteps');
  if(protoState.sim){
    eb.textContent='Free Smile Preview + Video Consult';
    sub.textContent='See an instant preview of your new smile — then get a personalized video consultation from Dr. Harris. Right from your phone, no office visit, no cost.';
    steps.innerHTML = STEPS_SELFIE +
      `<div class="step"><div class="n">3</div><div><b>See your instant preview</b><p>A simulation of your potential new smile, right away.</p></div></div>
      <div class="step"><div class="n">4</div><div><b>Get your video consultation</b><p>Dr. Harris records a personalized video walking you through it.</p></div></div>`;
  } else {
    eb.textContent='Free Smile Assessment';
    sub.textContent='Get a personalized video consultation from Dr. Harris — right from your phone. No office visit, no cost.';
    steps.innerHTML = STEPS_SELFIE +
      `<div class="step"><div class="n">3</div><div><b>Get your video consultation</b><p>Dr. Harris records a personalized video just for you.</p></div></div>`;
  }
}
updateWelcome();

/* goals — enabled by chips OR free-text */
function goalText(){ return document.getElementById('goalText').value.trim(); }
function updateGoalCta(){
  document.getElementById('goalCta').disabled = (selectedGoals.size===0 && goalText().length===0);
  persist({ goals:[...selectedGoals], goalText:goalText() });
}
document.getElementById('chips').addEventListener('click', e=>{
  const chip = e.target.closest('.chip'); if(!chip) return;
  const g = chip.dataset.goal;
  if(selectedGoals.has(g)){selectedGoals.delete(g);chip.classList.remove('on');}
  else{selectedGoals.add(g);chip.classList.add('on');}
  updateGoalCta();
});

/* custom-questions: capture answers as the visitor responds */
document.querySelectorAll('.opts').forEach(group=>{
  group.addEventListener('click', e=>{
    const o=e.target.closest('.opt'); if(!o) return;
    group.querySelectorAll('.opt').forEach(x=>x.classList.remove('sel'));
    o.classList.add('sel');
    persistAnswers();
  });
});
document.querySelectorAll('.q textarea, .q select').forEach(el=>{
  el.addEventListener('input', persistAnswers); el.addEventListener('change', persistAnswers);
});
function persistAnswers(){
  const ans={};
  document.querySelectorAll('.q [data-q]').forEach(el=>{
    const qi = el.dataset.q;
    if(el.tagName==='TEXTAREA'){ if(el.value.trim()) ans[qi]=el.value.trim(); }
    else if(el.tagName==='SELECT'){ if(el.value) ans[qi]=el.value; }
    else { const sel=el.querySelector('.opt.sel'); if(sel) ans[qi]=sel.textContent.trim(); }
  });
  persist({ questionAnswers: ans });
}

/* ===== CAMERA — real getUserMedia with a file-input fallback ============= */
let stream = null;
const video = document.getElementById('camVideo');
const fileInput = document.getElementById('fileFallback');

async function openCamera(){
  const allDone = ['shot0','shot1'].every(id => document.getElementById(id).classList.contains('done'));
  if(allDone){
    ['shot0','shot1'].forEach(id=>{
      const s=document.getElementById(id);
      s.classList.remove('has-photo','done','is-uploading');
      s.querySelector('.tag.ovl').style.display='none';
    });
    shotsTaken=0; photoData[0]=photoData[1]=null;
    updatePhotoCtas();
  }
  camStep = Math.min(shotsTaken,1);
  setupCamShot();
  // Try the live camera first; fall back to the native file/camera picker
  // (Instagram/Facebook in-app browsers often block getUserMedia).
  try{
    stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user', width:{ideal:1280}, height:{ideal:720} }, audio:false });
    video.srcObject = stream;
    video.style.display='block';
    document.getElementById('viewport').classList.add('show');
  }catch(err){
    console.warn('[camera] getUserMedia unavailable, using file fallback', err);
    useFileFallback();
  }
}
function setupCamShot(){
  const title = document.getElementById('camTitle');
  const guide = document.getElementById('vguide');
  const hint = document.getElementById('vhint');
  if(camStep===0){
    title.textContent='Photo 1 of 2 · Big smile';
    guide.className='vguide';
    hint.textContent='Center your face in the guide and smile big 😁';
  } else {
    title.textContent='Photo 2 of 2 · Close-up';
    guide.className='vguide teeth';
    hint.textContent='Move closer — frame your front teeth in the box 🦷';
  }
}
function stopStream(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
function closeCamera(){ stopStream(); video.style.display='none'; document.getElementById('viewport').classList.remove('show'); }

/* downscale a source (video or image) to a small JPEG data URL for storage */
function frameToDataURL(source, sw, sh){
  const TW = 360, TH = 480;
  const off = document.createElement('canvas'); off.width=TW; off.height=TH;
  const o = off.getContext('2d');
  // cover-fit + mirror to match the selfie preview
  const ar = sw/sh, tar = TW/TH; let dw,dh,dx,dy;
  if(ar>tar){ dh=TH; dw=TH*ar; } else { dw=TW; dh=TW/ar; }
  dx=(TW-dw)/2; dy=(TH-dh)/2;
  o.translate(TW,0); o.scale(-1,1);                 // mirror
  o.drawImage(source, TW-dx-dw, dy, dw, dh);
  return off.toDataURL('image/jpeg',0.7);
}

function capture(){
  if(!stream) return;
  const flash = document.getElementById('flash');
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  const idx = camStep;
  setTimeout(()=>{
    const data = frameToDataURL(video, video.videoWidth||1280, video.videoHeight||720);
    applyCapturedPhoto(idx, data);
    if(camStep<1){ camStep++; setupCamShot(); }
    else { closeCamera(); }
  },180);
}

/* paint the captured/selected image into its tile, store it, simulate upload */
function applyCapturedPhoto(idx, dataURL){
  photoData[idx] = dataURL;
  const shot = document.getElementById('shot'+idx);
  const canvas = shot.querySelector('.preview');
  const img = new Image();
  img.onload = ()=>{ const c=canvas.getContext('2d'); c.clearRect(0,0,canvas.width,canvas.height);
    c.drawImage(img,0,0,canvas.width,canvas.height); };
  img.src = dataURL;
  shot.classList.add('has-photo');
  shot.querySelector('.tag.ovl').style.display='flex';
  shotsTaken = Math.max(shotsTaken, idx+1);
  simulateUpload(shot, idx);
}

/* ---- file fallback: native camera/gallery, sequentially for both shots -- */
let pendingFileIdx = 0;
function useFileFallback(){
  pendingFileIdx = Math.min(shotsTaken,1);
  fileInput.value='';
  fileInput.click();
}
fileInput.addEventListener('change', ()=>{
  const f = fileInput.files && fileInput.files[0]; if(!f) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const img = new Image();
    img.onload = ()=>{
      const data = frameToDataURL(img, img.naturalWidth, img.naturalHeight);
      applyCapturedPhoto(pendingFileIdx, data);
      // need a second photo? re-open the picker
      const stillNeed = !['shot0','shot1'].every(id=>document.getElementById(id).classList.contains('has-photo'));
      if(stillNeed){ pendingFileIdx = pendingFileIdx===0?1:0; setTimeout(()=>{ fileInput.value=''; fileInput.click(); },350); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(f);
});

function simulateUpload(shot, idx){
  shot.classList.remove('done');
  shot.classList.add('is-uploading');
  const fill = shot.querySelector('.ubar > i');
  const pct = shot.querySelector('.upct');
  let p = 0;
  fill.style.width = '0%';
  const tick = setInterval(()=>{
    p += Math.random()*22 + 10;
    if(p>=100){ p=100; clearInterval(tick); }
    fill.style.width = p+'%';
    pct.textContent = 'Uploading ' + Math.round(p) + '%';
    if(p===100){
      setTimeout(()=>{
        shot.classList.remove('is-uploading');
        shot.classList.add('done');
        // persist the photos we have so far (real data URLs)
        persist({ photos: photoData.filter(Boolean), furthestStep:'photos' });
        updatePhotoCtas();
      }, 280);
    }
  }, 200);
}

function updatePhotoCtas(){
  const allDone = ['shot0','shot1'].every(id =>
    document.getElementById(id).classList.contains('done'));
  document.getElementById('camBtn').style.display   = allDone ? 'none'  : 'block';
  document.getElementById('photoNext').style.display = allDone ? 'block' : 'none';
  document.getElementById('retakeBtn').style.display = allDone ? 'block' : 'none';
}

/* ===== smile simulation reveal (mock render) ============================= */
let simDrawn=false;
function drawSmile(cv, after){
  const c=cv.getContext('2d'), W=cv.width, H=cv.height;
  c.clearRect(0,0,W,H);
  const sk=c.createLinearGradient(0,0,0,H); sk.addColorStop(0,'#E8C4A8'); sk.addColorStop(1,'#D29A78');
  c.fillStyle=sk; c.fillRect(0,0,W,H);
  const cx=W/2, cy=H*0.5, mw=W*0.66, mh=mw*0.52;
  c.fillStyle='#B65C5C'; c.beginPath(); c.ellipse(cx,cy,mw/2+16,mh/2+16,0,0,Math.PI*2); c.fill();
  c.fillStyle='#5E2230'; c.beginPath(); c.ellipse(cx,cy,mw/2,mh/2,0,0,Math.PI*2); c.fill();
  c.save(); c.beginPath(); c.ellipse(cx,cy-mh*0.06,mw/2-6,mh/2-4,0,0,Math.PI*2); c.clip();
  const n=8, gap=3, tw=(mw-14)/n, x0=cx-(mw-14)/2, ty=cy-mh/2+3;
  for(let i=0;i<n;i++){
    let x=x0+i*tw, h=mh-14, y=ty;
    let col = after ? '#FFFFFF' : '#E7DCB8';
    if(!after){ if(i===3){ y+=8; } if(i===4){ x+=5; } }
    c.fillStyle=col;
    const r=6;
    c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+tw-gap,y,x+tw-gap,y+r,r);
    c.lineTo(x+tw-gap,y+h-r); c.arcTo(x+tw-gap,y+h,x+tw-gap-r,y+h,r);
    c.lineTo(x+r,y+h); c.arcTo(x,y+h,x,y+h-r,r);
    c.lineTo(x,y+r); c.arcTo(x,y,x+r,y,r); c.fill();
    c.strokeStyle='rgba(0,0,0,.06)'; c.lineWidth=1; c.stroke();
  }
  c.restore();
  const v=c.createRadialGradient(cx,cy,mw*0.4,cx,cy,H*0.7);
  v.addColorStop(0,'transparent'); v.addColorStop(1,'rgba(60,30,20,.22)');
  c.fillStyle=v; c.fillRect(0,0,W,H);
}
function setSimSlider(pct){
  pct=Math.max(4,Math.min(96,pct));
  document.getElementById('simBeforeWrap').style.width=pct+'%';
  document.getElementById('simHandle').style.left=pct+'%';
}
function drawSimReveal(){
  if(simDrawn) return;
  drawSmile(document.getElementById('simBefore'), false);
  drawSmile(document.getElementById('simAfter'), true);
  sizeAfter();
  setSimSlider(50);
  simDrawn=true;
}
function sizeAfter(){
  const reveal=document.getElementById('simReveal'); const b=document.getElementById('simBefore');
  if(reveal && b && reveal.clientWidth) b.style.width = reveal.clientWidth+'px';
}
window.addEventListener('resize', ()=>{ if(simDrawn) sizeAfter(); });
(function initSimDrag(){
  const reveal=document.getElementById('simReveal'); if(!reveal) return;
  let drag=false;
  const locked=()=>reveal.classList.contains('locked');
  const move=(clientX)=>{ const r=reveal.getBoundingClientRect(); setSimSlider(((clientX-r.left)/r.width)*100); };
  const down=e=>{ if(locked()) return; drag=true; move((e.touches?e.touches[0]:e).clientX); };
  const mv=e=>{ if(drag && !locked()) move((e.touches?e.touches[0]:e).clientX); };
  const up=()=>drag=false;
  reveal.addEventListener('mousedown',down); window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
  reveal.addEventListener('touchstart',down,{passive:true}); reveal.addEventListener('touchmove',mv,{passive:true}); window.addEventListener('touchend',up);
})();

/* ===== sim gate: email + phone unlocks the blurred preview =============== */
function validateSim(){
  const em=document.getElementById('semail').value.trim();
  const ph=document.getElementById('sphone').value.trim();
  const ok=/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) && ph.replace(/\D/g,'').length>=7;
  document.getElementById('simUnlock').disabled=!ok;
}
function unlockSim(){
  const name=document.getElementById('sfname').value.trim();
  document.getElementById('simReveal').classList.remove('locked');
  document.getElementById('simGate').style.display='none';
  document.getElementById('simPayoff').style.display='block';
  document.getElementById('simEyebrow').textContent='✨ Here it is';
  document.getElementById('simHead').innerHTML = name
    ? `Here it is, <em>${name.replace(/[<>&]/g,'')}</em>`
    : `Here's your <em>preview</em>`;
  document.getElementById('simSub').textContent='Drag the slider to compare. This is a quick automated preview — your real plan comes in Dr. Harris’s video.';
  document.getElementById('confName').textContent = name || 'there';
  // lead captured here when sim is on
  persist({
    contact:{ firstName:name, email:document.getElementById('semail').value.trim(), phone:document.getElementById('sphone').value.trim() },
    sim:{ enabled:true, unlockedAt:new Date().toISOString() },
    furthestStep:'sim'
  });
  fireConversionPixel(name);
}
function resetSim(){
  const r=document.getElementById('simReveal'); if(!r) return;
  r.classList.add('locked');
  document.getElementById('simGate').style.display='';
  document.getElementById('simPayoff').style.display='none';
  document.getElementById('simEyebrow').textContent='✨ Your preview is ready';
  document.getElementById('simHead').innerHTML='Unlock your <em>new smile</em>';
  document.getElementById('simSub').textContent='Your preview is ready. Enter your details to reveal it — and Dr. Harris will send your full personalized video consultation to follow.';
  ['sfname','semail','sphone'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('simUnlock').disabled=true;
  if(simDrawn) setSimSlider(50);
}

/* summary on contact screen */
function buildSummary(){
  const el = document.getElementById('contactSummary');
  const goals = [...selectedGoals];
  const txt = goalText();
  const goalLine = goals.length ? goals.join(', ') : (txt ? '“'+txt.slice(0,48)+(txt.length>48?'…':'')+'”' : 'Your smile goals');
  let rows =
    `<div class="row"><b>✓ Goals:</b> ${goalLine}</div>`+
    `<div class="row"><b>✓ Photos:</b> ${photoData.filter(Boolean).length} captured & ready</div>`;
  if(protoState.sim) rows += `<div class="row"><b>✓ Preview:</b> generated — full video to come</div>`;
  el.innerHTML = rows;
}

/* contact form */
function validateForm(){
  const fn = document.getElementById('fname').value.trim();
  const em = document.getElementById('email').value.trim();
  const ok = fn.length>0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em);
  document.getElementById('submitCta').disabled = !ok;
}
function submitForm(){
  const name = document.getElementById('fname').value.trim();
  document.getElementById('confName').textContent = name || 'there';
  persist({
    contact:{ firstName:name, email:document.getElementById('email').value.trim(), phone:document.getElementById('phone').value.trim() },
    furthestStep:'complete'
  });
  show('confirm');
  fireConversionPixel(name);
}

/* confirmation effects */
function fireConfetti(){
  const box = document.getElementById('confetti');
  box.innerHTML='';
  const colors=['#E8775B','#0E5450','#C9A24B','#2C7D78'];
  for(let i=0;i<26;i++){
    const c=document.createElement('i');
    c.style.left=Math.random()*100+'%';
    c.style.background=colors[i%colors.length];
    const dur=1.6+Math.random()*1.2, delay=Math.random()*0.5;
    c.style.animation=`fall ${dur}s ${delay}s ease-in forwards`;
    box.appendChild(c);
  }
}
const kf=document.createElement('style');
kf.textContent='@keyframes fall{0%{opacity:0;transform:translateY(0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(640px) rotate(540deg)}}';
document.head.appendChild(kf);

/* ===== CONVERSION PIXEL — fires once, on lead capture ====================
   In production fire Meta Pixel / GA4 / server-side here, with real UTMs. */
function fireConversionPixel(name){
  const payload = {
    event:'consult_complete',
    lead_id: leadId,
    goals:[...selectedGoals],
    notes: goalText() || undefined,
    photos: photoData.filter(Boolean).length,
    sim: protoState.sim,
    custom_questions: protoState.questions,
    ...SOURCE,
    ts:new Date().toISOString()
  };
  const note=document.getElementById('devnote');
  note.classList.add('fired');
  document.getElementById('devbody').innerHTML =
    `<span class="muted">// pixel fired — lead saved to doctor portal</span><br>`+
    `fbq('track', <code>'Lead'</code>, ${syntax(payload)});`;
  // window.fbq && fbq('track','Lead',payload);
  console.log('[conversion pixel]', payload);
}
function syntax(obj){
  return JSON.stringify(obj).replace(/"([^"]+)":/g,'$1:').replace(/"/g,"'");
}

function restart(){
  selectedGoals.clear(); shotsTaken=0; camStep=0; leadId=null; photoData[0]=photoData[1]=null;
  document.querySelectorAll('.chip.on').forEach(c=>c.classList.remove('on'));
  document.getElementById('goalText').value='';
  ['shot0','shot1'].forEach(id=>{
    const s=document.getElementById(id);
    s.classList.remove('has-photo','done','is-uploading');
    s.querySelector('.tag.ovl').style.display='none';
  });
  document.querySelectorAll('.opt.sel').forEach(o=>o.classList.remove('sel'));
  document.querySelectorAll('.q textarea, .gtext textarea').forEach(t=>t.value='');
  document.querySelectorAll('.q select').forEach(s=>s.selectedIndex=0);
  document.getElementById('goalCta').disabled=true;
  document.getElementById('camBtn').style.display='block';
  document.getElementById('photoNext').style.display='none';
  document.getElementById('retakeBtn').style.display='none';
  document.getElementById('submitCta').disabled=true;
  ['fname','email','phone'].forEach(id=>document.getElementById(id).value='');
  if(simDrawn) setSimSlider(50);
  resetSim();
  const note=document.getElementById('devnote'); note.classList.remove('fired');
  document.getElementById('devbody').innerHTML='<span class="muted">// waiting for a completed consult…</span>';
  show('welcome');
}
