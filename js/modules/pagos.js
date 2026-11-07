// Pagos: búsqueda de tiquetes y pago a ganadores

Object.assign(App, {
  findTicketForPay(){
    const id = normalizeCode(document.getElementById('payTicketId').value);
    const t = this.tickets.find(x=>normalizeCode(x.id)===id);
    const box = document.getElementById('payResult');
    if(!t){ box.className='empty-note'; box.textContent='No encontrado.'; return; }
    box.className = 'panel'; box.style.padding='14px';

    const result = this.results.find(r=>r.draw===t.draw && r.crDate===t.crDate);
    const premio = t.premio || 0;
    const expiry = addDaysToDateStr(t.crDate, CLAIM_DAYS);
    const expired = crDateStr() > expiry;
    let estado;
    if(t.paid) estado = `Ya pagado · premio ${money(premio)}`;
    else if(!result) estado = `Sin resultado. Vence ${formatDMY(expiry)}.`;
    else if(!t.premiado) estado = 'No salió premiado.';
    else if(expired) estado = `⚠ Venció el ${formatDMY(expiry)}.`;
    else if(t.status!=='registrada') estado = `Esperando cierre para finanzas.`;
    else estado = `Premiado · le corresponden ${money(premio)}`;
    const puedePagar = !t.paid && t.status==='registrada' && !!result && t.premiado && !expired;

    box.innerHTML = `
            <div style="margin-bottom:10px;"><b>${escapeHtml(t.id)}</b> · ${escapeHtml(t.draw)} · Jugado: ${money(t.total)}<br><span style="color:var(--text-muted); font-size:12.5px;">Comprador: ${escapeHtml(t.buyer || 'Anónimo')}</span></div>
      <div style="font-size:12.5px; color:${expired?'var(--red)':'var(--text-muted)'}; margin-bottom:12px;">${escapeHtml(estado)}</div>
      ${puedePagar ? `<button class="btn-small gold" onclick="App.payTicket('${escapeHtml(t.id).replace(/'/g,"&#39;")}')">Registrar pago</button>` : ''}
    `;
  },

  async payTicket(id){
    const t = this.tickets.find(x=>x.id===id);
    if(!t || t.paid || !t.premiado) return;
    try {
      const movId = await this.getNextSeq('movimientos');
      const movRef = await window.fs.addDoc(window.fs.collection(window.fs.db, 'movimientos'), {
        id: 'M'+movId, date: todayStr(), crDate: crDateStr(), type: 'Pago',
        detail: `Pago a ganador ${t.id}`, amount: -(t.premio||0),
        owner: t.owner, ticketId: t.id, draw: t.draw, locked: false
      });
      await window.fs.updateDoc(window.fs.doc(window.fs.db, 'tiquetes', t._id), { paid: true, payMovDocId: movRef.id });
      this.findTicketForPay();
    } catch(e){ console.error(e); }
  }
});