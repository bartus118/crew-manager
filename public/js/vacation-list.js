/* vacation-list.js — Moduł listy urlopów */

let sb = null;
let employees = [];
let selectedVacationDateFrom = null;
let selectedVacationDateTo = null;
let selectedRole = null;
let selectedBU = null;
let selectedReason = null;
let selectedEmployeeId = null;

/* ============ INIT SUPABASE ============ */
async function initSupabaseList() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('VacationList: Supabase ready');
  } catch (e) {
    console.warn('VacationList: Supabase init error', e);
    sb = null;
  }
}

/* ============ NOTIFICATION HELPER ============ */
async function showVacationNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
  const modal = document.getElementById('notificationModal');
  if (!modal) {
    alert(message);
    return;
  }

  return new Promise((resolve) => {
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    const okBtn = document.getElementById('notificationOkBtn');

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;
    if (iconEl) iconEl.textContent = icon;

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
  });
}

/* ============ LOAD EMPLOYEES ============ */
async function loadEmployeesForList() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('*').order('surname', { ascending: true });
    if (error) throw error;
    
    employees = data || [];
    console.log('Loaded', employees.length, 'employees:', employees);
  } catch (e) {
    console.error('Load employees error', e);
  }
}

/* ============ GET EMPLOYEE NAME ============ */
function getEmployeeName(employeeId) {
  const emp = employees.find(e => e.id === employeeId);
  return emp ? `${emp.surname} ${emp.firstname}` : 'Unknown';
}

/* ============ SELECT EMPLOYEE FROM SUGGESTIONS ============ */
function selectEmployee(employeeId, employeeName) {
  selectedEmployeeId = employeeId;
  document.getElementById('employeeSearch').value = employeeName;
  document.getElementById('employeeSuggestions').style.display = 'none';
  updateFilterChips();
  loadVacationsList();
}

/* ============ UPDATE FILTER CHIPS ============ */
function updateFilterChips() {
  const chipsContainer = document.getElementById('activeFiltersChips');
  const clearBtn = document.getElementById('clearAllFiltersBtn');
  
  const filters = [];
  
  if (selectedVacationDateFrom) filters.push({ label: `Od: ${selectedVacationDateFrom}`, type: 'date' });
  if (selectedVacationDateTo) filters.push({ label: `Do: ${selectedVacationDateTo}`, type: 'date' });
  if (selectedRole) filters.push({ label: `Rola: ${selectedRole}`, type: 'role' });
  if (selectedBU) filters.push({ label: `BU: ${selectedBU}`, type: 'bu' });
  if (selectedReason) filters.push({ label: `Typ: ${selectedReason}`, type: 'reason' });
  if (selectedEmployeeId) {
    const emp = employees.find(e => e.id === selectedEmployeeId);
    const empName = emp ? `${emp.surname} ${emp.firstname}` : 'Unknown';
    filters.push({ label: `Pracownik: ${empName}`, type: 'employee' });
  }
  
  if (filters.length === 0) {
    chipsContainer.innerHTML = '<span style="color: #999; font-size: 13px;">Brak aktywnych filtrów</span>';
    clearBtn.style.display = 'none';
  } else {
    chipsContainer.innerHTML = filters.map(f => `
      <div style="display: flex; align-items: center; gap: 6px; background: #667eea; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">
        <span>${f.label}</span>
        <button style="background: none; border: none; color: white; cursor: pointer; padding: 0; font-size: 14px; padding: 0 0 2px 0;" onclick="removeFilter('${f.type}')">✕</button>
      </div>
    `).join('');
    clearBtn.style.display = 'inline-block';
  }
}

/* ============ REMOVE SINGLE FILTER ============ */
function removeFilter(type) {
  if (type === 'date') {
    selectedVacationDateFrom = null;
    selectedVacationDateTo = null;
    document.getElementById('vacationListDateFromPicker').value = '';
    document.getElementById('vacationListDateToPicker').value = '';
  } else if (type === 'role') {
    selectedRole = null;
    document.getElementById('roleFilter').value = '';
  } else if (type === 'bu') {
    selectedBU = null;
    document.getElementById('buFilter').value = '';
  } else if (type === 'reason') {
    selectedReason = null;
    document.getElementById('reasonFilter').value = '';
  } else if (type === 'employee') {
    selectedEmployeeId = null;
    document.getElementById('employeeSearch').value = '';
    document.getElementById('employeeSuggestions').style.display = 'none';
  }
  updateFilterChips();
  loadVacationsList();
}

/* ============ LOAD VACATIONS LIST ============ */
async function loadVacationsList() {
  const listDiv = document.getElementById('vacationList');
  listDiv.innerHTML = '⏳ Ładuję...';

  if (!sb) {
    listDiv.innerHTML = '<div class="muted">❌ Brak połączenia z serwerem</div>';
    return;
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data: vacations, error } = await sb
      .from('vacation')
      .select('*')
      .gte('end_date', today)
      .order('start_date', { ascending: true });

    if (error) throw error;

    listDiv.innerHTML = '';
    
    // Sekcja z listą urlopów
    const vacationsLabel = document.createElement('h3');
    vacationsLabel.style.marginTop = '0';
    vacationsLabel.style.marginBottom = '12px';
    vacationsLabel.style.color = '#0f1724';
    vacationsLabel.style.fontSize = '14px';
    vacationsLabel.style.display = 'flex';
    vacationsLabel.style.justifyContent = 'space-between';
    vacationsLabel.style.alignItems = 'center';
    
    // Wyświetl informację o wybranym zakresie lub wszystkie
    const titleText = document.createElement('span');
    if (selectedVacationDateFrom && selectedVacationDateTo) {
      titleText.textContent = `Nieobecności od ${selectedVacationDateFrom} do ${selectedVacationDateTo}:`;
    } else if (selectedVacationDateFrom) {
      titleText.textContent = `Nieobecności od ${selectedVacationDateFrom}:`;
    } else if (selectedVacationDateTo) {
      titleText.textContent = `Nieobecności do ${selectedVacationDateTo}:`;
    } else {
      titleText.textContent = 'Wszystkie nieobecności:';
    }
    
    vacationsLabel.appendChild(titleText);
    listDiv.appendChild(vacationsLabel);

    if (!vacations || vacations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '📭 Brak zaplanowanych nieobecności';
      listDiv.appendChild(empty);
      return;
    }
    
    // Filtruj urlopy jeśli wybrany jest zakres dat
    let filteredVacations = vacations;
    if (selectedVacationDateFrom || selectedVacationDateTo) {
      filteredVacations = vacations.filter(v => {
        const vacationStart = new Date(v.start_date);
        const vacationEnd = new Date(v.end_date);
        
        if (selectedVacationDateFrom && selectedVacationDateTo) {
          const filterFrom = new Date(selectedVacationDateFrom);
          const filterTo = new Date(selectedVacationDateTo);
          // Nieobecność musi zachodzić w wybranym zakresie
          return vacationStart <= filterTo && vacationEnd >= filterFrom;
        } else if (selectedVacationDateFrom) {
          const filterFrom = new Date(selectedVacationDateFrom);
          // Nieobecność musi się skończyć po wybranej dacie
          return vacationEnd >= filterFrom;
        } else if (selectedVacationDateTo) {
          const filterTo = new Date(selectedVacationDateTo);
          // Nieobecność musi się zacząć przed wybraną datą
          return vacationStart <= filterTo;
        }
        return true;
      });
    }
    
    // Filtruj po typie nieobecności
    if (selectedReason) {
      filteredVacations = filteredVacations.filter(v => v.reason === selectedReason);
    }
    
    // Group by employee
    const grouped = {};
    filteredVacations.forEach(v => {
      if (!grouped[v.employee_id]) grouped[v.employee_id] = [];
      grouped[v.employee_id].push(v);
    });
    
    // Filtruj po pracowniku jeśli wybrany
    let filteredEmployees = Object.keys(grouped);
    if (selectedEmployeeId) {
      filteredEmployees = filteredEmployees.filter(empId => empId === selectedEmployeeId);
    }
    
    // Filtruj pracowników po roli i BU
    if (selectedRole || selectedBU) {
      filteredEmployees = filteredEmployees.filter(empId => {
        const emp = employees.find(e => e.id === empId);
        if (!emp) return false;
        
        if (selectedRole) {
          const roles = Array.isArray(emp.roles) ? emp.roles : (emp.roles ? [emp.roles] : []);
          if (!roles.some(r => String(r).trim() === selectedRole)) return false;
        }
        
        if (selectedBU) {
          if (String(emp.bu || '').trim() !== selectedBU) return false;
        }
        
        return true;
      });
    }

    // Render
    if (filteredEmployees.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '📭 Brak wyników pasujących do filtrów';
      listDiv.appendChild(empty);
      return;
    }

    filteredEmployees.forEach(empId => {
      const empName = getEmployeeName(empId);
      const emp = employees.find(e => e.id === empId);
      const surname = emp?.surname || '';
      const firstname = emp?.firstname || '';
      
      const empSection = document.createElement('div');
      empSection.style.marginBottom = '12px';
      
      const empHeader = document.createElement('div');
      empHeader.style.fontSize = '13px';
      empHeader.style.fontWeight = '600';
      empHeader.style.color = '#0f1724';
      empHeader.style.marginBottom = '6px';
      empHeader.textContent = `👤 ${surname} ${firstname}`;
      
      empSection.appendChild(empHeader);

      grouped[empId].forEach(vac => {
        const card = document.createElement('div');
        card.style.fontSize = '12px';
        card.style.padding = '4px 0';
        card.style.display = 'flex';
        card.style.justifyContent = 'space-between';
        card.style.alignItems = 'center';
        card.style.gap = '10px';
        
        const infoDiv = document.createElement('div');
        infoDiv.style.flex = '1';
        infoDiv.textContent = `${vac.start_date} do ${vac.end_date}${vac.reason ? ' (' + vac.reason + ')' : ''}`;
        
        card.appendChild(infoDiv);
        
        const removeBtn = document.createElement('button');
        removeBtn.style.padding = '2px 8px';
        removeBtn.style.background = '#fff';
        removeBtn.style.border = '1px solid #ddd';
        removeBtn.style.borderRadius = '3px';
        removeBtn.style.color = '#666';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.fontSize = '11px';
        removeBtn.textContent = 'Usuń';
        removeBtn.onclick = async () => {
          await removeVacation(vac.id);
        };
        
        card.appendChild(removeBtn);
        empSection.appendChild(card);
      });

      listDiv.appendChild(empSection);
    });

  } catch (e) {
    console.error('loadVacationsList error', e);
    listDiv.innerHTML = '<div class="muted">❌ Błąd przy ładowaniu listy</div>';
  }
}

/* ============ REMOVE VACATION ============ */
async function removeVacation(vacationId) {
  if (!sb) return;
  
  const confirmed = confirm('Czy na pewno chcesz usunąć tę nieobecność?');
  if (!confirmed) return;
  
  try {
    const { error } = await sb.from('vacation').delete().eq('id', vacationId);
    if (error) throw error;
    
    await showVacationNotification('Nieobecność usunięta', 'Sukces', '✅');
    await loadVacationsList();
  } catch (e) {
    console.error('Remove vacation error', e);
    await showVacationNotification('Błąd przy usuwaniu nieobecności', 'Błąd', '❌');
  }
}

/* ============ INIT ============ */
async function initVacationList() {
  await initSupabaseList();
  
  // Load employees
  await loadEmployeesForList();
  
  // Populate role and BU dropdowns
  const roles = new Set();
  const bus = new Set();
  employees.forEach(emp => {
    // Spróbuj pobrać role z różnych możliwych pól
    const empRoles = emp.roles || emp.role || emp.position || [];
    const rolesArray = Array.isArray(empRoles) ? empRoles : (empRoles ? [empRoles] : []);
    rolesArray.forEach(r => {
      if (r) roles.add(String(r).trim());
    });
    
    // Spróbuj pobrać BU z różnych możliwych pól
    const bu = emp.bu || emp.business_unit || emp.department || '';
    if (bu) bus.add(String(bu).trim());
  });
  
  console.log('Available roles:', Array.from(roles));
  console.log('Available BUs:', Array.from(bus));
  
  const roleFilter = document.getElementById('roleFilter');
  const buFilter = document.getElementById('buFilter');
  
  Array.from(roles).sort().forEach(role => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role;
    roleFilter.appendChild(option);
  });
  
  Array.from(bus).sort().forEach(bu => {
    const option = document.createElement('option');
    option.value = bu;
    option.textContent = bu;
    buFilter.appendChild(option);
  });
  
  // Back button
  const backBtn = document.getElementById('backToVacationBtn');
  if (backBtn) backBtn.addEventListener('click', () => window.location.href = './vacation.html');
  
  // Date filters
  const dateFromPicker = document.getElementById('vacationListDateFromPicker');
  const dateToPicker = document.getElementById('vacationListDateToPicker');
  const reasonFilter = document.getElementById('reasonFilter');
  const clearAllBtn = document.getElementById('clearAllFiltersBtn');
  
  if (dateFromPicker) {
    dateFromPicker.addEventListener('change', (e) => {
      selectedVacationDateFrom = e.target.value || null;
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  if (dateToPicker) {
    dateToPicker.addEventListener('change', (e) => {
      selectedVacationDateTo = e.target.value || null;
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  if (roleFilter) {
    roleFilter.addEventListener('change', (e) => {
      selectedRole = e.target.value || null;
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  if (buFilter) {
    buFilter.addEventListener('change', (e) => {
      selectedBU = e.target.value || null;
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  if (reasonFilter) {
    reasonFilter.addEventListener('change', (e) => {
      selectedReason = e.target.value || null;
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  if (clearAllBtn) {
    clearAllBtn.addEventListener('click', () => {
      selectedVacationDateFrom = null;
      selectedVacationDateTo = null;
      selectedRole = null;
      selectedBU = null;
      selectedReason = null;
      selectedEmployeeId = null;
      
      dateFromPicker.value = '';
      dateToPicker.value = '';
      roleFilter.value = '';
      buFilter.value = '';
      reasonFilter.value = '';
      document.getElementById('employeeSearch').value = '';
      document.getElementById('employeeSuggestions').style.display = 'none';
      
      updateFilterChips();
      loadVacationsList();
    });
  }
  
  // Employee search
  const employeeSearch = document.getElementById('employeeSearch');
  if (employeeSearch) {
    employeeSearch.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      const suggestionsDiv = document.getElementById('employeeSuggestions');
      
      if (!query) {
        suggestionsDiv.style.display = 'none';
        selectedEmployeeId = null;
      } else {
        // Find matching employees
        const matches = employees.filter(emp => 
          (emp.surname && emp.surname.toLowerCase().includes(query)) ||
          (emp.firstname && emp.firstname.toLowerCase().includes(query))
        ).slice(0, 10); // Limit to 10 suggestions
        
        if (matches.length > 0) {
          suggestionsDiv.innerHTML = matches.map(emp => `
            <div style="padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #f0f0f0; font-size: 12px;" 
                 onmouseenter="this.style.background='#f5f5f5'" 
                 onmouseleave="this.style.background='white'"
                 onclick="selectEmployee('${emp.id}', '${emp.surname} ${emp.firstname}')">
              👤 ${emp.surname} ${emp.firstname}
            </div>
          `).join('');
          suggestionsDiv.style.display = 'block';
        } else {
          suggestionsDiv.style.display = 'none';
        }
      }
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
      if (!employeeSearch.contains(e.target) && !document.getElementById('employeeSuggestions').contains(e.target)) {
        document.getElementById('employeeSuggestions').style.display = 'none';
      }
    });
  }
  
  // Load initial list
  await loadVacationsList();

  console.log('Vacation List module initialized');
}

document.addEventListener('DOMContentLoaded', initVacationList);
