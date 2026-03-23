// ══════════════════════════════════════════════════════════════════════
// LASER LEVEL MODULE — מדידת גבהים במאזנת
// Loaded on demand from Supabase Storage app-assets bucket
// Saves to site_takeoffs (takeoff_type='laser')
// ══════════════════════════════════════════════════════════════════════

(function() {
'use strict';

// ── State ─────────────────────────────────────────────────────────────
var LL = {
  ref:    null,   // reference reading (meters)
  points: [],     // {id, code, desc, type, reading, dev_m, dev_mm}
  nextCode: 1
};

var LL_TYPES = ['גובה_רצפה','גובה_תקרה','גובה_קיר','אחר'];
var LL_TOLERANCE = 5; // mm — highlight if |deviation| > this

// ── Panel init ────────────────────────────────────────────────────────
window.llInit = function() {
  llRenderPanel();
};

function llRenderPanel() {
  var el = document.getElementById('panel-laser-inner');
  if (!el) return;

  el.innerHTML = [
    // Session header
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">',
      '<input id="ll-project" placeholder="שם פרויקט / אתר" style="flex:1;min-width:120px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
      '<input id="ll-room"    placeholder="חדר / אזור" style="flex:1;min-width:80px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
      '<input id="ll-date" type="date" style="width:130px;padding:9px 10px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
    '</div>',

    // Reference point card
    '<div style="background:linear-gradient(135deg,rgba(26,61,92,0.15),rgba(45,106,159,0.1));border:2px solid rgba(26,61,92,0.3);border-radius:12px;padding:12px;margin-bottom:12px;">',
      '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;">📍 נקודת ייחוס (REF)</div>',
      '<div style="display:flex;gap:8px;align-items:center;">',
        '<input id="ll-ref-desc" placeholder="תיאור ייחוס (למשל: ליד הדלת)" style="flex:1;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<input id="ll-ref-val" type="number" step="0.001" placeholder="קריאה (מ\')" style="width:110px;padding:9px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:14px;font-weight:800;background:var(--surface);color:var(--text);" oninput="llSetRef()">',
      '</div>',
      '<div id="ll-ref-status" style="font-size:11px;color:var(--text3);margin-top:4px;">הזן קריאת ייחוס כדי להתחיל</div>',
    '</div>',

    // Point entry form
    '<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;">',
      '<div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:8px;">➕ הוסף נקודת מדידה</div>',
      '<div style="display:grid;grid-template-columns:70px 1fr;gap:6px;margin-bottom:6px;">',
        '<input id="ll-pt-code" placeholder="קוד" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<input id="ll-pt-desc" placeholder="תיאור נקודה (פינה צפון-מזרח...)" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
      '</div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:6px;">',
        '<select id="ll-pt-type" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">'+
          LL_TYPES.map(function(t){return '<option>'+t+'</option>';}).join('')+'</select>',
        '<input id="ll-pt-reading" type="number" step="0.001" placeholder="קריאה (מ\')" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:14px;font-weight:800;background:var(--surface);color:var(--text);" oninput="llPreviewDev()">',
      '</div>',
      '<div id="ll-pt-preview" style="font-size:12px;color:var(--text2);margin-bottom:6px;min-height:16px;"></div>',
      '<div style="display:flex;gap:6px;">',
        '<input id="ll-pt-notes" placeholder="הערות" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<button onclick="llAddPoint()" style="background:var(--green);color:white;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;">➕ הוסף</button>',
      '</div>',
    '</div>',

    // Tolerance setting
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;color:var(--text2);">',
      '<span>סבילות:</span>',
      '<input id="ll-tolerance" type="number" value="5" min="1" max="50" style="width:60px;padding:6px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);" oninput="llRenderTable()">',
      '<span>מ״מ (אדום = מעל)</span>',
    '</div>',

    // Results table
    '<div id="ll-table-wrap" style="overflow-x:auto;margin-bottom:12px;">',
      '<div id="ll-table"></div>',
    '</div>',

    // Summary
    '<div id="ll-summary" style="display:none;background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:12px;">',
      '<div style="font-size:12px;font-weight:800;color:var(--text);margin-bottom:8px;">📊 סיכום סטיות</div>',
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">',
        '<div><div style="font-size:10px;color:var(--text2);">מקסימום (מ״מ)</div><div id="ll-max-dev" style="font-size:18px;font-weight:900;color:#ef4444;">—</div></div>',
        '<div><div style="font-size:10px;color:var(--text2);">מינימום (מ״מ)</div><div id="ll-min-dev" style="font-size:18px;font-weight:900;color:var(--green);">—</div></div>',
        '<div><div style="font-size:10px;color:var(--text2);">טווח (מ״מ)</div><div id="ll-range-dev" style="font-size:18px;font-weight:900;color:var(--orange);">—</div></div>',
      '</div>',
    '</div>',

    // Actions
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">',
      '<button onclick="llSave()" style="background:linear-gradient(135deg,#1a3d5c,#2d6a9f);color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">💾 שמור לסופרבייס</button>',
      '<button onclick="llExportExcel()" style="background:#1e6b30;color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">📊 ייצא Excel</button>',
      '<button onclick="llSendWA()" style="background:#25D366;color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">💬 WhatsApp</button>',
      '<button onclick="llClear()" style="background:var(--surface2);color:#ef4444;border:1.5px solid var(--border);border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:Heebo,sans-serif;">🗑 נקה</button>',
    '</div>'
  ].join('');

  var d = document.getElementById('ll-date');
  if (d && !d.value) d.valueAsDate = new Date();
  llRenderTable();
}

// ── Set reference ─────────────────────────────────────────────────────
window.llSetRef = function() {
  var val = parseFloat(document.getElementById('ll-ref-val').value);
  if (isNaN(val)) { LL.ref = null; return; }
  LL.ref = val;
  var st = document.getElementById('ll-ref-status');
  if (st) st.textContent = '✅ ייחוס הוגדר: '+val+' מ\'  — ניתן להתחיל למדוד';
  llRenderTable();
};

// ── Preview deviation while typing ───────────────────────────────────
window.llPreviewDev = function() {
  if (LL.ref === null) return;
  var reading = parseFloat(document.getElementById('ll-pt-reading').value);
  if (isNaN(reading)) { document.getElementById('ll-pt-preview').textContent=''; return; }
  var dev_m  = Math.round((reading - LL.ref) * 10000) / 10000;
  var dev_mm = Math.round(dev_m * 1000);
  var sign = dev_mm > 0 ? 'נמוך' : dev_mm < 0 ? 'גבוה' : 'ללא סטייה';
  var color = Math.abs(dev_mm) > LL_TOLERANCE ? '#ef4444' : 'var(--green)';
  document.getElementById('ll-pt-preview').innerHTML =
    '<span style="color:'+color+';font-weight:700;">סטייה: '+dev_mm+' מ״מ ('+sign+')</span>';
};

// ── Add point ─────────────────────────────────────────────────────────
window.llAddPoint = function() {
  if (LL.ref === null) { if (typeof showToast==='function') showToast('הגדר נקודת ייחוס תחילה'); return; }
  var code    = document.getElementById('ll-pt-code').value.trim() || ('P'+LL.nextCode);
  var desc    = document.getElementById('ll-pt-desc').value.trim();
  var type    = document.getElementById('ll-pt-type').value;
  var reading = parseFloat(document.getElementById('ll-pt-reading').value);
  var notes   = document.getElementById('ll-pt-notes').value.trim();
  if (!desc || isNaN(reading)) { if (typeof showToast==='function') showToast('הכנס תיאור וקריאה'); return; }
  var dev_m  = Math.round((reading - LL.ref) * 10000) / 10000;
  var dev_mm = Math.round(dev_m * 1000);
  LL.points.push({ id: Date.now()+Math.random(), code, desc, type, reading, dev_m, dev_mm, notes });
  LL.nextCode++;
  ['ll-pt-code','ll-pt-desc','ll-pt-reading','ll-pt-notes'].forEach(function(id){
    var el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('ll-pt-preview').textContent = '';
  llRenderTable();
  if (typeof showToast==='function') showToast('✅ נוסף');
};

// ── Render table ──────────────────────────────────────────────────────
function llRenderTable() {
  var el = document.getElementById('ll-table');
  if (!el) return;
  var tol = parseInt((document.getElementById('ll-tolerance')||{}).value) || 5;
  LL_TOLERANCE = tol;

  if (!LL.points.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">עדיין אין נקודות מדידה</div>';
    document.getElementById('ll-summary').style.display = 'none';
    return;
  }

  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<tr style="background:var(--surface2);"><th style="padding:5px 6px;text-align:right;">קוד</th><th style="padding:5px 6px;text-align:right;">תיאור</th><th style="padding:5px 6px;text-align:right;">סוג</th><th style="padding:5px 6px;text-align:right;">קריאה</th><th style="padding:5px 6px;text-align:left;">סטייה מ״מ</th><th></th></tr>';

  LL.points.forEach(function(p) {
    var over = Math.abs(p.dev_mm) > tol;
    var devColor = over ? '#ef4444' : 'var(--green)';
    var devLabel = p.dev_mm > 0 ? '+'+p.dev_mm+' ▼נמוך' : p.dev_mm < 0 ? p.dev_mm+' ▲גבוה' : '0 ✓';
    var rowBg = over ? 'background:rgba(239,68,68,0.07);' : '';
    html += '<tr style="border-bottom:1px solid var(--border);'+rowBg+'">'+
      '<td style="padding:5px 6px;font-weight:700;">'+escLL(p.code)+'</td>'+
      '<td style="padding:5px 6px;">'+escLL(p.desc)+'</td>'+
      '<td style="padding:5px 6px;font-size:11px;color:var(--text2);">'+escLL(p.type)+'</td>'+
      '<td style="padding:5px 6px;font-family:monospace;">'+p.reading.toFixed(3)+'</td>'+
      '<td style="padding:5px 6px;font-weight:800;color:'+devColor+';">'+devLabel+'</td>'+
      '<td style="padding:3px;"><button onclick="llDeletePoint('+p.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:13px;">✕</button></td>'+
    '</tr>';
  });
  html += '</table>';
  el.innerHTML = html;

  // Update summary
  var devs = LL.points.map(function(p){return p.dev_mm;});
  var maxD = Math.max.apply(null, devs);
  var minD = Math.min.apply(null, devs);
  var range = maxD - minD;
  var sumEl = document.getElementById('ll-summary');
  if (sumEl) sumEl.style.display = 'block';
  var elMax = document.getElementById('ll-max-dev'); if (elMax) elMax.textContent = maxD;
  var elMin = document.getElementById('ll-min-dev'); if (elMin) elMin.textContent = minD;
  var elRng = document.getElementById('ll-range-dev'); if (elRng) elRng.textContent = range;
  // Color range cell
  if (elRng) elRng.style.color = range > tol ? '#ef4444' : 'var(--green)';
}

window.llDeletePoint = function(id) {
  LL.points = LL.points.filter(function(p){ return p.id !== id; });
  llRenderTable();
};

window.llClear = function() {
  if (!confirm('למחוק את כל הנקודות?')) return;
  LL.points = [];
  LL.ref = null;
  LL.nextCode = 1;
  var refVal = document.getElementById('ll-ref-val'); if (refVal) refVal.value = '';
  var refSt  = document.getElementById('ll-ref-status'); if (refSt) refSt.textContent = 'הזן קריאת ייחוס כדי להתחיל';
  llRenderTable();
};

// ── Save to Supabase ──────────────────────────────────────────────────
window.llSave = async function() {
  if (!LL.points.length) { if (typeof showToast==='function') showToast('אין נקודות לשמירה'); return; }
  var project = (document.getElementById('ll-project')||{}).value || 'ללא שם';
  var room    = (document.getElementById('ll-room')||{}).value || '';
  var date    = (document.getElementById('ll-date')||{}).value || new Date().toISOString().split('T')[0];
  var devs    = LL.points.map(function(p){return p.dev_mm;});
  var summary = { ref: LL.ref, max_mm: Math.max.apply(null,devs), min_mm: Math.min.apply(null,devs), range_mm: Math.max.apply(null,devs)-Math.min.apply(null,devs), count: LL.points.length };
  try {
    var res = await window.sb.from('site_takeoffs').insert({
      project_name:  project,
      takeoff_date:  date,
      session_label: room || null,
      takeoff_type:  'laser',
      rows:          JSON.stringify(LL.points),
      total_area:    0,
      deductions:    JSON.stringify(summary),
      created_at:    new Date().toISOString()
    });
    if (res.error) throw res.error;
    if (typeof showToast==='function') showToast('✅ נשמר בסופרבייס');
  } catch(e) {
    if (typeof showToast==='function') showToast('שגיאה: '+e.message);
  }
};

// ── Export Excel ──────────────────────────────────────────────────────
window.llExportExcel = function() {
  if (!LL.points.length) { if (typeof showToast==='function') showToast('אין נקודות'); return; }
  var project = (document.getElementById('ll-project')||{}).value || 'ללא שם';
  var room    = (document.getElementById('ll-room')||{}).value || '';
  var date    = (document.getElementById('ll-date')||{}).value || new Date().toISOString().split('T')[0];
  var devs = LL.points.map(function(p){return p.dev_mm;});
  var BOM = '\uFEFF';
  var rows = [
    ['מדידת גבהים במאזנת לייזר — '+project+(room?' — '+room:'')],
    ['תאריך: '+date],
    ['קריאת ייחוס: '+(LL.ref||'—')+' מ\''],
    [],
    ['קוד_נקודה','תיאור_נקודה','סוג_מדידה','קריאה_ייחוס_מ','קריאה_נקודה_מ','סטייה_מייחוס_מ','סטייה_מייחוס_ממ','הערות']
  ];
  LL.points.forEach(function(p) {
    rows.push([p.code, p.desc, p.type, LL.ref, p.reading, p.dev_m, p.dev_mm, p.notes]);
  });
  rows.push([]);
  rows.push(['סיכום','','','','','מקסימום מ״מ',Math.max.apply(null,devs),'']);
  rows.push(['','','','','','מינימום מ״מ',Math.min.apply(null,devs),'']);
  rows.push(['','','','','','טווח מ״מ',Math.max.apply(null,devs)-Math.min.apply(null,devs),'']);

  var csv = BOM + rows.map(function(row){
    return row.map(function(c){
      var s=String(c===null||c===undefined?'':c);
      if(s.includes(',')||s.includes('"')||s.includes('\n')) s='"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(',');
  }).join('\n');

  var blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href=url; a.download='מדידת_גבהים_'+project.replace(/\s/g,'_')+'_'+date+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast==='function') showToast('✅ Excel הורד');
};

// ── WhatsApp ──────────────────────────────────────────────────────────
window.llSendWA = function() {
  if (!LL.points.length) { if (typeof showToast==='function') showToast('אין נקודות'); return; }
  var project = (document.getElementById('ll-project')||{}).value || 'ללא שם';
  var room    = (document.getElementById('ll-room')||{}).value || '';
  var date    = (document.getElementById('ll-date')||{}).value || new Date().toISOString().split('T')[0];
  var tol     = LL_TOLERANCE;
  var devs    = LL.points.map(function(p){return p.dev_mm;});
  var lines   = ['📏 *מדידת גבהים במאזנת*','פרויקט: '+project+(room?' | '+room:''),'תאריך: '+date,'ייחוס: '+(LL.ref||'—')+' מ\'',''];
  LL.points.forEach(function(p) {
    var icon = Math.abs(p.dev_mm)>tol ? '🔴' : '🟢';
    var sign = p.dev_mm>0 ? '▼נמוך' : p.dev_mm<0 ? '▲גבוה' : '✓';
    lines.push(icon+' '+p.code+' '+p.desc+': '+p.dev_mm+' מ״מ ('+sign+')');
  });
  lines.push('','📊 *סיכום*','מקסימום: '+Math.max.apply(null,devs)+' מ״מ','מינימום: '+Math.min.apply(null,devs)+' מ״מ','טווח: '+(Math.max.apply(null,devs)-Math.min.apply(null,devs))+' מ״מ');
  var msg = lines.join('\n');
  var a = document.createElement('a');
  a.href='https://wa.me/?text='+encodeURIComponent(msg);
  a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

function escLL(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Boot: called by switchTab after injection ──────────────────────────
// window.llInit() is called externally by switchTab

})();
