const CLAIM_DAYS = 7;
const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;

const DRAWS = [
  {key:'tica_dia',    name:'Tica Día (12:55 PM)',       country:'CR', closeH:12, closeM:55},
  {key:'tica_tarde',  name:'Tica Tarde (4:30 PM)',      country:'CR', closeH:16, closeM:30},
  {key:'tica_noche',  name:'Tica Noche (7:30 PM)',      country:'CR', closeH:19, closeM:30},
  {key:'nica_manana', name:'Nica Mañana (11:00 AM)',    country:'NI', closeH:11, closeM:0},
  {key:'nica_tarde',  name:'Nica Tarde (3:00 PM)',      country:'NI', closeH:15, closeM:0},
  {key:'nica_vesper', name:'Nica Vespertina (6:00 PM)', country:'NI', closeH:18, closeM:0, weekendOnly:true},
  {key:'nica_noche',  name:'Nica Noche (9:00 PM)',      country:'NI', closeH:21, closeM:0},
  {key:'primera_am',  name:'La Primera (10:00 AM)',     country:'DO', closeH:10, closeM:0},
  {key:'primera_pm',  name:'La Primera (6:00 PM)',      country:'DO', closeH:17, closeM:0},
];

function ownerLabel(id){
  return id==='admin' ? 'Administración' : App.pointName(id);
}

// Nica y La Primera no juegan reventado
function sinReventado(name){
  const n = (name || '').toLowerCase();
  return n.includes('nica') || n.includes('primera');
}

function isDrawActiveToday(draw){
  return !draw.weekendOnly || isWeekendCR();
}

function fmtClose(draw){
  const h12 = ((draw.closeH+11)%12)+1;
  const ampm = draw.closeH<12 ? 'AM':'PM';
  return `${h12}:${String(draw.closeM).padStart(2,'0')} ${ampm}`;
}