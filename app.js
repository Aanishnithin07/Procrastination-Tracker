/* ProcrastiTrack app logic */
const STORAGE_KEY = 'procrasti_v1';
let logs = [];

function load() {
  try { logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ logs = []; }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); }

// Toast notification
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = 'success-toast';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function emojiFor(text='') {
  text = text.toLowerCase();
  const mapping = [
    [['tiktok','instagram','snap','reel','social','scroll','feed'],'📱'],
    [['youtube','netflix','hulu','prime','movie','tv','series'],'🎬'],
    [['sleep','nap','doze'],'😴'],
    [['game','minecraft','fortnite','valorant','csgo','xbox','playstation'],'🎮'],
    [['coffee','tea','snack','eat','kitchen'],'☕️'],
    [['read','book','article','reddit'],'📚'],
    [['exercise','gym','run','walk','yoga'],'🏃‍♂️'],
    [['code','program','dev','debug','cursor'],'💻'],
  ];
  for (const [keys, emoji] of mapping) {
    for (const k of keys) if (text.includes(k)) return emoji;
  }
  // fallback: choose emoji by random-ish hash
  const pool = ['🪄','🌀','✨','🛋️','🎧','🍿','📺','🧠'];
  let h=0; for (let i=0;i<text.length;i++) h = (h*31 + text.charCodeAt(i))|0;
  return pool[Math.abs(h) % pool.length];
}

function productivityEmojiFor(text=''){
  text = (text||'').toLowerCase();
  const mapping = [
    [['study','read','book','notes','course','learn'],'📘'],
    [['finish','done','complete','ship','submit'],'✅'],
    [['exercise','gym','run','walk','yoga'],'💪'],
    [['code','program','build','fix','debug'],'💻'],
  ];
  for (const [keys, emoji] of mapping) {
    for (const k of keys) if (text.includes(k)) return emoji;
  }
  return '✨';
}

/* Rendering */
let listEl, totalCountEl, totalMinutesEl, productiveMinutesEl, heatBar, heatPercent, suggestionsEl;
document.addEventListener('DOMContentLoaded', ()=>{
  listEl = document.getElementById('list');
  totalCountEl = document.getElementById('totalCount');
  totalMinutesEl = document.getElementById('totalMinutes');
  productiveMinutesEl = document.getElementById('productiveMinutes');
  heatBar = document.getElementById('heatBar');
  heatPercent = document.getElementById('heatPercent');
  suggestionsEl = document.getElementById('suggestions');
});

function renderList(){
  listEl.innerHTML = '';
  const reversed = [...logs].reverse();
  for (const log of reversed) {
    const item = document.createElement('div');
    const productive = isProductive(log);
    item.className = 'list-item ' + (productive ? 'ring-productive' : 'ring-distraction');
    item.innerHTML = `
      <div style="font-size:20px; width:44px; height:44px; display:grid; place-items:center; border-radius:10px;">
        ${productive ? productivityEmojiFor(log.actual) : emojiFor(log.actual)}
      </div>
      <div style="flex:1">
        <div style="font-weight:700">${escapeHtml(log.actual)} <span class="badge ${productive?'badge-productive':'badge-distraction'}">${productive?'productive':'distraction'}</span></div>
        <div class="small-muted">${productive ? 'matched' : 'instead of'} <strong>${escapeHtml(log.intended)}</strong> • ${log.minutes ? log.minutes+'m' : '—'}</div>
      </div>
      <div class="small-muted" style="text-align:right">${new Date(log.t).toLocaleString()}</div>
    `;
    listEl.appendChild(item);
  }
}

function isProductive(log){
  const a = (log.actual||'').trim().toLowerCase();
  const i = (log.intended||'').trim().toLowerCase();
  if (!a || !i) return false;
  // treat close matches as productive
  return a === i || a.includes(i) || i.includes(a);
}

function updateStats(){
  const total = logs.length;
  const wastedMinutes = logs.reduce((s,l)=> s + (isProductive(l) ? 0 : (Number(l.minutes)||0)), 0);
  const productiveMinutes = logs.reduce((s,l)=> s + (isProductive(l) ? (Number(l.minutes)||0) : 0), 0);
  const wastedCount = logs.filter(l=> !isProductive(l)).length;
  const productiveCount = total - wastedCount;
  totalCountEl.textContent = total;
  totalMinutesEl.textContent = wastedMinutes;
  if (productiveMinutesEl) productiveMinutesEl.textContent = productiveMinutes;
  const totalDistractionsEl = document.getElementById('totalDistractions');
  const totalProductiveEl = document.getElementById('totalProductive');
  if (totalDistractionsEl) totalDistractionsEl.textContent = wastedCount;
  if (totalProductiveEl) totalProductiveEl.textContent = productiveCount;
  // heat reflects wasted percentage
  const denominator = Math.max(1, total);
  const heat = Math.round((wastedCount / denominator) * 100);
  heatBar.style.width = heat + '%';
  heatPercent.textContent = heat + '%';
}

/* Chart */
let chart=null, prodChart=null;
function updateChart(){
  const counts = {};
  for (const l of logs) {
    if (isProductive(l)) continue; // only chart distractions
    const key = (l.actual || 'Unknown').toLowerCase();
    counts[key] = (counts[key]||0) + 1;
  }
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const labels = sorted.map(s=> s[0].slice(0,24));
  const data = sorted.map(s=> s[1]);

  const ctx = document.getElementById('topChart').getContext('2d');
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: 'bar',
    data: { 
      labels, 
      datasets: [{ 
        label:'Distractions', 
        data, 
        backgroundColor: 'rgba(239,68,68,0.8)',
        borderColor: 'rgba(239,68,68,1)',
        borderWidth: 2,
        borderRadius: 8,
        barThickness: 30
      }]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: true,
      plugins:{ 
        legend:{ display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 }
        }
      }, 
      scales:{ 
        y: { 
          beginAtZero: true,
          ticks: { color: 'rgba(230,238,248,0.6)', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: 'rgba(230,238,248,0.6)', font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });

  // Productive chart
  const pcounts = {};
  for (const l of logs) {
    if (!isProductive(l)) continue;
    const key = (l.actual || 'Unknown').toLowerCase();
    pcounts[key] = (pcounts[key]||0) + 1;
  }
  const psorted = Object.entries(pcounts).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const plabels = psorted.map(s=> s[0].slice(0,24));
  const pdata = psorted.map(s=> s[1]);
  const pctx = document.getElementById('topProdChart').getContext('2d');
  if (prodChart) prodChart.destroy();
  prodChart = new Chart(pctx, {
    type: 'bar',
    data: { 
      labels: plabels, 
      datasets: [{ 
        label:'Productive', 
        data: pdata, 
        backgroundColor: 'rgba(0,210,255,0.8)',
        borderColor: 'rgba(0,210,255,1)',
        borderWidth: 2,
        borderRadius: 8,
        barThickness: 30
      }]
    },
    options: { 
      responsive: true,
      maintainAspectRatio: true,
      plugins:{ 
        legend:{ display: false },
        tooltip: {
          backgroundColor: 'rgba(0,0,0,0.8)',
          padding: 12,
          cornerRadius: 8,
          titleFont: { size: 14, weight: 'bold' },
          bodyFont: { size: 13 }
        }
      }, 
      scales:{ 
        y: { 
          beginAtZero: true,
          ticks: { color: 'rgba(230,238,248,0.6)', font: { size: 11 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        x: {
          ticks: { color: 'rgba(230,238,248,0.6)', font: { size: 11 } },
          grid: { display: false }
        }
      }
    }
  });
}

/* Helpers */
function escapeHtml(s=''){ return (s+'').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* Suggestion engine */
function generateSuggestion(log){
  if (!log) return { text: 'Log something to get tailored tips!', reward: 'A 10-minute guilt-free break' };
  const act = (log.actual||'').toLowerCase();
  if (isProductive(log)){
    const ups = [
      { text: 'Nice! Keep the momentum — queue the next tiny step now.', reward: 'High-five yourself or take a 2-min walk' },
      { text: 'Great focus! Set a 25-min timer for the next chunk.', reward: 'Your favorite song' },
      { text: 'You’re on track — jot down one concrete next action.', reward: 'A sip of coffee/tea' },
    ];
    return ups[Math.floor(Math.random()*ups.length)];
  }
  const downs = [
    { match: /(tiktok|instagram|scroll|feed)/, text: 'Try a 25/5 Pomodoro: 25 on, 5 off; block socials during focus.', reward: 'Snack + stretch' },
    { match: /(youtube|netflix|movie|tv|series)/, text: 'Finish one tiny task first, then watch one short clip.', reward: 'One short video' },
    { match: /(sleep|nap|doze)/, text: 'Maybe rest first: power nap 20, then a 50-min focus block.', reward: 'Warm drink' },
    { match: /.*/, text: 'Break it down to a 5-minute starter step and begin now.', reward: 'Small treat' },
  ];
  for (const rule of downs){ if (rule.match.test(act)) return { text: rule.text, reward: rule.reward }; }
}

/* Events */
document.addEventListener('DOMContentLoaded', ()=>{
const logForm = document.getElementById('logForm');
if (logForm) logForm.addEventListener('submit', (e)=>{
  e.preventDefault();
  const intended = document.getElementById('intended').value.trim();
  const actual = document.getElementById('actual').value.trim();
  const minutes = document.getElementById('minutes').value.trim();
  if (!intended || !actual) return;
  // if same, it's productive; still log, but classification will reflect it
  const log = { intended, actual, minutes: minutes? Number(minutes):0, t: Date.now() };
  logs.push(log);
  save();
  renderList(); updateStats(); updateChart();
  // update suggestion
  const sug = generateSuggestion(log);
  suggestionsEl.textContent = sug.text + ' • Reward: ' + sug.reward;
  // Show toast notification
  const isProductiveLog = isProductive(log);
  showToast(isProductiveLog ? '🎉 Productive time logged!' : '📝 Distraction logged');
  // subtle reset & focus
  document.getElementById('actual').value = '';
  document.getElementById('minutes').value = '';
  document.getElementById('actual').focus();
});

const suggestBtn = document.getElementById('suggestBtn');
if (suggestBtn) suggestBtn.addEventListener('click', ()=>{
  const sample = { intended:'Finish task', actual:'Scrolling social', minutes:10, t: Date.now() };
  const s = generateSuggestion(sample);
  suggestionsEl.textContent = s.text + ' • Reward: ' + s.reward;
});

const logProdBtn = document.getElementById('logProdBtn');
if (logProdBtn) logProdBtn.addEventListener('click', ()=>{
  const intended = document.getElementById('intended').value.trim();
  if (!intended) { alert('Enter what you should be doing first.'); return; }
  const minutesVal = document.getElementById('minutes').value.trim();
  const minutes = minutesVal ? Number(minutesVal) : 0;
  const log = { intended, actual: intended, minutes, t: Date.now() };
  logs.push(log);
  save();
  renderList(); updateStats(); updateChart();
  const sug = generateSuggestion(log);
  suggestionsEl.textContent = sug.text + ' • Reward: ' + sug.reward;
  showToast('🎯 Great job! Productivity logged!');
});

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'procrasti-logs.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Data exported successfully!');
});

document.getElementById('clearBtn').addEventListener('click', ()=>{
  if (!confirm('Clear all logs? This cannot be undone.')) return;
  logs = []; save(); renderList(); updateStats(); updateChart();
  suggestionsEl.textContent = 'Cleared — start fresh!';
  showToast('🗑️ All logs cleared!');
});

document.getElementById('importBtn').addEventListener('click', ()=>{
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = ()=> {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = ()=> {
      try {
        const arr = JSON.parse(reader.result);
        if (!Array.isArray(arr)) throw new Error('Not an array');
        logs = arr; save(); renderList(); updateStats(); updateChart();
        showToast(`📤 Imported ${logs.length} logs successfully!`);
      } catch(err){ alert('Invalid JSON file'); }
    };
    reader.readAsText(f);
  };
  input.click();
});
});

/* Init */
function init(){
  load(); renderList(); updateStats(); updateChart();
  if (logs.length) {
    const last = logs[logs.length - 1];
    const s = generateSuggestion(last);
    suggestionsEl.textContent = s.text + ' • Reward: ' + s.reward;
  }
}
document.addEventListener('DOMContentLoaded', init);

