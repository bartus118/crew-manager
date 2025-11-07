/* ================================================================
   Crew Manager — wersja z ikonami statusów i pełnym obramowaniem wierszy
   Autor: ChatGPT + Bartek
   Opis: Zarządzanie obsadą maszyn produkcyjnych, integracja z Supabase.
================================================================ */

/* ------------------------
   Konfiguracja Supabase
------------------------- */
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';

let sb = null; // klient Supabase

/* ------------------------
   Dane robocze w pamięci
------------------------- */
let employees = [];     // lista pracowników
let machines = [];      // lista maszyn
let assignments = {};   // przypisania (wg dat)
let currentDate = null; // bieżąca data
let dateInput, tbody, theadRow;

/* ------------------------
   Definicja kolumn tabeli
------------------------- */
const COLUMNS = [
  { key: 'maszyna', title: 'Maszyna' },
  { key: 'status', title: 'Status' },
  { key: 'mechanik_focke', title: 'Mechanik Focke' },
  { key: 'mechanik_protos', title: 'Mechanik Protos' },
  { key: 'operator_focke', title: 'Operator Focke' },
  { key: 'operator_protos', title: 'Operator Protos' },
  { key: 'pracownik_pomocniczy', title: 'Pracownik pomocniczy' },
  { key: 'filtry', title: 'Filtry' },
  { key: 'inserty', title: 'Inserty' }
];

/* ------------------------
   Dostępne statusy maszyn
------------------------- */
const MACHINE_STATUSES = [
  'Produkcja',
  'Produkcja + Filtry',
  'Produkcja + Inserty',
  'Produkcja + Filtry + Inserty',
  'Konserwacja',
  'Rozruch',
  'Bufor',
  'Stop'
];

/* ------------------------
   Mapowanie aktywnych ról
   (dla każdego typu statusu)
------------------------- */
const STATUS_ACTIVE_ROLES = {
  'Produkcja': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy'],
  'Produkcja + Filtry': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'filtry'],
  'Produkcja + Inserty': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'inserty'],
  'Produkcja + Filtry + Inserty': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'filtry', 'inserty'],
  'Konserwacja': [],
  'Rozruch': ['mechanik_focke', 'mechanik_protos', 'pracownik_pomocniczy'],
  'Bufor': ['operator_focke', 'operator_protos'],
  'Stop': []
};

/* ================================================================
   ŁADOWANIE DANYCH Z SUPABASE
================================================================ */

/* Pobiera wszystkich pracowników */
async function loadEmployees() {
  const { data, error } = await sb.from('employees').select('*');
  if (error) console.error('Błąd pobierania pracowników:', error);
  employees = data || [];
}

/* Pobiera listę maszyn (domyślny widok) */
async function loadMachines() {
  const { data, error } = await sb
    .from('machines')
    .select('*')
    .order('ord', { ascending: true })
    .eq('default_view', true);
  if (error) console.error('Błąd pobierania maszyn:', error);
  machines = data || [];
}

/* Pobiera przypisania dla wybranego dnia */
async function loadAssignmentsForDate(date) {
  const { data, error } = await sb.from('assignments').select('*').eq('date', date);
  if (error) console.error('Błąd pobierania przypisań:', error);

  const map = {};
  machines.forEach(m => {
    map[m.number] = [m.number, m.status || 'Produkcja'];
    for (let i = 2; i < COLUMNS.length; i++) map[m.number].push('');
  });

  (data || []).forEach(a => {
    const emp = employees.find(e => e.id === a.employee_id);
    const idx = COLUMNS.findIndex(c => c.key === a.role);
    if (idx > -1 && emp) map[a.machine_number][idx] = emp.name;
  });
  assignments[date] = map;
}

/* ================================================================
   FUNKCJE WIZUALNE (TABELA I STATUSY)
================================================================ */

/* Zwraca nazwę klasy CSS dla koloru statusu */
function statusClassFor(s) {
  if (!s) return '';
  const norm = s.toLowerCase();
  if (norm.includes('produkcja')) return 'status-prod';
  if (norm.includes('konserwacja')) return 'status-konserwacja';
  if (norm.includes('rozruch')) return 'status-rozruch';
  if (norm.includes('bufor')) return 'status-bufor';
  if (norm.includes('stop')) return 'status-stop';
  return '';
}

/* Zwraca ikonkę Unicode dla statusu */
function getStatusIcon(status) {
  if (!status) return '';
  const s = status.toLowerCase();

  if (s.includes('produkcja')) {
    const extras = [];
    if (s.includes('filtr')) extras.push('🧰');
    if (s.includes('insert')) extras.push('📦');
    return '🟢' + (extras.length ? extras.join('') : '');
  }
  if (s.includes('konserwacja')) return '🔧';
  if (s.includes('rozruch')) return '🟠⚡';
  if (s.includes('bufor')) return '🔴⏸️';
  if (s.includes('stop')) return '⛔';
  return '';
}

/* Buduje tabelę dla wybranego dnia */
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
    const vals = dateData[m.number] || [m.number, m.status || 'Produkcja', '', '', '', '', '', '', ''];
    const tr = document.createElement('tr');
    tr.dataset.machine = m.number;

    const effectiveStatus = m.status || vals[1] || 'Produkcja';
    const statusCls = statusClassFor(effectiveStatus);
    if (statusCls) tr.classList.add(statusCls); // 🔹 kolor obramowania całego wiersza
    const statusIcon = getStatusIcon(effectiveStatus);

    /* --- kolumna 1: numer maszyny --- */
    const tdNum = document.createElement('td');
    const iconSpan = document.createElement('span');
    iconSpan.className = 'status-icon';
    iconSpan.textContent = statusIcon;
    tdNum.appendChild(iconSpan);
    const textSpan = document.createElement('span');
    textSpan.textContent = m.number;
    tdNum.appendChild(textSpan);
    if (statusCls) tdNum.classList.add(statusCls);
    tr.appendChild(tdNum);

    /* --- kolumna 2: status maszyny (z ikoną + select) --- */
    const tdStatus = document.createElement('td');
    if (statusCls) tdStatus.classList.add(statusCls);
    const statusIconSpan = document.createElement('span');
    statusIconSpan.className = 'status-icon';
    statusIconSpan.textContent = statusIcon;
    tdStatus.appendChild(statusIconSpan);

    const sel = document.createElement('select');
    MACHINE_STATUSES.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if (st === effectiveStatus) opt.selected = true;
      sel.appendChild(opt);
    });

    // po zmianie statusu — zapis do bazy i odświeżenie tabeli
    sel.onchange = async e => {
      const newStatus = e.target.value;
      m.status = newStatus;
      const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', m.number);
      if (error) console.error('Błąd zapisu statusu:', error);
      await loadAssignmentsForDate(date);
      buildTableFor(date);
    };

    tdStatus.appendChild(sel);
    tr.appendChild(tdStatus);

    /* --- pozostałe kolumny --- */
    COLUMNS.slice(2).forEach(col => {
      const td = document.createElement('td');
      const active = (STATUS_ACTIVE_ROLES[m.status || 'Produkcja'] || []).includes(col.key);
      const val = vals[COLUMNS.findIndex(c => c.key === col.key)] || '';

      if (!active) {
        td.classList.add('disabled');
        td.textContent = val || '';
      } else {
        if (!val) td.classList.add('empty-cell');
        else td.classList.add('assigned-cell');
        td.textContent = val;
        td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key));
      }
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* ================================================================
   PRZYPISYWANIE PRACOWNIKÓW
================================================================ */

/* Zapisuje przypisanie (lub usuwa) */
async function saveAssignment(date, machine, role, empId) {
  await sb.from('assignments').delete().eq('date', date).eq('machine_number', machine).eq('role', role);
  if (empId)
    await sb.from('assignments').insert([{ date, machine_number: machine, role, employee_id: empId }]);
  await loadAssignmentsForDate(date);
  buildTableFor(date);
}

/* Modal przypisywania pracownika */
let assignModal, assignTitle, assignList;

function setupAssignModal() {
  assignModal = document.getElementById('assignModal');
  assignTitle = document.getElementById('assignTitle');
  assignList = document.getElementById('assignList');
  document.getElementById('assignClose').onclick = () => (assignModal.style.display = 'none');
}

/* Otwiera modal z listą dostępnych pracowników */
function openAssignModal(date, machine, roleKey) {
  assignModal.style.display = 'flex';
  assignTitle.textContent = `Przypisz ${roleKey} (Maszyna ${machine})`;
  assignList.innerHTML = '';

  employees
    .filter(e => (e.roles || []).includes(roleKey))
    .forEach(emp => {
      const b = document.createElement('div');
      b.className = 'employee-btn';
      b.textContent = emp.name;
      b.onclick = async () => {
        await saveAssignment(date, machine, roleKey, emp.id);
        assignModal.style.display = 'none';
      };
      assignList.appendChild(b);
    });

  const clr = document.createElement('button');
  clr.textContent = 'Wyczyść';
  clr.className = 'btn';
  clr.onclick = async () => {
    await saveAssignment(date, machine, roleKey, null);
    assignModal.style.display = 'none';
  };
  assignList.appendChild(clr);
}

/* ================================================================
   INICJALIZACJA APLIKACJI
================================================================ */
async function bootstrap() {
  await new Promise(r => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r()));
  dateInput = document.getElementById('dateInput');
  tbody = document.getElementById('tbody');
  theadRow = document.getElementById('theadRow');
  dateInput.value = new Date().toISOString().slice(0, 10);

  setupAssignModal();

  // utworzenie klienta Supabase
  sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ładowanie danych i renderowanie tabeli
  await loadEmployees();
  await loadMachines();
  currentDate = dateInput.value;
  await loadAssignmentsForDate(currentDate);
  buildTableFor(currentDate);

  // przycisk "Załaduj"
  document.getElementById('loadDay').onclick = async () => {
    currentDate = dateInput.value;
    await loadAssignmentsForDate(currentDate);
    buildTableFor(currentDate);
  };
}

/* Uruchomienie aplikacji */
bootstrap();
