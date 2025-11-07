// crew_manager_clean.js — krótsza, stabilna wersja

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

async function loadEmployees() {
  if (!sb) return employees = [];
  const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
  if (error) { console.error('loadEmployees error', error); employees = []; return; }
  employees = data || [];
}

async function loadMachines() {
  if (!sb) {
    machines = ['11','12','15','16','17','18','21','22','24','25','26','27','28','31','32','33','34','35','94','96'].map((n,i)=>({number:n,ord:i+1,status:'Produkcja'}));
    return;
  }
  const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true }).eq('default_view', true);
  if (error) { console.error('loadMachines error', error); machines = []; return; }
  machines = data || [];
}

async function loadAssignmentsForDate(date) {
  if (!date) return;
  if (!sb) { assignments[date] = {}; return; }
  const { data, error } = await sb.from('assignments').select('*').eq('date', date);
  if (error) { console.error('loadAssignmentsForDate error', error); assignments[date] = {}; return; }
  const map = {};
  machines.forEach(m => { map[m.number] = [m.number, m.status || 'Produkcja']; for(let i=2;i<COLUMNS.length;i++) map[m.number].push(''); });
  (data || []).forEach(a => {
    const emp = employees.find(e=>e.id===a.employee_id);
    const idx = COLUMNS.findIndex(c=>c.key===a.role);
    if (idx>-1 && emp) map[a.machine_number][idx] = emp.name;
  });
  assignments[date] = map;
}

function buildTableFor(date) {
  const dateData = assignments[date] || {};
  theadRow.innerHTML='';
  COLUMNS.forEach(c=>{ const th=document.createElement('th'); th.textContent=c.title; theadRow.appendChild(th); });
  tbody.innerHTML='';
  machines.forEach(m=>{
    const vals = dateData[m.number] || [m.number, m.status || 'Produkcja', '', '', '', '', '', '', ''];
    const tr = document.createElement('tr'); tr.dataset.machine = m.number;
    const tdNum = document.createElement('td'); tdNum.textContent = m.number; tr.appendChild(tdNum);
    const tdStatus = document.createElement('td'); const sel = document.createElement('select');
    MACHINE_STATUSES.forEach(st=>{ const opt=document.createElement('option'); opt.value=st; opt.textContent=st; if(st===m.status) opt.selected=true; sel.appendChild(opt); });
    sel.onchange = async (e)=>{ const res = await sb.from('machines').update({status:e.target.value}).eq('number',m.number); if(!res.error){ await loadMachines(); await loadAssignmentsForDate(date); buildTableFor(date); } };
    tdStatus.appendChild(sel); tr.appendChild(tdStatus);
    COLUMNS.slice(2).forEach(col=>{
      const td=document.createElement('td'); const active = STATUS_ACTIVE_ROLES[m.status||'Produkcja']?.includes(col.key);
      const val = vals[COLUMNS.findIndex(c=>c.key===col.key)] || '';
      td.textContent = val; td.className = !active ? 'disabled' : (val ? 'assigned-cell' : 'empty-cell');
      if(active) td.addEventListener('dblclick',()=>openAssignModal(date,m.number,col.key));
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

async function saveAssignment(date,machine,role,empId) {
  if(!sb){ const map = assignments[date]||{}; map[machine]=map[machine]||[machine,'Produkcja','','','','','','','']; const idx = COLUMNS.findIndex(c=>c.key===role); if(idx>-1) map[machine][idx]= empId? (employees.find(e=>e.id===empId)?.name||'USER') : ''; assignments[date]=map; buildTableFor(date); return; }
  await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role);
  if(empId) await sb.from('assignments').insert([{date,machine_number:machine,role,employee_id:empId}]);
  await loadAssignmentsForDate(date); buildTableFor(date);
}

let assignModal, assignTitle, assignList;
function setupAssignModal(){ assignModal=document.getElementById('assignModal'); assignTitle=document.getElementById('assignTitle'); assignList=document.getElementById('assignList'); document.getElementById('assignClose').onclick = ()=> assignModal.style.display='none'; assignModal.addEventListener('click',(e)=>{ if(e.target===assignModal) assignModal.style.display='none'; }); }
function openAssignModal(date,machine,roleKey){ assignModal.style.display='flex'; assignTitle.textContent=`Przypisz ${roleKey} (Maszyna ${machine})`; assignList.innerHTML=''; employees.filter(e=>(e.roles||[]).includes(roleKey)).forEach(emp=>{ const b=document.createElement('div'); b.className='employee-btn'; b.textContent=emp.name; b.onclick=async()=>{ await saveAssignment(date,machine,roleKey,emp.id); assignModal.style.display='none'; }; assignList.appendChild(b); }); const clr=document.createElement('button'); clr.textContent='Wyczyść'; clr.className='btn'; clr.onclick=async()=>{ await saveAssignment(date,machine,roleKey,null); assignModal.style.display='none'; }; assignList.appendChild(clr); }

function setupAdminPanel(){
  const adminPanel = document.getElementById('adminPanel');
  document.getElementById('adminLoginBtn').onclick = ()=> adminPanel.style.display = 'flex';
  adminPanel.addEventListener('click',(e)=>{ if(e.target===adminPanel) adminPanel.style.display='none'; });
  document.getElementById('adminLogin').onclick = async ()=>{
    const p = document.getElementById('adminPass').value;
    if(p==='admin123'){ document.getElementById('adminSection').style.display='block'; await refreshAdminMachineList(); }
    else document.getElementById('adminMsg').textContent='Błędne hasło.';
  };
  document.getElementById('addMachineBtn').onclick=async()=>{
    const num = document.getElementById('newMachineNumber').value.trim(); if(!num) return alert('Podaj numer maszyny');
    if(!sb){ machines.push({number:num,ord:machines.length+1,status:'Produkcja'}); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; }
    const { data:cur } = await sb.from('machines').select('ord').order('ord',{ascending:false}).limit(1).maybeSingle();
    const nextOrd = cur?.ord?cur.ord+1:1;
    const { error } = await sb.from('machines').insert([{number:num,ord:nextOrd,default_view:true,status:'Produkcja'}]);
    if(error) return alert('Błąd: '+error.message);
    document.getElementById('newMachineNumber').value=''; await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate);
  };
  document.getElementById('saveMachineOrderBtn').onclick=async()=>{
    const box = document.getElementById('machineListEditable'); const rows = Array.from(box.querySelectorAll('.admin-machine-row'));
    for(let i=0;i<rows.length;i++){ const num = rows[i].dataset.number; if(!sb) continue; await sb.from('machines').update({ord:i+1,default_view:true}).eq('number',num); }
    await loadMachines(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); alert('Zapisano kolejność jako widok domyślny.');
  };
}

async function refreshAdminMachineList(){ const box = document.getElementById('machineListEditable'); box.innerHTML=''; if(!sb){ machines.forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); } else { const { data } = await sb.from('machines').select('*').order('ord',{ascending:true}); (data||[]).forEach(m=>{ const row=document.createElement('div'); row.className='admin-machine-row'; row.dataset.number=m.number; row.innerHTML=`<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`; box.appendChild(row); }); }
  box.querySelectorAll('.remove-machine').forEach(btn=>{ btn.onclick=async(e)=>{ const num=e.target.closest('.admin-machine-row').dataset.number; if(!confirm('Usunąć maszynę '+num+'?')) return; if(!sb){ machines=machines.filter(mm=>mm.number!==num); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); return; } await sb.from('machines').delete().eq('number',num); await loadMachines(); await refreshAdminMachineList(); await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }; });
  let dragSrc=null; box.querySelectorAll('.admin-machine-row').forEach(item=>{ item.draggable=true; item.addEventListener('dragstart',(e)=>{ dragSrc=item; }); item.addEventListener('dragover',(e)=>e.preventDefault()); item.addEventListener('drop',(e)=>{ e.preventDefault(); if(dragSrc && dragSrc!==item) box.insertBefore(dragSrc,item.nextSibling); }); });
}

async function refreshMainTable(){ await loadMachines(); if(currentDate) await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }

async function bootstrap(){
  await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r());
  dateInput=document.getElementById('dateInput'); tbody=document.getElementById('tbody'); theadRow=document.getElementById('theadRow');
  dateInput.value=new Date().toISOString().slice(0,10);
  setupAssignModal(); setupAdminPanel();
  // init supabase client if available
  if(window.supabase && typeof window.supabase.createClient==='function') sb = window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  await loadEmployees(); await loadMachines(); currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate);
  document.getElementById('loadDay').onclick = async ()=>{ currentDate = dateInput.value; await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); };
  const exportBtn = document.getElementById('exportDayBtn'); if(exportBtn) exportBtn.onclick=()=>{ const d=currentDate||dateInput.value; const data=assignments[d]||{}; const headers=['Data','Maszyna','Status',...COLUMNS.slice(2).map(c=>c.title)]; const rows=[headers.join(',')]; const machineList = machines.length?machines:Object.keys(data).map(k=>({number:k})); machineList.forEach(m=>{ const num=m.number||m; const vals = data[num]||[num,'Produkcja','','','','','','','']; rows.push([d,num,vals[1],...vals.slice(2)].join(',')); }); const blob=new Blob([rows.join('\n')],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`assignments-${d}.csv`; a.click(); };
}

bootstrap();
