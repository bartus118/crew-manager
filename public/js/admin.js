
/**
 * public/js/admin.js
 *
 * Pełny plik admin — AdminMachines + AdminEmployees
 * - czytelne logi błędów
 * - edycja pracownika: BU select, role multi-select, permissions checkboxy (chipy filtrów)
 * - sortowanie po surname/firstname
 * - stare filtry uprawnień (selecty) usunięte — używamy chipów
 *
 * Uwaga: dopasuj stałe (BU_OPTIONS, ROLE_OPTIONS, PERMISSION_OPTIONS) jeśli trzeba.
 */

/* -------------------- ROLE DISPLAY MAPPING -------------------- */
const ROLE_DISPLAY_NAMES = {
  'mechanik_focke': 'Mechanik Focke',
  'mechanik_protos': 'Mechanik Protos',
  'senior_focke': 'Senior Focke',
  'senior_protos': 'Senior Protos',
  'operator_focke': 'Operator Focke',
  'operator_krosowy': 'Operator Krosowy',
  'operator_protos': 'Operator Protos'
};

function getDisplayRoleName(roleKey) {
  return ROLE_DISPLAY_NAMES[roleKey] || roleKey;
}

/* -------------------- KONFIGURACJA: hasło + supabase -------------------- */
const ADMIN_PASSWORD = 'admin123';
const SUPABASE_URL = window.CONFIG.supabase.url;
const SUPABASE_ANON_KEY = window.CONFIG.supabase.anonKey;

/* -------------------- Stałe pomocnicze (z config.js) -------------------- */
const BU_OPTIONS = window.CONFIG.admin.bus;
const ROLE_OPTIONS = window.CONFIG.admin.roles;
const PERMISSION_OPTIONS = window.CONFIG.admin.permissions;

/* -------------------- Helpers: Supabase init + wait for SDK -------------------- */
// Using CONFIG.waitForSupabase from config.js
const waitForSupabaseGlobalAdmin = window.CONFIG.waitForSupabase;

  /**
   * Sprawdza czy pracownik może być przypisany do stanowiska na maszynie wg reguł Protos/Focke i mechanik/operator
   * @param {Object} employee - obiekt pracownika (musi mieć role, permissions, mechanical_permissions)
   * @param {string} machineCode - kod maszyny (np. 'P100', 'F550', '411', itp.)
   * @returns {boolean} true jeśli pracownik ma wymagane uprawnienia
   */
  function canAssignEmployeeToMachine(employee, machineCode) {
    // Rozgraniczenie maszyn
    const isProtos = machineCode === 'P100' || machineCode === 'P70';
    const isFocke = !isProtos;

    // Pobierz role
    const roles = Array.isArray(employee.roles) ? employee.roles : (employee.roles ? String(employee.roles).split(',').map(s=>s.trim()) : []);
    // Pobierz uprawnienia operatorskie
    const permissions = Array.isArray(employee.permissions) ? employee.permissions : (employee.permissions ? String(employee.permissions).split(',').map(s=>s.trim()) : []);
    // Pobierz uprawnienia mechaniczne (obsługuje string i JSON array)
    let mechanical_permissions = [];
    if(employee.mechanical_permissions) {
      if(Array.isArray(employee.mechanical_permissions)) {
        mechanical_permissions = employee.mechanical_permissions.map(s => String(s).trim());
      } else {
        mechanical_permissions = String(employee.mechanical_permissions).split(',').map(s=>s.trim());
      }
    }

    // Mechanik Focke
    if (roles.includes('mechanik_focke') && isFocke) {
      return mechanical_permissions.includes(machineCode);
    }
    // Mechanik Protos
    if (roles.includes('mechanik_protos') && isProtos) {
      return mechanical_permissions.includes(machineCode);
    }
    // Operator Focke
    if (roles.includes('operator_focke') && isFocke) {
      return permissions.includes(machineCode);
    }
    // Operator Protos
    if (roles.includes('operator_protos') && isProtos) {
      return permissions.includes(machineCode);
    }
    // W innych przypadkach nie pozwalaj
    return false;
  }

  /**
   * Zwraca brakujące uprawnienia (mechaniczne lub operatorskie) dla danego pracownika i maszyny
   * @param {Object} employee
   * @param {string} machineCode
   * @returns {string|null} - komunikat o brakujących uprawnieniach lub null jeśli wszystko OK
   */
  function getMissingAssignmentPermissions(employee, machineCode) {
    const isProtos = machineCode === 'P100' || machineCode === 'P70';
    const isFocke = !isProtos;
    const roles = Array.isArray(employee.roles) ? employee.roles : (employee.roles ? String(employee.roles).split(',').map(s=>s.trim()) : []);
    const permissions = Array.isArray(employee.permissions) ? employee.permissions : (employee.permissions ? String(employee.permissions).split(',').map(s=>s.trim()) : []);
    // Parsuj uprawnienia mechaniczne (obsługuje string i JSON array)
    let mechanical_permissions = [];
    if(employee.mechanical_permissions) {
      if(Array.isArray(employee.mechanical_permissions)) {
        mechanical_permissions = employee.mechanical_permissions.map(s => String(s).trim());
      } else {
        mechanical_permissions = String(employee.mechanical_permissions).split(',').map(s=>s.trim());
      }
    }

    // Mechanik Focke
    if (roles.includes('mechanik_focke') && isFocke) {
      if (!mechanical_permissions.includes(machineCode)) {
        return `Brak uprawnienia mechanicznego: ${machineCode}`;
      }
      return null;
    }
    // Mechanik Protos
    if (roles.includes('mechanik_protos') && isProtos) {
      if (!mechanical_permissions.includes(machineCode)) {
        return `Brak uprawnienia mechanicznego: ${machineCode}`;
      }
      return null;
    }
    // Operator Focke
    if (roles.includes('operator_focke') && isFocke) {
      if (!permissions.includes(machineCode)) {
        return `Brak uprawnienia operatorskiego: ${machineCode}`;
      }
      return null;
    }
    // Operator Protos
    if (roles.includes('operator_protos') && isProtos) {
      if (!permissions.includes(machineCode)) {
        return `Brak uprawnienia operatorskiego: ${machineCode}`;
      }
      return null;
    }
    // W innych przypadkach
    return `Brak odpowiedniej roli lub uprawnienia do maszyny: ${machineCode}`;
  }
let sb = null;

/* -------------------- GENERIC NOTIFICATION FOR ADMIN -------------------- */
async function showAdminNotification(message, title = 'Powiadomienie', icon = 'ℹ️'){
  // Sprawdzaj czy modal z głównej strony jest dostępny
  const modal = document.getElementById('notificationModal');
  if(modal) {
    const titleEl = document.getElementById('notificationTitle');
    const messageEl = document.getElementById('notificationMessage');
    const iconEl = document.getElementById('notificationIcon');
    const okBtn = document.getElementById('notificationOkBtn');
    
    if(titleEl && messageEl && iconEl && okBtn) {
      return new Promise((resolve) => {
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
      });
    }
  }
  // Fallback
  alert(message);
}

async function showConfirmModal(message, title = 'Potwierdzenie'){
  const modal = document.getElementById('confirmModal');
  if(modal){
    const msgEl = modal.querySelector('.confirm-box p');
    const titleEl = modal.querySelector('.confirm-box h3');
    const yesBtn = modal.querySelector('.confirm-box .yes-btn');
    const noBtn = modal.querySelector('.confirm-box .no-btn');
    
    if(titleEl) titleEl.textContent = title;
    if(msgEl) msgEl.textContent = message;
    
    return new Promise(resolve => {
      modal.style.display = 'flex';
      document.body.classList.add('modal-open');
      
      const cleanup = () => {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        yesBtn.onclick = null;
        noBtn.onclick = null;
      };
      
      yesBtn.onclick = () => {
        cleanup();
        resolve(true);
      };
      
      noBtn.onclick = () => {
        cleanup();
        resolve(false);
      };
      
      // ESC key closes with false
      const handleEsc = (e) => {
        if(e.key === 'Escape'){
          cleanup();
          document.removeEventListener('keydown', handleEsc);
          resolve(false);
        }
      };
      document.addEventListener('keydown', handleEsc);
    });
  }
  // Fallback
  return confirm(message);
}

async function initSupabaseAdmin(){
  try {
    await waitForSupabaseGlobalAdmin();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('admin: Supabase ready');
  } catch (e) {
    console.warn('admin: Supabase not available — offline mode', e);
    sb = null;
  }
}

  

/* -------------------- Auth modal (prostota) -------------------- */
function showAuthModal() {
  const modal = document.getElementById('adminLoginModal');
  const passInput = document.getElementById('adminPasswordInput');
  const okBtn = document.getElementById('adminLoginSubmit');
  const cancelBtn = document.getElementById('adminLoginCancel');

  if(!modal) return;

  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
  if(passInput) { passInput.value = ''; passInput.focus(); }

  function closeModal() { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }

  async function tryLogin() {
    const v = (passInput && passInput.value) ? passInput.value : '';
    if (v === ADMIN_PASSWORD) {
      try { sessionStorage.setItem('adminAuthenticated', '1'); } catch(e){}
      closeModal();
      await initSupabaseAdmin();
      try {
        if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
          AdminMachines.init();
          try { AdminMachines.refreshOrderView(); } catch(e){}
          try { AdminMachines.renderList(); } catch(e){}
        }
      } catch(e){ console.warn('Błąd po logowaniu przy init AdminMachines:', e); }
      try { document.dispatchEvent(new CustomEvent('adminAuthenticated')); } catch(e){}
      document.getElementById('tabModify')?.click();
    } else {
      await showAdminNotification('Błędne hasło.', 'Błąd', '❌'); if(passInput) passInput.focus();
    }
  }

  if(okBtn) okBtn.onclick = tryLogin;
  if(cancelBtn) cancelBtn.onclick = () => { window.location.href = '../index.html'; };
  if(passInput) passInput.onkeydown = (e) => { if(e.key === 'Enter') tryLogin(); };
}

/* ensure auth then run callback */
function ensureAuthThen(cb) {
  const ok = sessionStorage.getItem('adminAuthenticated') === '1';
  if (ok) {
    initSupabaseAdmin()
      .then(async () => {
        try {
          if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
            AdminMachines.init();
            try { AdminMachines.refreshOrderView(); } catch(e){}
            try { AdminMachines.renderList(); } catch(e){}
          }
        } catch (e) { console.warn('Błąd podczas init AdminMachines:', e); }
      })
      .then(() => { try { cb && cb(); } catch (e) { console.warn(e); } })
      .catch(err => { console.warn('Błąd initSupabaseAdmin w ensureAuthThen:', err); showAuthModal(); });
  } else {
    showAuthModal();
    const handler = () => {
      document.removeEventListener('adminAuthenticated', handler);
      initSupabaseAdmin()
        .then(async () => {
          try {
            if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
              AdminMachines.init();
              try { AdminMachines.refreshOrderView(); } catch(e){}
              try { AdminMachines.renderList(); } catch(e){}
            }
          } catch (e) { console.warn('Błąd podczas init AdminMachines po zdarzeniu auth:', e); }
        })
        .then(() => { try { cb && cb(); } catch (e) { console.warn(e); } })
        .catch(err => { console.warn('Błąd initSupabaseAdmin po zdarzeniu auth:', err); });
    };
    document.addEventListener('adminAuthenticated', handler);
  }
}

/* ============ MODAL DO USTAWIANIA STATUSÓW MASZYN ============ */
async function showMachineStatusScheduleModal() {
  const modal = document.createElement('div');
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.background = 'rgba(0,0,0,0.4)';
  modal.style.zIndex = '30000';
  
  const box = document.createElement('div');
  box.style.width = '600px';
  box.style.maxWidth = '90%';
  box.style.maxHeight = '85vh';
  box.style.background = '#fff';
  box.style.borderRadius = '10px';
  box.style.padding = '24px';
  box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
  box.style.display = 'flex';
  box.style.flexDirection = 'column';
  box.style.gap = '16px';
  box.style.overflowY = 'auto';
  
  const title = document.createElement('h3');
  title.textContent = '🔧 Ustaw statusy maszyn';
  title.style.marginTop = '0';
  title.style.marginBottom = '0';
  box.appendChild(title);
  
  const dateLabel = document.createElement('label');
  dateLabel.style.display = 'block';
  dateLabel.style.fontSize = '14px';
  dateLabel.style.fontWeight = 'bold';
  dateLabel.style.marginBottom = '6px';
  dateLabel.textContent = 'Wybierz datę:';
  box.appendChild(dateLabel);
  
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.style.width = '100%';
  dateInput.style.padding = '8px';
  dateInput.style.marginBottom = '16px';
  dateInput.style.border = '1px solid #ccc';
  dateInput.style.borderRadius = '4px';
  dateInput.style.fontSize = '14px';
  dateInput.style.boxSizing = 'border-box';
  dateInput.value = new Date().toISOString().split('T')[0];
  box.appendChild(dateInput);
  
  const machinesListLabel = document.createElement('label');
  machinesListLabel.style.display = 'block';
  machinesListLabel.style.fontSize = '14px';
  machinesListLabel.style.fontWeight = 'bold';
  machinesListLabel.style.marginBottom = '8px';
  machinesListLabel.textContent = 'Statusy maszyn:';
  box.appendChild(machinesListLabel);
  
  const machinesList = document.createElement('div');
  machinesList.style.display = 'flex';
  machinesList.style.flexDirection = 'column';
  machinesList.style.gap = '12px';
  machinesList.style.maxHeight = '350px';
  machinesList.style.overflowY = 'auto';
  machinesList.style.marginBottom = '12px';
  machinesList.style.paddingRight = '8px';
  
  // Wczytaj maszyny i statusy
  if (!machines || machines.length === 0) {
    const noMachines = document.createElement('div');
    noMachines.textContent = 'Brak maszyn do wyświetlenia';
    noMachines.style.color = '#999';
    machinesList.appendChild(noMachines);
  } else {
    const statusMap = {};
    
    // Załaduj istniejące statusy dla wybranej daty
    const loadStatusesForDate = async (date) => {
      if (!sb) return;
      try {
        const { data } = await sb
          .from('machine_status_schedule')
          .select('machine_number, status')
          .eq('date', date);
        
        statusMap = {};
        (data || []).forEach(row => {
          statusMap[row.machine_number] = row.status;
        });
        
        // Odśwież radio buttons
        machines.forEach(machine => {
          const machineRow = machinesList.querySelector(`[data-machine="${machine.number}"]`);
          if (machineRow) {
            const selected = statusMap[machine.number] || machine.status || 'Production';
            const radios = machineRow.querySelectorAll('input[type="radio"]');
            radios.forEach(r => r.checked = r.value === selected);
          }
        });
      } catch(e) {
        console.error('loadStatusesForDate error', e);
      }
    };
    
    // Wczytaj statusy przy starcie
    await loadStatusesForDate(dateInput.value);
    
    // Słuchaj zmiany daty
    dateInput.addEventListener('change', async () => {
      await loadStatusesForDate(dateInput.value);
    });
    
    // Stwórz wiersze dla każdej maszyny
    machines.forEach(machine => {
      const machineRow = document.createElement('div');
      machineRow.setAttribute('data-machine', machine.number);
      machineRow.style.display = 'flex';
      machineRow.style.alignItems = 'center';
      machineRow.style.gap = '12px';
      machineRow.style.padding = '12px';
      machineRow.style.background = '#f9f9f9';
      machineRow.style.borderRadius = '6px';
      machineRow.style.border = '1px solid #e0e0e0';
      
      const machineLabel = document.createElement('label');
      machineLabel.style.fontWeight = '600';
      machineLabel.style.minWidth = '80px';
      machineLabel.style.fontSize = '14px';
      machineLabel.textContent = `M${machine.number}`;
      machineRow.appendChild(machineLabel);
      
      const statusesDiv = document.createElement('div');
      statusesDiv.style.display = 'flex';
      statusesDiv.style.gap = '16px';
      statusesDiv.style.flex = '1';
      
      const statuses = ['Production', 'Stop', 'Maintenance'];
      const currentStatus = statusMap[machine.number] || machine.status || 'Production';
      
      statuses.forEach(status => {
        const labelWrapper = document.createElement('label');
        labelWrapper.style.display = 'flex';
        labelWrapper.style.alignItems = 'center';
        labelWrapper.style.gap = '6px';
        labelWrapper.style.cursor = 'pointer';
        labelWrapper.style.fontSize = '13px';
        
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `machine-${machine.number}`;
        radio.value = status;
        radio.checked = currentStatus === status;
        radio.style.cursor = 'pointer';
        
        const statusLabel = document.createElement('span');
        statusLabel.textContent = status;
        
        labelWrapper.appendChild(radio);
        labelWrapper.appendChild(statusLabel);
        statusesDiv.appendChild(labelWrapper);
      });
      
      machineRow.appendChild(statusesDiv);
      machinesList.appendChild(machineRow);
    });
  }
  
  box.appendChild(machinesList);
  
  // Przyciski akcji
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '8px';
  actions.style.justifyContent = 'flex-end';
  actions.style.marginTop = '12px';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Anuluj';
  cancelBtn.style.padding = '10px 16px';
  cancelBtn.style.background = '#f0f0f0';
  cancelBtn.style.border = '1px solid #ccc';
  cancelBtn.style.borderRadius = '4px';
  cancelBtn.style.cursor = 'pointer';
  cancelBtn.style.fontSize = '14px';
  cancelBtn.onclick = () => modal.remove();
  actions.appendChild(cancelBtn);
  
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Zapisz';
  saveBtn.style.padding = '10px 16px';
  saveBtn.style.background = '#ff9800';
  saveBtn.style.color = '#fff';
  saveBtn.style.border = 'none';
  saveBtn.style.borderRadius = '4px';
  saveBtn.style.cursor = 'pointer';
  saveBtn.style.fontSize = '14px';
  saveBtn.onclick = async () => {
    const selectedDate = dateInput.value;
    if (!selectedDate) {
      alert('Wybierz datę');
      return;
    }
    
    if (!sb) {
      alert('Brak połączenia z serwerem');
      return;
    }
    
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Zapisuję...';
      
      // Zbierz statusy
      const updates = [];
      machines.forEach(machine => {
        const machineRow = machinesList.querySelector(`[data-machine="${machine.number}"]`);
        if (machineRow) {
          const checked = machineRow.querySelector('input[type="radio"]:checked');
          if (checked) {
            updates.push({
              machine_number: machine.number,
              date: selectedDate,
              status: checked.value
            });
          }
        }
      });
      
      // Najpierw usuń stare statusy dla tej daty
      await sb.from('machine_status_schedule')
        .delete()
        .eq('date', selectedDate);
      
      // Potem wstaw nowe
      if (updates.length > 0) {
        const { error } = await sb.from('machine_status_schedule')
          .insert(updates);
        
        if (error) {
          throw error;
        }
      }
      
      alert('✅ Statusy zapisane dla daty ' + selectedDate);
      modal.remove();
    } catch(e) {
      console.error('Save machine status schedule error', e);
      alert('❌ Błąd: ' + e.message);
      saveBtn.disabled = false;
      saveBtn.textContent = 'Zapisz';
    }
  };
  actions.appendChild(saveBtn);
  
  box.appendChild(actions);
  modal.appendChild(box);
  modal.onclick = (e) => { if(e.target === modal) modal.remove(); };
  document.body.appendChild(modal);
}

/* -------------------- AdminMachines (bez większych zmian) -------------------- */
const AdminMachines = (function(){
  let wrapEl = null;
  let tbodyRef = null;
  let machinesCache = [];
  let _inited = false;

  const MAKER_OPTIONS = ['P100','P70'];
  const PAKER_OPTIONS = ['F550','F350','GD','GDX'];
  const CELA_OPTIONS = ['751','401'];
  const PAK_OPTIONS  = ['411','407','408','409','707'];
  const KART_OPTIONS = ['487','489'];

  function makeMuted(text){
    const d = document.createElement('div');
    d.className = 'muted';
    d.textContent = text;
    return d;
  }

  function makeSelect(options, defaultValue = '') {
    const sel = document.createElement('select');
    sel.style.padding = '8px';
    sel.style.borderRadius = '6px';
    sel.style.border = '1px solid #e6eef8';
    sel.style.minWidth = '120px';
    options.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '—' : opt;
      if (String(opt) === String(defaultValue)) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function makeField(labelText, controlEl, descText){
    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.minWidth = '120px';
    wrap.style.gap = '6px';
    wrap.style.alignItems = 'flex-start';
    const label = document.createElement('label');
    label.style.fontSize = '13px';
    label.style.fontWeight = '600';
    label.textContent = labelText;
    if(controlEl && controlEl.style) controlEl.style.width = '100%';
    wrap.appendChild(label);
    wrap.appendChild(controlEl);
    if(descText){
      const d = document.createElement('div');
      d.className = 'small-muted';
      d.style.fontSize = '12px';
      d.style.color = '#556';
      d.textContent = descText;
      wrap.appendChild(d);
    }
    return wrap;
  }

  async function saveOrderFromRows(rows) {
    if (!rows || rows.length === 0) return;
    if (!sb) {
      console.warn('Brak połączenia z serwerem — nie można zapisać kolejności.');
      return;
    }
    try {
      for (let i = 0; i < rows.length; i++) {
        const num = rows[i].dataset.number;
        if (!num) continue;
        // sequential update to avoid race
        // eslint-disable-next-line no-await-in-loop
        const { error } = await sb.from('machines').update({ ord: i+1, default_view: true }).eq('number', String(num));
        if (error) console.warn('Błąd aktualizacji ord dla', num, error);
      }
      const b = document.createElement('div');
      b.textContent = 'Zapisano kolejność';
      b.style.position = 'fixed';
      b.style.right = '14px';
      b.style.bottom = '14px';
      b.style.background = '#0b74d1';
      b.style.color = 'white';
      b.style.padding = '8px 12px';
      b.style.borderRadius = '8px';
      b.style.boxShadow = '0 6px 18px rgba(11,116,209,0.18)';
      b.style.zIndex = 21000;
      document.body.appendChild(b);
      setTimeout(()=>{ b.remove(); }, 1400);
    } catch (e) {
      console.error('saveOrderFromRows error', e);
    }
  }

  function openAddModal(){
    const existing = document.getElementById('adminAddMachineModal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminAddMachineModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.zIndex = '22000';

    const box = document.createElement('div');
    box.className = 'modal-content';
    box.style.maxWidth = '640px';
    box.style.width = '100%';
    box.style.padding = '16px';
    box.style.borderRadius = '10px';
    box.style.background = '#fff';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';

    const title = document.createElement('h3');
    title.textContent = 'Dodaj nową maszynę';
    title.style.marginTop = '0';

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr 1fr';
    grid.style.gap = '10px';
    grid.style.marginTop = '10px';

    const inpNum = document.createElement('input');
    inpNum.placeholder = 'Numer maszyny';
    inpNum.style.padding = '8px';
    inpNum.style.borderRadius = '6px';
    inpNum.style.border = '1px solid #e6eef8';

    const selMaker = makeSelect(MAKER_OPTIONS, MAKER_OPTIONS[0]);
    const selPaker = makeSelect(PAKER_OPTIONS, PAKER_OPTIONS[0]);
    const selCela = makeSelect(CELA_OPTIONS, CELA_OPTIONS[0]);
    const selPak  = makeSelect(PAK_OPTIONS, PAK_OPTIONS[0]);
    const selKart = makeSelect(KART_OPTIONS, KART_OPTIONS[0]);

    grid.appendChild(makeField('Numer', inpNum, 'Numer identyfikacyjny maszyny (np. 11, 12). *Obowiązkowe'));
    grid.appendChild(makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70. *Obowiązkowe'));
    grid.appendChild(makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX. *Obowiązkowe'));
    grid.appendChild(makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 401. *Obowiązkowe'));
    grid.appendChild(makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod z listy. *Obowiązkowe'));
    grid.appendChild(makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489. *Obowiązkowe'));

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn outline';
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.onclick = () => modal.remove();

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Zapisz';
    saveBtn.onclick = async () => {
      const num = (inpNum.value || '').trim();
      const mk = selMaker.value;
      const pk = selPaker.value;
      const cel = selCela.value;
      const pak = selPak.value;
      const kart = selKart.value;
      
      if(!num){ return await showAdminNotification('Podaj numer maszyny.', 'Błąd', '⚠️'); }
      if(!mk){ return await showAdminNotification('Wybierz Maker (Producent).', 'Błąd', '⚠️'); }
      if(!pk){ return await showAdminNotification('Wybierz Paker (Pakarkę).', 'Błąd', '⚠️'); }
      if(!cel){ return await showAdminNotification('Wybierz Celafoniarkę.', 'Błąd', '⚠️'); }
      if(!pak){ return await showAdminNotification('Wybierz Pakieciarkę.', 'Błąd', '⚠️'); }
      if(!kart){ return await showAdminNotification('Wybierz Kartoniarkę.', 'Błąd', '⚠️'); }
      
      await addMachine(num, mk, pk, cel, pak, kart);
      modal.remove();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    box.appendChild(title);
    box.appendChild(grid);
    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);
    inpNum.focus();
  }

  async function renderList(){
    if(!wrapEl) return;
    wrapEl.innerHTML = '';
    wrapEl.appendChild(makeMuted('Ładuję listę maszyn...'));
    if(!sb){ wrapEl.innerHTML=''; wrapEl.appendChild(makeMuted('Brak połączenia z serwerem (offline).')); return; }

    try{
      const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true, nullsLast: true });
      if(error) throw error;
      machinesCache = (data || []).sort((a, b) => {
        const ordA = a.ord || 9999;
        const ordB = b.ord || 9999;
        return ordA - ordB;
      });

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'space-between';
      topRow.style.alignItems = 'center';
      topRow.style.marginBottom = '10px';

      // Prefer placing the button into the section header so it lines up with the
      // main section title. If header not found, fall back to rendering topRow
      // with a title and the button.
      const machinesHeader = document.querySelector('#adminMachinesSection .admin-section-header');
      if (machinesHeader) {
        // ensure left info container exists (stack title + desc)
        let info = machinesHeader.querySelector('.section-info');
        if (!info) {
          const h = machinesHeader.querySelector('h2');
          const p = machinesHeader.querySelector('p');
          info = document.createElement('div');
          info.className = 'section-info';
          info.style.display = 'flex';
          info.style.flexDirection = 'column';
          info.style.gap = '4px';
          info.style.flex = '1';
          if (h) info.appendChild(h);
          if (p) info.appendChild(p);
          machinesHeader.insertBefore(info, machinesHeader.firstChild);
        }
        // ensure actions container exists
        let actions = machinesHeader.querySelector('.section-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'section-actions';
          actions.style.marginLeft = 'auto';
          actions.style.display = 'flex';
          actions.style.alignItems = 'center';
          actions.style.gap = '12px';
          machinesHeader.appendChild(actions);
        }
        // if button already exists, don't create another
        let addBtn = actions.querySelector('#addMachineBtn');
        if (!addBtn) {
          addBtn = document.createElement('button');
          addBtn.id = 'addMachineBtn';
          addBtn.className = 'btn';
          addBtn.textContent = 'Dodaj maszynę';
          addBtn.onclick = () => openAddModal();
          actions.appendChild(addBtn);
        }
        machinesHeader.style.display = 'flex';
        machinesHeader.style.alignItems = 'center';
        // make sure info occupies left space
        info.style.flex = '1';
        wrapEl.innerHTML = '';
        wrapEl.appendChild(topRow);
      } else {
        const sectionTitle = document.createElement('div');
        sectionTitle.textContent = 'Modyfikacja maszyn';
        sectionTitle.style.fontWeight = '700';
        sectionTitle.style.fontSize = '14px';
        sectionTitle.style.color = '#0f1724';
        sectionTitle.style.padding = '8px 0';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn';
        addBtn.textContent = 'Dodaj maszynę';
        addBtn.onclick = () => openAddModal();
        topRow.appendChild(sectionTitle);
        topRow.appendChild(addBtn);
        wrapEl.innerHTML = '';
        wrapEl.appendChild(topRow);
      }

      if(!machinesCache || machinesCache.length === 0){
        wrapEl.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'separate';
      table.style.borderSpacing = '0';
      table.style.marginTop = '6px';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr style="text-align:left; background:#f8f9fa; border-bottom:1px solid #e5e7eb;">
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px; width:36px;"></th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Numer</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Maker</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Paker</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Celafoniarka</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Pakieciarka</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Kartoniarka</th>
        <th style="padding:12px 8px; font-weight:700; color:#0f1724; font-size:14px;">Akcje</th>
      </tr>`;
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      tbodyRef = tbody;

      const placeholder = document.createElement('tr');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = '0';
      placeholder.style.background = 'rgba(96,165,250,0.06)';
      placeholder.innerHTML = `<td colspan="8" style="padding:0;border:none;"></td>`;

      machinesCache.forEach(m => {
        const tr = document.createElement('tr');
        tr.className = 'admin-machine-row';
        tr.dataset.number = m.number;
        tr.style.background = '#fff';

        const tdHandle = document.createElement('td');
        tdHandle.style.padding = '12px 8px';
        tdHandle.style.borderBottom = '1px solid #e5e7eb';
        tdHandle.style.textAlign = 'center';
        tdHandle.style.cursor = 'grab';
        const handle = document.createElement('span');
        handle.className = 'drag-handle';
        handle.title = 'Przeciągnij, aby zmienić pozycję';
        handle.style.userSelect = 'none';
        handle.style.fontSize = '16px';
        handle.style.lineHeight = '1';
        handle.textContent = '≡';
        handle.draggable = true;
        tdHandle.appendChild(handle);
        tr.appendChild(tdHandle);

        const tdNum = document.createElement('td');
        tdNum.style.padding = '12px 8px';
        tdNum.style.borderBottom = '1px solid #e5e7eb';
        tdNum.textContent = m.number || '';
        tr.appendChild(tdNum);

        const tdMaker = document.createElement('td');
        tdMaker.style.padding = '12px 8px';
        tdMaker.style.borderBottom = '1px solid #e5e7eb';
        tdMaker.textContent = m.maker || '';
        tr.appendChild(tdMaker);

        const tdPaker = document.createElement('td');
        tdPaker.style.padding = '12px 8px';
        tdPaker.style.borderBottom = '1px solid #e5e7eb';
        tdPaker.textContent = m.paker || '';
        tr.appendChild(tdPaker);

        const tdCela = document.createElement('td');
        tdCela.style.padding = '12px 8px';
        tdCela.style.borderBottom = '1px solid #e5e7eb';
        tdCela.textContent = m.celafoniarka || '';
        tr.appendChild(tdCela);

        const tdPak = document.createElement('td');
        tdPak.style.padding = '12px 8px';
        tdPak.style.borderBottom = '1px solid #e5e7eb';
        tdPak.textContent = m.pakieciarka || '';
        tr.appendChild(tdPak);

        const tdKart = document.createElement('td');
        tdKart.style.padding = '12px 8px';
        tdKart.style.borderBottom = '1px solid #e5e7eb';
        tdKart.textContent = m.kartoniarka || '';
        tr.appendChild(tdKart);

        const tdActions = document.createElement('td');
        tdActions.style.padding = '12px 8px';
        tdActions.style.borderBottom = '1px solid #e5e7eb';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.textContent = 'Edytuj';
        editBtn.onclick = () => openEditModal(m);

        tdActions.appendChild(editBtn);
        tr.appendChild(tdActions);

        handle.addEventListener('dragstart', (e) => {
          tr.classList.add('dragging');
          try { e.dataTransfer.setData('text/plain', 'drag'); } catch (err) {}
          e.dataTransfer.effectAllowed = 'move';
          const h = tr.getBoundingClientRect().height;
          placeholder.style.height = `${h}px`;
        });

        handle.addEventListener('dragend', () => {
          tr.classList.remove('dragging');
          if (tbody.contains(placeholder)) placeholder.remove();
        });

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrapEl.appendChild(table);

      function getDragAfterRow(container, y) {
        const draggableRows = [...container.querySelectorAll('tr.admin-machine-row:not(.dragging)')];
        return draggableRows.find(row => {
          const box = row.getBoundingClientRect();
          return y < box.top + box.height / 2;
        }) || null;
      }

      tbody.addEventListener('dragover', (e) => {
        e.preventDefault();
        const after = getDragAfterRow(tbody, e.clientY);
        if (after === null) {
          if (tbody.lastElementChild !== placeholder) tbody.appendChild(placeholder);
        } else {
          if (after !== placeholder) tbody.insertBefore(placeholder, after);
        }
      });

      tbody.addEventListener('drop', async (e) => {
        e.preventDefault();
        const dragging = tbody.querySelector('tr.dragging');
        if (!dragging) return;
        if (placeholder.parentElement) {
          tbody.insertBefore(dragging, placeholder);
          placeholder.remove();
        }
        tbody.querySelectorAll('tr.admin-machine-row').forEach(r => r.classList.remove('drag-over','dragging'));
        const rows = Array.from(tbody.querySelectorAll('tr.admin-machine-row'));
        await saveOrderFromRows(rows);
      });

      document.ondragend = () => {
        const dragging = tbody.querySelector('tr.dragging');
        if (dragging) dragging.classList.remove('dragging');
        if (tbody.contains(placeholder)) placeholder.remove();
      };

    }catch(e){
      console.error('AdminMachines.renderList error', e);
      wrapEl.innerHTML = '';
      wrapEl.appendChild(makeMuted('Błąd ładowania maszyn. Sprawdź konsolę.'));
    }
  }

  async function addMachine(number, maker='P100', paker='F550', celafoniarka='', pakieciarka='', kartoniarka=''){
    if(!number || !String(number).trim()) { await showAdminNotification('Podaj numer maszyny.', 'Błąd', '⚠️'); return; }
    if(!sb){ await showAdminNotification('Brak połączenia z serwerem.', 'Błąd', '❌'); return; }
    const num = String(number).trim();
    try{
      const { data: exists } = await sb.from('machines').select('number').eq('number', num).limit(1);
      if(exists && exists.length){ await showAdminNotification('Maszyna o numerze ' + num + ' już istnieje.', 'Błąd', '⚠️'); return; }
      const { data: last } = await sb.from('machines').select('ord').order('ord', { ascending:false }).limit(1).maybeSingle();
      const nextOrd = last && last.ord ? last.ord + 1 : (machinesCache.length ? (machinesCache[machinesCache.length-1].ord || machinesCache.length) + 1 : 1);
      const insertObj = { number: num, ord: nextOrd, default_view: true, status: 'Produkcja', maker, paker, celafoniarka, pakieciarka, kartoniarka };
      const { error } = await sb.from('machines').insert([insertObj]);
      if(error){ await showAdminNotification('Błąd dodawania maszyny: ' + (error.message || error), 'Błąd', '❌'); return; }
      await showAdminNotification('Dodano maszynę ' + num, 'Sukces', '✔️');
      await renderList();
    }catch(e){
      console.error('AdminMachines.addMachine error', e);
      await showAdminNotification('Błąd podczas dodawania maszyny. Sprawdź konsolę.', 'Błąd', '❌');
    }
  }

  async function deleteMachine(number){
    if(!sb){ await showAdminNotification('Brak połączenia z serwerem.', 'Błąd', '❌'); return; }
    try{
      await sb.from('assignments').delete().eq('machine_number', number);
      const { error } = await sb.from('machines').delete().eq('number', number);
      if(error){ await showAdminNotification('Błąd usuwania maszyny: ' + (error.message || error), 'Błąd', '❌'); return; }
      await showAdminNotification('Usunięto maszynę ' + number, 'Sukces', '✔️');
    }catch(e){
      console.error('AdminMachines.deleteMachine error', e);
      await showAdminNotification('Błąd podczas usuwania. Sprawdź konsolę.', 'Błąd', '❌');
    }
  }

  async function editMachine(oldNumber, newNumber, maker, paker, celafoniarka, pakieciarka, kartoniarka){
    if(!newNumber || !String(newNumber).trim()) { await showAdminNotification('Numer nie może być pusty.', 'Błąd', '⚠️'); return; }
    if(!sb){ await showAdminNotification('Brak połączenia z serwerem.', 'Błąd', '❌'); return; }
    const newNum = String(newNumber).trim();
    try{
      if(newNum !== String(oldNumber)){
        const { data: exists } = await sb.from('machines').select('number').eq('number', newNum).limit(1);
        if(exists && exists.length){ await showAdminNotification('Maszyna o numerze ' + newNum + ' już istnieje.', 'Błąd', '⚠️'); return; }
      }
      const updates = { number: newNum, maker, paker, celafoniarka, pakieciarka, kartoniarka };
      const { error } = await sb.from('machines').update(updates).eq('number', oldNumber);
      if(error){ await showAdminNotification('Błąd aktualizacji maszyny: ' + (error.message || error), 'Błąd', '❌'); return; }
      if(newNum !== String(oldNumber)){
        await sb.from('assignments').update({ machine_number: newNum }).eq('machine_number', oldNumber);
      }
      await showAdminNotification('Zaktualizowano maszynę: ' + newNum, 'Sukces', '✔️');
    }catch(e){
      console.error('AdminMachines.editMachine error', e);
      await showAdminNotification('Błąd podczas edycji maszyny. Sprawdź konsolę.', 'Błąd', '❌');
    }
  }

  function openEditModal(machine){
    let existing = document.getElementById('adminEditMachineModal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'adminEditMachineModal';
    modal.className = 'modal';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.background = 'rgba(0,0,0,0.45)';
    modal.style.zIndex = '22000';

    const box = document.createElement('div');
    box.className = 'modal-content';
    box.style.maxWidth = '520px';
    box.style.width = '100%';
    box.style.padding = '14px';
    box.style.borderRadius = '10px';
    box.style.background = '#fff';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';

    const title = document.createElement('h3');
    title.textContent = `Edytuj maszynę ${machine.number}`;
    title.style.marginTop = '0';

    const selMaker = makeSelect(MAKER_OPTIONS, machine.maker || MAKER_OPTIONS[0]);
    const selPaker = makeSelect(PAKER_OPTIONS, machine.paker || PAKER_OPTIONS[0]);
    const selCela = makeSelect(CELA_OPTIONS, machine.celafoniarka || CELA_OPTIONS[0]);
    const selPak  = makeSelect(PAK_OPTIONS, machine.pakieciarka || PAK_OPTIONS[0]);
    const selKart = makeSelect(KART_OPTIONS, machine.kartoniarka || KART_OPTIONS[0]);

    const inpOld = document.createElement('input');
    inpOld.type = 'text';
    inpOld.value = machine.number || '';
    inpOld.placeholder = 'Numer maszyny';
    inpOld.style.padding = '8px';
    inpOld.style.border = '1px solid #e6eef8';
    inpOld.style.borderRadius = '6px';

    const leftCol = document.createElement('div');
    leftCol.style.display = 'flex';
    leftCol.style.flexDirection = 'column';
    leftCol.style.gap = '8px';
    leftCol.appendChild(makeField('Numer', inpOld, 'Numer identyfikacyjny maszyny (np. 11, 12). *Obowiązkowe'));
    leftCol.appendChild(makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70. *Obowiązkowe'));
    leftCol.appendChild(makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX. *Obowiązkowe'));

    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = '8px';
    rightCol.appendChild(makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 401. *Obowiązkowe'));
    rightCol.appendChild(makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod z listy. *Obowiązkowe'));
    rightCol.appendChild(makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489. *Obowiązkowe'));

    const cols = document.createElement('div');
    cols.style.display = 'flex';
    cols.style.gap = '12px';
    cols.appendChild(leftCol);
    cols.appendChild(rightCol);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    // Delete button moved from table row into modal
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.textContent = 'Usuń maszynę';
    deleteBtn.onclick = async () => {
      if(!await showConfirmModal(`Na pewno usunąć maszynę ${machine.number}?`, 'Usunąć maszynę')) return;
      modal.remove();
      await deleteMachine(machine.number);
      await renderList();
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn outline';
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.onclick = () => { modal.remove(); };

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Zapisz';
    saveBtn.onclick = async () => {
      const newNum = inpOld.value.trim();
      const mk = selMaker.value;
      const pk = selPaker.value;
      const cel = selCela.value;
      const pak = selPak.value;
      const kart = selKart.value;
      
      if(!newNum){ return await showAdminNotification('Numer nie może być pusty.', 'Błąd', '⚠️'); }
      if(!mk){ return await showAdminNotification('Wybierz Maker (Producent).', 'Błąd', '⚠️'); }
      if(!pk){ return await showAdminNotification('Wybierz Paker (Pakarkę).', 'Błąd', '⚠️'); }
      if(!cel){ return await showAdminNotification('Wybierz Celafoniarkę.', 'Błąd', '⚠️'); }
      if(!pak){ return await showAdminNotification('Wybierz Pakieciarkę.', 'Błąd', '⚠️'); }
      if(!kart){ return await showAdminNotification('Wybierz Kartoniarkę.', 'Błąd', '⚠️'); }
      
      await editMachine(machine.number, newNum, mk, pk, cel, pak, kart);
      modal.remove();
      await renderList();
    };

    // order: delete, cancel, save
    actions.appendChild(deleteBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    box.appendChild(title);
    box.appendChild(cols);
    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function refreshOrderViewSafe(){ return Promise.resolve(); }

  async function init(){
    const doInit = async () => {
      if(_inited){
        try { await renderList(); } catch(e){}
        return;
      }
      wrapEl = document.getElementById('adminMachinesApp');
      try { await renderList(); } catch(e){ console.warn(e); }
      _inited = true;
    };

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', doInit, { once:true });
    } else {
      doInit();
    }
  }

  return {
    init,
    renderList,
    addMachine,
    deleteMachine,
    editMachine,
    refreshOrderView: refreshOrderViewSafe
  };
})(); // koniec AdminMachines

/* -------------------- AdminEmployees (z chipami i bez wcześniejszych filtrów uprawnień) -------------------- */
const AdminEmployees = (function(){
  let wrap = null;      // element do renderowania listy
  let cache = [];       // pobrane dane pracowników (znormalizowane)

  /* ---- fetchEmployees: pobiera tylko firstname,surname,bu,roles,permissions,mechanical_permissions,id ---- */
  async function fetchEmployees(){
    const wrapEl = document.getElementById('adminEmployeesApp');
    try {
      if(!sb){
        console.warn('fetchEmployees: sb (Supabase client) is NULL — offline mode');
        cache = [];
        return;
      }

      const { data, error, status } = await sb.from('employees')
        .select('id,firstname,surname,bu,roles,permissions,mechanical_permissions,manager_id')
        .order('surname', { ascending: true });

      console.debug('fetchEmployees: response status=', status, 'error=', error ? error.message : null);
      if(error){
        console.warn('fetchEmployees error', error);
        cache = [];
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      
      // Załaduj kierowników
      let managersMap = new Map();
      try {
        if(sb) {
          const { data: managersData, error: managersError } = await sb.from('managers').select('id,surname,name,firstname');
          if(!managersError && managersData) {
            managersData.forEach(m => {
              const managerName = `${m.surname || ''} ${m.name || m.firstname || ''}`.trim();
              managersMap.set(m.id, managerName);
            });
          }
        }
      } catch(e) {
        console.warn('Error loading managers:', e);
      }

      cache = rows.map(e => ({
        id: e.id,
        firstname: e.firstname || '',
        surname: e.surname || '',
        legacy_name: '',
        bu: e.bu || '',
        manager_id: e.manager_id || null,
        managerName: e.manager_id ? managersMap.get(e.manager_id) || 'Nieznany' : null,
        roles: Array.isArray(e.roles) ? e.roles : (e.roles ? String(e.roles).split(',').map(s=>s.trim()).filter(Boolean) : []),
        permissions: Array.isArray(e.permissions) ? e.permissions : (e.permissions ? String(e.permissions).split(',').map(s=>s.trim()).filter(Boolean) : []),
        mechanical_permissions: Array.isArray(e.mechanical_permissions) ? e.mechanical_permissions : (e.mechanical_permissions ? String(e.mechanical_permissions).split(',').map(s=>s.trim()).filter(Boolean) : [])
      }));

      console.info(`fetchEmployees: loaded ${cache.length} rows; with names: ${cache.filter(x => x.firstname || x.surname).length}`);
    } catch (err) {
      console.error('fetchEmployees exception', err);
      cache = [];
    }
  }

  /* Tworzy wiersz pracownika (z nagłówkami powyżej) */
  function makeRow(emp){
    const row = document.createElement('div');
    row.className = 'admin-emp-row';
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.borderBottom = '1px solid rgba(0,0,0,0.05)';
    row.style.fontSize = '14px';

    // Nazwisko + Imię (pełne)
    const nameCol = document.createElement('div');
    nameCol.style.flex = '2';
    nameCol.style.fontWeight = '600';
    nameCol.textContent = `${emp.surname || ''} ${emp.firstname || ''}`.trim() || '—';

    // BU
    const buCol = document.createElement('div');
    buCol.style.flex = '0 0 80px';
    buCol.style.textAlign = 'center';
    buCol.textContent = emp.bu || '';

    // Kierownik
    const managerCol = document.createElement('div');
    managerCol.style.flex = '1.5';
    managerCol.textContent = emp.manager_id ? emp.managerName || 'Ładuję...' : '—';

    // Role
    const rolesCol = document.createElement('div');
    rolesCol.style.flex = '2';
    rolesCol.textContent = Array.isArray(emp.roles) ? emp.roles.map(r => getDisplayRoleName(r)).join(', ') : '';

    // Uprawnienia (permissions)
    const permsCol = document.createElement('div');
    permsCol.style.flex = '2';
    permsCol.style.whiteSpace = 'nowrap';
    permsCol.style.overflow = 'hidden';
    permsCol.style.textOverflow = 'ellipsis';
    permsCol.title = Array.isArray(emp.permissions) ? emp.permissions.join(', ') : '';
    permsCol.textContent = Array.isArray(emp.permissions) ? emp.permissions.join(', ') : '';

    // Akcje -> tylko Edytuj (usunąłem modal Uprawnienia)
    const actionsCol = document.createElement('div');
    actionsCol.style.flex = '0 0 120px';
    actionsCol.style.textAlign = 'right';
    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost small';
    editBtn.textContent = 'Edytuj';
    editBtn.onclick = async () => {
      // find full record from cache (to get roles array / perms array)
      const full = cache.find(c => c.id === emp.id) || emp;
      openEditEmployeeModal(full);
    };
    actionsCol.appendChild(editBtn);

    [nameCol, buCol, managerCol, rolesCol, permsCol, actionsCol].forEach(c => row.appendChild(c));
    return row;
  }

  /* -------------------- Modal edycji pracownika -------------------- */
  function openEditEmployeeModal(emp){
    const existing = document.getElementById('empEditModal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'empEditModal';
    modal.className = 'modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = 29000;

    const box = document.createElement('div');
    box.style.width = '560px';
    box.style.maxWidth = '94%';
    box.style.background = '#fff';
    box.style.borderRadius = '10px';
    box.style.padding = '14px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    box.style.boxSizing = 'border-box';

    const title = document.createElement('h3');
    title.textContent = `Edytuj pracownika — ${emp.surname || emp.firstname || ''}`;
    title.style.marginTop = '0';
    box.appendChild(title);

    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.style.marginBottom = '8px';
    hint.textContent = 'Uzupełnij pola. Role możesz wybrać wiele (Ctrl/Cmd+klik). Uprawnienia wybierz z checkboxów (poniżej).';
    box.appendChild(hint);

    // GRID: nazwisko / imię
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';

    // surname
    const wrapSurname = document.createElement('div');
    const labSurname = document.createElement('label');
    labSurname.textContent = 'Nazwisko (surname)';
    labSurname.style.fontWeight = '600';
    labSurname.style.display = 'block';
    labSurname.style.marginBottom = '6px';
    const inpSurname = document.createElement('input');
    inpSurname.type = 'text';
    inpSurname.value = emp.surname || '';
    inpSurname.placeholder = 'Nazwisko';
    inpSurname.style.padding = '8px';
    inpSurname.style.border = '1px solid #e6eef8';
    inpSurname.style.borderRadius = '6px';
    inpSurname.style.width = '100%';
    wrapSurname.appendChild(labSurname);
    wrapSurname.appendChild(inpSurname);
    grid.appendChild(wrapSurname);

    // firstname
    const wrapFirstname = document.createElement('div');
    const labFirstname = document.createElement('label');
    labFirstname.textContent = 'Imię (firstname)';
    labFirstname.style.fontWeight = '600';
    labFirstname.style.display = 'block';
    labFirstname.style.marginBottom = '6px';
    const inpFirstname = document.createElement('input');
    inpFirstname.type = 'text';
    inpFirstname.value = emp.firstname || '';
    inpFirstname.placeholder = 'Imię';
    inpFirstname.style.padding = '8px';
    inpFirstname.style.border = '1px solid #e6eef8';
    inpFirstname.style.borderRadius = '6px';
    inpFirstname.style.width = '100%';
    wrapFirstname.appendChild(labFirstname);
    wrapFirstname.appendChild(inpFirstname);
    grid.appendChild(wrapFirstname);

    // BU select (pełna szerokość - nowy wiersz)
    const wrapBu = document.createElement('div');
    wrapBu.style.gridColumn = '1 / -1';
    const labBu = document.createElement('label');
    labBu.textContent = 'BU';
    labBu.style.fontWeight = '600';
    labBu.style.display = 'block';
    labBu.style.marginBottom = '6px';
    const selBu = document.createElement('select');
    selBu.style.padding = '8px';
    selBu.style.border = '1px solid #e6eef8';
    selBu.style.borderRadius = '6px';
    selBu.style.width = '200px';
    BU_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt === '' ? '— wybierz —' : opt;
      if(String(opt) === String(emp.bu || '')) o.selected = true;
      selBu.appendChild(o);
    });
    wrapBu.appendChild(labBu);
    wrapBu.appendChild(selBu);
    grid.appendChild(wrapBu);

    // Role multi-select
    const wrapRoles = document.createElement('div');
    wrapRoles.style.gridColumn = '1 / -1';
    const labRoles = document.createElement('label');
    labRoles.textContent = 'Role (wybierz jedną lub więcej)';
    labRoles.style.fontWeight = '600';
    labRoles.style.display = 'block';
    labRoles.style.marginBottom = '6px';
    const selRoles = document.createElement('select');
    selRoles.multiple = true;
    selRoles.size = Math.min(6, ROLE_OPTIONS.length);
    selRoles.style.padding = '6px';
    selRoles.style.border = '1px solid #e6eef8';
    selRoles.style.borderRadius = '6px';
    selRoles.style.width = '100%';
    const existingRoles = Array.isArray(emp.roles) ? emp.roles : [];
    ROLE_OPTIONS.forEach(r => {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = getDisplayRoleName(r);
      if(existingRoles.includes(r)) o.selected = true;
      selRoles.appendChild(o);
    });
    wrapRoles.appendChild(labRoles);
    wrapRoles.appendChild(selRoles);
    grid.appendChild(wrapRoles);

    box.appendChild(grid);

    // Uprawnienia: checkboxy grupowane w kolumny
    const permsLabel = document.createElement('div');
    permsLabel.textContent = 'Uprawnienia (zaznacz dostępne maszyny)';
    permsLabel.style.fontWeight = '600';
    permsLabel.style.marginTop = '10px';
    box.appendChild(permsLabel);

    const permGrid = document.createElement('div');
    permGrid.style.display = 'grid';
    permGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    permGrid.style.gap = '6px';
    permGrid.style.marginTop = '6px';
    const currPerms = Array.isArray(emp.permissions) ? emp.permissions.map(p=>String(p).trim()) : (emp.permissions ? String(emp.permissions).split(',').map(s=>s.trim()) : []);

    PERMISSION_OPTIONS.forEach(code => {
      const cbWrap = document.createElement('label');
      cbWrap.style.display = 'flex';
      cbWrap.style.alignItems = 'center';
      cbWrap.style.gap = '8px';
      cbWrap.style.padding = '6px';
      cbWrap.style.borderRadius = '6px';
      cbWrap.style.cursor = 'pointer';
      cbWrap.style.userSelect = 'none';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = code;
      if(currPerms.includes(code)) cb.checked = true;
      cb.dataset.perm = code;

      const span = document.createElement('span');
      span.textContent = code;
      span.style.fontSize = '13px';

      cbWrap.appendChild(cb);
      cbWrap.appendChild(span);
      permGrid.appendChild(cbWrap);
    });

    box.appendChild(permGrid);

    // ========== SEKCJA UPRAWNIEŃ MECHANICZNYCH ==========
    const isMechanic = existingRoles.includes('mechanik_focke') || existingRoles.includes('mechanik_protos') || existingRoles.includes('senior_focke') || existingRoles.includes('senior_protos') || existingRoles.includes('operator_focke') || existingRoles.includes('operator_protos');

    const mechanicalSection = document.createElement('div');
    mechanicalSection.id = 'mechanicalSection';
    mechanicalSection.style.display = isMechanic ? 'block' : 'none';
    mechanicalSection.style.marginTop = '12px';
    mechanicalSection.style.padding = '12px';
    mechanicalSection.style.background = '#f5f9ff';
    mechanicalSection.style.borderRadius = '8px';
    mechanicalSection.style.border = '1px solid #d6e5ff';

    const mechLabel = document.createElement('div');
    mechLabel.textContent = 'Uprawnienia mechaniczne — maszyny które może obsługiwać';
    mechLabel.style.fontWeight = '600';
    mechLabel.style.marginBottom = '8px';
    mechanicalSection.appendChild(mechLabel);

    const mechGrid = document.createElement('div');
    mechGrid.style.display = 'grid';
    mechGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    mechGrid.style.gap = '8px';

    const currMechPerms = Array.isArray(emp.mechanical_permissions) ? emp.mechanical_permissions : [];

    PERMISSION_OPTIONS.forEach(code => {
      const cbWrap = document.createElement('label');
      cbWrap.style.display = 'flex';
      cbWrap.style.alignItems = 'center';
      cbWrap.style.gap = '6px';
      cbWrap.style.cursor = 'pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = code;
      cb.dataset.mechperm = code;
      if(currMechPerms.includes(code)) cb.checked = true;

      const span = document.createElement('span');
      span.textContent = code;
      span.style.fontSize = '13px';

      cbWrap.appendChild(cb);
      cbWrap.appendChild(span);
      mechGrid.appendChild(cbWrap);
    });

    mechanicalSection.appendChild(mechGrid);
    box.appendChild(mechanicalSection);

    // obsługa zmian roli — pokaż/ukryj sekcję mechaniczną
    selRoles.addEventListener('change', () => {
      const selectedRoles = Array.from(selRoles.selectedOptions).map(o => o.value);
      const isMech = selectedRoles.includes('mechanik_focke') || selectedRoles.includes('mechanik_protos') || selectedRoles.includes('senior_focke') || selectedRoles.includes('senior_protos') || selectedRoles.includes('operator_focke') || selectedRoles.includes('operator_protos');
      mechanicalSection.style.display = isMech ? 'block' : 'none';
    });

    // action buttons
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    // Delete employee button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn danger';
    deleteBtn.textContent = 'Usuń pracownika';
    deleteBtn.onclick = async () => {
      if(!await showConfirmModal(`Na pewno usunąć pracownika ${emp.surname || emp.firstname || emp.id}?`, 'Usunąć pracownika')) return;
      modal.remove();
      await deleteEmployee(emp.id);
      try { await renderList(); } catch(e){ console.warn(e); }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn outline';
    cancelBtn.textContent = 'Anuluj';
    cancelBtn.onclick = () => { modal.remove(); };
    actions.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Zapisz';
    saveBtn.onclick = async () => {
      // zbierz role (multi-select)
      const selectedRoles = Array.from(selRoles.selectedOptions).map(o => o.value).filter(Boolean);
      // zbierz permissions z checkboxów
      const checkedPerms = Array.from(permGrid.querySelectorAll('input[type="checkbox"]'))
        .filter(i => i.checked).map(i => i.value);
      
      // zbierz maszyny mechaniczne
      const mechPerms = Array.from(mechanicalSection.querySelectorAll('input[data-mechperm]'))
        .filter(i => i.checked).map(i => i.value);

      const surname = (inpSurname.value || '').trim();
      const firstname = (inpFirstname.value || '').trim();
      const bu = (selBu.value || '').trim();

      // Walidacja obowiązkowych pól
      if(!surname){ return await showAdminNotification('Nazwisko jest obowiązkowe.', 'Błąd', '⚠️'); }
      if(!firstname){ return await showAdminNotification('Imię jest obowiązkowe.', 'Błąd', '⚠️'); }
      if(!bu){ return await showAdminNotification('Wybierz BU (Business Unit).', 'Błąd', '⚠️'); }
      if(selectedRoles.length === 0){ return await showAdminNotification('Wybierz przynajmniej jedną rolę.', 'Błąd', '⚠️'); }
      if(checkedPerms.length === 0){ return await showAdminNotification('Przydziel przynajmniej jedno uprawnienie.', 'Błąd', '⚠️'); }

      const updates = {
        surname: surname,
        firstname: firstname,
        bu: bu,
        roles: selectedRoles,
        permissions: checkedPerms,
        mechanical_permissions: mechPerms
      };

      try {
        await saveEmployeeChanges(emp.id, updates);
        modal.remove();
        try { await renderList(); } catch(e){ console.warn(e); }
      } catch (e) {
        console.error('Błąd zapisu pracownika z modala:', e);
        await showAdminNotification('Błąd podczas zapisu — sprawdź konsolę.', 'Błąd', '❌');
      }
    };
    // order: delete, cancel, save
    actions.appendChild(deleteBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);

    // zamknij modal przy kliknięciu tła
    modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });
  }

  /* zapis zmian pracownika */
  async function saveEmployeeChanges(empId, updates){
    if(sb){
      try{
        function makeShortName(surname, firstname){
          const s = (surname || '').toString().trim();
          const f = (firstname || '').toString().trim();
          if(!s) return '';
          if(!f) return s;
          const firstTwo = f.slice(0,2);
          const a = firstTwo.charAt(0).toUpperCase();
          const b = firstTwo.charAt(1) ? firstTwo.charAt(1).toLowerCase() : '';
          return `${s} ${a}${b}.`;
        }

        const payload = {
          surname: updates.surname,
          firstname: updates.firstname,
          short_name: makeShortName(updates.surname, updates.firstname),
          bu: updates.bu,
          roles: updates.roles, // as array/text[] type
          permissions: updates.permissions,
          mechanical_permissions: (updates.mechanical_permissions && Array.isArray(updates.mechanical_permissions)) 
            ? updates.mechanical_permissions.join(',')  // Konwertuj tablicę na string
            : (updates.mechanical_permissions || '')
        };
        const { error } = await sb.from('employees').update(payload).eq('id', empId);
        if(error){ await showAdminNotification('Błąd zapisu: ' + (error.message || error), 'Błąd', '❌'); console.error(error); return; }
        const idx = cache.findIndex(x => x.id === empId);
        if(idx > -1) cache[idx] = Object.assign({}, cache[idx], payload);
        await showAdminNotification('Zapisano zmiany.', 'Sukces', '✔️');
      }catch(e){
        console.error('saveEmployeeChanges error', e);
        await showAdminNotification('Błąd podczas zapisu. Sprawdź konsolę.', 'Błąd', '❌');
      }
    } else {
      // offline - update lokalnie
      const idx = cache.findIndex(x => x.id === empId);
      if(idx > -1){
        cache[idx] = Object.assign({}, cache[idx], {
          surname: updates.surname,
          firstname: updates.firstname,
          bu: updates.bu,
          roles: updates.roles,
          permissions: updates.permissions
        });
        await showAdminNotification('Zapisano lokalnie (offline).', 'Sukces', '✔️');
      } else {
        await showAdminNotification('Nie znaleziono pracownika w pamięci lokalnej.', 'Błąd', '❌');
      }
    }
  }

  // Dodaj nowego pracownika
  async function addEmployee(payload){
    if(!sb){ await showAdminNotification('Brak połączenia z serwerem.', 'Błąd', '❌'); return; }
    try{
      const insertObj = {
        firstname: payload.firstname || '',
        surname: payload.surname || '',
        bu: payload.bu || '',
        roles: Array.isArray(payload.roles) ? payload.roles : (payload.roles ? [payload.roles] : []),
        permissions: Array.isArray(payload.permissions) ? payload.permissions : (payload.permissions ? payload.permissions.split(',').map(s=>s.trim()) : []),
        mechanical_permissions: Array.isArray(payload.mechanical_permissions) ? payload.mechanical_permissions : (payload.mechanical_permissions ? payload.mechanical_permissions.split(',').map(s=>s.trim()) : [])
      };
      // create short_name like: "Surname Fi." (first two letters of firstname, dot)
      (function setShort(){
        const s = (insertObj.surname || '').toString().trim();
        const f = (insertObj.firstname || '').toString().trim();
        if(!s){ insertObj.short_name = f ? (f.slice(0,2).charAt(0).toUpperCase() + (f.slice(0,2).charAt(1) ? f.slice(0,2).charAt(1).toLowerCase() : '') + '.') : ''; return; }
        if(!f){ insertObj.short_name = s; return; }
        const firstTwo = f.slice(0,2);
        const a = firstTwo.charAt(0).toUpperCase();
        const b = firstTwo.charAt(1) ? firstTwo.charAt(1).toLowerCase() : '';
        insertObj.short_name = `${s} ${a}${b}.`;
      })();
      const { error } = await sb.from('employees').insert([insertObj]);
      if(error){ await showAdminNotification('Błąd dodawania pracownika: ' + (error.message || error), 'Błąd', '❌'); return; }
      // refresh local cache
      await fetchEmployees();
      try { await renderList(); } catch(e){ }
      await showAdminNotification('Dodano pracownika.', 'Sukces', '✔️');
    }catch(e){
      console.error('addEmployee error', e);
      await showAdminNotification('Błąd podczas dodawania pracownika. Sprawdź konsolę.', 'Błąd', '❌');
    }
  }

  // Usuń pracownika (usuwa powiązania i sam rekord)
  async function deleteEmployee(empId){
    if(!sb){ await showAdminNotification('Brak połączenia z serwerem.', 'Błąd', '❌'); return; }
    try{
      try { await sb.from('assignments').delete().eq('employee_id', empId); } catch(e) { /* ignore */ }
      const { error } = await sb.from('employees').delete().eq('id', empId);
      if(error){ await showAdminNotification('Błąd usuwania pracownika: ' + (error.message || error), 'Błąd', '❌'); return; }
      // remove from local cache
      const idx = cache.findIndex(x => x.id === empId);
      if(idx > -1) cache.splice(idx, 1);
      await showAdminNotification('Usunięto pracownika.', 'Sukces', '✔️');
    }catch(e){
      console.error('deleteEmployee error', e);
      await showAdminNotification('Błąd podczas usuwania. Sprawdź konsolę.', 'Błąd', '❌');
    }
  }

  function openAddEmployeeModal(){
    const existing = document.getElementById('empAddModal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'empAddModal';
    modal.className = 'modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = 29000;

    const box = document.createElement('div');
    box.style.width = '560px';
    box.style.maxWidth = '94%';
    box.style.background = '#fff';
    box.style.borderRadius = '10px';
    box.style.padding = '14px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    box.style.boxSizing = 'border-box';

    const title = document.createElement('h3');
    title.textContent = 'Dodaj pracownika';
    title.style.marginTop = '0';
    box.appendChild(title);

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '10px';

    const inpSurname = document.createElement('input');
    inpSurname.placeholder = 'Nazwisko';
    inpSurname.style.padding = '8px';
    inpSurname.style.border = '1px solid #e6eef8';
    inpSurname.style.borderRadius = '6px';
    const inpFirstname = document.createElement('input');
    inpFirstname.placeholder = 'Imię';
    inpFirstname.style.padding = '8px';
    inpFirstname.style.border = '1px solid #e6eef8';
    inpFirstname.style.borderRadius = '6px';

    const wrapSurname = document.createElement('div');
    const labSurname = document.createElement('label'); labSurname.textContent = 'Nazwisko'; labSurname.style.display='block'; labSurname.style.fontWeight='600'; labSurname.style.marginBottom='6px';
    wrapSurname.appendChild(labSurname); wrapSurname.appendChild(inpSurname);
    const wrapFirstname = document.createElement('div');
    const labFirstname = document.createElement('label'); labFirstname.textContent = 'Imię'; labFirstname.style.display='block'; labFirstname.style.fontWeight='600'; labFirstname.style.marginBottom='6px';
    wrapFirstname.appendChild(labFirstname); wrapFirstname.appendChild(inpFirstname);
    grid.appendChild(wrapSurname); grid.appendChild(wrapFirstname);

    // BU select
    const wrapBu = document.createElement('div'); wrapBu.style.gridColumn='1 / -1';
    const labBu = document.createElement('label'); labBu.textContent='BU'; labBu.style.display='block'; labBu.style.fontWeight='600'; labBu.style.marginBottom='6px';
    const selBu = document.createElement('select'); selBu.style.padding='8px'; selBu.style.border='1px solid #e6eef8'; selBu.style.borderRadius='6px'; selBu.style.width='200px';
    BU_OPTIONS.forEach(opt => { const o = document.createElement('option'); o.value=opt; o.textContent = opt===''?'— wybierz —':opt; selBu.appendChild(o); });
    wrapBu.appendChild(labBu); wrapBu.appendChild(selBu);
    grid.appendChild(wrapBu);

    box.appendChild(grid);

    // roles multi-select
    const labRoles = document.createElement('label'); labRoles.textContent='Role (wybierz jedną lub więcej)'; labRoles.style.display='block'; labRoles.style.fontWeight='600'; labRoles.style.marginTop='10px';
    const selRoles = document.createElement('select'); selRoles.multiple=true; selRoles.size = Math.min(6, ROLE_OPTIONS.length); selRoles.style.width='100%'; selRoles.style.padding='6px'; selRoles.style.border='1px solid #e6eef8'; selRoles.style.borderRadius='6px';
    ROLE_OPTIONS.forEach(r => { const o = document.createElement('option'); o.value = r; o.textContent = getDisplayRoleName(r); selRoles.appendChild(o); });
    box.appendChild(labRoles); box.appendChild(selRoles);

    // permissions checkboxes
    const permsLabel = document.createElement('div'); permsLabel.textContent = 'Uprawnienia'; permsLabel.style.fontWeight='600'; permsLabel.style.marginTop='10px'; box.appendChild(permsLabel);
    const permGrid = document.createElement('div'); permGrid.style.display='grid'; permGrid.style.gridTemplateColumns='repeat(2,1fr)'; permGrid.style.gap='6px'; permGrid.style.marginTop='6px';
    PERMISSION_OPTIONS.forEach(code => {
      const cbWrap = document.createElement('label'); cbWrap.style.display='flex'; cbWrap.style.alignItems='center'; cbWrap.style.gap='8px'; cbWrap.style.padding='6px'; cbWrap.style.cursor='pointer';
      const cb = document.createElement('input'); cb.type='checkbox'; cb.value = code; const span = document.createElement('span'); span.textContent = code; span.style.fontSize='13px'; cbWrap.appendChild(cb); cbWrap.appendChild(span); permGrid.appendChild(cbWrap);
    });
    box.appendChild(permGrid);

    // ========== SEKCJA UPRAWNIEŃ MECHANICZNYCH (DODAWANIE) ==========
    const mechanicalSection = document.createElement('div');
    mechanicalSection.id = 'mechanicalSectionAdd';
    mechanicalSection.style.display = 'none';
    mechanicalSection.style.marginTop = '12px';
    mechanicalSection.style.padding = '12px';
    mechanicalSection.style.background = '#f5f9ff';
    mechanicalSection.style.borderRadius = '8px';
    mechanicalSection.style.border = '1px solid #d6e5ff';

    const mechLabel = document.createElement('div');
    mechLabel.textContent = 'Uprawnienia mechaniczne — typy maszyn które może obsługiwać';
    mechLabel.style.fontWeight = '600';
    mechLabel.style.marginBottom = '8px';
    mechanicalSection.appendChild(mechLabel);

    const mechGrid = document.createElement('div');
    mechGrid.style.display = 'grid';
    mechGrid.style.gridTemplateColumns = 'repeat(2, 1fr)';
    mechGrid.style.gap = '8px';

    PERMISSION_OPTIONS.forEach(code => {
      const cbWrap = document.createElement('label');
      cbWrap.style.display = 'flex';
      cbWrap.style.alignItems = 'center';
      cbWrap.style.gap = '6px';
      cbWrap.style.cursor = 'pointer';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = code;
      cb.dataset.mechperm = code;

      const span = document.createElement('span');
      span.textContent = code;
      span.style.fontSize = '13px';

      cbWrap.appendChild(cb);
      cbWrap.appendChild(span);
      mechGrid.appendChild(cbWrap);
    });

    mechanicalSection.appendChild(mechGrid);
    box.appendChild(mechanicalSection);

    // obsługa zmian roli — pokaż/ukryj sekcję mechaniczną
    selRoles.addEventListener('change', () => {
      const selectedRoles = Array.from(selRoles.selectedOptions).map(o => o.value);
      const isMechanic = selectedRoles.includes('mechanik_focke') || selectedRoles.includes('mechanik_protos') || selectedRoles.includes('senior_focke') || selectedRoles.includes('senior_protos') || selectedRoles.includes('operator_focke') || selectedRoles.includes('operator_protos');
      mechanicalSection.style.display = isMechanic ? 'block' : 'none';
    });

    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px'; actions.style.marginTop='12px';
    const cancelBtn = document.createElement('button'); cancelBtn.className='btn outline'; cancelBtn.textContent='Anuluj'; cancelBtn.onclick = () => modal.remove();
    const addBtn = document.createElement('button'); addBtn.className='btn'; addBtn.textContent='Dodaj';
    addBtn.onclick = async () => {
      const selectedRoles = Array.from(selRoles.selectedOptions).map(o=>o.value).filter(Boolean);
      const mechPerms = Array.from(mechanicalSection.querySelectorAll('input[data-mechperm]'))
        .filter(i => i.checked).map(i => i.value);
      const selectedPerms = Array.from(permGrid.querySelectorAll('input[type="checkbox"]')).filter(i=>i.checked).map(i=>i.value);

      const surname = (inpSurname.value||'').trim();
      const firstname = (inpFirstname.value||'').trim();
      const bu = (selBu.value||'').trim();

      // Walidacja obowiązkowych pól
      if(!surname){ return await showAdminNotification('Nazwisko jest obowiązkowe.', 'Błąd', '⚠️'); }
      if(!firstname){ return await showAdminNotification('Imię jest obowiązkowe.', 'Błąd', '⚠️'); }
      if(!bu){ return await showAdminNotification('Wybierz BU (Business Unit).', 'Błąd', '⚠️'); }
      if(selectedRoles.length === 0){ return await showAdminNotification('Wybierz przynajmniej jedną rolę.', 'Błąd', '⚠️'); }
      if(selectedPerms.length === 0){ return await showAdminNotification('Przydziel przynajmniej jedno uprawnienie.', 'Błąd', '⚠️'); }

      const payload = {
        surname: surname,
        firstname: firstname,
        bu: bu,
        roles: selectedRoles,
        permissions: selectedPerms,
        mechanical_permissions: mechPerms
      };
      
      await addEmployee(payload);
      modal.remove();
    };
    actions.appendChild(cancelBtn); actions.appendChild(addBtn);
    box.appendChild(actions);
    modal.appendChild(box); document.body.appendChild(modal);
  }

  // ----------------------------
  // Filtry uprawnień — chipy (JS)
  // ----------------------------
  // stan wybranych uprawnień (Set dla szybkich operacji)
  const selectedPermFilters = new Set();
  const selectedBuFilters = new Set();
  const selectedRoleFilters = new Set();
  const selectedManagerFilters = new Set();

  // domyślna lista możliwych uprawnień (daj znać jeśli chcesz rozszerzyć)
  const DEFAULT_PERM_OPTIONS = PERMISSION_OPTIONS.slice();

  function safeLog(...args){
    try { console.log(...args); } catch(e){}
  }

  // renderuje chipy w #permChips
  function renderPermChips(){
    const chipsWrap = document.getElementById('permChips');
    if(!chipsWrap) return;
    chipsWrap.innerHTML = '';
    if(selectedPermFilters.size === 0){
      const m = document.createElement('div');
      m.className = 'muted';
      m.textContent = 'Brak aktywnych filtrów uprawnień';
      chipsWrap.appendChild(m);
      return;
    }
    Array.from(selectedPermFilters).forEach(p=>{
      const chip = document.createElement('div');
      chip.className = 'perm-chip';
      chip.setAttribute('data-perm', p);
      chip.textContent = p;
      const x = document.createElement('span');
      x.className = 'chip-x';
      x.title = 'Usuń';
      x.textContent = '×';
      x.onclick = (ev) => {
        ev.stopPropagation();
        removePermFilter(p);
      };
      chip.appendChild(x);
      chipsWrap.appendChild(chip);
    });
  }

  function addPermFilter(perm){
    if(!perm || !String(perm).trim()) return;
    const v = String(perm).trim();
    if(selectedPermFilters.has(v)) return;
    selectedPermFilters.add(v);
    renderPermChips();
    try { renderList(); } catch(e){ safeLog('renderList error after addPermFilter', e); }
  }

  function removePermFilter(perm){
    if(!perm) return;
    selectedPermFilters.delete(String(perm));
    renderPermChips();
    try { renderList(); } catch(e){ safeLog('renderList error after removePermFilter', e); }
  }

  function clearPermFilters(){
    selectedPermFilters.clear();
    renderPermChips();
    try { renderList(); } catch(e){ safeLog('renderList error after clearPermFilters', e); }
  }

  // wypełnia UI select opcji perms (jeśli chcesz użyć selecta obok chipów)
  function populatePermOptions(){
    const sel = document.getElementById('permOptions');
    if(!sel) return;
    // jeśli select ma tylko jedną opcję (placeholder) — wypełniamy
    if(sel.options && sel.options.length <= 1){
      DEFAULT_PERM_OPTIONS.forEach(p=>{
        const o = document.createElement('option');
        o.value = p; o.textContent = p;
        sel.appendChild(o);
      });
    }
  }

  // BU filter functions
  function addBuFilter(bu){
    if(!bu || !String(bu).trim()) return;
    const v = String(bu).trim();
    if(selectedBuFilters.has(v)) return;
    selectedBuFilters.add(v);
    updateBuFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after addBuFilter', e); }
  }

  function removeBuFilter(bu){
    if(!bu) return;
    selectedBuFilters.delete(String(bu));
    updateBuFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after removeBuFilter', e); }
  }

  function clearBuFilters(){
    selectedBuFilters.clear();
    updateBuFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after clearBuFilters', e); }
  }

  function updateBuFilterBtn(){
    const btn = document.getElementById('buMultiFilterBtn');
    if(!btn) return;
    const selArr = Array.from(selectedBuFilters);
    btn.textContent = selArr.length ? selArr.join(', ') : '— BU —';
  }

  // Role filter functions
  function addRoleFilter(role){
    if(!role || !String(role).trim()) return;
    const v = String(role).trim();
    if(selectedRoleFilters.has(v)) return;
    selectedRoleFilters.add(v);
    updateRoleFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after addRoleFilter', e); }
  }

  function removeRoleFilter(role){
    if(!role) return;
    selectedRoleFilters.delete(String(role));
    updateRoleFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after removeRoleFilter', e); }
  }

  function clearRoleFilters(){
    selectedRoleFilters.clear();
    updateRoleFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after clearRoleFilters', e); }
  }

  function updateRoleFilterBtn(){
    const btn = document.getElementById('roleMultiFilterBtn');
    if(!btn) return;
    const selArr = Array.from(selectedRoleFilters);
    btn.textContent = selArr.length ? selArr.map(r => getDisplayRoleName(r)).join(', ') : '— Role —';
  }

  // Manager filter functions
  function addManagerFilter(managerId){
    if(!managerId || !String(managerId).trim()) return;
    const v = String(managerId).trim();
    if(selectedManagerFilters.has(v)) return;
    selectedManagerFilters.add(v);
    updateManagerFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after addManagerFilter', e); }
  }

  function removeManagerFilter(managerId){
    if(!managerId) return;
    selectedManagerFilters.delete(String(managerId));
    updateManagerFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after removeManagerFilter', e); }
  }

  function clearManagerFilters(){
    selectedManagerFilters.clear();
    updateManagerFilterBtn();
    try { renderList(); } catch(e){ safeLog('renderList error after clearManagerFilters', e); }
  }

  function updateManagerFilterBtn(){
    const btn = document.getElementById('managerMultiFilterBtn');
    if(!btn) return;
    const selArr = Array.from(selectedManagerFilters);
    btn.textContent = selArr.length ? `${selArr.length} kierownik(a)` : '— Kierownik —';
  }


  // inicjalizacja hooków UI dla chipów — wywołać w init()
  function initPermFilterUI(){
    try{
      populatePermOptions();
      renderPermChips();

      const sel = document.getElementById('permOptions');
      const clearBtn = document.getElementById('clearPermsBtn');

      // keep select as single-choice dropdown (visual unchanged)
      if(sel){
        try {
          // ensure it's not a multi-select
          sel.multiple = false;
          sel.size = 0;
        } catch(e) { /* ignore if not allowed */ }
      }

      // legacy Add button removed from HTML; nothing to cleanup here

      if(sel){
        sel.addEventListener('keydown', (e) => {
          if(e.key === 'Enter'){
            const v = (sel.value || '').trim();
            if(v) addPermFilter(v);
          }
        });
      }

      if(clearBtn){
        clearBtn.addEventListener('click', () => {
          // Clear all filters: permissions, BU, and Role
          clearPermFilters();
          clearBuFilters();
          clearRoleFilters();
          
          // also clear checkboxes in custom multi-dropdown (if present)
          try {
            const wrapper = document.getElementById('permMultiDropdown');
            if(wrapper){
              const boxes = wrapper.querySelectorAll('input[type="checkbox"]');
              boxes.forEach(cb => { try{ cb.checked = false; } catch(e){} });
              const btn = wrapper.querySelector('.perm-multi-btn');
              if(btn) {
                try { btn.firstChild.nodeValue = '— wybierz —'; } catch(e){}
              }
            }
          } catch(e){ /* ignore */ }

          // Clear BU checkboxes
          try {
            const buMenu = document.getElementById('buMultiMenu');
            if(buMenu){
              const boxes = buMenu.querySelectorAll('input[type="checkbox"]');
              boxes.forEach(cb => { try{ cb.checked = false; } catch(e){} });
            }
          } catch(e){ /* ignore */ }

          // Clear Role checkboxes
          try {
            const roleMenu = document.getElementById('roleMultiMenu');
            if(roleMenu){
              const boxes = roleMenu.querySelectorAll('input[type="checkbox"]');
              boxes.forEach(cb => { try{ cb.checked = false; } catch(e){} });
            }
          } catch(e){ /* ignore */ }
        });
      }

      // --- Better UX: create a compact checkbox-dropdown beside the select
      try {
        if (sel) {
          // Build only once
          if (!document.getElementById('permMultiDropdown')) {
            // hide original select but keep it in DOM for non-JS fallback
            sel.style.display = 'none';

            const wrapper = document.createElement('div');
            wrapper.id = 'permMultiDropdown';
            wrapper.style.display = 'inline-block';
            wrapper.style.position = 'relative';
            wrapper.style.verticalAlign = 'middle';

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'perm-multi-btn';
            btn.style.padding = '8px';
            btn.style.border = '1px solid #e6eef8';
            btn.style.borderRadius = '6px';
            btn.style.background = '#fff';
            btn.style.minWidth = '140px';
            btn.style.textAlign = 'left';
            btn.style.cursor = 'pointer';

            const caret = document.createElement('span');
            caret.textContent = ' ▾';
            caret.style.float = 'right';
            btn.appendChild(document.createTextNode('— wybierz —'));
            btn.appendChild(caret);

            const menu = document.createElement('div');
            menu.className = 'perm-multi-menu';
            menu.style.position = 'absolute';
            menu.style.top = '100%';
            menu.style.left = '0';
            menu.style.background = '#fff';
            menu.style.border = '1px solid rgba(0,0,0,0.08)';
            menu.style.boxShadow = '0 6px 16px rgba(0,0,0,0.08)';
            menu.style.padding = '6px';
            menu.style.zIndex = 22000;
            menu.style.display = 'none';
            menu.style.maxHeight = '250px';
            menu.style.overflow = 'auto';
            menu.style.minWidth = '220px';

            // Build options list from existing select options or defaults
            const optionValues = (sel.options && sel.options.length > 0)
              ? Array.from(sel.options).map(o => ({v: (o.value||'').trim(), t: o.textContent||o.value||''})).filter(x=>x.v)
              : DEFAULT_PERM_OPTIONS.map(p => ({v: p, t: p}));

            optionValues.forEach(opt => {
              const lab = document.createElement('label');
              lab.style.display = 'flex';
              lab.style.alignItems = 'center';
              lab.style.gap = '8px';
              lab.style.padding = '4px 6px';
              lab.style.cursor = 'pointer';

              const cb = document.createElement('input');
              cb.type = 'checkbox';
              // store perm in a custom data attribute so global handlers looking for
              // `[data-perm]` or `input[type="checkbox"][value]` won't match us
              cb.dataset.mperm = opt.v;
              cb.style.flex = '0 0 auto';
              if (selectedPermFilters.has(opt.v)) cb.checked = true;

              const span = document.createElement('span');
              span.textContent = opt.t || opt.v;

              cb.addEventListener('change', function(ev){
                const val = (this.dataset.mperm||'').trim();
                if(!val) return;
                if(this.checked) addPermFilter(val);
                else removePermFilter(val);
                updateBtnLabel();
                // stop propagation so global perm bridge doesn't override behaviour
                try { ev.stopPropagation(); } catch(e){}
              });
              // also stop click propagation on input and label to be safe
              cb.addEventListener('click', function(ev){ try{ ev.stopPropagation(); } catch(e){} });

              lab.appendChild(cb);
              lab.appendChild(span);
              menu.appendChild(lab);
            });

            function updateBtnLabel(){
              const selArr = Array.from(selectedPermFilters);
              btn.firstChild.nodeValue = selArr.length ? selArr.join(', ') + ' ' : '— wybierz —';
            }

            btn.addEventListener('click', function(ev){ ev.stopPropagation(); menu.style.display = (menu.style.display === 'none') ? 'block' : 'none'; });
            // close on outside click
            document.addEventListener('click', function(){ if(menu) menu.style.display = 'none'; });

            wrapper.appendChild(btn);
            wrapper.appendChild(menu);
            // insert after original select
            sel.parentNode.insertBefore(wrapper, sel.nextSibling);
            updateBtnLabel();
          }
        }
      } catch (e) { safeLog('perm multi-dropdown init error', e); }

    }catch(e){
      safeLog('initPermFilterUI error', e);
    }
  }

  function initBuRoleMultiDropdowns(){
    // Build BU multi-dropdown
    const buWrapper = document.getElementById('buMultiFilterWrapper');
    const roleWrapper = document.getElementById('roleMultiFilterWrapper');
    const buBtn = document.getElementById('buMultiFilterBtn');
    const roleBtn = document.getElementById('roleMultiFilterBtn');

    if(buWrapper && buBtn && !document.getElementById('buMultiMenu')){
      const buMenu = document.createElement('div');
      buMenu.id = 'buMultiMenu';
      buMenu.className = 'filter-multi-menu';
      
      // collect available BU values from cache
      const buSet = new Set(cache.filter(e => e.bu).map(e => String(e.bu).trim()));
      const buArr = Array.from(buSet).sort();

      buArr.forEach(bu => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.filterBu = bu;
        cb.checked = selectedBuFilters.has(bu);

        const span = document.createElement('span');
        span.textContent = bu;

        cb.addEventListener('change', function(){
          if(this.checked) addBuFilter(bu);
          else removeBuFilter(bu);
        });

        label.appendChild(cb);
        label.appendChild(span);
        buMenu.appendChild(label);
      });

      buBtn.addEventListener('click', function(ev){ 
        ev.stopPropagation(); 
        buMenu.style.display = (buMenu.style.display === 'none') ? 'block' : 'none'; 
      });

      document.addEventListener('click', function(ev){
        if(buMenu && !buWrapper.contains(ev.target)) buMenu.style.display = 'none';
      });

      buWrapper.appendChild(buMenu);
    }

    if(roleWrapper && roleBtn && !document.getElementById('roleMultiMenu')){
      const roleMenu = document.createElement('div');
      roleMenu.id = 'roleMultiMenu';
      roleMenu.className = 'filter-multi-menu';

      // collect available Role values from cache
      const roleSet = new Set();
      cache.forEach(e => {
        if(e.roles){
          const rolesArray = Array.isArray(e.roles) ? e.roles : (typeof e.roles === 'string' ? e.roles.split(',').map(s=>s.trim()) : []);
          rolesArray.forEach(r => { if(r) roleSet.add(r); });
        }
      });
      const roleArr = Array.from(roleSet).sort();

      roleArr.forEach(role => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.filterRole = role;
        cb.checked = selectedRoleFilters.has(role);

        const span = document.createElement('span');
        span.textContent = getDisplayRoleName(role);

        cb.addEventListener('change', function(){
          if(this.checked) addRoleFilter(role);
          else removeRoleFilter(role);
        });

        label.appendChild(cb);
        label.appendChild(span);
        roleMenu.appendChild(label);
      });

      roleBtn.addEventListener('click', function(ev){ 
        ev.stopPropagation(); 
        roleMenu.style.display = (roleMenu.style.display === 'none') ? 'block' : 'none'; 
      });

      document.addEventListener('click', function(ev){
        if(roleMenu && !roleWrapper.contains(ev.target)) roleMenu.style.display = 'none';
      });

      roleWrapper.appendChild(roleMenu);
    }

    // Build Manager multi-dropdown
    const managerWrapper = document.getElementById('managerMultiFilterWrapper');
    const managerBtn = document.getElementById('managerMultiFilterBtn');

    if(managerWrapper && managerBtn && !document.getElementById('managerMultiMenu')){
      const managerMenu = document.createElement('div');
      managerMenu.id = 'managerMultiMenu';
      managerMenu.className = 'filter-multi-menu';
      
      // collect available managers from cache (where manager_id is not null)
      const managerSet = new Set();
      const managerNames = new Map();
      cache.forEach(e => {
        if(e.manager_id && e.managerName){
          managerSet.add(e.manager_id);
          managerNames.set(e.manager_id, e.managerName);
        }
      });
      const managerArr = Array.from(managerSet).sort((a, b) => {
        const nameA = managerNames.get(a) || '';
        const nameB = managerNames.get(b) || '';
        return nameA.localeCompare(nameB);
      });

      managerArr.forEach(managerId => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.dataset.filterManager = managerId;
        cb.checked = selectedManagerFilters.has(managerId);

        const span = document.createElement('span');
        span.textContent = managerNames.get(managerId) || 'Nieznany';

        cb.addEventListener('change', function(){
          if(this.checked) addManagerFilter(managerId);
          else removeManagerFilter(managerId);
        });

        label.appendChild(cb);
        label.appendChild(span);
        managerMenu.appendChild(label);
      });

      managerBtn.addEventListener('click', function(ev){ 
        ev.stopPropagation(); 
        managerMenu.style.display = (managerMenu.style.display === 'none') ? 'block' : 'none'; 
      });

      document.addEventListener('click', function(ev){
        if(managerMenu && !managerWrapper.contains(ev.target)) managerMenu.style.display = 'none';
      });

      managerWrapper.appendChild(managerMenu);
    }
  }

  // ----------------------------
  // Zaktualizowana funkcja applyFilterSort
  // ----------------------------
  function applyFilterSort(list, query, sortField, sortDir, filterBu, filterRole, filterPerms){
    // jeśli parametry nie podane — pobierz je z DOM (ułatwia użycie)
    const q = (typeof query !== 'undefined') ? String(query || '') : String((document.getElementById('empSearchInput')?.value || '')).trim();
    const sf = sortField || (document.getElementById('empSortField')?.value || 'surname');
    const sd = sortDir || (document.getElementById('empSortDir')?.value || 'asc');

    // Use selected filter sets (from checkboxes)
    const buSet = selectedBuFilters.size > 0 ? selectedBuFilters : null;
    const roleSet = selectedRoleFilters.size > 0 ? selectedRoleFilters : null;
    const permsSet = (Array.isArray(filterPerms) ? new Set(filterPerms) : (filterPerms instanceof Set ? filterPerms : null)) || new Set(Array.from(selectedPermFilters));

    const qlow = String(q||'').toLowerCase().trim();
    let out = list.slice();

    // filtrowanie - sprawdzimy firstname + surname oraz legacy_name
    if(qlow){
      out = out.filter(e => {
        const fullname = (((e.surname||'') + ' ' + (e.firstname||'')).toLowerCase().trim());
        const legacy = (e.legacy_name||'').toLowerCase();
        return fullname.includes(qlow) || legacy.includes(qlow);
      });
    }

    // BU filter (OR — employee has any of selected BU)
    if(buSet && buSet.size > 0){
      out = out.filter(e => {
        const empBu = String(e.bu||'').trim();
        return buSet.has(empBu);
      });
    }

    // Role filter (OR — employee has any of selected roles)
    if(roleSet && roleSet.size > 0){
      out = out.filter(e => {
        const empRoles = (String(e.roles||'')).split(',').map(s=>s.trim()).filter(Boolean);
        return empRoles.some(r => roleSet.has(r));
      });
    }

    // Manager filter (OR — employee has any of selected managers)
    const managerSet = selectedManagerFilters.size > 0 ? selectedManagerFilters : null;
    if(managerSet && managerSet.size > 0){
      out = out.filter(e => {
        return e.manager_id && managerSet.has(e.manager_id);
      });
    }

    // FILTER PERMISSIONS (AND) — jeśli permsSet nie jest puste
    if(permsSet && permsSet.size > 0){
      out = out.filter(e => {
        const empPerms = Array.isArray(e.permissions) ? e.permissions.map(x=>String(x)) : (e.permissions ? String(e.permissions).split(',').map(s=>s.trim()) : []);
        const empSet = new Set(empPerms);
        // sprawdź czy empSet zawiera wszystkie elementy permsSet
        for(const p of permsSet){
          if(!empSet.has(p)) return false;
        }
        return true;
      });
    }

    // sortowanie: dostosowane do sf/sd
    out.sort((a,b) => {
      let av = String(a[sf] || '');
      let bv = String(b[sf] || '');
      if(sf === 'surname' || sf === 'fullname'){
        av = ((a.surname||'') + ' ' + (a.firstname||'')).toLowerCase();
        bv = ((b.surname||'') + ' ' + (b.firstname||'')).toLowerCase();
      } else {
        av = av.toLowerCase();
        bv = bv.toLowerCase();
      }

      if(av === bv) return ((a.surname||'') + (a.firstname||'')).localeCompare((b.surname||'') + (b.firstname||''));
      return sd === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return out;
  }

  // ----------------------------
  // Zaktualizowany renderList (korzysta z applyFilterSort + filtrów perms)
  // ----------------------------
  function renderList(){
    const wrap = document.getElementById('adminEmployeesApp');
    if(!wrap) {
      safeLog('renderList: brak #adminEmployeesApp');
      return;
    }
    wrap.innerHTML = '<div class="muted">Ładuję listę pracowników...</div>';
    // pamiętaj — fetchEmployees wypełnia cache
    fetchEmployees().then(()=> {
      try{
        // Init BU and Role dropdowns after cache is loaded
        initBuRoleMultiDropdowns();

        // odczytaj ustawienia UI
        const query = (document.getElementById('empSearchInput')?.value || '').trim();
        const sortField = (document.getElementById('empSortField')?.value || 'surname');
        const sortDir = (document.getElementById('empSortDir')?.value || 'asc');

        // zastosuj filtrowanie i sortowanie
        const filtered = applyFilterSort(cache, query, sortField, sortDir);

        // czyszczę i rysuję nagłówki tak jak wcześniej (jeśli masz header render w oddzielnej funcji, możesz użyć jej)
        const header = document.createElement('div');
        header.className = 'admin-emp-header';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.fontWeight = '700';
        header.style.fontSize = '14px';
        header.style.background = '#f8f9fa';
        header.style.borderBottom = '1px solid #e5e7eb';
        header.style.padding = '8px 0';
        header.style.flex = '1';

        const cols = [
          { label: 'Nazwisko / Imię', width: '240px', flex: '2' },
          { label: 'BU', width: '60px', flex: '0 0 80px' },
          { label: 'Kierownik', width: '150px', flex: '1.5' },
          { label: 'Role', width: '220px', flex: '2' },
          { label: 'Uprawnienia', width: '180px', flex: '2' },
          { label: 'Akcje', width: '140px', flex: '0 0 120px', align: 'center' }
        ];

        header.innerHTML = '';
        cols.forEach(col => {
          const el = document.createElement('div');
          el.textContent = col.label;
          el.style.flex = col.flex;
          el.style.width = col.width;
          el.style.textAlign = col.align || 'left';
          el.style.color = '#0f1724';
          header.appendChild(el);
        });
        wrap.innerHTML = '';
        // top area with perm chips + controls (if present in DOM)
        const topControls = document.createElement('div');
        topControls.style.display = 'flex';
        topControls.style.justifyContent = 'space-between';
        // align to baseline so the Add button lines up with the section title/header
        topControls.style.alignItems = 'baseline';
        topControls.style.marginBottom = '8px';
        topControls.style.width = '100%';
        // left: header
        topControls.appendChild(header);

        // create add employee button and try to place it into section header
        const addEmpBtn = document.createElement('button');
        addEmpBtn.className = 'btn';
        addEmpBtn.style.marginTop = '0';
        addEmpBtn.textContent = 'Dodaj pracownika';
        addEmpBtn.onclick = () => openAddEmployeeModal();

        const empHeader = document.querySelector('#adminEmployeesSection .admin-section-header');
        if (empHeader) {
          // ensure left info container exists
          let infoEmp = empHeader.querySelector('.section-info');
          if (!infoEmp) {
            const h = empHeader.querySelector('h2');
            const p = empHeader.querySelector('p');
            infoEmp = document.createElement('div');
            infoEmp.className = 'section-info';
            infoEmp.style.display = 'flex';
            infoEmp.style.flexDirection = 'column';
            infoEmp.style.gap = '4px';
            infoEmp.style.flex = '1';
            if (h) infoEmp.appendChild(h);
            if (p) infoEmp.appendChild(p);
            empHeader.insertBefore(infoEmp, empHeader.firstChild);
          }
          let actions = empHeader.querySelector('.section-actions');
          if (!actions) {
            actions = document.createElement('div');
            actions.className = 'section-actions';
            actions.style.marginLeft = 'auto';
            actions.style.display = 'flex';
            actions.style.alignItems = 'center';
            actions.style.gap = '12px';
            empHeader.appendChild(actions);
          }
          // if button already exists, reuse it
          let addEmpBtn = actions.querySelector('#addEmployeeBtn');
          if (!addEmpBtn) {
            addEmpBtn = document.createElement('button');
            addEmpBtn.id = 'addEmployeeBtn';
            addEmpBtn.className = 'btn';
            addEmpBtn.style.marginTop = '0';
            addEmpBtn.textContent = 'Dodaj pracownika';
            addEmpBtn.onclick = () => openAddEmployeeModal();
            actions.appendChild(addEmpBtn);
          }
          empHeader.style.display = 'flex';
          empHeader.style.alignItems = 'center';
          // append filters/chips below header
          wrap.appendChild(topControls);
        } else {
          // fallback: create add button in topControls if header missing
          const addEmpBtn = document.createElement('button');
          addEmpBtn.className = 'btn';
          addEmpBtn.style.marginTop = '0';
          addEmpBtn.textContent = 'Dodaj pracownika';
          addEmpBtn.onclick = () => openAddEmployeeModal();
          topControls.appendChild(addEmpBtn);
          wrap.appendChild(topControls);
        }

        // add chips container area (if page has #permChips, populate it)
        const chipsWrap = document.getElementById('permChips');
        if(chipsWrap){
          // ensure chips are up-to-date
          renderPermChips();
        }

        // jeśli brak wyników
        if(filtered.length === 0){
          const m = document.createElement('div');
          m.className = 'muted';
          m.textContent = 'Brak pracowników do wyświetlenia.';
          wrap.appendChild(m);
          return;
        }

        // rysuj wiersze
        filtered.forEach(emp => {
          wrap.appendChild(makeRow(emp));
        });
      }catch(e){
        console.error('renderList error (inner)', e);
        wrap.innerHTML = '';
        const err = document.createElement('div');
        err.className = 'muted';
        err.style.color = '#a33';
        err.textContent = 'Błąd podczas renderowania listy pracowników. Sprawdź konsolę.';
        wrap.appendChild(err);
      }
    }).catch(e=>{
      console.error('renderList: fetchEmployees failed', e);
      wrap.innerHTML = '';
      const err = document.createElement('div');
      err.className = 'muted';
      err.style.color = '#a33';
      err.textContent = 'Błąd przy pobieraniu pracowników. Sprawdź konsolę.';
      wrap.appendChild(err);
    });
  }


  async function init(){
    wrap = document.getElementById('adminEmployeesApp');
    if(!wrap){
      console.warn('AdminEmployees.init: brak elementu #adminEmployeesApp w DOM');
      return;
    }

    // hooki UI
    const search = document.getElementById('empSearchInput');
    const sortField = document.getElementById('empSortField');
    const sortDir = document.getElementById('empSortDir');
    const refresh = document.getElementById('refreshEmpListBtn');

    if(search) search.addEventListener('input', () => renderList());
    if(sortField) sortField.addEventListener('change', () => renderList());
    if(sortDir) sortDir.addEventListener('change', () => renderList());
    if(refresh) refresh.addEventListener('click', () => renderList());

    // init perm chip UI (if perm controls exist in DOM)
    initPermFilterUI();

    // initial render & populate filters
    await renderList();
  }

  function populateFilters() {
    // This function is no longer needed as BU/Role menus are built
    // dynamically in initBuRoleMultiDropdowns() after cache is loaded
    // Keeping it for backward compatibility
  }

  
  // Expose applyFilters into the AdminEmployees module so external UI can set perms
  function applyFilters(filters){
    try{
      // normalize filters to array of strings
      var arr = Array.isArray(filters) ? filters : (filters ? [filters] : []);
      selectedPermFilters.clear();
      arr.forEach(function(f){ if(f != null) selectedPermFilters.add(String(f)); });
      try { renderPermChips(); } catch(e) { /* ignore */ }
      try { renderList(); } catch(e) { /* ignore */ }
      return true;
    } catch(err){
      console.warn('applyFilters internal error', err);
      return false;
    }
  }

  return { init, renderList, applyFilters };
})(); // koniec AdminEmployees

/* perm-chip manager — idempotentny, bez powielania */
(function(){
  if (window.__permChipManagerInit) return;
  window.__permChipManagerInit = true;

  // aktywne filtry
  window.activePermFilters = window.activePermFilters || new Set();

  // pobierz wartość filtra z chipa (data-perm preferred)
  const getPermValue = el => el?.dataset?.perm?.trim() || el?.textContent?.trim();

  // zaktualizuj UI chipa
  function updateChipUI(chip, active) {
    chip.classList.toggle('perm-chip--active', !!active);
    if (active) chip.setAttribute('aria-pressed','true');
    else chip.removeAttribute('aria-pressed');
  }

  // wywołanie filtra w aplikacji (kolejność fallbacków)
  function applyFilters() {
    const filters = Array.from(window.activePermFilters);
    if (window.AdminEmployees && typeof window.AdminEmployees.applyFilters === 'function') {
      window.AdminEmployees.applyFilters(filters);
      return;
    }
    if (window.AdminEmployees && typeof window.AdminEmployees.refresh === 'function') {
      window.AdminEmployees.refresh();
      return;
    }
    if (typeof window.refreshEmployeesList === 'function') {
      window.refreshEmployeesList(filters);
      return;
    }
    document.dispatchEvent(new CustomEvent('permFiltersChanged', { detail: { filters } }));
  }

  // bezpieczne dodawanie chipa (unikaj duplikatów)
  window.addPermChip = function addPermChip(value, label, opts = {}) {
    if (!value) return null;
    const existing = document.querySelector(`.perm-chip[data-perm="${CSS.escape(value)}"]`);
    if (existing) {
      // opcjonalnie aktywuj jeśli podano flagę
      if (opts.activate) {
        window.activePermFilters.add(value);
        updateChipUI(existing, true);
        applyFilters();
      }
      return existing;
    }
    // stwórz nowy chip
    const chip = document.createElement('div');
    chip.className = 'perm-chip';
    chip.setAttribute('data-perm', value);
    chip.setAttribute('role', 'button');
    chip.setAttribute('tabindex', '0');
    chip.textContent = label || value;
    if (opts.activate) {
      window.activePermFilters.add(value);
      chip.classList.add('perm-chip--active');
      chip.setAttribute('aria-pressed','true');
    }
    // znajdź kontener (upewnij się, że ID permChips istnieje)
    const container = document.getElementById('permChips');
    if (container) container.appendChild(chip);
    return chip;
  };

  // delegation handler — toggle
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.perm-chip');
    if (!chip) return;
    e.preventDefault();
    const val = getPermValue(chip);
    if (!val) return;
    if (window.activePermFilters.has(val)) {
      window.activePermFilters.delete(val);
      updateChipUI(chip, false);
    } else {
      window.activePermFilters.add(val);
      updateChipUI(chip, true);
    }
    applyFilters();
  });

  // klawiatura: Enter/Space też toggluje (accessibility)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const chip = e.target.closest && e.target.closest('.perm-chip');
      if (!chip) return;
      e.preventDefault();
      chip.click();
    }
  });

  // inicjalne ustawienie — ustaw UI chipa, jeśli są predefiniowane filtry
  document.addEventListener('DOMContentLoaded', () => {
    const initial = Array.isArray(window.initialPermFilters) ? window.initialPermFilters : [];
    initial.forEach(v => window.activePermFilters.add(v));
    document.querySelectorAll('.perm-chip').forEach(chip => {
      const v = getPermValue(chip);
      updateChipUI(chip, !!(v && window.activePermFilters.has(v)));
    });
  });

  // expose helper do testów / debugu
  window.getActivePermFilters = () => Array.from(window.activePermFilters);
})();


// expose modules to window
window.AdminMachines = AdminMachines;
window.AdminEmployees = AdminEmployees;

/* -------------------- Zakładki i bootstrapping admin -------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  // Przycisk powrotu — dostępny zawsze, niezależnie od autentykacji
  const backToMainBtn = document.getElementById('backToMainBtn');
  if(backToMainBtn) backToMainBtn.addEventListener('click', () => { window.location.href = './index.html'; });

  // ========== HAMBURGER MENU (Mobile) ==========
  const adminNavToggle = document.getElementById('adminNavToggle');
  const adminNav = document.getElementById('adminNav');
  
  if(adminNavToggle && adminNav) {
    // Otwórz/zamknij menu po kliknieciu hamburger
    adminNavToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      adminNav.classList.toggle('active');
    });
    
    // Zamknij menu gdy klikniesz na jakiś nav-item
    adminNav.querySelectorAll('.nav-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        adminNav.classList.remove('active');
      });
    });
    
    // Zamknij menu gdy klikniesz poza nim
    document.addEventListener('click', (e) => {
      if(!adminNav.contains(e.target) && !adminNavToggle.contains(e.target)) {
        adminNav.classList.remove('active');
      }
    });
  }

  ensureAuthThen(() => {
    const tabModify = document.getElementById('tabModify');
    const tabEmployees = document.getElementById('tabEmployees');
    const machinesSection = document.getElementById('adminMachinesSection');
    const loadConfigSection = document.getElementById('adminLoadConfigSection');
    const employeesSection = document.getElementById('adminEmployeesSection');
    const managersSection = document.getElementById('adminManagersSection');

    async function showModify(){
      if(machinesSection) machinesSection.style.display = '';
      if(loadConfigSection) loadConfigSection.style.display = 'none';
      if(employeesSection) employeesSection.style.display = 'none';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      if(tabModify) tabModify.classList.add('active');
      try { await AdminMachines.renderList(); } catch(e){ console.warn('showModify renderList error', e); }
    }

    async function showLoadConfig(){
      if(machinesSection) machinesSection.style.display = 'none';
      if(loadConfigSection) loadConfigSection.style.display = '';
      if(employeesSection) employeesSection.style.display = 'none';
      if(managersSection) managersSection.style.display = 'none';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      const tabLoadConfig = document.getElementById('tabLoadConfig');
      if(tabLoadConfig) tabLoadConfig.classList.add('active');
      try { await renderLoadConfiguration(); } catch(e){ console.warn('showLoadConfig error', e); }
    }

    async function showEmployees(){
      if(machinesSection) machinesSection.style.display = 'none';
      if(loadConfigSection) loadConfigSection.style.display = 'none';
      if(employeesSection) employeesSection.style.display = '';
      if(managersSection) managersSection.style.display = 'none';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      if(tabEmployees) tabEmployees.classList.add('active');
      try { await AdminEmployees.init(); } catch(e){ console.warn('Błąd init AdminEmployees', e); }
    }

    async function showManagers(){
      if(machinesSection) machinesSection.style.display = 'none';
      if(loadConfigSection) loadConfigSection.style.display = 'none';
      if(employeesSection) employeesSection.style.display = 'none';
      if(managersSection) managersSection.style.display = '';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      if(tabManagers) tabManagers.classList.add('active');
      setupManagersSection();
      await renderManagers();
    }

    if(tabModify) tabModify.addEventListener('click', () => showModify());
    const tabLoadConfig = document.getElementById('tabLoadConfig');
    if(tabLoadConfig) tabLoadConfig.addEventListener('click', () => showLoadConfig());
    if(tabEmployees) tabEmployees.addEventListener('click', () => showEmployees());
    const tabManagers = document.getElementById('tabManagers');
    if(tabManagers) tabManagers.addEventListener('click', () => showManagers());

    // open machines by default
    showModify();
  });
  /* === Perm bridge (safe append) ===
   Append this at the very end of admin.js (safe, idempotent).
*/
(function(){
  if(window.__permBridgeAppended) return;
  window.__permBridgeAppended = true;

  function callAdminWithFilters(filters){
    filters = Array.isArray(filters) ? filters : (filters ? [filters] : []);
    if(window.AdminEmployees){
      const candidates = ['applyFilters','filterByPerms','setPerms','setFilters','filterEmployees','renderEmployees','refresh','render','reload','init'];
      for(const name of candidates){
        const fn = window.AdminEmployees[name];
        if(typeof fn === 'function'){
          try { fn.call(window.AdminEmployees, filters); console.log('AdminEmployees.'+name+' invoked'); return true; }
          catch(e){ console.warn('AdminEmployees.'+name+' threw', e); }
        }
      }
    }
    document.dispatchEvent(new CustomEvent('permFiltersChanged', { detail: { filters } }));
    console.log('permBridge: dispatched permFiltersChanged');
    return false;
  }

  function addPerm(val){
    if(!val) return;
    if(typeof window.addPermFilter === 'function'){
      try { window.addPermFilter(val); return; } catch(e){ console.warn(e); }
    }
    callAdminWithFilters([val]);
    document.dispatchEvent(new CustomEvent('permRequestedAdd', { detail:{ val } }));
  }
  function removePerm(val){
    if(!val) return;
    if(typeof window.removePermFilter === 'function'){
      try { window.removePermFilter(val); return; } catch(e){ console.warn(e); }
    }
    document.dispatchEvent(new CustomEvent('permRequestedRemove', { detail:{ val } }));
    callAdminWithFilters([]); // best-effort
  }

  var sel = document.getElementById('permOptions');
  if(sel && !sel.__permImmediateBound){
    sel.__permImmediateBound = true;
    sel.addEventListener('change', function(){
      const v = (this.value||'').trim();
      if(!v) return;
      addPerm(v);
      const empty = Array.from(this.options).find(o => (o.value||'').trim()==='');
      if(empty) this.value = '';
      else this.selectedIndex = 0;
    }, false);
    console.log('permBridge: bound change on #permOptions');
  }

  if(!document.__permGlobalDelegate){
    document.__permGlobalDelegate = true;
    document.addEventListener('click', function(e){
      const t = e.target;
      // Ignore clicks that happen inside any modal to avoid interfering
      // with modal inputs (e.g. add/edit employee permission checkboxes).
      if (t && t.closest && t.closest('.modal')) return;
      const target = t.closest && t.closest('[data-perm], input[type="checkbox"][value], .perm-box, .perm-item, button[data-perm]');
      if(!target) return;
      let v = '';
      if(target.dataset && target.dataset.perm) v = target.dataset.perm.trim();
      else if(target.tagName === 'INPUT' && target.value) v = (target.value||'').trim();
      else if(target.getAttribute && target.getAttribute('value')) v = (target.getAttribute('value')||'').trim();
      else v = (target.textContent||'').trim();
      if(!v) return;
      try { const inp = target.tagName==='INPUT' ? target : target.querySelector && target.querySelector('input[type="checkbox"]'); if(inp && !inp.disabled) inp.checked = !inp.checked; } catch(e){}
      addPerm(v);
      e.preventDefault();
    }, false);
    console.log('permBridge: global delegation bound');
  }
})();

/* ==================== KIEROWNICY - MANAGERS MODULE ==================== */

let managers = [];
let allEmployees = [];
let currentEditingManagerId = null;
let dragDropMode = false; // Czy aktywny mode przesuwania pracowników
let draggedEmployee = null; // Przeciągany pracownik
let draggedFromManager = null; // Kierownik źródłowy

async function loadManagers() {
  if(!sb) return;
  try {
    const { data, error } = await sb.from('managers').select('*').order('surname', { ascending: true });
    if(error) {
      console.error('loadManagers error', error);
      await showAdminNotification(`Błąd ładowania kierowników: ${error.message}`, 'Błąd', '❌');
      return;
    }
    managers = data || [];
    console.log('Loaded', managers.length, 'managers');
  } catch(e) {
    console.error('loadManagers catch', e);
    await showAdminNotification(`Błąd ładowania kierowników: ${e.message}`, 'Błąd', '❌');
  }
}

async function createManager(surname, name, bu, email, phone, canDrive = false, permissions = '') {
  if(!sb) return null;
  try {
    const { data, error } = await sb.from('managers').insert([{
      surname: surname.trim(),
      name: name.trim(),
      bu: bu.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      can_drive: canDrive,
      permissions: permissions || null
    }]).select();
    
    if(error) {
      console.error('createManager error', error);
      await showAdminNotification(`Błąd dodawania kierownika: ${error.message}`, 'Błąd', '❌');
      return null;
    }
    
    await showAdminNotification('Kierownik dodany pomyślnie!', 'Sukces', '✅');
    return data[0];
  } catch(e) {
    console.error('createManager catch', e);
    await showAdminNotification(`Błąd dodawania kierownika: ${e.message}`, 'Błąd', '❌');
    return null;
  }
}

async function updateManager(id, surname, name, bu, email, phone, canDrive = false, permissions = '') {
  if(!sb) return false;
  try {
    const { error } = await sb.from('managers').update({
      surname: surname.trim(),
      name: name.trim(),
      bu: bu.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      can_drive: canDrive,
      permissions: permissions || null
    }).eq('id', id);
    
    if(error) {
      console.error('updateManager error', error);
      await showAdminNotification(`Błąd aktualizacji kierownika: ${error.message}`, 'Błąd', '❌');
      return false;
    }
    
    await showAdminNotification('Kierownik zaktualizowany pomyślnie!', 'Sukces', '✅');
    return true;
  } catch(e) {
    console.error('updateManager catch', e);
    await showAdminNotification(`Błąd aktualizacji kierownika: ${e.message}`, 'Błąd', '❌');
    return false;
  }
}

async function deleteManager(id) {
  if(!sb) return false;
  try {
    const { error } = await sb.from('managers').delete().eq('id', id);
    
    if(error) {
      console.error('deleteManager error', error);
      await showAdminNotification(`Błąd usuwania kierownika: ${error.message}`, 'Błąd', '❌');
      return false;
    }
    
    await showAdminNotification('Kierownik usunięty pomyślnie!', 'Sukces', '✅');
    return true;
  } catch(e) {
    console.error('deleteManager catch', e);
    await showAdminNotification(`Błąd usuwania kierownika: ${e.message}`, 'Błąd', '❌');
    return false;
  }
}

async function loadAllEmployeesForManagers() {
  if(!sb) return;
  try {
    const { data, error } = await sb.from('employees').select('*').order('surname', { ascending: true });
    if(error) {
      console.error('loadAllEmployeesForManagers error', error);
      return;
    }
    allEmployees = data || [];
    console.log('Loaded', allEmployees.length, 'employees for managers');
  } catch(e) {
    console.error('loadAllEmployeesForManagers catch', e);
  }
}

async function getEmployeesByManager(managerId) {
  if(!sb) return [];
  try {
    const { data, error } = await sb.from('employees').select('*').eq('manager_id', managerId).order('surname', { ascending: true });
    if(error) {
      console.error('getEmployeesByManager error', error);
      return [];
    }
    return data || [];
  } catch(e) {
    console.error('getEmployeesByManager catch', e);
    return [];
  }
}

async function getUnassignedEmployees() {
  if(!sb) return [];
  try {
    const { data, error } = await sb.from('employees').select('*').is('manager_id', null).order('surname', { ascending: true });
    if(error) {
      console.error('getUnassignedEmployees error', error);
      return [];
    }
    return data || [];
  } catch(e) {
    console.error('getUnassignedEmployees catch', e);
    return [];
  }
}

async function assignEmployeeToManager(employeeId, managerId) {
  if(!sb) return false;
  try {
    const { error } = await sb.from('employees').update({ manager_id: managerId }).eq('id', employeeId);
    if(error) {
      console.error('assignEmployeeToManager error', error);
      await showAdminNotification(`Błąd przypisania: ${error.message}`, 'Błąd', '❌');
      return false;
    }
    await showAdminNotification('Pracownik przypisany do kierownika!', 'Sukces', '✅');
    return true;
  } catch(e) {
    console.error('assignEmployeeToManager catch', e);
    await showAdminNotification(`Błąd przypisania: ${e.message}`, 'Błąd', '❌');
    return false;
  }
}

async function removeEmployeeFromManager(employeeId) {
  if(!sb) return false;
  try {
    const { error } = await sb.from('employees').update({ manager_id: null }).eq('id', employeeId);
    if(error) {
      console.error('removeEmployeeFromManager error', error);
      await showAdminNotification(`Błąd usunięcia: ${error.message}`, 'Błąd', '❌');
      return false;
    }
    await showAdminNotification('Pracownik usunięty z zespołu!', 'Sukces', '✅');
    return true;
  } catch(e) {
    console.error('removeEmployeeFromManager catch', e);
    await showAdminNotification(`Błąd usunięcia: ${e.message}`, 'Błąd', '❌');
    return false;
  }
}

async function renderManagers() {
  const container = document.getElementById('adminManagersApp');
  if(!container) return;

  try {
    await loadManagers();
    await loadAllEmployeesForManagers();

    container.innerHTML = '';

    if(managers.length === 0) {
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">Brak kierowników w systemie.</div>';
      return;
    }

    // Sortuj kierowników alfabetycznie po nazwisku, potem po imeniu
    const sortedManagers = [...managers].sort((a, b) => {
      const surnameA = (a.surname || '').toLowerCase();
      const surnameB = (b.surname || '').toLowerCase();
      const surnameCompare = surnameA.localeCompare(surnameB);
      if(surnameCompare !== 0) return surnameCompare; // Jeśli nazwiska różne, sortuj po nich
      
      // Nazwiska takie same, sortuj po imeniu
      const nameA = (a.name || a.firstname || '').toLowerCase();
      const nameB = (b.name || b.firstname || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const grid = document.createElement('div');
    grid.className = 'managers-grid';

    for(const manager of sortedManagers) {
      const employees = await getEmployeesByManager(manager.id);
      const card = createManagerCard(manager, employees);
      grid.appendChild(card);
    }

    container.appendChild(grid);
  } catch(e) {
    console.error('renderManagers error', e);
    await showAdminNotification(`Błąd renderowania: ${e.message}`, 'Błąd', '❌');
  }
}

function createManagerCard(manager, employees) {
  const card = document.createElement('div');
  card.className = 'manager-card';
  card.dataset.managerId = manager.id; // Dla drag-drop

  const headerDiv = document.createElement('div');
  headerDiv.className = 'manager-card-header';

  const nameDiv = document.createElement('div');
  nameDiv.className = 'manager-card-name';
  nameDiv.innerHTML = `
    <div class="manager-card-name-surname">${manager.surname || ''}</div>
    <div class="manager-card-name-sub">${manager.name || manager.firstname || ''}</div>
  `;
  headerDiv.appendChild(nameDiv);

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'manager-card-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'btn';
  editBtn.textContent = '✏️ Edycja';
  editBtn.onclick = () => openManagerFormModal(manager.id);
  actionsDiv.appendChild(editBtn);

  const manageBtn = document.createElement('button');
  manageBtn.className = 'btn';
  manageBtn.textContent = '👥 Zespół';
  manageBtn.onclick = () => openManagerEditModal(manager, employees);
  actionsDiv.appendChild(manageBtn);

  headerDiv.appendChild(actionsDiv);
  card.appendChild(headerDiv);

  // Sekcja uprawnień
  if(manager.can_drive) {
    const drivingDiv = document.createElement('div');
    drivingDiv.style.cssText = 'padding: 8px; background: #e8f5e9; border-radius: 4px; margin-bottom: 12px; font-size: 12px; color: #2e7d32; font-weight: 600;';
    drivingDiv.innerHTML = '🚗 Może jeździć';
    card.appendChild(drivingDiv);

    if(manager.permissions) {
      const permsArray = String(manager.permissions).split(',').map(s => s.trim()).filter(Boolean);
      if(permsArray.length > 0) {
        const permsDiv = document.createElement('div');
        permsDiv.style.cssText = 'padding: 6px 8px; background: #e3f2fd; border-radius: 4px; margin-bottom: 12px; font-size: 11px; color: #1565c0;';
        permsDiv.innerHTML = `<strong>Uprawnienia:</strong> ${permsArray.join(', ')}`;
        card.appendChild(permsDiv);
      }
    }
  }

  const employeesDiv = document.createElement('div');
  employeesDiv.className = 'manager-employees-list';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'manager-employees-title';
  titleDiv.innerHTML = `Pracownicy <span class="manager-count-badge">${employees.length}</span>`;
  employeesDiv.appendChild(titleDiv);

  if(employees.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'manager-employees-empty';
    emptyDiv.textContent = 'Brak przypisanych pracowników';
    employeesDiv.appendChild(emptyDiv);
  } else {
    employees.forEach(emp => {
      const empItem = document.createElement('div');
      empItem.className = 'manager-employee-item';
      empItem.dataset.employeeId = emp.id; // Dla drag-drop
      const empName = `${emp.surname || ''} ${emp.name || emp.firstname || ''}`.trim();
      empItem.innerHTML = `
        <div class="manager-employee-name">${empName}</div>
      `;
      employeesDiv.appendChild(empItem);
    });
  }

  card.appendChild(employeesDiv);
  return card;
}

async function openManagerEditModal(manager, employees) {
  currentEditingManagerId = manager.id;
  const modal = document.getElementById('managerEditModal');
  const titleEl = document.getElementById('managerEditTitle');
  const listEl = document.getElementById('managerEmployeesList');
  const selectEl = document.getElementById('managerEmployeeSelect');
  const addBtn = document.getElementById('managerAddEmployeeBtn');
  const closeBtn = document.getElementById('managerEditCloseBtn');

  const managerName = `${manager.surname || ''} ${manager.name || manager.firstname || ''}`.trim();
  titleEl.textContent = managerName;

  // Render pracowników
  listEl.innerHTML = '';
  if(employees.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 10px; text-align: center; color: #999;';
    empty.textContent = 'Brak przypisanych pracowników';
    listEl.appendChild(empty);
  } else {
    employees.forEach(emp => {
      const empDiv = document.createElement('div');
      empDiv.style.cssText = 'padding: 8px; background: #f5f5f5; border-radius: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;';
      const empName = `${emp.surname || ''} ${emp.name || emp.firstname || ''}`.trim();
      const removeBtn = document.createElement('button');
      removeBtn.style.cssText = 'background: #b00020; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;';
      removeBtn.textContent = 'Usuń';
      removeBtn.onclick = async () => {
        const ok = await showConfirmModal(`Usunąć ${empName} z zespołu?`, 'Potwierdzenie');
        if(ok) {
          const success = await removeEmployeeFromManager(emp.id);
          if(success) {
            await renderManagers();
            await openManagerEditModal(manager, await getEmployeesByManager(manager.id));
          }
        }
      };
      empDiv.innerHTML = `<span>${empName}</span>`;
      empDiv.appendChild(removeBtn);
      listEl.appendChild(empDiv);
    });
  }

  // Populate select
  selectEl.innerHTML = '<option value="">— Wybierz pracownika —</option>';
  const unassigned = await getUnassignedEmployees();
  unassigned.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.id;
    opt.textContent = `${emp.surname || ''} ${emp.name || emp.firstname || ''}`.trim();
    selectEl.appendChild(opt);
  });

  // Add button handler
  addBtn.onclick = async () => {
    const empId = selectEl.value;
    if(!empId) {
      await showAdminNotification('Wybierz pracownika', 'Błąd', '⚠️');
      return;
    }
    const success = await assignEmployeeToManager(empId, manager.id);
    if(success) {
      await renderManagers();
      await openManagerEditModal(manager, await getEmployeesByManager(manager.id));
    }
  };

  closeBtn.onclick = () => {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

async function openUnassignedModal() {
  const modal = document.getElementById('unassignedModal');
  const listEl = document.getElementById('unassignedEmployeesList');
  const closeBtn = document.getElementById('unassignedModalCloseBtn');

  const unassigned = await getUnassignedEmployees();

  listEl.innerHTML = '';
  if(unassigned.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'padding: 20px; text-align: center; color: #999;';
    empty.textContent = 'Wszyscy pracownicy są przypisani do kierownika!';
    listEl.appendChild(empty);
  } else {
    unassigned.forEach(emp => {
      const empDiv = document.createElement('div');
      empDiv.className = 'unassigned-employee-item';
      const empName = `${emp.surname || ''} ${emp.name || emp.firstname || ''}`.trim();
      
      const infoDiv = document.createElement('div');
      infoDiv.className = 'unassigned-employee-info';
      infoDiv.innerHTML = `<div class="unassigned-employee-name">${empName}</div>`;
      empDiv.appendChild(infoDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'unassigned-employee-actions';

      const select = document.createElement('select');
      select.innerHTML = '<option value="">— Wybierz kierownika —</option>';
      managers.forEach(mgr => {
        const opt = document.createElement('option');
        opt.value = mgr.id;
        opt.textContent = `${mgr.surname || ''} ${mgr.name || mgr.firstname || ''}`.trim();
        select.appendChild(opt);
      });
      actionsDiv.appendChild(select);

      const assignBtn = document.createElement('button');
      assignBtn.className = 'btn';
      assignBtn.textContent = 'Przypisz';
      assignBtn.onclick = async () => {
        const mgrId = select.value;
        if(!mgrId) {
          await showAdminNotification('Wybierz kierownika', 'Błąd', '⚠️');
          return;
        }
        const success = await assignEmployeeToManager(emp.id, mgrId);
        if(success) {
          await openUnassignedModal();
        }
      };
      actionsDiv.appendChild(assignBtn);

      empDiv.appendChild(actionsDiv);
      listEl.appendChild(empDiv);
    });
  }

  closeBtn.onclick = () => {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

/* Setup managers section */
function setupManagersSection() {
  const addManagerBtn = document.getElementById('addManagerBtn');
  const showUnassignedBtn = document.getElementById('showUnassignedBtn');
  const dragDropToggleBtn = document.getElementById('dragDropToggleBtn');
  
  if(addManagerBtn) {
    addManagerBtn.onclick = () => openManagerFormModal(null);
  }
  if(showUnassignedBtn) {
    showUnassignedBtn.onclick = openUnassignedModal;
  }
  if(dragDropToggleBtn) {
    dragDropToggleBtn.onclick = () => toggleDragDropMode(dragDropToggleBtn);
  }
}

function openManagerFormModal(managerId = null) {
  const modal = document.getElementById('managerFormModal');
  const titleEl = document.getElementById('managerFormTitle');
  const surnameInput = document.getElementById('managerSurname');
  const nameInput = document.getElementById('managerName');
  const buSelect = document.getElementById('managerBU');
  const emailInput = document.getElementById('managerEmail');
  const phoneInput = document.getElementById('managerPhone');
  const canDriveCheckbox = document.getElementById('managerCanDrive');
  const permissionsSection = document.getElementById('managerPermissionsSection');
  const permissionsGrid = document.getElementById('managerPermissionsGrid');
  const submitBtn = document.getElementById('managerFormSubmitBtn');
  const cancelBtn = document.getElementById('managerFormCancelBtn');
  const deleteBtn = document.getElementById('managerFormDeleteBtn');

  currentEditingManagerId = managerId;

  // Reset form
  surnameInput.value = '';
  nameInput.value = '';
  buSelect.value = '';
  emailInput.value = '';
  phoneInput.value = '';
  canDriveCheckbox.checked = false;
  permissionsSection.style.display = 'none';
  permissionsGrid.innerHTML = ''; // Wyczyść aby generować nowe

  // Generate permission checkboxes dynamically like for employees
  const permissionOptions = (window.CONFIG && window.CONFIG.admin && window.CONFIG.admin.permissions) ? window.CONFIG.admin.permissions : [];
  permissionOptions.forEach(code => {
    const cbWrap = document.createElement('label');
    cbWrap.style.cssText = 'display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; user-select: none; background: white; border: 1px solid #ddd; border-radius: 4px; font-size: 12px; white-space: nowrap; transition: all 0.15s;';
    
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.value = code;
    cb.style.cssText = 'width: 16px; height: 16px; cursor: pointer; accent-color: #0b74d1; margin: 0; padding: 0; flex-shrink: 0;';
    
    const span = document.createElement('span');
    span.textContent = code;
    
    // Onclick handler zamiast change event
    cb.onclick = function(event) {
      event.stopPropagation();
      console.log(`Manager perm ${code} clicked, now:`, this.checked);
    };
    
    cbWrap.appendChild(cb);
    cbWrap.appendChild(span);
    permissionsGrid.appendChild(cbWrap);
  });

  console.log('Generated manager permission checkboxes:', permissionsGrid.children.length);

  if(managerId) {
    // Tryb edycji
    const manager = managers.find(m => m.id === managerId);
    if(!manager) return;

    titleEl.textContent = 'Edycja kierownika';
    surnameInput.value = manager.surname || '';
    nameInput.value = manager.name || manager.firstname || '';
    buSelect.value = manager.bu || '';
    emailInput.value = manager.email || '';
    phoneInput.value = manager.phone || '';
    canDriveCheckbox.checked = manager.can_drive || false;
    deleteBtn.style.display = 'block';

    // Załaduj uprawnienia
    if(manager.can_drive && manager.permissions) {
      const perms = String(manager.permissions).split(',').map(s => s.trim()).filter(Boolean);
      const checkboxes = permissionsGrid.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => {
        cb.checked = perms.includes(cb.value);
      });
    }

    if(manager.can_drive) {
      permissionsSection.style.display = 'block';
    }
  } else {
    // Tryb dodawania
    titleEl.textContent = 'Dodaj kierownika';
    deleteBtn.style.display = 'none';
  }

  // Toggle permissions section
  canDriveCheckbox.onchange = () => {
    if(canDriveCheckbox.checked) {
      permissionsSection.style.display = 'block';
    } else {
      permissionsSection.style.display = 'none';
      // Odznacz wszystkie uprawnienia
      const checkboxes = permissionsGrid.querySelectorAll('input[type="checkbox"]');
      checkboxes.forEach(cb => cb.checked = false);
    }
  };

  // Handle submit
  submitBtn.onclick = async () => {
    const surname = surnameInput.value.trim();
    const name = nameInput.value.trim();
    const bu = buSelect.value.trim();
    const email = emailInput.value.trim();
    const phone = phoneInput.value.trim();
    const canDrive = canDriveCheckbox.checked;

    if(!surname || !name) {
      await showAdminNotification('Nazwisko i imię są wymagane!', 'Błąd', '⚠️');
      return;
    }

    // Zbierz wybrane uprawnienia
    let permissions = '';
    if(canDrive) {
      const checkboxes = permissionsGrid.querySelectorAll('input[type="checkbox"]:checked');
      const selectedPerms = Array.from(checkboxes).map(cb => cb.value);
      permissions = selectedPerms.join(',');
    }

    let success = false;
    if(managerId) {
      success = await updateManager(managerId, surname, name, bu, email, phone, canDrive, permissions);
    } else {
      const result = await createManager(surname, name, bu, email, phone, canDrive, permissions);
      success = result !== null;
    }

    if(success) {
      modal.style.display = 'none';
      document.body.classList.remove('modal-open');
      await renderManagers();
    }
  };

  // Handle delete
  deleteBtn.onclick = async () => {
    const ok = await showConfirmModal('Czy na pewno usunąć tego kierownika?', 'Potwierdzenie usunięcia');
    if(ok) {
      const success = await deleteManager(managerId);
      if(success) {
        modal.style.display = 'none';
        document.body.classList.remove('modal-open');
        await renderManagers();
      }
    }
  };

  // Handle cancel
  cancelBtn.onclick = () => {
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
  };

  modal.style.display = 'flex';
  document.body.classList.add('modal-open');
}

// ========== DRAG-DROP MODE ==========
function toggleDragDropMode(btn) {
  dragDropMode = !dragDropMode;
  
  if(dragDropMode) {
    btn.style.background = '#ff5722'; // Zmień kolor na aktywny
    btn.textContent = '⏹️ Zakończ Przesuwanie';
    addDragDropListeners();
    showAdminNotification('Tryb przesuwania AKTYWNY - przeciągaj pracowników!', 'Info', 'ℹ️');
  } else {
    btn.style.background = '#ff9800'; // Przywróć kolor
    btn.textContent = '🔄 Przesuń Pracowników';
    removeDragDropListeners();
    showAdminNotification('Tryb przesuwania wyłączony', 'Info', 'ℹ️');
  }
}

function addDragDropListeners() {
  const container = document.getElementById('adminManagersApp');
  if(!container) return;
  
  // Dodaj event listenery na wszystkie karty kierowników i pracowników
  setTimeout(() => {
    attachDragDropToCards();
  }, 100);
}

function attachDragDropToCards() {
  const container = document.getElementById('adminManagersApp');
  if(!container) return;
  
  // Znajdź wszystkie karty kierowników
  const managerCards = container.querySelectorAll('.manager-card');
  
  managerCards.forEach(card => {
    const managerId = card.dataset.managerId;
    if(!managerId) return;
    
    // Dodaj drop zone na karcie kierownika
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('drop', (e) => handleDrop(e, managerId));
    card.addEventListener('dragleave', handleDragLeave);
    
    // Znajdź pracowników w karcie i dodaj drag
    const empItems = card.querySelectorAll('[data-employee-id]');
    empItems.forEach(item => {
      item.draggable = true;
      item.style.cursor = 'grab';
      item.addEventListener('dragstart', (e) => handleDragStart(e, managerId));
      item.addEventListener('dragend', handleDragEnd);
    });
  });
}

function handleDragStart(e, managerId) {
  const empId = e.target.closest('[data-employee-id]').dataset.employeeId;
  draggedEmployee = empId;
  draggedFromManager = managerId;
  e.dataTransfer.effectAllowed = 'move';
  e.target.closest('[data-employee-id]').style.opacity = '0.5';
  console.log(`Dragging employee ${empId} from manager ${managerId}`);
}

function handleDragEnd(e) {
  const item = e.target.closest('[data-employee-id]');
  if(item) item.style.opacity = '1';
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const card = e.target.closest('.manager-card');
  if(card) card.style.background = '#f0f8ff';
}

function handleDragLeave(e) {
  const card = e.target.closest('.manager-card');
  if(card) card.style.background = 'white';
}

async function handleDrop(e, targetManagerId) {
  e.preventDefault();
  const card = e.target.closest('.manager-card');
  if(card) card.style.background = 'white';
  
  if(!draggedEmployee || !draggedFromManager) return;
  if(draggedFromManager === targetManagerId) {
    draggedEmployee = null;
    draggedFromManager = null;
    return; // Taki sam kierownik
  }
  
  try {
    // Update employee manager_id in database
    const { error } = await sb.from('employees').update({ manager_id: targetManagerId }).eq('id', draggedEmployee);
    
    if(error) {
      await showAdminNotification(`Błąd przesunięcia: ${error.message}`, 'Błąd', '❌');
    } else {
      await showAdminNotification('Pracownik przesunięty!', 'Sukces', '✅');
      await renderManagers();
      
      // Re-attach drag-drop listeners po re-render
      if(dragDropMode) {
        setTimeout(() => {
          attachDragDropToCards();
        }, 100);
      }
    }
  } catch(e) {
    console.error('Drop error:', e);
    await showAdminNotification(`Błąd: ${e.message}`, 'Błąd', '❌');
  }
  
  draggedEmployee = null;
  draggedFromManager = null;
}

function removeDragDropListeners() {
  const container = document.getElementById('adminManagersApp');
  if(!container) return;
  
  const managerCards = container.querySelectorAll('.manager-card');
  managerCards.forEach(card => {
    card.removeEventListener('dragover', handleDragOver);
    card.removeEventListener('dragleave', handleDragLeave);
    
    const empItems = card.querySelectorAll('[data-employee-id]');
    empItems.forEach(item => {
      item.draggable = false;
      item.style.cursor = 'default';
      item.removeEventListener('dragstart', handleDragStart);
      item.removeEventListener('dragend', handleDragEnd);
    });
  });
}

// ===========================
// LOAD CONFIGURATION FUNCTIONS
// ===========================

const DEFAULT_UTILIZATION = {
  mechanik_focke: 50,
  mechanik_protos: 50,
  senior_focke: 100,
  senior_protos: 100,
  operator_focke: 100,
  operator_protos: 100,
  pracownik_pomocniczy: 50,
  filtry: 25,
  inserty: 25
};

const UTILIZATION_LABELS = {
  mechanik_focke: 'Mech Focke',
  mechanik_protos: 'Mech Protos',
  senior_focke: 'Senior Focke',
  senior_protos: 'Senior Protos',
  operator_focke: 'Operator Focke',
  operator_protos: 'Operator Protos',
  pracownik_pomocniczy: 'Prac Pom',
  filtry: 'Filtry',
  inserty: 'Inserty'
};

const UTILIZATION_ORDER = [
  'mechanik_focke',
  'mechanik_protos',
  'senior_focke',
  'senior_protos',
  'operator_focke',
  'operator_protos',
  'pracownik_pomocniczy',
  'filtry',
  'inserty'
];

// Global state for edit mode
let loadConfigEditMode = false;
let loadConfigChanges = {}; // { machineNumber: { roleKey: value } }

async function renderLoadConfiguration() {
  const app = document.getElementById('loadConfigApp');
  if (!app) return;
  
  if (!sb) {
    app.innerHTML = '<p style="padding: 20px; color: #d9534f;">Błąd: Supabase nie jest dostępny. Zaloguj się najpierw.</p>';
    return;
  }
  
  try {
    const { data: machines, error } = await sb
      .from('machines')
      .select('*')
      .order('number', { ascending: true });
    
    if (error) throw error;
    if (!machines || machines.length === 0) {
      app.innerHTML = '<p style="padding: 20px; color: #666;">Brak maszyn w systemie</p>';
      return;
    }
    
    let html = `
      <div style="padding: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <div>
            <h3 style="margin: 0 0 8px 0; color: #333;">Konfiguracja Obciążenia Stanowisk</h3>
            <p style="margin: 0; color: #666; font-size: 14px;">
              Ustaw procentowe obciążenie dla każdego stanowiska na danej maszynie. 
              Każdy pracownik ma pulę 100% zdolności roboczej na dzień.
            </p>
          </div>
          <div style="display: flex; gap: 8px;">
    `;
    
    if (!loadConfigEditMode) {
      html += `<button id="btnEditConfig" style="padding: 8px 16px; background: #0066cc; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">✏️ Edytuj</button>`;
    } else {
      html += `
        <button id="btnSaveConfig" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">💾 Zapisz</button>
        <button id="btnCancelEdit" style="padding: 8px 16px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">✕ Anuluj</button>
      `;
    }
    
    html += `
          </div>
        </div>
        
        <table style="width: 100%; border-collapse: collapse; background: white;">
          <thead>
            <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
              <th style="padding: 12px; text-align: left; border-right: 1px solid #dee2e6; font-weight: 600; width: 120px;">Maszyna</th>
    `;
    
    // Add headers
    UTILIZATION_ORDER.forEach(key => {
      html += `<th style="padding: 12px; text-align: center; border-right: 1px solid #dee2e6; font-weight: 600; width: 100px;">${UTILIZATION_LABELS[key]}</th>`;
    });
    
    html += `
              <th style="padding: 12px; text-align: center; font-weight: 600; width: 140px;">Akcje</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Add rows
    machines.forEach(machine => {
      const utilization = machine.role_utilization || {};
      const machineNumber = machine.number || '';
      
      html += `
        <tr style="border-bottom: 1px solid #dee2e6;" data-machine-number="${machine.number}">
          <td style="padding: 12px; border-right: 1px solid #dee2e6; font-weight: 600; color: #333;">${machineNumber}</td>
      `;
      
      // Add input cells
      UTILIZATION_ORDER.forEach(key => {
        const value = utilization[key] !== undefined ? utilization[key] : DEFAULT_UTILIZATION[key];
        html += `
          <td style="padding: 12px; border-right: 1px solid #dee2e6; text-align: center;">
            <input type="number" min="0" max="200" value="${value}" 
              class="utilization-input" 
              data-machine-number="${machine.number}" 
              data-role-key="${key}"
              ${!loadConfigEditMode ? 'disabled' : ''}
              style="width: 60px; padding: 6px; border: 1px solid #ccc; border-radius: 4px; text-align: center; font-size: 14px; ${!loadConfigEditMode ? 'background: #f5f5f5; cursor: default;' : 'background: white; cursor: text;'}">
          </td>
        `;
      });
      
      html += `
          <td style="padding: 12px; text-align: center;">
            <button class="btn-reset-defaults" data-machine-number="${machine.number}" 
              ${!loadConfigEditMode ? 'disabled' : ''}
              style="padding: 6px 12px; background: ${loadConfigEditMode ? '#6c757d' : '#ccc'}; color: white; border: none; border-radius: 4px; cursor: ${loadConfigEditMode ? 'pointer' : 'default'}; font-size: 13px; ${!loadConfigEditMode ? 'opacity: 0.6;' : ''}">
              🔄 Reset
            </button>
          </td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
        <div style="margin-top: 20px; padding: 15px; background: ${loadConfigEditMode ? '#fff3cd' : '#e7f3ff'}; border-radius: 4px; color: ${loadConfigEditMode ? '#856404' : '#0066cc'}; font-size: 13px;">
          ${loadConfigEditMode ? '⚠️ Tryb edycji aktywny. Kliknij "Zapisz" aby zatwierdzić zmiany lub "Anuluj" aby wyjść bez zapisania.' : 'ℹ️ Kliknij "Edytuj" aby zmienić procentowe obciążenie stanowisk.'}
        </div>
      </div>
    `;
    
    app.innerHTML = html;
    
    // Attach event listeners
    const editBtn = app.querySelector('#btnEditConfig');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        loadConfigEditMode = true;
        loadConfigChanges = {};
        renderLoadConfiguration();
      });
    }
    
    const saveBtn = app.querySelector('#btnSaveConfig');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        await saveLoadConfigChanges();
      });
    }
    
    const cancelBtn = app.querySelector('#btnCancelEdit');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        loadConfigEditMode = false;
        loadConfigChanges = {};
        renderLoadConfiguration();
      });
    }
    
    // Attach input listeners (only track changes, don't save)
    const inputs = app.querySelectorAll('.utilization-input');
    inputs.forEach(input => {
      input.addEventListener('change', (e) => trackUtilizationChange(e));
      input.addEventListener('input', (e) => {
        if (loadConfigEditMode) {
          e.target.style.borderColor = '#ffc107';
        }
      });
    });
    
    const resetButtons = app.querySelectorAll('.btn-reset-defaults');
    resetButtons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (!loadConfigEditMode) return;
        const machineNumber = btn.dataset.machineNumber;
        if (confirm('Przywrócić domyślne wartości procentów dla tej maszyny?')) {
          if (!loadConfigChanges[machineNumber]) {
            loadConfigChanges[machineNumber] = {};
          }
          UTILIZATION_ORDER.forEach(key => {
            loadConfigChanges[machineNumber][key] = DEFAULT_UTILIZATION[key];
          });
          await renderLoadConfiguration();
        }
      });
    });
    
  } catch (error) {
    console.error('Error rendering load configuration:', error);
    app.innerHTML = `<p style="padding: 20px; color: #d9534f;">Błąd: ${error.message}</p>`;
  }
}

function trackUtilizationChange(event) {
  const input = event.target;
  const machineNumber = input.dataset.machineNumber;
  const roleKey = input.dataset.roleKey;
  let value = parseInt(input.value) || 0;
  
  // Validate range
  if (value < 0) value = 0;
  if (value > 200) value = 200;
  
  input.value = value;
  
  // Track the change locally (don't save yet)
  if (!loadConfigChanges[machineNumber]) {
    loadConfigChanges[machineNumber] = {};
  }
  loadConfigChanges[machineNumber][roleKey] = value;
  
  // Visual feedback
  input.style.borderColor = '#ffc107';
}

async function saveLoadConfigChanges() {
  try {
    // Save all changes to Supabase
    let hasChanges = false;
    
    for (const [machineNumber, changes] of Object.entries(loadConfigChanges)) {
      if (Object.keys(changes).length === 0) continue;
      hasChanges = true;
      
      // Fetch current machine data
      const { data: machine, error: fetchError } = await sb
        .from('machines')
        .select('role_utilization')
        .eq('number', machineNumber)
        .single();
      
      if (fetchError) throw fetchError;
      
      const utilization = machine.role_utilization || {};
      
      // Merge changes
      Object.assign(utilization, changes);
      
      // Save to database
      const { error: updateError } = await sb
        .from('machines')
        .update({ role_utilization: utilization })
        .eq('number', machineNumber);
      
      if (updateError) throw updateError;
    }
    
    if (!hasChanges) {
      await showAdminNotification('Brak zmian do zapisania.', 'Informacja', 'ℹ️');
    } else {
      await showAdminNotification('Zmiany zapisane!', 'Sukces', '✅');
    }
    
    // Exit edit mode and refresh
    loadConfigEditMode = false;
    loadConfigChanges = {};
    await renderLoadConfiguration();
    
  } catch (error) {
    console.error('Error saving utilization changes:', error);
    await showAdminNotification(`Błąd: ${error.message}`, 'Błąd', '❌');
  }
}

});
