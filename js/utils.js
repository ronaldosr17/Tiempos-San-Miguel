// ---------- Fechas y hora de Costa Rica ----------
function addDaysToDateStr(dateStr, days){
  const [y,m,d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0,10);
}

function formatDMY(dateStr){
  const [y,m,d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function getCRTime(){
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone:'America/Costa_Rica', hour12:false, hour:'2-digit', minute:'2-digit', second:'2-digit'
  }).formatToParts(new Date());
  const get = t => parseInt(parts.find(p=>p.type===t).value, 10);
  return { h:get('hour')===24?0:get('hour'), m:get('minute'), s:get('second') };
}

function crDateStr(){
  return new Intl.DateTimeFormat('en-CA', {timeZone:'America/Costa_Rica'}).format(new Date());
}

function todayStr(){
  const [y,m,d] = crDateStr().split('-');
  return `${d}/${m}/${y}`;
}

function getCRWeekday(){
  const wd = new Intl.DateTimeFormat('en-US', {timeZone:'America/Costa_Rica', weekday:'short'}).format(new Date());
  return {Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6}[wd];
}

function isWeekendCR(){
  const wd = getCRWeekday();
  return wd === 0 || wd === 6;
}

function movDateKey(m){
  if(m.crDate) return m.crDate;
  const parts = (m.date||'').split('/');
  return parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : '';
}

// ---------- Formato y seguridad ----------
function normalizeCode(s){
  return (s||'').toUpperCase().trim().replace(/^TSM-?/,'');
}

function money(n){
  return '₡' + Number(n||0).toLocaleString('es-CR', {minimumFractionDigits:2, maximumFractionDigits:2});
}

function escapeHtml(str){
  return String(str==null ? '' : str).replace(/[&<>"']/g, c=>({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}