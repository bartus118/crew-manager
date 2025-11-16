/* vacation-plan-calendar.js — Moduł planu urlopów rocznych z kalendarzem */

let sb = null;
let employees = [];
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let vacationLimit = 20;
let selectedPlan = {}; // { monthYear: { day: type, ... }, ... }
let selectedDayForModal = null;

// Kolory dla różnych typów
const typeColors = {
  'Urlop wypoczynkowy': { bg: '#FFE082', border: '#FBC02D', icon: '📅' },
  'L4': { bg: '#F8BBD0', border: '#EC407A', icon: '🏥' },
  'Delegacja': { bg: '#BBDEFB', border: '#1976D2', icon: '✈️' },
  'Szkolenie': { bg: '#C8E6C9', border: '#388E3C', icon: '📚' },
  'Wolne': { bg: '#F5F5F5', border: '#999', icon: '⊗' }
};

/* ============ INIT SUPABASE ============ */
async function initSupabasePlanCalendar() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('VacationPlanCalendar: Supabase ready');
  } catch (e) {
    console.warn('VacationPlanCalendar: Supabase init error', e);
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
async function loadEmployeesForPlanCalendar() {
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

/* ============ LOAD VACATION LIMIT ============ */
async function loadVacationLimitCalendar() {
  if (!sb || !currentEmployeeId) return;
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
    updateStatsCalendar();
  } catch (e) {
    vacationLimit = 20;
    document.getElementById('vacationLimitInput').value = vacationLimit;
  }
}

/* ============ SAVE VACATION LIMIT ============ */
async function saveVacationLimitCalendar() {
  if (!sb || !currentEmployeeId) return;
  
  const limitValue = parseInt(document.getElementById('vacationLimitInput').value);
  
  if (isNaN(limitValue) || limitValue < 0) {
    await showPlanNotification('Wprowadź prawidłowy limit dni', 'Błąd', '❌');
    return;
  }

  try {
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
    updateStatsCalendar();
    await showPlanNotification('Limit urlopów zapisany', 'Sukces', '✅');
  } catch (e) {
    console.error('Save vacation limit error', e);
    await showPlanNotification('Błąd przy zapisywaniu limitu', 'Błąd', '❌');
  }
}

/* ============ LOAD VACATION PLAN ============ */
async function loadVacationPlan() {
  if (!sb || !currentEmployeeId) return;
  try {
    const { data, error } = await sb
      .from('vacation_plans')
      .select('plan_data')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .single();
    
    if (data && data.plan_data) {
      selectedPlan = data.plan_data;
    } else {
      selectedPlan = {};
    }
    
    renderCalendar();
  } catch (e) {
    console.log('No existing plan, starting fresh');
    selectedPlan = {};
    renderCalendar();
  }
}

/* ============ SAVE VACATION PLAN ============ */
async function saveVacationPlan() {
  if (!sb || !currentEmployeeId) return;
  
  try {
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
          plan_data: selectedPlan,
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
          plan_data: selectedPlan,
          status: 'pending',
          created_at: new Date().toISOString()
        });
      if (error) throw error;
    }

    await showPlanNotification('Plan urlopów zapisany', 'Sukces', '✅');
  } catch (e) {
    console.error('Save vacation plan error', e);
    await showPlanNotification('Błąd przy zapisywaniu planu', 'Błąd', '❌');
  }
}

/* ============ UPDATE STATS ============ */
function updateStatsCalendar() {
  let plannedDays = 0;
  let freelDays = 0;

  Object.values(selectedPlan).forEach(monthData => {
    if (typeof monthData === 'object') {
      Object.values(monthData).forEach(dayType => {
        if (dayType === 'Wolne') {
          freelDays++;
        } else if (dayType) {
          plannedDays++;
        }
      });
    }
  });

  document.getElementById('limitDisplay').textContent = vacationLimit;
  document.getElementById('plannedDisplay').textContent = plannedDays;
  document.getElementById('remainingDisplay').textContent = Math.max(0, vacationLimit - plannedDays);
  document.getElementById('statusDisplay').textContent = plannedDays <= vacationLimit ? '✅ OK' : '⚠️ Przekroczono limit!';
}

/* ============ RENDER CALENDAR ============ */
function renderCalendar() {
  const container = document.getElementById('calendarContainer');
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthCard(month, monthNames[month]);
    container.appendChild(monthCard);
  }

  updateStatsCalendar();
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

  const monthKey = `${currentYear}-${String(month + 1).padStart(2, '0')}`;
  const monthData = selectedPlan[monthKey] || {};

  // Get number of days in month
  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
  
  const daysGrid = document.createElement('div');
  daysGrid.style.display = 'grid';
  daysGrid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  daysGrid.style.gap = '4px';
  daysGrid.style.marginBottom = '12px';

  // Day headers
  const dayHeaders = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
  dayHeaders.forEach(day => {
    const dayHeader = document.createElement('div');
    dayHeader.style.textAlign = 'center';
    dayHeader.style.fontSize = '11px';
    dayHeader.style.fontWeight = '600';
    dayHeader.style.color = '#999';
    dayHeader.style.padding = '4px';
    dayHeader.textContent = day;
    daysGrid.appendChild(dayHeader);
  });

  // First day offset
  const firstDay = new Date(currentYear, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday = 0

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    daysGrid.appendChild(empty);
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dayBtn = createDayButton(month, day, monthKey, monthData);
    daysGrid.appendChild(dayBtn);
  }

  card.appendChild(daysGrid);

  // Month summary
  const summary = document.createElement('div');
  summary.style.fontSize = '11px';
  summary.style.color = '#666';
  summary.style.padding = '8px';
  summary.style.background = '#f9f9f9';
  summary.style.borderRadius = '4px';
  
  let urlopy = 0, l4 = 0, delegacja = 0, szkolenie = 0, wolne = 0;
  Object.values(monthData).forEach(type => {
    if (type === 'Urlop wypoczynkowy') urlopy++;
    else if (type === 'L4') l4++;
    else if (type === 'Delegacja') delegacja++;
    else if (type === 'Szkolenie') szkolenie++;
    else if (type === 'Wolne') wolne++;
  });

  summary.innerHTML = `
    📅: ${urlopy} | 🏥: ${l4} | ✈️: ${delegacja} | 📚: ${szkolenie} | ⊗: ${wolne}
  `;
  card.appendChild(summary);

  return card;
}

/* ============ CREATE DAY BUTTON ============ */
function createDayButton(month, day, monthKey, monthData) {
  const dayStr = String(day).padStart(2, '0');
  const dayKey = dayStr;
  const dayType = monthData[dayKey];

  const btn = document.createElement('button');
  btn.style.padding = '4px';
  btn.style.minHeight = '32px';
  btn.style.border = '1px solid #ddd';
  btn.style.borderRadius = '4px';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '11px';
  btn.style.fontWeight = '600';
  btn.style.transition = 'all 0.2s';
  
  if (dayType) {
    const color = typeColors[dayType];
    btn.style.background = color.bg;
    btn.style.border = `2px solid ${color.border}`;
    btn.textContent = `${color.icon}\n${day}`;
  } else {
    btn.textContent = day;
    btn.style.background = 'white';
    btn.style.color = '#666';
  }

  btn.onmouseenter = () => {
    btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    btn.style.transform = 'scale(1.05)';
  };
  btn.onmouseleave = () => {
    btn.style.boxShadow = 'none';
    btn.style.transform = 'scale(1)';
  };

  btn.onclick = () => {
    selectedDayForModal = { monthKey, dayKey, day, month, currentType: dayType };
    if (dayType) {
      // Toggle off
      delete monthData[dayKey];
      renderCalendar();
    } else {
      // Show modal
      openDayTypeModal(day, month);
    }
  };

  return btn;
}

/* ============ OPEN DAY TYPE MODAL ============ */
function openDayTypeModal(day, month) {
  const monthNames = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 
                      'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  
  document.getElementById('modalDayDate').textContent = `${day} ${monthNames[month]} ${currentYear}`;
  document.getElementById('dayTypeModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ============ CLOSE DAY TYPE MODAL ============ */
function closeDayTypeModal() {
  document.getElementById('dayTypeModal').style.display = 'none';
  document.body.style.overflow = 'auto';
  selectedDayForModal = null;
}

/* ============ SET DAY TYPE ============ */
function setDayType(type) {
  if (!selectedDayForModal) return;
  
  const { monthKey, dayKey } = selectedDayForModal;
  
  if (!selectedPlan[monthKey]) {
    selectedPlan[monthKey] = {};
  }
  
  selectedPlan[monthKey][dayKey] = type;
  
  closeDayTypeModal();
  renderCalendar();
}

/* ============ CLEAR ALL ============ */
function clearAllPlan() {
  if (confirm('Czy na pewno chcesz wyczyścić wszystko?')) {
    selectedPlan = {};
    renderCalendar();
  }
}

/* ============ INIT ============ */
async function initVacationPlanCalendar() {
  await initSupabasePlanCalendar();
  await loadEmployeesForPlanCalendar();

  // Populate year selector
  const currentYearValue = new Date().getFullYear();
  const yearSelect = document.getElementById('planYearSelect');
  for (let year = currentYearValue - 1; year <= currentYearValue + 3; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYearValue) option.selected = true;
    yearSelect.appendChild(option);
  }

  // Event listeners
  document.getElementById('backToVacationBtn').addEventListener('click', () => {
    window.location.href = './vacation.html';
  });

  document.getElementById('planEmployeeSelect').addEventListener('change', (e) => {
    currentEmployeeId = e.target.value;
    if (currentEmployeeId) {
      loadVacationLimitCalendar();
      loadVacationPlan();
    } else {
      document.getElementById('calendarContainer').innerHTML = '';
    }
  });

  document.getElementById('planYearSelect').addEventListener('change', (e) => {
    currentYear = parseInt(e.target.value);
    if (currentEmployeeId) {
      loadVacationLimitCalendar();
      loadVacationPlan();
    }
  });

  document.getElementById('saveLimitBtn').addEventListener('click', saveVacationLimitCalendar);
  document.getElementById('savePlanBtn').addEventListener('click', saveVacationPlan);
  document.getElementById('clearAllBtn').addEventListener('click', clearAllPlan);
  document.getElementById('resetViewBtn').addEventListener('click', () => {
    if (currentEmployeeId) loadVacationPlan();
  });

  console.log('Vacation Plan Calendar module initialized');
}

document.addEventListener('DOMContentLoaded', initVacationPlanCalendar);
