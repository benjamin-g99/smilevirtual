/* Aesthetic Virtual — Med Spa concern-led patient flow (instant AI plan, no video) */
const S = window.MedSpaStore; S.ensureSeeded(); const CFG = S.config();
const $ = id => document.getElementById(id);
const sel = new Set(); let leadId=null, timeline='', currentKey='welcome';
const flow=['welcome','concerns','plan','contact','confirm'];
const SCREENS={}; document.querySelectorAll('.screen').forEach(s=>{ if(s.dataset.key) SCREENS[s.dataset.key]=s; });
const m=n=>'$'+(n||0).toLocaleString();

function getSource(){ const p=new URLSearchParams(location.search),s={}; ['utm_source','utm_campaign','utm_content','utm_medium'].forEach(k=>{const v=p.get(k);if(v)s[k]=v;}); const f=p.get('from'); if(f&&!s.utm_source)s.utm_source=f; if(document.referrer)s.referrer=document.referrer; return s; }
const SOURCE=getSource();
function persist(o){ leadId=S.upsert(Object.assign({id:leadId,source:SOURCE},o)); }

/* brand */
document.documentElement.style.setProperty('--plum',CFG.brand.primary);
document.documentElement.style.setProperty('--rose',CFG.brand.accent);
$('spaName').textContent=CFG.spa.name; $('spaTag').textContent=CFG.spa.tagline; $('spaRating').textContent=CFG.spa.rating; $('spaReviews').textContent=CFG.spa.reviews;
const INIT=CFG.spa.name[0]; $('spaAv').textContent=INIT; $('spaAvConf').textContent=INIT; $('bookerName').textContent=CFG.spa.booker;

/* concern + timeline chips */
$('concernChips').innerHTML=S.CONCERNS.map(c=>`<div class="chip" data-id="${c.id}"><span class="ico">${c.icon}</span>${c.label}</div>`).join('');
$('concernChips').addEventListener('click',e=>{ const c=e.target.closest('.chip'); if(!c)return; const id=c.dataset.id;
  if(sel.has(id)){sel.delete(id);c.classList.remove('on');}else{sel.add(id);c.classList.add('on');} updateCta(); });
['ASAP','This month','Flexible','Just exploring'].forEach(t=>{ const el=document.createElement('div'); el.className='qchip'; el.textContent=t; el.onclick=()=>{ document.querySelectorAll('#timeChips .qchip').forEach(x=>x.classList.remove('on')); el.classList.add('on'); timeline=t; persist({intake:{timeline}}); }; $('timeChips').appendChild(el); });
function goalText(){ return $('goalText').value.trim(); }
$('goalText').addEventListener('input',updateCta);
function updateCta(){ $('concernCta').disabled = sel.size===0 && !goalText(); persist({concerns:[...sel], goalText:goalText()}); }

/* nav */
function show(key){ const order=[...flow], ti=order.indexOf(key);
  Object.entries(SCREENS).forEach(([k,el])=>{ el.classList.remove('active','left'); if(k===key)el.classList.add('active'); else{const ki=order.indexOf(k); if(ki>-1&&ki<ti)el.classList.add('left');} });
  currentKey=key;
  if(key==='plan') renderPlan();
  if(key==='confirm') fireConfetti();
  const i=flow.indexOf(key);
  $('progress').classList.toggle('hidden', key==='welcome'||key==='confirm');
  $('backBtn').classList.toggle('invis', !(i>1));
  $('barFill').style.width=(key==='confirm'?100:(i>0?i/(flow.length-1)*100:0))+'%';
  SCREENS[key].scrollTop=0;
  persist({furthestStep:key==='confirm'?'complete':key});
}
function next(){ const i=flow.indexOf(currentKey); if(i<flow.length-1) show(flow[i+1]); }
function goBack(){ const i=flow.indexOf(currentKey); if(i>0) show(flow[i-1]); }

/* instant plan render (the reward) */
function renderPlan(){
  const plan=S.recommend([...sel]); const C=CFG;
  let h=`<div class="planbox"><div class="planhd"><span>Your treatment plan</span><span class="ai">✨ AI-built</span></div>`;
  h+=plan.lines.map(l=>`<div class="plan-l"><span>${l.label} <span class="q">× ${l.qty} ${l.unit}</span></span><b>${m(l.total)}</b></div>`).join('')
    || `<div class="plan-l"><span>A custom plan</span><b>at your visit</b></div>`;
  h+=`<div class="plan-sum">${plan.discount?`<div class="r disc"><span>Bundle savings</span><span>−${m(plan.discount)}</span></div>`:''}<div class="r big"><span>Your plan</span><span>${m(plan.total)}</span></div><div class="r"><span>Financing from</span><span>${m(plan.financingMo)}/mo</span></div></div></div>`;
  if(plan.membership) h+=`<div class="memcard"><b>✨ ${C.membership.name} — ${m(C.membership.priceMo)}/mo</b><ul>${C.membership.perks.map(p=>`<li>${p}</li>`).join('')}</ul></div>`;
  h+=`<div class="finchips">${(C.financing.partners||[]).map(p=>`<span>💳 ${p}</span>`).join('')}</div>`;
  $('planRender').innerHTML=h;
}

/* contact */
function validateForm(){ const fn=$('fname').value.trim(), em=$('email').value.trim(); $('submitCta').disabled=!(fn&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)); }
function submitForm(){ const name=$('fname').value.trim(); $('confName').textContent=name||'there';
  persist({contact:{firstName:name,email:$('email').value.trim(),phone:$('phone').value.trim()}, intake:{timeline}, furthestStep:'complete'});
  const l=S.get(leadId); const note=$('devnote'); note.classList.add('fired');
  $('devbody').innerHTML=`<span class="muted">// plan drafted → Plan Builder queue</span><br>recommend(concerns) → total <b>${m(l.plan.total)}</b>, ${l.plan.lines.length} treatments${l.plan.membership?' + membership':''}`;
  show('confirm');
}

/* confetti */
function fireConfetti(){ const box=$('confetti'); box.innerHTML=''; const cols=[CFG.brand.primary,CFG.brand.accent,'#C2A269']; for(let i=0;i<24;i++){const c=document.createElement('i');c.style.left=Math.random()*100+'%';c.style.background=cols[i%cols.length];c.style.animation=`fall ${1.6+Math.random()*1.2}s ${Math.random()*.5}s ease-in forwards`;box.appendChild(c);} }
const kf=document.createElement('style'); kf.textContent='@keyframes fall{0%{opacity:0;transform:translateY(0) rotate(0)}10%{opacity:1}100%{opacity:0;transform:translateY(640px) rotate(540deg)}}'; document.head.appendChild(kf);

function restart(){ sel.clear(); leadId=null; timeline=''; document.querySelectorAll('.chip.on,.qchip.on').forEach(c=>c.classList.remove('on')); $('goalText').value=''; $('concernCta').disabled=true; ['fname','email','phone'].forEach(id=>$(id).value=''); $('submitCta').disabled=true; const n=$('devnote'); n.classList.remove('fired'); $('devbody').innerHTML='<span class="muted">// waiting…</span>'; show('welcome'); }

window.next=next; window.goBack=goBack; window.validateForm=validateForm; window.submitForm=submitForm; window.restart=restart;
