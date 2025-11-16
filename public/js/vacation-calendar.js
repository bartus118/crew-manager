/* vacation-calendar.js — Moduł kalendarza nieobecności */

let sb = null;
let employees = [];
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let selectedAbsences = {}; // { "2025-01-15": "Urlop wypoczynkowy", ... }
let selectedDayForModal = null;
const ADMIN_PASSWORD = "admin123"; // Zmień na prawdziwe hasło!

const typeColors = {
  'Urlop wypoczynkowy': { bg: '#FFE082', border: '#FBC02D', icon: '📅' },
  'Urlop na żądanie': { bg: '#FFB74D', border: '#F57C00', icon: '📆' },
  'L4': { bg: '#F8BBD0', border: '#EC407A', icon: '🏥' },
  'Delegacja': { bg: '#BBDEFB', border: '#1976D2', icon: '✈️' },
  'Szkolenie': { bg: '#C8E6C9', border: '#388E3C', icon: '📚' }
};

/* ============ INIT SUPABASE ============ */
async function initSupabaseCalendar() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('VacationCalendar: Supabase ready');
  } catch (e) {
    console.warn('VacationCalendar: Supabase init error', e);
    sb = null;
  }
}

/* ============ NOTIFICATION ============ */
async function showCalendarNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
  const modal = document.getElementById('notificationModal');
  if (!modal) {
    alert(message);
    return;
  }

  return new Promise((resolve) => {
    document.getElementById('notificationTitle').textContent = title;
    document.getElementById('notificationMessage').textContent = message;
    document.getElementById('notificationIcon').textContent = icon;
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

    const cleanup = () => {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      document.getElementById('notificationOkBtn').onclick = null;
    };

    document.getElementById('notificationOkBtn').onclick = () => {
      cleanup();
      resolve();
    };
  });
}

/* ============ LOAD EMPLOYEES ============ */
async function loadEmployeesForCalendar() {
  if (!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('id, surname, firstname').order('surname', { ascending: true });
    if (error) throw error;
    employees = data || [];
    
    const select = document.getElementById('calendarEmployeeSelect');
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

/* ============ LOAD EXISTING ABSENCES ============ */
async function loadExistingAbsences() {
  if (!sb || !currentEmployeeId) return;
  try {
    const { data, error } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .gte('start_date', `${currentYear}-01-01`)
      .lte('end_date', `${currentYear}-12-31`);
    
    if (error) throw error;
    
    selectedAbsences = {};
    (data || []).forEach(vac => {
      const start = new Date(vac.start_date);
      const end = new Date(vac.end_date);
      
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        selectedAbsences[dateStr] = vac.reason;
      }
    });
    
    renderCalendarView();
  } catch (e) {
    console.error('Load absences error', e);
    renderCalendarView();
  }
}

/* ============ CHECK IF DATE IS PAST ============ */
function isDayPast(day, month) {
  const date = new Date(currentYear, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/* ============ CHECK IF NEEDS PASSWORD ============ */
function needsPassword(day, month) {
  const date = new Date(currentYear, month, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const daysBack = Math.floor((today - date) / (1000 * 60 * 60 * 24));
  return daysBack > 7;
}

/* ============ RENDER CALENDAR ============ */
function renderCalendarView() {
  const container = document.getElementById('calendarContainer');
  container.innerHTML = '';

  const monthNames = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 
                      'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

  for (let month = 0; month < 12; month++) {
    const monthCard = createMonthCardForAbsence(month, monthNames[month]);
    container.appendChild(monthCard);
  }
}

/* ============ CREATE MONTH CARD ============ */
function createMonthCardForAbsence(month, monthName) {
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
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  for (let i = 0; i < offset; i++) {
    const empty = document.createElement('div');
    daysGrid.appendChild(empty);
  }

  // Days
  for (let day = 1; day <= daysInMonth; day++) {
    const dayBtn = createDayButtonForAbsence(month, day);
    daysGrid.appendChild(dayBtn);
  }

  card.appendChild(daysGrid);
  return card;
}

/* ============ CREATE DAY BUTTON FOR ABSENCE ============ */
function createDayButtonForAbsence(month, day) {
  const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const absenceType = selectedAbsences[dateStr];
  const isPast = isDayPast(day, month);
  const needsPwd = needsPassword(day, month);

  const btn = document.createElement('button');
  btn.style.padding = '4px';
  btn.style.minHeight = '32px';
  btn.style.border = '1px solid #ddd';
  btn.style.borderRadius = '4px';
  btn.style.cursor = isPast && !absenceType ? 'default' : 'pointer';
  btn.style.fontSize = '11px';
  btn.style.fontWeight = '600';
  btn.style.transition = 'all 0.2s';
  
  if (absenceType) {
    const color = typeColors[absenceType];
    btn.style.background = color.bg;
    btn.style.border = `2px solid ${color.border}`;
    btn.textContent = `${color.icon}\n${day}`;
  } else {
    btn.style.background = isPast ? '#f0f0f0' : 'white';
    btn.style.color = isPast ? '#ccc' : '#666';
    btn.textContent = day;
  }

  if (!isPast || absenceType) {
    btn.onmouseenter = () => {
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
      btn.style.transform = 'scale(1.05)';
    };
    btn.onmouseleave = () => {
      btn.style.boxShadow = 'none';
      btn.style.transform = 'scale(1)';
    };

    btn.onclick = () => {
      if (absenceType) {
        // Usuń
        delete selectedAbsences[dateStr];
        renderCalendarView();
      } else {
        // Dodaj
        selectedDayForModal = { dateStr, day, month, needsPwd };
        openAbsenceDayModal(day, month, dateStr);
      }
    };
  }

  return btn;
}

/* ============ OPEN ABSENCE DAY MODAL ============ */
function openAbsenceDayModal(day, month, dateStr) {
  const monthNames = ['styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec', 
                      'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień'];
  
  document.getElementById('modalAbsenceDayDate').textContent = `${day} ${monthNames[month]} ${currentYear}`;
  document.getElementById('adminPasswordWarning').style.display = selectedDayForModal.needsPwd ? 'block' : 'none';
  document.getElementById('passwordFieldContainer').style.display = selectedDayForModal.needsPwd ? 'block' : 'none';
  document.getElementById('adminPasswordInput').value = '';
  document.getElementById('absenceDayModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

/* ============ CLOSE ABSENCE DAY MODAL ============ */
function closeAbsenceDayModal() {
  document.getElementById('absenceDayModal').style.display = 'none';
  document.body.style.overflow = 'auto';
  selectedDayForModal = null;
}

/* ============ SET ABSENCE TYPE ============ */
async function setAbsenceType(type) {
  if (!selectedDayForModal) return;
  
  const { dateStr, needsPwd } = selectedDayForModal;
  
  // Jeśli potrzebne hasło - sprawdź
  if (needsPwd) {
    const password = document.getElementById('adminPasswordInput').value;
    if (password !== ADMIN_PASSWORD) {
      await showCalendarNotification('Nieprawidłowe hasło admina', 'Błąd', '❌');
      return;
    }
  }

  // Zapisz w bazie
  if (!sb || !currentEmployeeId) return;

  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    
    const { error } = await sb.from('vacation').insert({
      employee_id: currentEmployeeId,
      start_date: dateStr,
      end_date: dateStr,
      reason: type,
      approved: true,
      created_at: new Date().toISOString()
    });

    if (error) throw error;

    selectedAbsences[dateStr] = type;
    closeAbsenceDayModal();
    renderCalendarView();
    await showCalendarNotification(`Nieobecność dodana: ${type}`, 'Sukces', '✅');
  } catch (e) {
    console.error('Set absence type error', e);
    await showCalendarNotification('Błąd przy dodawaniu nieobecności', 'Błąd', '❌');
  }
}

/* ============ CLEAR ALL ABSENCES ============ */
function clearAllAbsences() {
  if (confirm('Czy na pewno chcesz usunąć wszystkie zaznaczone nieobecności?')) {
    selectedAbsences = {};
    renderCalendarView();
  }
}

/* ============ INIT ============ */
async function initVacationCalendar() {
  await initSupabaseCalendar();
  await loadEmployeesForCalendar();

  // Populate year selector
  const currentYearValue = new Date().getFullYear();
  const yearSelect = document.getElementById('calendarYearSelect');
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

  document.getElementById('calendarEmployeeSelect').addEventListener('change', (e) => {
    currentEmployeeId = e.target.value;
    if (currentEmployeeId) {
      loadExistingAbsences();
    } else {
      document.getElementById('calendarContainer').innerHTML = '';
    }
  });

  document.getElementById('calendarYearSelect').addEventListener('change', (e) => {
    currentYear = parseInt(e.target.value);
    if (currentEmployeeId) {
      loadExistingAbsences();
    }
  });

  document.getElementById('clearAllAbsencesBtn').addEventListener('click', clearAllAbsences);

  console.log('Vacation Calendar module initialized');
}

document.addEventListener('DOMContentLoaded', initVacationCalendar);
