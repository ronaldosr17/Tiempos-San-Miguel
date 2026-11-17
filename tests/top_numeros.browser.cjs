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
const checks=await page.evaluate(()=>{
const checks=[];const check=(ok,msg)=>{if(!ok)throw Error(msg);checks.push(msg);};
crDateStr=()=> '2026-11-17';getCRTime=()=>({h:8,m:0,s:0});
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.pointsReady=true;App.topSources={tickets:'ready',results:'ready'};
App.points={pv_a:{nombre:'Librería Arenal',tipo:'Librería'}};
let databaseCalls=0;window.fs=new Proxy({}, {get:()=>{databaseCalls++;throw Error('Unexpected Firebase access');}});
const day=crDateStr(),yesterday=addDaysToDateStr(day,-1);
App.results=[
{draw:'Tica Día (12:55 PM)',crDate:day,numero:'05'},
{draw:'Tica Día',crDate:day,numero:'5'},
{draw:'Tica Tarde (4:30 PM)',crDate:day,numero:'05'},
{draw:'Nica Mañana (11:00 AM)',crDate:day,numero:'00'},
{draw:'La Primera (10:00 AM)',crDate:yesterday,numero:'07'},
{draw:'Tica Noche (7:30 PM)',crDate:day,numero:'09'},
{draw:'Tica Noche (7:30 PM)',crDate:day,numero:'10'},
{draw:'Tica Día',crDate:day,numero:'100'}];
const line=(num,amt,rev=0)=>({num,amt,rev});
const ticket=(id,owner,draw,date,lines,extra={})=>({_id:id,id,owner,draw,crDate:date,status:'registrada',lines,...extra});
App.tickets=[
ticket('a1','libreria','Tica Día (12:55 PM)',day,[line('05',100,50),line('05',50),line('00',50)]),
ticket('a2','supermercado','Tica Tarde (4:30 PM)',day,[line('05',300,100)]),
ticket('a3','libreria','Nica Noche (9:00 PM)',day,[line('07',500)]),
ticket('a4','pv_a','La Primera (6:00 PM)',yesterday,[line('07',50)]),
ticket('a5','libreria','Tica Día (12:55 PM)',day,[line('05',9999)],{status:'anulada'}),
ticket('a6','libreria','Tica Día (12:55 PM)',day,[line('09',-50)]),
ticket('a7','libreria','Tica Día (12:55 PM)','2026-01-01',[line('99',1000)]),
ticket('a9','supermercado','Nica Tarde (3:00 PM)',day,[line('00',100)],{paid:true})];
App.tickets.push({...App.tickets[0]});
const original=JSON.stringify({tickets:App.tickets,results:App.results});
const filters={from:addDaysToDateStr(day,-29),to:day,family:'',owner:''};
let stats=App.topStats(filters);
check(stats.resultsCount===4&&stats.winners[0].num==='05'&&stats.winners[0].wins===2,'winning frequency deduplicates draw-date aliases and excludes conflicts');
check(!stats.winners.some(r=>r.num==='09'||r.num==='10')&&stats.invalid===3,'contradictory results and invalid values are reported and excluded');
check(stats.ticketsCount===5&&stats.total===1300&&stats.distinct===3,'ticket and money totals exclude cancelled, invalid, duplicate and out-of-period records');
check(stats.played.every(r=>r.tickets===2)&&stats.played[0].num==='00','most-played counts each number once per distinct ticket and sorts ties deterministically');
check(stats.money[0].num==='05'&&stats.money[0].direct===450&&stats.money[0].rev===150&&stats.money[0].stake===600,'money ranking sums all valid direct and reventado lines');
check(stats.risks.length===1&&stats.risks[0].num==='07'&&stats.risks[0].maximum===42500,'today risk excludes paid tickets, past dates and draws with results');
stats=App.topStats({...filters,owner:'libreria'});check(stats.total===750&&stats.ticketsCount===2&&stats.resultsCount===4,'point filter isolates betting but leaves general lottery frequency unchanged');
stats=App.topStats({...filters,family:'tica'});check(stats.total===650&&stats.resultsCount===2,'family filter includes all Tica time slots');
stats=App.topStats({...filters,family:'nica'});check(stats.total===600&&stats.resultsCount===1,'Nica family stays separate');
stats=App.topStats({...filters,family:'primera'});check(stats.total===50&&stats.resultsCount===1,'La Primera family includes historical afternoon tickets');
stats=App.topStats({...filters,from:day,to:day});check(stats.total===1250&&stats.ticketsCount===4,'today period excludes yesterday tickets');
const savedResults=App.results,savedTickets=App.tickets;
App.results=[];App.tickets=[ticket('risk','libreria','Tica Noche (7:30 PM)',day,[line('05',100,50)])];
check(App.topStats(filters).risks[0].maximum===18500,'Tica maximum combines x85 direct and x200 reventado');
App.results=savedResults;App.tickets=savedTickets;
check(JSON.stringify({tickets:App.tickets,results:App.results})===original,'statistics do not mutate source tickets or results');
check(App.topNumber('0')==='00'&&App.topNumber(5)==='05'&&App.topNumber('100')===null,'number normalization preserves leading zero and rejects out-of-range values');
check(App.topDate({date:'16/11/2026'})===yesterday&&App.topDate({crDate:'2026-02-30'})===null,'legacy dates are understood and invalid calendar dates rejected');
App.applyRoleUI('admin');App.renderPointSelectors();App.setTopPeriod('30',false);App.switchTab('top-numeros');
check(!document.getElementById('navTopNumeros').classList.contains('hidden')&&!document.getElementById('topNumbersPanel').classList.contains('hidden'),'admin has dedicated Top Números navigation');
check(document.getElementById('topMoneyRanking').querySelectorAll('tbody tr').length===3,'ranking tables render numeric statistics');
check(document.getElementById('topPlayedRanking').querySelector('button').disabled,'aggregated ranking cannot accidentally block a default family');
App.numberBlocks={tica_05:{hasta:'2099-01-01T00:00:00Z'}};document.getElementById('topFamily').value='tica';App.renderTopNumbers();
check(document.getElementById('topMoneyRanking').textContent.includes('Bloqueado: Tica'),'ranking identifies active family-specific blocks');
App.prepareTopBlock('05','tica');
check(document.querySelector('[data-tab="reportes"].tab-panel').classList.contains('hidden')===false&&document.getElementById('blockNumber').value==='05'&&document.getElementById('blockFamily').value==='tica'&&document.getElementById('blockUntil').value==='','blocking shortcut only prepares correct number and family and requires expiration');
App.switchTab('top-numeros');App.topSources.tickets='cache';App.renderTopNumbers();check(document.getElementById('topNumbersStatus').textContent.includes('caché'),'cached statistics are explicitly marked');
App.topSourceError('results',new Error('simulated read failure'));check(document.getElementById('topNumbersStatus').textContent.includes('No se pudieron')&&!document.getElementById('topResultsRanking').querySelector('table'),'source failure does not present empty ranking as verified history');
App.topSources={tickets:'ready',results:'ready'};document.getElementById('topFrom').value='2026-11-18';document.getElementById('topTo').value='2026-11-17';App.onTopDatesChange();
check(document.getElementById('topNumbersStatus').textContent.includes('Desde')&&!document.getElementById('topMoneyRanking').querySelector('table'),'invalid filter dates clear ranking and show an error');
App.currentRole='vendedor';App.currentProfile={role:'vendedor',puntoVentaId:'pv_a',name:'Vendedor'};App.applyRoleUI('vendedor');App.switchTab('ventas');App.switchTab('top-numeros');
check(document.getElementById('navTopNumeros').classList.contains('hidden')&&document.getElementById('topNumbersPanel').classList.contains('hidden')&&document.getElementById('topMoneyRanking').textContent==='','seller cannot open admin statistics and old rendered data is cleared');
check(App.topStats(filters)===null,'statistics computation rejects non-admin role');
check(databaseCalls===0,'filters, rankings and blocking preparation make zero additional Firebase calls');
App.currentRole='admin';App.currentProfile={role:'admin',name:'Administrador'};App.applyRoleUI('admin');App.topSources={tickets:'ready',results:'ready'};App.renderPointSelectors();document.getElementById('topFamily').value='';App.setTopPeriod('30',false);App.switchTab('top-numeros');
document.getElementById('login').classList.add('hidden');document.getElementById('app').classList.remove('hidden');
return checks;
});
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:checks.length,checks,startupErrors:errors},null,2));
await page.setViewportSize({width:1500,height:1050});assert.equal(await page.locator('#topNumbersPanel').isVisible(),true);
await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#topFamily').isVisible(),true);
await browser.close();})();
