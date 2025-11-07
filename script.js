// improved script.js — admin panel fixed + UI tweaks + safe Supabase init

const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';

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
  try{
    await waitForSupabaseGlobal();
    sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
    console.log('Supabase ready');
  }catch(e){
    console.warn('Supabase not available, running in offline mode', e);
    sb = null;
  }
}

/* data loaders */
async function loadEmployees(){
  if(!sb) return employees=[];
  try{ const {data,error}=await sb.from('employees').select('*').order('name',{ascending:true}); if(error){ console.error(error); employees=[]; } else employees=data||[]; } catch(e){ console.error(e); employees=[]; }
}
async function loadMachines(){
  if(!sb){ machines = DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); return; }
  try{ const {data,error}=await sb.from('machines').select('*').order('ord',{ascending:true}).eq('default_view',true); if(error){ console.error(error); machines=DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); } else machines = (data && data.length)?data: DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); } catch(e){ console.error(e); machines=DEFAULT_MACHINES.map((n,i)=>({number:n,ord:i+1,status:'Produkcja'})); }
}
async function loadAssignmentsForDate(date){
  if(!date) return; if(!sb){ assignments[date]={}; return; }
  try{ const {data,error}=await sb.from('assignments').select('*').eq('date',date); if(error){ console.error(error); assignments[date]={}; return; } const map={}; machines.forEach(m=>{ map[m.number]=[m.number,m.status||'Produkcja']; for(let i=2;i<COLUMNS.length;i++) map[m.number].push(''); }); (data||[]).forEach(a=>{ const emp = employees.find(e=>e.id===a.employee_id); const idx = COLUMNS.findIndex(c=>c.key===a.role); if(idx>-1){ if(!map[a.machine_number]){ const row=[a.machine_number,'Produkcja']; for(let i=2;i<COLUMNS.length;i++) row.push(''); map[a.machine_number]=row; } if(emp) map[a.machine_number][idx]=emp.name; } }); assignments[date]=map; }catch(e){ console.error(e); assignments[date]={}; }
}

/* UI rendering */
function buildTableFor(date) {
  const dateData = assignments[date] || {};
  theadRow.innerHTML = '';
  COLUMNS.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.title;
    theadRow.appendChild(th);
  });

  tbody.innerHTML = '';

  // helper: map status string -> css class
  const statusClassFor = (s) => {
    if (!s) return '';
    const norm = String(s).toLowerCase();
    if (norm.includes('produkcja')) return 'status-prod';
    if (norm.includes('konserwacja')) return 'status-konserwacja';
    if (norm.includes('rozruch')) return 'status-rozruch';
    if (norm.includes('stop')) return 'status-stop';
    if (norm.includes('bufor')) return 'status-bufor';
    return '';
  };

  machines.forEach(m => {
  const vals = data[m.number] || [m.number, m.status || 'Produkcja'];
  const tr = document.createElement('tr');
  tr.dataset.machine = m.number;

  // 👉 Ustaw klasę zależną od statusu
  const status = (m.status || 'Produkcja').toLowerCase();
  tr.classList.remove('status-produkcja', 'status-konserwacja', 'status-rozruch', 'status-stop', 'status-bufor');
  if (status.includes('produkcja')) tr.classList.add('status-produkcja');
  else if (status === 'konserwacja') tr.classList.add('status-konserwacja');
  else if (status === 'rozruch') tr.classList.add('status-rozruch');
  else if (status === 'stop') tr.classList.add('status-stop');
  else if (status === 'bufor') tr.classList.add('status-bufor');

  // kolumna: numer maszyny
  const tdNum = document.createElement('td');
  tdNum.textContent = m.number;
  tr.appendChild(tdNum);

  // kolumna: status (select)
  const tdStatus = document.createElement('td');
  const sel = document.createElement('select');
  MACHINE_STATUSES.forEach(st => {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    if (st === m.status) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = async (e) => {
    const res = await sb.from('machines').update({ status: e.target.value }).eq('number', m.number);
    if (!res.error) {
      await loadMachines();
      await loadAssignmentsForDate(date);
      buildTableFor(date);
    }
  };
  tdStatus.appendChild(sel);
  tr.appendChild(tdStatus);

  // pozostałe kolumny
  COLUMNS.slice(2).forEach(col => {
    const td = document.createElement('td');
    const active = STATUS_ACTIVE_ROLES[m.status || 'Produkcja']?.includes(col.key);
    const val = vals[COLUMNS.findIndex(c => c.key === col.key)] || '';
    td.textContent = val;
    td.className = !active ? 'disabled' : (val ? 'assigned-cell' : 'empty-cell');
    if (active) td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key));
    tr.appendChild(td);
  });

  tbody.appendChild(tr);
});

🎨 Dodaj do style.css

Na samym końcu pliku dopisz:

/* === Kolorowe obramowania całych wierszy w zależności od statusu === */
tr.status-produkcja {
  border: 3px solid #2ecc71; /* zielony */
}

tr.status-konserwacja {
  border: 3px solid #3498db; /* niebieski */
}

tr.status-rozruch {
  border: 3px solid #f39c12; /* pomarańczowy */
}

tr.status-stop {
  border: 3px solid #2c2c2c; /* czarny */
  color: white;
  background-color: #2c2c2c;
}

tr.status-bufor {
  border: 3px solid #e74c3c; /* czerwony */
}

/* Żeby granice między wierszami były wyraźne */
tbody tr {
  border-collapse: separate;
  border-spacing: 0 4px;
}
  // Show any machines that have assignments for this date but are not in default view (kept unchanged)
  Object.keys(dateData).forEach(num => {
    if (!machines.find(mm => mm.number === num)) {
      const vals = dateData[num];
      const tr = document.createElement('tr');
      tr.dataset.machine = num;

      const tdNum = document.createElement('td');
      tdNum.textContent = num + ' (inny)';
      tr.appendChild(tdNum);

      const tdStatus = document.createElement('td');
      tdStatus.textContent = '—';
      tr.appendChild(tdStatus);

      COLUMNS.slice(2).forEach((col, i) => {
        const idx = i + 2;
        const td = document.createElement('td');
        const cellValue = vals[idx] || '';
        if (!cellValue) {
          td.classList.add('empty-cell');
          td.textContent = '';
        } else {
          td.classList.add('assigned-cell');
          td.textContent = cellValue;
        }
        td.style.cursor = 'pointer';
        td.addEventListener('dblclick', () => openAssignModal(date, num, col.key, idx));
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }
  });
}


/* assignments */
async function saveAssignment(date,machine,role,empId){
  if(!sb){ const map = assignments[date]||{}; map[machine]=map[machine]||[machine,'Produkcja','','','','','','','']; const idx=COLUMNS.findIndex(c=>c.key===role); if(idx>-1) map[machine][idx]=empId?(employees.find(e=>e.id===empId)?.name||'USER'):''; assignments[date]=map; buildTableFor(date); return; }
  try{ await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role); if(empId) await sb.from('assignments').insert([{date,machine_number:machine,role,employee_id:empId}]); await loadAssignmentsForDate(date); buildTableFor(date); }catch(e){console.error(e);} }

/* modal assign */
let assignModal,assignTitle,assignInfo,assignList;
function setupAssignModal(){ assignModal=document.getElementById('assignModal'); assignTitle=document.getElementById('assignTitle'); assignInfo=document.getElementById('assignInfo'); assignList=document.getElementById('assignList'); document.getElementById('assignClose').addEventListener('click',()=>assignModal.style.display='none'); assignModal.addEventListener('click',(e)=>{ if(e.target===assignModal) assignModal.style.display='none'; }); }
function openAssignModal(date,machine,roleKey){ assignModal.style.display='flex'; assignTitle.textContent=`Przypisz — ${roleKey.replace('_',' ')} (Maszyna ${machine})`; assignInfo.textContent='Kliknij, aby przypisać pracownika.'; assignList.innerHTML=''; const list=employees.filter(e=>(e.roles||[]).includes(roleKey)); list.forEach(emp=>{ const b=document.createElement('div'); b.className='employee-btn'; b.textContent=emp.name+(emp.bu?(' · '+emp.bu):''); b.onclick=async()=>{ await saveAssignment(date,machine,roleKey,emp.id); assignModal.style.display='none'; }; assignList.appendChild(b); }); const clear=document.createElement('button'); clear.className='btn outline'; clear.textContent='Wyczyść przypisanie'; clear.onclick=async()=>{ await saveAssignment(date,machine,roleKey,null); assignModal.style.display='none'; }; assignList.appendChild(clear); }

/* admin */
function setupAdminPanel(){
  const adminPanel=document.getElementById('adminPanel');
  const adminLoginBtn=document.getElementById('adminLoginBtn');
  const adminLogin=document.getElementById('adminLogin');
  const adminMsg=document.getElementById('adminMsg');
  const adminSection=document.getElementById('adminSection');
  const adminCloseNoLogin=document.getElementById('adminCloseNoLogin');
  const adminCloseNoLoginBtn=document.getElementById('adminCloseNoLoginBtn');
  const closeAdmin=document.getElementById('closeAdmin');

  adminLoginBtn.onclick=()=>adminPanel.style.display='flex';
  adminCloseNoLogin.addEventListener('click',()=>adminPanel.style.display='none');
  adminCloseNoLoginBtn.addEventListener('click',()=>adminPanel.style.display='none');
  adminPanel.addEventListener('click',(e)=>{ if(e.target===adminPanel) adminPanel.style.display='none'; });

  adminLogin.onclick=async()=>{
    const p=document.getElementById('adminPass').value;
    if(p==='admin123'){ adminSection.style.display='block'; adminMsg.textContent='Zalogowano.'; await refreshAdminMachineList(); } else adminMsg.textContent='Błędne hasło.';
  };

  document.getElementById('addMachineBtn').onclick=async()=>{
    const num=document.getElementById('newMachineNumber').value.trim(); if(!num) return alert('Podaj numer maszyny');
    if(!sb){ machines.push({number:num,ord:machines.length+1,status:'Produkcja'}); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; }
    try{ const {data:cur} = await sb.from('machines').select('ord').order('ord',{ascending:false}).limit(1).maybeSingle(); const nextOrd = cur?.ord?cur.ord+1:1; const {error} = await sb.from('machines').insert([{number:num,ord:nextOrd,default_view:true,status:'Produkcja'}]); if(error) return alert('Błąd: '+error.message); document.getElementById('newMachineNumber').value=''; await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }catch(e){console.error(e);} };

  document.getElementById('saveMachineOrderBtn').onclick=async()=>{ const box=document.getElementById('machineListEditable'); const rows=Array.from(box.querySelectorAll('.admin-machine-row')); for(let i=0;i<rows.length;i++){ const num=rows[i].dataset.number; if(!sb) continue; await sb.from('machines').update({ord:i+1,default_view:true}).eq('number',num); } await loadMachines(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); alert('Zapisano kolejność jako widok domyślny.'); };

  document.getElementById('closeAdmin').onclick=()=>{ adminPanel.style.display='none'; };

}

async function refreshAdminMachineList(){
  const box=document.getElementById('machineListEditable'); box.innerHTML='';
  if(!sb){ machines.forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); } else { try{ const {data} = await sb.from('machines').select('*').order('ord',{ascending:true}); (data||[]).forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); }catch(e){console.error(e);} }
  box.querySelectorAll('.remove-machine').forEach(btn=>{ btn.onclick=async(e)=>{ const num=e.target.closest('.admin-machine-row').dataset.number; if(!confirm('Usunąć maszynę '+num+'?')) return; if(!sb){ machines = machines.filter(mm=>mm.number!==num); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; } await sb.from('machines').delete().eq('number',num); await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }; });
  let dragSrc=null; box.querySelectorAll('.admin-machine-row').forEach(item=>{ item.draggable=true; item.addEventListener('dragstart',(e)=>{ dragSrc=item; }); item.addEventListener('dragover',(e)=>e.preventDefault()); item.addEventListener('drop',(e)=>{ e.preventDefault(); if(dragSrc && dragSrc!==item) box.insertBefore(dragSrc,item.nextSibling); }); });
}

async function refreshMainTable(){ await loadMachines(); if(currentDate) await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }

async function bootstrap(){
  await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r()); dateInput=document.getElementById('dateInput'); tbody=document.getElementById('tbody'); theadRow=document.getElementById('theadRow'); dateInput.value=new Date().toISOString().slice(0,10);
  setupAssignModal(); setupAdminPanel(); await initSupabase(); await loadEmployees(); await loadMachines(); currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate);
  document.getElementById('loadDay').onclick=async()=>{ currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); };
  const exportBtn=document.getElementById('exportDayBtn'); if(exportBtn) exportBtn.onclick=()=>{ const d=currentDate||dateInput.value; const data=assignments[d]||{}; const headers=['Data','Maszyna','Status',...COLUMNS.slice(2).map(c=>c.title)]; const rows=[headers.join(',')]; const machineList = machines.length?machines:Object.keys(data).map(k=>({number:k})); machineList.forEach(m=>{ const num=m.number||m; const vals=data[num]||[num,'Produkcja','','','','','','','']; rows.push([d,num,vals[1],...vals.slice(2)].join(',')); }); const blob=new Blob([rows.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`assignments-${d}.csv`; a.click(); };
}

bootstrap();