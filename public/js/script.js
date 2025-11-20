/*
 * script.js — Crew Manager (ulepszona wersja)
 *
 * Zmiany / cele:
 * - lepsze logowanie błędów (kontekst, stack)
 * - bezpieczne inicjalizacje (try/catch), odporność na brak DOM-ów
 * - drobne poprawki w openAssignModal (sprawdzanie danych, loader, walidacja)
 * - zachowanie zgodności z dotychczasową logiką (nie zmieniono funkcji biznesowych)
 */

/* -------------------- ROLE DISPLAY MAPPING -------------------- */
const ROLE_DISPLAY_NAMES = {
  'mechanik_focke': 'Mechanik Focke',
  'mechanik_protos': 'Mechanik Protos',
  'operator_focke': 'Operator Focke',
  'operator_krosowy': 'Operator Krosowy',
  'operator_protos': 'Operator Protos'
};

function getDisplayRoleName(roleKey) {
  return ROLE_DISPLAY_NAMES[roleKey] || roleKey;
}

/* -------------------- KONFIGURACJA SUPABASE (wstaw swoje dane) -------------------- */
/* ============================================================
   GŁÓWNY SKRYPT - Crew Manager
   Wymagane: config.js musi być załadowany przed tym
============================================================ */

// Use CONFIG from config.js
const SUPABASE_URL = window.CONFIG.supabase.url;
const SUPABASE_ANON_KEY = window.CONFIG.supabase.anonKey;
/* --------------------------------------------------------------------------------- */

let sb = null; // klient Supabase (null = offline)
let employees = [];
let machines = [];
let assignments = {}; // Nowa zmienna - urlopy na datę
let vacationsByDate = {}; // Nowa zmienna - urlopy na datę
let dateInput, tbody, theadRow;
let currentDate = null;

// Logika procent stanowisk
let roleUtilizationCache = {}; // Cache: { machineNumber -> role_utilization JSON }

// Funkcje pomocnicze dla procentów
function getRoleUtilization(machineNumber) {
  if(!roleUtilizationCache[machineNumber]) {
    const machine = machines.find(m => m.number === String(machineNumber));
    if(machine && machine.role_utilization) {
      try {
        roleUtilizationCache[machineNumber] = typeof machine.role_utilization === 'string' 
          ? JSON.parse(machine.role_utilization) 
          : machine.role_utilization;
      } catch(e) {
        console.error('getRoleUtilization parse error:', e);
        roleUtilizationCache[machineNumber] = {};
      }
    } else {
      roleUtilizationCache[machineNumber] = {};
    }
  }
  return roleUtilizationCache[machineNumber] || {};
}

// Oblicz ile procent ma pracownik zużyte na daną datę
function getEmployeeUtilizationForDate(employeeId, date) {
  const dateData = assignments[date] || {};
  let totalUsed = 0;
  
  machines.forEach(machine => {
    const vals = dateData[machine.number] || [];
    const utilization = getRoleUtilization(machine.number);
    
    // Przeskanuj wszystkie role (kolumny) dla tej maszyny
    for(let i = 2; i < vals.length; i++) {
      const val = vals[i];
      if(!val) continue;
      
      // Sprawdź czy to nasz pracownik
      if(val === employeeId || val === `mgr_${employeeId}` || val === `rdnst_${employeeId}`) {
        const colDef = COLUMNS[i];
        if(colDef) {
          const rolePercent = utilization[colDef.key] || 0;
          totalUsed += rolePercent;
        }
      }
    }
  });
  
  return totalUsed;
}

// Oblicz dostępne procenty dla pracownika
function getAvailableUtilization(employeeId, date) {
  const used = getEmployeeUtilizationForDate(employeeId, date);
  return Math.max(0, 100 - used);
}

// Sprawdź czy pracownik ma konflikt stanowisk
function hasRoleConflict(employeeId, date, roleKey) {
  const dateData = assignments[date] || {};
  
  // Grupy stanowisk (nie mogą być razem)
  const mechGroup = ['mechanik_focke', 'mechanik_protos'];
  const opGroup = ['operator_focke', 'operator_protos'];
  
  let groups = [];
  if(mechGroup.includes(roleKey)) groups.push(mechGroup);
  if(opGroup.includes(roleKey)) groups.push(opGroup);
  
  if(groups.length === 0) return false; // Role mieszane (Pracownik Pomocniczy, Filtry, Insert)
  
  // Sprawdź czy pracownik ma już inny role z tej samej grupy
  for(const conflictGroup of groups) {
    for(const machine of machines) {
      const vals = dateData[machine.number] || [];
      for(let i = 2; i < vals.length; i++) {
        const val = vals[i];
        if(!val) continue;
        
        if(val === employeeId || val === `mgr_${employeeId}` || val === `rdnst_${employeeId}`) {
          const colDef = COLUMNS[i];
          if(colDef && conflictGroup.includes(colDef.key) && colDef.key !== roleKey) {
            return true; // Znaleziono konflikt
          }
        }
      }
    }
  }
  
  return false;
}

// Sprawdź czy przypisanie byłoby dozwolone (procenty i konflikty)
function canAssignWithUtilization(employeeId, date, roleKey, machineNumber) {
  // Sprawdź konflikt stanowisk
  if(hasRoleConflict(employeeId, date, roleKey)) {
    return {
      allowed: false,
      reason: `Błąd: Pracownik nie może mieć dwóch stanowisk z tej samej grupy (Mechnik/Operator)!`
    };
  }
  
  // Sprawdź procenty
  const utilization = getRoleUtilization(machineNumber);
  const rolePercent = utilization[roleKey] || 0;
  const available = getAvailableUtilization(employeeId, date);
  
  if(rolePercent > available) {
    return {
      allowed: false,
      reason: `Błąd: Przypisanie przekroczyłoby limit 100%. Pracownik ma dostępnych ${available}%, a rola wymaga ${rolePercent}%.`
    };
  }
  
  return { allowed: true };
}

// helper: short display name (bez zmian w logice, ale bezpieczniejsza)
function displayShort(emp){
  try{
    if(!emp) return '';
    if(emp.short_name && String(emp.short_name).trim()) return String(emp.short_name).trim();
    const surname = String(emp.surname || '').trim();
    const name = String(emp.name || emp.firstname || '').trim();
    if(surname && name){
      const initials = name.slice(0,2);
      return `${surname} ${initials}.`;
    }
    if(name) return name;
    if(surname) return surname;
    return emp.id ? String(emp.id).slice(0,8) : '';
  }catch(e){
    console.error('displayShort error', e, emp);
    return '';
  }
}

// Wyświetl przypisanie (pracownik, kierownik, lub RDNST)
function displayAssignmentValue(val) {
  if(!val) return '';
  
  // Format kierownika: "mgr_UUID"
  if(typeof val === 'string' && val.startsWith('mgr_')) {
    const mgrId = val.substring(4);
    if(window.mgrsCache) {
      const mgr = window.mgrsCache.find(m => m.id === mgrId);
      if(mgr) return `👔 ${displayShort(mgr)}`;
    }
    return `👔 [nieznany kierownik]`;
  }
  
  // Format RDNST: "rdnst_XXX" - szukaj w assignmentRdnstLookup
  if(typeof val === 'string' && val.startsWith('rdnst_')) {
    if(assignmentRdnstLookup && assignmentRdnstLookup[val]) {
      const w = assignmentRdnstLookup[val];
      const name = w.short_name || `${w.surname} ${w.firstname}`;
      return `📋 ${name}`;
    }
    return `📋 [RDNST pracownik]`;
  }
  
  // Zwykły pracownik (UUID) - szukaj w employees
  if(employees) {
    const emp = employees.find(e => e.id === val);
    if(emp) return displayShort(emp);
  }
  
  // Może to UUID kierownika bez prefiksu - spróbuj w cache
  if(window.mgrsCache) {
    const mgr = window.mgrsCache.find(m => m.id === val);
    if(mgr) return `👔 ${displayShort(mgr)}`;
  }
  
  return 'Nieznany';
}

/* -------------------- CUSTOM PERMISSION ALERT -------------------- */
function showPermissionAlert(message){
  return new Promise((resolve) => {
    const modal = document.getElementById('permissionAlert');
    const messageEl = document.getElementById('permissionAlertMessage');
    const confirmBtn = document.getElementById('permissionAlertConfirm');
    const cancelBtn = document.getElementById('permissionAlertCancel');
    
    if(!modal || !messageEl || !confirmBtn || !cancelBtn) {
      // Fallback do zwykłego confirm jeśli modal nie istnieje
      resolve(confirm('Pracownik nie ma wymaganych uprawnień — ' + message + '. Na pewno przypisać?'));
      return;
    }
    
    messageEl.textContent = message;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    
    const cleanup = () => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };
    
    confirmBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
}

/* -------------------- GENERIC NOTIFICATION MODAL -------------------- */
function showNotification(message, title = 'Powiadomienie', icon = 'ℹ️'){
  return new Promise((resolve) => {
    const modal = document.getElementById('notificationModal');
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    const okBtn = document.getElementById('notificationOkBtn');
    
    if(!modal || !titleEl || !messageEl || !iconEl || !okBtn) {
      // Fallback do zwykłego alert
      alert(message);
      resolve();
      return;
    }
    
    titleEl.textContent = title;
    messageEl.textContent = message;
    iconEl.textContent = icon;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    
    const cleanup = () => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      okBtn.onclick = null;
    };
    
    okBtn.onclick = () => {
      cleanup();
      resolve();
    };
    
    // Enter key closes modal
    const handleKeyPress = (e) => {
      if(e.key === 'Enter') {
        document.removeEventListener('keypress', handleKeyPress);
        cleanup();
        resolve();
      }
    };
    document.addEventListener('keypress', handleKeyPress);
  });
}

/* -------------------- CUSTOM ADMIN LOGIN MODAL -------------------- */
function showAdminLoginModal(){
  return new Promise((resolve) => {
    const modal = document.getElementById('adminLoginModal');
    const input = document.getElementById('adminPasswordInput');
    const submitBtn = document.getElementById('adminLoginSubmit');
    const cancelBtn = document.getElementById('adminLoginCancel');
    
    if(!modal || !input || !submitBtn || !cancelBtn) {
      // Fallback do zwykłego prompt
      const pass = prompt('Podaj hasło administratora:');
      resolve(pass);
      return;
    }
    
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
    input.value = '';
    input.focus();
    
    const cleanup = () => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      submitBtn.onclick = null;
      cancelBtn.onclick = null;
      input.onkeypress = null;
    };
    
    const submit = () => {
      cleanup();
      resolve(input.value);
    };
    
    submitBtn.onclick = submit;
    
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
    
    input.onkeypress = (e) => {
      if(e.key === 'Enter') submit();
    };
  });
}

/**
 * Sprawdza uprawnienia pracownika dla danego stanowiska na maszynie
 * 
 * LOGIKA:
 * - Focke: F350, F550, GD, GDX, 751, 401, 411, 407, 408, 409, 707, 487, 489
 * - Protos: P100, P70
 * 
 * Sprawdzamy pokrywanie się typów maszyny z uprawnieniami pracownika:
 * - Mechanik Focke: maszyna ma typy Focke → musi mieć te typy w uprawnieniach mechanicznych
 * - Mechanik Protos: maszyna ma typy Protos → musi mieć te typy w uprawnieniach mechanicznych
 * - Operator Focke: maszyna ma typy Focke → musi mieć te typy w uprawnieniach operatorskich
 * - Operator Protos: maszyna ma typy Protos → musi mieć te typy w uprawnieniach operatorskich
 * - Filtry/Pomocniczy/Inserty: brak sprawdzenia
 * 
 * @param {Object} employee - pracownik z permissions, mechanical_permissions
 * @param {Object} machine - maszyna z polami maker, paker, celafoniarka, pakieciarka, kartoniarka
 * @param {string} roleKey - stanowisko (np. 'mechanik_focke', 'operator_focke')
 * @returns {string|null} - komunikat o brakujących uprawnieniach lub null jeśli OK
 */
function getMissingPermissionsForAssign(employee, machine, roleKey){
  try {
    const FOCKE_TYPES = window.CONFIG.machineTypes.focke;
    const PROTOS_TYPES = window.CONFIG.machineTypes.protos;

    // Brak sprawdzenia dla tych stanowisk
    if(['pracownik_pomocniczy', 'filtry', 'inserty'].includes(roleKey)) return null;

    // Pobierz typy maszyny
    const machineTypes = new Set();
    const fields = ['maker', 'paker', 'celafoniarka', 'pakieciarka', 'kartoniarka'];
    fields.forEach(field => {
      const val = machine[field];
      if(val && String(val).trim()) machineTypes.add(String(val).trim());
    });

    if(machineTypes.size === 0) return null; // Maszyna nie ma żadnych typów

    // Pobierz uprawnienia pracownika
    const empPermissions = Array.isArray(employee.permissions)
      ? employee.permissions.map(p => String(p).trim())
      : (employee.permissions ? String(employee.permissions).split(',').map(s => String(s).trim()) : []);
    
    const empMechPermissions = employee.mechanical_permissions
      ? String(employee.mechanical_permissions).split(',').map(m => String(m).trim()).filter(Boolean)
      : [];

    // === MECHANIK FOCKE ===
    if(roleKey === 'mechanik_focke'){
      // Sprawdź czy maszyna ma typy Focke
      const fockeTypesInMachine = Array.from(machineTypes).filter(t => FOCKE_TYPES.includes(t));
      if(fockeTypesInMachine.length === 0) return null; // Maszyna nie ma typów Focke

      // Sprawdź czy pracownik ma wszystkie typy Focke z maszyny
      const missing = fockeTypesInMachine.filter(t => !empMechPermissions.includes(t));
      if(missing.length > 0) 
        return `Brakuje uprawnień mechanicznych Focke: ${missing.join(', ')}`;
      
      return null;
    }

    // === MECHANIK PROTOS ===
    if(roleKey === 'mechanik_protos'){
      // Sprawdź czy maszyna ma typy Protos
      const protosTypesInMachine = Array.from(machineTypes).filter(t => PROTOS_TYPES.includes(t));
      if(protosTypesInMachine.length === 0) return null; // Maszyna nie ma typów Protos

      // Sprawdź czy pracownik ma wszystkie typy Protos z maszyny
      const missing = protosTypesInMachine.filter(t => !empMechPermissions.includes(t));
      if(missing.length > 0) 
        return `Brakuje uprawnień mechanicznych Protos: ${missing.join(', ')}`;
      
      return null;
    }

    // === OPERATOR FOCKE ===
    if(roleKey === 'operator_focke'){
      // Sprawdź czy maszyna ma typy Focke
      const fockeTypesInMachine = Array.from(machineTypes).filter(t => FOCKE_TYPES.includes(t));
      if(fockeTypesInMachine.length === 0) return null; // Maszyna nie ma typów Focke

      // Sprawdź czy pracownik ma wszystkie typy Focke z maszyny
      const missing = fockeTypesInMachine.filter(t => !empPermissions.includes(t));
      if(missing.length > 0) 
        return `Brakuje uprawnień operatorskich Focke: ${missing.join(', ')}`;
      
      return null;
    }

    // === OPERATOR PROTOS ===
    if(roleKey === 'operator_protos'){
      // Sprawdź czy maszyna ma typy Protos
      const protosTypesInMachine = Array.from(machineTypes).filter(t => PROTOS_TYPES.includes(t));
      if(protosTypesInMachine.length === 0) return null; // Maszyna nie ma typów Protos

      // Sprawdź czy pracownik ma wszystkie typy Protos z maszyny
      const missing = protosTypesInMachine.filter(t => !empPermissions.includes(t));
      if(missing.length > 0) 
        return `Brakuje uprawnień operatorskich Protos: ${missing.join(', ')}`;
      
      return null;
    }

    return null;
  } catch(e){
    console.error('getMissingPermissionsForAssign error', e, {employee, machine, roleKey});
    return 'Błąd sprawdzenia uprawnień';
  }
}

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
// Using CONFIG.waitForSupabase from config.js
const waitForSupabaseGlobal = window.CONFIG.waitForSupabase;

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
  try{
    if(!sb){ employees = []; return; }
    const { data, error } = await sb.from('employees').select('*').order('name', { ascending: true });
    if (error) { console.error('loadEmployees error', error); employees = []; }
    else employees = data || [];
  }catch(e){ console.error('loadEmployees catch', e); employees = []; }
}

/* ================== ŁADOWANIE PRACOWNIKÓW RDNST NA DZIEŃ ================== */
async function loadRdnstWorkersForDate(dateStr){
  try{
    if(!sb || !dateStr) {
      console.warn('loadRdnstWorkersForDate: sb=', !!sb, 'dateStr=', dateStr);
      return [];
    }
    const { data, error } = await sb
      .from('rdnst')
      .select('id, surname, firstname, short_name, work_date')
      .eq('work_date', dateStr)
      .eq('is_archived', false);
    
    if(error){
      console.warn('loadRdnstWorkersForDate Supabase error:', error);
      return [];
    }
    
    console.log(`loadRdnstWorkersForDate: loaded ${(data || []).length} RDNST workers for ${dateStr}`);
    
    // Convert RDNST workers to "employee-like" format
    return (data || []).map(w => ({
      id: `rdnst_${w.id}`,
      name: `${w.surname} ${w.firstname}`,
      short_name: w.short_name,
      surname: w.surname,
      firstname: w.firstname,
      roles: ['pracownik_pomocniczy'],
      permissions: [],
      mechanical_permissions: [],
      bu: '',
      is_rdnst: true
    }));
  }catch(e){
    console.error('loadRdnstWorkersForDate catch error:', e);
    return [];
  }
}

/* Lookup RDNST worker name by ID and date for display */
async function getWorkerNameForAssignment(employeeId, dateStr){
  if(!employeeId) return '';
  
  // Check if this is an RDNST worker ID (format: rdnst_<uuid>)
  if(String(employeeId).startsWith('rdnst_')){
    try{
      if(!sb || !dateStr){
        console.warn('getWorkerNameForAssignment: cannot lookup RDNST, sb=', !!sb, 'dateStr=', dateStr);
        return employeeId;
      }
      
      // Extract UUID from rdnst_<uuid> format
      const uuid = employeeId.substring(6);
      
      // Query rdnst table for this worker
      const { data, error } = await sb
        .from('rdnst')
        .select('short_name, surname, firstname')
        .eq('id', uuid)
        .eq('work_date', dateStr)
        .eq('is_archived', false)
        .maybeSingle();
      
      if(error){
        console.warn('getWorkerNameForAssignment query error:', error);
        return employeeId; // Fallback to ID
      }
      
      if(data && data.short_name){
        return data.short_name;
      }
      
      // If short_name not available, construct from parts
      if(data && data.surname && data.firstname){
        return `${data.surname} ${data.firstname[0]}.`;
      }
      
      return employeeId; // Fallback
    }catch(e){
      console.error('getWorkerNameForAssignment error:', e);
      return employeeId;
    }
  }
  
  // For regular employees, lookup in employees array
  const emp = employees.find(e => e.id === employeeId);
  if(emp && emp.short_name){
    return emp.short_name;
  }
  
  return employeeId || '';
}

async function loadMachines(){
  try{
    if(!sb){ machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' })); return; }
    const { data, error } = await sb.from('machines').select('*').order('ord', { ascending: true, nullsLast: true });
    if (error) { console.error('loadMachines error', error); machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' })); }
    else machines = (data && data.length) ? data.map(d=>({ number: String(d.number), ord: d.ord || 9999, status: d.status || 'Produkcja', maker: d.maker || '', paker: d.paker || '', celafoniarka: d.celafoniarka || '', pakieciarka: d.pakieciarka || '', kartoniarka: d.kartoniarka || '', role_utilization: d.role_utilization || '' })) : DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' }));
    // Wyczyść cache procent przy nowym załadowaniu maszyn
    roleUtilizationCache = {};
  }catch(e){ console.error('loadMachines catch', e); machines = DEFAULT_MACHINES.map((n,i)=>({ number: String(n), ord: i+1, status: 'Produkcja' })); }
}

/* -------------------- ŁADOWANIE PRZYPISAŃ DLA DANEJ DATY -------------------- */
let assignmentRdnstLookup = {}; // Map do szukania RDNST pracowników: { "rdnst_UUID": { short_name, surname, firstname } }

async function loadAssignmentsForDate(date){
  if(!date) return;
  if(!sb){ assignments[date] = {}; return; }
  try{
    // Wyczyść cache procent dla tej daty
    roleUtilizationCache = {};
    
    // Załaduj urlopy dla tej daty
    const { data: vacations, error: vacError } = await sb
      .from('vacation')
      .select('employee_id')
      .lte('start_date', date)
      .gte('end_date', date);
    
    const employeesOnVacation = new Set();
    if (!vacError && vacations) {
      vacations.forEach(v => employeesOnVacation.add(v.employee_id));
    }
    console.log('Employees on vacation for', date, ':', Array.from(employeesOnVacation));

    const { data, error } = await sb.from('assignments').select('*').eq('date', date);
    if(error){ console.error('loadAssignmentsForDate error', error); assignments[date] = {}; return; }

    const map = {};
    machines.forEach(m=>{
      map[m.number] = [m.number, m.status || 'Produkcja'];
      for(let i=2;i<COLUMNS.length;i++) map[m.number].push('');
    });

    // Pre-load RDNST workers for this date to resolve names
    const rdnstWorkers = await loadRdnstWorkersForDate(date);
    rdnstWorkers.forEach(w => {
      // Przechowaj RDNST pracownika w lookup map
      assignmentRdnstLookup[w.id] = {
        short_name: w.short_name,
        surname: w.surname,
        firstname: w.firstname
      };
    });

    (data||[]).forEach(a=>{
      // WAŻNE: Pomiń przypisania pracowników na urlopie
      if (employeesOnVacation.has(a.employee_id)) {
        console.log('Skipping assignment for employee on vacation:', a.employee_id);
        return;
      }

      if(!machines.find(mm => String(mm.number) === String(a.machine_number))){
        const newMachine = { number: String(a.machine_number), ord: machines.length+1, status: 'Produkcja' };
        machines.push(newMachine);
        if (sb) {
          sb.from('machines').insert([{ number: newMachine.number, ord: newMachine.ord, default_view:true, status: newMachine.status }])
            .then(res => { if(res.error) console.warn('sync new machine error', res.error); })
            .catch(err => console.warn('sync new machine error', err));
        }
        map[newMachine.number] = [newMachine.number, newMachine.status];
        for(let i=2;i<COLUMNS.length;i++) map[newMachine.number].push('');
      }

      const idx = COLUMNS.findIndex(c=>c.key === a.role);
      if(idx > -1){
        if(!map[a.machine_number]){ const row=[a.machine_number,'Produkcja']; for(let i=2;i<COLUMNS.length;i++) row.push(''); map[a.machine_number]=row; }
        // Przechowuj oryginalny employee_id (może zawierać prefiks "mgr_", "rdnst_" lub być UUID)
        map[a.machine_number][idx] = a.employee_id;
      }
    });

    assignments[date] = map;
  } catch(e){ console.error('loadAssignmentsForDate catch', e); assignments[date] = {}; }
}

/* ============ LOAD VACATIONS FOR DATE ============ */
async function loadVacationsForDate(date) {
  if (!sb || !date) {
    vacationsByDate[date] = [];
    return;
  }
  
  try {
    const { data: vacs, error } = await sb
      .from('vacation')
      .select('employee_id, start_date, end_date, reason')
      .lte('start_date', date)
      .gte('end_date', date);
    
    if (error) {
      console.warn('loadVacationsForDate error', error);
      vacationsByDate[date] = [];
      return;
    }
    
    // Zamieniamy employee_id na imiona pracowników
    const enriched = (vacs || []).map(v => ({
      ...v,
      employeeName: employees.find(e => e.id === v.employee_id) 
        ? displayShort(employees.find(e => e.id === v.employee_id))
        : 'Nieznany'
    }));
    
    vacationsByDate[date] = enriched;
    console.log('Loaded vacations for', date, ':', enriched);
  } catch(e) {
    console.error('loadVacationsForDate catch', e);
    vacationsByDate[date] = [];
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
  try{
    const dateData = assignments[date] || {};
    theadRow.innerHTML = '';
    COLUMNS.forEach(c=>{
      const th = document.createElement('th');
      th.textContent = c.title;
      theadRow.appendChild(th);
    });
    // Dodaj nagłówek dla kolumny nieobecności
    const thAbsence = document.createElement('th');
    thAbsence.textContent = '📅 Urlopy/Nieobecności';
    theadRow.appendChild(thAbsence);
    tbody.innerHTML = '';

    machines.forEach((m, machineIndex) => {
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
        opt.value = st; opt.textContent = st;
        if((m.status || effectiveStatus) === st) opt.selected = true;
        selectStatus.appendChild(opt);
      });

      selectStatus.onchange = async (e) => {
        try{
          const newStatus = e.target.value;
          const prevStatus = m.status || effectiveStatus || 'Produkcja';
          const prevRoles = (STATUS_ACTIVE_ROLES[prevStatus] || []);
          const nextRoles = (STATUS_ACTIVE_ROLES[newStatus] || []);
          const rolesToRemove = prevRoles.filter(r => !nextRoles.includes(r));

          tr.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
          tdNum.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');
          tdStatus.classList.remove('status-prod','status-konserwacja','status-rozruch','status-stop','status-bufor');

          const newCls = statusClassFor(newStatus);
          if(newCls){ tr.classList.add(newCls); tdNum.classList.add(newCls); tdStatus.classList.add(newCls); }

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
            }catch(err){ console.warn('Błąd podczas lokalnego usuwania przypisań', err); }

            if(sb){
              for(const roleKey of rolesToRemove){
                try{
                  const { error } = await sb.from('assignments').delete()
                    .eq('date', date)
                    .eq('machine_number', m.number)
                    .eq('role', roleKey);
                  if(error) console.warn('Błąd usuwania przypisania (role removed):', roleKey, error);
                }catch(e){ console.warn('Exception podczas usuwania przypisania:', e); }
              }
            }
          }

          m.status = newStatus;

          if(!sb){
            await showNotification('Brak połączenia z serwerem — zmiana statusu jest zablokowana.', 'Błąd', '❌');
            await loadMachines();
            await loadAssignmentsForDate(date);
            buildTableFor(date);
            return;
          }

          try{
            const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', m.number);
            if(error) console.error('update machine status error', error);
          }catch(err){ console.error('update machine status catch', err); }

          await loadAssignmentsForDate(date);
          buildTableFor(date);
        }catch(err){ console.error('selectStatus.onchange error', err); }
      };

      // Dodaj tekst statusu i select
      const statusText = document.createElement('span');
      statusText.className = 'status-text';
      statusText.textContent = effectiveStatus;
      statusText.style.fontWeight = '700';
      statusText.style.cursor = 'pointer';
      
      tdStatus.appendChild(statusText);
      tdStatus.appendChild(selectStatus);
      selectStatus.style.display = 'none'; // Ukryj select domyślnie
      
      // Klik na komórkę - pokaż select
      tdStatus.addEventListener('click', () => {
        if (!tdStatus.classList.contains('editing')) {
          statusText.style.display = 'none';
          selectStatus.style.display = 'block';
          selectStatus.size = 5; // Pokaż 5 opcji jednocześnie
          tdStatus.classList.add('editing');
          selectStatus.focus();
        }
      });
      
      // Blur na select - pokaż tekst
      selectStatus.addEventListener('blur', () => {
        statusText.textContent = selectStatus.value;
        statusText.style.display = 'inline';
        selectStatus.style.display = 'none';
        selectStatus.size = 1; // Resetuj rozmiar
        tdStatus.classList.remove('editing');
      });
      
      // Change - aktualizuj tekst
      const originalOnChange = selectStatus.onchange;
      selectStatus.onchange = async (e) => {
        if (originalOnChange) await originalOnChange(e);
        statusText.textContent = selectStatus.value;
      };
      
      tr.appendChild(tdStatus);

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
          td.textContent = displayAssignmentValue(val); // Wyświetl imię, nie UUID
          td.style.cursor = 'pointer';
          td.addEventListener('click', () => openAssignModal(date, m, col.key));
        }

        tr.appendChild(td);
      });

      // Dodaj kolumnę nieobecności tylko na pierwszym wierszu (z rowspan)
      if(machineIndex === 0){
        const tdAbsence = document.createElement('td');
        tdAbsence.rowSpan = machines.length;
        tdAbsence.className = 'absence-column';
        
        // Renderuj nieobecności
        const absences = vacationsByDate[date] || [];
        const container = document.createElement('div');
        
        // Grupy z polskimi nazwami
        const groups = {
          'Urlopy': {
            label: 'Urlopy',
            reasons: ['Urlop wypoczynkowy', 'Urlop na żądanie'],
            items: []
          },
          'L4': {
            label: 'L4',
            reasons: ['L4'],
            items: []
          },
          'Delegacje': {
            label: 'Delegacje',
            reasons: ['Delegacja'],
            items: []
          },
          'Szkolenia': {
            label: 'Szkolenia',
            reasons: ['Szkolenie'],
            items: []
          }
        };
        
        // Przydziel nieobecności do grup
        absences.forEach(v => {
          Object.values(groups).forEach(group => {
            if(group.reasons.includes(v.reason)){
              group.items.push(v);
            }
          });
        });
        
        // Renderuj wszystkie grupy (nawet puste)
        Object.values(groups).forEach(group => {
          const groupDiv = document.createElement('div');
          groupDiv.className = 'absence-group';
          
          const headerDiv = document.createElement('div');
          headerDiv.className = 'absence-group-header';
          headerDiv.textContent = group.label + ' (suma: ' + group.items.length + '):';
          groupDiv.appendChild(headerDiv);
          
          if(group.items.length > 0){
            group.items.forEach(abs => {
              const absItem = document.createElement('div');
              absItem.className = 'absence-item';
              const endDateStr = new Date(abs.end_date + 'T00:00:00').toLocaleDateString('pl-PL');
              absItem.textContent = '• ' + (abs.employeeName || abs.employee_id) + ' (do ' + endDateStr + ')';
              groupDiv.appendChild(absItem);
            });
          } else {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'absence-item empty';
            emptyItem.textContent = '—';
            groupDiv.appendChild(emptyItem);
          }
          
          container.appendChild(groupDiv);
        });
        
        tdAbsence.appendChild(container);
        tr.appendChild(tdAbsence);
      }

      tbody.appendChild(tr);
    });
  }catch(e){ console.error('buildTableFor error', e, { date }); }
}

/* -------------------- ZAPIS PRZYPISANIA DO BAZY -------------------- */
async function saveAssignment(date,machine,role,empId){
  try{
    if(!sb){ await showNotification('Brak połączenia z serwerem — zapisywanie przypisań jest zablokowane. Proszę połącz się z Supabase i spróbuj ponownie.', 'Błąd', '❌'); return; }
    const machineNumber = machine.number || machine; // Obsługuj zarówno obiekt jak i numer
    
    console.log('saveAssignment called with:', { date, machine, machineNumber, role, empId });
    
    // Walidacja procentów i konfliktów PRZED usunięciem starego przypisania
    if(empId) {
      const validation = canAssignWithUtilization(empId, date, role, machineNumber);
      if(!validation.allowed) {
        await showNotification(validation.reason, 'Błąd', '❌');
        return;
      }
    }
    
    if(!empId) {
      console.log('Clearing assignment (empId is null/empty)');
    }
    
    await sb.from('assignments').delete().eq('date',date).eq('machine_number',machineNumber).eq('role',role);
    
    // Obsługuj zarówno employee_id jak i rdnst workers
    if(empId) {
      // Format ID:
      // - Pracownik zwykły: UUID
      // - RDNST: "rdnst_XXX"
      // - Kierownik: "mgr_UUID"
      
      let storeId = empId;
      
      // Jeśli to kierownik (z tabeli managers), dodaj prefiks "mgr_"
      if(window.mgrsCache && window.mgrsCache.some(m => m.id === empId)) {
        storeId = `mgr_${empId}`;
        console.log('Storing manager assignment with prefix:', storeId);
      }
      
      // Pobierz procent dla tego stanowiska na tej maszynie
      const utilization = getRoleUtilization(machineNumber);
      const utilizationPercent = utilization[role] || 0;
      
      const payload = {
        date, 
        machine_number: machineNumber, 
        role, 
        employee_id: storeId,
        utilization_percent: utilizationPercent
      };
      console.log('INSERT payload:', payload);
      
      const { data, error } = await sb.from('assignments').insert([payload]);
      if(error) {
        console.error('INSERT error:', error);
        await showNotification(`Błąd zapisywania: ${error.message}`, 'Błąd', '❌');
        return;
      }
      console.log('INSERT success:', data);
    }
    
    await loadAssignmentsForDate(date);
    buildTableFor(date);
  }catch(e){ console.error('saveAssignment error', e, { date, machine, role, empId }); await showNotification(`Błąd: ${e.message}`, 'Błąd', '❌'); }
}

/* -------------------- MODAL PRZYPISANIA (UI) -------------------- */
let assignModal, assignTitle, assignInfo, assignList;
function setupAssignModal(){
  assignModal = document.getElementById('assignModal');
  assignTitle = document.getElementById('assignTitle');
  assignInfo = document.getElementById('assignInfo');
  assignList = document.getElementById('assignList');

  if(!assignModal){
    console.warn('setupAssignModal: brak elementu #assignModal w DOM.');
    return;
  }

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

/* openAssignModal - ulepszona wersja z walidacją i loaderem */
function openAssignModal(date, machine, roleKey) {
  try{
    if(!assignModal || !assignList || !assignTitle || !assignInfo){
      console.warn('openAssignModal: modal nie został poprawnie zainicjowany.');
      return;
    }

    // pokaż modal i zablokuj przewijanie tła
    assignModal.style.display = 'flex';
    document.body.classList.add('modal-open');

    const machineNumber = machine.number || machine; // Wspieramy zarówno obiekt jak i numer
    const machineObj = typeof machine === 'object' ? machine : machines.find(m => m.number === String(machineNumber));
    
    assignTitle.textContent = `Przypisz — ${getDisplayRoleName(roleKey)} (Maszyna ${machineNumber})`;
    assignInfo.textContent = 'Ładuję listę pracowników...';

    assignList.innerHTML = '';

    // renderuj listę z pracownikami (zwykle + RDNST async)
    renderAssignModalContent(date, machine, roleKey, machineObj, machineNumber).catch(e => {
      console.error('renderAssignModalContent error:', e);
      assignInfo.textContent = `❌ Błąd ładowania listy: ${e.message}`;
      if(assignModal){ assignModal.style.display='none'; document.body.classList.remove('modal-open'); }
    });

  }catch(e){ console.error('openAssignModal error', e, { date, machine, roleKey }); if(assignModal){ assignModal.style.display='none'; document.body.classList.remove('modal-open'); } }
}

/* Render assign modal content with RDNST workers */
async function renderAssignModalContent(date, machine, roleKey, machineObj, machineNumber) {
  console.log('renderAssignModalContent START:', { date, machine: machine.number || machine, roleKey });
  try {
    // Załaduj RDNST pracowników dla tej daty
    const rdnstWorkers = await loadRdnstWorkersForDate(date);
    
    // Załaduj kierowników (dla checkbox Kierownicy)
    let managers = [];
    if(sb) {
      try {
        const { data, error } = await sb.from('managers').select('*').eq('can_drive', true);
        if(!error && data) managers = data;
      } catch(e) {
        console.warn('Error loading managers for modal', e);
      }
    }
    
    // Załaduj urlopy dla tej daty - synchronicznie przed filtrowaniem
    let employeesOnVacation = new Set();
    if(sb) {
      try {
        const { data: vacations, error } = await sb
          .from('vacation')
          .select('employee_id')
          .lte('start_date', date)
          .gte('end_date', date);
        
        if (!error && vacations) {
          vacations.forEach(v => employeesOnVacation.add(v.employee_id));
        }
        console.log('Employees on vacation for', date, ':', Array.from(employeesOnVacation));
      } catch(e) {
        console.warn('Error loading vacations for modal', e);
      }
    }
    
    // Przygotuj mapowanie BU -> pracownicy, filtrując pracowników na urlope I po konfliktach stanowisk
    const buMap = new Map();
    employees.forEach(emp => {
      // Pomiń pracowników na urlopie
      if (employeesOnVacation.has(emp.id)) {
        console.log('Skipping employee on vacation:', emp.surname, emp.firstname);
        return;
      }
      
      // Sprawdź konflikt stanowisk
      if(hasRoleConflict(emp.id, date, roleKey)) {
        console.log('Skipping employee due to role conflict:', emp.surname, emp.firstname, roleKey);
        return;
      }
      
      // Sprawdź dostępne procenty
      const utilization = getRoleUtilization(machineNumber);
      const rolePercent = utilization[roleKey] || 0;
      const available = getAvailableUtilization(emp.id, date);
      
      // Pomiń pracowników z 0% dostępności (już 100% przypisani)
      if (available <= 0) {
        return;
      }
      
      const bu = (emp.bu && String(emp.bu).trim()) ? String(emp.bu).trim() : 'Inne';
      if (!buMap.has(bu)) buMap.set(bu, []);
      buMap.get(bu).push({ ...emp, _available: available, _rolePercent: rolePercent });
    });
    
    console.log('Standard employees grouped into BU (filtered by vacation and role conflict):', Array.from(buMap.keys()));
    
    // RDNST pracownicy będą dodani do globalHelpers (ostatnia kolumna), nie do buMap
    let rdnstHelpers = [];
    if (rdnstWorkers && rdnstWorkers.length > 0) {
      rdnstHelpers = rdnstWorkers.filter(w => {
        // Sprawdź konflikt stanowisk
        if(hasRoleConflict(w.id, date, roleKey)) {
          return false;
        }
        
        // Pomiń pracowników z 0% dostępności
        const available = getAvailableUtilization(w.id, date);
        if (available <= 0) {
          return false;
        }
        
        return true;
      }).map(w => {
        const utilization = getRoleUtilization(machineNumber);
        const rolePercent = utilization[roleKey] || 0;
        const available = getAvailableUtilization(w.id, date);
        return { ...w, _available: available, _rolePercent: rolePercent };
      });
      console.log(`Loaded ${rdnstHelpers.length} RDNST workers for date ${date} (filtered by role conflict only)`);
    } else {
      console.log('No RDNST workers loaded for date', date, 'rdnstWorkers=', rdnstWorkers);
    }

    const roleCols = [
      { key: 'mechanik_focke', title: 'Mechanik Focke' },
      { key: 'mechanik_protos', title: 'Mechanik Protos' },
      { key: 'operator_focke', title: 'Operator Focke' },
      { key: 'operator_protos', title: 'Operator Protos' },
      { key: 'operator_krosowy', title: 'Operator Krosowy' }
    ];

    const helperRoles = ['pracownik_pomocniczy', 'filtry', 'inserty'];
    
    // Flaga dla kierowników
    let showManagersOnly = false;

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';
    topRow.style.gap = '8px';
    topRow.style.marginBottom = '8px';

    const leftInfo = document.createElement('div');
    leftInfo.className = 'small-muted';
    leftInfo.textContent = `Data: ${date} • Maszyna: ${machine} • Rola: ${getDisplayRoleName(roleKey)}`;
    topRow.appendChild(leftInfo);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.gap = '8px';

    const buSelect = document.createElement('select');
    buSelect.style.padding = '6px';
    buSelect.style.borderRadius = '6px';
    buSelect.style.border = '1px solid #d4dff0';
    const optAll = document.createElement('option'); optAll.value = '__all'; optAll.textContent = 'Wszystkie BU'; buSelect.appendChild(optAll);
    Array.from(buMap.keys()).sort().forEach(bu => { const o = document.createElement('option'); o.value = bu; o.textContent = bu; buSelect.appendChild(o); });
    controls.appendChild(buSelect);

    // Checkbox "Kierownicy" - pokaż tylko kierowników gotowych do jazdy
    if(managers && managers.length > 0) {
      // Filtruj kierowników - tylko tych bez konfliktu stanowisk i z dostępnością > 0
      const availableManagers = managers.filter(mgr => {
        // Sprawdź konflikt stanowisk
        if(hasRoleConflict(mgr.id, date, roleKey)) {
          return false;
        }
        
        // Pomiń kierowników z 0% dostępności
        const available = getAvailableUtilization(mgr.id, date);
        if (available <= 0) {
          return false;
        }
        
        return true;
      }).map(mgr => {
        const utilization = getRoleUtilization(machineNumber);
        const rolePercent = utilization[roleKey] || 0;
        const available = getAvailableUtilization(mgr.id, date);
        return { ...mgr, _available: available, _rolePercent: rolePercent };
      });
      
      const managerCheckWrapper = document.createElement('label');
      managerCheckWrapper.style.display = 'flex';
      managerCheckWrapper.style.alignItems = 'center';
      managerCheckWrapper.style.gap = '6px';
      managerCheckWrapper.style.cursor = 'pointer';
      managerCheckWrapper.style.fontSize = '13px';
      managerCheckWrapper.style.fontWeight = '600';
      managerCheckWrapper.style.whiteSpace = 'nowrap';
      
      const managerCheck = document.createElement('input');
      managerCheck.type = 'checkbox';
      managerCheck.checked = false;
      managerCheck.style.cursor = 'pointer';
      managerCheck.onchange = () => {
        showManagersOnly = managerCheck.checked;
        renderTable(buSelect.value); // Re-render z nową flagą
      };
      managerCheckWrapper.appendChild(managerCheck);
      
      const managerCheckLabel = document.createElement('span');
      managerCheckLabel.textContent = `👔 Kierownicy (${availableManagers.length})`;
      managerCheckWrapper.appendChild(managerCheckLabel);
      
      controls.appendChild(managerCheckWrapper);
      
      // Aktualizuj globalną listę kierowników z przefiltrowanymi
      managers = availableManagers;
    }

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn outline'; closeBtn.textContent = 'Zamknij'; closeBtn.onclick = () => { assignModal.style.display = 'none'; document.body.classList.remove('modal-open'); };
    controls.appendChild(closeBtn);

    topRow.appendChild(controls);
    assignList.appendChild(topRow);

    const wrap = document.createElement('div');
    wrap.className = 'assign-big-table-wrap';
    wrap.style.maxHeight = '70vh';
    wrap.style.overflow = 'auto';
    assignList.appendChild(wrap);

    // przygotuj globalną listę helperów
    const globalHelpersMap = new Map();
    employees.forEach(emp => {
      // Pomiń pracowników na urlopie
      if (employeesOnVacation.has(emp.id)) {
        return;
      }
      
      // Sprawdź konflikt stanowisk
      if(hasRoleConflict(emp.id, date, roleKey)) {
        return;
      }
      
      // Sprawdź dostępne procenty
      const utilization = getRoleUtilization(machineNumber);
      const rolePercent = utilization[roleKey] || 0;
      const available = getAvailableUtilization(emp.id, date);
      
      if(rolePercent > available) {
        return;
      }
      
      const empRoles = (Array.isArray(emp.roles) ? emp.roles : (emp.roles ? [emp.roles] : [])).map(r => String(r));
      const fullnameLower = ((emp.surname || '') + ' ' + (emp.name || '')).toLowerCase();
      const hasHelperRole = empRoles.some(r => helperRoles.includes(r)) || helperRoles.some(hr => fullnameLower.includes(hr));
      if (hasHelperRole) globalHelpersMap.set(emp.id, emp);
    });
    // Dodaj RDNST pracowników do globalHelpers (ostatnia kolumna)
    let globalHelpers = Array.from(globalHelpersMap.values());
    if (rdnstHelpers && rdnstHelpers.length > 0) {
      globalHelpers = globalHelpers.concat(rdnstHelpers);
    }
    globalHelpers = globalHelpers.sort((a,b) => (((a.surname||'') + ' ' + (a.name||'')).localeCompare(((b.surname||'') + ' ' + (b.name||'')))));
    
    console.log('Global helpers (after filtering vacation and utilization):', globalHelpers.length);

    function getRequiredPermsForMachine(machineNumber){
      try{
        const mm = machines.find(x => String(x.number) === String(machineNumber));
        const req = new Set();
        if(!mm) return req;
        ['maker','paker','celafoniarka','pakieciarka','kartoniarka'].forEach(k=>{ const v = mm[k]; if(v && String(v).trim()) req.add(String(v).trim()); });
        return req;
      }catch(e){ console.error('getRequiredPermsForMachine error', e, machineNumber); return new Set(); }
    }

    function empPermSet(emp){
      try{
        if(!emp) return new Set();
        const p = emp.permissions;
        if(!p) return new Set();
        if(Array.isArray(p)) return new Set(p.map(x=>String(x).trim()).filter(Boolean));
        return new Set(String(p).split(/[,;\s]+/).map(x=>String(x).trim()).filter(Boolean));
      }catch(e){ console.error('empPermSet error', e, emp); return new Set(); }
    }

    function missingPermsForEmp(emp, machineObj, roleKey){
      try{
        // Jeśli machineObj to string (numer), szukamy w machines
        let machine = machineObj;
        if(typeof machineObj === 'string'){
          machine = machines.find(m => m.number === machineObj);
          if(!machine) return []; // Nie znaleziono maszyny
        }
        
        // użyj nowej logiki z getMissingPermissionsForAssign
        const msg = getMissingPermissionsForAssign(emp, machine, roleKey);
        if(!msg) return []; // brak problemów
        return [msg]; // zwróć komunikat jako tablica
      }catch(e){ console.error('missingPermsForEmp error', e, {emp, machineObj, roleKey}); return []; }
    }

    function renderTable(filterBU = '__all'){
      wrap.innerHTML = '';
      const table = document.createElement('table');
      table.className = 'assign-big-table';
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.fontSize = '13px';

      const thead = document.createElement('thead');
      const thr = document.createElement('tr');
      const thBU = document.createElement('th'); thBU.textContent = 'BU'; thBU.style.width = '90px'; thBU.style.padding='8px'; thBU.style.textAlign='center'; thr.appendChild(thBU);
      roleCols.forEach(rc => { const th = document.createElement('th'); th.textContent = rc.title; th.style.padding='8px'; th.style.textAlign='center'; th.style.borderLeft = '1px solid rgba(0,0,0,0.06)'; thr.appendChild(th); });
      
      // Zmień nagłówek ostatniej kolumny gdy pokazujesz kierowników
      const thGlobal = document.createElement('th');
      thGlobal.textContent = showManagersOnly ? '👔 Kierownicy (Gotowi do jazdy)' : 'Pomocniczy / Filtry / Inserty';
      thGlobal.style.padding='8px'; thGlobal.style.textAlign='center'; thGlobal.style.borderLeft = '1px solid rgba(0,0,0,0.06)'; thr.appendChild(thGlobal);
      thead.appendChild(thr); table.appendChild(thead);

      const tbodyTable = document.createElement('tbody');
      const buKeys = Array.from(buMap.keys()).sort();
      const visibleBU = buKeys.filter(bu => filterBU === '__all' ? true : bu === filterBU);

      for (let i = 0; i < visibleBU.length; i++){
        const bu = visibleBU[i];
        const empList = buMap.get(bu) || [];

        const roleToList = {};
        roleCols.forEach(rc => roleToList[rc.key] = []);
        const roleToSet = {};
        roleCols.forEach(rc => roleToSet[rc.key] = new Set());

        empList.forEach(emp => {
          const empRoles = Array.isArray(emp.roles) ? emp.roles.map(r=>String(r)) : (emp.roles ? [String(emp.roles)] : []);
          empRoles.forEach(r => {
            if (roleToList[r] && !roleToSet[r].has(emp.id)){
              roleToList[r].push(emp); roleToSet[r].add(emp.id);
            }
          });

          const name = (emp.name || '').toLowerCase();
          if (name.includes('mechanik_focke') && !roleToSet['mechanik_focke'].has(emp.id)) { roleToList['mechanik_focke'].push(emp); roleToSet['mechanik_focke'].add(emp.id); }
          if (name.includes('mechanik_protos') && !roleToSet['mechanik_protos'].has(emp.id)) { roleToList['mechanik_protos'].push(emp); roleToSet['mechanik_protos'].add(emp.id); }
          if (name.includes('operator_focke') && !roleToSet['operator_focke'].has(emp.id)) { roleToList['operator_focke'].push(emp); roleToSet['operator_focke'].add(emp.id); }
          if (name.includes('operator_protos') && !roleToSet['operator_protos'].has(emp.id)) { roleToList['operator_protos'].push(emp); roleToSet['operator_protos'].add(emp.id); }
          if (name.includes('pracownik_pomocniczy') && !roleToSet['pracownik_pomocniczy'].has(emp.id)) { roleToList['pracownik_pomocniczy'].push(emp); roleToSet['pracownik_pomocniczy'].add(emp.id); }
        });

        const tr = document.createElement('tr');
        const tdBU = document.createElement('td'); tdBU.textContent = bu; tdBU.style.fontWeight = '700'; tdBU.style.padding = '8px'; tdBU.style.textAlign = 'center'; tr.appendChild(tdBU);

        roleCols.forEach(rc => {
          const td = document.createElement('td'); td.style.padding = '6px'; td.style.verticalAlign = 'top'; td.style.borderLeft = '1px solid rgba(0,0,0,0.03)'; td.className = 'td-names';
          const unique = Array.from(new Map((roleToList[rc.key]||[]).map(p=>[p.id,p])).values());
          const names = unique.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
          if(names.length === 0){ const span = document.createElement('div'); span.className='muted'; span.textContent='—'; td.appendChild(span); }
          else{ 
            // PRZECHWYTYWANIE rc.key dla każdej kolumny (unikanie closure bug)
            const capturedRoleKey = rc.key;
            names.forEach(emp=>{ 
              const div = document.createElement('div'); 
              div.className='emp-name';
              const available = getAvailableUtilization(emp.id, date);
              div.textContent = `${displayShort(emp)} (${available}%)`;
              div.title = `Dostępne: ${available}% do wykorzystania`;
              div.onclick = async ()=>{
                try{
                  // WAŻNE: Sprawdzaj uprawnienia dla ORYGINALNEJ roli (roleKey), nie kolumny w modalu!
                  const missing = missingPermsForEmp(emp, machineObj, roleKey);
                  if(missing && missing.length){
                    const ok = await showPermissionAlert(missing.join(', '));
                    if(!ok) return;
                  }
                  await saveAssignment(date, machineNumber, roleKey, emp.id);
                  assignModal.style.display='none'; document.body.classList.remove('modal-open');
                }catch(e){ console.error('assign click error', e, { emp }); }
              }; 
              td.appendChild(div); 
            }); 
          }
          tr.appendChild(td);
        });

        if(i === 0){
          const tdGlobal = document.createElement('td'); tdGlobal.style.padding='8px'; tdGlobal.style.verticalAlign='top'; tdGlobal.style.borderLeft='1px solid rgba(0,0,0,0.06)'; tdGlobal.setAttribute('rowspan', String(visibleBU.length || 1)); tdGlobal.className = 'td-global-helpers';
          
          // Przygotuj listę do wyświetlenia
          let itemsToShow = [];
          if(showManagersOnly) {
            // Pokaż kierowników + zawsze RDNST
            itemsToShow = [...managers];
            if(rdnstHelpers && rdnstHelpers.length > 0) {
              itemsToShow = itemsToShow.concat(rdnstHelpers);
            }
          } else {
            // Pokaż helperów (jak zwykle)
            itemsToShow = globalHelpers;
          }
          
          if(itemsToShow.length === 0){
            const m = document.createElement('div'); m.className='muted'; m.textContent='—'; tdGlobal.appendChild(m);
          } else {
            itemsToShow.forEach(emp => {
              const d = document.createElement('div'); d.className='emp-name';
              const available = getAvailableUtilization(emp.id, date);
              d.textContent = `${displayShort(emp)} (${available}%)`;
              d.title = `Dostępne: ${available}% do wykorzystania`;
              d.onclick = async ()=>{
                try{
                  const missing = missingPermsForEmp(emp, machineObj, roleKey);
                  if(missing && missing.length){
                    const ok = await showPermissionAlert(missing.join(', '));
                    if(!ok) return;
                  }
                  await saveAssignment(date, machineNumber, roleKey, emp.id);
                  assignModal.style.display='none'; document.body.classList.remove('modal-open');
                }catch(e){ console.error('assign global click error', e, { emp }); }
              }; tdGlobal.appendChild(d);
            });
          }
          tr.appendChild(tdGlobal);
        }

        tbodyTable.appendChild(tr);
      }

      table.appendChild(tbodyTable);
      wrap.appendChild(table);
    }

    renderTable('__all');
    buSelect.addEventListener('change', (e) => renderTable(e.target.value));

    const clear = document.createElement('button');
    clear.className = 'btn'; clear.style.marginTop='12px'; clear.style.width='100%'; clear.textContent='Wyczyść przypisanie';
    clear.onclick = async ()=>{ await saveAssignment(date, machineNumber, roleKey, null); assignModal.style.display='none'; document.body.classList.remove('modal-open'); };
    assignList.appendChild(clear);

    // Update title and info now that loading is done
    assignTitle.textContent = `Przypisz — ${getDisplayRoleName(roleKey)} (Maszyna ${machineNumber})`;
    assignInfo.textContent = `${Array.from(buMap.keys()).length} grupy BU • Pracownicy: ${employees.length}`;
    
    console.log('renderAssignModalContent DONE - modal rendered successfully');
  }catch(e){ 
    console.error('renderAssignModalContent EXCEPTION:', e, e.stack); 
    assignInfo.textContent = `❌ Błąd: ${e.message}`;
  }
}

/* -------------------- EXPORT CSV DLA DNIA -------------------- */
async function exportDayToCSV(date){
  try{
    if(!date){ await showNotification('Wybierz datę przed eksportem.', 'Błąd', '⚠️'); return; }
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
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }catch(e){ console.error('exportDayToCSV error', e, { date }); await showNotification('Błąd eksportu. Sprawdź konsolę.', 'Błąd', '❌'); }
}

/* -------------------- TRYB OFFLINE / ZABLOKOWANIE PRZYCISKÓW -------------------- */
let _origOpenAssignModal = null;
function enforceOnlineMode(){
  try{
    const controlsToDisable = ['addMachineBtn','saveMachineOrderBtn','adminExportEmpBtn','adminLogin','adminLoginBtn','exportDayBtn'];
    const existing = document.getElementById('offlineBanner'); if(existing) existing.remove();

    if(!sb){
      const banner = document.createElement('div');
      banner.id = 'offlineBanner';
      banner.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:10px 14px;background:#ffefc3;color:#5a3b00;text-align:center;z-index:10000;font-weight:600;box-shadow:0 2px 6px rgba(0,0,0,0.06);';
      banner.textContent = 'Brak połączenia z Supabase. Tryb edycji jest zablokowany.';
      document.body.appendChild(banner);
      window.scrollTo(0,0);

      controlsToDisable.forEach(id=>{ const el = document.getElementById(id); if(el){ el.disabled = true; el.classList && el.classList.add('disabled-btn'); } });

      if(!_origOpenAssignModal) _origOpenAssignModal = window.openAssignModal || openAssignModal;
      window.openAssignModal = function(){ showNotification('Brak połączenia z serwerem — przypisywanie jest zablokowane.', 'Błąd', '❌'); };
    } else {
      const b = document.getElementById('offlineBanner'); if(b) b.remove();
      controlsToDisable.forEach(id=>{ const el = document.getElementById(id); if(el){ el.disabled = false; el.classList && el.classList.remove('disabled-btn'); } });
      if(_origOpenAssignModal){ window.openAssignModal = _origOpenAssignModal; _origOpenAssignModal = null; }
    }
  }catch(e){ console.error('enforceOnlineMode error', e); }
}

/* -------------------- OBSŁUGA PRZYCISKU "PANEL ADMINISTRATORA" -------------------- */
document.addEventListener('DOMContentLoaded', () => {
  try{
    const adminLoginBtn = document.getElementById('adminLoginBtn');
    if (adminLoginBtn) {
      adminLoginBtn.addEventListener('click', async () => {
        const pass = await showAdminLoginModal();
        if (pass === 'admin123') {
          try { sessionStorage.setItem('adminAuthenticated', '1'); } catch(e) { console.warn('sessionStorage niedostępne', e); }
          window.location.href = './admin.html';
        } else if (pass !== null) { showNotification('Błędne hasło!', 'Błąd', '❌'); }
      });
    }
  }catch(e){ console.error('adminLoginBtn setup error', e); }
});

/* -------------------- BOOTSTRAP (inicjalizacja) -------------------- */
async function bootstrap(){
  await new Promise(r=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',r):r());
  try{
    dateInput = document.getElementById('dateInput');
    tbody = document.getElementById('tbody');
    theadRow = document.getElementById('theadRow');

    // ustaw dziś jako domyślną datę w polu
    if(dateInput) dateInput.value = new Date().toISOString().slice(0,10);

    setupAssignModal();

    await initSupabase();
    await loadEmployees();
    await loadMachines();
    
    // Załaduj kierowników dla cache'a
    try {
      if(sb) {
        const { data: managers, error } = await sb.from('managers').select('*');
        if(!error && managers) {
          window.mgrsCache = managers;
          console.log('Loaded managers cache:', managers.length);
        }
      }
    } catch(e) {
      console.warn('Error loading managers cache:', e);
    }

    currentDate = dateInput ? dateInput.value : (new Date().toISOString().slice(0,10));
    await loadAssignmentsForDate(currentDate);
    await loadVacationsForDate(currentDate);
    buildTableFor(currentDate);

    enforceOnlineMode();

    // Event listener na zmianę daty w input polu
    if(dateInput) {
      dateInput.addEventListener('change', async () => {
        currentDate = dateInput.value;
        await loadAssignmentsForDate(currentDate);
        await loadVacationsForDate(currentDate);
        buildTableFor(currentDate);
      });
    }

    const loadBtn = document.getElementById('loadDay');
    if(loadBtn) loadBtn.onclick = async ()=>{
      currentDate = dateInput.value;
      await loadAssignmentsForDate(currentDate);
      await loadVacationsForDate(currentDate);
      buildTableFor(currentDate);
    };

    const exportBtn = document.getElementById('exportDayBtn');
    if(exportBtn) exportBtn.onclick = ()=> exportDayToCSV(currentDate || dateInput.value);

    // Przycisk RDNST
    const rdnstBtn = document.getElementById('rdnstBtn');
    if(rdnstBtn) rdnstBtn.onclick = ()=> window.location.href = './rdnst.html';

    // Przycisk Urlopy
    const vacationBtn = document.getElementById('vacationBtn');
    if(vacationBtn) vacationBtn.onclick = ()=> window.location.href = './vacation.html';

    // Przycisk Kalendarz (na stronie vacation.html)
    const viewCalendarBtn = document.getElementById('viewCalendarBtn');
    if(viewCalendarBtn) viewCalendarBtn.onclick = ()=> window.location.href = './vacation-calendar.html';

    // Przycisk do czyszczenia przypisań (TEST)
    const clearBtn = document.getElementById('clearAssignmentsBtn');
    if(clearBtn) {
      // Wyświetl przycisk jeśli jest hasło testowe (localhost)
      if(window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        clearBtn.style.display = 'inline-block';
      }
      clearBtn.onclick = async () => {
        const confirm = await showPermissionAlert('Usunąć WSZYSTKIE przypisania na dzień ' + (currentDate || dateInput.value) + '?');
        if(confirm) {
          try {
            if(!sb) { await showNotification('Brak połączenia z serwerem', 'Błąd', '❌'); return; }
            const { error } = await sb.from('assignments').delete().eq('date', currentDate || dateInput.value);
            if(error) {
              await showNotification(`Błąd: ${error.message}`, 'Błąd', '❌');
            } else {
              await showNotification('✅ Wszystkie przypisania usunięte!', 'Sukces', '✅');
              await loadAssignmentsForDate(currentDate || dateInput.value);
              buildTableFor(currentDate || dateInput.value);
            }
          } catch(e) {
            console.error('Clear assignments error', e);
            await showNotification(`Błąd: ${e.message}`, 'Błąd', '❌');
          }
        }
      };
    }
  }catch(e){ console.error('bootstrap error', e); }
}

bootstrap();
