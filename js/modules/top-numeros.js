// Estadísticas locales del historial que ya se suscribe en la sesión admin.
Object.assign(App, {
  topSources: {},

  topSourceError(source,error){
    console.error('Error cargando datos de Top Números:',source,error);
    this.topSources[source]='error';
    this.renderTopNumbers();
  },

  setTopPeriod(period,render=true){
    const today=crDateStr();let from='',to='';
    if(period==='hoy'){from=today;to=today;}
    else if(['7','30'].includes(period)){from=addDaysToDateStr(today,1-Number(period));to=today;}
    else if(!['todo','custom'].includes(period))return;
    document.getElementById('topPeriod').value=period;
    if(period!=='custom'){
      document.getElementById('topFrom').value=from;
      document.getElementById('topTo').value=to;
    }
    if(render)this.renderTopNumbers();
  },

  onTopDatesChange(){document.getElementById('topPeriod').value='custom';this.renderTopNumbers();},

  topNumber(value){
    const raw=String(value??'').trim();
    return /^\d{1,2}$/.test(raw) ? raw.padStart(2,'0') : null;
  },

  topDate(record){
    const date=movDateKey(record);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
    const parsed=new Date(date+'T12:00:00Z');
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date ? date : null;
  },

  topDraw(name){
    if(typeof name!=='string')return null;
    const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
    const cleaned=normalize(name);
    const exact=DRAWS.find(d=>normalize(d.name)===cleaned);
    if(exact)return exact;
    const aliases=DRAWS.filter(d=>normalize(d.name.replace(/\s*\([^)]*\)/g,''))===cleaned);
    return aliases.length===1 ? aliases[0] : null;
  },

  topDrawKey(name){
    return this.topDraw(name)?.key || String(name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
  },

  topStats(filters){
    if(this.currentRole!=='admin')return null;
    const map=new Map();const risks=new Map();let invalid=0,resultsCount=0,ticketsCount=0,total=0;
    const number=n=>{if(!map.has(n))map.set(n,{num:n,wins:0,tickets:0,direct:0,rev:0,stake:0,last:''});return map.get(n);};
    const allowedDate=date=>!!date && (!filters.from || date>=filters.from) && (!filters.to || date<=filters.to);
    const familyOf=draw=>this.numberBlockFamily(draw||'');
    const allowedFamily=draw=>familyOf(draw) && (!filters.family || familyOf(draw)===filters.family);
    // Un resultado se cuenta una vez por sorteo/fecha, aunque haya IDs o alias repetidos.
    const draws=new Map();
    for(const result of this.results){
      const date=this.topDate(result),num=this.topNumber(result.numero);
      if(!allowedFamily(result.draw))continue;
      if(!date || !num){invalid++;continue;}
      const key=this.topDrawKey(result.draw)+'|'+date;
      if(!draws.has(key))draws.set(key,{date,numbers:new Set()});
      draws.get(key).numbers.add(num);
    }
    for(const draw of draws.values()){
      if(!allowedDate(draw.date))continue;
      if(draw.numbers.size!==1){invalid++;continue;}
      const item=number([...draw.numbers][0]);item.wins++;resultsCount++;if(draw.date>item.last)item.last=draw.date;
    }
    const seen=new Set();
    for(const [index,ticket] of this.tickets.entries()){
      if(filters.owner && ticket.owner!==filters.owner)continue;
      if(!allowedFamily(ticket.draw))continue;
      if(['anulado','anulada','cancelado','cancelada','eliminado','eliminada'].includes(String(ticket.status||'').toLowerCase()))continue;
      const date=this.topDate(ticket);
      if(!date || !Array.isArray(ticket.lines)){invalid++;continue;}
      const id=ticket._id || ticket.id || 'row:'+index;
      if(seen.has(id))continue;seen.add(id);
      const inPeriod=allowedDate(date),validNumbers=new Set();
      const drawKey=this.topDrawKey(ticket.draw);
      const pending=date===crDateStr() && !ticket.paid && !draws.has(drawKey+'|'+date);
      for(const line of ticket.lines){
        const num=this.topNumber(line?.num);
        const numeric=v=>typeof v==='number' ? v : typeof v==='string' && /^\d+(?:\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
        const direct=numeric(line?.amt),rev=numeric(line?.rev??0);
        if(!num || !Number.isFinite(direct) || !Number.isFinite(rev) || direct<0 || rev<0 || direct+rev<=0){invalid++;continue;}
        if(inPeriod){
          validNumbers.add(num);const item=number(num);
          item.direct+=direct;item.rev+=rev;item.stake+=direct+rev;total+=direct+rev;
        }
        if(pending){
          const key=drawKey+'|'+num;
          if(!risks.has(key))risks.set(key,{num,draw:ticket.draw,family:familyOf(ticket.draw),direct:0,rev:0,maximum:0});
          const risk=risks.get(key);risk.direct+=direct;risk.rev+=rev;
          risk.maximum+=direct*85+(risk.family==='tica'?rev*200:0);
        }
      }
      if(inPeriod && validNumbers.size){ticketsCount++;validNumbers.forEach(num=>number(num).tickets++);}
    }
    const rows=[...map.values()];
    const rank=field=>rows.filter(row=>row[field]>0).sort((a,b)=>b[field]-a[field] || a.num.localeCompare(b.num));
    return {winners:rank('wins'),played:rank('tickets'),money:rank('stake'),risks:[...risks.values()].sort((a,b)=>b.maximum-a.maximum || a.num.localeCompare(b.num) || a.draw.localeCompare(b.draw)),resultsCount,ticketsCount,total,distinct:rows.filter(r=>r.tickets>0).length,invalid};
  },

  clearTopNumbers(){
    ['topResultsRanking','topPlayedRanking','topMoneyRanking','topExposureRanking','topNumbersSummary','topNumbersStatus'].forEach(id=>document.getElementById(id)?.replaceChildren());
  },

  topBlockButton(num,family){
    const button=document.createElement('button');button.type='button';button.className='btn-small';button.textContent='Preparar bloqueo';
    button.disabled=!family;button.title=family?'Elegir vencimiento en Reportes':'Elegí un sorteo en el filtro para preparar su bloqueo';
    button.onclick=()=>this.prepareTopBlock(num,family);
    return button;
  },

  prepareTopBlock(num,family){
    if(this.currentRole!=='admin' || !/^\d{2}$/.test(num) || !Object.hasOwn(this.blockFamilies,family))return;
    this.switchTab('reportes');
    document.getElementById('blockNumber').value=num;
    document.getElementById('blockFamily').value=family;
    document.getElementById('blockUntil').value='';
    document.getElementById('numberBlocksPanel').scrollIntoView({block:'start',behavior:'smooth'});
    document.getElementById('blockUntil').focus();
  },

  topBlockLabel(num,family){
    return Object.entries(this.blockFamilies).filter(([key])=>(!family || key===family) && this.isNumberBlocked(num,key==='primera'?'La Primera':key)).map(([,label])=>label).join(', ');
  },

  renderTopRank(id,rows,kind,filters,ready){
    const container=document.getElementById(id);container.replaceChildren();
    if(!ready){container.textContent='Esperando datos. Revisá la conexión si no cargan.';return;}
    if(!rows.length){container.textContent='No hay datos para estos filtros.';return;}
    const headers=kind==='wins'?['Número','Veces','Última fecha','Bloqueo']:kind==='tickets'?['Número','Tiquetes','Bloqueo']:['Número','Directo','Reventado','Total','% del monto','Bloqueo'];
    const table=document.createElement('table'),head=document.createElement('thead'),headRow=document.createElement('tr');
    headers.forEach(label=>{const th=document.createElement('th');th.textContent=label;headRow.appendChild(th);});head.appendChild(headRow);table.appendChild(head);
    const body=document.createElement('tbody');
    rows.slice(0,filters.limit).forEach(row=>{
      const tr=document.createElement('tr');
      const cells=kind==='wins'?[row.num,row.wins,formatDMY(row.last)]:kind==='tickets'?[row.num,row.tickets]:[row.num,money(row.direct),money(row.rev),money(row.stake),(filters.total?100*row.stake/filters.total:0).toLocaleString('es-CR',{maximumFractionDigits:1})+'%'];
      cells.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i===0)td.className='top-number-value mono';tr.appendChild(td);});
      const action=document.createElement('td');
      const active=this.topBlockLabel(row.num,filters.family);
      if(active){const label=document.createElement('span');label.className='top-number-blocked';label.textContent='Bloqueado: '+active;action.appendChild(label);}
      action.appendChild(this.topBlockButton(row.num,filters.family));tr.appendChild(action);body.appendChild(tr);
    });
    table.appendChild(body);container.appendChild(table);
  },

  renderTopNumbers(){
    if(this.currentRole!=='admin'){this.clearTopNumbers();return;}
    const panel=document.getElementById('topNumbersPanel');if(!panel || panel.classList.contains('hidden'))return;
    const filters={from:document.getElementById('topFrom').value,to:document.getElementById('topTo').value,family:document.getElementById('topFamily').value,owner:document.getElementById('topOwner').value,limit:Number(document.getElementById('topLimit').value)||10};
    if(filters.from && filters.to && filters.from>filters.to){this.clearTopNumbers();document.getElementById('topNumbersStatus').textContent='La fecha Desde debe ser anterior o igual a Hasta.';return;}
    const stats=this.topStats(filters);filters.total=stats.total;
    const ticketsReady=['ready','cache'].includes(this.topSources.tickets),resultsReady=['ready','cache'].includes(this.topSources.results);
    const status=[];
    if(!ticketsReady || !resultsReady)status.push('Datos incompletos: esperando tiquetes o resultados. No interpretar listas vacías como historial sin actividad.');
    if(Object.values(this.topSources).includes('error'))status.push('No se pudieron cargar algunos datos. Revisá la conexión o las cuotas de Firebase.');
    if(Object.values(this.topSources).includes('cache'))status.push('Se muestran datos en caché; pueden no estar actualizados.');
    if(stats.invalid)status.push(`${stats.invalid} registro(s) o línea(s) inválidos o contradictorios se excluyeron.`);
    document.getElementById('topNumbersStatus').textContent=status.join(' ') || 'Datos disponibles en esta sesión. No se hacen consultas adicionales al cambiar filtros.';
    const summary=document.getElementById('topNumbersSummary');summary.replaceChildren();
    [['Resultados registrados',resultsReady?stats.resultsCount:'—'],['Tiquetes analizados',ticketsReady?stats.ticketsCount:'—'],['Dinero apostado',ticketsReady?money(stats.total):'—'],['Números distintos jugados',ticketsReady?stats.distinct:'—']].forEach(([label,value])=>{
      const card=document.createElement('div');card.className='panel finance-metric';const title=document.createElement('span');title.textContent=label;const amount=document.createElement('strong');amount.className='mono';amount.textContent=value;card.append(title,amount);summary.appendChild(card);
    });
    this.renderTopRank('topResultsRanking',stats.winners,'wins',filters,resultsReady);
    this.renderTopRank('topPlayedRanking',stats.played,'tickets',filters,ticketsReady);
    this.renderTopRank('topMoneyRanking',stats.money,'stake',filters,ticketsReady);
    const exposure=document.getElementById('topExposureRanking');exposure.replaceChildren();
    if(!ticketsReady || !resultsReady){exposure.textContent='Esperando tiquetes y resultados para calcular el riesgo de hoy.';return;}
    if(!stats.risks.length){exposure.textContent='No hay apuestas de hoy pendientes de resultado para estos filtros.';return;}
    const table=document.createElement('table');table.innerHTML='<thead><tr><th>Número</th><th>Sorteo</th><th>Apostado</th><th>Premio máximo</th><th>Acción</th></tr></thead>';
    const body=document.createElement('tbody');stats.risks.slice(0,filters.limit).forEach(row=>{
      const tr=document.createElement('tr');[row.num,row.draw,money(row.direct+row.rev),money(row.maximum)].forEach(text=>{const td=document.createElement('td');td.textContent=text;tr.appendChild(td);});
      const td=document.createElement('td');td.appendChild(this.topBlockButton(row.num,row.family));tr.appendChild(td);body.appendChild(tr);
    });table.appendChild(body);exposure.appendChild(table);
  }
});
