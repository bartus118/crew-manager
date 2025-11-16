/* vacation-plan.js — Kalendarz planowania urlopów (tylko Urlop wypoczynkowy) */

let sb = null;
let employees = [];
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let vacationLimit = 20;
let selectedPlanDays = {}; // { "YYYY-MM-DD": "Urlop wypoczynkowy" lub "Wolne" }
let selectedDayForPlanModal = null;
let existingPlans = [];

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
      .eq('year', currentYear);
    
    if (error) {
      // Tabela może nie istnieć, to OK
      existingPlans = [];
    } else {
      existingPlans = data || [];
      // Załaduj dni do selectedPlanDays
      selectedPlanDays = {};
      existingPlans.forEach(plan => {
        if (plan.plan_data && plan.plan_data.days) {
          selectedPlanDays = { ...selectedPlanDays, ...plan.plan_data.days };
        }
      });
    }
    renderCalendarView();
    updatePlanStats();
  } catch (e) {
    console.error('Load existing plans error', e);
    selectedPlanDays = {};
    renderCalendarView();
  }
}

/* ============ UPDATE PLAN STATS ============ */
function updatePlanStats() {
  const plannedDays = Object.values(selectedPlanDays).filter(v => v === 'Urlop wypoczynkowy').length;
  const freeDays = Object.values(selectedPlanDays).filter(v => v === 'Wolne').length;
  const totalMarked = plannedDays + freeDays;
  
  const limitDisplay = document.getElementById('limitDisplay');
  const plannedDisplay = document.getElementById('plannedDisplay');
  const remainingDisplay = document.getElementById('remainingDisplay');
  const statusDisplay = document.getElementById('statusDisplay');

  if (limitDisplay) limitDisplay.textContent = vacationLimit;
  if (plannedDisplay) plannedDisplay.textContent = plannedDays;
  if (remainingDisplay) remainingDisplay.textContent = Math.max(0, vacationLimit - plannedDays);
  
  if (statusDisplay) {
    if (plannedDays > vacationLimit) {
      statusDisplay.textContent = `⚠️ Przekroczono limit o ${plannedDays - vacationLimit} dni`;
      statusDisplay.style.color = '#f44336';
    } else if (plannedDays === vacationLimit) {
      statusDisplay.textContent = '✅ Limit wyczerpany';
      statusDisplay.style.color = '#4CAF50';
    } else {
      statusDisplay.textContent = '📝 Plan otwarty';
      statusDisplay.style.color = '#666';
    }
  }
}

/* ============ RENDER CALENDAR VIEW ============ */
function renderCalendarView() {
  const container = document.getElementById('planCalendarContainer');
  if (!container) return;
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthCardForPlan(month, monthNames[month]);
    container.appendChild(monthCard);
  }
}

/* ============ CREATE MONTH CARD FOR PLAN ============ */
function createMonthCardForPlan(month, monthName) {
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
  title.textContent = `${monthName} ${currentYear}`;
  card.appendChild(title);

  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';
  grid.style.marginBottom = '12px';

  for (let day = 1; day <= daysInMonth; day++) {
    const dayBtn = createDayButtonForPlan(month, day);
    grid.appendChild(dayBtn);
  }

  card.appendChild(grid);
  return card;
}

/* ============ CREATE DAY BUTTON FOR PLAN ============ */
function createDayButtonForPlan(month, day) {
  const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const marked = selectedPlanDays[dateStr];

  const btn = document.createElement('button');
  btn.style.padding = '8px 4px';
  btn.style.border = '1px solid #ddd';
  btn.style.borderRadius = '4px';
  btn.style.fontSize = '11px';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '600';
  btn.style.transition = 'all 0.2s';
  btn.textContent = day;

  if (marked === 'Urlop wypoczynkowy') {
    btn.style.background = '#FFE082';
    btn.style.borderColor = '#FBC02D';
    btn.style.color = '#333';
  } else if (marked === 'Wolne') {
    btn.style.background = '#F5F5F5';
    btn.style.borderColor = '#999';
    btn.style.color = '#666';
  } else {
    btn.style.background = 'white';
    btn.style.color = '#333';
  }

  btn.onclick = () => {
    selectedDayForPlanModal = { dateStr, day, month };
    openPlanDayModal();
  };

  return btn;
}

/* ============ OPEN PLAN DAY MODAL ============ */
function openPlanDayModal() {
  if (!selectedDayForPlanModal) return;
  
  const modal = document.getElementById('planDayModal');
  const dateSpan = document.getElementById('modalPlanDayDate');
  
  const dateObj = new Date(selectedDayForPlanModal.dateStr);
  const dayName = ['niedz.', 'pon.', 'wt.', 'śr.', 'czw.', 'pt.', 'sob.'][dateObj.getDay()];
  dateSpan.textContent = `${dayName} ${selectedDayForPlanModal.day} (${selectedDayForPlanModal.dateStr})`;
  
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ============ CLOSE PLAN DAY MODAL ============ */
function closePlanDayModal() {
  const modal = document.getElementById('planDayModal');
  modal.style.display = 'none';
  document.body.style.overflow = 'auto';
  selectedDayForPlanModal = null;
  renderCalendarView();
}

/* ============ ADD PLAN DAY ============ */
function addPlanDay(type) {
  if (!selectedDayForPlanModal) return;

  const dateStr = selectedDayForPlanModal.dateStr;
  
  if (selectedPlanDays[dateStr]) {
    // Jeśli już jest zaznaczony, usuń
    delete selectedPlanDays[dateStr];
  } else {
    // Dodaj
    selectedPlanDays[dateStr] = type;
  }

  updatePlanStats();
  closePlanDayModal();
}

/* ============ CLEAR ALL PLAN ============ */
function clearAllPlan() {
  if (confirm('Na pewno chcesz wyczyścić wszystkie zaznaczenia?')) {
    selectedPlanDays = {};
    updatePlanStats();
    renderCalendarView();
  }
}

/* ============ RENDER CALENDAR VIEW ============ */
function renderCalendarView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(300px, 1fr))';
  grid.style.gap = '16px';
  grid.style.marginBottom = '20px';

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthCard(month, monthNames[month]);
    grid.appendChild(monthCard);
  }

  container.appendChild(grid);
  addNewPlanButton(container);
}

/* ============ CREATE MONTH CARD ============ */
function createMonthCard(month, monthName) {
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
  title.textContent = `${monthName} ${currentYear}`;
  card.appendChild(title);

  const monthStart = new Date(currentYear, month, 1);
  const monthEnd = new Date(currentYear, month + 1, 0);

  const monthVacations = vacationPlans.filter(vac => {
    const vacStart = new Date(vac.start_date);
    const vacEnd = new Date(vac.end_date);
    return vacStart <= monthEnd && vacEnd >= monthStart;
  });

  if (monthVacations.length === 0) {
    const empty = document.createElement('div');
    empty.style.fontSize = '12px';
    empty.style.color = '#999';
    empty.textContent = 'Brak zaplanowanych urlopów';
    card.appendChild(empty);
  } else {
    monthVacations.forEach(vac => {
      const vacItem = document.createElement('div');
      vacItem.style.padding = '8px';
      vacItem.style.marginBottom = '6px';
      vacItem.style.background = vac.approved ? 'rgba(76, 175, 80, 0.1)' : 'rgba(255, 152, 0, 0.1)';
      vacItem.style.border = `2px solid ${vac.approved ? '#4CAF50' : '#ff9800'}`;
      vacItem.style.borderRadius = '4px';
      vacItem.style.cursor = 'pointer';
      vacItem.style.fontSize = '11px';
      vacItem.style.color = '#333';

      const status = vac.approved ? '✅' : '⏳';
      const dates = `${vac.start_date} do ${vac.end_date}`;
      vacItem.innerHTML = `<div><strong>${status} ${vac.reason}</strong></div><div>${dates}</div>`;
      
      if (vac.notes) {
        const notesDiv = document.createElement('div');
        notesDiv.style.marginTop = '4px';
        notesDiv.style.fontSize = '10px';
        notesDiv.style.color = '#666';
        notesDiv.style.fontStyle = 'italic';
        notesDiv.textContent = `📝 ${vac.notes}`;
        vacItem.appendChild(notesDiv);
      }

      vacItem.onclick = () => openVacationModal(vac);
      card.appendChild(vacItem);
    });
  }

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Dodaj urlop';
  addBtn.style.width = '100%';
  addBtn.style.padding = '8px';
  addBtn.style.marginTop = '8px';
  addBtn.style.background = '#667eea';
  addBtn.style.color = 'white';
  addBtn.style.border = 'none';
  addBtn.style.borderRadius = '4px';
  addBtn.style.fontSize = '12px';
  addBtn.style.cursor = 'pointer';
  addBtn.onclick = () => openVacationModal(null, new Date(currentYear, month, 1).toISOString().split('T')[0]);
  card.appendChild(addBtn);

  return card;
}

/* ============ RENDER LIST VIEW ============ */
function renderListView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = '';

  const listDiv = document.createElement('div');
  listDiv.style.background = 'white';
  listDiv.style.border = '1px solid #ddd';
  listDiv.style.borderRadius = '8px';
  listDiv.style.overflow = 'hidden';

  if (vacationPlans.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '24px';
    empty.style.textAlign = 'center';
    empty.style.color = '#999';
    empty.textContent = 'Brak zaplanowanych urlopów';
    listDiv.appendChild(empty);
  } else {
    vacationPlans.forEach((vac, idx) => {
      const item = document.createElement('div');
      item.style.padding = '12px';
      item.style.borderBottom = idx < vacationPlans.length - 1 ? '1px solid #eee' : 'none';
      item.style.display = 'flex';
      item.style.justifyContent = 'space-between';
      item.style.alignItems = 'center';
      item.style.cursor = 'pointer';
      item.style.transition = 'background 0.2s';
      item.onmouseenter = () => item.style.background = '#f9f9f9';
      item.onmouseleave = () => item.style.background = 'white';

      const infoDiv = document.createElement('div');
      infoDiv.style.flex = '1';
      infoDiv.innerHTML = `
        <div style="font-size: 13px; font-weight: 600; color: #0f1724; margin-bottom: 4px;">
          ${vac.approved ? '✅' : '⏳'} ${vac.reason}
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 4px;">
          ${vac.start_date} do ${vac.end_date}
        </div>
        ${vac.notes ? `<div style="font-size: 11px; color: #999; font-style: italic;">📝 ${vac.notes}</div>` : ''}
      `;
      item.appendChild(infoDiv);

      const actionBtn = document.createElement('button');
      actionBtn.textContent = 'Edytuj';
      actionBtn.style.padding = '6px 12px';
      actionBtn.style.background = '#667eea';
      actionBtn.style.color = 'white';
      actionBtn.style.border = 'none';
      actionBtn.style.borderRadius = '4px';
      actionBtn.style.cursor = 'pointer';
      actionBtn.style.fontSize = '11px';
      actionBtn.onclick = (e) => {
        e.stopPropagation();
        openVacationModal(vac);
      };
      item.appendChild(actionBtn);

      item.onclick = () => openVacationModal(vac);
      listDiv.appendChild(item);
    });
  }

  container.appendChild(listDiv);

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Dodaj urlop';
  addBtn.style.marginTop = '16px';
  addBtn.style.padding = '12px 24px';
  addBtn.style.width = '100%';
  addBtn.style.background = '#4CAF50';
  addBtn.style.color = 'white';
  addBtn.style.border = 'none';
  addBtn.style.borderRadius = '4px';
  addBtn.style.fontSize = '13px';
  addBtn.style.cursor = 'pointer';
  addBtn.style.fontWeight = '600';
  addBtn.onclick = () => openVacationModal(null);
  container.appendChild(addBtn);
}

/* ============ ADD NEW PLAN BUTTON ============ */
function addNewPlanButton(container) {
  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Dodaj urlop';
  addBtn.style.padding = '12px 24px';
  addBtn.style.width = '100%';
  addBtn.style.background = '#4CAF50';
  addBtn.style.color = 'white';
  addBtn.style.border = 'none';
  addBtn.style.borderRadius = '4px';
  addBtn.style.fontSize = '13px';
  addBtn.style.cursor = 'pointer';
  addBtn.style.fontWeight = '600';
  addBtn.onclick = () => openVacationModal(null);
  container.appendChild(addBtn);
}

/* ============ OPEN VACATION MODAL ============ */
function openVacationModal(vacation = null, defaultDate = null) {
  // Ta funkcja nie jest używana w nowej wersji
  // Kalendarz planowania urlopów używa openPlanDayModal()
}

/* ============ CLOSE MODAL ============ */
function closeModal() {
  // Ta funkcja nie jest używana w nowej wersji
}

/* ============ SAVE VACATION PLAN ============ */
async function saveVacationPlan(startDate, endDate, reason, notes) {
  // Ta funkcja nie jest używana w nowej wersji
}

/* ============ DELETE VACATION PLAN ============ */
async function deleteVacationPlan() {
  // Ta funkcja nie jest używana w nowej wersji
}

/* ============ SAVE VACATION LIMIT ============ */
async function saveVacationLimit() {
  if (!sb || !currentEmployeeId) return;
  
  const limitValue = parseInt(document.getElementById('vacationLimitInput').value);
  
  if (isNaN(limitValue) || limitValue < 0) {
    await showPlanNotification('Wprowadź prawidłowy limit dni', 'Błąd', '❌');
    return;
  }

  try {
    // Spróbuj aktualizować, jeśli nie ma rekordu - wstaw nowy
    const { data: existing } = await sb
      .from('vacation_limits')
      .select('id')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .single();
    
    if (existing) {
      const { error } = await sb
        .from('vacation_limits')
        .update({ limit_days: limitValue })
        .eq('employee_id', currentEmployeeId)
        .eq('year', currentYear);
      
      if (error) throw error;
    } else {
      const { error } = await sb
        .from('vacation_limits')
        .insert({
          employee_id: currentEmployeeId,
          year: currentYear,
          limit_days: limitValue
        });
      
      if (error) throw error;
    }

    vacationLimit = limitValue;
    updatePlanStats();
    await showPlanNotification('Limit urlopów zapisany', 'Sukces', '✅');
  } catch (e) {
    console.error('Save vacation limit error', e);
    await showPlanNotification('Błąd przy zapisywaniu limitu', 'Błąd', '❌');
  }
}

/* ============ SAVE PLAN TO DATABASE ============ */
async function savePlanToDatabase() {
  if (!sb || !currentEmployeeId) return;

  // Policz dni Urlop wypoczynkowy
  const plannedDays = Object.values(selectedPlanDays).filter(v => v === 'Urlop wypoczynkowy').length;
  
  if (plannedDays > vacationLimit) {
    await showPlanNotification(`Plan przewyższa limit o ${plannedDays - vacationLimit} dni`, 'Ostrzeżenie', '⚠️');
    return;
  }

  try {
    // Sprawdź czy już istnieje plan na ten rok
    const { data: existing } = await sb
      .from('vacation_plans')
      .select('id')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .single();

    if (existing) {
      const { error } = await sb
        .from('vacation_plans')
        .update({
          plan_data: { days: selectedPlanDays },
          updated_at: new Date().toISOString()
        })
        .eq('employee_id', currentEmployeeId)
        .eq('year', currentYear);
      
      if (error) throw error;
    } else {
      const { error } = await sb
        .from('vacation_plans')
        .insert({
          employee_id: currentEmployeeId,
          year: currentYear,
          plan_data: { days: selectedPlanDays },
          created_at: new Date().toISOString()
        });
      
      if (error) throw error;
    }

    await showPlanNotification('Plan urlopów zapisany pomyślnie', 'Sukces', '✅');
  } catch (e) {
    console.error('Save plan error', e);
    await showPlanNotification('Błąd przy zapisywaniu planu', 'Błąd', '❌');
  }
}

/* ============ INIT ============ */
async function initVacationPlan() {
  await initSupabasePlan();
  await loadEmployeesForPlan();

  // Populate year selector
  const currentYear = new Date().getFullYear();
  const yearSelect = document.getElementById('planYearSelect');
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYear) option.selected = true;
    yearSelect.appendChild(option);
  }

  // Event listeners
  document.getElementById('backToVacationBtn').addEventListener('click', () => {
    window.location.href = './vacation.html';
  });

  document.getElementById('planEmployeeSelect').addEventListener('change', async (e) => {
    currentEmployeeId = e.target.value;
    if (currentEmployeeId) {
      // Załaduj limit
      try {
        const { data, error } = await sb
          .from('vacation_limits')
          .select('limit_days')
          .eq('employee_id', currentEmployeeId)
          .eq('year', currentYear)
          .single();
        
        if (data) {
          vacationLimit = data.limit_days;
        } else {
          vacationLimit = 20;
        }
        
        document.getElementById('vacationLimitInput').value = vacationLimit;
      } catch (e) {
        vacationLimit = 20;
        document.getElementById('vacationLimitInput').value = vacationLimit;
      }
      
      await loadExistingPlans();
    } else {
      document.getElementById('planCalendarContainer').innerHTML = '';
    }
  });

  document.getElementById('planYearSelect').addEventListener('change', async (e) => {
    currentYear = parseInt(e.target.value);
    if (currentEmployeeId) {
      // Załaduj limit dla nowego roku
      try {
        const { data, error } = await sb
          .from('vacation_limits')
          .select('limit_days')
          .eq('employee_id', currentEmployeeId)
          .eq('year', currentYear)
          .single();
        
        if (data) {
          vacationLimit = data.limit_days;
        } else {
          vacationLimit = 20;
        }
        
        document.getElementById('vacationLimitInput').value = vacationLimit;
      } catch (e) {
        vacationLimit = 20;
        document.getElementById('vacationLimitInput').value = vacationLimit;
      }
      
      await loadExistingPlans();
    }
  });

  document.getElementById('saveLimitBtn').addEventListener('click', saveVacationLimit);
  document.getElementById('savePlanBtn').addEventListener('click', savePlanToDatabase);
  document.getElementById('clearAllPlanBtn').addEventListener('click', clearAllPlan);
  document.getElementById('resetPlanViewBtn').addEventListener('click', async () => {
    if (currentEmployeeId) {
      await loadExistingPlans();
      await showPlanNotification('Plan załadowany ponownie', 'Info', 'ℹ️');
    }
  });

  console.log('Vacation Plan module initialized');
}

document.addEventListener('DOMContentLoaded', initVacationPlan);
