/* vacation-calendar.js — Kalendarz zaznaczania nieobecności */

let sb = null;
let employees = [];
let currentEmployeeId = null;
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let viewMode = 'month'; // 'month' lub 'year'
let absencesCache = {}; // { "YYYY-MM-DD": "Urlop wypoczynkowy", ... }
let planedVacations = {}; // { "YYYY-MM-DD": true } - zaplanowane urlopy z vacation_plans
let selectedAbsences = {}; // Dla starego interfejsu (roczny widok)
let selectedDayForModal = null;
let rangeStartDate = null; // Pierwszy wybrany dzień zakresu
let rangeEndDate = null;   // Drugi wybrany dzień zakresu

const ADMIN_PASSWORD = 'admin123';

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

/* ============ NOTIFICATION HELPER ============ */
async function showCalendarNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
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
  
  if (viewMode === 'month') {
    loadAbsences();
  } else {
    loadAbsences();
  }
}

/* ============ LOAD ABSENCES ============ */
async function loadAbsences() {
  if (!sb || !currentEmployeeId) return;
  
  try {
    const startDate = new Date(currentYear, currentMonth, 1);
    const endDate = new Date(currentYear, currentMonth + 1, 0);
    
    // W widoku roku pobierz cały rok
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

    // Pobierz nieobecności ze starej tabeli (vacation)
    const { data: vacationData, error: vacationError } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .gte('start_date', startStr)
      .lte('end_date', endStr);
    
    if (vacationError) throw vacationError;
    
    // Pobierz plany urlopów z nowej tabeli (vacation_plans) - zaplanowane urlopy
    const { data: planData, error: planError } = await sb
      .from('vacation_plans')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .eq('year', currentYear)
      .gte('start_date', startStr)
      .lte('end_date', endStr);
    
    if (planError) throw planError;
    
    absencesCache = {};
    
    // Zaznacz nieobecności ze starej tabeli (vacation)
    (vacationData || []).forEach(record => {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      
      // Zaznacz każdy dzień z zakresu
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        absencesCache[dateStr] = record.reason;
      }
    });

    // Zaznacz urlopy zaplanowane (vacation_plans) - zamiast typów będziemy używać specjalnego markera
    planedVacations = {};
    (planData || []).forEach(record => {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      
      // Zaznacz każdy dzień z zakresu - niezależnie od tego czy już ma nieobecność
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        planedVacations[dateStr] = true;
      }
    });
    
    if (viewMode === 'month') {
      renderMonthView();
    } else {
      renderYearView();
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
  
  // Update display
  const display = document.getElementById('currentMonthDisplay');
  if (display) {
    display.textContent = `${monthNames[currentMonth]} ${currentYear}`;
  }

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 = sunday
  
  // Build calendar grid
  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';
  grid.style.gap = '4px';
  grid.style.padding = '8px';
  grid.style.background = 'white';
  grid.style.borderRadius = '8px';
  grid.style.border = '1px solid #ddd';

  // Day headers
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

  // Empty cells before first day (adjust for Monday start)
  const adjustedFirstDay = firstDay === 0 ? 6 : firstDay - 1;
  for (let i = 0; i < adjustedFirstDay; i++) {
    grid.appendChild(document.createElement('div'));
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const type = absencesCache[dateStr];
    const hasPlannedVacation = planedVacations[dateStr];
    
    // Check if date is in selected range
    let isInRange = false;
    if (rangeStartDate && rangeEndDate) {
      // Porównuj stringi dat: "2025-11-12", "2025-11-15"
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
      // Zarówno nieobecność jak i zaplanowany urlop - ikona planowania nad dniem
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
      // Zaplanowany urlop - lekki żółty kolor z ikoną nad dniem
      cell.style.background = '#FFFDE7';
      cell.style.borderColor = '#ddd';
      cell.style.color = '#333';
      cell.innerHTML = `<div style="font-size: 16px; line-height: 1; margin: 0 auto 2px auto; display: flex; justify-content: center;">📅</div><div>${day}</div>`;
    } else if (isInRange) {
      // Zaznaczony zakres
      cell.style.background = '#E3F2FD';
      cell.style.borderColor = '#1976D2';
      cell.style.color = '#0D47A1';
      cell.textContent = day;
    } else {
      cell.style.background = currentEmployeeId ? 'white' : '#f5f5f5';
      cell.style.color = currentEmployeeId ? '#333' : '#ccc';
      cell.textContent = day;
    }

    // Check if date is past (disable old dates without password)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cellDate = new Date(dateStr);
    const isPast = cellDate < today;

    if (!type && currentEmployeeId) {
      cell.onclick = () => {
        selectRangeDay(dateStr, day, isPast);
      };
    } else if (type && currentEmployeeId) {
      // Click to remove
      cell.onclick = () => {
        removeAbsence(dateStr);
      };
      cell.title = 'Klikni aby usunąć';
    } else if (!currentEmployeeId) {
      // Brak pracownika - wyłącz klikanie
      cell.disabled = true;
      cell.style.opacity = '0.6';
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

/* ============ RENDER YEAR VIEW ============ */
function renderYearView() {
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
  
  // Hover effect na tytuł
  title.onmouseover = () => {
    title.style.background = '#f0f0f0';
    title.style.color = '#667eea';
  };
  title.onmouseout = () => {
    title.style.background = 'transparent';
    title.style.color = '#0f1724';
  };
  
  // Klik na tytuł - przejście do widoku miesiąca
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

  // Empty cells
  for (let i = 0; i < adjustedFirstDay; i++) {
    miniGrid.appendChild(document.createElement('div'));
  }

  // Day cells
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
      // Zarówno nieobecność jak i zaplanowany urlop - żółty z kwadratem nieobecności w środku
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
      // Zaplanowany urlop - lekki żółty kolor
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
      
      // Najpierw sprawdź czy jest zaznaczony pracownik
      if (!currentEmployeeId) {
        showCalendarNotification('Wybierz pracownika', 'Najpierw musisz wybrać pracownika', '⚠️');
        return;
      }
      
      // Otwórz modal do dodania nieobecności
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
    // Pierwszy klik - ustaw początek zakresu
    rangeStartDate = dateStr;
    renderMonthView();
  } else if (!rangeEndDate) {
    // Drugi klik - ustaw koniec zakresu
    const start = new Date(rangeStartDate);
    const end = new Date(dateStr);
    
    // Upewni się że start < end
    if (end < start) {
      rangeEndDate = rangeStartDate;
      rangeStartDate = dateStr;
    } else {
      rangeEndDate = dateStr;
    }
    
    // Najpierw re-renderuj kalendarz aby podświetlić zakres
    renderMonthView();
    
    // Potem otwórz modal do wyboru typu
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
  
  // Wyświetl datę lub zakres
  if (selectedDayForModal.isRange && selectedDayForModal.endDate) {
    const endDate = new Date(`${selectedDayForModal.endDate}T00:00:00Z`);
    dateSpan.textContent = `Od ${selectedDayForModal.dateStr} do ${selectedDayForModal.endDate}`;
  } else {
    dateSpan.textContent = `${dayName[date.getUTCDay()]} ${selectedDayForModal.day || date.getUTCDate()} (${selectedDayForModal.dateStr})`;
  }
  
  // Check if needs password
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

  // Check password if needed
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
    // Ustal end_date - jeśli zakres, użyj endDate, inaczej to samo co start_date
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
    await showCalendarNotification('Błąd przy zaznaczaniu nieobecności', 'Błąd', '❌');
  }
}

/* ============ REMOVE ABSENCE ============ */
async function removeAbsence(dateStr) {
  if (!sb || !currentEmployeeId) return;

  if (!confirm('Usunąć nieobecność z tego dnia?')) return;

  try {
    // Znajdź wszystkie rekordy nieobecności, które zawierają ten dzień
    const { data, error: fetchError } = await sb
      .from('vacation')
      .select('*')
      .eq('employee_id', currentEmployeeId)
      .lte('start_date', dateStr)
      .gte('end_date', dateStr);
    
    if (fetchError) throw fetchError;

    // Jeśli żaden rekord nie zawiera ten dzień, wyj dź
    if (!data || data.length === 0) {
      await showCalendarNotification('Brak nieobecności do usunięcia', 'Info', 'ℹ️');
      return;
    }

    // Procesuj każdy znaleziony rekord
    for (const record of data) {
      const start = new Date(record.start_date);
      const end = new Date(record.end_date);
      const clickedDate = new Date(dateStr);

      // Jeśli to jednodniowa nieobecność - usuń całą
      if (record.start_date === record.end_date) {
        await sb.from('vacation').delete().eq('id', record.id);
      }
      // Jeśli to pierwszy dzień zakresu - przesunąć start
      else if (dateStr === record.start_date) {
        const newStart = new Date(start);
        newStart.setDate(newStart.getDate() + 1);
        await sb.from('vacation').update({
          start_date: newStart.toISOString().split('T')[0]
        }).eq('id', record.id);
      }
      // Jeśli to ostatni dzień zakresu - przesunąć koniec
      else if (dateStr === record.end_date) {
        const newEnd = new Date(end);
        newEnd.setDate(newEnd.getDate() - 1);
        await sb.from('vacation').update({
          end_date: newEnd.toISOString().split('T')[0]
        }).eq('id', record.id);
      }
      // Jeśli to dzień pośrodku zakresu - podziel na dwa rekordy
      else if (clickedDate > start && clickedDate < end) {
        // Zmień koniec pierwszej części
        const firstEnd = new Date(clickedDate);
        firstEnd.setDate(firstEnd.getDate() - 1);
        await sb.from('vacation').update({
          end_date: firstEnd.toISOString().split('T')[0]
        }).eq('id', record.id);

        // Dodaj drugą część
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
    await showCalendarNotification('Błąd przy usuwaniu nieobecności', 'Błąd', '❌');
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

/* ============ INIT ============ */
async function initCalendar() {
  await initSupabaseCalendar();
  await loadEmployeesForCalendar();

  // Populate year selector
  const yearSelect = document.getElementById('calendarYearSelect');
  for (let year = currentYear - 1; year <= currentYear + 3; year++) {
    const option = document.createElement('option');
    option.value = year;
    option.textContent = year;
    if (year === currentYear) option.selected = true;
    yearSelect.appendChild(option);
  }

  // Show default month view
  renderMonthView();

  // Event listeners
  document.getElementById('backToVacationBtn').addEventListener('click', () => {
    window.location.href = './vacation.html';
  });

  document.getElementById('backToMainBtn').addEventListener('click', () => {
    window.location.href = './index.html';
  });

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
      renderYearView();
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const searchInput = document.getElementById('calendarEmployeeSearch');
    const dropdown = document.getElementById('calendarEmployeeDropdown');
    
    if (searchInput && !searchInput.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  console.log('Calendar module initialized');
}

document.addEventListener('DOMContentLoaded', initCalendar);
