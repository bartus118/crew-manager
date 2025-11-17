/* vacation-plan.js — Plan urlopów na rok z edycją (hasło admina) */

let sb = null;
let employees = [];
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let vacationLimitValue = 26; // domyślny limit
let vacationPlans = []; // lista urlopów z bazy
let selectedRangeStart = null;
let selectedRangeEnd = null;
let isEditMode = false; // czy jesteśmy w trybie edycji

/* ============ INIT SUPABASE ============ */
async function initSupabasePlan() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('VacationPlan: Supabase ready');
  } catch (e) {
    console.warn('VacationPlan: Supabase init error', e);
    sb = null;
  }
}

/* ============ NOTIFICATION HELPER ============ */
async function showPlanNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
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
    renderYearView();
    updatePlanStats();
  } catch (e) {
    console.error('Load existing plans error', e);
    vacationPlans = [];
    renderYearView();
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

/* ============ RENDER CALENDAR VIEW ============ */
function renderCalendarView() {
  // deprecated - use renderYearView() instead
  renderYearView();
}

/* ============ RENDER YEAR VIEW ============ */
function renderYearView() {
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

  // Grid tygodniowych nagłówków
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

  // Grid dni
  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const firstDay = new Date(currentYear, month, 1).getDay(); // 0=Nd, 1=Pn, ...
  const firstDayMondayBased = firstDay === 0 ? 6 : firstDay - 1; // Konwertuj na Pn=0, Nd=6

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '2px';

  // Puste komórki przed pierwszym dniem
  for (let i = 0; i < firstDayMondayBased; i++) {
    const emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  // Dni miesiąca
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Sprawdź czy ten dzień ma urlop
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
      // Pokaż listę urlopów tego dnia
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

/* ============ SHOW EDIT VACATION MODAL ============ */
function showEditVacationModal(vacation) {
  // Zażądaj hasła admina
  const password = prompt('Wpisz hasło admina:');
  if (password !== 'admin123') {
    showPlanNotification('Błędne hasło', 'Błąd', '❌');
    return;
  }

  // Pokaż modal edycji z opcją zmiany limitu
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

  // Start date
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

  // End date
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

  // Reason
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

  // Separator
  const sep = document.createElement('div');
  sep.style.height = '1px';
  sep.style.background = '#ddd';
  sep.style.margin = '12px 0';
  box.appendChild(sep);

  // Limit dni
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

  // Actions
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
      showPlanNotification('Uzupełnij daty', 'Błąd', '⚠️');
      return;
    }

    if (startDate > endDate) {
      showPlanNotification('Data "od" nie może być później niż "do"', 'Błąd', '⚠️');
      return;
    }

    if (isNaN(newLimit) || newLimit < 0) {
      showPlanNotification('Limit musi być liczbą dodatnią', 'Błąd', '⚠️');
      return;
    }

    // Zapisz urlop
    await updateVacationInDB(vacation.id, startDate, endDate, reason);
    
    // Aktualizuj limit jeśli się zmienił
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

    showPlanNotification('Urlop zaktualizowany', 'Sukces', '✅');
  } catch (e) {
    console.error('Update vacation error', e);
    showPlanNotification('Błąd przy aktualizacji', 'Błąd', '❌');
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

    showPlanNotification('Urlop usunięty', 'Sukces', '✅');
  } catch (e) {
    console.error('Delete vacation error', e);
    showPlanNotification('Błąd przy usuwaniu', 'Błąd', '❌');
  }
}

/* ============ INIT ============ */
async function initVacationPlan() {
  await initSupabasePlan();
  await loadEmployeesForPlan();

  // Populate year selector
  const currentYearNow = new Date().getFullYear();
  const yearSelect = document.getElementById('planYearSelect');
  for (let year = currentYearNow; year <= currentYearNow + 1; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYearNow) option.selected = true;
    yearSelect.appendChild(option);
  }

  // Event listeners
  document.getElementById('backToVacationBtn').addEventListener('click', () => {
    window.location.href = './vacation.html';
  });

  document.getElementById('backToMainBtn').addEventListener('click', () => {
    window.location.href = './index.html';
  });

  document.getElementById('planEmployeeSelect').addEventListener('change', async (e) => {
    currentEmployeeId = e.target.value;
    if (currentEmployeeId) {
      // Wczytaj limit dla pracownika z bazy
      try {
        const { data, error } = await sb
          .from('employees')
          .select('vacation_limit')
          .eq('id', currentEmployeeId)
          .single();
        
        if (data && data.vacation_limit) {
          vacationLimitValue = data.vacation_limit;
        } else {
          vacationLimitValue = 26; // domyślnie
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

  // Przycisk edycji urlopów
  const editPlanBtn = document.getElementById('editPlanBtn');
  if (editPlanBtn) {
    editPlanBtn.addEventListener('click', async () => {
      if (!currentEmployeeId) {
        showPlanNotification('Najpierw wybierz pracownika', 'Info', 'ℹ️');
        return;
      }

      if (!isEditMode) {
        // Wejdź w tryb edycji
        const password = prompt('Wpisz hasło admina:');
        if (password !== 'admin123') {
          showPlanNotification('Błędne hasło', 'Błąd', '❌');
          return;
        }

        isEditMode = true;
        editPlanBtn.textContent = '💾 Zapisz';
        editPlanBtn.style.background = '#4CAF50';
        
        // Dodaj przycisk anuluj
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
        
        // Pokaż pole limitu
        showLimitInput();
        
        // Zmień tryb kalendarza
        renderEditModeCalendar();
        
        showPlanNotification('Tryb edycji aktywny. Kliknij dwa dni w kalendarzu aby zaznaczyć urlop.', 'Info', 'ℹ️');
      } else {
        // Zapisz zmiany
        await savePlanEdits();
      }
    });
  }

  console.log('Vacation Plan module initialized');
}

document.addEventListener('DOMContentLoaded', initVacationPlan);

/* ============ EDIT MODE FUNCTIONS ============ */

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
  renderYearView();
}

function showLimitInput() {
  let limitContainer = document.getElementById('limitEditContainer');
  if (limitContainer) return; // już pokazany
  
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
  
  // Zmiana limitu w real-time
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
        showPlanNotification('Limit zaktualizowany', 'Sukces', '✅');
      } catch (e) {
        console.error('Update limit error:', e);
        showPlanNotification('Błąd przy aktualizacji limitu', 'Błąd', '❌');
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

  // Jeśli nie jesteśmy w trybie edycji, renderuj zwykły widok
  if (!isEditMode) {
    renderYearView();
    return;
  }

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createEditModeMonthCalendar(month, monthNames[month]);
    container.appendChild(monthCard);
  }
}

let isMouseDown = false;

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

  // Grid tygodniowych nagłówków
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

  // Grid dni
  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const firstDay = new Date(currentYear, month, 1).getDay();
  const firstDayMondayBased = firstDay === 0 ? 6 : firstDay - 1;

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '2px';

  // Puste komórki
  for (let i = 0; i < firstDayMondayBased; i++) {
    const emptyCell = document.createElement('div');
    grid.appendChild(emptyCell);
  }

  // Dni miesiąca
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
      // Kliknięcie na zaplanowany dzień - trim lub split zakresu
      dayBtn.addEventListener('mouseup', (e) => {
        if (!isMouseDown) { // tylko jeśli nie było drag-and-drop
          e.preventDefault();
          e.stopPropagation();
          
          // Znajdź urlop zawierający ten dzień
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

            // Jeśli kliknięty dzień to początek zakresu
            if (clickedDate === vacStart) {
              // Przesunąć początek o dzień dalej
              const nextDate = new Date(clickedDate);
              nextDate.setDate(nextDate.getDate() + 1);
              vacation.start_date = nextDate.toISOString().split('T')[0];
              
              if (vacation.start_date > vacation.end_date) {
                // Jeśli zakres stał się pusty, usuń
                vacationPlans.splice(vacationIndex, 1);
              }
            }
            // Jeśli kliknięty dzień to koniec zakresu
            else if (clickedDate === vacEnd) {
              // Przesunąć koniec o dzień wcześniej
              const prevDate = new Date(clickedDate);
              prevDate.setDate(prevDate.getDate() - 1);
              vacation.end_date = prevDate.toISOString().split('T')[0];
              
              if (vacation.start_date > vacation.end_date) {
                // Jeśli zakres stał się pusty, usuń
                vacationPlans.splice(vacationIndex, 1);
              }
            }
            // Jeśli kliknięty dzień jest w środku - split na dwie części
            else {
              const beforeEnd = new Date(clickedDate);
              beforeEnd.setDate(beforeEnd.getDate() - 1);
              
              const afterStart = new Date(clickedDate);
              afterStart.setDate(afterStart.getDate() + 1);
              
              // Zmień koniec pierwszego okresu
              vacation.end_date = beforeEnd.toISOString().split('T')[0];
              
              // Dodaj drugi okres
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

// Globalny mouseup na dokumentzie
document.addEventListener('mouseup', () => {
  if (isMouseDown && selectedRangeStart && selectedRangeEnd) {
    const startDate = selectedRangeStart < selectedRangeEnd ? selectedRangeStart : selectedRangeEnd;
    const endDate = selectedRangeStart > selectedRangeEnd ? selectedRangeStart : selectedRangeEnd;
    
    // Oblicz ilość dni w nowym zakresie
    const newDays = Math.floor((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    const currentPlanned = calculatePlannedDays();
    const available = vacationLimitValue - currentPlanned;

    if (newDays > available) {
      showPlanNotification(`Za mało dni! Dostępnych: ${available}, a chcesz zaplanować: ${newDays}`, 'Błąd', '⚠️');
    } else {
      // Dodaj do vacationPlans lokalnie
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
    // Dodaj tylko nowe urlopy (limit jest już zapisany automatycznie)
    const tempVacations = vacationPlans.filter(v => v.id.startsWith('temp_'));

    for (const vac of tempVacations) {
      await sb.from('vacation_plans').insert({
        employee_id: currentEmployeeId,
        year: currentYear,
        start_date: vac.start_date,
        end_date: vac.end_date,
        reason: vac.reason
      });
    }

    showPlanNotification('Urlopy zapisane do bazy!', 'Sukces', '✅');
    exitEditMode();
    await loadExistingPlans();
  } catch (e) {
    console.error('Save plan edits error:', e);
    showPlanNotification('Błąd przy zapisywaniu', 'Błąd', '❌');
  }
}
