/* ProcrastiTrack app logic */
const STORAGE_KEY = 'procrasti_v1';
let logs = [];

function load() {
  try { logs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ logs = []; }
}
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(logs)); }

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

/* Rendering */
const listEl = document.getElementById('list');
const totalCountEl = document.getElementById('totalCount');
const totalMinutesEl = document.getElementById('totalMinutes');
const heatBar = document.getElementById('heatBar');
const heatPercent = document.getElementById('heatPercent');
const suggestionsEl = document.getElementById('suggestions');

function renderList(){
  listEl.innerHTML = '';
  const reversed = [...logs].reverse();
  for (const log of reversed) {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `
      <div style="font-size:20px; width:44px; height:44px; display:grid; place-items:center; border-radius:10px;">
        ${emojiFor(log.actual)}
      </div>
      <div style="flex:1">
        <div style="font-weight:700">${escapeHtml(log.actual)}</div>
        <div class="small-muted">instead of <strong>${escapeHtml(log.intended)}</strong> • ${log.minutes ? log.minutes+'m' : '—'}</div>
      </div>
      <div class="small-muted" style="text-align:right">${new Date(log.t).toLocaleString()}</div>
    `;
    listEl.appendChild(item);
  }
}

function updateStats(){
  const total = logs.length;
  const minutes = logs.reduce((s,l)=> s + (Number(l.minutes)||0), 0);
  totalCountEl.textContent = total;
  totalMinutesEl.textContent = minutes;
  // heat: ratio of logs this week vs arbitrary threshold
  const heat = Math.min(100, Math.round((total / Math.max(1,7)) * 14)); // playful formula
  heatBar.style.width = heat + '%';
  heatPercent.textContent = heat + '%';
}

/* Chart */
let chart=null;
function updateChart(){
  const counts = {};
  for (const l of logs) {
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
    data: { labels, datasets: [{ label:'Times', data, backgroundColor: labels.map(()=> 'rgba(108,92,231,0.9)') }]},
    options: { responsive:true, plugins:{ legend:{ display:false } }, scales:{ y:{ beginAtZero:true }}}
  });
}

/* Helpers */
function escapeHtml(s=''){ return (s+'').replace(/[&<>"']/g, c=> ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* Suggestion engine */
function generateSuggestion(log){
  if (!log) return { text: 'Log something to get tailored tips!', reward: 'A 10-minute guilt-free break' };
  const act = (log.actual||'').toLowerCase();
  if (act.includes('tiktok')||act.includes('instagram')||act.includes('scroll')){
    return { text: 'Try a 25/5 Pomodoro: 25 mins focus, 5 mins break. Use a site-blocker for 25 min.', reward: 'Snack + stretch' };
  }
  if (act.includes('sleep')||act.includes('nap')){
    return { text: 'Maybe you need a short power nap before focusing. Schedule a 20 min rest then do a 50 min session.', reward: 'A hot drink' };
  }
  if (act.includes('youtube')||act.includes('netflix')){
    return { text: 'Set a timer: watch only 30 minutes after you finish one small task.', reward: 'One favorite episode' };
  }
  return { text: 'Break the task into a tiny 5-minute step and start with that — momentum beats motivation.', reward: 'Small treat' };
}

/* Events */
document.getElementById('logForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const intended = document.getElementById('intended').value.trim();
  const actual = document.getElementById('actual').value.trim();
  const minutes = document.getElementById('minutes').value.trim();
  if (!intended || !actual) return;
  const log = { intended, actual, minutes: minutes? Number(minutes):0, t: Date.now() };
  logs.push(log);
  save();
  renderList(); updateStats(); updateChart();
  // update suggestion
  const sug = generateSuggestion(log);
  suggestionsEl.textContent = sug.text + ' • Reward: ' + sug.reward;
  // subtle reset & focus
  document.getElementById('actual').value = '';
  document.getElementById('minutes').value = '';
  document.getElementById('actual').focus();
});

document.getElementById('suggestBtn').addEventListener('click', ()=>{
  const sample = { intended:'Finish task', actual:'Scrolling social', minutes:10, t: Date.now() };
  const s = generateSuggestion(sample);
  suggestionsEl.textContent = s.text + ' • Reward: ' + s.reward;
});

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(logs, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'procrasti-logs.json'; a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('clearBtn').addEventListener('click', ()=>{
  if (!confirm('Clear all logs? This cannot be undone.')) return;
  logs = []; save(); renderList(); updateStats(); updateChart();
  suggestionsEl.textContent = 'Cleared — start fresh!';
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
        alert('Imported ' + logs.length + ' logs.');
      } catch(err){ alert('Invalid JSON file'); }
    };
    reader.readAsText(f);
  };
  input.click();
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
init();

