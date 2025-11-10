/**
 * script.js — Crew Manager (wersja oczyszczona)
 *
 * Uwaga:
 * - Usunięto stary modal panelu admina (HTML + powiązane funkcje), ponieważ
 *   zarządzanie panelem przeniesiono do /admin/a_index.html i admin/a_script.js.
 * - Nie wprowadzałem logicznych zmian w działaniu aplikacji — tylko usunąłem
 *   zbędne odwołania i zakomentowałem/usunąłem nieużywane fragmenty.
 *
 * Komentarze po polsku wyjaśniają co zostało usunięte/zmienione.
 */

/* -------------------- KONFIGURACJA SUPABASE (wstaw swoje dane) -------------------- */
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
/* --------------------------------------------------------------------------------- */

let sb = null; // klient Supabase (null = offline)
let employees = [];
let machines = [];
let assignments = {};
let dateInput, tbody, theadRow;
let currentDate = null;

/* -------------------- KONFIGURACJA KOLUMN I STATUSÓW -------------------- */
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

const STATUS_ACTIVE_ROLES = {
  'Produkcja': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy'],
  'Produkcja + Filtry': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'filtry'],
  'Produkcja + Inserty': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'inserty'],
  'Produkcja + Filtry + Inserty': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy', 'filtry', 'inserty'],
  'Konserwacja': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy'],
  'Rozruch': ['mechanik_focke', 'mechanik_protos', 'operator_focke', 'operator_protos', 'pracownik_pomocniczy'],
  'Bufor': ['mechanik_focke', 'mechanik_protos'],
  'Stop': []
};

const DEFAULT_MACHINES = ['11','12','15','16','17','18','21','22','24','25','26','27','28','31','32','33','34','35','94','96'];

/* -------------------- pomoc: czekaj na globalne supabase (CDN) -------------------- */
function waitForSupabaseGlobal(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === 'function') return resolve(window.supabase);
    let waited = 0;
    const iv = setInterval(() => {
      if (window.supabase && typeof window.supabase.createClient === 'function') { clearInterval(iv); return resolve(window.supabase); }
      waited += 200;
      if (waited >= timeoutMs) { clearInterval(iv); return reject(new Error('Timeout waiting for Supabase SDK')); }
    }, 200);
  });
}

async function initSupabase(){
  try {
    await waitForSupabaseGlobal();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase ready');
  } catch (e) {
    console.warn('Supabase not available — offline mode', e);
    sb = null;
  }
}

/* -------------------- ŁADOWANIE DANYCH -------------------- */
async function loadEmployees(){
  if(!sb){ employees = []; return; }
  try {
    const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
    if (error) { console.error('loadEmployees error', error); employees = []; }
    else employees = data || [];
  } catch (e) {
    console.error(e);
    employees = [];
  }
}

async function loadMachines(){
  if(!sb){
    machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
    return;
  }
  try{
    const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true }).eq('default_view', true);
    if (error) {
      console.error('loadMachines error', error);
      machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
    } else {
      machines = (data && data.length) ? data.map(d=>({ number: String(d.number), ord: d.ord || 9999, status: d.status || 'Produkcja' })) : DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
    }
  } catch (e) {
    console.error(e);
    machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
  }
}

/* -------------------- ŁADOWANIE PRZYPISAŃ DLA DANEJ DATY -------------------- */
async function loadAssignmentsForDate(date){
  if(!date) return;
  if(!sb){ assignments[date] = {}; return; }
  try{
    const { data, error } = await sb.from('assignments').select('*').eq('date', date);
    if(error){ console.error('loadAssignmentsForDate error', error); assignments[date] = {}; return; }

    const map = {};
    machines.forEach(m=>{
      map[m.number] = [m.number, m.status || 'Produkcja'];
      for(let i=2;i<COLUMNS.length;i++) map[m.number].push('');
    });

    (data||[]).forEach(a=>{
      // jeżeli napotkamy maszynę której nie ma w machines — dodajemy ją (synchronizacja)
      if(!machines.find(mm => String(mm.number) === String(a.machine_number))){
        const newMachine = { number: String(a.machine_number), ord: machines.length+1, status: 'Produkcja' };
        machines.push(newMachine);
        // próbujemy zsynchronizować do DB — jeśli online
        if (sb) {
          sb.from('machines').insert([{ number: newMachine.number, ord: newMachine.ord, default_view:true, status: newMachine.status }])
            .then(res => { if(res.error) console.warn('sync new machine error', res.error); })
            .catch(err => console.warn('sync new machine error', err));
        }
        map[newMachine.number] = [newMachine.number, newMachine.status];
        for(let i=2;i<COLUMNS.length;i++) map[newMachine.number].push('');
      }

      const emp = employees.find(e=>e.id === a.employee_id);
      const idx = COLUMNS.findIndex(c=>c.key === a.role);
      if(idx > -1){
        if(!map[a.machine_number]){ const row=[a.machine_number,'Produkcja']; for(let i=2;i<COLUMNS.length;i++) row.push(''); map[a.machine_number]=row; }
        if(emp) map[a.machine_number][idx] = emp.name;
      }
    });

    assignments[date] = map;
  } catch(e){
    console.error(e);
    assignments[date] = {};
  }
}

/* -------------------- NARZĘDZIA UI -------------------- */
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

/* Budowa głównej tabeli z przypisaniami */
function buildTableFor(date){
  const dateData = assignments[date] || {};
  theadRow.innerHTML = '';
  COLUMNS.forEach(c=>{
    const th = document.createElement('th');
    th.textContent = c.title;
    theadRow.appendChild(th);
  });
  tbody.innerHTML = '';

  machines.forEach(m => {
    const vals = dateData[m.number] || [m.number, m.status || 'Produkcja'];
    const tr = document.createElement('tr');
    tr.dataset.machine = m.number;

    const effectiveStatus = m.status || vals[1] || 'Produkcja';
    const statusCls = statusClassFor(effectiveStatus);
    if(statusCls) tr.classList.add(statusCls);

    const tdNum = document.createElement('td');
    tdNum.textContent = m.number;
    if(statusCls) tdNum.classList.add(statusCls);
    tr.appendChild(tdNum);

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

    /* ---------- ZMIANA STATUSU: usuń przypisania nieaktywnych ról ---------- */
    selectStatus.onchange = async (e) => {
      const newStatus = e.target.value;
      const newCls = statusClassFor(newStatus);

      const prevStatus = m.status || effectiveStatus || 'Produkcja';
      const prevRoles = (STATUS_ACTIVE_ROLES[prevStatus] || []);
      const nextRoles = (STATUS_ACTIVE_ROLES[newStatus] || []);
      const rolesToRemove = prevRoles.filter(r => !nextRoles.includes(r));

      // usuń stare klasy statusowe
      tr.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdNum.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
      tdStatus.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');

      if(newCls){ tr.classList.add(newCls); tdNum.classList.add(newCls); tdStatus.classList.add(newCls); }

      // usuń przypisania w modelu i w DB (jeśli online)
      if(rolesToRemove.length > 0){
        try{
          if(assignments[date] && assignments[date][m.number]){
            rolesToRemove.forEach(roleKey => {
              const idx = COLUMNS.findIndex(c => c.key === roleKey);
              if(idx > -1 && typeof assignments[date][m.number][idx] !== 'undefined'){
                assignments[date][m.number][idx] = '';
              }
            });
          }
        }catch(err){
          console.warn('Błąd podczas lokalnego usuwania przypisań', err);
        }

        if(sb){
          for(const roleKey of rolesToRemove){
            try{
              const { error } = await sb.from('assignments').delete()
                .eq('date', date)
                .eq('machine_number', m.number)
                .eq('role', roleKey);
              if(error) console.warn('Błąd usuwania przypisania (role removed):', roleKey, error);
            }catch(e){
              console.warn('Exception podczas usuwania przypisania:', e);
            }
          }
        }
      }

      // aktualizuj lokalny model statusu oraz DB
      m.status = newStatus;

      if(!sb){
        alert('Brak połączenia z serwerem — zmiana statusu jest zablokowana.');
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

      await loadAssignmentsForDate(date);
      buildTableFor(date);
    };

    tdStatus.appendChild(selectStatus);
    tr.appendChild(tdStatus);

    /* kolumny ról */
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
        td.addEventListener('click', () => openAssignModal(date, m.number, col.key));
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

/* -------------------- ZAPIS PRZYPISANIA DO BAZY -------------------- */
async function saveAssignment(date,machine,role,empId){
  if(!sb){
    alert('Brak połączenia z serwerem — zapisywanie przypisań jest zablokowane. Proszę połącz się z Supabase i spróbuj ponownie.');
    return;
  }
  try{
    await sb.from('assignments').delete().eq('date',date).eq('machine_number',machine).eq('role',role);
    if(empId) await sb.from('assignments').insert([{date,machine_number:machine,role,employee_id:empId}]);
    await loadAssignmentsForDate(date);
    buildTableFor(date);
  } catch(e){ console.error('saveAssignment error', e); }
}

/* -------------------- MODAL PRZYPISANIA (UI) -------------------- */
let assignModal, assignTitle, assignInfo, assignList;
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

  assignModal.addEventListener('click', (e)=>{
    if(e.target === assignModal){
      assignModal.style.display = 'none';
      document.body.classList.remove('modal-open');
    }
  });
}

/* openAssignModal(...) - funkcja tworzy listę pracowników i pozwala przypisać ich do roli.
   Funkcja korzysta z globalnych zmiennych employees oraz saveAssignment() */
function openAssignModal(date, machine, roleKey) {
  // pokaż modal i zablokuj przewijanie tła
  assignModal.style.display = 'flex';
  document.body.classList.add('modal-open');

  // nagłówek
  assignTitle.textContent = `Przypisz — ${roleKey.replace('_',' ')} (Maszyna ${machine})`;
  assignInfo.textContent = 'Kliknij nazwisko, aby przypisać. Ostatnia kolumna: wszyscy pomocniczy/filtry/inserty (globalnie).';

  // wyczyść zawartość modala
  assignList.innerHTML = '';

  // przygotuj mapowanie BU -> pracownicy
  const buMap = new Map();
  employees.forEach(emp => {
    const bu = (emp.bu && String(emp.bu).trim()) ? String(emp.bu).trim() : 'Inne';
    if (!buMap.has(bu)) buMap.set(bu, []);
    buMap.get(bu).push(emp);
  });

  // roleColumns: 4 główne kolumny per-BU + jedna kolumna dla "pracownik_pomocniczy"
  const roleCols = [
    { key: 'mechanik_focke', title: 'Mechanik Focke' },
    { key: 'mechanik_protos', title: 'Mechanik Protos' },
    { key: 'operator_focke', title: 'Operator Focke' },
    { key: 'operator_protos', title: 'Operator Protos' },
    { key: 'operator_krosowy', title: 'Operator Krosowy' }
  ];

  // helperRoles: te role będą pokazane w jednej wspólnej kolumnie
  const helperRoles = ['pracownik_pomocniczy', 'filtry', 'inserty'];

  // top bar: info + BU select + close
  const topRow = document.createElement('div');
  topRow.style.display = 'flex';
  topRow.style.justifyContent = 'space-between';
  topRow.style.alignItems = 'center';
  topRow.style.gap = '8px';
  topRow.style.marginBottom = '8px';

  const leftInfo = document.createElement('div');
  leftInfo.className = 'small-muted';
  leftInfo.textContent = `Data: ${date} • Maszyna: ${machine} • Rola: ${roleKey.replace('_',' ')}`;
  topRow.appendChild(leftInfo);

  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.alignItems = 'center';
  controls.style.gap = '8px';

  const buSelect = document.createElement('select');
  buSelect.style.padding = '6px';
  buSelect.style.borderRadius = '6px';
  buSelect.style.border = '1px solid #d4dff0';
  const optAll = document.createElement('option');
  optAll.value = '__all';
  optAll.textContent = 'Wszystkie BU';
  buSelect.appendChild(optAll);
  Array.from(buMap.keys()).sort().forEach(bu => {
    const o = document.createElement('option');
    o.value = bu;
    o.textContent = bu;
    buSelect.appendChild(o);
  });
  controls.appendChild(buSelect);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn outline';
  closeBtn.textContent = 'Zamknij';
  closeBtn.onclick = () => { assignModal.style.display = 'none'; document.body.classList.remove('modal-open'); };
  controls.appendChild(closeBtn);

  topRow.appendChild(controls);
  assignList.appendChild(topRow);

  // kontener tabeli (większy)
  const wrap = document.createElement('div');
  wrap.className = 'assign-big-table-wrap';
  wrap.style.maxHeight = '70vh';
  wrap.style.overflow = 'auto';
  assignList.appendChild(wrap);

  // funkcja renderująca tabelę
  function renderTable(filterBU = '__all') {
    wrap.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'assign-big-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '13px';

    // thead
    const thead = document.createElement('thead');
    const thr = document.createElement('tr');

    // BU header
    const thBU = document.createElement('th'); thBU.textContent = 'BU'; thBU.style.width = '90px'; thBU.style.padding='8px'; thBU.style.textAlign='center';
    thr.appendChild(thBU);

    // role headers
    roleCols.forEach(rc => {
      const th = document.createElement('th');
      th.textContent = rc.title;
      th.style.padding = '8px';
      th.style.textAlign = 'center';
      th.style.borderLeft = '1px solid rgba(0,0,0,0.06)';
      thr.appendChild(th);
    });

    // wspólna prawa kolumna (ostatnia)
    const thGlobal = document.createElement('th');
    thGlobal.textContent = 'Pomocniczy / Filtry / Inserty';
    thGlobal.style.padding = '8px';
    thGlobal.style.textAlign = 'center';
    thGlobal.style.borderLeft = '1px solid rgba(0,0,0,0.06)';
    thr.appendChild(thGlobal);

    thead.appendChild(thr);
    table.appendChild(thead);

    // tbody
    const tbodyTable = document.createElement('tbody');

    // lista BU do wyświetlenia
    const buKeys = Array.from(buMap.keys()).sort();
    const visibleBU = buKeys.filter(bu => filterBU === '__all' ? true : bu === filterBU);

    // przygotuj globalną listę helperów (unikaty) — Map zapewnia unikalność
    const globalHelpersMap = new Map();
    employees.forEach(emp => {
      const empRoles = (emp.roles || []).map(r => String(r));
      const nameLower = String(emp.name || '').toLowerCase();
      const hasHelperRole = empRoles.some(r => helperRoles.includes(r)) || helperRoles.some(hr => nameLower.includes(hr));
      if (hasHelperRole) globalHelpersMap.set(emp.id, emp);
    });
    const globalHelpers = Array.from(globalHelpersMap.values()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));

    // utwórz wiersze - po jednym wierszu na BU
    for (let i = 0; i < visibleBU.length; i++) {
      const bu = visibleBU[i];
      const empList = buMap.get(bu) || [];

      // zgrupuj pracowników BU po rolach, ale dbamy o unikalność — użyjemy Set id
      const roleToList = {};
      roleCols.forEach(rc => roleToList[rc.key] = []);
      const roleToSet = {};
      roleCols.forEach(rc => roleToSet[rc.key] = new Set());

      empList.forEach(emp => {
        const empRoles = (emp.roles || []).map(r => String(r));
        // dodawaj jedynie jeśli jeszcze nie dodany do danej roli
        empRoles.forEach(r => {
          if (roleToList[r] && !roleToSet[r].has(emp.id)) {
            roleToList[r].push(emp);
            roleToSet[r].add(emp.id);
          }
        });

        // heurystyka po nazwie — dodaj tylko jeśli nie było wcześniej w tej roli
        const name = (emp.name || '').toLowerCase();
        if (name.includes('mechanik_focke') && !roleToSet['mechanik_focke'].has(emp.id)) {
          roleToList['mechanik_focke'].push(emp); roleToSet['mechanik_focke'].add(emp.id);
        }
        if (name.includes('mechanik_protos') && !roleToSet['mechanik_protos'].has(emp.id)) {
          roleToList['mechanik_protos'].push(emp); roleToSet['mechanik_protos'].add(emp.id);
        }
        if (name.includes('operator_focke') && !roleToSet['operator_focke'].has(emp.id)) {
          roleToList['operator_focke'].push(emp); roleToSet['operator_focke'].add(emp.id);
        }
        if (name.includes('operator_protos') && !roleToSet['operator_protos'].has(emp.id)) {
          roleToList['operator_protos'].push(emp); roleToSet['operator_protos'].add(emp.id);
        }
        if (name.includes('pracownik_pomocniczy') && !roleToSet['pracownik_pomocniczy'].has(emp.id)) {
          roleToList['pracownik_pomocniczy'].push(emp); roleToSet['pracownik_pomocniczy'].add(emp.id);
        }
      });

      const tr = document.createElement('tr');

      // BU cell
      const tdBU = document.createElement('td');
      tdBU.textContent = bu;
      tdBU.style.fontWeight = '700';
      tdBU.style.padding = '8px';
      tdBU.style.textAlign = 'center';
      tr.appendChild(tdBU);

      // role columns (listy imion)
      roleCols.forEach(rc => {
        const td = document.createElement('td');
        td.style.padding = '6px';
        td.style.verticalAlign = 'top';
        td.style.borderLeft = '1px solid rgba(0,0,0,0.03)';
        td.className = 'td-names';

        // convert to unique list just in case, and sort
        const unique = Array.from(new Map((roleToList[rc.key]||[]).map(p => [p.id, p])).values());
        const names = unique.sort((a,b)=> (a.name||'').localeCompare(b.name||''));

        if (names.length === 0) {
          const span = document.createElement('div'); span.className = 'muted'; span.textContent = '—'; td.appendChild(span);
        } else {
          names.forEach(emp => {
            const div = document.createElement('div');
            div.className = 'emp-name';
            div.textContent = emp.name;
            // kliknięcie przypisuje pracownika do roleKey
            div.onclick = async () => {
              await saveAssignment(date, machine, roleKey, emp.id);
              assignModal.style.display = 'none';
              document.body.classList.remove('modal-open');
            };
            td.appendChild(div);
          });
        }
        tr.appendChild(td);
      });

      // ostatnia globalna kolumna: dodamy tylko w pierwszym wierszu z odpowiednim rowspan
      if (i === 0) {
        const tdGlobal = document.createElement('td');
        tdGlobal.style.padding = '8px';
        tdGlobal.style.verticalAlign = 'top';
        tdGlobal.style.borderLeft = '1px solid rgba(0,0,0,0.06)';
        tdGlobal.setAttribute('rowspan', String(visibleBU.length || 1));
        tdGlobal.className = 'td-global-helpers';

        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.style.marginBottom = '6px';
       
        tdGlobal.appendChild(title);

        if (globalHelpers.length === 0) {
          const m = document.createElement('div'); m.className = 'muted'; m.textContent = '—'; tdGlobal.appendChild(m);
        } else {
          globalHelpers.forEach(emp => {
            const d = document.createElement('div');
            d.className = 'emp-name';
            d.textContent = emp.name;
            d.onclick = async () => {
              await saveAssignment(date, machine, roleKey, emp.id);
              assignModal.style.display = 'none';
              document.body.classList.remove('modal-open');
            };
            tdGlobal.appendChild(d);
          });
        }

        tr.appendChild(tdGlobal);
      }

      tbodyTable.appendChild(tr);
    } // koniec for visibleBU

    table.appendChild(tbodyTable);
    wrap.appendChild(table);
  } // koniec renderTable

  // inicjalne renderowanie
  renderTable('__all');

  // obsługa filtra BU
  buSelect.addEventListener('change', (e) => renderTable(e.target.value));

  // przycisk do czyszczenia przypisania (na dole)
  const clear = document.createElement('button');
  clear.className = 'btn';
  clear.style.marginTop = '12px';
  clear.style.width = '100%';
  clear.textContent = 'Wyczyść przypisanie';
  clear.onclick = async () => {
    await saveAssignment(date, machine, roleKey, null);
    assignModal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };
  assignList.appendChild(clear);
}

/* -------------------- EXPORT CSV DLA DNIA -------------------- */
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

/* -------------------- TRYB OFFLINE / ZABLOKOWANIE PRZYCISKÓW -------------------- */
let _origOpenAssignModal = null;
function enforceOnlineMode(){
  // lista id elementów, które blokujemy w trybie offline
  const controlsToDisable = ['addMachineBtn','saveMachineOrderBtn','adminExportEmpBtn','adminLogin','adminLoginBtn','exportDayBtn'];
  const existing = document.getElementById('offlineBanner');
  if(existing) existing.remove();

  if(!sb){
    const banner = document.createElement('div');
    banner.id = 'offlineBanner';
    banner.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:10px 14px;background:#ffefc3;color:#5a3b00;text-align:center;z-index:10000;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.06);';
    banner.textContent = 'Brak połączenia z Supabase. Tryb edycji jest zablokowany.';
    document.body.appendChild(banner);
    window.scrollTo(0,0);

    controlsToDisable.forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.disabled = true;
        el.classList && el.classList.add('disabled-btn');
      }
    });

    if(!_origOpenAssignModal) _origOpenAssignModal = window.openAssignModal || openAssignModal;
    window.openAssignModal = function(){ alert('Brak połączenia z serwerem — przypisywanie jest zablokowane.'); };
  } else {
    const b = document.getElementById('offlineBanner');
    if(b) b.remove();

    controlsToDisable.forEach(id=>{
      const el = document.getElementById(id);
      if(el){
        el.disabled = false;
        el.classList && el.classList.remove('disabled-btn');
      }
    });

    if(_origOpenAssignModal){
      window.openAssignModal = _origOpenAssignModal;
      _origOpenAssignModal = null;
    }
  }
}

/* -------------------- OBSŁUGA PRZYCISKU "PANEL ADMINISTRATORA" -------------------- */
/* Używamy istniejącego przycisku #adminLoginBtn — prompt + przekierowanie do admin/a_index.html */
document.addEventListener('DOMContentLoaded', () => {
  const adminLoginBtn = document.getElementById('adminLoginBtn');
  if (adminLoginBtn) {
    adminLoginBtn.addEventListener('click', () => {
      const pass = prompt('Podaj hasło administratora:');
      if (pass === 'admin123') {
        window.location.href = './admin/a_index.html';
      } else if (pass !== null) {
        alert('Błędne hasło!');
      }
    });
  }
});

/* -------------------- BOOTSTRAP (inicjalizacja) -------------------- */
async function bootstrap(){
  await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r());
  dateInput = document.getElementById('dateInput');
  tbody = document.getElementById('tbody');
  theadRow = document.getElementById('theadRow');

  // ustaw dziś jako domyślną datę w polu
  dateInput.value = new Date().toISOString().slice(0,10);

  setupAssignModal();

  await initSupabase();
  await loadEmployees();
  await loadMachines();

  currentDate = dateInput.value;
  await loadAssignmentsForDate(currentDate);
  buildTableFor(currentDate);

  enforceOnlineMode();

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
