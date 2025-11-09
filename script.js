/**
 * script.js — Crew Manager
 * Wersja: z wymuszeniem trybu online (edycja tylko gdy Supabase dostępny).
 *
 * Główne założenia:
 * - Wszystkie zmiany (dodawanie maszyn, przypisania) wymagają połączenia z Supabase.
 * - Gdy brak połączenia => UI blokuje operacje edycyjne i wyświetla baner.
 * - Modale dodają/usuń klasę body.modal-open by zapobiec przewijaniu tła.
 * - Po zmianie statusu wiersz i komórki otrzymują natychmiastowe klasy wizualne.
 *
 * Uwaga: w tym pliku NIE korzystam z localStorage do przechowywania maszyn
 * (edycja offline jest zablokowana). Jeśli chcesz później włączyć synchronizację offline,
 * mogę dodać to jako opcję.
 */

/* -------------------- KONFIGURACJA SUPABASE (wstaw swoje dane) -------------------- */
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
/* --------------------------------------------------------------------------------- */

let sb = null; // klient Supabase (null = offline)
let employees = []; // lista pracowników (pobrana z DB)
let machines = [];  // lista maszyn (pobrana z DB lub default)
let assignments = {}; // przypisania per data: assignments[date] = { machineNumber: [ ...row values...] }

let dateInput, tbody, theadRow;
let currentDate = null;

// Kolumny tabeli (pierwsze dwa to Maszyna/Status, reszta role)
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

const MACHINE_STATUSES = [
  'Produkcja','Produkcja + Filtry','Produkcja + Inserty',
  'Produkcja + Filtry + Inserty','Konserwacja','Rozruch','Bufor','Stop'
];

const STATUS_ACTIVE_ROLES = {
  'Produkcja': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy'],
  'Produkcja + Filtry': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry'],
  'Produkcja + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','inserty'],
  'Produkcja + Filtry + Inserty': ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','filtry','inserty'],
  'Konserwacja': [], 
  'Rozruch': ['mechanik_focke','mechanik_protos','pracownik_pomocniczy'],
  'Bufor': ['operator_focke','operator_protos'],
  'Stop': []
};

const DEFAULT_MACHINES = ['11','12','15','16','17','18','21','22','24','25','26','27','28','31','32','33','34','35','94','96'];

/* -------------------- pomoc: czekaj na globalny SDK Supabase -------------------- */
function waitForSupabaseGlobal(timeoutMs = 8000){
  return new Promise((resolve,reject)=>{
    if(window.supabase && typeof window.supabase.createClient === 'function') return resolve(window.supabase);
    let waited = 0;
    const iv = setInterval(()=>{
      if(window.supabase && typeof window.supabase.createClient === 'function'){
        clearInterval(iv);
        return resolve(window.supabase);
      }
      waited += 200;
      if(waited >= timeoutMs){
        clearInterval(iv);
        return reject(new Error('Timeout waiting for Supabase SDK'));
      }
    },200);
  });
}

/* -------------------- inicjalizacja klienta Supabase -------------------- */
async function initSupabase(){
  try{
    await waitForSupabaseGlobal();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase ready');
  }catch(e){
    console.warn('Supabase not available — tryb offline (odczyt tylko).', e);
    sb = null;
  }
}

/* -------------------- ładowanie pracowników -------------------- */
async function loadEmployees(){
  if(!sb){ employees = []; return; }
  try{
    const { data, error } = await sb.from('employees').select('*').order('name',{ascending:true});
    if(error){ console.error('loadEmployees error', error); employees = []; }
    else employees = data || [];
  }catch(e){
    console.error('loadEmployees catch', e);
    employees = [];
  }
}

/* -------------------- ładowanie maszyn --------------------
   - jeśli online: pobierz z tabeli machines (default_view=true)
   - jeśli offline: ustaw listę DEFAULT_MACHINES (tryb odczytu tylko)
----------------------------------------------------------------------------- */
async function loadMachines(){
  if(!sb){
    machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
    return;
  }

  try{
    const { data, error } = await sb.from('machines').select('*').order('ord',{ascending:true}).eq('default_view',true);
    if(error){ console.error('loadMachines error', error); machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' })); return; }
    machines = (data && data.length) ? data.map(d=>({ number: String(d.number), ord: d.ord || 9999, status: d.status || 'Produkcja' })) : DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status:'Produkcja' }));
  }catch(e){
    console.error('loadMachines catch', e);
    machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
  }
}

/* -------------------- ładowanie przypisań dla konkretnej daty --------------------
   - pobiera wiersze z tabeli 'assignments' w Supabase (jeśli online)
   - jeżeli napotkamy numer maszyny którego nie ma w current `machines`:
       - jeśli online: dodajemy go do tabeli 'machines' (automatycznie "na stałe")
       - jeśli offline: przypisania nie są pobierane (funkcja wcześniej zwróciła)
----------------------------------------------------------------------------- */
async function loadAssignmentsForDate(date){
  if(!date) return;
  if(!sb){ assignments[date] = {}; return; }

  try{
    const { data, error } = await sb.from('assignments').select('*').eq('date', date);
    if(error){ console.error('loadAssignmentsForDate error', error); assignments[date] = {}; return; }

    // przygotuj mapę wierszy dla wszystkich maszyn (występujących w current machines)
    const map = {};
    machines.forEach(m=>{
      map[m.number] = [m.number, m.status || 'Produkcja'];
      for(let i=2;i<COLUMNS.length;i++) map[m.number].push('');
    });

    // przeglądamy wszystkie wiersze przypisań
    (data||[]).forEach(a=>{
      // jeśli pojawi się maszyna której nie ma w machines, dodajemy ją na stałe do DB (online)
      if(!machines.find(mm => String(mm.number) === String(a.machine_number))){
        const newMachine = { number: String(a.machine_number), ord: (machines.length ? machines[machines.length-1].ord + 1 : machines.length+1), status: 'Produkcja' };
        machines.push(newMachine);
        // persist do DB asynchronicznie (nie blokujemy renderowania)
        sb.from('machines').insert([{ number: newMachine.number, ord: newMachine.ord, default_view:true, status: newMachine.status }])
          .then(res => {
            if(res.error) console.warn('Nie udało się zsyncować nowej maszyny do DB', res.error);
          }).catch(err => console.warn('sync new machine error', err));
        // zainicjuj w mapie nowy wiersz
        map[newMachine.number] = [newMachine.number, newMachine.status];
        for(let i=2;i<COLUMNS.length;i++) map[newMachine.number].push('');
      }

      // standardowa logika wpisania pracownika do właściwej kolumny
      const emp = employees.find(e=>e.id === a.employee_id);
      const idx = COLUMNS.findIndex(c=>c.key === a.role);
      if(idx > -1){
        if(!map[a.machine_number]){
          const row=[a.machine_number,'Produkcja'];
          for(let i=2;i<COLUMNS.length;i++) row.push('');
          map[a.machine_number] = row;
        }
        if(emp) map[a.machine_number][idx] = emp.name;
      }
    });

    assignments[date] = map;
  }catch(e){
    console.error('loadAssignmentsForDate catch', e);
    assignments[date] = {};
  }
}

/* -------------------- pomoc: przypisanie klasy statusowej -------------------- */
function statusClassFor(status){
  if(!status) return '';
  const s = String(status).toLowerCase();
  if(s.includes('produkcja')) return 'status-prod';
  if(s.includes('konserwacja')) return 'status-konserwacja';
  if(s.includes('rozruch')) return 'status-rozruch';
  if(s.includes('bufor')) return 'status-bufor';
  if(s.includes('stop')) return 'status-stop';
  return '';
}

/* -------------------- budowanie tabeli widoku na podstawie assignments i machines -------------------- */
function buildTableFor(date){
  const dateData = assignments[date] || {};
  theadRow.innerHTML = '';
  COLUMNS.forEach(c=>{
    const th = document.createElement('th');
    th.textContent = c.title;
    theadRow.appendChild(th);
  });
  tbody.innerHTML = '';

  // iterujemy przez listę maszyn (machines) — wszystkie muszą być tu obecne
  machines.forEach(m => {
    const vals = dateData[m.number] || [m.number, m.status || 'Produkcja'];
    const tr = document.createElement('tr');
    tr.dataset.machine = m.number;

    // status i klasy
    const effectiveStatus = m.status || vals[1] || 'Produkcja';
    const statusCls = statusClassFor(effectiveStatus);
    if(statusCls) tr.classList.add(statusCls);

    // kolumna: numer maszyny
    const tdNum = document.createElement('td');
    tdNum.textContent = m.number;
    if(statusCls) tdNum.classList.add(statusCls);
    tr.appendChild(tdNum);

    // kolumna: select status
    const tdStatus = document.createElement('td');
    if(statusCls) tdStatus.classList.add(statusCls);
    const selectStatus = document.createElement('select');
    MACHINE_STATUSES.forEach(st=>{
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = st;
      if((m.status || effectiveStatus) === st) opt.selected = true;
      selectStatus.appendChild(opt);
    });

    // natychmiastowe nadanie klasy po zmianie statusu
    selectStatus.onchange = async (e) => {
      const newStatus = e.target.value;
      const newCls = statusClassFor(newStatus);

      // usuń stare klasy statusowe z wiersza i dwóch pierwszych komórek
      tr.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdNum.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdStatus.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');

      // dodaj nową klasę jeśli występuje
      if(newCls){
        tr.classList.add(newCls);
        tdNum.classList.add(newCls);
        tdStatus.classList.add(newCls);
      }

      // lokalna aktualizacja modelu
      m.status = newStatus;

      // zapis do DB — tylko jeśli online
      if(!sb){
        alert('Brak połączenia z serwerem — zmiana statusu jest zablokowana.');
        // przywróć poprzedni status w select (odśwież tabelę)
        await loadMachines();
        await loadAssignmentsForDate(date);
        buildTableFor(date);
        return;
      }

      try{
        const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', m.number);
        if(error) console.error('update machine status error', error);
      }catch(err){
        console.error('update machine status catch', err);
      }

      // odśwież widok z DB
      await loadAssignmentsForDate(date);
      buildTableFor(date);
    };

    tdStatus.appendChild(selectStatus);
    tr.appendChild(tdStatus);

    // kolumny ról — aktywne / nieaktywne w zależności od statusu
    COLUMNS.slice(2).forEach(col => {
      const td = document.createElement('td');
      const active = (STATUS_ACTIVE_ROLES[m.status || effectiveStatus] || []).includes(col.key);
      const idx = COLUMNS.findIndex(c => c.key === col.key);
      const val = vals[idx] || '';

      if(!active){
        td.classList.add('disabled');
        td.textContent = val || '';
      } else {
        if(!val) td.classList.add('empty-cell');
        else td.classList.add('assigned-cell');
        td.textContent = val;
        td.style.cursor = 'pointer';
        // podwójny klik otwiera modal przypisania — ale enforceOnlineMode może blokować otwarcie
        td.addEventListener('dblclick', () => openAssignModal(date, m.number, col.key));
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  // UWAGA: nie tworzymy już "tymczasowych" wierszy dla maszyn spoza widoku — 
  // wszystkie nowe maszyny, jeśli istnieją w przypisaniach, zostały wcześniej dodane do machines.
}

/* -------------------- zapis przypisania (tylko online) --------------------
   - offline: pokazujemy alert i nic nie zapisujemy
   - online: usuwamy istniejące przypisanie dla daty/maszyny/roli i wstawiamy nowe
----------------------------------------------------------------------------- */
async function saveAssignment(date,machine,role,empId){
  if(!sb){
    alert('Brak połączenia z serwerem — zapisywanie przypisań jest zablokowane. Proszę połącz się z Supabase i spróbuj ponownie.');
    return;
  }
  try{
    await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role);
    if(empId){
      await sb.from('assignments').insert([{ date, machine_number: machine, role, employee_id: empId }]);
    }
    await loadAssignmentsForDate(date);
    buildTableFor(date);
  }catch(e){
    console.error('saveAssignment error', e);
    alert('Błąd podczas zapisu przypisania: ' + (e.message || e));
  }
}

/* -------------------- MODAL PRZYPISANIA --------------------
   - funkcje setup/open z obsługą body.modal-open
----------------------------------------------------------------------------- */
let assignModal, assignTitle, assignInfo, assignList;

/**
 * setupAssignModal — przypina zdarzenia zamykania modala i ustawia referencje
 */
function setupAssignModal(){
  assignModal = document.getElementById('assignModal');
  assignTitle = document.getElementById('assignTitle');
  assignInfo = document.getElementById('assignInfo');
  assignList = document.getElementById('assignList');

  const closeBtn = document.getElementById('assignClose');
  if(closeBtn) closeBtn.addEventListener('click', ()=>{
    assignModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  });

  // kliknięcie poza modalem zamyka
  assignModal.addEventListener('click', (e)=>{
    if(e.target === assignModal){
      assignModal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  });
}

/**
 * openAssignModal — otwiera modal przypisania.
 * Uwaga: enforceOnlineMode może nadpisać albo zablokować jego działanie jeśli offline.
 */
function openAssignModal(date, machine, roleKey){
  // jeżeli offline enforceOnlineMode mógł nadpisać openAssignModal (patrz enforceOnlineMode)
  assignModal.style.display = 'flex';
  document.body.classList.add('modal-open');

  assignTitle.textContent = `Przypisz — ${roleKey.replace('_',' ')} (Maszyna ${machine})`;
  assignInfo.textContent = 'Kliknij, aby przypisać pracownika.';
  assignList.innerHTML = '';

  // lista pracowników pasujących do roli
  const list = employees.filter(e => (e.roles || []).includes(roleKey));
  list.forEach(emp=>{
    const b = document.createElement('div');
    b.className = 'employee-btn';
    b.textContent = emp.name + (emp.bu ? (' · ' + emp.bu) : '');
    b.onclick = async () => {
      await saveAssignment(date, machine, roleKey, emp.id);
      assignModal.style.display = 'none';
      document.body.classList.remove('modal-open');
    };
    assignList.appendChild(b);
  });

  // przycisk czyszczenia przypisania
  const clear = document.createElement('button');
  clear.className = 'btn';
  clear.textContent = 'Wyczyść przypisanie';
  clear.onclick = async ()=>{
    await saveAssignment(date, machine, roleKey, null);
    assignModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
  assignList.appendChild(clear);
}

/* -------------------- PANEL ADMINA --------------------
   - dodawanie maszyn wymaga połączenia z Supabase (online-only)
   - blokowane przy offline
----------------------------------------------------------------------------- */
function setupAdminPanel(){
  const adminPanel = document.getElementById('adminPanel');
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  const adminLogin = document.getElementById('adminLogin');
  const adminMsg = document.getElementById('adminMsg');
  const adminSection = document.getElementById('adminSection');
  const adminCloseNoLogin = document.getElementById('adminCloseNoLogin');
  const adminCloseNoLoginBtn = document.getElementById('adminCloseNoLoginBtn');
  const closeAdmin = document.getElementById('closeAdmin');

  // otwórz panel — będzie zablokowany jeśli offline przez enforceOnlineMode
  if(adminLoginBtn) adminLoginBtn.onclick = ()=>{
    adminPanel.style.display = 'flex';
    document.body.classList.add('modal-open');
  };

  if(adminCloseNoLogin) adminCloseNoLogin.addEventListener('click', ()=>{
    adminPanel.style.display = 'none';
    document.body.classList.remove('modal-open');
  });

  if(adminCloseNoLoginBtn) adminCloseNoLoginBtn.addEventListener('click', ()=>{
    adminPanel.style.display = 'none';
    document.body.classList.remove('modal-open');
  });

  adminPanel.addEventListener('click', (e)=>{
    if(e.target === adminPanel){
      adminPanel.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  });

  // proste logowanie admin (lokalne)
  if(adminLogin) adminLogin.onclick = async ()=>{
    const p = document.getElementById('adminPass').value;
    if(p === 'admin123'){
      adminSection.style.display = 'block';
      adminMsg.textContent = 'Zalogowano.';
      await refreshAdminMachineList();
    } else {
      adminMsg.textContent = 'Błędne hasło.';
    }
  };

  // Dodawanie maszyny (tylko online) — handler
  const addBtn = document.getElementById('addMachineBtn');
  if(addBtn) addBtn.onclick = async () => {
    if(!sb){
      alert('Brak połączenia z serwerem — dodawanie maszyn jest zablokowane. Połącz się z Supabase, aby dodać nową maszynę.');
      return;
    }
    const num = document.getElementById('newMachineNumber').value.trim();
    if(!num) return alert('Podaj numer maszyny');

    try{
      // sprawdź duplikat w DB
      const { data: exists } = await sb.from('machines').select('*').eq('number', num).limit(1);
      if(exists && exists.length){
        alert('Maszyna o takim numerze już istnieje w bazie.');
        return;
      }

      const { data: cur } = await sb.from('machines').select('ord').order('ord',{ascending:false}).limit(1).maybeSingle();
      const nextOrd = cur?.ord ? cur.ord + 1 : (machines.length ? machines[machines.length-1].ord + 1 : 1);
      const { error } = await sb.from('machines').insert([{ number: String(num), ord: nextOrd, default_view:true, status:'Produkcja' }]);
      if(error) return alert('Błąd: ' + error.message);

      document.getElementById('newMachineNumber').value = '';
      await loadMachines();
      await refreshAdminMachineList();
      await loadAssignmentsForDate(currentDate);
      buildTableFor(currentDate);
    }catch(e){
      console.error('addMachine error', e);
      alert('Błąd podczas dodawania maszyny.');
    }
  };

  // zapis kolejności maszyn (tylko online)
  const saveOrderBtn = document.getElementById('saveMachineOrderBtn');
  if(saveOrderBtn) saveOrderBtn.onclick = async ()=>{
    if(!sb){
      alert('Brak połączenia z serwerem — zapis kolejności jest zablokowany.');
      return;
    }
    const box = document.getElementById('machineListEditable');
    const rows = Array.from(box.querySelectorAll('.admin-machine-row'));
    for(let i=0;i<rows.length;i++){
      const num = rows[i].dataset.number;
      if(!sb) continue;
      await sb.from('machines').update({ ord: i+1, default_view:true }).eq('number', num);
    }
    await loadMachines();
    await loadAssignmentsForDate(currentDate);
    buildTableFor(currentDate);
    alert('Zapisano kolejność jako widok domyślny.');
  };

  // eksport pracowników (tylko online)
  const exportBtn = document.getElementById('adminExportEmpBtn');
  if(exportBtn) exportBtn.onclick = async ()=>{
    if(!sb) return alert('Brak połączenia z Supabase.');
    const { data, error } = await sb.from('employees').select('*');
    if(error) return alert('Błąd: ' + error.message);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'employees.json';
    a.click();
  };

  if(closeAdmin) closeAdmin.onclick = ()=>{
    adminPanel.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
}

/* -------------------- Lista maszyn do edycji w panelu admina -------------------- */
async function refreshAdminMachineList(){
  const box = document.getElementById('machineListEditable');
  if(!box) return;
  box.innerHTML = '';

  if(!sb){
    // offline: pokaz tylko lokalną listę (DEFAULT) — bez opcji edycji
    machines.forEach(m=>{
      const row = document.createElement('div');
      row.className = 'admin-machine-row';
      row.dataset.number = m.number;
      row.innerHTML = `<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine" disabled>Usuń</button></div>`;
      box.appendChild(row);
    });
  } else {
    try{
      const { data } = await sb.from('machines').select('*').order('ord',{ascending:true});
      (data || []).forEach(m=>{
        const row = document.createElement('div');
        row.className = 'admin-machine-row';
        row.dataset.number = m.number;
        row.innerHTML = `<div style="display:flex;align-items:center;"><span class="drag-handle">⇅</span><strong style="margin-left:8px;">${m.number}</strong></div><div><button class="btn small danger remove-machine">Usuń</button></div>`;
        box.appendChild(row);
      });
    }catch(e){
      console.error('refreshAdminMachineList error', e);
    }
  }

  // attach remove handlers (online only)
  box.querySelectorAll('.remove-machine').forEach(btn=>{
    btn.onclick = async (e) => {
      const num = e.target.closest('.admin-machine-row').dataset.number;
      if(!confirm('Usunąć maszynę ' + num + '?')) return;
      if(!sb){
        alert('Brak połączenia z serwerem — usuwanie jest zablokowane.');
        return;
      }
      try{
        await sb.from('machines').delete().eq('number', num);
        await loadMachines();
        await refreshAdminMachineList();
        await loadAssignmentsForDate(currentDate);
        buildTableFor(currentDate);
      }catch(err){
        console.error('remove machine error', err);
      }
    };
  });

  // prosty drag & drop do zmiany kolejności (klient-side)
  let dragSrc = null;
  box.querySelectorAll('.admin-machine-row').forEach(item=>{
    item.draggable = true;
    item.addEventListener('dragstart', (e)=>{ dragSrc = item; e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover', (e)=> e.preventDefault());
    item.addEventListener('drop', (e)=>{
      e.preventDefault();
      if(dragSrc && dragSrc !== item) box.insertBefore(dragSrc, item.nextSibling);
    });
  });
}

/* -------------------- eksport CSV dla dnia -------------------- */
function exportDayToCSV(date){
  if(!date){ alert('Wybierz datę przed eksportem.'); return; }
  const dateData = assignments[date] || {};
  const roleTitles = COLUMNS.slice(2).map(c=>c.title);
  const headers = ['Data','Maszyna','Status', ...roleTitles];
  const rows = [ headers.join(',') ];
  const machineList = machines.length ? machines : Object.keys(dateData).map(k=>({ number: k }));

  machineList.forEach(m=>{
    const machineNumber = m.number || m;
    const vals = dateData[machineNumber] || [machineNumber, 'Gotowa', '','','','','','',''];
    const row = [ date, machineNumber, vals[1] || 'Gotowa', ...vals.slice(2) ];
    rows.push(row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  });

  const csvContent = rows.join('\r\n');
  const filename = `assignments-${date}.csv`;
  const blob = new Blob([csvContent], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

/* -------------------- ENFORCE ONLINE MODE (blokowanie UI gdy offline) --------------------
   - tworzy/usuwa baner informujący o braku połączenia
   - dezaktywuje/aktywuje elementy edycyjne
   - nadpisuje tymczasowo openAssignModal by blokować przypisywanie offline
   - zachowuje oryginał openAssignModal by można go przywrócić po powrocie online
----------------------------------------------------------------------------- */
let _origOpenAssignModal = null; // zachowamy oryginał aby móc go przywrócić

function enforceOnlineMode(){
  // elementy do wyłączenia gdy offline (id elementów)
  const controlsToDisable = [
    'addMachineBtn', 'saveMachineOrderBtn', 'adminExportEmpBtn', 'adminLogin', 'adminLoginBtn', 'exportDayBtn'
  ];

  // usuń istniejący baner
  const existing = document.getElementById('offlineBanner');
  if(existing) existing.remove();

  if(!sb){
    // Dodaj baner
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:10px 14px;background:#ffefc3;color:#5a3b00;text-align:center;z-index:10000;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.06);';
    banner.textContent = 'Brak połączenia z Supabase. Tryb edycji jest zablokowany.';
    document.body.appendChild(banner);
    window.scrollTo(0,0);

    // dezaktywuj przyciski
    controlsToDisable.forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.disabled = true;
        el.classList && el.classList.add('disabled-btn');
      }
    });

    // zablokuj otwieranie modala przypisania — zachowaj oryginał żeby przywrócić później
    if(!_origOpenAssignModal) _origOpenAssignModal = window.openAssignModal || openAssignModal;
    window.openAssignModal = function(){
      alert('Brak połączenia z serwerem — przypisywanie jest zablokowane.');
    };
  } else {
    // online: usuń baner i przywróć elementy
    const b = document.getElementById('offlineBanner');
    if(b) b.remove();

    controlsToDisable.forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.disabled = false;
        el.classList && el.classList.remove('disabled-btn');
      }
    });

    // przywróć oryginalne openAssignModal jeżeli było nadpisane
    if(_origOpenAssignModal){
      window.openAssignModal = _origOpenAssignModal;
      _origOpenAssignModal = null;
    }
  }
}

/* -------------------- bootstrap: start aplikacji -------------------- */
async function bootstrap(){
  await new Promise(r => document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', r) : r());
  dateInput = document.getElementById('dateInput');
  tbody = document.getElementById('tbody');
  theadRow = document.getElementById('theadRow');

  // ustaw dzisiejszą datę w input[type=date]
  dateInput.value = new Date().toISOString().slice(0,10);

  // inicjalizacje UI
  setupAssignModal();
  setupAdminPanel();

  // Supabase + dane
  await initSupabase();
  await loadEmployees();
  await loadMachines();

  currentDate = dateInput.value;
  await loadAssignmentsForDate(currentDate);
  buildTableFor(currentDate);

  // wymuś tryb online/offline (baner + dezaktywacje)
  enforceOnlineMode();

  // przyciski ładowania i eksportu
  const loadBtn = document.getElementById('loadDay');
  if(loadBtn) loadBtn.onclick = async ()=>{
    currentDate = dateInput.value;
    await loadAssignmentsForDate(currentDate);
    buildTableFor(currentDate);
  };

  const exportBtn = document.getElementById('exportDayBtn');
  if(exportBtn) exportBtn.onclick = ()=> exportDayToCSV(currentDate || dateInput.value);
}

bootstrap();
