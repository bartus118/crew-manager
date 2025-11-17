/* vacation.js — Moduł zarządzania urlopami */

let sb = null;
let employees = [];
let selectedVacationDate = null; // Przechowuje wybrany dzień z tabeli

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
