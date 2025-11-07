/*
  Zaktualizowany script.js — bez zmian logicznych poza tymi dotyczącymi natychmiastowego
  nadawania klasy wierszowi i komórkom (maszyna/status) po zmianie statusu.
  Komentarze po polsku zostawione były minimalne; nie zmieniałem reszty logiki.
*/

// ---------- Konfiguracja Supabase (wklej swoje dane) ----------
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
// ------------------------------------------------------------

let sb = null;
let employees = [];
let machines = [];
let assignments = {};
let dateInput, tbody, theadRow;
let currentDate = null;

const COLUMNS = [
  {key:'maszyna', title:'Maszyna'},
  {key:'status', title:'Status'},
  {key:'mechanik_focke', title:'Mechanik Focke'},
  {key:'mechanik_protos', title:'Mechanik Protos'},
  {key:'operator_focke', title:'Operator Focke'},
  {key:'operator_protos', title:'Operator Protos'},
  {key:'pracownik_pomocniczy', title:'Pracownik pomocniczy'},
  {key:'filtry', title:'Filtry'},
  {key:'inserty', title:'Inserty'}
];

const MACHINE_STATUSES = ['Produkcja','Produkcja + Filtry','Produkcja + Inserty','Produkcja + Filtry + Inserty','Konserwacja','Rozruch','Bufor','Stop'];

const STATUS_ACTIVE_ROLES = {
  'Produkcja': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy'],
  'Produkcja + Filtry': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry'],
  'Produkcja + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','inserty'],
  'Produkcja + Filtry + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry','inserty'],
  'Konserwacja': [], 'Rozruch': ['mechanik_focke','mechanik_protos','pracownik_pomocniczy'],
  'Bufor': ['operator_focke','operator_protos'], 'Stop': []
};

const DEFAULT_MACHINES = ['11','12','15','16','17','18','21','22','24','25','26','27','28','31','32','33','34','35','94','96'];

function waitForSupabaseGlobal(timeoutMs = 8000){
  return new Promise((resolve,reject)=>{
    if(window.supabase && typeof window.supabase.createClient==='function') return resolve(window.supabase);
    let waited=0; const iv=setInterval(()=>{
      if(window.supabase && typeof window.supabase.createClient==='function'){ clearInterval(iv); return resolve(window.supabase); }
      waited+=200; if(waited>=timeoutMs){ clearInterval(iv); return reject(new Error('Timeout waiting for Supabase SDK')); }
    },200);
  });
}

async function initSupabase(){
  try{ await waitForSupabaseGlobal(); sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY); console.log('Supabase ready'); }
  catch(e){ console.warn('Supabase not available — offline mode', e); sb = null; }
}

async function loadEmployees(){ if(!sb){ employees = []; return; } try{ const {data,error} = await sb.from('employees').select('*').order('name',{ascending:true}); if(error){ console.error('loadEmployees error', error); employees = []; } else employees = data || []; } catch(e){ console.error(e); employees = []; } }
async function loadMachines(){ if(!sb){ machines = DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); return; } try{ const {data,error} = await sb.from('machines').select('*').order('ord',{ascending:true}).eq('default_view',true); if(error){ console.error('loadMachines error', error); machines = DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); } else machines = (data && data.length) ? data : DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); } catch(e){ console.error(e); machines = DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); } }

async function loadAssignmentsForDate(date){ if(!date) return; if(!sb){ assignments[date] = {}; return; } try{ const {data,error} = await sb.from('assignments').select('*').eq('date',date); if(error){ console.error('loadAssignmentsForDate error', error); assignments[date] = {}; return; } const map = {}; machines.forEach(m=>{ map[m.number] = [m.number, m.status || 'Produkcja']; for(let i=2;i<COLUMNS.length;i++) map[m.number].push(''); }); (data||[]).forEach(a=>{ const emp = employees.find(e=>e.id===a.employee_id); const idx = COLUMNS.findIndex(c=>c.key===a.role); if(idx>-1){ if(!map[a.machine_number]){ const row=[a.machine_number,'Produkcja']; for(let i=2;i<COLUMNS.length;i++) row.push(''); map[a.machine_number]=row; } if(emp) map[a.machine_number][idx]=emp.name; } }); assignments[date]=map; } catch(e){ console.error(e); assignments[date] = {}; } }

function statusClassFor(status){ if(!status) return ''; const s = String(status).toLowerCase(); if(s.includes('produkcja')) return 'status-prod'; if(s.includes('konserwacja')) return 'status-konserwacja'; if(s.includes('rozruch')) return 'status-rozruch'; if(s.includes('bufor')) return 'status-bufor'; if(s.includes('stop')) return 'status-stop'; return ''; }

function buildTableFor(date){ const dateData = assignments[date] || {}; theadRow.innerHTML = ''; COLUMNS.forEach(c=>{ const th = document.createElement('th'); th.textContent = c.title; theadRow.appendChild(th); }); tbody.innerHTML = '';

  machines.forEach(m => {
    const vals = dateData[m.number] || [m.number, m.status || 'Produkcja'];
    const tr = document.createElement('tr'); tr.dataset.machine = m.number;

    const effectiveStatus = m.status || vals[1] || 'Produkcja';
    const statusCls = statusClassFor(effectiveStatus);
    if(statusCls) tr.classList.add(statusCls);

    const tdNum = document.createElement('td'); tdNum.textContent = m.number; if(statusCls) tdNum.classList.add(statusCls); tr.appendChild(tdNum);

    const tdStatus = document.createElement('td'); if(statusCls) tdStatus.classList.add(statusCls);
    const selectStatus = document.createElement('select'); MACHINE_STATUSES.forEach(st=>{ const opt=document.createElement('option'); opt.value=st; opt.textContent=st; if((m.status||effectiveStatus)===st) opt.selected=true; selectStatus.appendChild(opt); });

    /* ---------- ZMIANA: natychmiastowe nadanie klasy wierszowi i komórkom po zmianie statusu ---------- */
    selectStatus.onchange = async (e) => {
      const newStatus = e.target.value;
      const newCls = statusClassFor(newStatus);

      // usuń stare klasy statusowe
      tr.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdNum.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdStatus.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');

      if(newCls){ tr.classList.add(newCls); tdNum.classList.add(newCls); tdStatus.classList.add(newCls); }

      // lokalna aktualizacja modelu
      m.status = newStatus;

      // zapisz do Supabase jeśli dostępne
      if(sb){ try{ const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', m.number); if(error) console.error('update machine status error', error); } catch(err){ console.error('update machine status catch', err); } }

      // odśwież widok
      await loadAssignmentsForDate(date); buildTableFor(date);
    };

    tdStatus.appendChild(selectStatus); tr.appendChild(tdStatus);

    COLUMNS.slice(2).forEach(col => {
      const td = document.createElement('td');
      const active = (STATUS_ACTIVE_ROLES[m.status || effectiveStatus] || []).includes(col.key);
      const idx = COLUMNS.findIndex(c => c.key === col.key);
      const val = vals[idx] || '';

      if(!active){ td.classList.add('disabled'); td.textContent = val || ''; }
      else { if(!val) td.classList.add('empty-cell'); else td.classList.add('assigned-cell'); td.textContent = val; td.style.cursor = 'pointer'; td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key)); }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // maszyny, ktore maja przypisania ale nie sa w default view
  Object.keys(dateData).forEach(num => { if(!machines.find(mm=>mm.number===num)){ const vals = dateData[num]; const tr=document.createElement('tr'); tr.dataset.machine = num; const tdNum=document.createElement('td'); tdNum.textContent = num + ' (inny)'; tr.appendChild(tdNum); const tdStatus=document.createElement('td'); tdStatus.textContent='—'; tr.appendChild(tdStatus); COLUMNS.slice(2).forEach((col,i)=>{ const idx=i+2; const td=document.createElement('td'); const cellValue = vals[idx] || ''; if(!cellValue){ td.classList.add('empty-cell'); td.textContent=''; } else { td.classList.add('assigned-cell'); td.textContent=cellValue; } td.style.cursor='pointer'; td.addEventListener('dblclick',()=>openAssignModal(date,num,col.key)); tr.appendChild(td); }); tbody.appendChild(tr); } });
}

async function saveAssignment(date,machine,role,empId){ if(!sb){ const map = assignments[date] || {}; map[machine] = map[machine] || [machine,'Produkcja']; for(let i=2;i<COLUMNS.length;i++) if(typeof map[machine][i] === 'undefined') map[machine][i] = ''; const idx=COLUMNS.findIndex(c=>c.key===role); if(idx>-1) map[machine][idx] = empId ? (employees.find(e=>e.id===empId)?.name||'USER') : ''; assignments[date]=map; buildTableFor(date); return; } try{ await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role); if(empId) await sb.from('assignments').insert([{date,machine_number:machine,role,employee_id:empId}]); await loadAssignmentsForDate(date); buildTableFor(date); } catch(e){ console.error('saveAssignment error', e); } }

let assignModal, assignTitle, assignInfo, assignList;
function setupAssignModal(){ assignModal=document.getElementById('assignModal'); assignTitle=document.getElementById('assignTitle'); assignInfo=document.getElementById('assignInfo'); assignList=document.getElementById('assignList'); document.getElementById('assignClose').addEventListener('click',()=>assignModal.style.display='none'); assignModal.addEventListener('click',(e)=>{ if(e.target===assignModal) assignModal.style.display='none'; }); }
function openAssignModal(date,machine,roleKey){ assignModal.style.display='flex'; assignTitle.textContent=`Przypisz — ${roleKey.replace('_',' ')} (Maszyna ${machine})`; assignInfo.textContent='Kliknij, aby przypisać pracownika.'; assignList.innerHTML=''; const list = employees.filter(e=>(e.roles||[]).includes(roleKey)); list.forEach(emp=>{ const b=document.createElement('div'); b.className='employee-btn'; b.textContent = emp.name + (emp.bu?(' · '+emp.bu):''); b.onclick = async()=>{ await saveAssignment(date,machine,roleKey,emp.id); assignModal.style.display='none'; }; assignList.appendChild(b); }); const clear = document.createElement('button'); clear.className='btn'; clear.textContent='Wyczyść przypisanie'; clear.onclick=async()=>{ await saveAssignment(date,machine,roleKey,null); assignModal.style.display='none'; }; assignList.appendChild(clear); }

function setupAdminPanel(){ const adminPanel=document.getElementById('adminPanel'); const adminLoginBtn=document.getElementById('adminLoginBtn'); const adminLogin=document.getElementById('adminLogin'); const adminMsg=document.getElementById('adminMsg'); const adminSection=document.getElementById('adminSection'); const adminCloseNoLogin=document.getElementById('adminCloseNoLogin'); const closeAdmin=document.getElementById('closeAdmin'); adminLoginBtn.onclick=()=>adminPanel.style.display='flex'; if(adminCloseNoLogin) adminCloseNoLogin.addEventListener('click',()=>adminPanel.style.display='none'); adminPanel.addEventListener('click',(e)=>{ if(e.target===adminPanel) adminPanel.style.display='none'; }); adminLogin.onclick=async()=>{ const p=document.getElementById('adminPass').value; if(p==='admin123'){ adminSection.style.display='block'; adminMsg.textContent='Zalogowano.'; await refreshAdminMachineList(); } else adminMsg.textContent='Błędne hasło.'; }; const addBtn=document.getElementById('addMachineBtn'); if(addBtn) addBtn.onclick=async()=>{ const num=document.getElementById('newMachineNumber').value.trim(); if(!num) return alert('Podaj numer maszyny'); if(!sb){ machines.push({number:num,ord:machines.length+1,status:'Produkcja'}); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; } try{ const {data:cur} = await sb.from('machines').select('ord').order('ord',{ascending:false}).limit(1).maybeSingle(); const nextOrd = cur?.ord?cur.ord+1:1; const {error} = await sb.from('machines').insert([{number:num,ord:nextOrd,default_view:true,status:'Produkcja'}]); if(error) return alert('Błąd: '+error.message); document.getElementById('newMachineNumber').value=''; await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); } catch(e){ console.error('addMachine error', e); } }; const saveOrderBtn=document.getElementById('saveMachineOrderBtn'); if(saveOrderBtn) saveOrderBtn.onclick=async()=>{ const box=document.getElementById('machineListEditable'); const rows=Array.from(box.querySelectorAll('.admin-machine-row')); for(let i=0;i<rows.length;i++){ const num=rows[i].dataset.number; if(!sb) continue; await sb.from('machines').update({ord:i+1,default_view:true}).eq('number',num); } await loadMachines(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); alert('Zapisano kolejność jako widok domyślny.'); }; const exportBtn=document.getElementById('adminExportEmpBtn'); if(exportBtn) exportBtn.onclick=async()=>{ if(!sb) return alert('Brak połączenia z Supabase.'); const {data,error} = await sb.from('employees').select('*'); if(error) return alert('Błąd: '+error.message); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='employees.json'; a.click(); }; if(closeAdmin) closeAdmin.onclick=()=>{ adminPanel.style.display='none'; }; }

async function refreshAdminMachineList(){ const box=document.getElementById('machineListEditable'); if(!box) return; box.innerHTML=''; if(!sb){ machines.forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); } else { try{ const {data} = await sb.from('machines').select('*').order('ord',{ascending:true}); (data||[]).forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); } catch(e){ console.error('refreshAdminMachineList error', e); } } box.querySelectorAll('.remove-machine').forEach(btn=>{ btn.onclick=async(e)=>{ const num=e.target.closest('.admin-machine-row').dataset.number; if(!confirm('Usunąć maszynę '+num+'?')) return; if(!sb){ machines = machines.filter(mm=>mm.number!==num); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; } try{ await sb.from('machines').delete().eq('number',num); await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); } catch(err){ console.error('remove machine error', err); } }; }); let dragSrc=null; box.querySelectorAll('.admin-machine-row').forEach(item=>{ item.draggable=true; item.addEventListener('dragstart',(e)=>{ dragSrc=item; e.dataTransfer.effectAllowed='move'; }); item.addEventListener('dragover',(e)=>e.preventDefault()); item.addEventListener('drop',(e)=>{ e.preventDefault(); if(dragSrc && dragSrc!==item) box.insertBefore(dragSrc,item.nextSibling); }); }); }

function exportDayToCSV(date){ if(!date){ alert('Wybierz datę przed eksportem.'); return; } const dateData = assignments[date] || {}; const roleTitles = COLUMNS.slice(2).map(c=>c.title); const headers = ['Data','Maszyna','Status',...roleTitles]; const rows=[headers.join(',')]; const machineList = machines.length?machines:Object.keys(dateData).map(k=>({number:k})); machineList.forEach(m=>{ const machineNumber = m.number||m; const vals = dateData[machineNumber] || [machineNumber,'Gotowa','','','','','','','']; const row = [date,machineNumber,vals[1]||'Gotowa',...vals.slice(2)]; rows.push(row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')); }); const csvContent = rows.join('\r\n'); const filename = `assignments-${date}.csv`; const blob = new Blob([csvContent],{type:'text/csv;charset=utf-8;'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); }

async function bootstrap(){ await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r()); dateInput=document.getElementById('dateInput'); tbody=document.getElementById('tbody'); theadRow=document.getElementById('theadRow'); dateInput.value=new Date().toISOString().slice(0,10); setupAssignModal(); setupAdminPanel(); await initSupabase(); await loadEmployees(); await loadMachines(); currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); const loadBtn=document.getElementById('loadDay'); if(loadBtn) loadBtn.onclick=async()=>{ currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }; const exportBtn=document.getElementById('exportDayBtn'); if(exportBtn) exportBtn.onclick=()=>exportDayToCSV(currentDate || dateInput.value); }

bootstrap();

/* Koniec script.js */
