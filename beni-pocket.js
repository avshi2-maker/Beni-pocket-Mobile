// ════════════════════════════════════════════════════════
// BENI POCKET — main logic
// Loaded from Supabase Storage at runtime
// Version: 15-03-2026
// ════════════════════════════════════════════════════════

// ── STATE ──────────────────────────────────────────────
let quickReplies      = [];
let todos             = [];
let todoFilter        = 'all';
let isRecording       = false;
let recognition       = null;
let recInterval       = null;
let recSeconds        = 0;
let currentTranscript = '';
let pendingReplyLabel = '';
let pendingPhone      = '';
let currentDirection  = 'incoming';
let allCallLogs       = [];
let currentLogFilter  = 'all';
let currentAIResult   = null;

// SB_URL and SB_KEY already declared above

// ── INIT ───────────────────────────────────────────────
// initApp() merged into bootstrap() above

// Panel init hooks (called after each panel HTML is injected)
function initPanel_call()  { renderQuickGrid(); }
function initPanel_todo()  { renderTodos(); }
function initPanel_log()   { loadLog(); }
function initPanel_eod()   { renderEOD(); }
function initPanel_voice() { initSpeechRecognition(); }

// Tab hooks
function onTab_log()   { loadLog(); }
function onTab_eod()   { renderEOD(); }

// ── CLAUDE AI ──────────────────────────────────────────
async function analyzeWithClaude(transcript) {
  const ANTHROPIC_KEY = window.APP?.config?.anthropic_key;
  if (!ANTHROPIC_KEY) { console.warn('No Anthropic key in app_config'); return null; }
  const prompt = `אתה עוזר אישי בשטח לקבלן בנייה. נתח את ההקלטה הבאה והחזר JSON בלבד.

הקלטה: "${transcript}"

החזר JSON בדיוק בפורמט הזה (בעברית):
{
  "summary": "סיכום קצר במשפט אחד",
  "category": "אחת מ: משימה | בעיית_אתר | חומרים | לקוח | כספים | כללי",
  "priority": "אחת מ: גבוה | רגיל | נמוך",
  "action_items": ["פעולה 1", "פעולה 2"],
  "tags": ["תגית1", "תגית2"],
  "project_hint": "שם פרויקט אם הוזכר, אחרת מחרוזת ריקה"
}
החזר JSON בלבד.`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const raw = data.content[0].text.replace(/```json|```/g,'').trim();
    return JSON.parse(raw);
  } catch(e) { console.error('Claude error:', e); return null; }
}

function renderAICard(result) {
  if (!result) return;
  currentAIResult = result;
  const pClass = { 'גבוה':'badge-high','רגיל':'badge-normal','נמוך':'badge-low' };
  const pEmoji = { 'גבוה':'🔴','רגיל':'🟠','נמוך':'⚪' };
  const s = (id, v) => { const el=document.getElementById(id); if(el) el[typeof v==='string'?'textContent':'innerHTML']=v; };
  s('ai-summary', result.summary||'');
  let meta = '';
  if (result.category)     meta += `<span class="ai-badge badge-cat">📂 ${result.category}</span>`;
  if (result.priority)     meta += `<span class="ai-badge ${pClass[result.priority]||'badge-normal'}">${pEmoji[result.priority]||''} ${result.priority}</span>`;
  if (result.project_hint) meta += `<span class="ai-badge badge-project">🏗️ ${result.project_hint}</span>`;
  (result.tags||[]).forEach(t => meta += `<span class="ai-badge badge-tag">#${t}</span>`);
  s('ai-meta', meta);
  s('ai-actions-list', (result.action_items||[]).map(a=>`<div class="ai-action-item"><span>▸</span><span>${escHtml(a)}</span></div>`).join(''));
  const sp = document.getElementById('ai-spinner'); if(sp) sp.style.display='none';
  const card = document.getElementById('ai-card'); if(card) card.classList.add('visible');
}

// ── VOICE ──────────────────────────────────────────────
function initSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { const s=document.getElementById('rec-status'); if(s) s.textContent='הדפדפן אינו תומך בזיהוי קול'; return; }
  window._SR = SR;
}

function startHold(e) {
  if (e) e.preventDefault();
  if (!window._SR) { toast('זיהוי קול אינו נתמך'); return; }
  if (isRecording) return;
  isRecording = true;
  recognition = new window._SR();
  recognition.lang = 'he-IL'; recognition.continuous = false; recognition.interimResults = false;
  recognition.onresult = (ev) => {
    const heard = ev.results[0][0].transcript.trim();
    if (!heard) return;
    currentTranscript += (currentTranscript ? ' ' : '') + heard;
    const ph=document.getElementById('transcript-placeholder'); if(ph) ph.style.display='none';
    const tt=document.getElementById('transcript-text'); if(tt) tt.textContent=currentTranscript;
    const ta=document.getElementById('transcript-actions'); if(ta) ta.style.display='flex';
  };
  recognition.onerror = (ev) => { if(ev.error==='no-speech'||ev.error==='aborted') return; toast('שגיאה: '+ev.error); };
  recognition.start();
  const ring=document.getElementById('mic-ring'); if(ring){ring.classList.add('recording');}
  const mi=document.getElementById('mic-icon'); if(mi) mi.textContent='⏹️';
  const rs=document.getElementById('rec-status'); if(rs) rs.textContent='מקליט... שחרר לסיום';
  const rt=document.getElementById('rec-timer'); if(rt) rt.style.display='block';
  recSeconds=0;
  recInterval=setInterval(()=>{recSeconds++;const m=Math.floor(recSeconds/60),s=recSeconds%60;const rt=document.getElementById('rec-timer');if(rt)rt.textContent=m+':'+String(s).padStart(2,'0');},1000);
}

async function endHold(e) {
  if (e) e.preventDefault();
  if (!isRecording) return;
  isRecording = false;
  try { recognition.stop(); } catch(err) {}
  clearInterval(recInterval);
  const ring=document.getElementById('mic-ring');if(ring){ring.classList.remove('recording');ring.classList.add('analyzing');}
  const mi=document.getElementById('mic-icon');if(mi)mi.textContent='🧠';
  const rs=document.getElementById('rec-status');if(rs)rs.textContent='מנתח עם AI...';
  const rt=document.getElementById('rec-timer');if(rt){rt.style.display='none';rt.textContent='0:00';}
  const text = currentTranscript.trim();
  if (text) {
    const card=document.getElementById('ai-card');if(card)card.classList.add('visible');
    const sp=document.getElementById('ai-spinner');if(sp)sp.style.display='inline-block';
    const sum=document.getElementById('ai-summary');if(sum)sum.textContent='מנתח...';
    // Analyze first, then save with ai_result
    const result = await analyzeWithClaude(text);
    renderAICard(result);
    toast('🧠 ניתוח AI הושלם');
    try {
      await fetch(SB_URL+'/rest/v1/voice_memos',{method:'POST',
        headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},
        body:JSON.stringify({
          transcript: text,
          duration_sec: recSeconds,
          ai_result: result ? JSON.stringify(result) : null,
          ai_summary: result?.summary || null,
          ai_category: result?.category || null,
          ai_priority: result?.priority || null,
          project_hint: result?.project_hint || null,
          is_processed: false,
          created_at: new Date().toISOString()
        })});
    } catch(err){ console.error('voice_memos save:', err); }
  }
  const ring2=document.getElementById('mic-ring');if(ring2){ring2.classList.remove('analyzing');}
  const mi2=document.getElementById('mic-icon');if(mi2)mi2.textContent='🎙️';
  const rs2=document.getElementById('rec-status');if(rs2)rs2.textContent='לחץ והחזק להקלטה';
}

function clearTranscript() {
  currentTranscript=''; currentAIResult=null;
  const tt=document.getElementById('transcript-text');if(tt)tt.textContent='';
  const tp=document.getElementById('transcript-placeholder');if(tp)tp.style.display='inline';
  const ta=document.getElementById('transcript-actions');if(ta)ta.style.display='none';
  const card=document.getElementById('ai-card');if(card)card.classList.remove('visible');
  const rt=document.getElementById('rec-timer');if(rt)rt.textContent='0:00';
}

async function saveMemoAsReminder() {
  const text = currentTranscript.trim();
  if (!text) { toast('אין תמליל לשמירה'); return; }
  const label = currentAIResult ? currentAIResult.summary : text;
  await addReminderToDB(label, 'voice', currentAIResult?.priority==='גבוה'?'high':'normal');
  await loadTodos(); switchTab('todo'); toast('✅ נשמר כמשימה');
}
function sendMemoWA() {
  const text = currentTranscript.trim();
  if (!text) { toast('אין תמליל לשליחה'); return; }
  let msg = '📝 תזכורת:\n' + text;
  if (currentAIResult) {
    msg += '\n\n🧠 סיכום AI: ' + currentAIResult.summary;
    if (currentAIResult.action_items?.length) msg += '\n\nמשימות:\n' + currentAIResult.action_items.map(a=>'• '+a).join('\n');
  }
  window.location.href = 'https://wa.me/?text=' + encodeURIComponent(msg);
}

// ── EOD — NOW USES SUPABASE, NOT sessionStorage ─────────
async function loadEODFromSupabase() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await window.sb.from('eod_sessions')
      .select('*').eq('session_date', today).eq('is_sent', false).order('created_at');
    window._eodMemos = data || [];
  } catch(e) { window._eodMemos = []; }
  updateEODBadge();
}

async function saveToEOD() {
  const text = currentTranscript.trim();
  if (!text) { toast('אין תמליל לשמירה'); return; }
  try {
    await window.sb.from('eod_sessions').insert({
      transcript: text,
      ai_result:  currentAIResult || null,
      duration_sec: recSeconds,
      session_date: new Date().toISOString().split('T')[0],
    });
    await loadEODFromSupabase();
    toast('🧠 נשמר לסוף יום');
    clearTranscript();
  } catch(e) { toast('שגיאה: '+e.message); }
}

function updateEODBadge() {
  const memos = window._eodMemos||[];
  const badge = document.getElementById('eod-badge');
  if (!badge) return;
  if (memos.length>0){badge.textContent=memos.length;badge.style.display='inline';}
  else badge.style.display='none';
}

function renderEOD() {
  const memos = window._eodMemos||[];
  const list  = document.getElementById('eod-list');
  const empty = document.getElementById('eod-empty');
  const send  = document.getElementById('eod-send-section');
  if (!list) return;
  if (memos.length===0) {
    list.innerHTML=''; if(empty)empty.style.display='block'; if(send)send.style.display='none';
    ['eod-count','eod-tasks','eod-high'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='0';});
    return;
  }
  if(empty)empty.style.display='none'; if(send)send.style.display='block';
  let totalTasks=0, highCount=0;
  memos.forEach(m=>{const ai=m.ai_result;if(ai?.action_items)totalTasks+=ai.action_items.length;if(ai?.priority==='גבוה')highCount++;});
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('eod-count',memos.length); s('eod-tasks',totalTasks); s('eod-high',highCount);
  list.innerHTML = memos.map((m,i)=>{
    const t = new Date(m.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
    const ai = m.ai_result;
    const summary = ai ? ai.summary : m.transcript.substring(0,80)+(m.transcript.length>80?'...':'');
    const actions = ai?.action_items?.length ? '▸ '+ai.action_items.join(' | ') : '';
    const catBadge = ai?.category ? `<span class="ai-badge badge-cat" style="font-size:10px;padding:2px 7px;">${ai.category}</span>` : '';
    const priColor = ai?.priority==='גבוה'?'var(--red)':'var(--border)';
    return `<div class="eod-memo" style="border-right:3px solid ${priColor}">
      <div class="eod-memo-header">
        <div class="eod-memo-summary">${escHtml(summary)}</div>
        <div style="display:flex;align-items:center;gap:6px;">
          <div class="eod-memo-time">${t}</div>
          <button onclick="removeEODMemo('${m.id}')" style="background:none;border:none;color:var(--text3);font-size:14px;cursor:pointer;">✕</button>
        </div>
      </div>
      ${catBadge}
      ${actions?`<div class="eod-memo-actions">📌 ${escHtml(actions)}</div>`:''}
      <div class="eod-memo-raw">${escHtml(m.transcript.substring(0,120))}${m.transcript.length>120?'...':''}</div>
    </div>`;
  }).join('');
}

async function removeEODMemo(id) {
  await window.sb.from('eod_sessions').delete().eq('id',id);
  await loadEODFromSupabase(); renderEOD();
}
async function clearEOD() {
  if (!confirm('למחוק את כל ההקלטות של היום?')) return;
  const today = new Date().toISOString().split('T')[0];
  await window.sb.from('eod_sessions').delete().eq('session_date',today);
  await loadEODFromSupabase(); renderEOD();
}
async function sendToCRM() {
  const memos = window._eodMemos||[];
  if (!memos.length) { toast('אין הקלטות לשליחה'); return; }
  toast('📤 שולח ל-CRM...');
  const date = new Date().toLocaleDateString('he-IL');
  let content = `📱 סיכום בני פוקט — ${date}\n\n`;
  memos.forEach(m=>{
    const t=new Date(m.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
    const ai=m.ai_result;
    content+=`[${t}] `;
    if(ai){content+=`${ai.category||''}: ${ai.summary}\n`;if(ai.action_items?.length)content+=ai.action_items.map(a=>`  • ${a}`).join('\n')+'\n';}
    else content+=m.transcript+'\n';
    content+='\n';
  });
  try {
    await window.sb.from('reports').insert({title:`בני פוקט — סיכום ${date}`,content,report_type:'beni_eod',created_at:new Date().toISOString()});
    // Mark EOD memos as sent
    const ids = memos.map(m=>m.id);
    await window.sb.from('eod_sessions').update({is_sent:true,sent_at:new Date().toISOString()}).in('id',ids);
    await loadEODFromSupabase(); renderEOD();
    toast('✅ נשלח ל-CRM בהצלחה!');
  } catch(e){ toast('❌ שגיאה — '+e.message); }
}
async function sendAllAsReminders() {
  const memos=window._eodMemos||[];
  if(!memos.length){toast('אין הקלטות');return;}
  let count=0;
  for(const m of memos){const ai=m.ai_result;
    if(ai?.action_items?.length){for(const a of ai.action_items){await addReminderToDB(a,'eod_ai',ai.priority==='גבוה'?'high':'normal');count++;}}
    else{await addReminderToDB(ai?ai.summary:m.transcript,'eod_voice','normal');count++;}
  }
  await loadTodos(); toast(`✅ ${count} משימות נוספו`); switchTab('todo');
}
function shareEODSummary() {
  const memos=window._eodMemos||[];
  if(!memos.length){toast('אין הקלטות לשיתוף');return;}
  const date=new Date().toLocaleDateString('he-IL');
  let text=`📋 סיכום יום — בני פרסקי — ${date}\n\n`;
  memos.forEach((m,i)=>{const t=new Date(m.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});text+=`${i+1}. [${t}] ${m.ai_result?m.ai_result.summary:m.transcript.substring(0,60)}\n`;if(m.ai_result?.action_items?.length)text+=m.ai_result.action_items.map(a=>`   ▸ ${a}`).join('\n')+'\n';});
  window.location.href='https://wa.me/?text='+encodeURIComponent(text);
}

// ── QUICK REPLIES ───────────────────────────────────────
// ── QUICK REPLIES — 100% Supabase driven ─────────────────────────
// Edit replies in Supabase → quick_replies table
// Fields: id, label, emoji, message, is_active, sort_order
async function loadQuickReplies() {
  try {
    const res = await fetch(SB_URL+'/rest/v1/quick_replies?is_active=eq.true&order=sort_order',
      {headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
    const data = await res.json();
    quickReplies = Array.isArray(data) && data.length ? data : [];
    if (!quickReplies.length) console.warn('quick_replies table empty — add rows in Supabase');
  } catch(e) { console.error('loadQuickReplies:', e); quickReplies = []; }
  renderQuickGrid();
}
function renderQuickGrid() {
  const grid = document.getElementById('quick-grid'); if(!grid)return;
  grid.innerHTML = quickReplies.map(r =>
    `<button class="qbtn" onclick="openReplyModal('${r.id}')"><span class="qemoji">${r.emoji}</span>${r.label}</button>`
  ).join('');
}
function openReplyModal(replyId) {
  const reply = quickReplies.find(r=>String(r.id)===String(replyId)); if(!reply)return;
  const name = document.getElementById('caller-name')?.value?.trim()||'';
  let msg = reply.message;
  if(name) msg=msg.replace('שלום,',`שלום ${name},`);
  const mt=document.getElementById('modal-reply-title');if(mt)mt.textContent=reply.label+' '+reply.emoji;
  const mm=document.getElementById('modal-msg');if(mm)mm.textContent=msg;
  pendingReplyLabel=reply.label;
  pendingPhone=document.getElementById('caller-phone')?.value?.trim()||'';
  const mo=document.getElementById('modal-reply');if(mo)mo.classList.add('open');
}
async function sendQuickWA() {
  const msg=document.getElementById('modal-msg')?.textContent?.trim()||'';
  const name=document.getElementById('caller-name')?.value?.trim()||'';
  const note=document.getElementById('caller-note')?.value?.trim()||'';
  await saveCallLog(name,pendingPhone,pendingReplyLabel,note,true);
  const ph=pendingPhone.replace(/\D/g,'');
  window.location.href=ph?`https://wa.me/972${ph.replace(/^0/,'')}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;
  closeModal('modal-reply'); clearCallerForm(); toast('✅ נשלח לוואטסאפ ונשמר');
}
function openCustomReply(){document.getElementById('custom-msg').value='';document.getElementById('modal-custom').classList.add('open');}
async function sendCustomWA(){
  const msg=document.getElementById('custom-msg')?.value?.trim()||'';
  const name=document.getElementById('caller-name')?.value?.trim()||'';
  const rawPhone=document.getElementById('caller-phone')?.value?.trim()||'';
  if(!msg){toast('כתוב הודעה תחילה');return;}
  await saveCallLog(name,rawPhone,'מותאם אישית',msg,true);
  const ph=rawPhone.replace(/\D/g,'');
  window.location.href=ph?`https://wa.me/972${ph.replace(/^0/,'')}?text=${encodeURIComponent(msg)}`:`https://wa.me/?text=${encodeURIComponent(msg)}`;
  closeModal('modal-custom'); clearCallerForm(); toast('✅ נשלח לוואטסאפ');
}
async function logCallOnly(){
  const name=document.getElementById('caller-name')?.value?.trim()||'';
  const phone=document.getElementById('caller-phone')?.value?.trim()||'';
  const note=document.getElementById('caller-note')?.value?.trim()||'';
  if(!name&&!phone){toast('הכנס שם או מספר טלפון');return;}
  await saveCallLog(name,phone,'',note,false);
  clearCallerForm(); toast('📝 שיחה נשמרה ביומן');
}
async function saveCallLog(name,phone,replyLabel,notes,waSent){
  try{await fetch(SB_URL+'/rest/v1/call_log',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({caller_name:name||'לא ידוע',phone,quick_reply:replyLabel,notes,direction:currentDirection,wa_sent:waSent,wa_sent_at:waSent?new Date().toISOString():null,created_at:new Date().toISOString()})});}catch(e){console.error(e);}
}
function clearCallerForm(){['caller-name','caller-phone','caller-note'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});}

// ── TODO ────────────────────────────────────────────────
async function loadTodos(){
  try{const res=await fetch(SB_URL+'/rest/v1/reminders?order=created_at.desc',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});todos=await res.json();}catch(e){todos=[];}
  if(!Array.isArray(todos))todos=[];
  renderTodos(); updateTodoBadge();
}
function renderTodos(){
  const list=document.getElementById('todo-list');const empty=document.getElementById('todo-empty');if(!list)return;
  let filtered=todos;
  if(todoFilter==='active')filtered=todos.filter(t=>!t.is_done);
  if(todoFilter==='done')  filtered=todos.filter(t=> t.is_done);
  if(!filtered.length){list.innerHTML='';if(empty)empty.style.display='block';return;}
  if(empty)empty.style.display='none';
  list.innerHTML=filtered.map(t=>`<div class="todo-item ${t.is_done?'done':''}" id="todo-${t.id}">
    <div class="priority-dot p-${t.priority||'normal'}"></div>
    <div class="todo-check ${t.is_done?'checked':''}" onclick="toggleTodo('${t.id}',${t.is_done})">${t.is_done?'✓':''}</div>
    <div class="todo-text">${escHtml(t.text)}</div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
      <div class="todo-time">${timeAgo(t.created_at)}</div>
      <button class="todo-del" onclick="deleteTodo('${t.id}')">✕</button>
    </div>
  </div>`).join('');
}
function updateTodoBadge(){const active=todos.filter(t=>!t.is_done).length;const badge=document.getElementById('todo-badge');if(!badge)return;if(active>0){badge.textContent=active;badge.style.display='inline';}else badge.style.display='none';}
async function addTodo(){const inp=document.getElementById('todo-input');const text=inp?.value?.trim()||'';if(!text)return;if(inp)inp.value='';await addReminderToDB(text,'manual');await loadTodos();}
async function addReminderToDB(text,source='manual',priority='normal'){try{await fetch(SB_URL+'/rest/v1/reminders',{method:'POST',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({text,source,priority,is_done:false,created_at:new Date().toISOString()})});}catch(e){console.error(e);}}
async function toggleTodo(id,isDone){try{await fetch(SB_URL+'/rest/v1/reminders?id=eq.'+id,{method:'PATCH',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({is_done:!isDone,done_at:!isDone?new Date().toISOString():null})});await loadTodos();}catch(e){}}
async function deleteTodo(id){try{await fetch(SB_URL+'/rest/v1/reminders?id=eq.'+id,{method:'DELETE',headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});await loadTodos();}catch(e){}}
function filterTodos(f){todoFilter=f;['all','active','done'].forEach(x=>{const btn=document.getElementById('f-'+x);if(!btn)return;if(x===f){btn.style.background='var(--orange)';btn.style.color='white';btn.style.borderColor='var(--orange)';}else{btn.style.background='transparent';btn.style.color='var(--text2)';btn.style.borderColor='var(--border)';}});renderTodos();}

// ── CALL LOG ────────────────────────────────────────────
async function loadLog(){
  const list=document.getElementById('log-list');const empty=document.getElementById('log-empty');if(!list)return;
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">טוען...</div>';
  const todayStart=new Date();todayStart.setHours(0,0,0,0);
  try{
    const res=await fetch(SB_URL+'/rest/v1/call_log?order=created_at.desc&limit=50',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});
    if(!res.ok)throw new Error('HTTP '+res.status);
    allCallLogs=await res.json();if(!Array.isArray(allCallLogs))allCallLogs=[];
    const today=allCallLogs.filter(r=>new Date(r.created_at)>=todayStart);
    const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
    s('stat-in',today.filter(r=>r.direction==='incoming').length);
    s('stat-out',today.filter(r=>r.direction==='outgoing').length);
    s('stat-miss',today.filter(r=>r.direction==='missed').length);
    s('stat-wa',today.filter(r=>r.wa_sent).length);
    renderLog(allCallLogs);
  }catch(e){if(list)list.innerHTML='<div style="color:var(--red);padding:20px;text-align:center;font-size:13px;">שגיאה: '+e.message+'</div>';}
}
function renderLog(logs){
  const list=document.getElementById('log-list');const empty=document.getElementById('log-empty');if(!list)return;
  let filtered=currentLogFilter==='all'?logs:logs.filter(r=>r.direction===currentLogFilter);
  if(!filtered||!filtered.length){list.innerHTML='';if(empty)empty.style.display='flex';return;}
  if(empty)empty.style.display='none';
  const groups={};
  filtered.forEach(r=>{const key=new Date(r.created_at).toLocaleDateString('he-IL',{weekday:'long',day:'numeric',month:'long'});if(!groups[key])groups[key]=[];groups[key].push(r);});
  const dirLabel={incoming:'📞 נכנסת',outgoing:'📲 יוצאת',missed:'📵 לא נענה'};
  const dirClass={incoming:'dir-in',outgoing:'dir-out',missed:'dir-miss'};
  window._callData={};
  let html='';
  Object.entries(groups).forEach(([date,items])=>{
    html+='<div class="log-section-title">'+date+'</div>';
    items.forEach(r=>{
      const id=r.id||Math.random().toString(36).slice(2);
      window._callData[id]={name:r.caller_name||'לא ידוע',phone:r.phone||''};
      const t=new Date(r.created_at).toLocaleTimeString('he-IL',{hour:'2-digit',minute:'2-digit'});
      const dir=r.direction||'incoming';
      const note=r.note||r.notes;
      html+='<div class="call-card">'+
        '<div class="call-card-hdr">'+
          '<div><span class="call-name">'+escHtml(r.caller_name||'לא ידוע')+'</span>'+
          '<span class="call-dir-badge '+dirClass[dir]+'" style="margin-right:8px;">'+(dirLabel[dir]||dir)+'</span></div>'+
          '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;"><span class="call-time">'+t+'</span>'+(r.wa_sent?'<span class="call-wa-badge">✅ וואטסאפ</span>':'')+'</div>'+
        '</div>'+
        '<div class="call-phone">'+escHtml(r.phone||'')+'</div>'+
        (r.quick_reply?'<div style="font-size:11px;color:var(--text3);margin-top:2px;">תשובה: '+escHtml(r.quick_reply)+'</div>':'')+
        // ── THE FIX: show note field ──────────────────────────
        (note?'<div class="call-note">📝 '+escHtml(note)+'</div>':'')+
        '<div class="call-actions">'+
          '<button class="call-act-btn" onclick="_callPhone(\''+id+'\')">📞 התקשר</button>'+
          '<button class="call-act-btn" onclick="_prefillFromLog(\''+id+'\')">✏️ מלא טופס</button>'+
          '<button class="call-act-btn" onclick="_waFromLog(\''+id+'\')">💬 וואטסאפ</button>'+
        '</div></div>';
    });
  });
  list.innerHTML=html;
}
function filterLog(f){currentLogFilter=f;['all','in','out','miss'].forEach(t=>{const el=document.getElementById('lf-'+t);if(el)el.classList.remove('active');});const map={all:'all',incoming:'in',outgoing:'out',missed:'miss'};const el=document.getElementById('lf-'+map[f]);if(el)el.classList.add('active');renderLog(allCallLogs);}
function _callPhone(id){const d=window._callData?.[id];if(d?.phone)window.location.href='tel:'+d.phone;}
function _prefillFromLog(id){const d=window._callData?.[id];if(!d)return;const cn=document.getElementById('caller-name');const cp=document.getElementById('caller-phone');if(cn)cn.value=d.name;if(cp)cp.value=d.phone;switchTab('call');toast('✅ הטופס מולא');}
function _waFromLog(id){const d=window._callData?.[id];if(d?.phone)window.location.href='https://wa.me/'+d.phone.replace(/\D/g,'');}

// ── DIRECTION ───────────────────────────────────────────
function setDir(dir){currentDirection=dir;['in','out','miss'].forEach(d=>{const btn=document.getElementById('dir-'+d);if(btn)btn.classList.remove('dir-active');});const map={incoming:'in',outgoing:'out',missed:'miss'};const btn=document.getElementById('dir-'+map[dir]);if(btn)btn.classList.add('dir-active');}

// ── PHONE LOOKUP ────────────────────────────────────────
let _lookupTimeout=null,_lookupResult=null;
async function autoLookupPhone(val){
  const clean=val.replace(/\D/g,'');const box=document.getElementById('lookup-result');if(!box)return;
  if(clean.length<7){box.style.display='none';_lookupResult=null;return;}
  clearTimeout(_lookupTimeout);
  _lookupTimeout=setTimeout(async()=>{
    try{const res=await fetch(SB_URL+'/rest/v1/call_log?phone=ilike.*'+clean+'*&order=created_at.desc&limit=1&select=caller_name,phone',{headers:{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}});const rows=await res.json();
    if(rows?.length>0&&rows[0].caller_name&&rows[0].caller_name!=='לא ידוע'){_lookupResult=rows[0];box.textContent='✅ נמצא: '+rows[0].caller_name+' — לחץ למילוי';box.style.display='block';}else{box.style.display='none';_lookupResult=null;}}catch(e){box.style.display='none';}
  },400);
}
function applyLookup(){if(!_lookupResult)return;const cn=document.getElementById('caller-name');const cp=document.getElementById('caller-phone');if(cn)cn.value=_lookupResult.caller_name;if(cp)cp.value=_lookupResult.phone;document.getElementById('lookup-result').style.display='none';_lookupResult=null;}

// ── HELPERS ─────────────────────────────────────────────
function closeModal(id){const el=document.getElementById(id);if(el)el.classList.remove('open');}
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function timeAgo(iso){if(!iso)return'';const diff=Math.floor((Date.now()-new Date(iso))/1000);if(diff<60)return'עכשיו';if(diff<3600)return Math.floor(diff/60)+' דק׳';if(diff<86400)return Math.floor(diff/3600)+' שע׳';return Math.floor(diff/86400)+' ימים';}


// ── GOOGLE CALENDAR MOBILE ────────────────────────────────
let gcalMobileInited = false;

function initGcalMobile() {
  if (!gcalMobileInited) {
    gcalMobileInited = true;
    switchGcalMobile('agenda'); // load agenda by default
  }
}

function switchGcalMobile(view) {
  // Update buttons
  document.querySelectorAll('.gcal-view-btn').forEach(function(btn) {
    const isActive = btn.dataset.view === view;
    btn.style.background    = isActive ? 'var(--orange)' : 'var(--surface)';
    btn.style.color         = isActive ? 'white' : 'var(--text2)';
    btn.style.borderColor   = isActive ? 'var(--orange)' : 'var(--border)';
  });
  // Show/hide panels
  ['agenda','week','month'].forEach(function(v) {
    const div = document.getElementById('gcal-m-' + v);
    if (div) div.style.display = v === view ? 'block' : 'none';
  });
  // Lazy-load iframe
  const iframe = document.getElementById('gcal-m-iframe-' + view);
  if (iframe && iframe.dataset.src && iframe.src === 'about:blank') {
    iframe.src = iframe.dataset.src;
  }
}


// ══════════════════════════════════════════════════════
// GOOGLE TASKS INTEGRATION
// ══════════════════════════════════════════════════════

// ⚠️  Replace with your real Client ID from Google Cloud Console
const GTASKS_CLIENT_ID = '900160560035-th3ok333jm84e5clvs38k2fo3v7dbnki.apps.googleusercontent.com';
const GTASKS_SCOPE = 'https://www.googleapis.com/auth/tasks https://www.googleapis.com/auth/calendar.events';
const GTASKS_API   = 'https://tasks.googleapis.com/tasks/v1';

let gtasksToken      = null;   // OAuth access token
let gtasksLists      = [];     // all task lists
let gtasksCurrentList= null;   // selected list id
let gtasksInited     = false;

// ── Init: called when tab opens ──────────────────────────
function gtasksInit() {
  if (gtasksInited) return;
  gtasksInited = true;
  // Check for saved token in sessionStorage
  const saved = sessionStorage.getItem('gtasks_token');
  if (saved) {
    gtasksToken = saved;
    gtasksShowMain();
    gtasksLoadLists();
  }
  // else: connect screen is shown by default
}

// ── Sign in with Google ──────────────────────────────────
function gtasksSignIn() {
  const status = document.getElementById('gtasks-signin-status');
  if (status) status.textContent = 'מתחבר...';

  if (!window.google || !window.google.accounts) {
    if (status) status.textContent = '❌ Google SDK לא נטען. רענן ונסה שוב.';
    return;
  }

  const client = window.google.accounts.oauth2.initTokenClient({
    client_id: GTASKS_CLIENT_ID,
    scope: GTASKS_SCOPE,
    callback: function(response) {
      if (response.error) {
        if (status) status.textContent = '❌ ' + response.error;
        return;
      }
      gtasksToken = response.access_token;
      sessionStorage.setItem('gtasks_token', gtasksToken);
      gtasksShowMain();
      gtasksLoadLists();
    }
  });
  client.requestAccessToken();
}

// ── Sign out ─────────────────────────────────────────────
function gtasksSignOut() {
  gtasksToken = null;
  sessionStorage.removeItem('gtasks_token');
  gtasksInited = false;
  const main    = document.getElementById('gtasks-main');
  const connect = document.getElementById('gtasks-connect-screen');
  if (main)    main.style.display    = 'none';
  if (connect) connect.style.display = 'block';
}

// ── Show main panel after login ──────────────────────────
function gtasksShowMain() {
  const main    = document.getElementById('gtasks-main');
  const connect = document.getElementById('gtasks-connect-screen');
  if (main) {
    main.style.display    = 'flex';
    main.style.flexDirection = 'column';
  }
  if (connect) connect.style.display = 'none';
}

// ── Load all task lists ──────────────────────────────────
async function gtasksLoadLists() {
  if (!gtasksToken) return;
  try {
    const res  = await fetch(GTASKS_API + '/users/@me/lists?maxResults=20', {
      headers: { Authorization: 'Bearer ' + gtasksToken }
    });
    if (res.status === 401) { gtasksSignOut(); return; }
    const data = await res.json();
    gtasksLists = data.items || [];

    const sel = document.getElementById('gtasks-list-sel');
    if (sel) {
      sel.innerHTML = gtasksLists.map(function(l) {
        return '<option value="' + l.id + '">' + l.title + '</option>';
      }).join('');
      sel.onchange = function() {
        gtasksCurrentList = this.value;
        gtasksLoadTasks();
      };
      // Default: first list (usually "My Tasks" / "המשימות שלי")
      if (gtasksLists.length) {
        gtasksCurrentList = gtasksLists[0].id;
        gtasksLoadTasks();
      }
    }
  } catch(e) {
    console.error('gtasksLoadLists:', e);
  }
}

// ── Load tasks for selected list ─────────────────────────
async function gtasksLoadTasks() {
  if (!gtasksToken || !gtasksCurrentList) return;
  const listEl = document.getElementById('gtasks-list');
  if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);">טוען...</div>';
  try {
    const res  = await fetch(
      GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks?showCompleted=true&showHidden=false&maxResults=100',
      { headers: { Authorization: 'Bearer ' + gtasksToken } }
    );
    if (res.status === 401) { gtasksSignOut(); return; }
    const data = await res.json();
    const tasks = (data.items || []).sort(function(a, b) {
      // Incomplete first, then by due date
      if (a.status === b.status) {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return new Date(a.due) - new Date(b.due);
      }
      return a.status === 'completed' ? 1 : -1;
    });
    gtasksRenderTasks(tasks);
  } catch(e) {
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--red);">שגיאה: ' + e.message + '</div>';
  }
}

// ── Render tasks list ────────────────────────────────────
function gtasksRenderTasks(tasks) {
  const listEl = document.getElementById('gtasks-list');
  if (!listEl) return;

  if (!tasks.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--text3);"><div style="font-size:36px;margin-bottom:10px;">✅</div><div style="font-size:14px;">אין מטלות — הוסף מטלה למעלה</div></div>';
    return;
  }

  listEl.innerHTML = '';
  const today = new Date().toISOString().split('T')[0];

  tasks.forEach(function(task) {
    const isDone    = task.status === 'completed';
    const dueDate   = task.due ? task.due.split('T')[0] : null;
    const isOverdue = dueDate && dueDate < today && !isDone;
    const isDueToday= dueDate === today && !isDone;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:flex-start;gap:12px;padding:12px 4px;border-bottom:1px solid var(--border);transition:opacity 0.3s;' + (isDone ? 'opacity:0.45;' : '');

    // Checkbox
    const chk = document.createElement('div');
    chk.style.cssText = 'width:24px;height:24px;border-radius:50%;border:2.5px solid ' + (isDone ? '#22c55e' : isOverdue ? '#ef4444' : 'var(--border)') + ';display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px;background:' + (isDone ? '#22c55e' : 'transparent') + ';transition:all 0.2s;';
    chk.innerHTML = isDone ? '<span style="color:white;font-size:13px;">✓</span>' : '';
    chk.dataset.id     = task.id;
    chk.dataset.status = task.status;
    chk.addEventListener('click', function() {
      gtasksToggle(this.dataset.id, this.dataset.status);
    });
    row.appendChild(chk);

    // Content
    const content = document.createElement('div');
    content.style.cssText = 'flex:1;min-width:0;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:600;color:var(--text);line-height:1.4;' + (isDone ? 'text-decoration:line-through;color:var(--text3);' : '');
    title.textContent = task.title;
    content.appendChild(title);

    if (task.notes) {
      const notes = document.createElement('div');
      notes.style.cssText = 'font-size:12px;color:var(--text3);margin-top:3px;line-height:1.5;';
      notes.textContent = task.notes;
      content.appendChild(notes);
    }

    if (dueDate) {
      const due = document.createElement('div');
      due.style.cssText = 'font-size:11px;font-weight:700;margin-top:4px;color:' +
        (isOverdue ? '#ef4444' : isDueToday ? '#f59e0b' : 'var(--text3)') + ';';
      const dueFmt = new Date(dueDate + 'T12:00:00').toLocaleDateString('he-IL', {day:'numeric', month:'short'});
      due.textContent = (isOverdue ? '⚠️ פג תוקף: ' : isDueToday ? '📅 היום: ' : '📅 ') + dueFmt;
      content.appendChild(due);
    }

    row.appendChild(content);

    // Delete button
    const del = document.createElement('button');
    del.textContent = '🗑️';
    del.style.cssText = 'background:none;border:none;font-size:14px;cursor:pointer;color:var(--text3);padding:2px;flex-shrink:0;opacity:0.5;';
    del.dataset.id = task.id;
    del.addEventListener('click', function() { gtasksDelete(this.dataset.id); });
    row.appendChild(del);

    listEl.appendChild(row);
  });
}

// ── Toggle task complete/incomplete ─────────────────────
async function gtasksToggle(taskId, currentStatus) {
  if (!gtasksToken || !gtasksCurrentList) return;
  const newStatus = currentStatus === 'completed' ? 'needsAction' : 'completed';
  try {
    await fetch(
      GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks/' + taskId,
      {
        method: 'PATCH',
        headers: { Authorization: 'Bearer ' + gtasksToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, completed: newStatus === 'completed' ? new Date().toISOString() : null })
      }
    );
    gtasksLoadTasks();
    // If completed — also save to Smart Notes as done item
    if (newStatus === 'completed' && typeof sb !== 'undefined') {
      gtasksSaveCompletedToNotes(taskId);
    }
  } catch(e) { console.error('gtasksToggle:', e); }
}

// ── Save completed task to יומן חכם ─────────────────────
async function gtasksSaveCompletedToNotes(taskId) {
  try {
    const res  = await fetch(
      GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks/' + taskId,
      { headers: { Authorization: 'Bearer ' + gtasksToken } }
    );
    const task = await res.json();
    const now  = new Date().toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'});
    await sb.from('beni_notes').insert({
      note_text: '✅ ' + task.title + (task.notes ? '\n' + task.notes : '') + '\n\nבוצע: ' + now,
      color: 'green',
      project_id: null
    });
  } catch(e) { console.error('gtasksSaveCompletedToNotes:', e); }
}

// ── Add new task ─────────────────────────────────────────
async function gtasksAddTask() {
  if (!gtasksToken || !gtasksCurrentList) return;
  const titleEl = document.getElementById('gtasks-new-title');
  const dueEl   = document.getElementById('gtasks-new-due');
  const title   = titleEl ? titleEl.value.trim() : '';
  if (!title) { titleEl && titleEl.focus(); return; }

  const payload = { title: title };
  if (dueEl && dueEl.value) {
    payload.due = dueEl.value + 'T00:00:00.000Z';
  }

  try {
    await fetch(
      GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + gtasksToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );
    if (titleEl) titleEl.value = '';
    if (dueEl)   dueEl.value   = '';
    gtasksLoadTasks();
    toast('✅ מטלה נוספה');
  } catch(e) { toast('שגיאה: ' + e.message); }
}

// ── Delete task ──────────────────────────────────────────
async function gtasksDelete(taskId) {
  if (!gtasksToken || !gtasksCurrentList || !confirm('מחק מטלה זו?')) return;
  try {
    await fetch(
      GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks/' + taskId,
      { method: 'DELETE', headers: { Authorization: 'Bearer ' + gtasksToken } }
    );
    gtasksLoadTasks();
  } catch(e) { console.error('gtasksDelete:', e); }
}

// ── Refresh ──────────────────────────────────────────────
function gtasksRefresh() { gtasksLoadTasks(); }

// ── Push task from voice memo (called by Field Intel) ────
async function gtasksPushFromMemo(title, dueDate, notes) {
  if (!gtasksToken || !gtasksCurrentList) {
    // Not connected — fall back to reminders table
    await sb.from('reminders').insert({ text: title, source: 'voice', is_done: false, created_at: new Date().toISOString() });
    toast('📋 נשמר במשימות (Google Tasks לא מחובר)');
    return;
  }
  const payload = { title: title };
  if (dueDate) payload.due = dueDate + 'T00:00:00.000Z';
  if (notes)   payload.notes = notes;
  await fetch(
    GTASKS_API + '/lists/' + gtasksCurrentList + '/tasks',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gtasksToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );
  toast('✅ מטלה נוספה ל-Google Tasks');
}


// ══════════════════════════════════════════════════════
// FEATURE 1: VOICE → GOOGLE CALENDAR EVENT
// ══════════════════════════════════════════════════════

const GCAL_API = 'https://www.googleapis.com/calendar/v3';

async function voiceCreateCalendarEvent() {
  const transcript = document.getElementById('transcript-text')?.textContent?.trim();
  if (!transcript) { toast('אין טקסט להמרה'); return; }

  // Check if connected to Google
  if (!gtasksToken) {
    toast('⚠️ יש להתחבר תחילה ב-☑️ מטלות Google');
    switchTab('gtasks');
    return;
  }

  toast('🧠 מנתח פגישה...');

  const ANTHROPIC_KEY = window.APP?.config?.anthropic_key;
  if (!ANTHROPIC_KEY) { toast('❌ אין מפתח Anthropic'); return; }

  // Ask Claude to extract meeting details from Hebrew text
  const prompt = `אתה עוזר שמחלץ פרטי פגישה מטקסט עברי.
טקסט: "${transcript}"
תאריך היום: ${new Date().toLocaleDateString('he-IL', {weekday:'long', year:'numeric', month:'long', day:'numeric'})}
מחר: ${new Date(Date.now()+86400000).toISOString().split('T')[0]}

החזר JSON בלבד:
{
  "title": "כותרת הפגישה",
  "date": "YYYY-MM-DD",
  "time": "HH:MM",
  "duration_minutes": 60,
  "location": "",
  "description": "",
  "attendee": ""
}
אם אין תאריך ברור — השתמש במחר. אם אין שעה — השתמש ב-10:00.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] })
    });
    const data = await res.json();
    const raw  = data.content?.[0]?.text || '{}';
    let event;
    try { event = JSON.parse(raw.replace(/```json|```/g,'').trim()); }
    catch(e) { toast('❌ לא הצלחתי לנתח את הפגישה'); return; }

    // Show confirmation modal before creating
    calShowConfirm(event);
  } catch(e) {
    toast('שגיאה: ' + e.message);
  }
}

// Show confirm modal
function calShowConfirm(event) {
  // Create modal dynamically
  const existing = document.getElementById('cal-confirm-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'cal-confirm-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:flex-end;';
  modal.innerHTML = [
    '<div class="cal-sheet">',
      '<div class="cal-sheet-title">',
        '<span style="font-size:22px;">📅</span> אשר יצירת פגישה',
      '</div>',
      '<div style="display:grid;gap:10px;margin-bottom:20px;">',
        '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">כותרת</label>',
        '<input id="cal-title" value="' + event.title + '" class="sp-inp"></div>',
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">',
          '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">תאריך</label>',
          '<input id="cal-date" type="date" value="' + (event.date||new Date().toISOString().split('T')[0]) + '" class="sp-textarea"></div>',
          '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">שעה</label>',
          '<input id="cal-time" type="time" value="' + (event.time||'10:00') + '" class="sp-textarea"></div>',
        '</div>',
        '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">משך (דקות)</label>',
        '<input id="cal-duration" type="number" value="' + (event.duration_minutes||60) + '" class="sp-textarea"></div>',
        '<div><label style="font-size:11px;font-weight:700;color:var(--text3);display:block;margin-bottom:4px;">מיקום (אופציונלי)</label>',
        '<input id="cal-location" value="' + (event.location||'') + '" placeholder="כתובת / קישור" class="sp-textarea"></div>',
      '</div>',
      '<div style="display:flex;gap:10px;">',
        '<button class="cal-cancel-btn" class="btn-eod-action">ביטול</button>',
        '<button onclick="calCreateEvent()" class="btn-eod-google">📅 צור פגישה</button>',
      '</div>',
    '</div>'
  ].join('');
  document.body.appendChild(modal);
  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  // Cancel button inside modal
  setTimeout(function() {
    var cancelBtn = modal.querySelector('.cal-cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', function() { modal.remove(); });
  }, 50);
}

async function calCreateEvent() {
  const title    = document.getElementById('cal-title')?.value?.trim();
  const date     = document.getElementById('cal-date')?.value;
  const time     = document.getElementById('cal-time')?.value || '10:00';
  const duration = parseInt(document.getElementById('cal-duration')?.value) || 60;
  const location = document.getElementById('cal-location')?.value?.trim() || '';

  if (!title || !date) { toast('נא למלא כותרת ותאריך'); return; }

  const startDt = new Date(date + 'T' + time + ':00');
  const endDt   = new Date(startDt.getTime() + duration * 60000);

  const body = {
    summary:  title,
    location: location || undefined,
    start:    { dateTime: startDt.toISOString(), timeZone: 'Asia/Jerusalem' },
    end:      { dateTime: endDt.toISOString(),   timeZone: 'Asia/Jerusalem' },
  };

  try {
    const res = await fetch(GCAL_API + '/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + gtasksToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.status === 401) { gtasksSignOut(); toast('פג תוקף החיבור — התחבר שוב'); return; }
    if (!res.ok) { const err = await res.json(); throw new Error(err.error?.message || res.status); }

    document.getElementById('cal-confirm-modal')?.remove();
    toast('✅ פגישה נוצרה ביומן Google!');

    // Also save to beni_notes as record
    try {
      await sb.from('beni_notes').insert({
                note_text: "📅 " + title + " | " + new Date(startDt).toLocaleString("he-IL") + (location ? " | " + location : ""),

        color: 'blue',
        project_id: null
      });
    } catch(e) {}

  } catch(e) {
    toast('שגיאה ביצירת פגישה: ' + e.message);
  }
}


// ══════════════════════════════════════════════════════
// FEATURE 2: PHOTO OCR → HEBREW TEXT
// ══════════════════════════════════════════════════════

async function ocrProcessImage(input) {
  const file = input?.files?.[0];
  if (!file) return;

  const ANTHROPIC_KEY = window.APP?.config?.anthropic_key;
  if (!ANTHROPIC_KEY) { toast('❌ אין מפתח Anthropic'); return; }

  const loadingEl = document.getElementById('ocr-loading');
  const resultEl  = document.getElementById('ocr-result');
  const textEl    = document.getElementById('ocr-text');

  if (loadingEl) loadingEl.style.display = 'block';
  if (resultEl)  resultEl.style.display  = 'none';

  try {
    // Convert image to base64
    const base64 = await new Promise(function(resolve, reject) {
      const reader = new FileReader();
      reader.onload  = function(e) { resolve(e.target.result.split(',')[1]); };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Detect media type
    const mediaType = file.type || 'image/jpeg';

    // Send to Claude Vision
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64 }
            },
            {
              type: 'text',
              text: 'אנא קרא את כל הטקסט בתמונה הזו. כתוב אותו בדיוק כפי שהוא כתוב, כולל עברית ואנגלית. החזר רק את הטקסט שזיהית, ללא הסברים נוספים.'
            }
          ]
        }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text || '';

    if (loadingEl) loadingEl.style.display = 'none';

    if (text.trim()) {
      if (textEl)   textEl.value = text.trim();
      if (resultEl) resultEl.style.display = 'block';
      toast('✅ טקסט זוהה בהצלחה');
    } else {
      toast('⚠️ לא זוהה טקסט בתמונה');
    }

  } catch(e) {
    if (loadingEl) loadingEl.style.display = 'none';
    toast('שגיאה: ' + e.message);
  }

  // Reset file input so same file can be selected again
  input.value = '';
}

// Send OCR text to voice transcript for AI analysis
function ocrToTranscript() {
  const text = document.getElementById('ocr-text')?.value?.trim();
  if (!text) return;

  // Populate transcript
  const transcriptEl = document.getElementById('transcript-text');
  const placeholderEl = document.getElementById('transcript-placeholder');
  const actionsEl = document.getElementById('transcript-actions');

  if (transcriptEl)   transcriptEl.textContent = text;
  if (placeholderEl)  placeholderEl.style.display = 'none';
  if (actionsEl)      actionsEl.style.display = 'flex';

  // Set global transcript and trigger AI analysis
  window.currentTranscript = text;
  toast('🧠 שולח לניתוח AI...');

  // Trigger Claude analysis same as voice
  if (typeof analyzeWithClaude === 'function') {
    analyzeWithClaude(text).then(function(result) {
      if (typeof renderAICard === 'function') renderAICard(result);
    });
  }
}

// Save OCR text directly to Smart Notes
async function ocrToNote() {
  const text = document.getElementById('ocr-text')?.value?.trim();
  if (!text) return;
  try {
    await sb.from('beni_notes').insert({
      note_text: '📷 ' + text,
      color: 'yellow',
      project_id: null
    });
    toast('📝 נשמר ביומן החכם');
    document.getElementById('ocr-result').style.display = 'none';
    document.getElementById('ocr-text').value = '';
  } catch(e) {
    toast('שגיאה: ' + e.message);
  }
}


// ══════════════════════════════════════════════════════
// QUICK CALL LOG — 3-tap missed/callback logging
// ══════════════════════════════════════════════════════

var _quickLogMode = 'missed'; // 'missed' | 'callback'

// ── Open quick log panel ────────────────────────────
function quickMissedLog() {
  _quickLogMode = 'missed';
  var title = document.getElementById('quick-log-title');
  if (title) title.textContent = '📵 תעד שיחה שלא נענתה';
  openQuickLogPanel();
}

function quickCallbackLog() {
  _quickLogMode = 'callback';
  var title = document.getElementById('quick-log-title');
  if (title) title.textContent = '📞 תעד שיחה שהתקשרת בחזרה';
  openQuickLogPanel();
}

function openQuickLogPanel() {
  var panel = document.getElementById('quick-log-panel');
  if (!panel) return;
  panel.style.display = 'block';
  // Clear previous values
  var nameEl  = document.getElementById('ql-name');
  var phoneEl = document.getElementById('ql-phone');
  var noteEl  = document.getElementById('ql-note');
  if (nameEl)  { nameEl.value  = ''; nameEl.focus(); }
  if (phoneEl) phoneEl.value  = '';
  if (noteEl)  noteEl.value   = '';
  // Load recent contacts
  loadRecentContacts();
  // Scroll to it
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeQuickLog() {
  var panel = document.getElementById('quick-log-panel');
  if (panel) panel.style.display = 'none';
}

// ── Load recent callers for quick-pick ──────────────
async function loadRecentContacts() {
  var row = document.getElementById('recent-contacts-row');
  if (!row) return;
  try {
    var res = await fetch(
      SB_URL + '/rest/v1/call_log?order=created_at.desc&limit=20&select=caller_name,phone',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    var calls = await res.json();
    // Deduplicate by phone
    var seen  = {};
    var unique = [];
    (calls || []).forEach(function(c) {
      var key = c.phone || c.caller_name;
      if (key && !seen[key]) { seen[key] = true; unique.push(c); }
    });
    var recent = unique.slice(0, 8);
    if (!recent.length) { row.style.display = 'none'; return; }
    row.style.display = 'flex';
    row.innerHTML = recent.map(function(c) {
      var name  = (c.caller_name || '?').substring(0, 12);
      var phone = c.phone || '';
      return '<button onclick="fillQuickLog(' + JSON.stringify(c.caller_name||'') + ',' + JSON.stringify(phone) + ')"'
        + ' class="contact-chip">'
        + name + '</button>';
    }).join('');
  } catch(e) {
    row.style.display = 'none';
  }
}

function fillQuickLog(name, phone) {
  var nameEl  = document.getElementById('ql-name');
  var phoneEl = document.getElementById('ql-phone');
  if (nameEl)  nameEl.value  = name;
  if (phoneEl) phoneEl.value = phone;
  var noteEl = document.getElementById('ql-note');
  if (noteEl) noteEl.focus();
}

// ── Save quick log to Supabase ───────────────────────
async function saveQuickLog() {
  var name  = (document.getElementById('ql-name')?.value  || '').trim();
  var phone = (document.getElementById('ql-phone')?.value || '').trim();
  var note  = (document.getElementById('ql-note')?.value  || '').trim();

  if (!name && !phone) {
    toast('נא להזין שם או מספר טלפון');
    document.getElementById('ql-name')?.focus();
    return;
  }

  var direction = _quickLogMode === 'missed' ? 'missed' : 'outgoing';

  try {
    await fetch(SB_URL + '/rest/v1/call_log', {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        caller_name: name  || 'לא ידוע',
        phone:       phone || null,
        notes:       note  || null,
        direction:   direction,
        wa_sent:     false,
        created_at:  new Date().toISOString()
      })
    });
    closeQuickLog();
    toast(direction === 'missed' ? '📵 שיחה שלא נענתה תועדה' : '📞 שיחה תועדה');
    // Also pre-fill the main call form for further action
    var nameEl  = document.getElementById('caller-name');
    var phoneEl = document.getElementById('caller-phone');
    if (nameEl)  nameEl.value  = name;
    if (phoneEl) phoneEl.value = phone;
    setDir(direction);
  } catch(e) {
    toast('שגיאה: ' + e.message);
  }
}

// ── Save and immediately dial ────────────────────────
async function saveQuickLogAndCall() {
  var phone = (document.getElementById('ql-phone')?.value || '').trim();
  if (!phone) { toast('נא להזין מספר טלפון לחיוג'); return; }
  // Save as callback
  _quickLogMode = 'callback';
  await saveQuickLog();
  // Dial
  window.location.href = 'tel:' + phone;
}

// ── Callback from main form ──────────────────────────
function callBackAndLog() {
  var name  = (document.getElementById('caller-name')?.value  || '').trim();
  var phone = (document.getElementById('caller-phone')?.value || '').trim();
  if (!phone) { toast('נא להזין מספר טלפון'); return; }
  // Log the callback
  fetch(SB_URL + '/rest/v1/call_log', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      caller_name: name  || 'לא ידוע',
      phone:       phone,
      notes:       'חזרתי',
      direction:   'outgoing',
      wa_sent:     false,
      created_at:  new Date().toISOString()
    })
  }).catch(function(e) { console.error(e); });
  toast('📞 תועד + מחייג...');
  setTimeout(function() { window.location.href = 'tel:' + phone; }, 400);
}

// ── WhatsApp quick reply + auto-log ─────────────────
// Override the existing sendReply to also log the call
var _origSendWAReply = window.sendWAReply;
function sendWAReplyAndLog(phone, message, callerName) {
  // Log to call_log
  var name  = callerName || document.getElementById('caller-name')?.value || 'לא ידוע';
  var ph    = phone || document.getElementById('caller-phone')?.value || '';
  var note  = document.getElementById('caller-note')?.value || '';
  fetch(SB_URL + '/rest/v1/call_log', {
    method: 'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({
      caller_name: name,
      phone:       ph,
      notes:       note || message.substring(0, 80),
      direction:   currentDirection || 'incoming',
      wa_sent:     true,
      wa_sent_at:  new Date().toISOString(),
      quick_reply: message,
      created_at:  new Date().toISOString()
    })
  }).catch(function(e) { console.error(e); });
}


// ══════════════════════════════════════════════════════
// SITE INSPECTION MODULE
// ══════════════════════════════════════════════════════

var _inspectStatus   = 'green';
var _inspectDeadline = 'today';
var _inspectPhotos   = [];
var _inspectInited   = false;

// ── INSPECT CHECKLIST — loaded from Supabase ─────────────────────
// Edit items in Supabase → inspection_checklist table
// Fields: key, label, sort_order, is_active
// To add a new checklist item: INSERT a row. No code change.
var INSPECT_CHECKLIST = [];  // filled by loadInspectChecklist()

async function loadInspectChecklist() {
  try {
    var res = await fetch(SB_URL + '/rest/v1/inspection_checklist?is_active=eq.true&order=sort_order',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    var data = await res.json();
    if (Array.isArray(data) && data.length) {
      INSPECT_CHECKLIST = data;
    } else {
      // Fallback only if table missing — seed SQL is in SQL_SitePulse file
      INSPECT_CHECKLIST = [
        { key:'safety_equip', label:'ציוד בטיחות (קסדות, אפודים, נעליים)' },
        { key:'plan_match',   label:'עבודה תואמת תכנית מאושרת' },
        { key:'materials_ok', label:'איכות חומרים תקינה' },
        { key:'progress_ok',  label:'התקדמות לפי לוח זמנים' },
        { key:'site_clean',   label:'ניקיון וסדר באתר' },
        { key:'scaffolding',  label:'פיגום / תבניות מאובטחים' },
        { key:'permits',      label:'היתרים נדרשים באתר' },
      ];
    }
  } catch(e) {
    console.error('loadInspectChecklist:', e);
  }
}

// ── Init inspection tab ──────────────────────────────
function inspectInit() {
  if (_inspectInited) return;
  _inspectInited = true;

  // Set current time
  var now = new Date();
  var timeStr = now.toLocaleString('he-IL', {day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  var el = document.getElementById('inspect-datetime');
  if (el) el.textContent = timeStr;

  // Build checklist (INSPECT_CHECKLIST loaded from Supabase)
  var cl = document.getElementById('inspect-checklist');
  if (cl) {
    cl.innerHTML = INSPECT_CHECKLIST.map(function(item) {
      return [
        '<div class="cl-row">',
          '<span style="font-size:13px;color:var(--text2);flex:1;">' + item.label + '</span>',
          '<div style="display:flex;gap:6px;flex-shrink:0;">',
            '<button class="cl-btn" data-key="' + item.key + '" data-val="ok"',
              ' onclick="setCheckItem(this)"',
              ' class="cl-btn cl-btn-ok"',
              'background:transparent;cursor:pointer;font-size:15px;">✅</button>',
            '<button class="cl-btn" data-key="' + item.key + '" data-val="warn"',
              ' onclick="setCheckItem(this)"',
              ' class="cl-btn cl-btn-warn"',
              'background:transparent;cursor:pointer;font-size:15px;">⚠️</button>',
            '<button class="cl-btn" data-key="' + item.key + '" data-val="fail"',
              ' onclick="setCheckItem(this)"',
              ' class="cl-btn cl-btn-fail"',
              'background:transparent;cursor:pointer;font-size:15px;">❌</button>',
            '<button class="cl-btn" data-key="' + item.key + '" data-val="na"',
              ' onclick="setCheckItem(this)"',
              ' class="cl-btn cl-btn-na"',
              'background:transparent;cursor:pointer;font-size:11px;color:var(--text3);">N/A</button>',
          '</div>',
        '</div>'
      ].join('');
    }).join('');
  }

  // Fill contractor dropdown from Supabase
  inspectLoadContractors();
}

async function inspectLoadContractors() {
  try {
    var res = await fetch(SB_URL + '/rest/v1/contractors_master?is_active=eq.true&select=id,company_name&order=company_name',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    var contractors = await res.json();
    var sel = document.getElementById('inspect-contractor');
    if (sel && contractors.length) {
      sel.innerHTML = '<option value="">Select Contractor</option>' +
        contractors.map(function(c) {
          return '<option value="' + c.id + '">' + c.company_name + '</option>';
        }).join('');
    }
  } catch(e) { console.error('inspectLoadContractors:', e); }
}

function inspectFillProjects() {
  var contractorId = document.getElementById('inspect-contractor')?.value;
  var projSel = document.getElementById('inspect-project');
  if (!projSel) return;
  // For now show all active projects — could filter by contractor if linked
  fetch(SB_URL + '/rest/v1/projects?status=eq.active&select=id,project_name&order=project_name',
    { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } })
    .then(function(r){ return r.json(); })
    .then(function(projects) {
      projSel.innerHTML = '<option value="">Select Project</option>' +
        (projects||[]).map(function(p) {
          return '<option value="' + p.id + '">' + p.project_name + '</option>';
        }).join('');
    }).catch(function(e){ console.error(e); });
}

// ── Checklist item ────────────────────────────────────
function setCheckItem(btn) {
  var key = btn.dataset.key;
  var val = btn.dataset.val;
  // Highlight selected
  document.querySelectorAll('.cl-btn[data-key="' + key + '"]').forEach(function(b) {
    var isActive = b === btn;
    b.style.background = isActive ? (
      val === 'ok' ? 'rgba(34,197,94,0.2)' :
      val === 'warn' ? 'rgba(245,158,11,0.2)' :
      val === 'fail' ? 'rgba(239,68,68,0.2)' : 'rgba(156,163,175,0.2)'
    ) : 'transparent';
  });
}

function collectChecklist() {
  var result = {};
  INSPECT_CHECKLIST.forEach(function(item) {
    var active = document.querySelector('.cl-btn[data-key="' + item.key + '"][style*="rgba"]');
    result[item.key] = active ? active.dataset.val : null;
  });
  return result;
}

// ── Overall status ────────────────────────────────────
function setInspectStatus(btn, status) {
  _inspectStatus = status;
  var colors = { green:'#22c55e', yellow:'#f59e0b', red:'#ef4444', safety:'#dc2626' };
  document.querySelectorAll('.status-btn').forEach(function(b) {
    var isThis = b === btn;
    var c = colors[b.dataset.status] || 'var(--border)';
    b.style.borderColor = isThis ? c : 'var(--border)';
    b.style.background  = isThis ? c.replace(')', ',0.12)').replace('rgb', 'rgba').replace('#', 'rgba(').replace('rgba(', 'rgba(') + (c.startsWith('#') ? '1a' : '') : 'var(--surface2)';
  });
  // Show/hide safety section
  var safetySection = document.getElementById('inspect-safety-section');
  var photoRequired = document.getElementById('inspect-photo-required');
  var badge         = document.getElementById('inspect-badge');
  if (safetySection) safetySection.style.display = status === 'safety' ? 'block' : 'none';
  if (photoRequired) photoRequired.style.display = status === 'safety' ? 'inline' : 'none';
  if (badge) { badge.textContent = status === 'safety' ? '🚨' : '!'; badge.style.display = 'inline'; }
}

// ── Deadline ──────────────────────────────────────────
function setDeadline(btn, val) {
  _inspectDeadline = val;
  document.querySelectorAll('.deadline-btn').forEach(function(b) {
    b.style.fontWeight = b === btn ? '900' : '700';
    b.style.background = b === btn ? 'rgba(220,38,38,0.2)' : 'var(--surface2)';
  });
}

// ── Photos ────────────────────────────────────────────
function inspectHandlePhotos(input) {
  Array.from(input.files || []).forEach(function(file) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _inspectPhotos.push({ file: file, dataUrl: e.target.result });
      renderInspectPhotos();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderInspectPhotos() {
  var preview = document.getElementById('inspect-photo-preview');
  if (!preview) return;
  preview.innerHTML = '';
  _inspectPhotos.forEach(function(ph, i) {
    var div = document.createElement('div');
    div.style.cssText = 'position:relative;width:64px;height:64px;border-radius:8px;overflow:hidden;border:1px solid var(--border);';
    var img = document.createElement('img');
    img.src = ph.dataUrl;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
    var del = document.createElement('button');
    del.innerHTML = '×';
    del.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(220,38,38,0.85);color:white;border:none;border-radius:50%;width:18px;height:18px;cursor:pointer;font-size:11px;line-height:1;';
    del.addEventListener('click', function() { _inspectPhotos.splice(i, 1); renderInspectPhotos(); });
    div.appendChild(img);
    div.appendChild(del);
    preview.appendChild(div);
  });
}

// ── Build WhatsApp message ────────────────────────────
function buildInspectWAMessage(data) {
  var STATUS_LABELS = { green:'✅ APPROVED', yellow:'⚠️ WARNING', red:'❌ REJECTED', safety:'🚨 SAFETY STOP' };
  var contractorName = document.getElementById('inspect-contractor')?.selectedOptions[0]?.text || '';
  var projectName    = document.getElementById('inspect-project')?.selectedOptions[0]?.text   || '';
  var now = new Date().toLocaleString('he-IL', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});

  var msg = [
    '🔍 *SITE INSPECTION REPORT*',
    STATUS_LABELS[_inspectStatus] || _inspectStatus.toUpperCase(),
    '',
    '📅 ' + now,
    '👷 Contractor: ' + contractorName,
    '🏗️ Project: ' + (projectName || '—'),
    '👤 Inspector: Beni Persky',
    '',
  ];

  if (data.findings) {
    msg.push('📝 *FINDINGS:*');
    msg.push(data.findings);
    msg.push('');
  }

  if (data.instructions) {
    msg.push('📋 *INSTRUCTIONS:*');
    msg.push(data.instructions);
    msg.push('');
  }

  if (_inspectStatus === 'safety' && data.safety_hazard) {
    msg.push('🚨 *SAFETY HAZARD:*');
    msg.push(data.safety_hazard);
    msg.push('⏰ Deadline: ' + (_inspectDeadline === 'immediate' ? 'IMMEDIATE — STOP WORK NOW' : _inspectDeadline === 'today' ? 'Fix by end of today' : 'Fix this week'));
    msg.push('');
    msg.push('⚠️ This is a formal safety notice. Please confirm receipt.');
    msg.push('');
  }

  // Checklist summary
  var cl = data.checklist;
  var failed = Object.entries(cl).filter(function(e){ return e[1] === 'fail'; });
  var warned = Object.entries(cl).filter(function(e){ return e[1] === 'warn'; });
  if (failed.length || warned.length) {
    msg.push('☑️ *CHECKLIST ISSUES:*');
    failed.forEach(function(e) {
      var item = INSPECT_CHECKLIST.find(function(c){ return c.key === e[0]; });
      if (item) msg.push('❌ ' + item.label);
    });
    warned.forEach(function(e) {
      var item = INSPECT_CHECKLIST.find(function(c){ return c.key === e[0]; });
      if (item) msg.push('⚠️ ' + item.label);
    });
    msg.push('');
  }

  msg.push('_Sent via Beni Persky Site Inspection System_');
  return msg.join('\n');
}

// ── Save to Supabase ──────────────────────────────────
async function inspectSave() {
  var contractorSel = document.getElementById('inspect-contractor');
  var projectSel    = document.getElementById('inspect-project');
  var contractorId   = contractorSel?.value   || null;
  var contractorName = contractorSel?.selectedOptions[0]?.text || '';
  var projectId      = projectSel?.value      || null;
  var projectName    = projectSel?.selectedOptions[0]?.text   || '';

  var findings     = document.getElementById('inspect-findings')?.value?.trim()     || '';
  var instructions = document.getElementById('inspect-instructions')?.value?.trim() || '';
  var safetyHazard = document.getElementById('inspect-safety-hazard')?.value?.trim() || '';

  if (!findings && !instructions) {
    toast('Please add findings or instructions');
    return null;
  }

  // Upload photos
  var photoPaths = [];
  for (var i = 0; i < _inspectPhotos.length; i++) {
    try {
      var ph   = _inspectPhotos[i];
      var ext  = ph.file.name.split('.').pop() || 'jpg';
      var path = 'inspections/' + Date.now() + '_' + i + '.' + ext;
      var { error } = await sb.storage.from('photos').upload(path, ph.file, { upsert: true });
      if (!error) photoPaths.push(path);
    } catch(e) { console.error(e); }
  }

  var now = new Date();
  var payload = {
    contractor_id:   contractorId,
    project_id:      projectId,
    contractor_name: contractorName,
    project_name:    projectName,
    inspection_date: now.toISOString().split('T')[0],
    inspection_time: now.toTimeString().slice(0,5),
    inspector:       'Beni Persky',
    overall_status:  _inspectStatus,
    checklist:       JSON.stringify(collectChecklist()),
    findings:        findings  || null,
    instructions:    instructions || null,
    safety_hazard:   safetyHazard || null,
    safety_deadline: _inspectStatus === 'safety' ? _inspectDeadline : null,
    photos:          JSON.stringify(photoPaths),
    created_at:      now.toISOString()
  };

  var res = await fetch(SB_URL + '/rest/v1/site_inspections', {
    method:  'POST',
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
               'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) throw new Error('Save failed: HTTP ' + res.status);
  return { payload, contractorName, projectName, findings, instructions, safetyHazard };
}

// ── Save + WhatsApp ───────────────────────────────────
async function inspectSaveAndSend() {
  try {
    var data = await inspectSave();
    if (!data) return;

    var msg   = buildInspectWAMessage(data.payload);
    var phone = '';
    // Try to get contractor phone
    var contractorId = document.getElementById('inspect-contractor')?.value;
    if (contractorId) {
      try {
        var r = await fetch(SB_URL + '/rest/v1/contractors_master?id=eq.' + contractorId + '&select=mobile',
          { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
        var cd = await r.json();
        if (cd && cd[0] && cd[0].mobile) phone = cd[0].mobile.replace(/\D/g,'');
      } catch(e){}
    }
    var waUrl = phone
      ? 'https://wa.me/972' + phone.replace(/^0/,'') + '?text=' + encodeURIComponent(msg)
      : 'https://wa.me/?text=' + encodeURIComponent(msg);

    toast('✅ Saved! Opening WhatsApp...');
    setTimeout(function() { var _wa=document.createElement('a');_wa.href=waUrl;_wa.target='_blank';_wa.rel='noopener';document.body.appendChild(_wa);_wa.click();document.body.removeChild(_wa); }, 500);

    // Update badge to show it was sent
    await fetch(SB_URL + '/rest/v1/site_inspections?contractor_id=eq.' + contractorId + '&wa_sent=eq.false',{
      method: 'PATCH',
      headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ wa_sent: true, wa_sent_at: new Date().toISOString() })
    });
  } catch(e) {
    toast('Error: ' + e.message);
  }
}

async function inspectSaveOnly() {
  try {
    var data = await inspectSave();
    if (!data) return;
    toast('✅ Saved to CRM — contractor & project log updated');
    inspectReset();
  } catch(e) {
    toast('Error: ' + e.message);
  }
}

function inspectReset() {
  _inspectStatus   = 'green';
  _inspectDeadline = 'today';
  _inspectPhotos   = [];
  _inspectInited   = false;

  var fields = ['inspect-findings','inspect-instructions','inspect-safety-hazard'];
  fields.forEach(function(id) { var el = document.getElementById(id); if(el) el.value=''; });

  var contractor = document.getElementById('inspect-contractor');
  var project    = document.getElementById('inspect-project');
  if (contractor) contractor.value = '';
  if (project)    project.value    = '';

  document.getElementById('inspect-photo-preview').innerHTML = '';
  document.getElementById('inspect-safety-section').style.display = 'none';
  document.getElementById('inspect-badge').style.display = 'none';

  document.querySelectorAll('.status-btn').forEach(function(b) {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--surface2)';
  });
  document.querySelectorAll('.cl-btn').forEach(function(b) { b.style.background = 'transparent'; });

  inspectInit();
  toast('Form reset');
}

// ── Scenario 1: Send Site Pulse request from mobile ──
// ── SITE PULSE — SUPABASE-FIRST ARCHITECTURE ─────────────────────
// Flow: pick contractor → pick project → INSERT site_pulse_requests
//       → get UUID → send ?req={UUID} in WhatsApp
// Contractor opens link → site-pulse.html fetches everything from Supabase
// NO Hebrew in URL. NO encoding. NO bugs.

async function sendSitePulseRequest() {
  try {
    var res = await fetch(SB_URL + '/rest/v1/contractors_master?is_active=eq.true&select=id,company_name,mobile&order=company_name',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    var contractors = await res.json();
    if (!contractors.length) { toast('לא נמצאו קבלנים פעילים'); return; }
    spStep1_PickContractor(contractors);
  } catch(e) { toast('שגיאה: ' + e.message); }
}

function spStep1_PickContractor(contractors) {
  var modal = spModal();
  var sheet = modal.sheet;

  spModalTitle(sheet, '📋 שלב 1 מתוך 2 — בחר קבלן');

  contractors.forEach(function(c) {
    var btn = spListBtn(c.company_name, function() {
      modal.el.remove();
      spStep2_PickProject(c);
    });
    sheet.appendChild(btn);
  });
  spCancelBtn(sheet, function() { modal.el.remove(); });
  document.body.appendChild(modal.el);
}

async function spStep2_PickProject(contractor) {
  try {
    var res = await fetch(SB_URL + '/rest/v1/projects?status=eq.active&select=id,project_name&order=project_name',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
    var projects = await res.json();

    var modal = spModal();
    var sheet = modal.sheet;
    spModalTitle(sheet, '📋 שלב 2 מתוך 2 — בחר פרויקט עבור ' + contractor.company_name);

    if (!projects.length) {
      var note = document.createElement('div');
      note.style.cssText = 'padding:12px;color:var(--text3);font-size:13px;text-align:center;';
      note.textContent = 'לא נמצאו פרויקטים פעילים';
      sheet.appendChild(note);
    } else {
      projects.forEach(function(p) {
        var btn = spListBtn(p.project_name, function() {
          modal.el.remove();
          spCreateRequestAndSend(contractor, p);
        });
        sheet.appendChild(btn);
      });
    }
    spCancelBtn(sheet, function() { modal.el.remove(); });
    document.body.appendChild(modal.el);
  } catch(e) { toast('שגיאה בטעינת פרויקטים: ' + e.message); }
}

async function spCreateRequestAndSend(contractor, project) {
  try {
    toast('⏳ יוצר בקשה...');
    // INSERT into site_pulse_requests → Supabase returns the new UUID
    var res = await fetch(SB_URL + '/rest/v1/site_pulse_requests',
      { method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
                   'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          contractor_id:     contractor.id,
          project_id:        project.id,
          contractor_name:   contractor.company_name,
          project_name:      project.project_name,
          contractor_mobile: contractor.mobile || null,
          requested_by:      'Beni Persky',
          report_date:       new Date().toISOString().slice(0,10),
          status:            'pending'
        })
      });
    var rows = await res.json();
    if (!rows || !rows[0] || !rows[0].id) throw new Error('לא הוחזר ID מ-Supabase');
    var requestId = rows[0].id;
    // Clean URL — just a UUID, zero encoding issues
    var formUrl = 'https://avshi2-maker.github.io/site-pulse/?req=' + requestId;
    spShowWASheet(contractor, project, formUrl);
  } catch(e) { toast('שגיאה ביצירת בקשה: ' + e.message); }
}

function spShowWASheet(contractor, project, formUrl) {
  var existing = document.getElementById('wa-send-sheet');
  if (existing) existing.remove();

  var textBefore = 'שלום ' + contractor.company_name + ',\n\nבני פרסקי שולח לך בקשה למלא דוח עבודה יומי.\nפרויקט: ' + project.project_name + '\nנא למלא את הטופס:\n\n';
  var textAfter  = '\n\nתודה!';
  var msgForCopy = textBefore + formUrl + textAfter;

  var phone  = contractor.mobile ? '972' + contractor.mobile.replace(/[^0-9]/g,'').replace(/^0/,'') : '';
  var waText = encodeURIComponent(textBefore) + formUrl + encodeURIComponent(textAfter);
  var waUrl  = phone
    ? 'https://wa.me/' + phone + '?text=' + waText
    : 'https://wa.me/?text=' + waText;

  var sheet = document.createElement('div');
  sheet.id = 'wa-send-sheet';
  sheet.className = 'modal-overlay'; this_el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:9999;display:flex;align-items:flex-end;';

  var inner = document.createElement('div');
  inner.className = 'sp-sheet-inner';

  var title = document.createElement('div');
  title.className = 'sp-sheet-title'; title.style.marginBottom='4px';
  title.textContent = '📲 שלח טופס ל' + contractor.company_name;
  inner.appendChild(title);

  var sub = document.createElement('div');
  sub.className = 'sp-sheet-title'; sub.style.cssText='font-size:11px;font-weight:400;color:var(--text3);margin-bottom:12px;';
  sub.textContent = 'פרויקט: ' + project.project_name;
  inner.appendChild(sub);

  var preview = document.createElement('div');
  preview.className = 'wa-preview-box';
  preview.textContent = msgForCopy;
  inner.appendChild(preview);

  var waBtn = document.createElement('a');
  waBtn.href = waUrl;
  waBtn.target = '_blank';
  waBtn.rel = 'noopener noreferrer';
  waBtn.className = 'wa-send-btn';
  waBtn.textContent = '📲 פתח WhatsApp ושלח';
  waBtn.addEventListener('click', function() { setTimeout(function(){ sheet.remove(); }, 500); });
  inner.appendChild(waBtn);

  var copyBtn = document.createElement('button');
  copyBtn.className = 'wa-copy-btn';
  copyBtn.textContent = '📋 העתק הודעה';
  copyBtn.addEventListener('click', function() {
    navigator.clipboard.writeText(msgForCopy).then(function(){ toast('✅ הודעה הועתקה'); }).catch(function(){ toast('העתק ידנית מהתיבה'); });
  });
  inner.appendChild(copyBtn);

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'sp-cancel-btn';
  cancelBtn.textContent = 'ביטול';
  cancelBtn.addEventListener('click', function() { sheet.remove(); });
  inner.appendChild(cancelBtn);

  sheet.appendChild(inner);
  sheet.addEventListener('click', function(e) { if (e.target === sheet) sheet.remove(); });
  document.body.appendChild(sheet);
}

// ── UI Helper Functions ───────────────────────────────────────────
function spModal() {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:flex-end;';
  var sheet = document.createElement('div');
  sheet.className = 'sp-sheet-scroll';
  el.appendChild(sheet);
  el.addEventListener('click', function(e) { if (e.target === el) el.remove(); });
  return { el: el, sheet: sheet };
}
function spModalTitle(sheet, text) {
  var t = document.createElement('div');
  t.className = 'sp-sheet-title';
  t.textContent = text;
  sheet.appendChild(t);
}
function spListBtn(label, onClick) {
  var btn = document.createElement('button');
  btn.className = 'sp-list-btn';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}
function spCancelBtn(sheet, onClick) {
  var btn = document.createElement('button');
  btn.className = 'sp-cancel-btn';
  btn.textContent = 'ביטול';
  btn.addEventListener('click', onClick);
  sheet.appendChild(btn);
}



