// ══════════════════════════════════════════════════════════════════════
// DETAILED TAKEOFF MODULE — מדידות מפורטות
// Loaded on demand from Supabase Storage app-assets bucket
// Saves to site_takeoffs (takeoff_type='detailed')
// ══════════════════════════════════════════════════════════════════════

(function() {
'use strict';

// ── State ─────────────────────────────────────────────────────────────
var DT = {
  rows: [],        // {id, code, desc, cat, shape, dim1, dim2, dim3, area, notes}
  session: null,   // {project, date, unit}
  nextCode: 1
};

var DT_SHAPES = {
  rect:     { label: 'מלבן',    fields: ['אורך','רוחב'],           calc: function(v){ return v[0]*v[1]; }},
  triangle: { label: 'משולש',   fields: ['בסיס','גובה'],           calc: function(v){ return 0.5*v[0]*v[1]; }},
  circle:   { label: 'עיגול',   fields: ['רדיוס'],                 calc: function(v){ return Math.PI*v[0]*v[0]; }},
  trap:     { label: 'טרפז',    fields: ['בסיס א','בסיס ב','גובה'],calc: function(v){ return 0.5*(v[0]+v[1])*v[2]; }},
  manual:   { label: 'ידני',    fields: ['שטח'],                    calc: function(v){ return v[0]; }}
};

// ── Panel Init ────────────────────────────────────────────────────────
window.dtInit = function() {
  dtRenderPanel();
  dtNewSession();
};

function dtRenderPanel() {
  var el = document.getElementById('panel-detailed-inner');
  if (!el) return;
  el.innerHTML = [
    // Header / session
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">',
      '<input id="dt-project" placeholder="שם פרויקט / אתר" style="flex:1;min-width:120px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
      '<input id="dt-unit"    placeholder="יחידה / קומה (אופציונלי)" style="flex:1;min-width:100px;padding:9px 12px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
      '<input id="dt-date" type="date" style="width:130px;padding:9px 10px;border:1.5px solid var(--border);border-radius:10px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface2);color:var(--text);">',
    '</div>',

    // Row entry form
    '<div style="background:var(--surface2);border:1.5px solid var(--border);border-radius:12px;padding:12px;margin-bottom:12px;">',
      '<div style="font-size:12px;font-weight:800;color:var(--text2);margin-bottom:8px;">➕ הוסף מדידה</div>',

      // Row 1: code, desc, category
      '<div style="display:grid;grid-template-columns:80px 1fr auto;gap:6px;margin-bottom:6px;">',
        '<input id="dt-code" placeholder="קוד" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<input id="dt-desc" placeholder="תיאור שטח / חדר" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<select id="dt-cat" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
          '<option value="base">✅ בסיס</option>',
          '<option value="deduct">➖ הפחתה</option>',
        '</select>',
      '</div>',

      // Row 2: shape selector
      '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:8px;" id="dt-shape-btns">',
        dtShapeBtn('rect','מלבן',true),
        dtShapeBtn('triangle','משולש',false),
        dtShapeBtn('circle','עיגול',false),
        dtShapeBtn('trap','טרפז',false),
        dtShapeBtn('manual','ידני',false),
      '</div>',

      // Row 3: dimension inputs (dynamic)
      '<div id="dt-dims" style="display:grid;gap:6px;margin-bottom:6px;"></div>',

      // Row 4: notes + add button
      '<div style="display:flex;gap:6px;">',
        '<input id="dt-notes" placeholder="הערות" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:13px;background:var(--surface);color:var(--text);">',
        '<button onclick="dtAddRow()" style="background:var(--green);color:white;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap;">➕ הוסף</button>',
      '</div>',
    '</div>',

    // Rows table
    '<div id="dt-table-wrap" style="margin-bottom:12px;overflow-x:auto;">',
      '<div id="dt-table"></div>',
    '</div>',

    // Totals
    '<div id="dt-totals" style="background:var(--surface2);border-radius:12px;padding:12px;margin-bottom:12px;display:none;">',
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">',
        '<div><div style="font-size:10px;color:var(--text2);">שטח בסיס</div><div id="dt-tot-base" style="font-size:18px;font-weight:900;color:var(--green);">0</div></div>',
        '<div><div style="font-size:10px;color:var(--text2);">הפחתות</div><div id="dt-tot-deduct" style="font-size:18px;font-weight:900;color:#ef4444;">0</div></div>',
        '<div><div style="font-size:10px;color:var(--text2);">שטח נטו</div><div id="dt-tot-net" style="font-size:20px;font-weight:900;color:var(--orange);">0</div></div>',
      '</div>',
      '<div style="text-align:center;font-size:10px;color:var(--text3);margin-top:4px;">מ״ר</div>',
    '</div>',

    // Action buttons
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">',
      '<button onclick="dtSave()" style="background:linear-gradient(135deg,#1a3d5c,#2d6a9f);color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">💾 שמור לסופרבייס</button>',
      '<button onclick="dtExportExcel()" style="background:#1e6b30;color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">📊 ייצא Excel</button>',
      '<button onclick="dtSendWA()" style="background:#25D366;color:white;border:none;border-radius:10px;padding:11px;font-size:13px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">💬 WhatsApp</button>',
      '<button onclick="dtClear()" style="background:var(--surface2);color:#ef4444;border:1.5px solid var(--border);border-radius:10px;padding:11px;font-size:13px;font-weight:700;cursor:pointer;font-family:Heebo,sans-serif;">🗑 נקה</button>',
    '</div>'
  ].join('');

  dtSelectShape('rect');
}

function dtShapeBtn(id, label, active) {
  var s = active
    ? 'background:var(--orange);color:white;border:none;'
    : 'background:var(--surface);color:var(--text2);border:1.5px solid var(--border);';
  return '<button id="dt-sh-'+id+'" onclick="dtSelectShape(\''+id+'\')" style="'+s+'border-radius:8px;padding:7px 3px;font-size:11px;font-weight:800;cursor:pointer;font-family:Heebo,sans-serif;">'+label+'</button>';
}

// ── Shape selection ───────────────────────────────────────────────────
window.dtSelectShape = function(shape) {
  window._dtShape = shape;
  // Update button styles
  Object.keys(DT_SHAPES).forEach(function(s) {
    var btn = document.getElementById('dt-sh-'+s);
    if (!btn) return;
    if (s === shape) {
      btn.style.background = 'var(--orange)';
      btn.style.color = 'white';
      btn.style.border = 'none';
    } else {
      btn.style.background = 'var(--surface)';
      btn.style.color = 'var(--text2)';
      btn.style.border = '1.5px solid var(--border)';
    }
  });
  // Render dimension inputs
  var cfg = DT_SHAPES[shape];
  var dims = document.getElementById('dt-dims');
  if (!dims) return;
  var cols = cfg.fields.length === 1 ? '1fr' : cfg.fields.length === 2 ? '1fr 1fr' : '1fr 1fr 1fr';
  dims.style.gridTemplateColumns = cols;
  dims.innerHTML = cfg.fields.map(function(f, i) {
    return '<input id="dt-d'+i+'" type="number" step="0.001" placeholder="'+f+' (מ\')" oninput="dtPreview()" style="padding:8px;border:1.5px solid var(--border);border-radius:8px;font-family:Heebo,sans-serif;font-size:14px;background:var(--surface);color:var(--text);">';
  }).join('');
};

window.dtPreview = function() {}; // placeholder

// ── Add row ───────────────────────────────────────────────────────────
window.dtAddRow = function() {
  var code  = document.getElementById('dt-code').value.trim() || ('R' + DT.nextCode);
  var desc  = document.getElementById('dt-desc').value.trim();
  var cat   = document.getElementById('dt-cat').value;
  var notes = document.getElementById('dt-notes').value.trim();
  var shape = window._dtShape || 'rect';
  var cfg   = DT_SHAPES[shape];

  if (!desc) { if (typeof showToast === 'function') showToast('הכנס תיאור שטח'); return; }

  var vals = cfg.fields.map(function(_, i) {
    var el = document.getElementById('dt-d'+i);
    return el ? parseFloat(el.value) || 0 : 0;
  });
  var area = Math.round(cfg.calc(vals) * 1000) / 1000;

  DT.rows.push({
    id: Date.now() + Math.random(),
    code: code,
    desc: desc,
    cat: cat,
    shape: shape,
    dims: vals,
    area: area,
    notes: notes
  });
  DT.nextCode++;

  // Clear inputs
  ['dt-code','dt-desc','dt-notes'].forEach(function(id) {
    var el = document.getElementById(id); if (el) el.value = '';
  });
  cfg.fields.forEach(function(_, i) {
    var el = document.getElementById('dt-d'+i); if (el) el.value = '';
  });

  dtRenderTable();
  dtUpdateTotals();
  if (typeof showToast === 'function') showToast('✅ נוסף');
};

// ── Render table ──────────────────────────────────────────────────────
function dtRenderTable() {
  var el = document.getElementById('dt-table');
  if (!el) return;
  if (!DT.rows.length) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px;">עדיין אין מדידות</div>';
    return;
  }
  var html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
  html += '<tr style="background:var(--surface2);"><th style="padding:6px 8px;text-align:right;">קוד</th><th style="padding:6px 8px;text-align:right;">תיאור</th><th style="padding:6px 8px;text-align:right;">קטגוריה</th><th style="padding:6px 8px;text-align:right;">צורה</th><th style="padding:6px 8px;text-align:left;">שטח מ״ר</th><th style="padding:6px 4px;"></th></tr>';
  DT.rows.forEach(function(r) {
    var catLabel = r.cat === 'base' ? '<span style="color:var(--green);font-weight:700;">✅ בסיס</span>' : '<span style="color:#ef4444;font-weight:700;">➖ הפחתה</span>';
    var bg = r.cat === 'deduct' ? 'background:rgba(239,68,68,0.06);' : '';
    html += '<tr style="border-bottom:1px solid var(--border);'+bg+'">'+
      '<td style="padding:6px 8px;">'+escDT(r.code)+'</td>'+
      '<td style="padding:6px 8px;">'+escDT(r.desc)+'</td>'+
      '<td style="padding:6px 8px;">'+catLabel+'</td>'+
      '<td style="padding:6px 8px;">'+DT_SHAPES[r.shape].label+'</td>'+
      '<td style="padding:6px 8px;font-weight:800;color:var(--orange);">'+r.area+'</td>'+
      '<td style="padding:4px;"><button onclick="dtDeleteRow('+r.id+')" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:14px;">✕</button></td>'+
    '</tr>';
  });
  html += '</table>';
  el.innerHTML = html;
}

window.dtDeleteRow = function(id) {
  DT.rows = DT.rows.filter(function(r) { return r.id !== id; });
  dtRenderTable();
  dtUpdateTotals();
};

function dtUpdateTotals() {
  var base   = DT.rows.filter(function(r){return r.cat==='base';}).reduce(function(s,r){return s+r.area;},0);
  var deduct = DT.rows.filter(function(r){return r.cat==='deduct';}).reduce(function(s,r){return s+r.area;},0);
  var net    = Math.round((base - deduct) * 1000) / 1000;
  base   = Math.round(base * 1000) / 1000;
  deduct = Math.round(deduct * 1000) / 1000;

  var wrap = document.getElementById('dt-totals');
  if (wrap) wrap.style.display = DT.rows.length ? 'block' : 'none';
  var elB = document.getElementById('dt-tot-base');   if (elB) elB.textContent = base;
  var elD = document.getElementById('dt-tot-deduct'); if (elD) elD.textContent = deduct;
  var elN = document.getElementById('dt-tot-net');    if (elN) elN.textContent = net;
}

// ── New session ───────────────────────────────────────────────────────
window.dtNewSession = function() {
  DT.rows = [];
  DT.nextCode = 1;
  var d = document.getElementById('dt-date');
  if (d && !d.value) d.valueAsDate = new Date();
  dtRenderTable();
  dtUpdateTotals();
};

function dtClear() {
  if (!confirm('למחוק את כל המדידות?')) return;
  dtNewSession();
}
window.dtClear = dtClear;

// ── Save to Supabase ──────────────────────────────────────────────────
window.dtSave = async function() {
  if (!DT.rows.length) { if (typeof showToast==='function') showToast('אין מדידות לשמירה'); return; }
  var project = (document.getElementById('dt-project')||{}).value || 'ללא שם';
  var unit    = (document.getElementById('dt-unit')||{}).value || '';
  var date    = (document.getElementById('dt-date')||{}).value || new Date().toISOString().split('T')[0];
  var base   = DT.rows.filter(function(r){return r.cat==='base';}).reduce(function(s,r){return s+r.area;},0);
  var deduct = DT.rows.filter(function(r){return r.cat==='deduct';}).reduce(function(s,r){return s+r.area;},0);
  var net    = Math.round((base-deduct)*1000)/1000;

  try {
    var res = await window.sb.from('site_takeoffs').insert({
      project_name:  project,
      takeoff_date:  date,
      session_label: unit || null,
      takeoff_type:  'detailed',
      rows:          JSON.stringify(DT.rows),
      total_area:    net,
      deductions:    JSON.stringify({ base: Math.round(base*1000)/1000, deduct: Math.round(deduct*1000)/1000, net: net }),
      created_at:    new Date().toISOString()
    });
    if (res.error) throw res.error;
    if (typeof showToast==='function') showToast('✅ נשמר בסופרבייס');
  } catch(e) {
    if (typeof showToast==='function') showToast('שגיאה: '+e.message);
  }
};

// ── Export Excel (CSV) ────────────────────────────────────────────────
window.dtExportExcel = function() {
  if (!DT.rows.length) { if (typeof showToast==='function') showToast('אין מדידות'); return; }
  var project = (document.getElementById('dt-project')||{}).value || 'ללא שם';
  var unit    = (document.getElementById('dt-unit')||{}).value || '';
  var date    = (document.getElementById('dt-date')||{}).value || new Date().toISOString().split('T')[0];
  var base   = Math.round(DT.rows.filter(function(r){return r.cat==='base';}).reduce(function(s,r){return s+r.area;},0)*1000)/1000;
  var deduct = Math.round(DT.rows.filter(function(r){return r.cat==='deduct';}).reduce(function(s,r){return s+r.area;},0)*1000)/1000;
  var net    = Math.round((base-deduct)*1000)/1000;

  var BOM = '\uFEFF';
  var rows = [
    ['טייקאוף מפורט — '+project+(unit?' — '+unit:'')],
    ['תאריך: '+date],
    [],
    ['קוד_שטח','תיאור_שטח','קטגוריה','סוג_צורה','מידות','שטח_מחושב_מ2','הערות']
  ];
  DT.rows.forEach(function(r) {
    var catLabel = r.cat==='base' ? 'בסיס' : 'הפחתה';
    var dimsLabel = DT_SHAPES[r.shape].fields.map(function(f,i){ return f+': '+r.dims[i]; }).join(' | ');
    rows.push([r.code, r.desc, catLabel, DT_SHAPES[r.shape].label, dimsLabel, r.area, r.notes]);
  });
  rows.push([]);
  rows.push(['','','','','שטח בסיס', base, '']);
  rows.push(['','','','','הפחתות',   deduct,'']);
  rows.push(['','','','','שטח נטו',  net,   '']);

  var csv = BOM + rows.map(function(row) {
    return row.map(function(c) {
      var s = String(c === null || c === undefined ? '' : c);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) s = '"'+s.replace(/"/g,'""')+'"';
      return s;
    }).join(',');
  }).join('\n');

  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'מדידות_מפורטות_'+project.replace(/\s/g,'_')+'_'+date+'.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast==='function') showToast('✅ Excel הורד');
};

// ── WhatsApp report ───────────────────────────────────────────────────
window.dtSendWA = function() {
  if (!DT.rows.length) { if (typeof showToast==='function') showToast('אין מדידות'); return; }
  var project = (document.getElementById('dt-project')||{}).value || 'ללא שם';
  var date    = (document.getElementById('dt-date')||{}).value || new Date().toISOString().split('T')[0];
  var base   = Math.round(DT.rows.filter(function(r){return r.cat==='base';}).reduce(function(s,r){return s+r.area;},0)*1000)/1000;
  var deduct = Math.round(DT.rows.filter(function(r){return r.cat==='deduct';}).reduce(function(s,r){return s+r.area;},0)*1000)/1000;
  var net    = Math.round((base-deduct)*1000)/1000;
  var lines  = ['📐 *מדידות מפורטות*','פרויקט: '+project,'תאריך: '+date,''];
  DT.rows.forEach(function(r) {
    var prefix = r.cat==='base' ? '✅' : '➖';
    lines.push(prefix+' '+r.code+' '+r.desc+': '+r.area+' מ״ר');
  });
  lines.push('','📊 שטח בסיס: '+base+' מ״ר','📉 הפחתות: '+deduct+' מ״ר','🎯 *שטח נטו: '+net+' מ״ר*');
  var msg = lines.join('\n');
  var a = document.createElement('a');
  a.href = 'https://wa.me/?text='+encodeURIComponent(msg);
  a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};

function escDT(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Boot: called by switchTab after injection ──────────────────────────
// window.dtInit() is called externally by switchTab

})(); // end IIFE
