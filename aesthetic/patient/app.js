/* =============================================================================
   Aesthetic Consult — plastic-surgery patient capture flow
   Procedure-led intake → confidential photos → qualification → contact gate.
   No simulation. Writes to AestheticStore (separate namespace from dental).
   ============================================================================= */
const S = window.AestheticStore;
S.ensureSeeded();
const CFG = S.config();

const selectedProcs = new Set();
const photoData = [null, null];
const intake = {};
let leadId = null, camStep = 0, shotsTaken = 0, stream = null;

const $ = id => document.getElementById(id);
const progress = $('progress'), barFill = $('barFill'), backBtn = $('backBtn');

/* ---- source + persistence ---- */
function getSource(){ const p=new URLSearchParams(location.search), s={};
  ['utm_source','utm_campaign','utm_content','utm_medium','utm_term'].forEach(k=>{const v=p.get(k);if(v)s[k]=v;});
  const f=p.get('from'); if(f&&!s.utm_source) s.utm_source=f; if(document.referrer) s.referrer=document.referrer; return s; }
const SOURCE = getSource();
function persist(partial){ leadId = S.upsert(Object.assign({id:leadId, source:SOURCE}, partial)); }

/* ---- screens / flow ---- */
const SCREENS = {}; document.querySelectorAll('.screen').forEach(s=>{ if(s.dataset.key) SCREENS[s.dataset.key]=s; });
const flow = ['welcome','procedure','photos','questions','contact','confirm'];
let currentKey = 'welcome';

/* ---- branding from config ---- */
const SURNAME = 'Dr. '+(CFG.surgeon.name.split(' ').slice(-1)[0]);
const INITIALS = CFG.surgeon.name.replace(/^Dr\.?\s*/,'').split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
function applyBrand(){
  document.documentElement.style.setProperty('--plum', CFG.brand.primary);
  document.documentElement.style.setProperty('--rose', CFG.brand.accent);
  $('docName').textContent = CFG.surgeon.name;
  $('docRole').textContent = CFG.surgeon.specialty+' · '+CFG.surgeon.credential;
  $('docRating').textContent = CFG.surgeon.rating; $('docReviews').textContent = CFG.surgeon.reviews;
  ['docAv','docAvSm','docAvConf'].forEach(id=>{ if($(id)) $(id).textContent=INITIALS; });
  document.querySelectorAll('.docn').forEach(el=>el.textContent=SURNAME);
  $('depositLine').textContent = '$'+CFG.depositAmount;
}

/* ---- procedure chips ---- */
function renderProcs(){
  $('procChips').innerHTML = S.PROCEDURES.map(p=>
    `<div class="chip" data-id="${p.id}"><span class="ico">${p.icon}</span>${p.label}</div>`).join('');
  $('procChips').addEventListener('click', e=>{
    const c=e.target.closest('.chip'); if(!c) return; const id=c.dataset.id;
    if(selectedProcs.has(id)){ selectedProcs.delete(id); c.classList.remove('on'); }
    else { selectedProcs.add(id); c.classList.add('on'); }
    updateProcCta();
  });
}
function goalText(){ return $('goalText').value.trim(); }
function updateProcCta(){
  $('procCta').disabled = selectedProcs.size===0 && goalText().length===0;
  persist({ procedures:[...selectedProcs], goalText:goalText() });
  updateFinHint();
}

/* ---- financing hint from the highest-value selected procedure ---- */
function firstProc(){ const a=[...selectedProcs]; return a.length?S.procById(a[0]):null; }
function updateFinHint(){
  const procs=[...selectedProcs].map(S.procById).filter(Boolean);
  const mo = procs.length?Math.min(...procs.map(p=>p.mo)):155;
  if($('finFrom')) $('finFrom').textContent = '$'+mo+'/mo';
}

/* ---- navigation ---- */
function show(key){
  const order=[...flow];
  const ti=order.indexOf(key);
  Object.entries(SCREENS).forEach(([k,el])=>{ el.classList.remove('active','left'); if(k===key) el.classList.add('active'); else { const ki=order.indexOf(k); if(ki>-1&&ki<ti) el.classList.add('left'); } });
  currentKey=key;
  if(key==='photos') setupPhotoGuidance();
  if(key==='contact') buildSummary();
  if(key==='confirm') fireConfetti();
  const i=flow.indexOf(key);
  progress.classList.toggle('hidden', key==='welcome'||key==='confirm');
  backBtn.classList.toggle('invis', !(i>1));
  barFill.style.width = (key==='confirm'?100:(i>0?i/(flow.length-1)*100:0))+'%';
  SCREENS[key].scrollTop=0;
  persist({ furthestStep: key==='confirm'?'complete':key });
}
function next(){ const i=flow.indexOf(currentKey); if(i<flow.length-1) show(flow[i+1]); }
function goBack(){ const i=flow.indexOf(currentKey); if(i>0) show(flow[i-1]); }

/* ---- photos: treatment-specific, N dynamic tiles ---- */
let photoSetArr=[];
function setupPhotoGuidance(){
  photoSetArr = S.photoSet([...selectedProcs]);
  while(photoData.length < photoSetArr.length) photoData.push(null);
  photoData.length = photoSetArr.length;
  const p=firstProc(); const region=(p&&p.region)?p.region+' ':'';
  $('photoSub').innerHTML = (p?`For your ${p.label.toLowerCase()}, `:'')+`we need ${photoSetArr.length} ${region}photo${photoSetArr.length>1?'s':''}. They’re confidential and used only for your medical review.`;
  $('photoGuide').innerHTML = photoSetArr.map((ph,i)=>`<div class="gcard"><div class="ph">📷</div><div><b>Photo ${i+1} — ${ph.label}</b><p>${ph.hint}</p></div></div>`).join('');
  $('shots').innerHTML = photoSetArr.map((ph,i)=>`<div class="shot" id="shot${i}">
      <span class="badge">✓</span><canvas class="preview" width="180" height="240"></canvas>
      <div class="empty"><span class="big">📷</span><span class="tag">${ph.label}</span></div>
      <div class="tag ovl" style="display:none">${ph.label}</div>
      <div class="uploading"><div class="ubar"><i></i></div><span class="ulabel"><span class="spin"></span><span class="upct">Uploading…</span></span></div>
    </div>`).join('');
  // re-apply photos already captured (e.g. navigating back into the step)
  photoData.forEach((d,i)=>{ const shot=$('shot'+i); if(d&&shot){ const cv=shot.querySelector('.preview'); const img=new Image(); img.onload=()=>cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height); img.src=d; shot.classList.add('has-photo','done'); shot.querySelector('.tag.ovl').style.display='block'; } });
  updatePhotoCtas();
}
function shotIds(){ return photoSetArr.map((_,i)=>'shot'+i); }
function clearPhotoData(){ photoData.forEach((_,i)=>photoData[i]=null); }

/* ---- camera (getUserMedia + file fallback), N photos ---- */
const video=$('camVideo'), fileInput=$('fileFallback');
async function openCamera(){
  const ids=shotIds(); const allDone=ids.length&&ids.every(id=>$(id)&&$(id).classList.contains('done'));
  if(allDone){ ids.forEach(id=>{const s=$(id); s.classList.remove('has-photo','done','is-uploading'); s.querySelector('.tag.ovl').style.display='none';}); shotsTaken=0; clearPhotoData(); updatePhotoCtas(); }
  camStep=Math.min(shotsTaken, photoSetArr.length-1); setupCamShot();
  try{ stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:1280}},audio:false});
    video.srcObject=stream; $('viewport').classList.add('show'); }
  catch(e){ useFileFallback(); }
}
function setupCamShot(){ const ph=photoSetArr[camStep]||{label:'Photo',hint:''};
  $('camTitle').textContent='Photo '+(camStep+1)+' of '+photoSetArr.length+' · '+ph.label;
  $('vhint').textContent = ph.hint||'Center yourself, good light'; }
function stopStream(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } }
function closeCamera(){ stopStream(); $('viewport').classList.remove('show'); }
function frameToDataURL(src,sw,sh){ const TW=360,TH=480,off=document.createElement('canvas'); off.width=TW;off.height=TH;
  const o=off.getContext('2d'); const ar=sw/sh,tar=TW/TH; let dw,dh; if(ar>tar){dh=TH;dw=TH*ar;}else{dw=TW;dh=TW/ar;}
  o.translate(TW,0); o.scale(-1,1); o.drawImage(src,(TW-dw)/2,(TH-dh)/2,dw,dh); return off.toDataURL('image/jpeg',0.7); }
function capture(){ if(!stream) return; const flash=$('flash'); flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
  const idx=camStep; setTimeout(()=>{ applyCapturedPhoto(idx, frameToDataURL(video,video.videoWidth||1280,video.videoHeight||720));
    if(camStep < photoSetArr.length-1){ camStep++; setupCamShot(); } else closeCamera(); },180); }
function applyCapturedPhoto(idx,dataURL){ photoData[idx]=dataURL; const shot=$('shot'+idx); if(!shot) return; const canvas=shot.querySelector('.preview');
  const img=new Image(); img.onload=()=>{ const c=canvas.getContext('2d'); c.clearRect(0,0,canvas.width,canvas.height); c.drawImage(img,0,0,canvas.width,canvas.height); }; img.src=dataURL;
  shot.classList.add('has-photo'); shot.querySelector('.tag.ovl').style.display='block'; shotsTaken=Math.max(shotsTaken,idx+1); simulateUpload(shot); }
let pendingIdx=0;
function useFileFallback(){ const next=photoData.findIndex(d=>!d); pendingIdx=next<0?0:next; fileInput.value=''; fileInput.click(); }
fileInput.addEventListener('change',()=>{ const f=fileInput.files&&fileInput.files[0]; if(!f) return; const r=new FileReader();
  r.onload=()=>{ const img=new Image(); img.onload=()=>{ applyCapturedPhoto(pendingIdx, frameToDataURL(img,img.naturalWidth,img.naturalHeight));
    const next=photoData.findIndex(d=>!d); if(next>=0){ pendingIdx=next; setTimeout(()=>{fileInput.value='';fileInput.click();},350); } }; img.src=r.result; };
  r.readAsDataURL(f); });
function simulateUpload(shot){ shot.classList.remove('done'); shot.classList.add('is-uploading');
  const fill=shot.querySelector('.ubar>i'), pct=shot.querySelector('.upct'); let p=0; fill.style.width='0%';
  const t=setInterval(()=>{ p+=Math.random()*22+12; if(p>=100){p=100;clearInterval(t);} fill.style.width=p+'%'; pct.textContent='Uploading '+Math.round(p)+'%';
    if(p===100) setTimeout(()=>{ shot.classList.remove('is-uploading'); shot.classList.add('done'); persist({photos:photoData.filter(Boolean), furthestStep:'photos'}); updatePhotoCtas(); },280); },200); }
function updatePhotoCtas(){
  const ids=shotIds(); const allDone=ids.length>0 && ids.every(id=>$(id)&&$(id).classList.contains('done'));
  const consent=$('consent').checked;
  $('camBtn').style.display = allDone?'none':'block';
  $('photoNext').style.display = allDone?'block':'none';
  $('retakeBtn').style.display = allDone?'block':'none';
  $('photoNext').disabled = !(allDone&&consent);
  persist({ consent });
}

/* ---- questions ---- */
document.querySelectorAll('.opts').forEach(group=>{
  group.addEventListener('click', e=>{ const o=e.target.closest('.opt'); if(!o) return;
    group.querySelectorAll('.opt').forEach(x=>x.classList.remove('sel')); o.classList.add('sel');
    intake[group.dataset.q] = o.dataset.val || o.textContent.trim();
    if(group.dataset.q==='budget') $('finHint').style.display='block';
    persist({ intake }); });
});

/* ---- contact ---- */
function buildSummary(){
  const procs=[...selectedProcs].map(S.procById).filter(Boolean);
  const names = procs.length?procs.map(p=>p.label).join(', '):(goalText()?'“'+goalText().slice(0,42)+'”':'Your consultation');
  let rows = `<div class="row"><b>✓ Interested in:</b> ${names}</div><div class="row"><b>✓ Photos:</b> ${photoData.filter(Boolean).length} shared confidentially</div>`;
  if(intake.timeline) rows += `<div class="row"><b>✓ Timeline:</b> ${intake.timeline}</div>`;
  $('contactSummary').innerHTML = rows;
}
function validateForm(){ const fn=$('fname').value.trim(), em=$('email').value.trim();
  $('submitCta').disabled = !(fn && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)); }
function submitForm(){ const name=$('fname').value.trim();
  $('confName').textContent=name||'there';
  persist({ contact:{firstName:name, email:$('email').value.trim(), phone:$('phone').value.trim()}, furthestStep:'complete' });
  fireDev();
  show('confirm');
}

/* ---- confirmation + dev console ---- */
function fireConfetti(){ const box=$('confetti'); box.innerHTML=''; const colors=[CFG.brand.primary,CFG.brand.accent,'#C2A269','#8A5A6E'];
  for(let i=0;i<26;i++){ const c=document.createElement('i'); c.style.left=Math.random()*100+'%'; c.style.background=colors[i%colors.length];
    c.style.animation=`fall ${1.6+Math.random()*1.2}s ${Math.random()*0.5}s ease-in forwards`; box.appendChild(c); } }
const kf=document.createElement('style'); kf.textContent='@keyframes fall{0%{opacity:0;transform:translateY(0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(640px) rotate(540deg)}}'; document.head.appendChild(kf);
function fireDev(){ const lead=S.get(leadId); const q=lead?lead.qual:{}; const note=$('devnote'); note.classList.add('fired');
  $('devbody').innerHTML = `<span class="muted">// lead saved &amp; qualified</span><br>`+
    `qualify(lead) → { tier:<code>'${q.tier}'</code>, score:<code>${q.score}</code>, est_value:<code>$${(q.value||0).toLocaleString()}</code>${(q.flags&&q.flags.length)?", flags:<code>['"+q.flags.join("','")+"']</code>":''} }`;
}

function restart(){ selectedProcs.clear(); clearPhotoData(); Object.keys(intake).forEach(k=>delete intake[k]); leadId=null; shotsTaken=0; camStep=0;
  document.querySelectorAll('.chip.on').forEach(c=>c.classList.remove('on'));
  $('goalText').value=''; $('procCta').disabled=true;
  $('shots').innerHTML=''; $('consent').checked=false; $('camBtn').style.display='block'; $('photoNext').style.display='none'; $('retakeBtn').style.display='none';
  document.querySelectorAll('.opt.sel').forEach(o=>o.classList.remove('sel'));
  ['fname','email','phone'].forEach(id=>$(id).value=''); $('submitCta').disabled=true;
  const note=$('devnote'); note.classList.remove('fired'); $('devbody').innerHTML='<span class="muted">// waiting for a completed consult…</span>';
  show('welcome');
}

/* ---- boot ---- */
applyBrand(); renderProcs(); updateFinHint();
window.next=next; window.goBack=goBack; window.openCamera=openCamera; window.capture=capture; window.closeCamera=closeCamera;
window.updateProcCta=updateProcCta; window.updatePhotoCtas=updatePhotoCtas; window.validateForm=validateForm; window.submitForm=submitForm; window.restart=restart;
