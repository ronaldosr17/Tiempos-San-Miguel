// Usuarios: creación de cuentas (admin)

Object.assign(App, {
  async createUserAccount(){
    if(this.currentRole !== 'admin') return;
    const email = document.getElementById('newUsrEmail').value.trim();
    const pass = document.getElementById('newUsrPass').value;
    const name = document.getElementById('newUsrName').value.trim();
    const role = document.getElementById('newUsrRole').value;
    
    if(!email || !pass || !name){ alert('Completá todos los campos.'); return; }
    if(pass.length < 6){ alert('La contraseña debe tener al menos 6 caracteres.'); return; }

    try {
      await window.createNewUserAccount(email, pass, name, role);
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