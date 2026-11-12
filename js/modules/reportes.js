// Reportes: listado y filtros de tiquetes emitidos

Object.assign(App, {
  repShowHistory: false,

  populateReportDrawSelect(){
    const sel = document.getElementById('repDraw');
    if(sel) sel.innerHTML = '<option value="">Todos</option>' + DRAWS.map(d=>`<option value="${d.name}">${d.name}</option>`).join('');
  },

  clearReportFilters(){
    document.getElementById('repSearch').value = '';
    document.getElementById('repOwner').value = '';
    document.getElementById('repDateFrom').value = '';
    document.getElementById('repDateTo').value = '';
    document.getElementById('repDraw').value = '';
    document.getElementById('repPremio').value = '';
    this.renderAll();
  },

  toggleRepHistory(){
    this.repShowHistory = !this.repShowHistory;
    this.renderReports();
  },

  renderReports(){
    const hist = this.repShowHistory;
    const today = crDateStr();
    const search = normalizeCode(document.getElementById('repSearch').value);
    const dateFrom = hist ? document.getElementById('repDateFrom').value : '';
    const dateTo = hist ? document.getElementById('repDateTo').value : '';
    const draw = hist ? document.getElementById('repDraw').value : '';
    const premioFilter = hist ? document.getElementById('repPremio').value : '';

    const owner = this.currentRole==='admin' ? document.getElementById('repOwner').value : this.currentOwnerId();
    let list = this.tickets.filter(t=>{
      if(owner && t.owner!==owner) return false;
      // Por defecto solo los de hoy; si se escribe un código en el buscador se busca en todos los días
      if(!hist && !search && t.crDate !== today) return false;
      if(search && !normalizeCode(t.id).includes(search)) return false;
      if(dateFrom && t.crDate && t.crDate < dateFrom) return false;
      if(dateTo && t.crDate && t.crDate > dateTo) return false;
      if(draw && t.draw !== draw) return false;

      const hasRes = !!this.results.find(r=>r.draw===t.draw && r.crDate===t.crDate);
      if(premioFilter === 'premiado' && (!hasRes || !t.premiado)) return false;
      if(premioFilter === 'no_premiado' && (!hasRes || t.premiado)) return false;
      if(premioFilter === 'sin_resultado' && hasRes) return false;
      return true;
    }).sort((a,b)=>b.id.localeCompare(a.id));

    const body = document.getElementById('repBody');
    if(!body) return;
    body.innerHTML = '';
    list.forEach(t=>{
      const hasRes = !!this.results.find(r=>r.draw===t.draw && r.crDate===t.crDate);
      let estadoTxt = 'Pendiente resultado';
      if(hasRes){
        if(t.paid) estadoTxt = 'Pagado';
        else if(t.premiado) estadoTxt = `Premiado (${money(t.premio)})`;
        else estadoTxt = 'No premiado';
      }

      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.onclick = ()=>App.showReceiptById(t.id);
      tr.innerHTML = `
        <td class="mono" style="font-weight:600; color:var(--gold);">${escapeHtml(t.id)}</td>
        <td>${escapeHtml(t.draw)}</td>
        <td>${escapeHtml(t.vendor || ownerLabel(t.owner))}</td>
        <td>${escapeHtml(t.buyer || 'Anónimo')}</td>
        <td class="mono">${money(t.total)}</td>
        <td class="mono">${t.premiado ? money(t.premio) : '—'}</td>
        <td>${escapeHtml(estadoTxt)}</td>
        <td>${this.canDeleteTicket(t) ? `<button class="del-x" onclick="event.stopPropagation(); App.deleteTicket('${escapeHtml(t.id)}')">✕</button>` : '—'}</td>
      `;
      body.appendChild(tr);
    });
    document.getElementById('repTable').classList.toggle('hidden', list.length===0);
    const repEmpty = document.getElementById('repEmpty');
    repEmpty.classList.toggle('hidden', list.length>0);
    repEmpty.textContent = (!hist && !search) ? 'Todavía no hay tiquetes emitidos hoy'
      : (this.tickets.length === 0 ? 'No hay tiquetes emitidos todavía' : 'No hay tiquetes con esos filtros');
    document.getElementById('repHistoryFilters').classList.toggle('hidden', !hist);
    document.getElementById('repTitle').textContent = hist ? 'Historial de tiquetes' : (search ? 'Resultado de la búsqueda' : 'Tiquetes de hoy');
    document.getElementById('repToggleBtn').textContent = hist ? 'Solo hoy ▴' : 'Ver otros días ▾';
  }
});