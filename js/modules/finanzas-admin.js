// Organización exclusiva de la vista del administrador; los formularios existentes
// se reutilizan sin duplicar campos, listeners ni cálculos de caja.
Object.assign(App, {
  financeView: 'resumen',
  financeLayoutNodes: null,

  setupAdminFinanceLayout(isAdmin){
    const shell = document.getElementById('adminFinanceShell');
    const tab = document.getElementById('financeTab');
    if(!shell || !tab) return;
    const placements = [
      ['movOwnerField','financePointFilterSlot'], ['adminBreakdown','financePointsSlot'],
      ['balanceFull','financeLifetimeSlot'], ['movBody','financeLedgerSlot'],
      ['cashBody','financeCashSlot'], ['drawSummaryBody','financeDrawsSlot'],
      ['daySummaryBody','financeDaysSlot'], ['retiroPanel','financeCashFormSlot'],
      ['gastoMonto','financeExpenseSlot'], ['cierreBody','financeClosingSlot'],
      ['limitsPanel','financeLimitsSlot']
    ];
    if(!this.financeLayoutNodes){
      this.financeLayoutNodes = placements.map(([id,slot])=>{
        const node = document.getElementById(id).closest('.panel');
        const marker = document.createComment('finance:'+id); node.before(marker);
        return {node,marker,slot};
      });
    }
    if(isAdmin){
      this.financeLayoutNodes.forEach(({node,slot})=>document.getElementById(slot).appendChild(node));
      if(!shell.dataset.initialized){ this.setFinancePeriod('hoy',false); shell.dataset.initialized='true'; }
      this.switchFinanceView(this.financeView);
    } else {
      this.financeLayoutNodes.forEach(({node,marker})=>marker.after(node));
    }
    shell.classList.toggle('hidden', !isAdmin);
    tab.classList.toggle('admin-finances', isAdmin);
  },

  switchFinanceView(view){
    if(!['resumen','movimientos','operaciones','gestion'].includes(view)) return;
    this.financeView=view;
    document.querySelectorAll('[data-finance-panel]').forEach(el=>el.classList.toggle('hidden',el.dataset.financePanel!==view));
    document.querySelectorAll('[data-finance-view]').forEach(el=>{
      el.classList.toggle('active',el.dataset.financeView===view);
      el.setAttribute('aria-pressed',String(el.dataset.financeView===view));
    });
  },

  setFinancePeriod(period, render=true){
    const today=crDateStr(); let from='',to='';
    if(period==='hoy'){from=today;to=today;}
    else if(period==='7'){from=addDaysToDateStr(today,-6);to=today;}
    else if(period==='mes'){from=today.slice(0,7)+'-01';to=today;}
    else if(period!=='todo' && period!=='custom') return;
    document.getElementById('financePeriod').value=period;
    if(period!=='custom'){
      document.getElementById('financeFrom').value=from;
      document.getElementById('financeTo').value=to;
    }
    if(render) this.renderAll();
  },

  onFinanceDatesChange(){
    document.getElementById('financePeriod').value='custom';
    this.renderAll();
  },

  financeDateRange(){
    const from=document.getElementById('financeFrom').value;
    const to=document.getElementById('financeTo').value;
    const valid=!from || !to || from<=to;
    const error=document.getElementById('financeRangeError');
    error.textContent=valid?'':'La fecha Desde debe ser anterior o igual a Hasta.';
    error.classList.toggle('hidden',valid);
    return {from,to,valid};
  },

  renderAdminFinanceSummary(movs,balance,owner){
    const sum=type=>movs.filter(m=>m.type===type).reduce((s,m)=>s+Math.abs(m.amount),0);
    const sales=sum('Ingreso'), prizes=sum('Pago'), expenses=sum('Gasto');
    const metrics=[['Ventas del período',sales],['Premios pagados',prizes],['Gastos del período',expenses],['Margen del período',sales-prizes-expenses]];
    const container=document.getElementById('financePeriodMetrics'); container.replaceChildren();
    metrics.forEach(([label,amount])=>{
      const card=document.createElement('div');card.className='panel finance-metric';
      const title=document.createElement('span');title.textContent=label;
      const value=document.createElement('strong');value.className='mono';value.textContent=money(amount);
      if(amount<0)value.style.color='var(--red)';
      card.append(title,value);container.appendChild(card);
    });
    const notices=document.getElementById('financeNotices');notices.replaceChildren();
    const notice=text=>{const el=document.createElement('p');el.textContent=text;notices.appendChild(el);};
    if(balance<0)notice('La caja seleccionada tiene saldo negativo: '+money(balance)+'.');
    const pending=this.tickets.filter(t=>(!owner || t.owner===owner) && t.premiado && !t.paid && /^\d{4}-\d{2}-\d{2}$/.test(t.crDate||'') && crDateStr()<=addDaysToDateStr(t.crDate,CLAIM_DAYS));
    if(pending.length)notice(`${pending.length} tiquete(s) con premio pendiente: ${money(pending.reduce((s,t)=>s+Number(t.premio||0),0))}. Todavía no se descontaron de caja.`);
    const points=this.allPoints();
    const deleting=Object.keys(points).filter(id=>(!owner || owner===id) && points[id].estado==='eliminando');
    if(deleting.length)notice('Hay un borrado incompleto. Podés reanudarlo en Configuración y puntos.');
    document.getElementById('balanceFull').style.color=balance<0?'var(--red)':'var(--green)';
    const heading=document.getElementById('balanceFull').closest('.panel').querySelector('h3');
    heading.textContent='Caja actual · todo el historial';
    this.renderPointManagement();
  },

  financeCSV(){
    const text=value=>{
      let s=String(value??'');
      if(/^[\s]*[=+\-@]/.test(s))s="'"+s;
      return '"'+s.replace(/"/g,'""')+'"';
    };
    const rows=[['Fecha','Punto de venta','Tipo','Detalle','Monto','Cierre']];
    (this.financeFilteredMovs||[]).forEach(m=>rows.push([movDateKey(m),this.pointName(m.owner),m.type,m.detail,Number(m.amount).toFixed(2),m.cierreId||'']));
    return '\uFEFF'+rows.map((row,i)=>row.map((value,col)=>i>0&&col===4 ? value : text(value)).join(';')).join('\r\n');
  },

  downloadFile(name,content,type){
    const url=URL.createObjectURL(new Blob([content],{type}));
    const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  },

  exportFinanceCSV(){
    if(this.currentRole!=='admin')return;
    if(!this.financeDateRange().valid)return;
    this.downloadFile('movimientos-'+crDateStr()+'.csv',this.financeCSV(),'text/csv;charset=utf-8');
  }
});
