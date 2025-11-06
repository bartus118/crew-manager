// KONFIGURACJA SUPABASE
const SUPABASE_URL = 'https://TWÓJ_PROJEKT.supabase.co';
const SUPABASE_ANON_KEY = 'TWÓJ_PUBLICZNY_ANON_KEY';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ADMIN_PASSWORD = "admin123";
let isAdmin = false;

let employees = [];
let machines = [];
let assignments = {};
const dateInput = document.getElementById('dateInput');
dateInput.value = new Date().toISOString().slice(0,10);

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

const tbody = document.getElementById('tbody');
const theadRow = document.getElementById('theadRow');

/* =================== BLOKADA EDYCJI =================== */
async function checkLock() {
  const { data } = await sb.from('edit_lock').select('*').eq('active', true).maybeSingle();
  if (data && data.active) {
    alert(`Grafik jest obecnie edytowany przez ${data.locked_by}`);
    document.body.classList.add('readonly');
    return false;
  }
  return true;
}

async function setLock(userName) {
  await sb.from('edit_lock').delete().neq('id', 0);
  await sb.from('edit_lock').insert([{ active: true, locked_by: userName }]);
}

async function releaseLock() {
  await sb.from('edit_lock').delete().neq('id', 0);
}

/* =================== ŁADOWANIE DANYCH =================== */

async function loadEmployees() {
  const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
  if (error) console.error(error);
  employees = data || [];
}

async function loadMachines() {
  const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true });
  if (error) console.error(error);
  machines = data || [];
}

async function loadAssignmentsForDate(date) {
  const { data, error } = await sb.from('assignments').select('*').eq('date', date);
  if (error) console.error(error);
  const map = {};
  machines.forEach(m => {
    const row = [m.number, 'Gotowa'];
    for (let i = 2; i < COLUMNS.length; i++) row.push('');
    map[m.number] = row;
  });
  data.forEach(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const idx = COLUMNS.findIndex(c => c.key === a.role);
    if (idx > -1 && emp) map[a.machine_number][idx] = emp.name;
  });
  assignments[date] = map;
}

/* =================== RYSOWANIE TABELI =================== */
function buildTableFor(date) {
  const dateData = assignments[date] || {};
  theadRow.innerHTML = '';
  COLUMNS.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.title;
    theadRow.appendChild(th);
  });

  tbody.innerHTML = '';
  machines.forEach(m => {
    const vals = dateData[m.number] || [m.number, 'Gotowa', '', '', '', '', '', '', ''];
    const tr = document.createElement('tr');
    tr.dataset.machine = m.number;
    COLUMNS.forEach((col, i) => {
      const td = document.createElement('td');
      td.textContent = vals[i] || '';
      if (i > 0 && !document.body.classList.contains('readonly')) {
        td.style.cursor = 'pointer';
        td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key, i));
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* =================== PRZYPISANIA =================== */
async function saveAssignment(date, machine, role, empId) {
  await sb.from('assignments').delete().eq('date', date).eq('machine_number', machine).eq('role', role);
  if (empId) {
    await sb.from('assignments').insert([{ date, machine_number: machine, role, employee_id: empId }]);
  }
  await loadAssignmentsForDate(date);
  buildTableFor(date);
}

/* =================== MODAL PRZYPISANIA =================== */
const assignModal = document.getElementById('assignModal');
const assignTitle = document.getElementById('assignTitle');
const assignInfo = document.getElementById('assignInfo');
const assignList = document.getElementById('assignList');
document.getElementById('assignClose').addEventListener('click', () => assignModal.style.display = 'none');

function openAssignModal(date, machine, roleKey) {
  assignModal.style.display = 'flex';
  assignTitle.textContent = `Przypisz — ${roleKey.replace('_', ' ')} (Maszyna ${machine})`;
  assignInfo.textContent = 'Kliknij, aby przypisać pracownika.';

  const list = employees.filter(e => (e.roles || []).includes(roleKey));
  assignList.innerHTML = '';

  list.forEach(emp => {
    const btn = document.createElement('div');
    btn.className = 'employee-btn';
    btn.textContent = emp.name + (emp.bu ? ' · ' + emp.bu : '');
    btn.onclick = async () => {
      await saveAssignment(date, machine, roleKey, emp.id);
      assignModal.style.display = 'none';
    };
    assignList.appendChild(btn);
  });

  const clear = document.createElement('button');
  clear.textContent = 'Wyczyść przypisanie';
  clear.className = 'btn';
  clear.onclick = async () => {
    await saveAssignment(date, machine, roleKey, null);
    assignModal.style.display = 'none';
  };
  assignList.appendChild(clear);
}

/* =================== PANEL ADMINA =================== */
const adminPanel = document.getElementById('adminPanel');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLogin = document.getElementById('adminLogin');
const adminSection = document.getElementById('adminSection');
const adminMsg = document.getElementById('adminMsg');

adminLoginBtn.onclick = () => adminPanel.style.display = 'flex';
document.getElementById('closeAdmin').onclick = () => adminPanel.style.display = 'none';
adminLogin.onclick = () => {
  const p = document.getElementById('adminPass').value;
  if (p === ADMIN_PASSWORD) {
    isAdmin = true;
    adminMsg.textContent = "Zalogowano.";
    adminSection.style.display = 'block';
  } else adminMsg.textContent = "Błędne hasło.";
};

document.getElementById('adminExportEmpBtn').onclick = async () => {
  const { data, error } = await sb.from('employees').select('*');
  if (error) return alert('Błąd: ' + error.message);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'employees.json';
  a.click();
};

/* =================== INICJALIZACJA =================== */
async function init() {
  if (!(await checkLock())) return;
  await setLock("Bartek");
  await loadEmployees();
  await loadMachines();
  const date = dateInput.value;
  await loadAssignmentsForDate(date);
  buildTableFor(date);
}

document.getElementById('loadDay').onclick = async () => {
  const d = dateInput.value;
  await loadAssignmentsForDate(d);
  buildTableFor(d);
};

window.onload = init;
window.addEventListener('beforeunload', releaseLock);
