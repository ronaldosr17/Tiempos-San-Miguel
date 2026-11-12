// Núcleo de la aplicación: estado, login, inactividad, suscripciones y navegación.
// Los demás módulos (js/modules/*.js) agregan sus métodos a este mismo objeto con Object.assign.

const App = {
  currentLines: [],
  currentRole: null,
  currentUid: null,
  tickets: [],
  movs: [],
  results: [],
  closures: [],
  cierres: [],
  maxBet: 20000,
  processedDraws: {},
  unsubscribes: [],

  init(){
    document.querySelectorAll('.nav-links button').forEach(b=>{
      b.addEventListener('click', ()=>App.switchTab(b.dataset.tab));
    });

    this.populateDrawSelect();
    this.populateResultDrawSelect();
    this.populateReportDrawSelect();
    this.populateNumerosDrawSelect();
    this.tickClock();
    setInterval(()=>this.tickClock(), 1000);

    ['mousemove','mousedown','keydown','touchstart','scroll'].forEach(evt=>{
      document.addEventListener(evt, ()=>this.resetInactivityTimer(), {passive:true});
    });

    const startAuthListener = () => {
      window.firebaseAuth.onChange(async (user) => {
        if(!user){ 
          this.currentRole = null; 
          this.currentUid = null;
          this.currentProfile = null;
          this.currentLines = [];
          this.renderLines();
          document.getElementById('buyerInput').value = '';
          document.getElementById('payResult').textContent = 'Ingresá un número de tiquete para buscarlo';
          document.getElementById('printArea').textContent = 'Seleccioná un tiquete para verlo aquí';
          this.clearSubscriptions();
          this.showLogin(); 
          return; 
        }
        try{
          const snap = await window.firebaseAuth.getUserDoc(user.uid);
          if(!snap.exists()){
            document.getElementById('loginError').textContent = 'Esta cuenta no tiene un perfil configurado en Firestore (falta el documento en /usuarios).';
            document.getElementById('loginError').classList.remove('hidden');
            window.firebaseAuth.signOut();
            return;
          }
          this.enterApp(user, snap.data());
        }catch(e){
          console.error('Error cargando perfil de usuario', e);
          document.getElementById('loginError').textContent = 'No se pudo cargar el perfil. Revisá tu conexión.';
          document.getElementById('loginError').classList.remove('hidden');
        }
      });
    };
    if(window.firebaseAuth) startAuthListener();
    else window.addEventListener('firebase-ready', startAuthListener, {once:true});
  },

  resetInactivityTimer(){
    clearTimeout(this.inactivityTimer);
    const appEl = document.getElementById('app');
    if(!appEl || appEl.classList.contains('hidden')) return; 
    this.inactivityTimer = setTimeout(()=>this.autoLogout(), INACTIVITY_LIMIT_MS);
  },

  autoLogout(){
    const appEl = document.getElementById('app');
    if(!appEl || appEl.classList.contains('hidden')) return;
    this.logout();
    alert('Tu sesión se cerró automáticamente por 5 minutos de inactividad.');
  },

  showLogin(){
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login').classList.remove('hidden');
  },

  login(){
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const pass = document.getElementById('loginPass').value;
    const err = document.getElementById('loginError');
    if(!window.firebaseAuth){ err.textContent = 'Firebase todavía no cargó, esperá un segundo.'; err.classList.remove('hidden'); return; }
    err.classList.add('hidden');
    window.firebaseAuth.signIn(email, pass)
      .catch(()=>{
        err.textContent = 'Correo o contraseña incorrectos.';
        err.classList.remove('hidden');
      });
  },

  logout(){
    clearTimeout(this.inactivityTimer);
    if(window.firebaseAuth) window.firebaseAuth.signOut();
  },

  async enterApp(user, profile){
    if(!['admin','vendedor','libreria','supermercado'].includes(profile.role) || (profile.role!=='admin' && !this.pointIdForProfile(profile))){
      await window.firebaseAuth.signOut();
      throw new Error('La cuenta necesita un rol y un punto de venta válidos.');
    }
    this.currentRole = profile.role;
    this.currentUid = user.uid;
    this.currentProfile = profile; 
    this.updateUserPointLabel();
    this.currentLines = []; this.renderLines();
    document.getElementById('login').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    this.applyRoleUI(this.currentRole);
    this.switchTab(this.currentRole==='admin' ? 'finanzas' : 'ventas');
    this.resetInactivityTimer();
    this.subscribeToFirestore();
  },

  clearSubscriptions() {
    this.unsubscribes.forEach(u => u());
    this.unsubscribes = [];
    this.tickets = []; this.movs = []; this.results = []; this.cierres = []; this.closures = [];
    this.points = {}; this.pointsReady = false;
    this.renderPointSelectors();
    this.numberBlocks = {}; this.numberBlocksReady = false;
    this.renderNumberBlocks();
  },

  subscribeToFirestore() {
    this.clearSubscriptions();
    const role = this.currentRole;
    const isAdmin = role === 'admin';
    this.subscribePoints();
    this.subscribeNumberBlocks();
    const ownerId = this.currentOwnerId();

    const unsubLim = window.fs.onSnapshot(window.fs.doc(window.fs.db, 'configuracion', 'limites'), (snap) => {
      if(snap.exists()){
        this.maxBet = snap.data().limiteGeneral || 20000;
      } else {
        this.maxBet = 20000;
      }
      const mbEl = document.getElementById('maxBetInput');
      if(mbEl) mbEl.value = this.maxBet;
    });
    this.unsubscribes.push(unsubLim);

    let qTiquetes = window.fs.collection(window.fs.db, 'tiquetes');
    if (!isAdmin) qTiquetes = window.fs.query(qTiquetes, window.fs.where('owner', '==', ownerId));
    const unsubTiq = window.fs.onSnapshot(qTiquetes, (snap) => {
      this.tickets = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      this.renderAll();
    });
    this.unsubscribes.push(unsubTiq);

    let qMovs = window.fs.collection(window.fs.db, 'movimientos');
    if (!isAdmin) qMovs = window.fs.query(qMovs, window.fs.where('owner', '==', ownerId));
    const unsubMov = window.fs.onSnapshot(qMovs, (snap) => {
      this.movs = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      this.renderAll();
    });
    this.unsubscribes.push(unsubMov);

    const unsubRes = window.fs.onSnapshot(window.fs.collection(window.fs.db, 'resultados'), (snap) => {
      this.results = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      this.renderResults();
      this.renderAll();
    });
    this.unsubscribes.push(unsubRes);

    let qCierres = window.fs.collection(window.fs.db, 'cierres');
    if (!isAdmin) qCierres = window.fs.query(qCierres, window.fs.where('owner', '==', ownerId));
    const unsubCierres = window.fs.onSnapshot(qCierres, (snap) => {
      this.cierres = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
      this.renderCierres();
    });
    this.unsubscribes.push(unsubCierres);

    const unsubClosures = window.fs.onSnapshot(
      window.fs.query(window.fs.collection(window.fs.db, 'configuracion'), window.fs.where('tipo', '==', 'cierre_manual')),
      (snap) => {
        this.closures = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
        this.renderClosures();
        this.populateDrawSelect();
        this.refreshDrawStatus();
      }
    );
    this.unsubscribes.push(unsubClosures);
  },

  async getNextSeq(type) {
    const docRef = window.fs.doc(window.fs.db, 'contadores', type);
    let newSeq = 1;
    await window.fs.runTransaction(window.fs.db, async (tx) => {
      const snap = await tx.get(docRef);
      if(snap.exists()){
        newSeq = (snap.data().val || 0) + 1;
      }
      tx.set(docRef, { val: newSeq }, { merge: true });
    });
    return newSeq;
  },

  applyRoleUI(role){
    const isAdmin = role === 'admin';
    document.getElementById('numberBlocksPanel').classList.toggle('hidden', !isAdmin);
    const ventasBtn = document.querySelector('.nav-links button[data-tab="ventas"]');
    if(ventasBtn) ventasBtn.style.display = isAdmin ? 'none' : '';
    const resBtn = document.querySelector('.nav-links button[data-tab="resultados"]');
    if(resBtn) resBtn.style.display = isAdmin ? '' : 'none';
    const usrBtn = document.getElementById('navUsuarios');
    if(usrBtn) usrBtn.classList.toggle('hidden', !isAdmin);

    const adminBox = document.getElementById('adminBreakdown');
    if(adminBox) adminBox.classList.toggle('hidden', !isAdmin);
    const limitsBox = document.getElementById('limitsPanel');
    if(limitsBox) limitsBox.classList.toggle('hidden', !isAdmin);
    const retiroBox = document.getElementById('retiroPanel');
    if(retiroBox) retiroBox.classList.toggle('hidden', !isAdmin);
    
    ['movOwnerField','gastoOwnerField','cierreOwnerField','repOwnerField'].forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.classList.toggle('hidden', !isAdmin);
    });
  },

  switchTab(tab){
    document.querySelectorAll('.nav-links button').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden', p.dataset.tab!==tab));
  },

  tickClock(){
    const now = getCRTime();
    const clockEl = document.getElementById('crClock');
    if(clockEl) clockEl.textContent = `${String(now.h).padStart(2,'0')}:${String(now.m).padStart(2,'0')}:${String(now.s).padStart(2,'0')}`;
    this.populateDrawSelect();
    this.refreshDrawStatus();
    this.processClosedDraws(now);
    this.renderNumberBlocks();
  },

  onlyDigits(el){
    const clean = el.value.replace(/\D+/g, '').slice(0, 2);
    if(el.value !== clean) el.value = clean;
  },

  renderAll(){
    this.renderFinances();
    this.renderReports();
    this.renderDashboardSummary();
  }
};

window.addEventListener('DOMContentLoaded', ()=>App.init());