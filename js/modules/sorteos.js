// Sorteos: selector, estado abierto/cerrado, cierre automático y manual

function isDrawOpen(draw, now){
  if(App.getClosure(draw)) return false;   // cerrado manualmente por el admin
  return (now.h*60+now.m) < (draw.closeH*60+draw.closeM);
}

Object.assign(App, {
  populateDrawSelect(){
    const sel = document.getElementById('drawSelect');
    if(!sel) return;
    const now = getCRTime();
    const todaysDraws = DRAWS.filter(d=>isDrawActiveToday(d));

    const signature = todaysDraws.map(d => {
      const cl = this.getClosure(d);
      return d.key + ':' + (isDrawOpen(d, now) ? 1 : 0) + ':' + (cl ? cl.motivo : '');
    }).join('|');
    if(sel.dataset.sig === signature) return;
    sel.dataset.sig = signature;
    this.renderReports();

    const previous = sel.value;

    sel.innerHTML = todaysDraws.map(d=>{
      const open = isDrawOpen(d, now);
      const cl = this.getClosure(d);
      const tag = open ? '' : (cl ? ` (cerrado: ${escapeHtml(cl.motivo || 'administración')})` : ' (cerrado)');
      return `<option value="${d.name}" ${open?'':'disabled'}>${d.name} · ${d.country} · cierra ${fmtClose(d)}${tag}</option>`;
    }).join('');

    const prevDraw = todaysDraws.find(d => d.name === previous);
    if(prevDraw && isDrawOpen(prevDraw, now)){
      sel.value = previous;
    } else {
      const firstOpen = todaysDraws.find(d => isDrawOpen(d, now));
      if(firstOpen) sel.value = firstOpen.name;
    }
    this.onDrawChange();
  },

  onDrawChange(){
    const sel = document.getElementById('drawSelect');
    if(sel && sinReventado(sel.value) && this.currentLines.some(l => l.rev > 0)){
      this.currentLines.forEach(l => { l.rev = 0; });
      this.renderLines();
      alert('Este sorteo no juega reventado. Se quitó el reventado de las líneas del tiquete.');
    }
    this.refreshDrawStatus();
    this.checkNicaDraw();
  },

  checkNicaDraw(){
    const sel = document.getElementById('drawSelect');
    const revField = document.getElementById('revFieldWrapper');
    const revInput = document.getElementById('revInput');
    const betRow = document.getElementById('betRowContainer');
    if(!sel || !revField || !revInput || !betRow) return;

    const selectedDrawName = sel.value || '';
    const isNica = selectedDrawName.toLowerCase().includes('nica');

    if(isNica){
      revField.classList.add('hidden');
      revInput.disabled = true;
      revInput.value = ''; // Limpiar el valor si cambian a Nica
      betRow.style.gridTemplateColumns = '1fr 1fr auto auto';
    } else {
      revField.classList.remove('hidden');
      revInput.disabled = false;
      betRow.style.gridTemplateColumns = '1fr 1fr 1.2fr auto auto';
    }
  },

  refreshDrawStatus(){
    const sel = document.getElementById('drawSelect');
    const banner = document.getElementById('drawStatus');
    if(!sel || !banner) return;
    const draw = DRAWS.find(d=>d.name===sel.value);
    const closure = draw ? this.getClosure(draw) : null;
    const open = draw ? isDrawOpen(draw, getCRTime()) : false;
    banner.classList.remove('hidden');
    if(open){
      banner.className = 'status-banner open';
      banner.textContent = `Sorteo abierto · cierra a las ${fmtClose(draw)} hora Costa Rica.`;
    } else if(closure){
      banner.className = 'status-banner closed';
      banner.textContent = `Sorteo cerrado por la administración. Motivo: ${closure.motivo}`;
    } else {
      banner.className = 'status-banner closed';
      banner.textContent = draw ? `Este sorteo ya cerró a las ${fmtClose(draw)}. No se pueden agregar ni confirmar ventas.` : 'Seleccioná un sorteo.';
    }

    const sinRev = draw ? sinReventado(draw.name) : false;
    ['numInput','amtInput'].forEach(id=>{ const el=document.getElementById(id); if(el) el.disabled = !open; });

    const revEl = document.getElementById('revInput');
    if(revEl) revEl.disabled = !open || sinRev;

    const addBtn = document.querySelector('.add-btn');
    if(addBtn) addBtn.disabled = !open;
  },

  async processClosedDraws(now){
    const today = crDateStr();
    for (const d of DRAWS) {
      if(isDrawOpen(d, now)) continue;
      if(this.processedDraws[d.key] === today) continue;

      const pendientes = this.tickets.filter(t => t.draw === d.name && t.status === 'pendiente' && t.crDate === today);
      for (const t of pendientes) {
        try {
          const movId = await this.getNextSeq('movimientos');
          const movRef = window.fs.doc(window.fs.collection(window.fs.db, 'movimientos'));

          await window.fs.runTransaction(window.fs.db, async (tx) => {
            const tRef = window.fs.doc(window.fs.db, 'tiquetes', t._id);
            const tSnap = await tx.get(tRef);
            if(!tSnap.exists() || tSnap.data().status !== 'pendiente') return;

            tx.update(tRef, { status: 'registrada' });
            tx.set(movRef, {
              id: 'M' + movId, date: todayStr(), crDate: today,
              type: 'Ingreso', detail: `Venta ${t.id} · ${t.draw}`,
              amount: t.total, owner: t.owner, ticketId: t.id, draw: t.draw, locked: false
            });
          });
        } catch (e) { console.error('Error cerrando sorteo:', e); }
      }
      this.processedDraws[d.key] = today;
    }
  },

  getClosure(draw, dateStr){
    const d = dateStr || crDateStr();
    return this.closures.find(c => c.draw === draw.name && c.crDate === d && c.estado === 'cerrado') || null;
  },

  async closeDrawManually(){
    if(this.currentRole !== 'admin') return;
    const drawName = document.getElementById('closeDraw').value;
    const crDate = document.getElementById('closeDate').value;
    const motivo = document.getElementById('closeReason').value.trim();

    if(!drawName || !crDate){ alert('Elegí el sorteo y la fecha.'); return; }
    if(crDate < crDateStr()){ alert('La fecha no puede ser anterior a hoy.'); return; }
    if(!motivo){ alert('Escribí el motivo del cierre.'); return; }

    const afectados = this.tickets.filter(t => t.draw === drawName && t.crDate === crDate).length;
    const aviso = afectados
      ? `\n\nYa hay ${afectados} tiquete(s) vendido(s) para ese sorteo y fecha. No se borran automáticamente; podés eliminarlos desde Reportes.`
      : '';
    if(!confirm(`¿Cerrar ${drawName} el ${formatDMY(crDate)}?\nMotivo: ${motivo}${aviso}`)) return;

    try {
      const id = `cierre_${crDate}_${drawName.replace(/\s+/g,'')}`;
      await window.fs.setDoc(window.fs.doc(window.fs.db, 'configuracion', id), {
        tipo: 'cierre_manual',
        estado: 'cerrado',
        draw: drawName,
        crDate,
        motivo,
        cerradoPor: this.currentProfile.name,
        ts: new Date().toISOString()
      });
      document.getElementById('closeReason').value = '';
      alert('Sorteo cerrado. Los vendedores ya no podrán vender en él.');
    } catch(e){
      console.error(e);
      alert('Error al cerrar el sorteo.');
    }
  },

  async reopenDraw(id){
    if(this.currentRole !== 'admin') return;
    if(!confirm('¿Reabrir este sorteo para ventas?')) return;
    try {
      await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'configuracion', id));
    } catch(e){
      console.error(e);
      alert('Error al reabrir el sorteo.');
    }
  },

  renderClosures(){
    const box = document.getElementById('closuresList');
    if(!box) return;
    const today = crDateStr();
    const list = this.closures
      .filter(c => c.crDate >= today)
      .sort((a,b) => (a.crDate + a.draw).localeCompare(b.crDate + b.draw));

    if(!list.length){
      box.innerHTML = '<div class="empty-note">No hay cierres manuales activos</div>';
      return;
    }
    box.innerHTML = list.map(c => `
      <div style="border-bottom:1px solid var(--navy-line); padding:10px 0; display:flex; justify-content:space-between; gap:10px; align-items:flex-start;">
        <div style="font-size:12.5px; line-height:1.5;">
          <b>${escapeHtml(c.draw)}</b> · <span class="mono">${escapeHtml(formatDMY(c.crDate))}</span><br>
          <span style="color:var(--text-muted);">${escapeHtml(c.motivo || '')}</span>
        </div>
        <button class="btn-small" onclick="App.reopenDraw('${escapeHtml(c._id)}')">Reabrir</button>
      </div>
    `).join('');
  }
});