// Retiro y eliminación explícita por owner; jamás se consultan ni borran
// colecciones completas. La cuenta de Authentication no se elimina.
Object.assign(App, {
  pointRemovalCollections: ['tiquetes','movimientos','cierres'],
  pendingPointRemoval: null,
  pointRemovalBusy: false,
  pointBackupBusy: false,

  pointIsActive(id, points=this.allPoints()){
    return !!points[id] && (!points[id].estado || points[id].estado==='activo');
  },

  async assertPointActive(tx,id){
    if(!this.validPointId(id))throw new Error('Punto de venta inválido.');
    const stored=this.readPoints(await tx.get(this.pointRef()));
    if(!this.pointIsActive(id,{...this.defaultPoints(),...stored}))throw new Error('El punto de venta está retirado o en eliminación.');
  },

  enforcePointAccess(){
    if(!this.pointsReady || !this.currentRole || this.currentRole==='admin' || this.pointAccessClosed)return;
    if(this.pointIsActive(this.currentOwnerId()))return;
    this.pointAccessClosed=true;
    this.currentLines=[];this.renderLines();
    this.logout();
    alert('Este punto de venta fue retirado o está en eliminación. Contactá al administrador.');
  },

  async addPointRecord(collectionName,data){
    if(!['movimientos','cierres'].includes(collectionName) || !this.currentRole ||
       (this.currentRole!=='admin' && data.owner!==this.currentOwnerId()))throw new Error('Operación de caja no permitida.');
    const ref=window.fs.doc(window.fs.collection(window.fs.db,collectionName));
    await window.fs.runTransaction(window.fs.db,async tx=>{
      await this.assertPointActive(tx,data.owner);
      tx.set(ref,data);
    });
    return ref;
  },

  renderPointManagement(){
    const select=document.getElementById('pointManageId');
    if(!select)return;
    const id=select.value,point=this.allPoints()[id],state=point?.estado||'activo';
    const ready=this.currentRole==='admin' && this.pointsReady && !!point;
    document.getElementById('pointManageStatus').textContent=!point ? 'Elegí un punto para administrar.' :
      state==='eliminando' ? 'Borrado incompleto. El punto está cerrado y podés reanudar la eliminación.' :
      state==='archivado' ? 'Punto retirado. Su historial y saldo se conservan.' :
      state==='eliminado' ? 'Punto eliminado.' : 'Punto activo. Las acciones se limitan a este punto.';
    document.getElementById('archivePointButton').disabled=!ready || state!=='activo';
    document.getElementById('restorePointButton').classList.toggle('hidden',state!=='archivado');
    document.getElementById('restorePointButton').disabled=!ready;
    document.getElementById('purgePointButton').disabled=!ready || state==='eliminado';
    document.getElementById('purgePointButton').textContent=state==='eliminando' ? 'Reanudar eliminación de datos' : 'Eliminar punto y sus datos';
  },

  pointRecordsQuery(name,id,...constraints){
    if(!this.pointRemovalCollections.includes(name) || !this.validPointId(id))throw new Error('Consulta de punto no permitida.');
    return window.fs.query(window.fs.collection(window.fs.db,name),window.fs.where('owner','==',id),...constraints);
  },

  async countPointRecords(id){
    const counts=await Promise.all(this.pointRemovalCollections.map(async name=>{
      const snapshot=await window.fs.getCountFromServer(this.pointRecordsQuery(name,id));
      return [name,snapshot.data().count];
    }));
    return Object.fromEntries(counts);
  },

  async openPointRemoval(action){
    if(this.currentRole!=='admin' || !this.pointsReady || !['archive','purge'].includes(action) || this.pointRemovalBusy)return;
    const id=document.getElementById('pointManageId').value;
    const point=this.allPoints()[id];
    if(!point || !this.validPointId(id) || point.estado==='eliminado')return;
    if(action==='archive' && !this.pointIsActive(id))return;
    const pending={id,name:point.nombre,action,ready:false};this.pendingPointRemoval=pending;
    document.getElementById('pointRemovalTitle').textContent=action==='archive' ? 'Retirar punto de venta' : 'Eliminar punto y datos';
    document.getElementById('pointRemovalDescription').textContent=action==='archive' ?
      `Retirar ${point.nombre} impedirá nuevas operaciones. Su balance, tiquetes, movimientos y cierres se conservarán.` :
      `Se eliminarán permanentemente todos los tiquetes, movimientos y cierres de ${point.nombre}. El saldo general se recalculará sin esos movimientos. Esta acción no se puede deshacer.`;
    document.getElementById('pointRemovalText').value='';
    document.getElementById('pointRemovalCounts').textContent='Consultando registros en Firebase…';
    document.getElementById('pointRemovalProgress').textContent='';
    this.updatePointRemovalConfirmation();
    const dialog=document.getElementById('pointRemovalDialog');
    dialog.oncancel=event=>{if(this.pointRemovalBusy || this.pointBackupBusy)event.preventDefault();else this.pendingPointRemoval=null;};
    if(!dialog.open)dialog.showModal();
    try{
      const counts=await this.countPointRecords(id);
      if(this.pendingPointRemoval!==pending)return;
      pending.counts=counts;pending.ready=true;
      document.getElementById('pointRemovalCounts').textContent=`${counts.tiquetes} tiquetes · ${counts.movimientos} movimientos · ${counts.cierres} cierres.`;
    }catch(error){
      console.error(error);
      if(this.pendingPointRemoval!==pending)return;
      document.getElementById('pointRemovalCounts').textContent='No se pudieron verificar los registros. Revisá la conexión y los permisos antes de continuar.';
    }
    this.updatePointRemovalConfirmation();
  },

  updatePointRemovalConfirmation(){
    const busy=this.pointRemovalBusy||this.pointBackupBusy;
    const ready=this.currentRole==='admin' && !!this.pendingPointRemoval?.ready;
    document.getElementById('pointRemovalSubmit').disabled=busy || !ready || document.getElementById('pointRemovalText').value!=='Delete';
    document.getElementById('pointRemovalCancel').disabled=busy;
    document.getElementById('pointRemovalBackup').disabled=busy || !ready;
    document.getElementById('pointRemovalText').disabled=busy;
  },

  closePointRemoval(){
    if(this.pointRemovalBusy||this.pointBackupBusy)return;
    this.pendingPointRemoval=null;
    document.getElementById('pointRemovalDialog').close();
  },

  async setPointState(id,state,confirmation){
    if(this.currentRole!=='admin' || !this.validPointId(id) || !['activo','archivado','eliminando','eliminado'].includes(state))throw new Error('Operación no permitida.');
    if(state!=='activo' && confirmation!=='Delete')throw new Error('Escribí exactamente Delete para confirmar.');
    let changed;
    await window.fs.runTransaction(window.fs.db,async tx=>{
      const ref=this.pointRef();const stored=this.readPoints(await tx.get(ref));
      const points={...this.defaultPoints(),...stored};const point=points[id];
      if(!point)throw new Error('El punto de venta ya no existe.');
      const before=point.estado||'activo';
      if(state==='activo' && before!=='archivado')throw new Error('Solo se pueden reactivar puntos retirados.');
      if(state==='archivado' && before!=='activo')throw new Error('El estado del punto cambió. Volvé a revisarlo.');
      if(state==='eliminando' && !['activo','archivado','eliminando'].includes(before))throw new Error('El punto ya fue eliminado.');
      if(state==='eliminado' && before!=='eliminando')throw new Error('El punto no está en proceso de eliminación.');
      changed={...point,estado:state,actualizadoEn:new Date().toISOString()};
      stored[id]=changed;tx.set(ref,{tipo:'puntos_venta',puntos:stored});
    });
    this.points[id]=changed;
    this.renderPointSelectors();this.renderAll();
  },

  async restoreManagedPoint(){
    if(this.currentRole!=='admin' || !this.pointsReady)return;
    const id=document.getElementById('pointManageId').value;
    try{await this.setPointState(id,'activo');}
    catch(error){console.error(error);alert(error.message);}
  },

  async purgePointRecords(id,confirmation){
    if(this.currentRole!=='admin' || confirmation!=='Delete' || !this.validPointId(id))throw new Error('Confirmación de borrado inválida.');
    const actor=this.currentUid;
    await this.setPointState(id,'eliminando',confirmation);
    const deleted={tiquetes:0,movimientos:0,cierres:0};
    for(const name of this.pointRemovalCollections){
      let rounds=0;
      while(true){
        if(this.currentRole!=='admin' || this.currentUid!==actor)throw new Error('La sesión cambió; el borrado quedó pendiente.');
        if(++rounds>1000)throw new Error('Se alcanzó el límite de esta sesión. Reanudá el borrado para continuar.');
        const snapshot=await window.fs.getDocsFromServer(this.pointRecordsQuery(name,id,window.fs.limit(400)));
        if(snapshot.empty)break;
        if(snapshot.docs.some(doc=>doc.data().owner!==id))throw new Error('Se detectó un registro ajeno al punto; se detuvo el borrado.');
        const count=await window.fs.runTransaction(window.fs.db,async tx=>{
          const stored=this.readPoints(await tx.get(this.pointRef()));
          if(stored[id]?.estado!=='eliminando')throw new Error('Cambió el estado del punto; se detuvo el borrado.');
          const fresh=await Promise.all(snapshot.docs.map(doc=>tx.get(doc.ref)));
          if(fresh.some(doc=>doc.exists() && doc.data().owner!==id))throw new Error('Un registro cambió de propietario; se detuvo el borrado.');
          let count=0;
          fresh.forEach((doc,index)=>{if(doc.exists()){tx.delete(snapshot.docs[index].ref);count++;}});
          return count;
        });
        deleted[name]+=count;
        document.getElementById('pointRemovalProgress').textContent=`Eliminados: ${deleted.tiquetes} tiquetes, ${deleted.movimientos} movimientos, ${deleted.cierres} cierres. No cierres esta ventana.`;
      }
    }
    const remaining=await this.countPointRecords(id);
    if(Object.values(remaining).some(count=>count!==0))throw new Error('Aún quedan registros del punto. Reanudá el borrado.');
    await this.setPointState(id,'eliminado',confirmation);
    // Evitar mostrar los documentos ya eliminados hasta que lleguen los snapshots.
    this.tickets=this.tickets.filter(t=>t.owner!==id);
    this.movs=this.movs.filter(m=>m.owner!==id);
    this.cierres=this.cierres.filter(c=>c.owner!==id);
    this.renderPointSelectors();this.renderAll();
    return deleted;
  },

  async confirmPointRemoval(){
    const pending=this.pendingPointRemoval;
    const confirmation=document.getElementById('pointRemovalText').value;
    if(this.currentRole!=='admin' || !pending?.ready || this.pointRemovalBusy || this.pointBackupBusy || confirmation!=='Delete')return;
    this.pointRemovalBusy=true;this.updatePointRemovalConfirmation();
    try{
      if(pending.action==='archive')await this.setPointState(pending.id,'archivado',confirmation);
      else await this.purgePointRecords(pending.id,confirmation);
      this.pointRemovalBusy=false;this.closePointRemoval();
      alert(pending.action==='archive' ? 'Punto retirado. Se conservó todo su historial.' : 'Se eliminaron los datos contables del punto elegido.');
    }catch(error){
      console.error(error);
      document.getElementById('pointRemovalProgress').textContent=error.message+' Si el borrado había comenzado, el punto queda cerrado; podés reanudarlo.';
    }finally{this.pointRemovalBusy=false;this.updatePointRemovalConfirmation();}
  },

  async downloadPointBackup(){
    const pending=this.pendingPointRemoval;
    if(this.currentRole!=='admin' || !pending?.ready || this.pointRemovalBusy || this.pointBackupBusy)return;
    this.pointBackupBusy=true;this.updatePointRemovalConfirmation();
    try{
      const records={};
      for(const name of this.pointRemovalCollections){
        records[name]=[];let last=null;
        while(true){
          const constraints=[window.fs.orderBy(window.fs.documentId()),window.fs.limit(400)];
          if(last)constraints.push(window.fs.startAfter(last));
          const snapshot=await window.fs.getDocsFromServer(this.pointRecordsQuery(name,pending.id,...constraints));
          if(snapshot.empty)break;
          if(snapshot.docs.some(doc=>doc.data().owner!==pending.id))throw new Error('Registro ajeno al punto en el respaldo.');
          snapshot.docs.forEach(doc=>records[name].push({id:doc.id,data:doc.data()}));
          last=snapshot.docs.at(-1);
        }
      }
      const backup={version:1,exportadoEn:new Date().toISOString(),puntoId:pending.id,punto:this.allPoints()[pending.id],registros:records};
      this.downloadFile('respaldo-'+pending.id+'-'+crDateStr()+'.json',JSON.stringify(backup,null,2),'application/json');
      document.getElementById('pointRemovalProgress').textContent='Respaldo descargado. Conservá el archivo antes de borrar. Es una exportación de los datos leídos en este momento.';
    }catch(error){console.error(error);document.getElementById('pointRemovalProgress').textContent='No se pudo descargar el respaldo: '+error.message;}
    finally{this.pointBackupBusy=false;this.updatePointRemovalConfirmation();}
  }
});
