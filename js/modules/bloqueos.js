// Bloqueos por familia de sorteos. El vencimiento se interpreta siempre en Costa Rica (UTC−6).
Object.assign(App, {
  numberBlocks: {},
  numberBlocksReady: false,

  numberBlocksRef(){ return window.fs.doc(window.fs.db, 'configuracion', 'bloqueos_numeros'); },

  blockFamilies: {tica:'Tica', nica:'Nica', primera:'La Primera'},

  numberBlockFamily(drawName){
    if(/^tica/i.test(drawName)) return 'tica';
    if(/^nica/i.test(drawName)) return 'nica';
    if(/^la primera/i.test(drawName)) return 'primera';
    return null;
  },

  readNumberBlocks(snap){
    const stored = snap.exists() ? (snap.data().numeros || {}) : {};
    if(!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Configuración de bloqueos inválida.');
    const blocks = {};
    for(const [key, block] of Object.entries(stored)){
      if(!/^(?:(tica|nica|primera)_)?\d{2}$/.test(key) || !block || typeof block.hasta !== 'string' || !Number.isFinite(Date.parse(block.hasta))){
        throw new Error('No se pudo verificar la configuración de números bloqueados.');
      }
      // Compatibilidad: los bloqueos globales anteriores conservan su alcance
      // y aparecen como tres bloqueos que se pueden gestionar por separado.
      if(/^\d{2}$/.test(key)){
        Object.keys(this.blockFamilies).forEach(f=>{ blocks[`${f}_${key}`] = {...block}; });
      }
    }
    for(const [key, block] of Object.entries(stored)){
      if(key.includes('_')) blocks[key] = {...block};
    }
    return blocks;
  },

  isNumberBlocked(num, drawName, blocks = this.numberBlocks){
    const family = this.numberBlockFamily(drawName || '');
    const block = blocks[`${family}_${num}`];
    return !!block && Date.parse(block.hasta) > Date.now();
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
    const active = Object.keys(this.numberBlocks).filter(key=>Date.parse(this.numberBlocks[key].hasta)>Date.now()).sort();
    const sales = document.getElementById('blockedNumbersSales');
    const admin = document.getElementById('numberBlocksAdmin');
    const signature = `${this.numberBlocksReady}|${this.currentRole}|${active.map(n=>n+this.numberBlocks[n].hasta).join('|')}`;
    if(sales && sales.dataset.signature !== signature){
      sales.dataset.signature = signature;
      sales.replaceChildren();
      if(!this.numberBlocksReady){
        sales.textContent = 'Esperando conexión para verificar bloqueos.';
      } else if(!active.length){
        sales.textContent = 'No hay números bloqueados.';
      } else {
        Object.entries(this.blockFamilies).forEach(([family,label])=>{
          const numbers = active.filter(key=>key.startsWith(family+'_')).map(key=>key.split('_')[1]);
          if(!numbers.length) return;
          const group = document.createElement('section'); group.className = 'blocked-family';
          const heading = document.createElement('h4'); heading.textContent = label;
          const list = document.createElement('div'); list.className = 'blocked-number-chips';
          numbers.forEach(num=>{ const chip = document.createElement('span'); chip.textContent = num; list.appendChild(chip); });
          group.append(heading, list); sales.appendChild(group);
        });
      }
    }
    if(!admin) return;
    if(this.currentRole !== 'admin'){ admin.replaceChildren(); admin.dataset.signature = ''; return; }
    if(admin.dataset.signature === signature) return;
    admin.dataset.signature = signature;
    admin.replaceChildren();
    if(!this.numberBlocksReady){ admin.textContent = 'Esperando conexión para verificar bloqueos.'; return; }
    if(!active.length){ admin.textContent = 'No hay números bloqueados.'; return; }
    active.forEach(key=>{
      const [family,num] = key.split('_');
      const row = document.createElement('div'); row.className = 'number-block-row';
      const info = document.createElement('span');
      const end = new Intl.DateTimeFormat('es-CR', {timeZone:'America/Costa_Rica', dateStyle:'short', timeStyle:'short'}).format(new Date(this.numberBlocks[key].hasta));
      info.textContent = `${this.blockFamilies[family]} · ${num} · hasta ${end}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-small'; button.textContent = 'Desbloquear';
      button.onclick = ()=>this.removeNumberBlock(family, num);
      row.append(info, button); admin.appendChild(row);
    });
  },

  async saveNumberBlock(){
    if(this.currentRole !== 'admin' || !this.canUseNumberBlocks()) return;
    const raw = document.getElementById('blockNumber').value.trim();
    const num = raw.padStart(2,'0');
    const family = document.getElementById('blockFamily').value;
    if(!Object.hasOwn(this.blockFamilies, family)){ alert('Elegí Tica, Nica o La Primera.'); return; }
    const input = document.getElementById('blockUntil').value;
    const end = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input) ? Date.parse(input+':00-06:00') : NaN;
    if(!raw || !/^\d{2}$/.test(num)){ alert('Ingresá un número de 00 a 99.'); return; }
    if(!Number.isFinite(end) || end <= Date.now()){ alert('Elegí una fecha y hora futuras de Costa Rica.'); return; }
    const button = document.getElementById('saveNumberBlock'); button.disabled = true;
    try {
      await window.fs.runTransaction(window.fs.db, async tx=>{
        const ref = this.numberBlocksRef();
        const blocks = this.readNumberBlocks(await tx.get(ref));
        blocks[`${family}_${num}`] = {hasta:new Date(end).toISOString()};
        tx.set(ref, {tipo:'bloqueos_numeros', numeros:blocks});
      });
      document.getElementById('blockNumber').value = '';
      document.getElementById('blockUntil').value = '';
    } catch(e){ console.error(e); alert('No se pudo guardar el bloqueo. Revisá la conexión y los permisos de Firestore.'); }
    finally { button.disabled = false; }
  },

  async removeNumberBlock(family, num){
    if(this.currentRole !== 'admin' || !Object.hasOwn(this.blockFamilies, family) || !/^\d{2}$/.test(num)) return;
    if(!confirm(`¿Desbloquear el número ${num} en ${this.blockFamilies[family]}?`)) return;
    try {
      await window.fs.runTransaction(window.fs.db, async tx=>{
        const ref = this.numberBlocksRef();
        const blocks = this.readNumberBlocks(await tx.get(ref));
        delete blocks[`${family}_${num}`];
        tx.set(ref, {tipo:'bloqueos_numeros', numeros:blocks});
      });
    } catch(e){ console.error(e); alert('No se pudo desbloquear el número.'); }
  }
});
