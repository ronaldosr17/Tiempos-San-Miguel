// Identidad de caja independiente del rol. Los IDs históricos no se cambian.
Object.assign(App, {
  points: {},
  pointsReady: false,

  defaultPoints(){
    return {libreria:{nombre:'Librería', tipo:'Librería'}, supermercado:{nombre:'Supermercado', tipo:'Supermercado'}};
  },

  validPointId(id){ return typeof id === 'string' && /^(libreria|supermercado|pv_[a-z0-9-]{1,60})$/.test(id); },

  pointIdForProfile(profile){
    if(!profile || profile.role === 'admin') return null;
    if(!['vendedor','libreria','supermercado'].includes(profile.role)) return null;
    if(profile.puntoVentaId != null) return this.validPointId(profile.puntoVentaId) ? profile.puntoVentaId : null;
    return ['libreria','supermercado'].includes(profile.role) ? profile.role : null;
  },

  currentOwnerId(){
    if(this.currentRole === 'admin') return null;
    return this.pointIdForProfile(this.currentProfile) ||
      (['libreria','supermercado'].includes(this.currentRole) ? this.currentRole : null);
  },

  allPoints(){ return {...this.defaultPoints(), ...this.points}; },
  pointName(id){ return this.allPoints()[id]?.nombre || id || 'Sin punto de venta'; },
  pointRef(){ return window.fs.doc(window.fs.db, 'configuracion', 'puntos_venta'); },

  readPoints(snap){
    const points = snap.exists() ? (snap.data().puntos || {}) : {};
    if(!points || typeof points !== 'object' || Array.isArray(points) || Object.entries(points).some(([id,p])=>
      !this.validPointId(id) || !p || typeof p.nombre !== 'string' || !p.nombre.trim() || p.nombre.length>80 || typeof p.tipo !== 'string' || p.tipo.length>50 || (p.estado!=null && !['activo','archivado','eliminando','eliminado'].includes(p.estado)))){
      throw new Error('El catálogo de puntos de venta no es válido.');
    }
    return points;
  },

  subscribePoints(){
    this.renderPointSelectors();
    const unsub = window.fs.onSnapshot(this.pointRef(), {includeMetadataChanges:true}, snap=>{
      try { this.points = this.readPoints(snap); this.pointsReady = !snap.metadata.fromCache; }
      catch(e){ console.error(e); this.pointsReady = false; }
      this.enforcePointAccess();
      this.renderPointSelectors();
      this.updateUserPointLabel();
      this.renderAll();
      this.renderCierres();
    }, error=>{
      console.error('No se pudo cargar el catálogo de puntos de venta:', error);
      this.pointsReady = false;
      this.renderPointSelectors();
    });
    this.unsubscribes.push(unsub);
  },

  updateUserPointLabel(){
    const element = document.getElementById('userName');
    if(element && this.currentProfile){
      element.textContent = `${this.currentProfile.name} (${this.currentRole==='admin' ? 'Administración' : this.pointName(this.currentOwnerId())})`;
    }
  },

  renderPointSelectors(){
    const options = Object.entries(this.allPoints()).sort((a,b)=>a[1].nombre.localeCompare(b[1].nombre,'es'));
    ['movOwner','gastoOwner','cierreOwner','retiroOwner','newUsrPoint','pointEditId','repOwner','pointManageId'].forEach(id=>{
      const select = document.getElementById(id);
      if(!select) return;
      const previous = select.value;
      const placeholder = id==='pointEditId' ? 'Crear un punto nuevo' : ['movOwner','repOwner'].includes(id) ? 'Todos los puntos de venta' : 'Elegí un punto de venta';
      const items = [new Option(placeholder,'')];
      options.forEach(([key,point])=>{
        const state=point.estado||'activo';
        const history=['movOwner','repOwner'].includes(id);
        const manage=id==='pointManageId';
        const edit=id==='pointEditId';
        if(!history && !manage && !edit && state!=='activo')return;
        if((manage || edit) && state==='eliminado')return;
        if(edit && state==='eliminando')return;
        items.push(new Option(point.nombre+(state!=='activo' ? ' · '+state : ''),key));
      });
      // Mantener visible cualquier caja histórica no presente en el catálogo.
      if(['movOwner','repOwner'].includes(id)){
        const records = id==='movOwner' ? this.movs : this.tickets;
        [...new Set(records.map(r=>r.owner))].filter(key=>key && !this.allPoints()[key]).sort().forEach(key=>items.push(new Option(key,key)));
      }
      select.replaceChildren(...items);
      if(items.some(item=>item.value===previous)) select.value = previous;
      else if(id==='pointEditId' && previous) this.onPointEditChange();
    });
    const status = document.getElementById('pointsStatus');
    if(status){ status.textContent = this.pointsReady ? '' : 'Esperando conexión y permisos para gestionar puntos de venta.'; }
    this.onNewUserRoleChange();
    this.renderPointManagement();
  },

  onNewUserRoleChange(){
    const role = document.getElementById('newUsrRole');
    const field = document.getElementById('newUsrPointField');
    if(role && field) field.classList.toggle('hidden', role.value==='admin');
  },

  onPointEditChange(){
    const id = document.getElementById('pointEditId').value;
    const point = this.allPoints()[id];
    document.getElementById('pointName').value = point?.nombre || '';
    document.getElementById('pointType').value = point?.tipo || '';
    document.getElementById('savePointButton').textContent = id ? 'Guardar nombre y tipo' : 'Crear punto de venta';
  },

  async savePoint(){
    if(this.currentRole !== 'admin') return;
    if(!this.pointsReady){ alert('Esperá a que cargue el catálogo de puntos de venta.'); return; }
    const name = document.getElementById('pointName').value.trim();
    const type = document.getElementById('pointType').value.trim() || 'Otro';
    const existingId = document.getElementById('pointEditId').value;
    if(!name || name.length>80 || type.length>50){ alert('Ingresá un nombre de hasta 80 caracteres y un tipo de hasta 50.'); return; }
    if(existingId && !this.allPoints()[existingId]){ alert('Punto de venta inválido.'); return; }
    const id = existingId || 'pv_'+crypto.randomUUID();
    const button = document.getElementById('savePointButton'); button.disabled = true;
    try {
      await window.fs.runTransaction(window.fs.db, async tx=>{
        const ref = this.pointRef();
        const points = this.readPoints(await tx.get(ref));
        const all = {...this.defaultPoints(), ...points};
        if(existingId && ['eliminando','eliminado'].includes(all[id]?.estado)) throw new Error('Este punto no se puede editar durante o después del borrado.');
        if(Object.entries(all).some(([key,p])=>key!==id && p.estado!=='eliminado' && p.nombre.toLocaleLowerCase('es')===name.toLocaleLowerCase('es'))){
          throw new Error('Ya existe un punto de venta con ese nombre.');
        }
        if(!existingId && all[id]) throw new Error('No se pudo generar el identificador. Intentá otra vez.');
        points[id] = {...(all[id]||{}), nombre:name, tipo:type};
        tx.set(ref, {tipo:'puntos_venta', puntos:points});
      });
      document.getElementById('pointEditId').value = '';
      this.onPointEditChange();
      alert(existingId ? 'Nombre actualizado. La caja y el historial se conservan.' : 'Punto creado. Su caja comienza en ₡0; ahora podés asignarle vendedores.');
    } catch(e){ console.error(e); alert(e.message || 'No se pudo guardar el punto de venta.'); }
    finally { button.disabled = false; }
  },

  financeOwner(fieldId){
    const id = this.currentRole==='admin' ? document.getElementById(fieldId).value : this.currentOwnerId();
    if(!id || !this.pointsReady || !this.pointIsActive(id)){
      alert('Elegí un punto de venta válido y verificá la conexión.');
      return null;
    }
    return id;
  },

  selectedFinanceOwner(){
    return this.currentRole==='admin' ? document.getElementById('movOwner').value : this.currentOwnerId();
  },

  pointBalance(id){ return this.movs.filter(m=>m.owner===id).reduce((sum,m)=>sum+m.amount,0); },

  renderPointBalances(){
    const container = document.getElementById('pointBalances');
    if(!container) return;
    container.replaceChildren();
    if(this.currentRole!=='admin') return;
    const ids = [...new Set([...Object.keys(this.allPoints()), ...this.movs.map(m=>m.owner).filter(Boolean)])];
    ids.sort((a,b)=>this.pointName(a).localeCompare(this.pointName(b),'es')).forEach(id=>{
      const card = document.createElement('div'); card.className = 'module';
      const name = document.createElement('div'); name.className='m-label'; name.textContent=this.pointName(id);
      const amount = document.createElement('div'); amount.className='m-value mono';
      const balance = this.pointBalance(id); amount.textContent=money(balance); amount.style.color=balance<0 ? 'var(--red)' : 'var(--green)';
      card.append(name,amount);
      const state=this.allPoints()[id]?.estado;
      if(state && state!=='activo'){const tag=document.createElement('div');tag.className='point-state';tag.textContent=state;card.appendChild(tag);}
      if(state==='eliminado' && !this.movs.some(m=>m.owner===id)) return;
      container.appendChild(card);
    });
  }
});
