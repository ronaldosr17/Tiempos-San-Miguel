// Comparte documento y suscripción con bloqueos: no agrega lecturas periódicas.
Object.assign(App, {
  temporaryLimits: {},

  readTemporaryLimits(snap){
    const limits=snap.exists() ? (snap.data().limitesTemporales ?? {}) : {};
    if(!limits || typeof limits!=='object' || Array.isArray(limits))throw Error('Configuración de límites temporales inválida.');
    const result={};
    for(const [family,limit] of Object.entries(limits)){
      if(!Object.hasOwn(this.blockFamilies,family) || !limit || !Number.isSafeInteger(limit.directo) || limit.directo<50 || limit.directo%50 ||
        (family==='tica' && (!Number.isSafeInteger(limit.reventado) || limit.reventado<0 || limit.reventado%50)) ||
        typeof limit.hasta!=='string' || !Number.isFinite(Date.parse(limit.hasta)) || typeof limit.motivo!=='string' || !limit.motivo.trim() || limit.motivo.length>200){
        throw Error('No se pudieron verificar los límites temporales.');
      }
      result[family]={...limit};
    }
    return result;
  },

  activeTemporaryLimit(drawName,limits=this.temporaryLimits){
    const limit=limits[this.numberBlockFamily(drawName)];
    return limit && Date.parse(limit.hasta)>Date.now() ? limit : null;
  },

  temporaryLimitError(lines,drawName,limits=this.temporaryLimits){
    const limit=this.activeTemporaryLimit(drawName,limits);
    if(!limit)return '';
    const totals=new Map();
    for(const line of lines){
      if(!Number.isFinite(line.amt) || !Number.isFinite(line.rev) || line.amt<0 || line.rev<0)return 'La apuesta contiene montos inválidos.';
      const num=String(line.num).padStart(2,'0');
      if(!totals.has(num))totals.set(num,{direct:0,rev:0});
      const total=totals.get(num);total.direct+=line.amt;total.rev+=line.rev;
    }
    for(const [num,total] of totals){
      if(total.direct>limit.directo)return `El número ${num} supera el límite temporal directo de ${money(limit.directo)}. Motivo: ${limit.motivo}`;
      if(this.numberBlockFamily(drawName)==='tica' && total.rev>limit.reventado)return `El número ${num} supera el límite temporal de reventado de ${money(limit.reventado)}. Motivo: ${limit.motivo}`;
    }
    return '';
  },

  updateTemporaryLimitForm(){
    const tica=document.getElementById('temporaryLimitFamily').value==='tica';
    document.getElementById('temporaryLimitRevField').classList.toggle('hidden',!tica);
    document.getElementById('temporaryLimitRev').required=tica;
  },

  renderTemporaryLimits(){
    const active=Object.entries(this.temporaryLimits).filter(([,l])=>Date.parse(l.hasta)>Date.now());
    const signature=JSON.stringify([this.numberBlocksReady,this.currentRole,active]);
    for(const [id,admin] of [['temporaryLimitsSales',false],['temporaryLimitsAdmin',true]]){
      const container=document.getElementById(id);if(!container)continue;
      if(admin && this.currentRole!=='admin'){container.replaceChildren();container.dataset.signature='';continue;}
      if(container.dataset.signature===signature)continue;
      container.dataset.signature=signature;container.replaceChildren();
      if(!this.numberBlocksReady){container.textContent='Esperando conexión para verificar límites.';continue;}
      if(!active.length){container.textContent='Sin límites temporales activos.';continue;}
      for(const [family,limit] of active){
        const row=document.createElement('section');row.className='temporary-limit-item';
        const title=document.createElement('h4');title.textContent=this.blockFamilies[family]+' · todos los números';
        const amounts=document.createElement('p');amounts.textContent=`Directo: ${money(limit.directo)} por número y tiquete`+(family==='tica'?` · Reventado: ${money(limit.reventado)}`:'');
        const reason=document.createElement('p');reason.className='temporary-limit-reason';reason.textContent='Motivo: '+limit.motivo;
        row.append(title,amounts,reason);
        if(admin){
          const until=document.createElement('p');until.textContent='Hasta '+new Intl.DateTimeFormat('es-CR',{timeZone:'America/Costa_Rica',dateStyle:'short',timeStyle:'short'}).format(new Date(limit.hasta));
          const remove=document.createElement('button');remove.type='button';remove.className='btn-small';remove.textContent='Quitar límite';remove.onclick=()=>this.removeTemporaryLimit(family);
          row.append(until,remove);
        }
        container.appendChild(row);
      }
    }
  },

  async saveTemporaryLimit(){
    if(this.currentRole!=='admin' || !this.canUseNumberBlocks())return;
    const family=document.getElementById('temporaryLimitFamily').value;
    if(!Object.hasOwn(this.blockFamilies,family))return;
    const direct=Number(document.getElementById('temporaryLimitDirect').value);
    const rev=Number(document.getElementById('temporaryLimitRev').value);
    const input=document.getElementById('temporaryLimitUntil').value;
    const end=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)?Date.parse(input+':00-06:00'):NaN;
    const reason=document.getElementById('temporaryLimitReason').value.trim();
    if(!Number.isSafeInteger(direct) || direct<50 || direct%50 || (family==='tica' && (!Number.isSafeInteger(rev) || rev<0 || rev%50))){alert('Usá múltiplos de ₡50: directo desde ₡50 y reventado desde ₡0.');return;}
    if(!Number.isFinite(end) || end<=Date.now()){alert('Elegí una fecha y hora futuras de Costa Rica.');return;}
    if(!reason || reason.length>200){alert('Ingresá un motivo de hasta 200 caracteres.');return;}
    const button=document.getElementById('saveTemporaryLimit');button.disabled=true;
    try{
      await window.fs.runTransaction(window.fs.db,async tx=>{
        const ref=this.numberBlocksRef(),snap=await tx.get(ref);
        const limits=this.readTemporaryLimits(snap);
        limits[family]={directo:direct,...(family==='tica'?{reventado:rev}:{}),hasta:new Date(end).toISOString(),motivo:reason};
        tx.set(ref,{...(snap.exists()?snap.data():{}),limitesTemporales:limits});
      });
      alert('Límite temporal guardado.');
    }catch(e){console.error(e);alert('No se pudo guardar el límite. Revisá la conexión y los permisos de Firestore.');}
    finally{button.disabled=false;}
  },

  async removeTemporaryLimit(family){
    if(this.currentRole!=='admin' || !Object.hasOwn(this.blockFamilies,family))return;
    if(!confirm(`¿Quitar el límite temporal de ${this.blockFamilies[family]}? Volverá a regir el límite general.`))return;
    try{
      await window.fs.runTransaction(window.fs.db,async tx=>{
        const ref=this.numberBlocksRef(),snap=await tx.get(ref),limits=this.readTemporaryLimits(snap);
        delete limits[family];tx.set(ref,{...(snap.exists()?snap.data():{}),limitesTemporales:limits});
      });
    }catch(e){console.error(e);alert('No se pudo quitar el límite temporal.');}
  }
});
