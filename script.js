// -----------------------------
// script.js — full app with realtime + admin machines + status + export CSV
// -----------------------------


// ---------- Wklej tutaj swoje dane Supabase (UWAŻNIE wklej dokładnie URL bez duplikatów) ----------
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

// statusy maszyny (rozszerzone)
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

// które role są aktywne przy danym statusie
const STATUS_ACTIVE_ROLES = {
  'Produkcja': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy'],
  'Produkcja + Filtry': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry'],
  'Produkcja + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','inserty'],
  'Produkcja + Filtry + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry','inserty'],
  'Konserwacja': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy'],
  'Rozruch': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy'],
  'Bufor': ['operator_focke','operator_protos'],
  'Stop': []
};


let sb = null;

// helper: wait for UMD supabase global
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

/* Realtime */
let realtimeAssignmentsSub = null;
let realtimeEditLockSub = null;
let realtimeMachinesSub = null;
let currentDate = null;

function setupRealtime() {
  // cleanup existing subs
  try {
    if (realtimeAssignmentsSub) { try { realtimeAssignmentsSub.unsubscribe(); } catch(e){} realtimeAssignmentsSub = null; }
    if (realtimeEditLockSub) { try { realtimeEditLockSub.unsubscribe(); } catch(e){} realtimeEditLockSub = null; }
    if (realtimeMachinesSub) { try { realtimeMachinesSub.unsubscribe(); } catch(e){} realtimeMachinesSub = null; }
  } catch(e){ console.warn('cleanup subs error', e); }

  // assignments
  realtimeAssignmentsSub = sb.channel('public:assignments')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments' }, payload => {
      console.log('realtime assignments event', payload);
      try {
        const record = payload.record || payload.new || null;
        const old = payload.old || null;
        const recDate = record && record.date ? record.date : (old ? old.date : null);
        if (!currentDate || !recDate || String(recDate) === String(currentDate)) {
          (async () => {
            await loadAssignmentsForDate(currentDate);
            buildTableFor(currentDate);
          })();
        }
      } catch (err) { console.error('realtime assignments handler error', err); }
    }).subscribe(status => console.log('assignments realtime status', status));

  // edit_lock
  realtimeEditLockSub = sb.channel('public:edit_lock')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'edit_lock' }, payload => {
      console.log('realtime edit_lock event', payload);
      (async () => {
        try {
          const { data, error } = await sb.from('edit_lock').select('*').maybeSingle();
          if (error) { console.error('realtime fetch edit_lock error', error); return; }
          if (data && data.active) {
            document.body.classList.add('readonly');
            console.log('Lock active by', data.locked_by);
          } else {
            document.body.classList.remove('readonly');
            console.log('Lock released (realtime)');
            if (currentDate) { await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }
          }
        } catch (err) { console.error('realtime edit_lock handler error', err); }
      })();
    }).subscribe(status => console.log('edit_lock realtime status', status));

  // machines
  realtimeMachinesSub = sb.channel('public:machines')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, payload => {
      console.log('realtime machines event', payload);
      (async () => {
        await loadMachines();
        if (currentDate) { await loadAssignmentsForDate(currentDate); buildTableFor(currentDate); }
      })();
    }).subscribe(status => console.log('machines realtime status', status));

  console.log('Realtime subscriptions created.');
}

/* ========== DANE / UI ========== */

async function loadEmployees() {
  const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
  if (error) console.error('loadEmployees error', error);
  employees = data || [];
}

async function loadMachines() {
  // load machines used in default view (admin can change default_view)
  const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true }).eq('default_view', true);
  if (error) console.error('loadMachines error', error);
  machines = data || [];
}

async function loadAssignmentsForDate(date) {
  if (!date) return;
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
    if (idx > -1) {
      if (!map[a.machine_number]) {
        // jeśli maszyna nie jest w domyślnym widoku - utwórz wpis (by nadal pokazać przypisanie)
        const row = [a.machine_number, 'Gotowa'];
        for (let i = 2; i < COLUMNS.length; i++) row.push('');
        map[a.machine_number] = row;
      }
      if (emp) map[a.machine_number][idx] = emp.name;
    }
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
  // use machines array for default view order
  machines.forEach(m => {
    const vals = dateData[m.number] || [m.number, m.status || 'Gotowa', '', '', '', '', '', '', ''];
    const tr = document.createElement('tr');
    tr.dataset.machine = m.number;

    // 1) kolumna: tylko numer maszyny
    const tdNum = document.createElement('td');
    tdNum.textContent = m.number;
    tr.appendChild(tdNum);

    // 2) kolumna: status (select) — przeniesione tutaj
    const tdStatus = document.createElement('td');
    const selectStatus = document.createElement('select');
    MACHINE_STATUSES.forEach(st => {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if ((m.status || 'Produkcja') === st) opt.selected = true;
      selectStatus.appendChild(opt);
    });
    selectStatus.disabled = !isAdmin;
    selectStatus.onchange = async (e) => {
  const newStatus = e.target.value;
  try {
    const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', m.number);
    if (error) {
      console.error('Failed to update machine status', error);
      alert('Błąd zapisu statusu: ' + (error.message || JSON.stringify(error)));
      // przywróć poprzednią wartość w select (opcjonalnie: odśwież listę)
      await loadMachines();
      buildTableFor(currentDate);
      return;
    }
    // pomyślnie zapisano — zaktualizuj lokalnie i przerysuj
    await loadMachines();
    if (currentDate) { await loadAssignmentsForDate(currentDate); }
    buildTableFor(currentDate);
  } catch (err) {
    console.error('Exception updating status', err);
    alert('Nieoczekiwany błąd przy zapisie statusu. Sprawdź konsolę.');
  }
};
    tdStatus.appendChild(selectStatus);
    tr.appendChild(tdStatus);

    // 3+) pozostałe kolumny: status-dependent interactivity + kolorowanie
    COLUMNS.slice(2).forEach((col, i) => {
      const idx = i + 2; // index in vals
      const td = document.createElement('td');
      const roleKey = col.key;
      const activeRoles = STATUS_ACTIVE_ROLES[m.status || 'Produkcja'] || [];
      const isActive = activeRoles.includes(roleKey);
      const cellValue = vals[idx] || '';

      // style/class: disabled (czarne), empty (żółte), assigned (biały)
      td.classList.remove('disabled', 'empty-cell', 'assigned-cell');

      if (!isActive) {
        td.classList.add('disabled'); // czarne
        td.textContent = cellValue || ''; // show if exists
      } else {
        if (!cellValue) {
          td.classList.add('empty-cell'); // żółte
          td.textContent = '';
        } else {
          td.classList.add('assigned-cell'); // białe
          td.textContent = cellValue;
        }

        // interactive only when active and not readonly
        if (!document.body.classList.contains('readonly')) {
          td.style.cursor = 'pointer';
          td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key, idx));
        }
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // Also show any machines that have assignments for this date but are not in default view
  Object.keys(dateData).forEach(num => {
    if (!machines.find(mm => mm.number === num)) {
      const vals = dateData[num];
      const tr = document.createElement('tr');
      tr.dataset.machine = num;
      // machine number
      const tdNum = document.createElement('td');
      tdNum.textContent = num + ' (inny)';
      tr.appendChild(tdNum);
      // status placeholder
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


/* przypisywanie */
async function saveAssignment(date, machine, role, empId) {
  await sb.from('assignments').delete().eq('date', date).eq('machine_number', machine).eq('role', role);
  if (empId) {
    await sb.from('assignments').insert([{ date, machine_number: machine, role, employee_id: empId }]);
  }
  await loadAssignmentsForDate(date);
  buildTableFor(date);
}

/* modal przypisania */
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

/* admin panel setup */
const setupAdminPanel = () => {
  const adminPanel = document.getElementById('adminPanel');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminLogin = document.getElementById('adminLogin');
  const adminSection = document.getElementById('adminSection');
  const adminMsg = document.getElementById('adminMsg');
  const closeAdmin = document.getElementById('closeAdmin');

  adminLoginBtn.onclick = () => adminPanel.style.display = 'flex';
  closeAdmin.onclick = () => adminPanel.style.display = 'none';

 adminLogin.onclick = async () => {
  const p = document.getElementById('adminPass').value;
  if (p === ADMIN_PASSWORD) {
    isAdmin = true;
    adminMsg.textContent = "Zalogowano.";
    adminSection.style.display = 'block';

    // odśwież listę maszyn w panelu admina
    await refreshAdminMachineList();

    // PRZED: tabela była zbudowana zanim isAdmin=true — musimy ją przerysować,
    // żeby selecty statusu powstały jako enabled (selectStatus.disabled = !isAdmin)
    try {
      await loadMachines();                       // pobierz aktualną listę (może się zmieniła)
      if (currentDate) {
        await loadAssignmentsForDate(currentDate); // przeładuj przypisania dla bieżącej daty
      }
      buildTableFor(currentDate);                  // przerysuj tabelę — teraz isAdmin === true
    } catch (err) {
      console.error('Error refreshing UI after admin login', err);
    }
  } else {
    adminMsg.textContent = "Błędne hasło.";
  }
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

  // add machine
  document.getElementById('addMachineBtn').onclick = async () => {
    const num = document.getElementById('newMachineNumber').value.trim();
    if (!num) return alert('Podaj numer maszyny');
    const { data: cur, error: e } = await sb.from('machines').select('ord').order('ord', { ascending: false }).limit(1).maybeSingle();
    const nextOrd = cur && cur.ord ? cur.ord + 1 : 1;
    const { error } = await sb.from('machines').insert([{ number: num, ord: nextOrd, default_view: true, status: 'Produkcja' }]);
    if (error) return alert('Błąd: ' + error.message);
    document.getElementById('newMachineNumber').value = '';
    await loadMachines();
    await refreshAdminMachineList();
  };

  document.getElementById('saveMachineOrderBtn').onclick = async () => {
    const box = document.getElementById('machineListEditable');
    const rows = Array.from(box.querySelectorAll('.admin-machine-row'));
    for (let i = 0; i < rows.length; i++) {
      const num = rows[i].dataset.number;
      const { error } = await sb.from('machines').update({ ord: i+1, default_view: true }).eq('number', num);
      if (error) console.error('saveMachineOrderBtn update error', error);
    }
    await loadMachines();
    alert('Zapisano kolejność jako widok domyślny.');
  };

  document.getElementById('forceUnlockBtn').onclick = async () => {
    if (!confirm('Na pewno chcesz wymusić odblokowanie grafiku?')) return;
    const { error } = await sb.from('edit_lock').delete().neq('id', 0);
    if (error) return alert('Błąd przy odblokowaniu: ' + error.message);
    document.body.classList.remove('readonly');
    alert('Zwolniono blokadę.');
  };
};

/* admin: refresh machine list editable */
async function refreshAdminMachineList() {
  const box = document.getElementById('machineListEditable');
  box.innerHTML = '';
  const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true });
  if (error) return console.error('refreshAdminMachineList', error);
  data.forEach(m => {
    const row = document.createElement('div');
    row.className = 'admin-machine-row';
    row.dataset.number = m.number;
    row.innerHTML = `<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`;
    box.appendChild(row);
  });

  box.querySelectorAll('.remove-machine').forEach(btn => {
    btn.onclick = async (e) => {
      const num = e.target.closest('.admin-machine-row').dataset.number;
      if (!confirm('Usunąć maszynę ' + num + '?')) return;
      const { error } = await sb.from('machines').delete().eq('number', num);
      if (error) return alert('Błąd: ' + error.message);
      await loadMachines();
      await refreshAdminMachineList();
    };
  });

  // simple drag & drop reorder
  let dragSrc = null;
  box.querySelectorAll('.admin-machine-row').forEach(item => {
    item.draggable = true;
    item.addEventListener('dragstart', (e) => { dragSrc = item; e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    item.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragSrc && dragSrc !== item) box.insertBefore(dragSrc, item.nextSibling);
    });
  });
}

/* lock (simple) */
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
  await sb.from('edit_lock').delete().neq('id', 0);
  await sb.from('edit_lock').insert([{ active: true, locked_by: userName }]);
}

async function releaseLock() {
  await sb.from('edit_lock').delete().neq('id', 0);
  document.body.classList.remove('readonly');
}

/* init */
async function initApp() {
  try {
    if (!(await checkLock())) return;
    await setLock("Bartek");
    await loadEmployees();
    await loadMachines();
    const date = dateInput.value;
    currentDate = date;
    await loadAssignmentsForDate(date);
    buildTableFor(date);
  } catch (err) {
    console.error('initApp error', err);
  }
}

/* =================== EXPORT CSV =================== */

function toCSVRow(cols) {
  return cols.map(v => {
    if (v === null || typeof v === 'undefined') return '""';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  }).join(',');
}

function downloadBlob(filename, content, mime='text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportDayToCSV(date) {
  if (!date) { alert('Wybierz datę przed eksportem.'); return; }
  const dateData = assignments[date] || {};
  const roleTitles = COLUMNS.slice(2).map(c => c.title);
  const headers = ['Data', 'Maszyna', 'Status', ...roleTitles];
  const rows = [];
  rows.push(toCSVRow(headers));
  const machineList = machines.length ? machines : Object.keys(dateData).map(k => ({ number: k }));
  machineList.forEach(m => {
    const machineNumber = m.number || m;
    const vals = dateData[machineNumber] || [machineNumber, 'Gotowa', '', '', '', '', '', '', ''];
    const row = [date, machineNumber, vals[1] || 'Gotowa', ...vals.slice(2)];
    rows.push(toCSVRow(row));
  });
  const csvContent = rows.join('\r\n');
  const filename = `assignments-${date}.csv`;
  downloadBlob(filename, csvContent);
}

function setupExportButton() {
  const btn = document.getElementById('exportDayBtn');
  if (!btn) return;
  btn.onclick = () => {
    const d = dateInput.value;
    exportDayToCSV(d);
  };
}

/* bootstrap */
async function bootstrap() {
  await new Promise(resolve => {
    if (document.readyState === 'complete' || document.readyState === 'interactive') return resolve();
    document.addEventListener('DOMContentLoaded', resolve);
  });

  dateInput = document.getElementById('dateInput');
  dateInput.value = new Date().toISOString().slice(0,10);
  tbody = document.getElementById('tbody');
  theadRow = document.getElementById('theadRow');

  setupAssignModal();
  setupAdminPanel();
  setupExportButton();

  try {
    console.log('Waiting for Supabase SDK to be available...');
    await waitForSupabaseGlobal(10000);
    console.log('Supabase global is available.');
  } catch (err) {
    console.error('Supabase SDK did not load in time:', err);
    return;
  }

  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    currentDate = dateInput.value;
    setupRealtime();
    console.log('Supabase client created.');
  } catch (err) {
    console.error('Failed to create Supabase client:', err);
    return;
  }

  document.getElementById('loadDay').onclick = async () => {
    const d = dateInput.value;
    currentDate = d;
    await loadAssignmentsForDate(d);
    buildTableFor(d);
  };

  await initApp();

  window.addEventListener('beforeunload', async () => {
    try {
      if (realtimeAssignmentsSub) { try { await realtimeAssignmentsSub.unsubscribe(); } catch(e){} }
      if (realtimeEditLockSub) { try { await realtimeEditLockSub.unsubscribe(); } catch(e){} }
      if (realtimeMachinesSub) { try { await realtimeMachinesSub.unsubscribe(); } catch(e){} }
    } catch(e){}
    // best-effort release lock (do not await strongly)
    releaseLock();
  });
}

bootstrap();
