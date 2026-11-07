// Resultados: registro de números ganadores, cálculo de premios, historial

Object.assign(App, {
  resShowHistory: false,
  numShowHistory: false,

  populateResultDrawSelect(){
    const opts = DRAWS.map(d => `<option value="${d.name}">${d.name}</option>`).join('');
    ['resDraw', 'closeDraw'].forEach(id => { const el = document.getElementById(id); if(el) el.innerHTML = opts; });
    ['resDate', 'closeDate'].forEach(id => { const el = document.getElementById(id); if(el && !el.value) el.value = crDateStr(); });
    const fd = document.getElementById('resFilterDraw');
    if(fd) fd.innerHTML = '<option value="">Todos</option>' + opts;
    this.onResDrawChange();
  },

  calcPremio(t, res){
    let total = 0;
    const isNica = t.draw.toLowerCase().includes('nica');
    const multiplier = isNica ? 85 : 85;
    const esReventadoGanador = res.numeroReventadoType === 'br';

    t.lines.forEach(l=>{
      if(l.num === res.numero) total += l.amt * multiplier;
      if(!sinReventado(t.draw) && esReventadoGanador && l.num === res.numero && l.rev > 0) total += l.rev * 200;
    });
    return total;
  },

  onResDrawChange(){
    const sel = document.getElementById('resDraw');
    const rev = document.getElementById('resReventadoType');
    if(!sel || !rev) return;
    const off = sinReventado(sel.value);
    rev.disabled = off;
    if(off) rev.value = '';
  },

  async saveResult(){
    if(this.currentRole !== 'admin') return;
    const draw = document.getElementById('resDraw').value;
    const crDate = document.getElementById('resDate').value;
    const numeroRaw = document.getElementById('resNumero').value.trim();
    const numeroReventadoType = document.getElementById('resReventadoType').value;
    
    if(!draw || !crDate || !numeroRaw){ alert('Completá sorteo, fecha y número ganador.'); return; }
    
    const isNica = sinReventado(draw);
    if(!isNica && !numeroReventadoType){ alert('Debes seleccionar obligatoriamente si cayó Bola Reventada (br) o Bola Blanca (bb).'); return; }

    const numero = numeroRaw.padStart(2,'0');
    const resId = `${crDate}_${draw.replace(/\s+/g,'')}`;

    try {
      await window.fs.setDoc(window.fs.doc(window.fs.db, 'resultados', resId), { 
        draw, 
        crDate, 
        numero, 
        numeroReventadoType: isNica ? 'N/A' : numeroReventadoType 
      });

      const configId = `sorteo_estado_${crDate}_${draw.replace(/\s+/g,'')}`;
      await window.fs.setDoc(window.fs.doc(window.fs.db, 'configuracion', configId), {
        draw,
        crDate,
        estado: 'cerrado',
        cerradoAutomaticamente: true,
        actualizadoEn: new Date().toISOString()
      }, { merge: true });

      const ticketsToUpdate = this.tickets.filter(t => t.draw === draw && t.crDate === crDate);
      for (let t of ticketsToUpdate) {
        const premio = this.calcPremio(t, { numero, numeroReventadoType });
        const premiado = premio > 0;
        await window.fs.updateDoc(window.fs.doc(window.fs.db, 'tiquetes', t._id), { premio, premiado });
      }

      alert('¡Resultado guardado y premios recalculados correctamente!');
      
      document.getElementById('resNumero').value = '';
      document.getElementById('resReventadoType').value = '';
    } catch(e) { 
      console.error(e); 
      alert('Error al guardar resultado.'); 
    }
  },

  async deleteResult(id){
    if(this.currentRole !== 'admin') return;
    if(!confirm('¿Eliminar resultado?')) return;
    try {
      const r = this.results.find(x => x._id === id);
      await window.fs.deleteDoc(window.fs.doc(window.fs.db, 'resultados', id));
      
      if(r) {
        const ticketsToReset = this.tickets.filter(t => t.draw === r.draw && t.crDate === r.crDate);
        for(let t of ticketsToReset){
          await window.fs.updateDoc(window.fs.doc(window.fs.db, 'tiquetes', t._id), { premio: 0, premiado: false });
        }
      }
    } catch(e) { console.error(e); }
  },

  toggleResHistory(){
    this.resShowHistory = !this.resShowHistory;
    this.renderResults();
  },

  clearResFilters(){
    document.getElementById('resFilterFrom').value = '';
    document.getElementById('resFilterTo').value = '';
    document.getElementById('resFilterDraw').value = '';
    this.renderResults();
  },

  renderResults(){
    const body = document.getElementById('resBody');
    if(!body) return;
    const hist = this.resShowHistory;
    const today = crDateStr();
    const from = document.getElementById('resFilterFrom').value;
    const to = document.getElementById('resFilterTo').value;
    const drawF = document.getElementById('resFilterDraw').value;
    const closeMin = name => { const d = DRAWS.find(x => x.name === name); return d ? d.closeH*60 + d.closeM : 0; };

    // Por defecto solo los de hoy; con "Ver otros días" se aplican los filtros
    const arr = this.results.filter(r => {
      if(!hist) return r.crDate === today;
      if(from && r.crDate < from) return false;
      if(to && r.crDate > to) return false;
      if(drawF && r.draw !== drawF) return false;
      return true;
    }).sort((a,b) => b.crDate.localeCompare(a.crDate) || closeMin(b.draw) - closeMin(a.draw))
      .slice(0, hist ? 200 : undefined);

    body.innerHTML = '';
    arr.forEach(r=>{
      const tr = document.createElement('tr');
      const revText = r.numeroReventadoType === 'br' ? 'Bola Reventada (br)' : r.numeroReventadoType === 'bb' ? 'Bola Blanca (bb)' : (r.numeroReventadoType || '—');
      tr.innerHTML = `
        <td>${escapeHtml(r.draw)}</td>
        <td class="mono">${escapeHtml(formatDMY(r.crDate))}</td>
        <td class="mono" style="font-weight:bold; color:var(--gold);">${escapeHtml(r.numero)}</td>
        <td>${escapeHtml(revText)}</td>
        <td><button class="del-x" onclick="App.deleteResult('${escapeHtml(r._id)}')">✕</button></td>
      `;
      body.appendChild(tr);
    });

    document.getElementById('resHistoryFilters').classList.toggle('hidden', !hist);
    document.getElementById('resTitle').textContent = hist ? 'Historial de resultados' : 'Resultados de hoy';
    document.getElementById('resToggleBtn').textContent = hist ? 'Solo hoy ▴' : 'Ver otros días ▾';
    document.getElementById('resTable').classList.toggle('hidden', arr.length===0);
    const empty = document.getElementById('resEmpty');
    empty.classList.toggle('hidden', arr.length>0);
    empty.textContent = !hist ? 'Todavía no hay resultados de hoy'
      : (this.results.length === 0 ? 'Todavía no hay resultados registrados' : 'No hay resultados con esos filtros');
    this.renderNumeros();
  },

  populateNumerosDrawSelect(){
    const sel = document.getElementById('numDraw');
    if(sel) sel.innerHTML = '<option value="">Todos</option>' + DRAWS.map(d=>`<option value="${d.name}">${d.name}</option>`).join('');
  },

  clearNumerosFilters(){
    document.getElementById('numDateFrom').value = '';
    document.getElementById('numDateTo').value = '';
    document.getElementById('numDraw').value = '';
    this.renderNumeros();
  },

  toggleNumHistory(){
    this.numShowHistory = !this.numShowHistory;
    this.renderNumeros();
  },

  renderNumeros(){
    const body = document.getElementById('numBody');
    if(!body) return;
    const hist = this.numShowHistory;
    const today = crDateStr();
    const from = hist ? document.getElementById('numDateFrom').value : '';
    const to = hist ? document.getElementById('numDateTo').value : '';
    const draw = hist ? document.getElementById('numDraw').value : '';

    const closeMin = name => { const d = DRAWS.find(x => x.name === name); return d ? d.closeH*60 + d.closeM : 0; };

    // Por defecto solo los de hoy; con "Ver otros días" se aplican los filtros
    const list = this.results.filter(r => {
      if(!hist) return r.crDate === today;
      if(from && r.crDate < from) return false;
      if(to && r.crDate > to) return false;
      if(draw && r.draw !== draw) return false;
      return true;
    }).sort((a,b) => b.crDate.localeCompare(a.crDate) || closeMin(b.draw) - closeMin(a.draw))
      .slice(0, hist ? 100 : undefined);

    body.innerHTML = '';
    list.forEach(r => {
      const rev = r.numeroReventadoType === 'br' ? 'Bola Reventada (br)'
                : r.numeroReventadoType === 'bb' ? 'Bola Blanca (bb)' : '—';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono">${escapeHtml(formatDMY(r.crDate))}</td>
        <td>${escapeHtml(r.draw)}</td>
        <td class="mono" style="font-weight:bold; font-size:16px; color:var(--gold);">${escapeHtml(r.numero)}</td>
        <td>${escapeHtml(rev)}</td>
      `;
      body.appendChild(tr);
    });
    document.getElementById('numTable').classList.toggle('hidden', list.length === 0);
    const empty = document.getElementById('numEmpty');
    empty.classList.toggle('hidden', list.length > 0);
    empty.textContent = !hist ? 'Todavía no hay resultados de hoy'
      : (this.results.length === 0 ? 'Todavía no hay resultados registrados' : 'No hay resultados con esos filtros');
    document.getElementById('numHistoryFilters').classList.toggle('hidden', !hist);
    document.getElementById('numTitle').textContent = hist ? 'Historial de números' : 'Números que salieron hoy';
    document.getElementById('numToggleBtn').textContent = hist ? 'Solo hoy ▴' : 'Ver otros días ▾';
  }
});