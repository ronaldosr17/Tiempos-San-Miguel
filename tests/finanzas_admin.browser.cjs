const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
const root=path.resolve(__dirname,'..');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='review.local')return route.abort();
if(u.pathname==='/js/firebase.js')return route.fulfill({contentType:'application/javascript',body:'window.firebaseAuth={onChange:()=>{}};'});
const p=path.join(root,u.pathname==='/'?'index.html':u.pathname);return route.fulfill({contentType:p.endsWith('.js')?'application/javascript':p.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(p)});});
await page.goto('https://review.local');
const checks=await page.evaluate(async()=>{
const checks=[];const check=(value,msg)=>{if(!value)throw Error(msg);checks.push(msg);};
window.alert=message=>window.lastAlert=message;window.confirm=()=>true;
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.pointsReady=true;
App.points={pv_a:{nombre:'Librería Arenal',tipo:'Librería'},pv_b:{nombre:'Super Pérez',tipo:'Supermercado'}};
const today=crDateStr();
App.movs=[{_id:'a1',id:'M1',owner:'pv_a',amount:1000,type:'Ingreso',detail:'Venta',crDate:today},{_id:'a2',owner:'pv_a',amount:-100,type:'Gasto',detail:'=CMD("test")',crDate:today},{_id:'a3',owner:'pv_a',amount:50,type:'Abono',crDate:today},{_id:'a4',owner:'pv_a',amount:10000,type:'Ingreso',crDate:addDaysToDateStr(today,-30)},{_id:'b1',owner:'pv_b',amount:200,type:'Ingreso',crDate:today}];
App.applyRoleUI('admin');App.renderPointSelectors();App.renderFinances();
check(document.getElementById('adminFinanceShell').classList.contains('hidden')===false,'admin dashboard visible');
check(document.getElementById('financeLedgerSlot').contains(document.getElementById('movBody')),'existing ledger reused without duplicate forms');
check(document.querySelectorAll('#movBody').length===1&&document.querySelectorAll('#balanceFull').length===1,'each financial control exists exactly once');
App.switchFinanceView('movimientos');check(!document.querySelector('[data-finance-panel="movimientos"]').classList.contains('hidden')&&document.querySelector('[data-finance-panel="resumen"]').classList.contains('hidden'),'finance sections switch independently');
document.getElementById('movOwner').value='pv_a';App.setFinancePeriod('hoy');
check(App.financeFilteredMovs.length===3&&document.getElementById('balanceFull').textContent===money(10950),'period filters ledger while current balance retains full history');
check(document.getElementById('financePeriodMetrics').textContent.includes(money(900)),'period margin excludes cash deposits');
App.tickets=[{owner:'pv_a',crDate:today,premiado:true,paid:false,premio:500}];App.renderFinances();
check(document.getElementById('financeNotices').textContent.includes(money(500))&&document.getElementById('balanceFull').textContent===money(10950),'unpaid-prize alert does not subtract unpaid amounts from current balance');
App.tickets=[];
check(!App.financeCSV().includes('10000.00')&&App.financeCSV().includes("'=CMD"),'CSV respects filters and escapes spreadsheet formulas');
App.setFinancePeriod('todo');check(App.financeFilteredMovs.length===4,'all-history period includes older records only for selected point');
document.getElementById('financeFrom').value='2099-01-02';document.getElementById('financeTo').value='2099-01-01';App.onFinanceDatesChange();check(App.financeFilteredMovs.length===0&&!document.getElementById('financeRangeError').classList.contains('hidden'),'invalid date interval reports error and yields no misleading rows');
App.currentRole='vendedor';App.currentProfile={role:'vendedor',puntoVentaId:'pv_a',name:'Vendedor'};App.applyRoleUI('vendedor');
check(document.getElementById('adminFinanceShell').classList.contains('hidden')&&!document.getElementById('financeLedgerSlot').contains(document.getElementById('movBody')),'seller retains original layout and no admin shell');
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.applyRoleUI('admin');App.renderPointSelectors();App.setFinancePeriod('hoy');
// All database operations below are isolated in this in-memory fake Firebase.
let registry={puntos:structuredClone(App.points)};let writes=0,batchCalls=0,deletes=[],failBatchAt=null,queries=[];
let expectedOwner='pv_a',changeOwnerAfterQuery=false;
const records={tiquetes:[],movimientos:[],cierres:[]};
const record=(name,id,owner,extra={})=>({id,ref:{name,id},data:()=>({owner,...extra})});
for(const name of Object.keys(records)){records[name].push(record(name,'foreign_'+name,'pv_b'));}
const snap=data=>({exists:()=>data!==undefined,data:()=>structuredClone(data)});
const readQuery=q=>{
  queries.push(q);if(!q.constraints.some(c=>c.field==='owner'&&c.value===expectedOwner))throw Error('Unscoped query');
  let docs=records[q.name].filter(d=>d.data().owner===q.constraints.find(c=>c.field==='owner').value).sort((a,b)=>a.id.localeCompare(b.id));
  const after=q.constraints.find(c=>c.kind==='after');if(after)docs=docs.filter(d=>d.id.localeCompare(after.doc.id)>0);
  const limit=q.constraints.find(c=>c.kind==='limit');if(limit)docs=docs.slice(0,limit.value);
  return {docs,empty:docs.length===0,size:docs.length};
};
window.fs={db:{},doc:(first,name,id)=>typeof name==='string'?{name,id}:{name:first.name,id:'new-record'},collection:(_,name)=>({name}),where:(field,op,value)=>({field,op,value}),limit:value=>({kind:'limit',value}),orderBy:field=>({kind:'order',field}),documentId:()=> '__name__',startAfter:doc=>({kind:'after',doc}),query:(ref,...constraints)=>({name:ref.name,constraints}),
getCountFromServer:async q=>({data:()=>({count:readQuery(q).size})}),getDocsFromServer:async q=>{const snapshot=readQuery(q);if(changeOwnerAfterQuery&&snapshot.docs.length&&q.name==='tiquetes'){changeOwnerAfterQuery=false;const id=snapshot.docs[0].id;records.tiquetes=records.tiquetes.map(d=>d.id===id?record('tiquetes',id,'pv_b'):d);}return snapshot;},
runTransaction:async(_,fn)=>{let next;const pending=[];const result=await fn({get:async ref=>snap(ref.id==='puntos_venta'?registry:records[ref.name]?.find(d=>d.id===ref.id)?.data()),set:(ref,value)=>{if(ref.id!=='puntos_venta')throw Error('Unexpected write');next=structuredClone(value);},delete:ref=>pending.push(ref)});
if(pending.length){batchCalls++;if(failBatchAt===batchCalls){failBatchAt=null;throw Error('Simulated disconnect');}for(const ref of pending){deletes.push(ref);records[ref.name]=records[ref.name].filter(d=>d.id!==ref.id);}}
if(next){registry=next;writes++;}return result;}};

App.renderPointSelectors();document.getElementById('pointManageId').value='pv_a';App.renderPointManagement();
records.tiquetes.push(record('tiquetes','a-ticket','pv_a'));records.movimientos.push(record('movimientos','a-mov','pv_a'));records.cierres.push(record('cierres','a-close','pv_a'));
const countMethod=window.fs.getCountFromServer;window.fs.getCountFromServer=async()=>{throw Error('Simulated permission denied');};
await App.openPointRemoval('archive');document.getElementById('pointRemovalText').value='Delete';await App.confirmPointRemoval();
check(!App.pendingPointRemoval.ready&&writes===0&&document.getElementById('pointRemovalSubmit').disabled,'server count permission failure prevents any retirement or deletion');App.closePointRemoval();window.fs.getCountFromServer=countMethod;
const opening=App.openPointRemoval('archive');document.getElementById('pointRemovalText').value='Delete';await App.confirmPointRemoval();check(writes===0,'cannot confirm before server preview finishes');await opening;
check(document.getElementById('pointRemovalDescription').textContent.includes('Librería Arenal')&&document.getElementById('pointRemovalCounts').textContent.includes('1 tiquetes'),'confirmation identifies one point and server-side record counts');
for(const text of ['', 'delete','Delete ']){document.getElementById('pointRemovalText').value=text;App.updatePointRemovalConfirmation();await App.confirmPointRemoval();check(writes===0&&document.getElementById('pointRemovalSubmit').disabled,'confirmation rejects '+JSON.stringify(text));}
document.getElementById('pointRemovalText').value='Delete';App.updatePointRemovalConfirmation();await App.confirmPointRemoval();
check(registry.puntos.pv_a.estado==='archivado'&&deletes.length===0&&records.movimientos.some(d=>d.id==='a-mov'),'archive preserves all accounting records');
check(![...document.getElementById('newUsrPoint').options].some(o=>o.value==='pv_a')&&[...document.getElementById('movOwner').options].some(o=>o.value==='pv_a'),'archived point excluded from new assignments but available in historical filters');
check(!App.pointIsActive('pv_a'),'archived point cannot operate');
document.getElementById('pointManageId').value='pv_a';await App.restoreManagedPoint();check(registry.puntos.pv_a.estado==='activo'&&records.tiquetes.some(d=>d.id==='a-ticket'),'reactivation restores access without recreating history');
// Full deletion larger than the Firestore batch size, with a simulated failure.
records.tiquetes=records.tiquetes.filter(d=>d.data().owner!=='pv_a');records.movimientos=records.movimientos.filter(d=>d.data().owner!=='pv_a');
for(let i=0;i<405;i++)records.tiquetes.push(record('tiquetes','a'+String(i).padStart(4,'0'),'pv_a'));
for(let i=0;i<402;i++)records.movimientos.push(record('movimientos','a'+String(i).padStart(4,'0'),'pv_a'));
let backup;App.downloadFile=(name,content)=>{backup={name,data:JSON.parse(content)};};
await App.openPointRemoval('purge');await App.downloadPointBackup();
check(backup.data.puntoId==='pv_a'&&backup.data.registros.tiquetes.length===405&&backup.data.registros.movimientos.length===402&&Object.values(backup.data.registros).flat().every(d=>d.data.owner==='pv_a'),'backup pages through all selected point records and excludes other businesses');
failBatchAt=2;document.getElementById('pointRemovalText').value='Delete';await App.confirmPointRemoval();
check(registry.puntos.pv_a.estado==='eliminando'&&deletes.length===400,'partial failure keeps point frozen and reports resumable operation');
check(records.tiquetes.filter(d=>d.data().owner==='pv_a').length===5&&document.getElementById('pointRemovalProgress').textContent.includes('Simulated disconnect'),'partial progress is preserved without claiming completion');
check(Object.values(records).every(docs=>docs.some(d=>d.data().owner==='pv_b')),'other point records survive partial deletion');
App.closePointRemoval();document.getElementById('pointManageId').value='pv_a';await App.openPointRemoval('purge');document.getElementById('pointRemovalText').value='Delete';
const first=App.confirmPointRemoval();const second=App.confirmPointRemoval();await Promise.all([first,second]);
check(registry.puntos.pv_a.estado==='eliminado'&&Object.values(records).every(docs=>docs.every(d=>d.data().owner==='pv_b')),'resumed deletion removes only selected accounting data and completes tombstone');
check(deletes.length===808&&new Set(deletes.map(r=>r.name+'/'+r.id)).size===808,'double confirmation does not duplicate deletion and batches stay scoped');
check(registry.puntos.pv_b.estado===undefined&&registry.puntos.pv_b.nombre==='Super Pérez','other catalog entry remains unchanged');
check(queries.every(q=>q.constraints.some(c=>c.field==='owner'&&c.value==='pv_a')),'every backup, count and deletion query is scoped to selected owner');
try{await App.setPointState('pv_a','activo');throw Error('should reject');}catch(e){check(e.message.includes('Solo se pueden reactivar'),'permanently deleted ID cannot be reactivated');}
const beforeWrites=writes,beforeDeletes=deletes.length;App.currentRole='vendedor';App.currentProfile={role:'vendedor',puntoVentaId:'pv_a',name:'Vendedor'};App.pointsReady=true;
try{await App.purgePointRecords('pv_b','Delete');}catch(e){}await App.openPointRemoval('purge');
check(writes===beforeWrites&&deletes.length===beforeDeletes,'seller cannot initiate or execute point deletion');
let logouts=0;App.logout=()=>logouts++;App.currentLines=[{num:'05',amt:100,rev:0}];App.pointAccessClosed=false;App.enforcePointAccess();App.enforcePointAccess();
check(logouts===1&&App.currentLines.length===0,'seller at deleted point is signed out once and draft is cleared');
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.pointsReady=true;
registry.puntos.pv_race={nombre:'Punto prueba',tipo:'Otro'};App.points=registry.puntos;expectedOwner='pv_race';records.tiquetes.push(record('tiquetes','race-owner','pv_race'));changeOwnerAfterQuery=true;const deletesBeforeRace=deletes.length;
try{await App.purgePointRecords('pv_race','Delete');throw Error('should fail');}catch(error){check(error.message.includes('propietario')&&deletes.length===deletesBeforeRace&&records.tiquetes.some(d=>d.id==='race-owner'&&d.data().owner==='pv_b'),'transaction rechecks ownership and never deletes a record reassigned after query');}
expectedOwner='libreria';records.movimientos.push(record('movimientos','legacy-mov','libreria'));await App.purgePointRecords('libreria','Delete');
check(App.allPoints().libreria.estado==='eliminado'&&!App.pointIsActive('libreria')&&App.pointIsActive('supermercado'),'legacy point tombstone prevents default point from reappearing after deletion');
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.pointsReady=true;App.pointAccessClosed=false;App.applyRoleUI('admin');App.renderPointSelectors();App.switchFinanceView('resumen');App.setFinancePeriod('hoy');App.renderAll();
document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');App.switchTab('finanzas');
return checks;
});
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,checks,startupErrors:errors},null,2));
await page.setViewportSize({width:1440,height:1000});assert.equal(await page.locator('#adminFinanceShell').isVisible(),true);
await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#financePeriod').isVisible(),true);
await browser.close();})();
