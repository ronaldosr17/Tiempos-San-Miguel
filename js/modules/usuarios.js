// Usuarios: creación de cuentas (admin)

Object.assign(App, {
  async createUserAccount(){
    if(this.currentRole !== 'admin') return;
    const email = document.getElementById('newUsrEmail').value.trim();
    const pass = document.getElementById('newUsrPass').value;
    const name = document.getElementById('newUsrName').value.trim();
    const role = document.getElementById('newUsrRole').value;
    
    const puntoVentaId = role==='admin' ? null : document.getElementById('newUsrPoint').value;
    if(!['admin','vendedor'].includes(role)){ alert('Rol inválido.'); return; }
    if(role==='vendedor' && (!this.pointsReady || !this.allPoints()[puntoVentaId])){ alert('Elegí un punto de venta y esperá a que se verifique el catálogo.'); return; }
    if(!email || !pass || !name){ alert('Completá todos los campos.'); return; }
    if(pass.length < 6){ alert('La contraseña debe tener al menos 6 caracteres.'); return; }

    try {
      await window.createNewUserAccount(email, pass, name, role, puntoVentaId);
      alert(`Usuario ${name} creado con éxito.`);
      document.getElementById('newUsrEmail').value = '';
      document.getElementById('newUsrPass').value = '';
      document.getElementById('newUsrName').value = '';
    } catch(e){
      console.error(e);
      alert('Error al crear usuario: ' + e.message);
    }
  }
});