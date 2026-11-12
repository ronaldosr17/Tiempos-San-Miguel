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
window.alert=msg=>window.lastAlert=msg;window.confirm=()=>true;
getCRTime=()=>({h:8,m:0,s:0});
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administración'};
let registry={};let writes=[],updates=[],sequence=0,queries=[];
const legacyMovs=[{_id:'L1',owner:'libreria',type:'Ingreso',amount:1000,crDate:crDateStr()},{_id:'L2',owner:'libreria',type:'Pago',amount:-2100,crDate:crDateStr()},{_id:'S1',owner:'supermercado',type:'Ingreso',amount:10000,crDate:crDateStr()},{_id:'S2',owner:'supermercado',type:'Retiro',amount:-20100,crDate:crDateStr()}];
const initial=JSON.stringify(legacyMovs);App.movs=legacyMovs.slice();
const snap=value=>({exists:()=>value!==undefined,data:()=>structuredClone(value),metadata:{fromCache:false}});
const query=(name,condition)=>({name,condition});
window.fs={db:{},collection:(_,name)=>query(name),doc:(first,name,id)=> typeof name==='string'?{name,id}: {name:first.name,id:'auto_'+(++sequence)},where:(field,op,value)=>({field,op,value}),query:(ref,cond)=>query(ref.name,cond),
runTransaction:async(_,fn)=>{const pending=[];const result=await fn({get:async ref=>snap(ref.id==='puntos_venta'?registry:undefined),set:(ref,value)=>pending.push({ref,value:structuredClone(value)})});pending.forEach(w=>{writes.push(w);if(w.ref.id==='puntos_venta')registry=w.value;});return result;},
addDoc:async(ref,value)=>{writes.push({ref,value:structuredClone(value)});return {id:'added_'+(++sequence)};},updateDoc:async(ref,value)=>updates.push({ref,value}),
onSnapshot:(ref,options,callback)=>{queries.push(ref);const cb=typeof options==='function'?options:callback;if(ref.id==='puntos_venta')cb(snap(registry));return ()=>{};}};
App.getNextSeq=async()=>++sequence;
App.pointsReady=true;App.renderPointSelectors();App.renderFinances();
check(App.pointBalance('libreria')===-1100&&App.pointBalance('supermercado')===-10100,'legacy balances remain exactly -1100 and -10100');
check(App.pointIdForProfile({role:'libreria'})==='libreria'&&App.pointIdForProfile({role:'supermercado'})==='supermercado','existing accounts keep original owner IDs without migration');
check(App.pointIdForProfile({role:'vendedor'})===null&&App.pointIdForProfile({role:'inventado',puntoVentaId:'libreria'})===null,'invalid seller profiles do not get a shared default point');
const create=async(name,type)=>{document.getElementById('pointEditId').value='';document.getElementById('pointName').value=name;document.getElementById('pointType').value=type;await App.savePoint();App.points=App.readPoints(snap(registry));App.renderPointSelectors();return Object.entries(App.points).find(([id,p])=>p.nombre===name)[0];};
const arenal=await create('Librería Arenal','Librería');const gutierrez=await create('Librería Gutiérrez','Librería');const norma=await create('Restaurante Norma','Restaurante');
check(arenal!==gutierrez&&App.pointBalance(arenal)===0&&App.pointBalance(gutierrez)===0&&App.pointBalance(norma)===0,'new points of same or different types have separate IDs and zero balances');
check(writes.every(w=>w.ref.id==='puntos_venta')&&JSON.stringify(legacyMovs)===initial,'creating points never rewrites historical movements or users');
document.getElementById('pointEditId').value='libreria';App.onPointEditChange();document.getElementById('pointName').value='Librería actual';await App.savePoint();App.points=App.readPoints(snap(registry));App.renderPointSelectors();
check(App.pointBalance('libreria')===-1100&&ownerLabel('libreria')==='Librería actual','renaming original business preserves its balance and stable ID');
const count=Object.keys(App.points).length;document.getElementById('pointEditId').value='';document.getElementById('pointName').value='librería arenal';await App.savePoint();
check(Object.keys(registry.puntos).length===count&&window.lastAlert.includes('Ya existe'),'duplicate names cannot accidentally create another box');
App.movs=[...legacyMovs,{_id:'a1',owner:arenal,type:'Ingreso',amount:500,crDate:crDateStr()},{_id:'g1',owner:gutierrez,type:'Ingreso',amount:900,crDate:crDateStr()}];App.renderPointBalances();
check(App.pointBalance(arenal)===500&&App.pointBalance(gutierrez)===900&&document.getElementById('pointBalances').children.length===5,'admin cards include every point with independent balances');
document.getElementById('movOwner').value=arenal;App.renderFinances();check(document.getElementById('balanceFull').textContent===money(500)&&document.getElementById('movBody').children.length===1,'admin point filter controls balance and movements even without history');
// Verify account creation passes permission and point separately.
let account;window.createNewUserAccount=async(...args)=>{account=args;};
document.getElementById('newUsrEmail').value='test@example.com';document.getElementById('newUsrPass').value='example-pass';document.getElementById('newUsrName').value='Vendedora';document.getElementById('newUsrRole').value='vendedor';document.getElementById('newUsrPoint').value=arenal;await App.createUserAccount();
check(account[3]==='vendedor'&&account[4]===arenal,'seller account has role vendedor and explicit point ID');
document.getElementById('newUsrRole').value='admin';App.onNewUserRoleChange();check(document.getElementById('newUsrPointField').classList.contains('hidden'),'admin role does not require a business box');
document.getElementById('retiroOwner').value=gutierrez;document.getElementById('retiroTipo').value='Retiro';document.getElementById('retiroMonto').value='10';await App.registerCashMove();
check(writes.at(-1).value.owner===gutierrez&&writes.at(-1).value.amount===-10,'admin withdrawal targets selected point rather than business type');
document.getElementById('retiroOwner').value=norma;document.getElementById('retiroTipo').value='Abono';document.getElementById('retiroMonto').value='20';await App.registerCashMove();
check(writes.at(-1).value.owner===norma&&writes.at(-1).value.amount===20,'admin cash deposit targets a different business type independently');
// New seller, with a second user on the same point resolving to the same owner.
App.currentRole='vendedor';App.currentProfile={role:'vendedor',name:'Vendedora',puntoVentaId:arenal};App.pointsReady=true;
check(App.currentOwnerId()===arenal&&App.pointIdForProfile({...App.currentProfile,name:'Segundo vendedor'})===arenal,'several sellers can share the same explicitly assigned point');
App.applyRoleUI('vendedor');App.updateUserPointLabel();check(document.getElementById('userName').textContent.includes('Librería Arenal'),'seller session displays actual point name');
const pointWrites=writes.length;await App.savePoint();check(writes.length===pointWrites,'seller cannot create or rename business points');
document.getElementById('gastoOwner').value=gutierrez;document.getElementById('gastoMonto').value='50';document.getElementById('gastoDetalle').value='Papel';await App.registerExpense();
check(writes.at(-1).value.owner===arenal&&writes.at(-1).value.amount===-50,'seller expense uses assigned point despite another selected business');
document.getElementById('drawSelect').value='Tica Día (12:55 PM)';App.currentLines=[{num:'06',amt:100,rev:0}];App.numberBlocksReady=true;App.numberBlocks={};const start=writes.length;await App.confirmSale();
const sale=writes.slice(start);check(sale.length===2&&sale.every(w=>w.value.owner===arenal),'ticket and sale income both use new point ID');
App.tickets=[{id:'foreign',owner:gutierrez,paid:false,premiado:true,_id:'foreign'}];const payStart=writes.length;await App.payTicket('foreign');check(writes.length===payStart,'seller cannot register payout for another point ticket');
check(!App.canDeleteTicket({owner:gutierrez,paid:false,crDate:crDateStr(),draw:'Tica Día (12:55 PM)'}),'seller cannot delete another point ticket');
App.tickets=[{id:'own',owner:arenal,paid:false,premiado:true,premio:850,_id:'own'}];App.findTicketForPay=()=>{};await App.payTicket('own');check(writes.at(-1).value.owner===arenal&&writes.at(-1).value.type==='Pago','payout retains ticket business ID');
App.movs=[{_id:'own-m',owner:arenal,amount:300,locked:false},{_id:'other-m',owner:gutierrez,amount:900,locked:false}];document.getElementById('cierreEfectivo').value='300';updates=[];await App.saveCierre();
check(writes.at(-1).value.owner===arenal&&writes.at(-1).value.balance===300&&updates.length===1&&updates[0].ref.id==='own-m','cash close counts and locks only assigned point movements');
App.tickets=[{id:'TSM-own',owner:arenal,draw:'Tica Día (12:55 PM)',crDate:crDateStr(),total:100},{id:'TSM-other',owner:gutierrez,draw:'Tica Día (12:55 PM)',crDate:crDateStr(),total:200}];App.renderReports();
check(document.getElementById('repBody').children.length===1&&document.getElementById('repBody').textContent.includes('TSM-own'),'seller reports are scoped to assigned point');
queries=[];App.subscribeToFirestore();
const scoped=queries.filter(q=>['tiquetes','movimientos','cierres'].includes(q.name));
check(scoped.length===3&&scoped.every(q=>q.condition.field==='owner'&&q.condition.value===arenal),'all seller subscriptions query by point ID instead of vendedor role');
for(const role of ['libreria','supermercado']){
  App.currentRole=role;App.currentProfile={role,name:'Cuenta actual'};queries=[];App.subscribeToFirestore();
  check(queries.filter(q=>['tiquetes','movimientos','cierres'].includes(q.name)).every(q=>q.condition.value===role),'legacy '+role+' subscription remains on historical box');
}
App.currentRole='vendedor';App.currentProfile={role:'vendedor',name:'Otra librería',puntoVentaId:gutierrez};queries=[];App.subscribeToFirestore();
check(queries.filter(q=>['tiquetes','movimientos','cierres'].includes(q.name)).every(q=>q.condition.value===gutierrez),'second library with same vendedor role queries its separate point');
check(JSON.stringify(legacyMovs)===initial,'original balances and historical fixtures unchanged after all operations');
// Restore UI for desktop and mobile checks.
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.points=registry.puntos;App.pointsReady=true;App.movs=[...legacyMovs,{owner:arenal,amount:500},{owner:gutierrez,amount:900}];App.applyRoleUI('admin');App.renderPointSelectors();App.renderAll();
document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');App.switchTab('usuarios');
return checks;
});
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,checks,startupErrors:errors},null,2));
await page.setViewportSize({width:1400,height:1000});
assert.equal(await page.locator('#pointName').isVisible(),true);
await page.setViewportSize({width:390,height:844});
assert.equal(await page.locator('#newUsrPoint').isVisible(),false); // admin role selected in test
await browser.close();})();
