// Finanzas: movimientos, gastos, cierres de caja y resúmenes

Object.assign(App, {
  movShowHistory: false,

  async saveMaxBet(){
    if(this.currentRole !== 'admin') return;
    const val = parseFloat(document.getElementById('maxBetInput').value);
    if(isNaN(val) || val < 50){ alert('Monto inválido.'); return; }
    try {
      await window.fs.setDoc(window.fs.doc(window.fs.db, 'configuracion', 'limites'), { limiteGeneral: val }, { merge: true });
      alert(`Límite actualizado en la Nube.`);
    } catch(e){ alert('Error al actualizar límite.'); }
  },

  async registerExpense(){
    const owner = this.financeOwner('gastoOwner');
    if(!owner){ alert('Elegí el negocio.'); return; }
    const categoria = document.getElementById('gastoCategoria').value;
    const detalleRaw = document.getElementById('gastoDetalle').value.trim();
    const monto = parseFloat(document.getElementById('gastoMonto').value);
    if(isNaN(monto) || monto<=0){ alert('Ingresá un monto.'); return; }
    
    try {
      const movId = await this.getNextSeq('movimientos');
      await this.addPointRecord('movimientos', {
        id: 'M'+movId, date: todayStr(), crDate: crDateStr(), type: 'Gasto', 
        detail: detalleRaw ? `${categoria} · ${detalleRaw}` : categoria, 
        amount: -monto, owner, category: categoria, locked: false
      });
      document.getElementById('gastoDetalle').value = '';
      document.getElementById('gastoMonto').value = '';
      alert(`Gasto registrado.`);
    } catch(e){ console.error(e); }
  },

  // Retiro: el admin saca dinero físico del negocio (resta). Abono: el admin le entrega dinero al negocio (suma).
  async registerCashMove(){
    if(this.currentRole !== 'admin') return;
    const owner = this.financeOwner('retiroOwner');
    const tipo = document.getElementById('retiroTipo').value;           // 'Retiro' | 'Abono'
    const detalleRaw = document.getElementById('retiroDetalle').value.trim();
    const monto = parseFloat(document.getElementById('retiroMonto').value);

    if(!owner){ alert('Elegí el negocio.'); return; }
    if(tipo !== 'Retiro' && tipo !== 'Abono'){ alert('Elegí la operación.'); return; }
    if(isNaN(monto) || monto <= 0){ alert('Ingresá un monto mayor a cero.'); return; }

    const balanceActual = this.movs.filter(m=>m.owner===owner).reduce((s,m)=>s+m.amount, 0);
    let msg = `¿Registrar ${tipo === 'Retiro' ? 'RETIRO' : 'ABONO'} de ${money(monto)} en ${ownerLabel(owner)}?\n\n`
            + `Balance actual: ${money(balanceActual)}\n`
            + `Balance después: ${money(balanceActual + (tipo === 'Retiro' ? -monto : monto))}`;
    if(tipo === 'Retiro' && monto > balanceActual) msg += '\n\n⚠ El retiro es mayor que el balance actual: quedará en negativo.';
    if(!confirm(msg)) return;

    try {
      const movId = await this.getNextSeq('movimientos');
      await this.addPointRecord('movimientos', {
        id: 'M' + movId, date: todayStr(), crDate: crDateStr(),
        type: tipo, category: tipo,
        detail: detalleRaw ? `${tipo} de caja · ${detalleRaw}` : `${tipo} de caja`,
        amount: tipo === 'Retiro' ? -monto : monto,
        owner, registradoPor: this.currentProfile.name, locked: false
      });
      document.getElementById('retiroDetalle').value = '';
      document.getElementById('retiroMonto').value = '';
      alert(`${tipo} registrado.`);
    } catch(e){
      console.error(e);
      alert('Error al registrar el movimiento.');
    }
  },

  async saveCierre(){
    const owner = this.financeOwner('cierreOwner');
    if(!owner) return;
    const efectivo = parseFloat(document.getElementById('cierreEfectivo').value);
    if(isNaN(efectivo) || efectivo<0){ alert('Ingresá el efectivo.'); return; }
    
    const balance = this.movs.filter(m=>m.owner===owner).reduce((s,m)=>s+m.amount, 0);
    const diferencia = efectivo - balance;
    
    try {
      const seq = await this.getNextSeq('cierres');
      const idStr = 'C' + seq;
      
      await this.addPointRecord('cierres', {
        id: idStr, owner, crDate: crDateStr(), ts: new Date().toISOString(), 
        balance, efectivo, diferencia, registradoPor: this.currentProfile.name
      });

      const toLock = this.movs.filter(m=>m.owner===owner && !m.locked);
      for(let m of toLock) {
        await window.fs.updateDoc(window.fs.doc(window.fs.db, 'movimientos', m._id), { locked: true, cierreId: idStr });
      }

      document.getElementById('cierreEfectivo').value = '';
      alert('Corte de caja guardado en Firestore.');
    } catch(e){ console.error(e); }
  },

  renderCierres(){
    const body = document.getElementById('cierreBody');
    if(!body) return;
    const owner = this.selectedFinanceOwner();
    const list = this.cierres.filter(c=>!owner || c.owner===owner).slice().reverse();
    body.innerHTML = '';
    list.forEach(c=>{
      const tr = document.createElement('tr');
      const diffColor = Math.round(c.diferencia)===0 ? 'var(--text-muted)' : (c.diferencia<0 ? 'var(--red)' : 'var(--green)');
      tr.innerHTML = `<td class="mono">${escapeHtml(c.crDate)}</td><td>${escapeHtml(ownerLabel(c.owner))}</td><td class="mono">${money(c.balance)}</td><td class="mono">${money(c.efectivo)}</td><td class="mono" style="color:${diffColor}">${money(c.diferencia)}</td>`;
      body.appendChild(tr);
    });
    document.getElementById('cierreTable').classList.toggle('hidden', list.length===0);
    document.getElementById('cierreEmpty').classList.toggle('hidden', list.length>0);
  },

  clearMovFilters(){
    document.getElementById('movDateFrom').value = '';
    document.getElementById('movDateTo').value = '';
    document.getElementById('movType').value = '';
    const own = document.getElementById('movOwner');
    if(own) own.value = '';
    this.renderAll();
  },

  toggleMovHistory(){
    this.movShowHistory = !this.movShowHistory;
    this.renderAll();
  },

  renderFinances(){
    const admin = this.currentRole==='admin';
    const hist = admin || this.movShowHistory;
    const today = crDateStr();
    // Los filtros solo cuentan cuando el historial está desplegado
    const range = admin ? this.financeDateRange() : null;
    const dateFrom = admin ? range.from : hist ? document.getElementById('movDateFrom').value : '';
    const dateTo = admin ? range.to : hist ? document.getElementById('movDateTo').value : '';
    const type = admin ? document.getElementById('financeType').value : hist ? document.getElementById('movType').value : '';
    const owner = this.selectedFinanceOwner();

    const inPeriod = m=>{
      const date = movDateKey(m);
      return (!dateFrom || (date && date>=dateFrom)) && (!dateTo || (date && date<=dateTo)) && (!admin || range.valid);
    };
    let list = this.movs.filter(m=>{
      if(admin && !inPeriod(m)) return false;
      const mDate = movDateKey(m);
      if(!hist && mDate !== today) return false;
      if(dateFrom && mDate && mDate < dateFrom) return false;
      if(dateTo && mDate && mDate > dateTo) return false;
      if(type && m.type !== type) return false;
      if(owner && m.owner !== owner) return false;
      return true;
    }).sort((a,b)=>(b.crDate||b.date||'').localeCompare(a.crDate||a.date||''));

    const body = document.getElementById('movBody');
    if(body){
      body.innerHTML = '';
      list.forEach(m=>{
        const tr = document.createElement('tr');
        const color = m.amount > 0 ? 'var(--green)' : 'var(--red)';
        const canDelete = this.currentRole === 'admin' && !m.locked;
        tr.innerHTML = `
          <td class="mono">${escapeHtml(m.crDate || m.date)}</td>
          <td>${escapeHtml(m.type)}</td>
          <td>${escapeHtml(m.seller || ownerLabel(m.owner))}</td>
          <td>${escapeHtml(m.detail)}</td>
          <td class="mono" style="color:${color}">${money(m.amount)}</td>
          <td>${canDelete ? `<button class="del-x" onclick="App.deleteMov('${escapeHtml(m._id)}')">✕</button>` : '—'}</td>
        `;
        body.appendChild(tr);
      });
      document.getElementById('movTable').classList.toggle('hidden', list.length===0);
      const movEmpty = document.getElementById('movEmpty');
      movEmpty.classList.toggle('hidden', list.length>0);
      movEmpty.textContent = !hist ? 'Aún no hay movimientos de hoy'
        : (this.movs.length === 0 ? 'Aún no hay movimientos registrados' : 'No hay movimientos con esos filtros');
      document.getElementById('movHistoryFilters').classList.toggle('hidden', !hist);
      document.getElementById('movTitle').textContent = admin ? 'Movimientos del período' : hist ? 'Historial de movimientos' : 'Movimientos de hoy';
      document.getElementById('movToggleBtn').textContent = hist ? 'Solo hoy ▴' : 'Ver otros días ▾';
    }

    const filteredMovs = (owner) ? this.movs.filter(m=>m.owner===owner) : this.movs;
    // Retiros y abonos van aparte: no son ventas ni premios/gastos, solo mueven el dinero de la caja
    const sumAbs = fn => filteredMovs.filter(fn).reduce((s,m)=>s+Math.abs(m.amount), 0);
    const totalIn = sumAbs(m => m.amount > 0 && m.type !== 'Abono');
    const totalOut = sumAbs(m => m.amount < 0 && m.type !== 'Retiro');
    const totalRetiros = sumAbs(m => m.type === 'Retiro');
    const totalAbonos = sumAbs(m => m.type === 'Abono');
    const balance = filteredMovs.reduce((s,m)=>s+m.amount, 0);   // = ingresos - pagado - retiros + abonos

    const bFull = document.getElementById('balanceFull');
    if(bFull) bFull.textContent = money(balance);
    const tIn = document.getElementById('totalIn');
    if(tIn) tIn.textContent = money(totalIn);
    const tOut = document.getElementById('totalOut');
    if(tOut) tOut.textContent = money(totalOut);
    const tRet = document.getElementById('totalRetiros');
    if(tRet) tRet.textContent = money(totalRetiros);
    const tAbo = document.getElementById('totalAbonos');
    if(tAbo) tAbo.textContent = money(totalAbonos);

    const bTop = document.getElementById('balanceTop');
    if(bTop) bTop.textContent = money(balance);

    this.renderPointBalances();
    this.renderCierres();

    this.financeFilteredMovs = list;
    const periodMovs = admin ? filteredMovs.filter(inPeriod) : filteredMovs;
    this.renderCashMoves(admin ? periodMovs.filter(m=>!type || m.type===type) : filteredMovs);
    this.renderDrawSummary(periodMovs);
    this.renderDaySummary(periodMovs);
    if(admin) this.renderAdminFinanceSummary(periodMovs, balance, owner);
  },

  // Apartado "Retiros y abonos": últimos 50 movimientos de ese tipo
  renderCashMoves(movs = this.movs){
    const body = document.getElementById('cashBody');
    if(!body) return;
    const list = movs
      .filter(m => m.type === 'Retiro' || m.type === 'Abono')
      .sort((a,b) => (b.crDate||b.date||'').localeCompare(a.crDate||a.date||''))
      .slice(0, 50);
    body.innerHTML = '';
    list.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${escapeHtml(m.crDate || m.date)}</td>
        <td>${escapeHtml(ownerLabel(m.owner))}</td>
        <td>${escapeHtml(m.type)}</td>
        <td>${escapeHtml(m.detail)}</td>
        <td class="mono" style="color:${m.amount > 0 ? 'var(--green)' : 'var(--red)'}">${money(m.amount)}</td>
      `;
      body.appendChild(tr);
    });
    document.getElementById('cashTable').classList.toggle('hidden', list.length === 0);
    document.getElementById('cashEmpty').classList.toggle('hidden', list.length > 0);
  },

  async deleteMov(id){
    if(this.currentRole !== 'admin') return;
    const m = this.movs.find(x => x._id === id);
    if(!m || m.locked){ alert('Este movimiento está bloqueado por un cierre de caja.'); return; }
    if(!confirm('¿Eliminar este movimiento?')) return;
    try {
      await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'movimientos', id));
    } catch(e){ console.error(e); }
  },

  renderDrawSummary(movs){
    const body = document.getElementById('drawSummaryBody');
    if(!body) return;
    const summary = {};
    movs.forEach(m=>{
      if(!m.draw) return;
      if(!summary[m.draw]) summary[m.draw] = { sold:0, paid:0 };
      if(m.type === 'Ingreso') summary[m.draw].sold += m.amount;
      if(m.type === 'Pago') summary[m.draw].paid += Math.abs(m.amount);
    });
    const keys = Object.keys(summary);
    body.innerHTML = '';
    keys.forEach(draw=>{
      const item = summary[draw];
      const margin = item.sold - item.paid;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${escapeHtml(draw)}</td><td class="mono">${money(item.sold)}</td><td class="mono">${money(item.paid)}</td><td class="mono" style="color:${margin>=0?'var(--green)':'var(--red)'}">${money(margin)}</td>`;
      body.appendChild(tr);
    });
    document.getElementById('drawSummaryTable').classList.toggle('hidden', keys.length===0);
    document.getElementById('drawSummaryEmpty').classList.toggle('hidden', keys.length>0);
  },

  renderDaySummary(movs){
    const body = document.getElementById('daySummaryBody');
    if(!body) return;
    const summary = {};
    movs.forEach(m=>{
      const d = m.crDate || m.date || 'Sin fecha';
      if(!summary[d]) summary[d] = { sold:0, prizes:0, expenses:0 };
      if(m.type === 'Ingreso') summary[d].sold += m.amount;
      if(m.type === 'Pago') summary[d].prizes += Math.abs(m.amount);
      if(m.type === 'Gasto') summary[d].expenses += Math.abs(m.amount);
    });
    const days = Object.keys(summary).sort().reverse();
    body.innerHTML = '';
    days.forEach(d=>{
      const item = summary[d];
      const net = item.sold - item.prizes - item.expenses;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${escapeHtml(d)}</td><td class="mono">${money(item.sold)}</td><td class="mono">${money(item.prizes)}</td><td class="mono">${money(item.expenses)}</td><td class="mono" style="color:${net>=0?'var(--green)':'var(--red)'}">${money(net)}</td>`;
      body.appendChild(tr);
    });
    document.getElementById('daySummaryTable').classList.toggle('hidden', days.length===0);
    document.getElementById('daySummaryEmpty').classList.toggle('hidden', days.length>0);
  }
});
