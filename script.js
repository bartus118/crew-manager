// -----------------------------
// script.js — robust bootstrap
// -----------------------------

// ---------- Wklej tutaj swoje dane Supabase ----------
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
// ----------------------------------------------------

const ADMIN_PASSWORD = "admin123";
let isAdmin = false;

let employees = [];
let machines = [];
let assignments = {};

let dateInput, tbody, theadRow;

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

let sb = null;

/* ========== helper: czekaj na global window.supabase ========== */
function waitForSupabaseGlobal(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === 'function') return resolve(window.supabase);
    const interval = 100;
    let waited = 0;
    const id = setInterval(() => {
      if (window.supabase && typeof window.supabase.createClient === 'function') {
        clearInterval(id);
        return resolve(window.supabase);
      }
      waited += interval;
      if (waited >= timeoutMs) {
        clearInterval(id);
        return reject(new Error('Timeout waiting for Supabase global'));
      }
    }, interval);
  });
}

/* =================== DANE / UI =================== */

async function loadEmployees() {
  const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
  if (error) console.error('loadEmployees error', error);
  employees = data || [];
}

async function loadMachines() {
  const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true });
  if (error) console.error('loadMachines error', error);
  machines = data || [];
}

async function loadAssignmentsForDate(date) {
  const { data, error } = await sb.from('assignments').select('*').eq('date', date);
  if (error) console.error('loadAssignmentsForDate error', error);
  const map = {};
  machines.forEach(m => {
    const row = [m.number, 'Gotowa'];
    for (let i = 2; i < COLUMNS.length; i++) row.push('');
    map[m.number] = row;
  });
  (data || []).forEach(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const idx = COLUMNS.findIndex(c => c.key === a.role);
    if (idx > -1 && emp) map[a.machine_number][idx] = emp.name;
  });
  assignments[date] = map;
}

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
  const del = await sb.from('assignments').delete().eq('date', date).eq('machine_number', machine).eq('role', role);
  if (del.error) console.error('delete assignment error', del.error);
  if (empId) {
    const ins = await sb.from('assignments').insert([{ date, machine_number: machine, role, employee_id: empId }]);
    if (ins.error) console.error('insert assignment error', ins.error);
  }
  await loadAssignmentsForDate(date);
  buildTableFor(date);
}

/* =================== MODAL PRZYPISANIA =================== */
let assignModal, assignTitle, assignInfo, assignList;
function setupAssignModal() {
  assignModal = document.getElementById('assignModal');
  assignTitle = document.getElementById('assignTitle');
  assignInfo = document.getElementById('assignInfo');
  assignList = document.getElementById('assignList');
  document.getElementById('assignClose').addEventListener('click', () => assignModal.style.display = 'none');
}

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
const setupAdminPanel = () => {
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
};

/* =================== BLOKADA EDYCJI =================== */
async function checkLock() {
  const { data, error } = await sb.from('edit_lock').select('*').eq('active', true).maybeSingle();
  if (error) console.error('checkLock error', error);
  if (data && data.active) {
    alert(`Grafik jest obecnie edytowany przez ${data.locked_by}`);
    document.body.classList.add('readonly');
    return false;
  }
  return true;
}

async function setLock(userName) {
  const del = await sb.from('edit_lock').delete().neq('id', 0);
  if (del.error) console.error('setLock delete error', del.error);
  const ins = await sb.from('edit_lock').insert([{ active: true, locked_by: userName }]);
  if (ins.error) console.error('setLock insert error', ins.error);
}

async function releaseLock() {
  const del = await sb.from('edit_lock').delete().neq('id', 0);
  if (del.error) console.error('releaseLock delete error', del.error);
}

/* =================== INICJALIZACJA =================== */
async function initApp() {
  try {
    if (!(await checkLock())) return;
    await setLock("Bartek");
    await loadEmployees();
    await loadMachines();
    const date = dateInput.value;
    await loadAssignmentsForDate(date);
    buildTableFor(date);
  } catch (err) {
    console.error('initApp error', err);
  }
}

/* =================== BOOTSTRAP =================== */
async function bootstrap() {
  // czekaj na DOM
  await new Promise(resolve => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') return resolve();
    document.addEventListener('DOMContentLoaded', resolve);
  });

  // referencje DOM
  dateInput = document.getElementById('dateInput');
  dateInput.value = new Date().toISOString().slice(0,10);
  tbody = document.getElementById('tbody');
  theadRow = document.getElementById('theadRow');

  setupAssignModal();
  setupAdminPanel();

  // czekaj na global supabase (UMD)
  try {
    console.log('Waiting for Supabase SDK to be available...');
    await waitForSupabaseGlobal(10000);
    console.log('Supabase global is available.');
  } catch (err) {
    console.error('Supabase SDK did not load in time:', err);
    return;
  }

  // utwórz klienta
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client created.');
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return;
  }

  // podpięcie przycisków
  document.getElementById('loadDay').onclick = async () => {
    const d = dateInput.value;
    await loadAssignmentsForDate(d);
    buildTableFor(d);
  };

  // start
  await initApp();

  // odblokowanie przy zamknięciu
  window.addEventListener('beforeunload', releaseLock);
}

bootstrap();
