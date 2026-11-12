// Ventas: armado del tiquete, confirmación, recibo y eliminación

Object.assign(App, {
  moveNext(e, nextId){
    if(e.key !== 'Enter') return;
    e.preventDefault();
    const el = nextId ? document.getElementById(nextId) : null;
    if(el && el.offsetParent !== null && !el.disabled){
      el.focus(); el.select && el.select();
    } else {
      this.addLine();
    }
  },

  randomNumber(){
    if(this.savingSale || !this.canUseNumberBlocks()) return;
    const available = Array.from({length:100}, (_,i)=>String(i).padStart(2,'0')).filter(n=>!this.isNumberBlocked(n, document.getElementById('drawSelect').value));
    if(!available.length){ alert('Todos los números están bloqueados.'); return; }
    const n = available[Math.floor(Math.random()*available.length)];
    document.getElementById('numInput').value = String(n).padStart(2,'0');
    const sel = document.getElementById('drawSelect');
    const isNica = sel && sinReventado(sel.value);
    if(!isNica) {
      document.getElementById('revInput').focus();
    } else {
      this.addLine();
    }
  },

  addLine(){
    if(this.savingSale || !this.canUseNumberBlocks()) return;
    const sel = document.getElementById('drawSelect');
    const draw = DRAWS.find(d=>d.name===sel.value);
    if(!draw || !isDrawOpen(draw, getCRTime())){ alert('Este sorteo ya cerró.'); return; }
    const numRaw = document.getElementById('numInput').value.trim();
    const num = numRaw ? numRaw.padStart(2,'0') : '';
    const amt = parseFloat(document.getElementById('amtInput').value);
    
    const isNica = sinReventado(draw.name);
    const revRaw = !isNica ? document.getElementById('revInput').value.trim() : '';
    const rev = revRaw ? parseFloat(revRaw) : 0;

    if(!/^\d{2}$/.test(num)){ alert('Ingresá un número de 00 a 99.'); return; }
    if(this.isNumberBlocked(num, draw.name)){ alert(`El número ${num} está bloqueado.`); return; }
    if(!amt || amt < 50 || amt % 50 !== 0){ alert('Mínimo ₡50 y múltiplos de 50.'); return; }
    if(!isNica && rev > 0 && (rev < 50 || rev % 50 !== 0)){ alert('Mínimo ₡50 y múltiplos de 50 para el reventado.'); return; }
    if(!isNica && rev > amt){ alert('El reventado no puede ser mayor que la apuesta.'); return; }
    
    const yaJugado = this.currentLines.filter(l=>l.num===num).reduce((s,l)=>s+l.amt+l.rev, 0);
    if(yaJugado + amt + rev > this.maxBet){
      alert(`Límite superado. El máximo por número es ${money(this.maxBet)}.`);
      return;
    }
    const existente = this.currentLines.find(l=>l.num===num);
    if(existente){
      existente.amt += amt;
      existente.rev += rev;
    } else {
      this.currentLines.push({num, amt, rev});
    }
    document.getElementById('numInput').value='';
    if(!isNica) document.getElementById('revInput').value='';
    this.renderLines();
    document.getElementById('numInput').focus();
  },

  removeLine(i){ if(this.savingSale) return; this.currentLines.splice(i,1); this.renderLines(); },

  renderLines(){
    const body = document.getElementById('linesBody');
    body.innerHTML = '';
    let total = 0;
    this.currentLines.forEach((l,i)=>{
      total += l.amt + l.rev;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${l.num}</td><td class="mono">${money(l.amt)}</td><td class="mono">${l.rev? money(l.rev):'—'}</td>
        <td><button class="del-x" onclick="App.removeLine(${i})">✕</button></td>`;
      body.appendChild(tr);
    });
    document.getElementById('linesTable').classList.toggle('hidden', this.currentLines.length===0);
    document.getElementById('linesEmpty').classList.toggle('hidden', this.currentLines.length>0);
    document.getElementById('ticketTotal').textContent = money(total);
  },

  async confirmSale(){
    if(this.savingSale || !this.canUseNumberBlocks()) return;
    const btn = document.getElementById('btnConfirmSale');
    const drawObj = DRAWS.find(d=>d.name===document.getElementById('drawSelect').value);
    if(!drawObj || !isDrawOpen(drawObj, getCRTime())){ alert('Este sorteo ya cerró.'); return; }
    if(this.currentLines.length===0){ alert('Agregá líneas al tiquete.'); return; }

    const porNumero = {};
    this.currentLines.forEach(l=>{ porNumero[l.num] = (porNumero[l.num]||0) + l.amt + l.rev; });
    const excedido = Object.keys(porNumero).find(n => porNumero[n] > this.maxBet);
    if(excedido){ alert(`El número ${excedido} supera el límite de ${money(this.maxBet)}.`); return; }
    const buyer = document.getElementById('buyerInput').value.trim() || 'Anónimo';

    const lines = this.currentLines.map(l=>({...l}));
    const blocked = lines.find(l=>this.isNumberBlocked(l.num, drawObj.name));
    if(blocked){ alert(`El número ${blocked.num} está bloqueado. Quitalo del tiquete para continuar.`); return; }
    this.savingSale = true;
    btn.disabled = true;
    try {
      const seq = await this.getNextSeq('tiquetes');
      const id = `TSM-AAA-${String(seq).padStart(5,'0')}`;
      const total = lines.reduce((s,l)=>s+l.amt+l.rev, 0);
      
      const movId = await this.getNextSeq('movimientos');
      const movData = {
        id: 'M' + movId, 
        ticketId: id,
        date: todayStr(), 
        crDate: crDateStr(),
        type: 'Ingreso', 
        category: 'Venta de Tiquetes',
        detail: `Venta ${id} · ${drawObj.name}`,
        amount: total, 
        owner: this.currentRole, 
        draw: drawObj.name, 
        seller: this.currentProfile.name,
        locked: false
      };
      
      const movRef = window.fs.doc(window.fs.collection(window.fs.db, 'movimientos'));
      const ticketRef = window.fs.doc(window.fs.collection(window.fs.db, 'tiquetes'));

      const newTicket = {
        id, 
        draw: drawObj.name, 
        date: todayStr(), 
        crDate: crDateStr(),
        lines,
        total, 
        buyer,
        vendor: this.currentProfile.name,
        owner: this.currentRole, 
        paid: false, 
        status: 'registrada',
        movDocId: movRef.id
      };

      await window.fs.runTransaction(window.fs.db, async tx=>{
        const snap = await tx.get(this.numberBlocksRef());
        const blocks = this.readNumberBlocks(snap);
        const blockedLine = lines.find(l=>this.isNumberBlocked(l.num, drawObj.name, blocks));
        if(blockedLine) throw new Error(`El número ${blockedLine.num} está bloqueado. Quitalo del tiquete para continuar.`);
        if(!isDrawOpen(drawObj, getCRTime())) throw new Error('Este sorteo ya cerró.');
        tx.set(movRef, movData);
        tx.set(ticketRef, newTicket);
      });
      
      this.currentLines = [];
      document.getElementById('buyerInput').value = '';
      this.renderLines();
      this.showReceipt(newTicket);
      
      alert(`Tiquete ${id} registrado. El ingreso se sumó a la caja de inmediato.`);
      this.switchTab('reportes');
    } catch(e) {
      console.error("Error al confirmar venta:", e);
      alert(e.message || "Error al confirmar venta.");
    } finally {
      this.savingSale = false;
      btn.disabled = false;
    }
  },

  showReceiptById(id){
    const t = this.tickets.find(x=>x.id===id);
    if(!t){ alert('No se encontró el tiquete.'); return; }
    this.showReceipt(t);
  },

  showReceipt(t){
    const directoGroups = {};
    t.lines.forEach(l=>{ (directoGroups[l.amt] = directoGroups[l.amt] || []).push(escapeHtml(l.num)); });
    const directoHtml = Object.keys(directoGroups).sort((a,b)=>a-b)
      .map(amt=>`<div class="row"><span>${directoGroups[amt].join('-')}</span><span>${money(amt)}</span></div>`).join('');

    const hasReventado = t.lines.some(l => l.rev > 0);
    const reventGroups = {};
    t.lines.forEach(l=>{ if(l.rev>0) (reventGroups[l.rev] = reventGroups[l.rev] || []).push(escapeHtml(l.num)); });
    const reventHtml = hasReventado ? `
      <div class="small" style="font-weight:600; margin-top:6px;">Reventado:</div>
      ${Object.keys(reventGroups).sort((a,b)=>a-b).map(amt=>`<div class="row"><span>${reventGroups[amt].join('-')}</span><span>${money(amt)}</span></div>`).join('')}
    ` : '';

    const nameL = t.draw.toLowerCase();
    const footerRules = nameL.includes('nica')
      ? `<div class="small">Sorteo Nica · Directo paga x85</div><hr>`
      : nameL.includes('primera')
        ? `<div class="small">La Primera · Directo paga x85</div><hr>`
        : `<div class="small">Directo paga x85 · Reventado x200</div><hr>`;

    document.getElementById('printArea').innerHTML = `
      <div class="center big">TIEMPOS SAN MIGUEL</div>
      <div class="center">Oficina · Tel 7250-2050</div><hr>
      <div class="row"><span>Tiquete</span><span>${escapeHtml(t.id)}</span></div>
      <div class="row"><span>Sorteo</span><span>${escapeHtml(t.draw)}</span></div>
      <div class="row"><span>Fecha</span><span>${escapeHtml(t.date)}</span></div>
      <div class="row"><span>Cliente</span><span>${escapeHtml(t.buyer || 'Anónimo')}</span></div><hr>
      <div class="small" style="font-weight:600;">Directo:</div>
      ${directoHtml}${reventHtml}<hr>
      <div class="row big"><span>TOTAL</span><span>${money(t.total)}</span></div><hr>
      ${footerRules}
      <div class="small" style="font-weight:600;">Vence: ${formatDMY(addDaysToDateStr(t.crDate, CLAIM_DAYS))}</div><hr>
      <div class="center">Vendedor: ${escapeHtml(t.vendor)}</div>
    `;
  },

  canDeleteTicket(t){
    if(this.currentRole === 'admin') return true;      // el admin siempre puede
    if(t.owner !== this.currentRole) return false;     // solo tiquetes de su negocio
    if(t.paid) return false;                           // nunca uno ya pagado
    if(t.crDate !== crDateStr()) return false;         // solo tiquetes de hoy
    const draw = DRAWS.find(d => d.name === t.draw);
    return !!draw && isDrawOpen(draw, getCRTime());    // solo si el sorteo sigue abierto
  },

  async deleteTicket(id){
    const t = this.tickets.find(x => x.id === id);
    if(!t) return;

    if(!this.canDeleteTicket(t)){
      alert('Este tiquete ya no se puede eliminar porque el sorteo cerró.');
      this.renderReports();
      return;
    }

    // Un vendedor tampoco puede borrar si el ingreso ya entró en un cierre de caja
    if(this.currentRole !== 'admin'){
      const mov = this.movs.find(m => m._id === t.movDocId);
      if(mov && mov.locked){
        alert('Este tiquete ya está incluido en un cierre de caja y no se puede eliminar.');
        return;
      }
    }

    if(!confirm(`¿Eliminar el tiquete ${t.id}? Esto también borrará su ingreso asociado.`)) return;

    try {
      if(t._id) {
        await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'tiquetes', t._id));
      }
      if(t.movDocId) {
        try { await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'movimientos', t.movDocId)); } catch(errMov){}
      }
      if(t.payMovDocId) {
        try { await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'movimientos', t.payMovDocId)); } catch(errPay){}
      }

      this.tickets = this.tickets.filter(x => x.id !== id);
      this.movs = this.movs.filter(m => m.ticketId !== id && (!m.detail || !m.detail.includes(id)));
      this.renderAll();
      alert("Tiquete eliminado con éxito.");
    } catch(e) {
      console.error("Error al eliminar:", e);
      alert("Hubo un error al intentar eliminar el tiquete.");
    }
  },

  renderDashboardSummary(){
    const today = crDateStr();
    const todayMovs = this.movs.filter(m => (m.crDate === today || m.date === todayStr()) && m.type === 'Ingreso');
    const sold = todayMovs.reduce((s,m)=>s+m.amount, 0);
    const soldEl = document.getElementById('soldToday');
    if(soldEl) soldEl.textContent = money(sold);

    const todayTiq = this.tickets.filter(t => t.crDate === today || t.date === todayStr());
    const tiqEl = document.getElementById('ticketsToday');
    if(tiqEl) tiqEl.textContent = todayTiq.length;
  }
});