// Bloqueos globales. El vencimiento se interpreta siempre en Costa Rica (UTC−6).
Object.assign(App, {
  numberBlocks: {},
  numberBlocksReady: false,

  numberBlocksRef(){ return window.fs.doc(window.fs.db, 'configuracion', 'bloqueos_numeros'); },

  readNumberBlocks(snap){
    const blocks = snap.exists() ? (snap.data().numeros || {}) : {};
    if(!blocks || typeof blocks !== 'object' || Array.isArray(blocks) ||
       Object.entries(blocks).some(([n,b])=> !/^\d{2}$/.test(n) || !b || typeof b.hasta !== 'string' || !Number.isFinite(Date.parse(b.hasta)))){
      throw new Error('No se pudo verificar la configuración de números bloqueados.');
    }
    return blocks;
  },

  isNumberBlocked(num, blocks = this.numberBlocks){
    return !!blocks[num] && Date.parse(blocks[num].hasta) > Date.now();
  },

  canUseNumberBlocks(){
    if(this.numberBlocksReady) return true;
    alert('Esperá a que se verifiquen los números bloqueados. Revisá tu conexión si no cargan.');
    return false;
  },

  subscribeNumberBlocks(){
    const unsub = window.fs.onSnapshot(this.numberBlocksRef(), {includeMetadataChanges:true}, snap=>{
      try {
        this.numberBlocks = this.readNumberBlocks(snap);
        // La caché local no confirma si otro negocio recibió un bloqueo nuevo.
        this.numberBlocksReady = !snap.metadata.fromCache;
      } catch(e){
        console.error(e);
        this.numberBlocksReady = false;
      }
      this.renderNumberBlocks();
    }, error=>{
      console.error('Error leyendo bloqueos:', error);
      this.numberBlocksReady = false;
      this.renderNumberBlocks();
    });
    this.unsubscribes.push(unsub);
  },

  renderNumberBlocks(){
    const active = Object.keys(this.numberBlocks).filter(n=>this.isNumberBlocked(n)).sort();
    const sales = document.getElementById('blockedNumbersSales');
    const admin = document.getElementById('numberBlocksAdmin');
    const signature = `${this.numberBlocksReady}|${this.currentRole}|${active.map(n=>n+this.numberBlocks[n].hasta).join('|')}`;
    if(sales && sales.dataset.signature !== signature){
      sales.dataset.signature = signature;
      sales.textContent = this.numberBlocksReady ? (active.join(' · ') || 'Ninguno') : 'No se pudieron verificar los bloqueos. Esperá o revisá tu conexión.';
    }
    if(!admin) return;
    if(this.currentRole !== 'admin'){ admin.replaceChildren(); admin.dataset.signature = ''; return; }
    if(admin.dataset.signature === signature) return;
    admin.dataset.signature = signature;
    admin.replaceChildren();
    if(!this.numberBlocksReady){ admin.textContent = 'Esperando conexión para verificar bloqueos.'; return; }
    if(!active.length){ admin.textContent = 'No hay números bloqueados.'; return; }
    active.forEach(num=>{
      const row = document.createElement('div'); row.className = 'number-block-row';
      const info = document.createElement('span');
      const end = new Intl.DateTimeFormat('es-CR', {timeZone:'America/Costa_Rica', dateStyle:'short', timeStyle:'short'}).format(new Date(this.numberBlocks[num].hasta));
      info.textContent = `${num} · hasta ${end}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-small'; button.textContent = 'Desbloquear';
      button.onclick = ()=>this.removeNumberBlock(num);
      row.append(info, button); admin.appendChild(row);
    });
  },

  async saveNumberBlock(){
    if(this.currentRole !== 'admin' || !this.canUseNumberBlocks()) return;
    const raw = document.getElementById('blockNumber').value.trim();
    const num = raw.padStart(2,'0');
    const input = document.getElementById('blockUntil').value;
    const end = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? Date.parse(input+':00-06:00') : NaN;
    if(!raw || !/^\d{2}$/.test(num)){ alert('Ingresá un número de 00 a 99.'); return; }
    if(!Number.isFinite(end) || end <= Date.now()){ alert('Elegí una fecha y hora futuras de Costa Rica.'); return; }
    const button = document.getElementById('saveNumberBlock'); button.disabled = true;
    try {
      await window.fs.runTransaction(window.fs.db, async tx=>{
        const ref = this.numberBlocksRef();
        const blocks = this.readNumberBlocks(await tx.get(ref));
        blocks[num] = {hasta:new Date(end).toISOString()};
        tx.set(ref, {tipo:'bloqueos_numeros', numeros:blocks});
      });
      document.getElementById('blockNumber').value = '';
      document.getElementById('blockUntil').value = '';
    } catch(e){ console.error(e); alert('No se pudo guardar el bloqueo. Revisá la conexión y los permisos de Firestore.'); }
    finally { button.disabled = false; }
  },

  async removeNumberBlock(num){
    if(this.currentRole !== 'admin' || !/^\d{2}$/.test(num)) return;
    if(!confirm(`¿Desbloquear el número ${num}?`)) return;
    try {
      await window.fs.runTransaction(window.fs.db, async tx=>{
        const ref = this.numberBlocksRef();
        const blocks = this.readNumberBlocks(await tx.get(ref));
        delete blocks[num];
        tx.set(ref, {tipo:'bloqueos_numeros', numeros:blocks});
      });
    } catch(e){ console.error(e); alert('No se pudo desbloquear el número.'); }
  }
});
