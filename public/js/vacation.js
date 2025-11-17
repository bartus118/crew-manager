/* vacation.js — Moduł zarządzania urlopami */

let sb = null;
let employees = [];
let selectedVacationDate = null; // Przechowuje wybrany dzień z tabeli

// PLAN URLOPÓW - zmienne
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let vacationLimitValue = 26;
let vacationPlans = [];
let selectedRangeStart = null;
let selectedRangeEnd = null;
let isEditMode = false;

// CALENDAR - zmienne
let currentMonth = new Date().getMonth();
let viewMode = 'month';
let absencesCache = {};
let planedVacations = {};
let selectedAbsences = {};
let selectedDayForModal = null;
let rangeStartDate = null;
let rangeEndDate = null;
let isMouseDown = false;

const ADMIN_PASSWORD = 'admin123';

const typeColors = {
  'Urlop wypoczynkowy': { bg: '#FFE082', border: '#FBC02D', icon: '📅' },
  'Urlop na żądanie': { bg: '#FFB74D', border: '#F57C00', icon: '📆' },
  'L4': { bg: '#F8BBD0', border: '#EC407A', icon: '🏥' },
  'Delegacja': { bg: '#BBDEFB', border: '#1976D2', icon: '✈️' },
  'Szkolenie': { bg: '#C8E6C9', border: '#388E3C', icon: '📚' }
};

/* ============ ROLE MAPPING ============ */
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

/* ============ INIT SUPABASE ============ */
async function initSupabaseVacation() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('Vacation: Supabase ready');
  } catch (e) {
    console.warn('Vacation: Supabase init error', e);
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

// Aliasy do notyfikacji dla kompatybilności
async function showPlanNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
  return showVacationNotification(message, title, icon);
}

async function showCalendarNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
  return showVacationNotification(message, title, icon);
}

/* ============ GET REASON LABEL ============ */
function getReasonLabel(reason) {
  const reasonMap = {
    'Urlopy': 'Urlopy',
    'L4': 'L4',
    'Delegacje': 'Delegacje',
    'Szkolenia': 'Szkolenia'
  };
  return reasonMap[reason] || reason;
}

/* ============ LOAD EMPLOYEES ============ */
async function loadEmployeesForSelect() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('id, surname, firstname').order('surname', { ascending: true });
    if (error) throw error;
    
    employees = data || [];
    
    // Ustaw event listeners dla wyszukiwania
    setupEmployeeSearch();
    
    console.log('Loaded', employees.length, 'employees');
  } catch (e) {
    console.error('Load employees error', e);
  }
}

/* ============ EMPLOYEE SEARCH ============ */
function setupEmployeeSearch() {
  const searchInput = document.getElementById('vacationEmployeeSearch');
  const dropdown = document.getElementById('vacationEmployeeDropdown');
  const dropdownList = dropdown.querySelector('.dropdown-list');
  const hiddenSelect = document.getElementById('vacationEmployeeSelect');
  
  if (!searchInput) return;
  
  // Event: wpisywanie w input
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      dropdown.style.display = 'none';
      return;
    }
    
    // Filtruj pracowników
    const filtered = employees.filter(emp => {
      const fullname = `${emp.surname} ${emp.firstname}`.toLowerCase();
      return fullname.includes(query);
    });
    
    // Renderuj dropdown
    dropdownList.innerHTML = '';
    
    if (filtered.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'dropdown-item no-results';
      noResults.textContent = 'Brak wyników';
      dropdownList.appendChild(noResults);
    } else {
      filtered.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = `${emp.surname} ${emp.firstname}`;
        item.dataset.id = emp.id;
        
        item.addEventListener('click', () => {
          searchInput.value = `${emp.surname} ${emp.firstname}`;
          hiddenSelect.value = emp.id;
          dropdown.style.display = 'none';
        });
        
        dropdownList.appendChild(item);
      });
    }
    
    dropdown.style.display = 'block';
  });
  
  // Event: focus - pokaż dropdown jeśli pusty
  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) {
      searchInput.value = '';
      hiddenSelect.value = '';
      
      dropdownList.innerHTML = '';
      employees.forEach(emp => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = `${emp.surname} ${emp.firstname}`;
        item.dataset.id = emp.id;
        
        item.addEventListener('click', () => {
          searchInput.value = `${emp.surname} ${emp.firstname}`;
          hiddenSelect.value = emp.id;
          dropdown.style.display = 'none';
        });
        
        dropdownList.appendChild(item);
      });
      
      dropdown.style.display = 'block';
    }
  });
  
  // Event: blur (kliknięcie poza) - ukryj dropdown
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 150);
  });
  
  // Event: kliknięcie poza - ukryj dropdown
  document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.employee-search-wrapper');
    if (!wrapper || !wrapper.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });
}

/* ============ GET EMPLOYEE NAME ============ */
function getEmployeeName(employeeId) {
  const emp = employees.find(e => e.id === employeeId);
  return emp ? `${emp.surname} ${emp.firstname}` : 'Nieznany pracownik';
}

/* ============ ADD VACATION ============ */
async function addVacation() {
  const employeeId = document.getElementById('vacationEmployeeSelect').value;
  const startDate = document.getElementById('vacationStartDate').value;
  const endDate = document.getElementById('vacationEndDate').value;
  const reason = document.getElementById('vacationReason').value;

  if (!employeeId || !startDate || !endDate) {
    await showVacationNotification('Uzupełnij pracownika i daty', 'Błąd', '⚠️');
    return;
  }

  if (!reason) {
    await showVacationNotification('Wybierz rodzaj nieobecności', 'Błąd', '⚠️');
    return;
  }

  if (new Date(startDate) > new Date(endDate)) {
    await showVacationNotification('Data początkowa musi być przed datą końcową', 'Błąd', '⚠️');
    return;
  }

  if (!sb) {
    await showVacationNotification('Brak połączenia z serwerem', 'Błąd', '❌');
    return;
  }

  // Sprawdź czy pracownik ma już inny typ nieobecności w tym terminie
  try {
    const { data: existingVacations, error: checkError } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', employeeId)
      .lte('start_date', endDate)
      .gte('end_date', startDate);
    
    if (checkError) throw checkError;
    
    if (existingVacations && existingVacations.length > 0) {
      // Sprawdź czy któraś istniejąca nieobecność ma inny typ niż próbujemy dodać
      const conflictingVacation = existingVacations.find(v => v.reason !== reason);
      if (conflictingVacation) {
        const conflictReason = getReasonLabel(conflictingVacation.reason);
        const newReason = getReasonLabel(reason);
        await showVacationNotification(
          `Konflikt! Pracownik ma już "${conflictReason}" w terminie ${conflictingVacation.start_date} do ${conflictingVacation.end_date}. Nie można nadać jednocześnie "${newReason}"`,
          'Błąd',
          '⚠️'
        );
        return;
      }
    }
  } catch (e) {
    console.error('Error checking for conflicting vacations', e);
    await showVacationNotification(`Błąd sprawdzania: ${e.message}`, 'Błąd', '❌');
    return;
  }

  const statusDiv = document.getElementById('vacationStatus');
  statusDiv.innerHTML = '⏳ Dodaję urlop...';
  statusDiv.className = 'status-box';
  statusDiv.style.display = 'block';

  try {
    const { error } = await sb.from('vacation').insert([{
      employee_id: employeeId,
      start_date: startDate,
      end_date: endDate,
      reason: reason
    }]);

    if (error) {
      statusDiv.className = 'status-box error';
      statusDiv.innerHTML = `❌ <strong>Błąd:</strong> ${error.message}`;
      console.error('Add vacation error', error);
      return;
    }

    statusDiv.className = 'status-box success';
    statusDiv.innerHTML = `✅ <strong>Nieobecność dodana!</strong><br>${getEmployeeName(employeeId)}<br>${startDate} do ${endDate}`;
    statusDiv.style.display = 'block';

    // Clear form
    document.getElementById('vacationEmployeeSearch').value = '';
    document.getElementById('vacationEmployeeSelect').value = '';
    document.getElementById('vacationStartDate').value = '';
    document.getElementById('vacationEndDate').value = '';
    document.getElementById('vacationReason').value = '';

    // Refresh list
    await loadVacationsList();

  } catch (e) {
    console.error('Add vacation catch', e);
    statusDiv.className = 'status-box error';
    statusDiv.innerHTML = `❌ <strong>Błąd:</strong> ${e.message}`;
  }
}

/* ============ REMOVE VACATION ============ */
async function removeVacation(vacationId) {
  if (!confirm('Usunąć ten urlop?')) return;

  if (!sb) {
    await showVacationNotification('Brak połączenia z serwerem', 'Błąd', '❌');
    return;
  }

  try {
    const { error } = await sb.from('vacation').delete().eq('id', vacationId);
    if (error) {
      await showVacationNotification(`Błąd: ${error.message}`, 'Błąd', '❌');
      return;
    }
    
    await loadVacationsList();
  } catch (e) {
    console.error('Remove vacation error', e);
    await showVacationNotification(`Błąd: ${e.message}`, 'Błąd', '❌');
  }
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
    
    // Jeśli jest wybrany dzień, pokaż go w nagłówku
    const titleText = document.createElement('span');
    if (selectedVacationDate) {
      titleText.textContent = `Szczegółowa lista nieobecności na ${selectedVacationDate}:`;
      
      // Dodaj przycisk do wyczyszczenia filtra
      const clearBtn = document.createElement('button');
      clearBtn.textContent = '✕ Wyczyść filtr';
      clearBtn.style.padding = '6px 12px';
      clearBtn.style.fontSize = '12px';
      clearBtn.style.background = '#f5f5f5';
      clearBtn.style.border = '1px solid #ddd';
      clearBtn.style.borderRadius = '4px';
      clearBtn.style.cursor = 'pointer';
      clearBtn.style.fontWeight = '500';
      clearBtn.onclick = () => {
        selectedVacationDate = null;
        loadVacationsList();
      };
      vacationsLabel.appendChild(clearBtn);
    } else {
      titleText.textContent = 'Szczegółowa lista nieobecności:';
    }
    
    vacationsLabel.insertBefore(titleText, vacationsLabel.firstChild);
    listDiv.appendChild(vacationsLabel);

    if (!vacations || vacations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '📭 Brak zaplanowanych nieobecności';
      listDiv.appendChild(empty);
      return;
    }
    
    // Filtruj urlopy jeśli jest wybrany dzień
    let filteredVacations = vacations;
    if (selectedVacationDate) {
      filteredVacations = vacations.filter(v => {
        const startDate = new Date(v.start_date);
        const endDate = new Date(v.end_date);
        const selectedDate = new Date(selectedVacationDate);
        return selectedDate >= startDate && selectedDate <= endDate;
      });
    }
    
    // Group by employee
    const grouped = {};
    filteredVacations.forEach(v => {
      if (!grouped[v.employee_id]) grouped[v.employee_id] = [];
      grouped[v.employee_id].push(v);
    });

    // Render
    if (Object.keys(grouped).length === 0) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = selectedVacationDate 
        ? `📭 Brak nieobecności na ${selectedVacationDate}`
        : '📭 Brak zaplanowanych nieobecności';
      listDiv.appendChild(empty);
      return;
    }

    Object.keys(grouped).forEach(empId => {
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
    console.error('Load vacations error', e);
    listDiv.innerHTML = `<div class="muted">❌ Błąd: ${e.message}</div>`;
  }
}

/* ============ RENDER VACATION STATISTICS ============ */
async function renderVacationStatistics(container, todayStr) {
  if (!sb) return;
  
  // Oblicz przedział: 2 dni wstecz, 7 dni naprzód
  const today = new Date(todayStr);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 2);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 7);
  const endDateStr = endDate.toISOString().split('T')[0];
  
  try {
    // Załaduj wszystkich pracowników z ich rolami
    const { data: empData, error: empError } = await sb
      .from('employees')
      .select('id, surname, firstname, roles')
      .order('surname', { ascending: true });
    
    if (empError) throw empError;
    
    const empMap = {};
    empData.forEach(emp => {
      empMap[emp.id] = emp;
    });
    
    // Załaduj urlopy w tym przedziale
    const { data: vacs, error: vacError } = await sb
      .from('vacation')
      .select('employee_id, start_date, end_date')
      .lte('start_date', endDateStr)
      .gte('end_date', startDateStr);
    
    if (vacError) throw vacError;
    
    // Zbuduj mapę urlop -> pracownicy -> role
    const statsByDate = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      statsByDate[dateStr] = {};
    }
    
    vacs.forEach(vac => {
      let currentDate = new Date(vac.start_date);
      const endDateObj = new Date(vac.end_date);
      
      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        if (statsByDate[dateStr]) {
          const emp = empMap[vac.employee_id];
          if (emp) {
            // Ustaw role (mogą być string, array, lub undefined)
            const roles = Array.isArray(emp.roles) 
              ? emp.roles 
              : (emp.roles ? [emp.roles] : ['unknown']);
            
            roles.forEach(role => {
              const roleStr = String(role).trim();
              if (!statsByDate[dateStr][roleStr]) {
                statsByDate[dateStr][roleStr] = 0;
              }
              statsByDate[dateStr][roleStr]++;
            });
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
    
    // Zbierz wszystkie role ze wszystkich pracowników (nie tylko z nieobecności)
    const allRoles = new Set();
    empData.forEach(emp => {
      const roles = Array.isArray(emp.roles) 
        ? emp.roles 
        : (emp.roles ? [emp.roles] : ['unknown']);
      roles.forEach(role => allRoles.add(String(role).trim()));
    });
    const sortedRoles = Array.from(allRoles).sort();
    
    // Renderuj tabelkę
    const statsContainer = document.createElement('div');
    statsContainer.className = 'vacation-stats';
    statsContainer.style.marginBottom = '24px';
    statsContainer.style.background = 'rgba(255, 255, 255, 0.95)';
    statsContainer.style.padding = '24px';
    statsContainer.style.borderRadius = '12px';
    statsContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)';
    
    const title = document.createElement('h3');
    title.style.marginTop = '0';
    title.style.marginBottom = '12px';
    title.style.color = '#0f1724';
    title.style.fontSize = '14px';
    title.textContent = '📊 Nieobecności na 2 dni wstecz i 7 dni naprzód:';
    statsContainer.appendChild(title);
    
    const table = document.createElement('table');
    table.className = 'vacation-stats-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '12px';
    
    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.background = 'rgba(102, 126, 234, 0.5)';
    headerRow.style.borderBottom = '3px solid rgba(102, 126, 234, 0.8)';
    
    const roleHeader = document.createElement('th');
    roleHeader.textContent = 'Rola';
    roleHeader.style.padding = '8px';
    roleHeader.style.textAlign = 'left';
    roleHeader.style.fontWeight = '700';
    roleHeader.style.color = '#0f1724';
    headerRow.appendChild(roleHeader);
    
    // Nagłówki dat
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const [year, month, day] = dateStr.split('-');
      const dayName = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'][new Date(dateStr).getDay()];
      
      const th = document.createElement('th');
      th.style.padding = '8px';
      th.style.textAlign = 'center';
      th.style.fontWeight = '700';
      th.style.color = '#fff';
      th.style.borderLeft = '2px solid rgba(102, 126, 234, 0.8)';
      th.style.cursor = 'pointer';
      th.style.transition = 'all 0.2s ease';
      
      th.innerHTML = `${day}.${month}<br>${dayName}`;
      
      // Dodaj event listener - kliknięcie na nagłówek daty
      th.addEventListener('click', () => {
        selectedVacationDate = dateStr;
        loadVacationsList();
      });
      
      th.addEventListener('mouseover', () => {
        th.style.background = 'rgba(102, 126, 234, 0.7)';
        th.style.transform = 'scale(1.05)';
        th.style.fontWeight = '800';
      });
      
      th.addEventListener('mouseout', () => {
        th.style.background = 'rgba(102, 126, 234, 0.5)';
        th.style.transform = 'scale(1)';
        th.style.fontWeight = '700';
      });
      
      headerRow.appendChild(th);
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    sortedRoles.forEach((role, idx) => {
      const tr = document.createElement('tr');
      if (idx % 2 === 0) {
        tr.style.background = 'rgba(102, 126, 234, 0.12)';
      }
      tr.style.borderBottom = '1px solid rgba(102, 126, 234, 0.4)';
      
      const roleCell = document.createElement('td');
      roleCell.textContent = getDisplayRoleName(role) || '(brak roli)';
      roleCell.style.padding = '8px';
      roleCell.style.fontWeight = '600';
      roleCell.style.color = '#0f1724';
      roleCell.style.whiteSpace = 'nowrap';
      tr.appendChild(roleCell);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const count = statsByDate[dateStr][role] || 0;
        
        const cell = document.createElement('td');
        cell.style.padding = '8px';
        cell.style.textAlign = 'center';
        cell.style.borderLeft = '1px solid rgba(102, 126, 234, 0.5)';
        cell.style.fontWeight = '600';
        
        if (count > 0) {
          cell.style.color = '#c62828';
          cell.textContent = count;
        } else {
          cell.style.color = '#999';
          cell.textContent = '—';
        }
        
        // Dodaj event listener na kliknięcie - zapamiętaj wybrany dzień
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
          selectedVacationDate = dateStr;
          loadVacationsList();
        });
        cell.addEventListener('mouseover', () => {
          if (count > 0) {
            cell.style.background = 'rgba(198, 40, 40, 0.35)';
          } else {
            cell.style.background = 'rgba(102, 126, 234, 0.15)';
          }
        });
        cell.addEventListener('mouseout', () => {
          cell.style.background = '';
        });
        
        tr.appendChild(cell);
      }
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    statsContainer.appendChild(table);
    container.appendChild(statsContainer);
    
  } catch (e) {
    console.error('renderVacationStatistics error', e);
  }
}

/* ============ RENDER VACATION PLAN STATISTICS ============ */
async function renderVacationPlanStatistics(container, todayStr) {
  if (!sb) return;
  
  // Oblicz przedział: 2 dni wstecz, 7 dni naprzód
  const today = new Date(todayStr);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - 2);
  const startDateStr = startDate.toISOString().split('T')[0];
  
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 7);
  const endDateStr = endDate.toISOString().split('T')[0];
  
  try {
    // Załaduj wszystkich pracowników z ich rolami
    const { data: empData, error: empError } = await sb
      .from('employees')
      .select('id, surname, firstname, roles')
      .order('surname', { ascending: true });
    
    if (empError) throw empError;
    
    const empMap = {};
    empData.forEach(emp => {
      empMap[emp.id] = emp;
    });
    
    // Załaduj planowane urlopy w tym przedziale
    const { data: plans, error: planError } = await sb
      .from('vacation_plans')
      .select('employee_id, start_date, end_date')
      .lte('start_date', endDateStr)
      .gte('end_date', startDateStr);
    
    if (planError) throw planError;
    
    // Zbuduj mapę urlop -> pracownicy -> role
    const statsByDate = {};
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      statsByDate[dateStr] = {};
    }
    
    plans.forEach(plan => {
      let currentDate = new Date(plan.start_date);
      const endDateObj = new Date(plan.end_date);
      
      while (currentDate <= endDateObj) {
        const dateStr = currentDate.toISOString().split('T')[0];
        
        if (statsByDate[dateStr]) {
          const emp = empMap[plan.employee_id];
          if (emp) {
            // Ustaw role (mogą być string, array, lub undefined)
            const roles = Array.isArray(emp.roles) 
              ? emp.roles 
              : (emp.roles ? [emp.roles] : ['unknown']);
            
            roles.forEach(role => {
              const roleStr = String(role).trim();
              if (!statsByDate[dateStr][roleStr]) {
                statsByDate[dateStr][roleStr] = 0;
              }
              statsByDate[dateStr][roleStr]++;
            });
          }
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });
    
    // Zbierz wszystkie role ze wszystkich pracowników (nie tylko z planów)
    const allRoles = new Set();
    empData.forEach(emp => {
      const roles = Array.isArray(emp.roles) 
        ? emp.roles 
        : (emp.roles ? [emp.roles] : ['unknown']);
      roles.forEach(role => allRoles.add(String(role).trim()));
    });
    const sortedRoles = Array.from(allRoles).sort();
    
    // Renderuj tabelkę
    const statsContainer = document.createElement('div');
    statsContainer.className = 'vacation-stats';
    statsContainer.style.marginBottom = '24px';
    statsContainer.style.background = 'rgba(255, 255, 255, 0.95)';
    statsContainer.style.padding = '24px';
    statsContainer.style.borderRadius = '12px';
    statsContainer.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)';
    
    const title = document.createElement('h3');
    title.style.marginTop = '0';
    title.style.marginBottom = '12px';
    title.style.color = '#0f1724';
    title.style.fontSize = '14px';
    title.textContent = '📊 Planowane urlopy na 2 dni wstecz i 7 dni naprzód:';
    statsContainer.appendChild(title);
    
    const table = document.createElement('table');
    table.className = 'vacation-stats-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '12px';
    
    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.background = 'rgba(255, 152, 0, 0.5)';
    headerRow.style.borderBottom = '3px solid rgba(255, 152, 0, 0.8)';
    
    const roleHeader = document.createElement('th');
    roleHeader.textContent = 'Rola';
    roleHeader.style.padding = '8px';
    roleHeader.style.textAlign = 'left';
    roleHeader.style.fontWeight = '700';
    roleHeader.style.color = '#0f1724';
    headerRow.appendChild(roleHeader);
    
    // Nagłówki dat
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const [year, month, day] = dateStr.split('-');
      const dayName = ['Nd', 'Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob'][new Date(dateStr).getDay()];
      
      const th = document.createElement('th');
      th.style.padding = '8px';
      th.style.textAlign = 'center';
      th.style.fontWeight = '700';
      th.style.color = '#fff';
      th.style.borderLeft = '2px solid rgba(255, 152, 0, 0.8)';
      th.style.cursor = 'pointer';
      th.style.transition = 'all 0.2s ease';
      
      th.innerHTML = `${day}.${month}<br>${dayName}`;
      
      th.addEventListener('mouseover', () => {
        th.style.background = 'rgba(255, 152, 0, 0.7)';
        th.style.transform = 'scale(1.05)';
        th.style.fontWeight = '800';
      });
      
      th.addEventListener('mouseout', () => {
        th.style.background = 'rgba(255, 152, 0, 0.5)';
        th.style.transform = 'scale(1)';
        th.style.fontWeight = '700';
      });
      
      headerRow.appendChild(th);
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    sortedRoles.forEach((role, idx) => {
      const tr = document.createElement('tr');
      if (idx % 2 === 0) {
        tr.style.background = 'rgba(255, 152, 0, 0.12)';
      }
      tr.style.borderBottom = '1px solid rgba(255, 152, 0, 0.4)';
      
      const roleCell = document.createElement('td');
      roleCell.textContent = getDisplayRoleName(role) || '(brak roli)';
      roleCell.style.padding = '8px';
      roleCell.style.fontWeight = '600';
      roleCell.style.color = '#0f1724';
      roleCell.style.whiteSpace = 'nowrap';
      tr.appendChild(roleCell);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        const count = statsByDate[dateStr][role] || 0;
        
        const cell = document.createElement('td');
        cell.style.padding = '8px';
        cell.style.textAlign = 'center';
        cell.style.borderLeft = '1px solid rgba(255, 152, 0, 0.5)';
        cell.style.fontWeight = '600';
        
        if (count > 0) {
          cell.style.color = '#E65100';
          cell.textContent = count;
        } else {
          cell.style.color = '#999';
          cell.textContent = '—';
        }
        
        tr.appendChild(cell);
      }
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    statsContainer.appendChild(table);
    container.appendChild(statsContainer);
    
  } catch (e) {
    console.error('renderVacationPlanStatistics error', e);
  }
}

/* ============ CHECK IF EMPLOYEE ON VACATION ============ */
async function checkIfOnVacation(employeeId, dateStr) {
  if (!sb || !employeeId || !dateStr) return false;
  
  try {
    const { data, error } = await sb
      .from('vacation')
      .select('id')
      .eq('employee_id', employeeId)
      .lte('start_date', dateStr)
      .gte('end_date', dateStr)
      .maybeSingle();
    
    if (error) {
      console.warn('checkIfOnVacation error', error);
      return false;
    }
    
    return !!data;
  } catch (e) {
    console.error('checkIfOnVacation catch', e);
    return false;
  }
}

/* ============ LOAD EMPLOYEES FOR PLAN ============ */
async function loadEmployeesForPlan() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('id, surname, firstname').order('surname', { ascending: true });
    if (error) throw error;
    employees = data || [];
    
    const select = document.getElementById('planEmployeeSelect');
    select.innerHTML = '<option value="">— Wybierz pracownika —</option>';
    employees.forEach(emp => {
      const option = document.createElement('option');
      option.value = emp.id;
      option.textContent = `${emp.surname} ${emp.firstname}`;
      select.appendChild(option);
    });
  } catch (e) {
    console.error('Load employees error', e);
  }
}

/* ============ LOAD EMPLOYEES FOR CALENDAR ============ */
async function loadEmployeesForCalendar() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('id, surname, firstname').order('surname', { ascending: true });
    if (error) throw error;
    employees = data || [];
    
    const searchInput = document.getElementById('calendarEmployeeSearch');
    if (searchInput) {
      searchInput.addEventListener('input', filterEmployeeDropdown);
      searchInput.addEventListener('focus', showAllEmployees);
    }
  } catch (e) {
    console.error('Load employees error', e);
  }
}

/* ============ EMPLOYEE SEARCH ============ */
function setupEmployeeSearch() {
  const searchInput = document.getElementById('vacationEmployeeSearch');
  const dropdown = document.getElementById('vacationEmployeeDropdown');
  const dropdownList = dropdown ? dropdown.querySelector('.dropdown-list') : null;
  const hiddenSelect = document.getElementById('vacationEmployeeSelect');
  
  if (!searchInput) return;
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query || !dropdown) {
      dropdown.style.display = 'none';
      return;
    }
    
    const filtered = employees.filter(emp => {
      const fullname = `${emp.surname} ${emp.firstname}`.toLowerCase();
      return fullname.includes(query);
    });
    
    if (dropdownList) {
      dropdownList.innerHTML = '';
      
      if (filtered.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'dropdown-item no-results';
        noResults.textContent = 'Brak wyników';
        dropdownList.appendChild(noResults);
      } else {
        filtered.forEach(emp => {
          const item = document.createElement('div');
          item.className = 'dropdown-item';
          item.textContent = `${emp.surname} ${emp.firstname}`;
          item.dataset.id = emp.id;
          
          item.addEventListener('click', () => {
            searchInput.value = `${emp.surname} ${emp.firstname}`;
            if (hiddenSelect) hiddenSelect.value = emp.id;
            dropdown.style.display = 'none';
          });
          
          dropdownList.appendChild(item);
        });
      }
      
      dropdown.style.display = 'block';
    }
  });
  
  searchInput.addEventListener('focus', () => {
    if (!searchInput.value.trim()) {
      searchInput.value = '';
      if (hiddenSelect) hiddenSelect.value = '';
      
      if (dropdownList) {
        dropdownList.innerHTML = '';
        employees.forEach(emp => {
          const item = document.createElement('div');
          item.className = 'dropdown-item';
          item.textContent = `${emp.surname} ${emp.firstname}`;
          item.dataset.id = emp.id;
          
          item.addEventListener('click', () => {
            searchInput.value = `${emp.surname} ${emp.firstname}`;
            if (hiddenSelect) hiddenSelect.value = emp.id;
            dropdown.style.display = 'none';
          });
          
          dropdownList.appendChild(item);
        });
      }
      
      if (dropdown) dropdown.style.display = 'block';
    }
  });
  
  searchInput.addEventListener('blur', () => {
    setTimeout(() => {
      if (dropdown) dropdown.style.display = 'none';
    }, 150);
  });
  
  document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.employee-search-wrapper');
    if (!wrapper || !wrapper.contains(e.target)) {
      if (dropdown) dropdown.style.display = 'none';
    }
  });
}
/* ============ LOAD EXISTING PLANS ============ */
async function loadExistingPlans() {
  if (!sb || !currentEmployeeId) return;
  try {
    const { data, error } = await sb
      .from('vacation_plans')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .order('start_date', { ascending: true });
    
    if (error) {
      console.warn('Load vacation_plans error:', error);
      vacationPlans = [];
    } else {
      vacationPlans = data || [];
    }
    renderYearViewPlan();
    updatePlanStats();
  } catch (e) {
    console.error('Load existing plans error', e);
    vacationPlans = [];
    renderYearViewPlan();
  }
}

/* ============ UPDATE PLAN STATS ============ */
function updatePlanStats() {
  let plannedDays = 0;
  vacationPlans.forEach(plan => {
    const start = new Date(plan.start_date);
    const end = new Date(plan.end_date);
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    plannedDays += days;
  });
  
  const limitDisplay = document.getElementById('limitDisplay');
  const plannedDisplay = document.getElementById('plannedDisplay');
  const remainingDisplay = document.getElementById('remainingDisplay');

  if (limitDisplay) limitDisplay.textContent = vacationLimitValue;
  if (plannedDisplay) plannedDisplay.textContent = plannedDays;
  if (remainingDisplay) remainingDisplay.textContent = Math.max(0, vacationLimitValue - plannedDays);
}

/* ============ RENDER YEAR VIEW FOR PLAN ============ */
function renderYearViewPlan() {
  const container = document.getElementById('planCalendarContainer');
  if (!container) return;
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthCalendarYear(month, monthNames[month]);
    container.appendChild(monthCard);
  }
}

/* ============ CREATE MONTH CALENDAR FOR YEAR VIEW ============ */
function createMonthCalendarYear(month, monthName) {
  const card = document.createElement('div');
  card.style.background = 'white';
  card.style.border = '1px solid #ddd';
  card.style.borderRadius = '8px';
  card.style.padding = '12px';
  card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

  const title = document.createElement('h3');
  title.style.margin = '0 0 12px 0';
  title.style.fontSize = '14px';
  title.style.color = '#0f1724';
  title.style.textAlign = 'center';
  title.textContent = `${monthName} ${currentYear}`;
  card.appendChild(title);

  const headerGrid = document.createElement('div');
  headerGrid.style.display = 'grid';
  headerGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  headerGrid.style.gap = '2px';
  headerGrid.style.marginBottom = '4px';
  
  const dayNames = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
  dayNames.forEach(dayName => {
    const dayHeader = document.createElement('div');
    dayHeader.style.textAlign = 'center';
    dayHeader.style.fontSize = '10px';
    dayHeader.style.fontWeight = '700';
    dayHeader.style.color = '#666';
    dayHeader.style.padding = '4px 0';
    dayHeader.textContent = dayName;
    headerGrid.appendChild(dayHeader);
  });
  card.appendChild(headerGrid);

  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const firstDay = new Date(currentYear, month, 1).getDay();
  const firstDayMondayBased = firstDay === 0 ? 6 : firstDay - 1;

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '2px';

  for (let i = 0; i < firstDayMondayBased; i++) {
    const emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const hasVacation = vacationPlans.some(vac => {
      const vacStart = new Date(vac.start_date);
      const vacEnd = new Date(vac.end_date);
      const currentDate = new Date(dateStr);
      return currentDate >= vacStart && currentDate <= vacEnd;
    });

    const dayBtn = document.createElement('button');
    dayBtn.style.padding = '6px 2px';
    dayBtn.style.fontSize = '10px';
    dayBtn.style.fontWeight = '600';
    dayBtn.style.border = '1px solid #ddd';
    dayBtn.style.borderRadius = '3px';
    dayBtn.style.cursor = 'pointer';
    dayBtn.style.transition = 'all 0.2s';
    dayBtn.textContent = day;

    if (hasVacation) {
      dayBtn.style.background = '#FFE082';
      dayBtn.style.borderColor = '#FBC02D';
      dayBtn.style.color = '#333';
    } else {
      dayBtn.style.background = 'white';
      dayBtn.style.color = '#333';
    }

    dayBtn.onclick = () => {
      const dayVacations = vacationPlans.filter(vac => {
        const vacStart = new Date(vac.start_date);
        const vacEnd = new Date(vac.end_date);
        const currentDate = new Date(dateStr);
        return currentDate >= vacStart && currentDate <= vacEnd;
      });

      if (dayVacations.length > 0) {
        showEditVacationModal(dayVacations[0]);
      }
    };

    grid.appendChild(dayBtn);
  }

  card.appendChild(grid);
  return card;
}

/* vacation4.js — CZĘŚĆ 4: Plan Urlopów - Edit, Update, Delete, Modal, Initialize */

/* ============ SHOW EDIT VACATION MODAL ============ */
function showEditVacationModal(vacation) {
  const password = prompt('Wpisz hasło admina:');
  if (password !== 'admin123') {
    showVacationNotification('Błędne hasło', 'Błąd', '❌');
    return;
  }

  const modal = document.createElement('div');
  modal.id = 'editVacationModal';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.background = 'rgba(0,0,0,0.5)';
  modal.style.zIndex = 2001;

  const box = document.createElement('div');
  box.style.background = 'white';
  box.style.padding = '20px';
  box.style.borderRadius = '10px';
  box.style.maxWidth = '400px';
  box.style.width = '90%';
  box.style.boxShadow = '0 10px 40px rgba(0,0,0,0.2)';

  const title = document.createElement('h2');
  title.textContent = 'Edycja planu urlopów';
  title.style.marginTop = '0';
  box.appendChild(title);

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = '1fr 1fr';
  grid.style.gap = '12px';
  grid.style.marginBottom = '16px';

  const labStart = document.createElement('label');
  labStart.textContent = 'Od:';
  labStart.style.fontWeight = '600';
  labStart.style.display = 'block';
  labStart.style.marginBottom = '4px';
  const inpStart = document.createElement('input');
  inpStart.type = 'date';
  inpStart.value = vacation.start_date;
  const wrapStart = document.createElement('div');
  wrapStart.appendChild(labStart);
  wrapStart.appendChild(inpStart);
  grid.appendChild(wrapStart);

  const labEnd = document.createElement('label');
  labEnd.textContent = 'Do:';
  labEnd.style.fontWeight = '600';
  labEnd.style.display = 'block';
  labEnd.style.marginBottom = '4px';
  const inpEnd = document.createElement('input');
  inpEnd.type = 'date';
  inpEnd.value = vacation.end_date;
  const wrapEnd = document.createElement('div');
  wrapEnd.appendChild(labEnd);
  wrapEnd.appendChild(inpEnd);
  grid.appendChild(wrapEnd);

  box.appendChild(grid);

  const labReason = document.createElement('label');
  labReason.textContent = 'Powód:';
  labReason.style.fontWeight = '600';
  labReason.style.display = 'block';
  labReason.style.marginBottom = '4px';
  const inpReason = document.createElement('input');
  inpReason.type = 'text';
  inpReason.value = vacation.reason || '';
  inpReason.placeholder = 'np. Urlop wypoczynkowy';
  inpReason.style.width = '100%';
  inpReason.style.padding = '8px';
  inpReason.style.border = '1px solid #ddd';
  inpReason.style.borderRadius = '4px';
  inpReason.style.marginBottom = '12px';
  box.appendChild(labReason);
  box.appendChild(inpReason);

  const sep = document.createElement('div');
  sep.style.height = '1px';
  sep.style.background = '#ddd';
  sep.style.margin = '12px 0';
  box.appendChild(sep);

  const labLimit = document.createElement('label');
  labLimit.textContent = 'Limit dni urlopu:';
  labLimit.style.fontWeight = '600';
  labLimit.style.display = 'block';
  labLimit.style.marginBottom = '4px';
  const inpLimit = document.createElement('input');
  inpLimit.type = 'number';
  inpLimit.value = vacationLimitValue;
  inpLimit.min = '0';
  inpLimit.max = '365';
  inpLimit.style.width = '100%';
  inpLimit.style.padding = '8px';
  inpLimit.style.border = '1px solid #ddd';
  inpLimit.style.borderRadius = '4px';
  inpLimit.style.marginBottom = '12px';
  box.appendChild(labLimit);
  box.appendChild(inpLimit);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.marginTop = '16px';

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑️ Usuń';
  deleteBtn.style.padding = '8px 16px';
  deleteBtn.style.background = '#f44336';
  deleteBtn.style.color = 'white';
  deleteBtn.style.border = 'none';
  deleteBtn.style.borderRadius = '4px';
  deleteBtn.style.cursor = 'pointer';
  deleteBtn.onclick = async () => {
    if (confirm('Na pewno usunąć urlop?')) {
      await deleteVacationFromDB(vacation.id);
      modal.remove();
      if (currentEmployeeId) await loadExistingPlans();
    }
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Anuluj';
  cancelBtn.style.padding = '8px 16px';
  cancelBtn.style.background = '#999';
  cancelBtn.style.color = 'white';
  cancelBtn.style.border = 'none';
  cancelBtn.style.borderRadius = '4px';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.onclick = () => modal.remove();

  const saveBtn = document.createElement('button');
  saveBtn.textContent = '💾 Zapisz';
  saveBtn.style.padding = '8px 16px';
  saveBtn.style.background = '#4CAF50';
  saveBtn.style.color = 'white';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '4px';
  saveBtn.style.cursor = 'pointer';
  saveBtn.onclick = async () => {
    const startDate = inpStart.value;
    const endDate = inpEnd.value;
    const reason = inpReason.value || 'Urlop';
    const newLimit = parseInt(inpLimit.value);

    if (!startDate || !endDate) {
      showVacationNotification('Uzupełnij daty', 'Błąd', '⚠️');
      return;
    }

    if (startDate > endDate) {
      showVacationNotification('Data "od" nie może być później niż "do"', 'Błąd', '⚠️');
      return;
    }

    if (isNaN(newLimit) || newLimit < 0) {
      showVacationNotification('Limit musi być liczbą dodatnią', 'Błąd', '⚠️');
      return;
    }

    await updateVacationInDB(vacation.id, startDate, endDate, reason);
    
    if (newLimit !== vacationLimitValue) {
      try {
        await sb
          .from('employees')
          .update({ vacation_limit: newLimit })
          .eq('id', currentEmployeeId);
        vacationLimitValue = newLimit;
      } catch (e) {
        console.error('Update limit error:', e);
      }
    }

    modal.remove();
    if (currentEmployeeId) await loadExistingPlans();
  };

  actions.appendChild(deleteBtn);
  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  box.appendChild(actions);

  modal.appendChild(box);
  document.body.appendChild(modal);

  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };
}

/* ============ UPDATE VACATION IN DB ============ */
async function updateVacationInDB(vacationId, startDate, endDate, reason) {
  if (!sb) return;

  try {
    const { error } = await sb
      .from('vacation_plans')
      .update({ start_date: startDate, end_date: endDate, reason: reason })
      .eq('id', vacationId);

    if (error) throw error;

    showVacationNotification('Urlop zaktualizowany', 'Sukces', '✅');
  } catch (e) {
    console.error('Update vacation error', e);
    showVacationNotification(`Błąd przy aktualizacji: ${e.message}`, 'Błąd', '❌');
  }
}

/* ============ DELETE VACATION FROM DB ============ */
async function deleteVacationFromDB(vacationId) {
  if (!sb) return;

  try {
    const { error } = await sb
      .from('vacation_plans')
      .delete()
      .eq('id', vacationId);

    if (error) throw error;

    showVacationNotification('Urlop usunięty', 'Sukces', '✅');
  } catch (e) {
    console.error('Delete vacation error', e);
    showVacationNotification(`Błąd przy usuwaniu: ${e.message}`, 'Błąd', '❌');
  }
}

/* ============ INIT VACATION PLAN ============ */
async function initVacationPlan() {
  await initSupabaseVacation();
  await loadEmployeesForPlan();

  const currentYearNow = new Date().getFullYear();
  const yearSelect = document.getElementById('planYearSelect');
  for (let year = currentYearNow; year <= currentYearNow + 1; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYearNow) option.selected = true;
    yearSelect.appendChild(option);
  }

  document.getElementById('planEmployeeSelect').addEventListener('change', async (e) => {
    currentEmployeeId = e.target.value;
    if (currentEmployeeId) {
      try {
        const { data, error } = await sb
          .from('employees')
          .select('vacation_limit')
          .eq('id', currentEmployeeId)
          .single();
        
        if (data && data.vacation_limit) {
          vacationLimitValue = data.vacation_limit;
        } else {
          vacationLimitValue = 26;
        }
      } catch (err) {
        console.warn('Load vacation limit error:', err);
        vacationLimitValue = 26;
      }
      
      await loadExistingPlans();
    } else {
      document.getElementById('planCalendarContainer').innerHTML = '';
    }
  });

  document.getElementById('planYearSelect').addEventListener('change', async (e) => {
    currentYear = parseInt(e.target.value);
    if (currentEmployeeId) {
      await loadExistingPlans();
    }
  });

  const editPlanBtn = document.getElementById('editPlanBtn');
  if (editPlanBtn) {
    editPlanBtn.addEventListener('click', async () => {
      if (!currentEmployeeId) {
        showVacationNotification('Najpierw wybierz pracownika', 'Info', 'ℹ️');
        return;
      }

      if (!isEditMode) {
        const password = prompt('Wpisz hasło admina:');
        if (password !== 'admin123') {
          showVacationNotification('Błędne hasło', 'Błąd', '❌');
          return;
        }

        isEditMode = true;
        editPlanBtn.textContent = '💾 Zapisz';
        editPlanBtn.style.background = '#4CAF50';
        
        const cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.className = 'btn';
        cancelBtn.textContent = '✕ Anuluj';
        cancelBtn.style.padding = '6px 12px';
        cancelBtn.style.fontSize = '11px';
        cancelBtn.style.background = '#999';
        cancelBtn.style.color = 'white';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.cursor = 'pointer';
        cancelBtn.style.whiteSpace = 'nowrap';
        cancelBtn.onclick = () => exitEditMode();
        
        editPlanBtn.parentElement.insertBefore(cancelBtn, editPlanBtn.nextSibling);
        
        showLimitInput();
        renderEditModeCalendar();
        
        showVacationNotification('Tryb edycji aktywny. Kliknij dwa dni w kalendarzu aby zaznaczyć urlop.', 'Info', 'ℹ️');
      } else {
        await savePlanEdits();
      }
    });
  }

  console.log('Vacation Plan module initialized');
}

/* vacation5.js — CZĘŚĆ 5: Plan Urlopów - Edit Mode Functions */

function exitEditMode() {
  isEditMode = false;
  selectedRangeStart = null;
  selectedRangeEnd = null;
  
  const editPlanBtn = document.getElementById('editPlanBtn');
  editPlanBtn.textContent = '✏️ Edycja';
  editPlanBtn.style.background = '#667eea';
  
  const cancelBtn = document.getElementById('cancelEditBtn');
  if (cancelBtn) cancelBtn.remove();
  
  hideLimitInput();
  renderYearViewPlan();
}

function showLimitInput() {
  let limitContainer = document.getElementById('limitEditContainer');
  if (limitContainer) return;
  
  limitContainer = document.createElement('div');
  limitContainer.id = 'limitEditContainer';
  limitContainer.style.display = 'flex';
  limitContainer.style.gap = '8px';
  limitContainer.style.alignItems = 'center';
  limitContainer.style.padding = '12px';
  limitContainer.style.background = 'rgba(102, 126, 234, 0.1)';
  limitContainer.style.borderRadius = '8px';
  limitContainer.style.marginBottom = '12px';
  
  const label = document.createElement('label');
  label.textContent = 'Limit dni:';
  label.style.fontWeight = '600';
  
  const input = document.createElement('input');
  input.type = 'number';
  input.id = 'editLimitInput';
  input.value = vacationLimitValue;
  input.min = '0';
  input.max = '365';
  input.style.padding = '6px 8px';
  input.style.border = '1px solid #ddd';
  input.style.borderRadius = '4px';
  input.style.width = '70px';
  
  input.addEventListener('change', async () => {
    const newLimit = parseInt(input.value);
    if (!isNaN(newLimit) && newLimit >= 0) {
      try {
        await sb
          .from('employees')
          .update({ vacation_limit: newLimit })
          .eq('id', currentEmployeeId);
        vacationLimitValue = newLimit;
        updatePlanStats();
        showVacationNotification('Limit zaktualizowany', 'Sukces', '✅');
      } catch (e) {
        console.error('Update limit error:', e);
        showVacationNotification('Błąd przy aktualizacji limitu', 'Błąd', '❌');
        input.value = vacationLimitValue;
      }
    }
  });
  
  limitContainer.appendChild(label);
  limitContainer.appendChild(input);
  
  const vacationForm = document.querySelector('.vacation-form');
  if (vacationForm) {
    vacationForm.insertBefore(limitContainer, vacationForm.lastElementChild);
  }
}

function hideLimitInput() {
  const limitContainer = document.getElementById('limitEditContainer');
  if (limitContainer) limitContainer.remove();
}

function renderEditModeCalendar() {
  const container = document.getElementById('planCalendarContainer');
  if (!container) return;
  container.innerHTML = '';

  if (!isEditMode) {
    renderYearViewPlan();
    return;
  }

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createEditModeMonthCalendar(month, monthNames[month]);
    container.appendChild(monthCard);
  }
}

function calculatePlannedDays() {
  return vacationPlans.reduce((sum, vac) => {
    const start = new Date(vac.start_date);
    const end = new Date(vac.end_date);
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
    return sum + days;
  }, 0);
}

function createEditModeMonthCalendar(month, monthName) {
  const card = document.createElement('div');
  card.style.background = 'white';
  card.style.border = '1px solid #ddd';
  card.style.borderRadius = '8px';
  card.style.padding = '12px';
  card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

  const title = document.createElement('h3');
  title.style.margin = '0 0 12px 0';
  title.style.fontSize = '14px';
  title.style.color = '#0f1724';
  title.style.textAlign = 'center';
  title.textContent = `${monthName} ${currentYear}`;
  card.appendChild(title);

  const headerGrid = document.createElement('div');
  headerGrid.style.display = 'grid';
  headerGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  headerGrid.style.gap = '2px';
  headerGrid.style.marginBottom = '4px';
  
  const dayNames = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nd'];
  dayNames.forEach(dayName => {
    const dayHeader = document.createElement('div');
    dayHeader.style.textAlign = 'center';
    dayHeader.style.fontSize = '10px';
    dayHeader.style.fontWeight = '700';
    dayHeader.style.color = '#666';
    dayHeader.style.padding = '4px 0';
    dayHeader.textContent = dayName;
    headerGrid.appendChild(dayHeader);
  });
  card.appendChild(headerGrid);

  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const firstDay = new Date(currentYear, month, 1).getDay();
  const firstDayMondayBased = firstDay === 0 ? 6 : firstDay - 1;

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '2px';

  for (let i = 0; i < firstDayMondayBased; i++) {
    const emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    const hasVacation = vacationPlans.some(vac => {
      const vacStart = new Date(vac.start_date);
      const vacEnd = new Date(vac.end_date);
      const currentDate = new Date(dateStr);
      return currentDate >= vacStart && currentDate <= vacEnd;
    });

    const isInRange = selectedRangeStart && selectedRangeEnd && 
      dateStr >= (selectedRangeStart < selectedRangeEnd ? selectedRangeStart : selectedRangeEnd) &&
      dateStr <= (selectedRangeStart > selectedRangeEnd ? selectedRangeStart : selectedRangeEnd);

    const dayBtn = document.createElement('button');
    dayBtn.style.padding = '6px 2px';
    dayBtn.style.fontSize = '10px';
    dayBtn.style.fontWeight = '600';
    dayBtn.style.border = '1px solid #ddd';
    dayBtn.style.borderRadius = '3px';
    dayBtn.style.cursor = 'grab';
    dayBtn.style.transition = 'all 0.2s';
    dayBtn.style.userSelect = 'none';
    dayBtn.textContent = day;

    if (hasVacation) {
      dayBtn.style.background = '#FFE082';
      dayBtn.style.borderColor = '#FBC02D';
      dayBtn.style.color = '#333';
      dayBtn.style.cursor = 'pointer';
      dayBtn.addEventListener('mouseup', (e) => {
        if (!isMouseDown) {
          e.preventDefault();
          e.stopPropagation();
          
          const vacationIndex = vacationPlans.findIndex(vac => {
            const vacStart = new Date(vac.start_date);
            const vacEnd = new Date(vac.end_date);
            const currentDate = new Date(dateStr);
            return currentDate >= vacStart && currentDate <= vacEnd;
          });

          if (vacationIndex >= 0) {
            const vacation = vacationPlans[vacationIndex];
            const vacStart = vacation.start_date;
            const vacEnd = vacation.end_date;
            const clickedDate = dateStr;

            if (clickedDate === vacStart) {
              const nextDate = new Date(clickedDate);
              nextDate.setDate(nextDate.getDate() + 1);
              vacation.start_date = nextDate.toISOString().split('T')[0];
              
              if (vacation.start_date > vacation.end_date) {
                vacationPlans.splice(vacationIndex, 1);
              }
            }
            else if (clickedDate === vacEnd) {
              const prevDate = new Date(clickedDate);
              prevDate.setDate(prevDate.getDate() - 1);
              vacation.end_date = prevDate.toISOString().split('T')[0];
              
              if (vacation.start_date > vacation.end_date) {
                vacationPlans.splice(vacationIndex, 1);
              }
            }
            else {
              const beforeEnd = new Date(clickedDate);
              beforeEnd.setDate(beforeEnd.getDate() - 1);
              
              const afterStart = new Date(clickedDate);
              afterStart.setDate(afterStart.getDate() + 1);
              
              vacation.end_date = beforeEnd.toISOString().split('T')[0];
              
              vacationPlans.push({
                id: 'temp_' + Date.now(),
                employee_id: currentEmployeeId,
                start_date: afterStart.toISOString().split('T')[0],
                end_date: vacEnd,
                reason: vacation.reason,
                year: currentYear
              });
            }
            
            renderEditModeCalendar();
            updatePlanStats();
          }
        }
      });
    } else if (isInRange) {
      dayBtn.style.background = '#E3F2FD';
      dayBtn.style.borderColor = '#2196F3';
      dayBtn.style.color = '#333';
      
      dayBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isMouseDown = true;
        selectedRangeStart = dateStr;
        selectedRangeEnd = null;
        dayBtn.style.cursor = 'grabbing';
        renderEditModeCalendar();
      });

      dayBtn.addEventListener('mouseover', () => {
        if (isMouseDown && selectedRangeStart) {
          selectedRangeEnd = dateStr;
          renderEditModeCalendar();
        }
      });
    } else {
      dayBtn.style.background = 'white';
      dayBtn.style.color = '#333';
      
      dayBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isMouseDown = true;
        selectedRangeStart = dateStr;
        selectedRangeEnd = null;
        dayBtn.style.cursor = 'grabbing';
        renderEditModeCalendar();
      });

      dayBtn.addEventListener('mouseover', () => {
        if (isMouseDown && selectedRangeStart) {
          selectedRangeEnd = dateStr;
          renderEditModeCalendar();
        }
      });
    }

    grid.appendChild(dayBtn);
  }

  card.appendChild(grid);
  return card;
}

document.addEventListener('mouseup', () => {
  if (isMouseDown && selectedRangeStart && selectedRangeEnd) {
    const startDate = selectedRangeStart < selectedRangeEnd ? selectedRangeStart : selectedRangeEnd;
    const endDate = selectedRangeStart > selectedRangeEnd ? selectedRangeStart : selectedRangeEnd;
    
    const newDays = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    const currentPlanned = calculatePlannedDays();
    const available = vacationLimitValue - currentPlanned;

    if (newDays > available) {
      showVacationNotification(`Za mało dni! Dostępnych: ${available}, a chcesz zaplanować: ${newDays}`, 'Błąd', '⚠️');
    } else {
      vacationPlans.push({
        id: 'temp_' + Date.now(),
        employee_id: currentEmployeeId,
        start_date: startDate,
        end_date: endDate,
        reason: 'Urlop',
        year: currentYear
      });
      updatePlanStats();
    }
  }
  
  isMouseDown = false;
  selectedRangeStart = null;
  selectedRangeEnd = null;
  renderEditModeCalendar();
}, { once: false });

async function savePlanEdits() {
  if (!sb || !currentEmployeeId) return;

  try {
    // Najpierw wczytaj wszystkie aktualne urlopy z bazy
    const { data: dbPlans, error: fetchError } = await sb
      .from('vacation_plans')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear);
    
    if (fetchError) throw fetchError;
    
    // Porównaj: co jest w vacationPlans (lokalnie) vs co jest w bazie (dbPlans)
    // Usuń z bazy to co nie ma w localnym vacationPlans
    for (const dbPlan of dbPlans) {
      const existsLocally = vacationPlans.some(v => v.id === dbPlan.id);
      if (!existsLocally) {
        // Ten urlop usunąłeś lokalnie, usuń z bazy
        await sb.from('vacation_plans').delete().eq('id', dbPlan.id);
      }
    }
    
    // Dodaj tylko nowe urlopy (temp_)
    const tempVacations = vacationPlans.filter(v => String(v.id).startsWith('temp_'));
    for (const vac of tempVacations) {
      await sb.from('vacation_plans').insert({
        employee_id: currentEmployeeId,
        year: currentYear,
        start_date: vac.start_date,
        end_date: vac.end_date,
        reason: vac.reason
      });
    }

    showVacationNotification('Urlopy zapisane do bazy!', 'Sukces', '✅');
    exitEditMode();
    await loadExistingPlans();
  } catch (e) {
    console.error('Save plan edits error:', e);
    showVacationNotification(`Błąd przy zapisywaniu: ${e.message}`, 'Błąd', '❌');
  }
}

/* vacation6.js — CZĘŚĆ 6: Calendar - Load Absences, Render Month, Render Year */

/* ============ SHOW ALL EMPLOYEES FOR CALENDAR ============ */
function showAllEmployees(e) {
  const dropdown = document.getElementById('calendarEmployeeDropdown');
  dropdown.innerHTML = '';
  
  employees.forEach(emp => {
    const item = document.createElement('div');
    item.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px;';
    item.textContent = `${emp.surname} ${emp.firstname}`;
    item.onmouseover = () => item.style.background = '#f0f0f0';
    item.onmouseout = () => item.style.background = 'white';
    item.onclick = () => selectEmployee(emp.id, `${emp.surname} ${emp.firstname}`);
    dropdown.appendChild(item);
  });
  
  dropdown.style.display = 'block';
}

function filterEmployeeDropdown(e) {
  const searchValue = e.target.value.toLowerCase();
  const dropdown = document.getElementById('calendarEmployeeDropdown');
  
  if (!searchValue) {
    showAllEmployees(e);
    return;
  }
  
  const filtered = employees.filter(emp => 
    `${emp.surname} ${emp.firstname}`.toLowerCase().includes(searchValue)
  );
  
  dropdown.innerHTML = '';
  
  if (filtered.length === 0) {
    dropdown.innerHTML = '<div style="padding: 8px; color: #999; font-size: 12px;">Brak wyników</div>';
  } else {
    filtered.forEach(emp => {
      const item = document.createElement('div');
      item.style.cssText = 'padding: 8px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px;';
      item.textContent = `${emp.surname} ${emp.firstname}`;
      item.onmouseover = () => item.style.background = '#f0f0f0';
      item.onmouseout = () => item.style.background = 'white';
      item.onclick = () => selectEmployee(emp.id, `${emp.surname} ${emp.firstname}`);
      dropdown.appendChild(item);
    });
  }
  
  dropdown.style.display = 'block';
}

function selectEmployee(id, name) {
  const searchInput = document.getElementById('calendarEmployeeSearch');
  const dropdown = document.getElementById('calendarEmployeeDropdown');
  
  searchInput.value = name;
  dropdown.style.display = 'none';
  
  currentEmployeeId = id;
  currentMonth = new Date().getMonth();
  currentYear = new Date().getFullYear();
  
  loadAbsences();
}

/* ============ LOAD ABSENCES ============ */
async function loadAbsences() {
  if (!sb || !currentEmployeeId) return;
  
  try {
    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    
    let start, end;
    if (viewMode === 'year') {
      start = new Date(currentYear, 0, 1);
      end = new Date(currentYear, 11, 31);
    } else {
      start = startDate;
      end = endDate;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    const { data: vacationData, error: vacationError } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .gte('start_date', startStr)
      .lte('end_date', endStr);
    
    if (vacationError) throw vacationError;
    
    const { data: planData, error: planError } = await sb
      .from('vacation_plans')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .gte('start_date', startStr)
      .lte('end_date', endStr);
    
    if (planError) throw planError;
    
    absencesCache = {};
    
    (vacationData || []).forEach(record => {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        absencesCache[dateStr] = record.reason;
      }
    });

    planedVacations = {};
    (planData || []).forEach(record => {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        planedVacations[dateStr] = true;
      }
    });
    
    if (viewMode === 'month') {
      renderMonthView();
    } else {
      renderYearViewCalendar();
    }
  } catch (e) {
    console.error('Load absences error', e);
  }
}

/* ============ RENDER MONTH VIEW ============ */
function renderMonthView() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
  
  const display = document.getElementById('currentMonthDisplay');
  if (display) {
    display.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();
  
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';
  grid.style.padding = '8px';
  grid.style.background = 'white';
  grid.style.borderRadius = '8px';
  grid.style.border = '1px solid #ddd';

  const dayHeaders = ['Pn', 'Wt', 'Śr', 'Czw', 'Pt', 'Sb', 'Nd'];
  dayHeaders.forEach(h => {
    const header = document.createElement('div');
    header.textContent = h;
    header.style.fontWeight = '600';
    header.style.textAlign = 'center';
    header.style.fontSize = '10px';
    header.style.color = '#999';
    grid.appendChild(header);
  });

  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < adjustedFirstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const type = absencesCache[dateStr];
    const hasPlannedVacation = planedVacations[dateStr];
    
    let isInRange = false;
    if (rangeStartDate && rangeEndDate) {
      const start = rangeStartDate < rangeEndDate ? rangeStartDate : rangeEndDate;
      const end = rangeStartDate < rangeEndDate ? rangeEndDate : rangeStartDate;
      
      if (dateStr >= start && dateStr <= end) {
        isInRange = true;
      }
    } else if (rangeStartDate && dateStr === rangeStartDate) {
      isInRange = true;
    }
    
    const cell = document.createElement('button');
    cell.style.aspectRatio = '1';
    cell.style.border = '1px solid #ddd';
    cell.style.borderRadius = '4px';
    cell.style.cursor = !currentEmployeeId ? 'not-allowed' : 'pointer';
    cell.style.fontSize = '12px';
    cell.style.fontWeight = '600';
    cell.style.transition = 'all 0.2s';
    cell.style.display = 'flex';
    cell.style.alignItems = 'center';
    cell.style.justifyContent = 'center';
    cell.style.flexDirection = 'column';
    cell.style.gap = '1px';
    cell.style.padding = '2px';
    cell.style.position = 'relative';
    
    if (type && hasPlannedVacation) {
      const color = typeColors[type];
      cell.style.background = color.bg;
      cell.style.borderColor = color.border;
      cell.style.color = '#333';
      cell.innerHTML = `<div style="font-size: 16px; line-height: 1; margin: 0 auto 2px auto; display: flex; justify-content: center;">📅</div><div>${day}</div>`;
    } else if (type) {
      const color = typeColors[type];
      cell.style.background = color.bg;
      cell.style.borderColor = color.border;
      cell.style.color = '#333';
      cell.textContent = day;
    } else if (hasPlannedVacation) {
      cell.style.background = '#FFFDE7';
      cell.style.borderColor = '#ddd';
      cell.style.color = '#333';
      cell.innerHTML = `<div style="font-size: 16px; line-height: 1; margin: 0 auto 2px auto; display: flex; justify-content: center;">📅</div><div>${day}</div>`;
    } else if (isInRange) {
      cell.style.background = '#E3F2FD';
      cell.style.borderColor = '#1976D2';
      cell.style.color = '#0D47A1';
      cell.textContent = day;
    } else {
      cell.style.background = currentEmployeeId ? 'white' : '#f5f5f5';
      cell.style.color = currentEmployeeId ? '#333' : '#ccc';
      cell.textContent = day;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cellDate = new Date(dateStr);
    const isPast = cellDate < today;

    if (!type && currentEmployeeId) {
      cell.onclick = () => {
        selectRangeDay(dateStr, day, isPast);
      };
    } else if (type && currentEmployeeId) {
      cell.onclick = () => {
        removeAbsence(dateStr);
      };
      cell.title = 'Klikni aby usunąć';
    } else if (!currentEmployeeId) {
      cell.disabled = true;
      cell.style.opacity = '0.6';
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

/* ============ RENDER YEAR VIEW ============ */
function renderYearViewCalendar() {
  const container = document.getElementById('calendarContainer');
  if (!container) return;
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  const yearGrid = document.createElement('div');
  yearGrid.style.display = 'grid';
  yearGrid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
  yearGrid.style.gap = '12px';

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthMiniCard(month, monthNames[month]);
    yearGrid.appendChild(monthCard);
  }

  container.appendChild(yearGrid);
}

/* vacation7.js — CZĘŚĆ 7: Calendar - Create Month Mini Card, Select Range, Modal */

/* ============ CREATE MINI MONTH CARD ============ */
function createMonthMiniCard(month, monthName) {
  const card = document.createElement('div');
  card.style.background = 'white';
  card.style.border = '1px solid #ddd';
  card.style.borderRadius = '8px';
  card.style.padding = '8px';
  card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';

  const title = document.createElement('div');
  title.style.fontSize = '12px';
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  title.style.textAlign = 'center';
  title.style.cursor = 'pointer';
  title.style.padding = '4px';
  title.style.borderRadius = '4px';
  title.style.transition = 'all 0.2s';
  title.textContent = monthName;
  
  title.onmouseover = () => {
    title.style.background = '#f0f0f0';
    title.style.color = '#667eea';
  };
  title.onmouseout = () => {
    title.style.background = 'transparent';
    title.style.color = '#0f1724';
  };
  
  title.onclick = () => {
    currentMonth = month;
    viewMode = 'month';
    document.getElementById('calendarViewMode').value = 'month';
    updateViewMode();
    loadAbsences();
  };
  
  card.appendChild(title);

  const miniGrid = document.createElement('div');
  miniGrid.style.display = 'grid';
  miniGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  miniGrid.style.gap = '2px';

  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const firstDay = new Date(currentYear, month, 1).getDay();
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;

  for (let i = 0; i < adjustedFirstDay; i++) {
    miniGrid.appendChild(document.createElement('div'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const type = absencesCache[dateStr];
    const hasPlannedVacation = planedVacations[dateStr];
    
    const cell = document.createElement('button');
    cell.style.aspectRatio = '1';
    cell.style.border = 'none';
    cell.style.borderRadius = '3px';
    cell.style.cursor = 'pointer';
    cell.style.fontSize = '9px';
    cell.style.fontWeight = '600';
    cell.style.padding = '0';
    cell.style.transition = 'all 0.2s';
    cell.textContent = day;

    if (type && hasPlannedVacation) {
      const color = typeColors[type];
      cell.style.background = '#FFFDE7';
      cell.style.color = '#333';
      cell.style.position = 'relative';
      cell.innerHTML = `
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 50%; height: 50%; background: ${color.bg}; border: 0.5px solid ${color.border}; border-radius: 1px;"></div>
        <div style="position: relative; z-index: 1; font-size: 8px;">📅</div>
      `;
    } else if (type) {
      const color = typeColors[type];
      cell.style.background = color.bg;
      cell.style.color = '#333';
    } else if (hasPlannedVacation) {
      cell.style.background = '#FFFDE7';
      cell.style.color = '#333';
      cell.innerHTML = `<div style="font-size: 8px;">📅</div>`;
    } else {
      cell.style.background = '#f5f5f5';
      cell.style.color = '#999';
    }

    const clickMonth = month;
    const clickDay = day;
    cell.onclick = (e) => {
      e.stopPropagation();
      
      if (!currentEmployeeId) {
        showCalendarNotification('Wybierz pracownika', 'Najpierw musisz wybrać pracownika', '⚠️');
        return;
      }
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const cellDate = new Date(`${dateStr}T00:00:00Z`);
      const isPast = cellDate < today;
      
      selectedDayForModal = { dateStr: dateStr, day: clickDay, isPast, isRange: false };
      openAbsenceDayModal();
    };

    miniGrid.appendChild(cell);
  }

  card.appendChild(miniGrid);
  return card;
}

/* ============ SELECT RANGE DAY ============ */
function selectRangeDay(dateStr, day, isPast) {
  if (!rangeStartDate) {
    rangeStartDate = dateStr;
    renderMonthView();
  } else if (!rangeEndDate) {
    const start = new Date(rangeStartDate);
    const end = new Date(dateStr);
    
    if (end < start) {
      rangeEndDate = rangeStartDate;
      rangeStartDate = dateStr;
    } else {
      rangeEndDate = dateStr;
    }
    
    renderMonthView();
    
    selectedDayForModal = { dateStr: rangeStartDate, endDate: rangeEndDate, isPast, isRange: true };
    setTimeout(() => {
      openAbsenceDayModal();
    }, 100);
  }
}

/* ============ OPEN ABSENCE DAY MODAL ============ */
function openAbsenceDayModal() {
  if (!selectedDayForModal) return;
  
  if (!currentEmployeeId) {
    showCalendarNotification('Wybierz pracownika', 'Najpierw musisz wybrać pracownika', '⚠️');
    return;
  }
  
  const modal = document.getElementById('absenceDayModal');
  const dateSpan = document.getElementById('modalAbsenceDayDate');
  const passwordContainer = document.getElementById('passwordFieldContainer');
  const warning = document.getElementById('adminPasswordWarning');
  
  const dayName = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'];
  const date = new Date(`${selectedDayForModal.dateStr}T00:00:00Z`);
  
  if (selectedDayForModal.isRange && selectedDayForModal.endDate) {
    const endDate = new Date(`${selectedDayForModal.endDate}T00:00:00Z`);
    dateSpan.textContent = `Od ${selectedDayForModal.dateStr} do ${selectedDayForModal.endDate}`;
  } else {
    dateSpan.textContent = `${dayName[date.getUTCDay()]} ${selectedDayForModal.day || date.getUTCDate()} (${selectedDayForModal.dateStr})`;
  }
  
  if (selectedDayForModal.isPast) {
    const daysBack = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (daysBack > 7) {
      passwordContainer.style.display = 'block';
      warning.style.display = 'block';
    } else {
      passwordContainer.style.display = 'none';
      warning.style.display = 'none';
    }
  } else {
    passwordContainer.style.display = 'none';
    warning.style.display = 'none';
  }
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ============ CLOSE MODAL ============ */
function closeAbsenceDayModal() {
  const modal = document.getElementById('absenceDayModal');
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
  selectedDayForModal = null;
  rangeStartDate = null;
  rangeEndDate = null;
  document.getElementById('adminPasswordInput').value = '';
  renderMonthView();
}

/* ============ SET ABSENCE TYPE ============ */
async function setAbsenceType(type) {
  if (!selectedDayForModal || !sb || !currentEmployeeId) return;

  if (selectedDayForModal.isPast) {
    const date = new Date(`${selectedDayForModal.dateStr}T00:00:00Z`);
    const daysBack = Math.floor((new Date() - date) / (1000 * 60 * 60 * 24));
    if (daysBack > 7) {
      const password = document.getElementById('adminPasswordInput').value;
      if (!password || password !== ADMIN_PASSWORD) {
        await showCalendarNotification('Nieprawidłowe hasło admina', 'Błąd', '❌');
        return;
      }
    }
  }

  try {
    const endDate = selectedDayForModal.endDate || selectedDayForModal.dateStr;
    
    const { error } = await sb
      .from('vacation')
      .insert({
        employee_id: currentEmployeeId,
        start_date: selectedDayForModal.dateStr,
        end_date: endDate,
        reason: type,
        approved: true
      });
    
    if (error) throw error;

    const dateDisplay = selectedDayForModal.endDate 
      ? `${selectedDayForModal.dateStr} do ${endDate}`
      : selectedDayForModal.dateStr;
    await showCalendarNotification(`Nieobecność dodana: ${dateDisplay}`, 'Sukces', '✅');
    closeAbsenceDayModal();
    rangeStartDate = null;
    rangeEndDate = null;
    await loadAbsences();
  } catch (e) {
    console.error('Set absence error', e);
    await showCalendarNotification(`Błąd przy zaznaczaniu nieobecności: ${e.message}`, 'Błąd', '❌');
  }
}

/* vacation8.js — CZĘŚĆ 8: Calendar - Remove Absence, Update View Mode, Init Calendar */

/* ============ REMOVE ABSENCE ============ */
async function removeAbsence(dateStr) {
  if (!sb || !currentEmployeeId) return;

  if (!confirm('Usunąć nieobecność z tego dnia?')) return;

  try {
    const { data, error: fetchError } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);
    
    if (fetchError) throw fetchError;

    if (!data || data.length === 0) {
      await showCalendarNotification('Brak nieobecności do usunięcia', 'Info', 'ℹ️');
      return;
    }

    for (const record of data) {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      const clickedDate = new Date(dateStr);

      if (record.start_date === record.end_date) {
        await sb.from('vacation').delete().eq('id', record.id);
      }
      else if (dateStr === record.start_date) {
        const newStart = new Date(start);
        newStart.setDate(newStart.getDate() + 1);
        await sb.from('vacation').update({
          start_date: newStart.toISOString().split('T')[0]
        }).eq('id', record.id);
      }
      else if (dateStr === record.end_date) {
        const newEnd = new Date(end);
        newEnd.setDate(newEnd.getDate() - 1);
        await sb.from('vacation').update({
          end_date: newEnd.toISOString().split('T')[0]
        }).eq('id', record.id);
      }
      else if (clickedDate > start && clickedDate < end) {
        const firstEnd = new Date(clickedDate);
        firstEnd.setDate(firstEnd.getDate() - 1);
        await sb.from('vacation').update({
          end_date: firstEnd.toISOString().split('T')[0]
        }).eq('id', record.id);

        const secondStart = new Date(clickedDate);
        secondStart.setDate(secondStart.getDate() + 1);
        await sb.from('vacation').insert({
          employee_id: currentEmployeeId,
          start_date: secondStart.toISOString().split('T')[0],
          end_date: record.end_date,
          reason: record.reason,
          approved: record.approved
        });
      }
    }

    await showCalendarNotification('Nieobecność usunięta z tego dnia', 'Sukces', '✅');
    await loadAbsences();
  } catch (e) {
    console.error('Remove absence error', e);
    await showCalendarNotification(`Błąd przy usuwaniu nieobecności: ${e.message}`, 'Błąd', '❌');
  }
}

/* ============ UPDATE VIEW MODE ============ */
function updateViewMode() {
  const monthNav = document.getElementById('monthNavControls');
  const yearSelect = document.getElementById('yearSelectControls');

  if (viewMode === 'month') {
    monthNav.style.display = 'flex';
    yearSelect.style.display = 'none';
  } else {
    monthNav.style.display = 'none';
    yearSelect.style.display = 'flex';
  }

  if (currentEmployeeId) {
    loadAbsences();
  }
}

/* ============ INIT CALENDAR ============ */
async function initCalendar() {
  await initSupabaseVacation();
  await loadEmployeesForCalendar();

  const yearSelect = document.getElementById('calendarYearSelect');
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYear) option.selected = true;
    yearSelect.appendChild(option);
  }

  renderMonthView();

  document.getElementById('calendarViewMode').addEventListener('change', (e) => {
    viewMode = e.target.value;
    updateViewMode();
  });

  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }
    renderMonthView();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
    renderMonthView();
  });

  document.getElementById('calendarYearSelect').addEventListener('change', (e) => {
    currentYear = parseInt(e.target.value);
    if (viewMode === 'month') {
      renderMonthView();
    } else {
      renderYearViewCalendar();
    }
  });

  document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('calendarEmployeeSearch');
    const dropdown = document.getElementById('calendarEmployeeDropdown');
    
    if (searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  console.log('Calendar module initialized');
}

/* ============ INIT MAIN (STATISTICS) ============ */

document.addEventListener('DOMContentLoaded', async () => {
  // Init Supabase
  await initSupabaseVacation();
  
  // Load employees for select
  await loadEmployeesForSelect();
  
  // Back button
  const backBtn = document.getElementById('backToMainBtn');
  if (backBtn) backBtn.addEventListener('click', () => window.location.href = './index.html');
  
  // View list button
  const viewListBtn = document.getElementById('viewListBtn');
  if (viewListBtn) viewListBtn.addEventListener('click', () => window.location.href = './vacation-list.html');

  // View calendar button
  const viewCalendarBtn = document.getElementById('viewCalendarBtn');
  if (viewCalendarBtn) viewCalendarBtn.addEventListener('click', () => window.location.href = './vacation-calendar.html');
  
  // Render statistics tables
  const statContainer = document.getElementById('statisticsContainer');
  const vacationPlanContainer = document.getElementById('vacationPlanStatisticsContainer');
  const today = new Date().toISOString().split('T')[0];
  await renderVacationStatistics(statContainer, today);
  await renderVacationPlanStatistics(vacationPlanContainer, today);

  console.log('Vacation module initialized');
});
