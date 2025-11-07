// crew_manager_clean.js — wersja bez blokad, z admin panelem i realtime

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
  const { data } = await sb.from('employees').select('*');
  employees = data || [];
}
async function loadMachines() {
  const { data } = await sb.from('machines').select('*').order('ord', { ascending: true }).eq('default_view', true);
  machines = data || [];
}
async function loadAssignmentsForDate(date) {
  const { data } = await sb.from('assignments').select('*').eq('date', date);
  const map = {};
  machines.forEach(m => { map[m.number] = [m.number, m.status || 'Produkcja']; for(let i=2;i<COLUMNS.length;i++) map[m.number].push(''); });
  (data||[]).forEach(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const idx = COLUMNS.findIndex(c => c.key === a.role);
    if (idx > -1 && emp) map[a.machine_number][idx] = emp.name;
  });
  assignments[date] = map;
}
function buildTableFor(date) {
  const data = assignments[date] || {};
  theadRow.innerHTML = ''; COLUMNS.forEach(c => { const th = document.createElement('th'); th.textContent = c.title; theadRow.appendChild(th); });
  tbody.innerHTML = '';
  machines.forEach(m => {
    const vals = data[m.number] || [m.number, m.status || 'Produkcja'];
    const tr = document.createElement('tr'); tr.dataset.machine = m.number;
    const tdNum = document.createElement('td'); tdNum.textContent = m.number; tr.appendChild(tdNum);
    const tdStatus = document.createElement('td'); const sel = document.createElement('select');
    MACHINE_STATUSES.forEach(st => { const opt=document.createElement('option'); opt.value=st; opt.textContent=st; if(st===m.status) opt.selected=true; sel.appendChild(opt); });
    sel.onchange = async(e)=>{ const res=await sb.from('machines').update({status:e.target.value}).eq('number',m.number); if(!res.error){await loadMachines();await loadAssignmentsForDate(date);buildTableFor(date);} };
    tdStatus.appendChild(sel); tr.appendChild(tdStatus);
    COLUMNS.slice(2).forEach(col=>{
      const td=document.createElement('td'); const active=STATUS_ACTIVE_ROLES[m.status||'Produkcja']?.includes(col.key);
      const val = vals[COLUMNS.findIndex(c=>c.key===col.key)] || '';
      td.textContent=val; td.className = !active ? 'disabled' : (val ? 'assigned-cell' : 'empty-cell');
      if(active) td.addEventListener('dblclick',()=>openAssignModal(date,m.number,col.key));
      tr.appendChild(td);
    }); tbody.appendChild(tr);
  });
}
async function saveAssignment(date, machine, role, empId) {
  await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role);
  if(empId) await sb.from('assignments').insert([{date,machine_number:machine,role,employee_id:empId}]);
  await loadAssignmentsForDate(date); buildTableFor(date);
}
let assignModal,assignTitle,assignList;
function setupAssignModal() {
  assignModal=document.getElementById('assignModal');assignTitle=document.getElementById('assignTitle');assignList=document.getElementById('assignList');
  document.getElementById('assignClose').onclick=()=>assignModal.style.display='none';
}
function openAssignModal(date,machine,roleKey){
  assignModal.style.display='flex';assignTitle.textContent=`Przypisz ${roleKey} (Maszyna ${machine})`;assignList.innerHTML='';
  employees.filter(e=>(e.roles||[]).includes(roleKey)).forEach(emp=>{const b=document.createElement('div');b.className='employee-btn';b.textContent=emp.name;b.onclick=async()=>{await saveAssignment(date,machine,roleKey,emp.id);assignModal.style.display='none';};assignList.appendChild(b);});
  const clr=document.createElement('button');clr.textContent='Wyczyść';clr.className='btn';clr.onclick=async()=>{await saveAssignment(date,machine,roleKey,null);assignModal.style.display='none';};assignList.appendChild(clr);
}
async function bootstrap(){
  await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r());
  dateInput=document.getElementById('dateInput');tbody=document.getElementById('tbody');theadRow=document.getElementById('theadRow');
  dateInput.value=new Date().toISOString().slice(0,10);
  setupAssignModal();
  sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  await loadEmployees();await loadMachines();currentDate=dateInput.value;await loadAssignmentsForDate(currentDate);buildTableFor(currentDate);
  document.getElementById('loadDay').onclick=async()=>{currentDate=dateInput.value;await loadAssignmentsForDate(currentDate);buildTableFor(currentDate);};
}
bootstrap();
