// Vanilla app: loads local bundled data and renders calendar + scrollable cards
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));


const state = {
  rows: [],
  byDate: new Map(),            // yyyy-mm-dd -> rows[]
  dates: [],                    // sorted unique dates
  selectedDate: null,           // yyyy-mm-dd
  selectedIdx: 0,               // index in dates[]
  period: 'all',                // all|morning|midday|night
  category: 'all',              // all|supplements|hair_care|skin_care
  q: '',
  monthCursor: null,            // Date at 1st of month
  activeCardId: null,
  autoPeriodKey: null,
};

function ymd(d){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${da}`;
}
function normalizeDateKey(value){
  const s = String(value || '').trim();
  if(!s) return '';
  const head = s.slice(0, 10);
  if(/^\d{4}-\d{2}-\d{2}$/.test(head)) return head;
  const d = new Date(s);
  if(!Number.isNaN(d.getTime())) return ymd(d);
  return '';
}
function parseYMD(s){
  const clean = normalizeDateKey(s);
  // clean: YYYY-MM-DD
  const [y,m,d] = clean.split('-').map(Number);
  return new Date(y, (m||1)-1, d||1);
}
function prettyDate(s){
  const d = parseYMD(s);
  return d.toLocaleDateString(undefined, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
}
function shortDate(s){
  const d = parseYMD(s);
  return d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
}
function periodFromRow(r){
  // your JSON uses 'period': morning|midday|night
  const p = (r.period || '').toLowerCase();
  if (p === 'evening') return 'night';
  if (p === 'morning' || p === 'midday' || p === 'night') return p;
  return 'all';
}
function categoryMatches(r, cat){
  if (cat === 'all') return true;
  return r[cat] != null && String(r[cat]).trim() !== '';
}
function textBlob(r){
  return [
    r.date, r.time, r.weekday, r.period,
    r.supplements, r.hair_care, r.skin_care
  ].filter(Boolean).join(' ').toLowerCase();
}

function defaultPeriodForNow(now = new Date()){
  const hour = now.getHours();
  if (hour >= 7 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 19) return 'midday';
  return 'night';
}
function titleThemeForNow(now = new Date()){
  return defaultPeriodForNow(now);
}
function applyTimeTheme(){
  document.body.dataset.timeTheme = titleThemeForNow(new Date());
}
function getPreferredPeriodsForNow(){
  const nowPeriod = defaultPeriodForNow(new Date());
  if(nowPeriod === 'morning') return ['morning', 'midday', 'night'];
  if(nowPeriod === 'midday') return ['midday', 'night', 'morning'];
  return ['night', 'midday', 'morning'];
}
function refreshForClockTick(){
  applyTimeTheme();
  const nowPeriod = defaultPeriodForNow(new Date());
  if(state.autoPeriodKey === nowPeriod) return;
  state.autoPeriodKey = nowPeriod;
  focusNearestCardForNow();
}

function getBundledPayload(){
  const payload = globalThis.__ROUTINE_PAYLOAD__;
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      "Missing local data bundle: expected window.__ROUTINE_PAYLOAD__ from ./data/routine.data.js"
    );
  }
  if (!Array.isArray(payload.records)) {
    throw new Error("Invalid local data bundle: 'records' must be an array.");
  }
  return payload;
}

async function loadData(){
  const json = getBundledPayload();
  const rows = json.records || [];
  state.rows = rows;

  state.byDate.clear();
  for(const r of rows){
    const key = normalizeDateKey(r.date);
    if(!key) continue;
    if(!state.byDate.has(key)) state.byDate.set(key, []);
    state.byDate.get(key).push(r);
  }

  state.dates = Array.from(state.byDate.keys()).sort();
  // Sort each date's rows by time (HH:MM)
  for(const d of state.dates){
    state.byDate.get(d).sort((a,b)=> String(a.time||'').localeCompare(String(b.time||'')));
  }

  // Default selected date: today if present, else first available
  const todayKey = ymd(new Date());
  state.selectedDate = state.byDate.has(todayKey) ? todayKey : (state.dates[0] || null);
  state.selectedIdx = Math.max(0, state.dates.indexOf(state.selectedDate));
  state.monthCursor = state.selectedDate ? new Date(parseYMD(state.selectedDate).getFullYear(), parseYMD(state.selectedDate).getMonth(), 1) : new Date();

}

function setBg(period){
  const bg = $('#bg');
  $$('.bg-layer', bg).forEach(el => el.classList.remove('active'));
  const key = (period === 'night') ? 'night' : (period === 'midday' ? 'midday' : (period === 'morning' ? 'morning' : 'all'));
  const layer = $(`.bg-layer[data-bg="${key}"]`, bg);
  if(layer) layer.classList.add('active');
}

function setActiveChip(groupSel, attr, value){
  $$(groupSel).forEach(btn=>{
    if(btn.getAttribute(attr) === value) btn.classList.add('active');
    else btn.classList.remove('active');
  });
}

function renderDateHeader(){
  if(!state.selectedDate){
    $('#dateMain').textContent = 'No data';
    $('#dateSub').textContent = '';
    return;
  }
  const d = parseYMD(state.selectedDate);
  $('#dateMain').textContent = prettyDate(state.selectedDate);
  $('#dateSub').textContent = `${shortDate(state.selectedDate)} | ${d.toLocaleDateString(undefined,{weekday:'long'})}`;
}

function filteredRowsForSelectedDate(){
  if(!state.selectedDate) return [];
  const rows = state.byDate.get(state.selectedDate) || [];
  return rows.filter(r=>{
    const p = periodFromRow(r);
    const matchesPeriod = state.period === 'all' || p === state.period;
    const matchesCat = categoryMatches(r, state.category);
    const matchesQ = !state.q || textBlob(r).includes(state.q);
    return matchesPeriod && matchesCat && matchesQ;
  });
}

function pillsFromCSV(s){
  if(!s) return [];
  return String(s).split(',').map(x=>x.trim()).filter(Boolean);
}

function renderPills(items){
  if(!items.length) return '—';
  return items.map((item)=>{
    const label = escapeHtml(item);
    return `<span class="pill2">${label}</span>`;
  }).join('');
}

function renderCards(){
  const cards = $('#cards');
  cards.innerHTML = '';
  const rows = filteredRowsForSelectedDate();

  if(rows.length === 0){
    cards.innerHTML = `<div class="card" style="min-width:100%;max-width:100%;text-align:center"><h3>No entries</h3><div class="v">Try different filters or search.</div></div>`;
    setBg('all');
    return;
  }

  for(let i=0;i<rows.length;i++){
    const r = rows[i];
    const id = `${r.date}__${r.time}__${i}`;
    const p = periodFromRow(r);
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = id;
    el.dataset.period = p;

    const supp = pillsFromCSV(r.supplements);
    const hair = pillsFromCSV(r.hair_care);
    const skin = pillsFromCSV(r.skin_care);

    el.innerHTML = `
      <div class="badgeRow">
        <div class="badge ${p}">${p === 'night' ? 'Night' : p.charAt(0).toUpperCase()+p.slice(1)}</div>
        <div class="badge time">${(r.time||'--')}</div>
      </div>
      <h3>${(r.weekday||'')}${r.weekday ? ' | ' : ''}${(r.period||'')}</h3>

      <div class="kv">
        <div class="k">Supps</div>
        <div class="v">${supp.length ? supp.map(x=>`<span class="pill2">${escapeHtml(x)}</span>`).join('') : '<span class="pill2">--</span>'}</div>
      </div>
      <div class="kv">
        <div class="k">Hair</div>
        <div class="v">${hair.length ? hair.map(x=>`<span class="pill2">${escapeHtml(x)}</span>`).join('') : '<span class="pill2">--</span>'}</div>
      </div>
      <div class="kv">
        <div class="k">Skin</div>
        <div class="v">${skin.length ? skin.map(x=>`<span class="pill2">${escapeHtml(x)}</span>`).join('') : '<span class="pill2">--</span>'}</div>
      </div>
    `;
    el.addEventListener('click', ()=> setActiveCard(id, r));
    cards.appendChild(el);
  }

  // Auto-select centered card
  setupCardObserver();
}

function renderSummary(){
  if(!state.selectedDate){
    $('#summaryBody').innerHTML = `<div class="empty">—</div>`;
    return;
  }
  const rows = state.byDate.get(state.selectedDate) || [];
  const bucket = { morning:new Set(), midday:new Set(), night:new Set() };

  for(const r of rows){
    const period = periodFromRow(r);
    if(!bucket[period]) continue;
    for(const item of pillsFromCSV(r.supplements)) bucket[period].add(item);
    for(const item of pillsFromCSV(r.hair_care)) bucket[period].add(item);
    for(const item of pillsFromCSV(r.skin_care)) bucket[period].add(item);
  }

  const items = ['morning', 'midday', 'night'].map((period)=>{
    const label = period.charAt(0).toUpperCase() + period.slice(1);
    const values = Array.from(bucket[period]).sort((a,b)=> a.localeCompare(b));
    return `<div class="kv"><div class="k">${label}</div><div class="v">${renderPills(values)}</div></div>`;
  }).join('');

  $('#summaryHint').textContent = 'Combined supplements, hair, and skin by period';
  $('#summaryBody').innerHTML = items || `<div class="empty">—</div>`;
}

function setActiveCard(id, row){
  state.activeCardId = id;
  $$('.card').forEach(c => c.classList.toggle('active', c.dataset.id === id));

  const p = row ? periodFromRow(row) : 'all';
  setBg(p);
}

let cardObserver = null;
function setupCardObserver(){
  if(cardObserver) cardObserver.disconnect();
  const container = $('#cards');
  const cards = $$('.card', container);
  if(cards.length === 0) return;

  cardObserver = new IntersectionObserver((entries)=>{
    // choose most centered visible
    const rectC = container.getBoundingClientRect();
    const center = rectC.left + rectC.width/2;

    let best = null;
    let bestDist = Infinity;

    for(const el of cards){
      const r = el.getBoundingClientRect();
      const c = r.left + r.width/2;
      const dist = Math.abs(center - c);
      if(dist < bestDist){
        bestDist = dist;
        best = el;
      }
    }
    if(best && best.dataset.id !== state.activeCardId){
      const id = best.dataset.id;
      const rows = filteredRowsForSelectedDate();
      const idx = cards.findIndex(x=>x.dataset.id===id);
      const row = rows[idx];
      if(row) setActiveCard(id, row);
    }
  }, { root: container, threshold: [0.55] });

  cards.forEach(c=> cardObserver.observe(c));

  // Set initial active
  focusNearestCardForNow();
}

function focusNearestCardForNow(){
  const container = $('#cards');
  const cards = $$('.card', container);
  if(cards.length === 0) return;

  const rows = filteredRowsForSelectedDate();
  if(rows.length === 0) return;

  const desiredOrder = getPreferredPeriodsForNow();
  let targetIdx = -1;

  for(const period of desiredOrder){
    targetIdx = rows.findIndex((r)=> periodFromRow(r) === period);
    if(targetIdx !== -1) break;
  }
  if(targetIdx === -1) targetIdx = 0;

  const targetCard = cards[targetIdx] || cards[0];
  const targetRow = rows[targetIdx] || rows[0];
  if(!targetCard || !targetRow) return;

  setActiveCard(targetCard.dataset.id, targetRow);
  targetCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function renderAll(){
  applyTimeTheme();
  renderDateHeader();
  renderCards();
  renderSummary();
}

function setSelectedDateByIndex(idx){
  if(state.dates.length === 0) return;
  state.selectedIdx = Math.max(0, Math.min(state.dates.length-1, idx));
  state.selectedDate = state.dates[state.selectedIdx];
  // when date changes, background resets
  setBg('all');
  renderAll();
  renderCalendar(); // keep selection highlight
}

function hookUI(){
  // chips
  $$('.chip[data-period]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.period = btn.dataset.period;
      setActiveChip('.chip[data-period]', 'data-period', state.period);
      renderCards();
    });
  });
  $$('.chip[data-cat]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.category = btn.dataset.cat;
      setActiveChip('.chip[data-cat]', 'data-cat', state.category);
      renderCards();
    });
  });
  // search
  $('#searchInput').addEventListener('input', (e)=>{
    state.q = e.target.value.trim().toLowerCase();
    renderCards();
  });

  // day navigation
  $('#prevDayBtn').addEventListener('click', ()=> setSelectedDateByIndex(state.selectedIdx - 1));
  $('#nextDayBtn').addEventListener('click', ()=> setSelectedDateByIndex(state.selectedIdx + 1));

  // scroll buttons
  $('#scrollLeftBtn').addEventListener('click', ()=> $('#cards').scrollBy({ left:-340, behavior:'smooth' }));
  $('#scrollRightBtn').addEventListener('click', ()=> $('#cards').scrollBy({ left:340, behavior:'smooth' }));

  // calendar modal
  $('#openCalendarBtn').addEventListener('click', openCalendar);
  $('#closeCalendarBtn').addEventListener('click', closeCalendar);
  $('#calendarBackdrop').addEventListener('click', closeCalendar);

  $('#prevMonthBtn').addEventListener('click', ()=>{
    const d = state.monthCursor;
    state.monthCursor = new Date(d.getFullYear(), d.getMonth()-1, 1);
    renderCalendar();
  });
  $('#nextMonthBtn').addEventListener('click', ()=>{
    const d = state.monthCursor;
    state.monthCursor = new Date(d.getFullYear(), d.getMonth()+1, 1);
    renderCalendar();
  });

  // keyboard
  window.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') closeCalendar();
    if(e.key === 'ArrowLeft') setSelectedDateByIndex(state.selectedIdx - 1);
    if(e.key === 'ArrowRight') setSelectedDateByIndex(state.selectedIdx + 1);
  });
}

function openCalendar(){
  const m = $('#calendarModal');
  m.classList.add('show');
  m.setAttribute('aria-hidden','false');
  renderCalendar();
}
function closeCalendar(){
  const m = $('#calendarModal');
  m.classList.remove('show');
  m.setAttribute('aria-hidden','true');
  hideTooltip();
}

function renderCalendar(){
  const daysEl = $('#days');
  if(!daysEl) return;

  const cursor = state.monthCursor || new Date();
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  $('#monthLabel').textContent = cursor.toLocaleDateString(undefined, { month:'long', year:'numeric' });

  const first = new Date(year, month, 1);
  const startDow = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();

  const cells = [];
  // prev month filler
  for(let i=startDow-1;i>=0;i--){
    const d = new Date(year, month-1, daysInPrev-i);
    cells.push({ date:d, current:false });
  }
  for(let d=1; d<=daysInMonth; d++){
    cells.push({ date: new Date(year, month, d), current:true });
  }
  while(cells.length % 7 !== 0 || cells.length < 42){
    const last = cells[cells.length-1].date;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate()+1), current:false });
  }

  const todayKey = ymd(new Date());

  daysEl.innerHTML = '';
  for(const cell of cells){
    const key = ymd(cell.date);
    const btn = document.createElement('div');
    btn.className = 'day' + (cell.current ? '' : ' dim') + (key === todayKey ? ' today' : '') + (key === state.selectedDate ? ' sel' : '');
    btn.textContent = String(cell.date.getDate());
    btn.dataset.date = key;

    const rows = state.byDate.get(key) || [];
    const has = { morning:false, midday:false, night:false };
    for(const r of rows){
      has[periodFromRow(r)] = true;
    }
    const dots = document.createElement('div');
    dots.className = 'dots';
    if(has.morning){ const d=document.createElement('span'); d.className='dot morning'; dots.appendChild(d); }
    if(has.midday){ const d=document.createElement('span'); d.className='dot midday'; dots.appendChild(d); }
    if(has.night){ const d=document.createElement('span'); d.className='dot night'; dots.appendChild(d); }
    btn.appendChild(dots);

    btn.addEventListener('click', (e)=>{
      const k = btn.dataset.date;
      if(state.byDate.has(k)){
        state.selectedDate = k;
        state.selectedIdx = state.dates.indexOf(k);
      }else{
        // allow selecting even if no rows (keeps UI predictable)
        state.selectedDate = k;
        if(!state.dates.includes(k)){
          // no data; keep index stable
        }else{
          state.selectedIdx = state.dates.indexOf(k);
        }
      }
      renderAll();
      renderCalendar();
      // click-to-toggle tooltip on the same day
      const tip = $('#tooltip');
      const sameDay = tip.dataset.date === k;
      const isVisible = !tip.hidden;
      if (sameDay && isVisible) {
        hideTooltip();
      } else {
        const dayEl = $(`.day[data-date="${k}"]`, $('#days'));
        if(dayEl) showTooltipForDay(dayEl, k, false);
      }
      e.stopPropagation();
    });

    daysEl.appendChild(btn);
  }
}

function showTooltipForDay(dayEl, key, hover=false){
  const tip = $('#tooltip');
  const rows = state.byDate.get(key) || [];
  if(rows.length === 0){
    tip.hidden = true;
    return;
  }

  tip.dataset.mode = hover ? 'hover' : 'click';
  tip.dataset.date = key;

  const groups = { morning:[], midday:[], night:[] };
  for(const r of rows){
    groups[periodFromRow(r)].push(r);
  }

  const section = (label, list) => {
    if(!list.length) return '';
    // compact pills: choose skin+hair+supp count line
    const pills = [];
    for(const r of list){
      if(r.supplements) pills.push(...pillsFromCSV(r.supplements).slice(0,6));
      if(r.hair_care) pills.push(...pillsFromCSV(r.hair_care).slice(0,4));
      if(r.skin_care) pills.push(...pillsFromCSV(r.skin_care).slice(0,6));
    }
    const uniq = Array.from(new Set(pills)).slice(0,14);
    return `
      <div class="ttSection">
        <div class="ttLabel">${label} (${list.length})</div>
        <div class="ttItems">${uniq.map(x=>`<span class="ttPill">${escapeHtml(x)}</span>`).join('')}</div>
      </div>
    `;
  };

  tip.innerHTML = `
    <h4>${escapeHtml(prettyDate(key))}</h4>
    ${section('Morning', groups.morning)}
    ${section('Midday', groups.midday)}
    ${section('Night', groups.night)}
  `;
  tip.hidden = false;

  // Position within modal card coordinates so tooltip stays attached to hovered day.
  const dayRect = dayEl.getBoundingClientRect();
  const modalEl = $('.modalCard');
  const modalRect = modalEl.getBoundingClientRect();
  const w = tip.offsetWidth || 360;
  const h = tip.offsetHeight || 220;
  const pad = 10;

  let left = (dayRect.left - modalRect.left) + (dayRect.width / 2) - (w / 2);
  left = Math.max(pad, Math.min(left, modalRect.width - w - pad));

  const belowTop = (dayRect.bottom - modalRect.top) + pad;
  const aboveTop = (dayRect.top - modalRect.top) - h - pad;

  let top = belowTop;
  if (belowTop + h > modalRect.height - pad) {
    top = aboveTop;
  }
  top = Math.max(pad, Math.min(top, modalRect.height - h - pad));

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function hideTooltip(){
  const tip = $('#tooltip');
  tip.hidden = true;
}

function escapeHtml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}

async function boot(){
  try{
    logLine('Loading routine data...');
    await loadData();
    state.period = 'all';
    state.autoPeriodKey = defaultPeriodForNow(new Date());
    logLine(`Loaded. Using date: ${state.selectedDate || '—'}`);
    setActiveChip('.chip[data-period]','data-period', state.period);
    setActiveChip('.chip[data-cat]','data-cat', state.category);
    hookUI();
    applyTimeTheme();
    renderAll();
    setBg('all');
    window.setInterval(()=>{
      refreshForClockTick();
    }, 60 * 1000);
    logLine('UI ready.');
  }catch(err){
    console.error(err);
    alert(String(err));
  }
}

// terminal-ish status in console
function logLine(msg){
  console.log(`[routine] ${msg}`);
}

boot();

