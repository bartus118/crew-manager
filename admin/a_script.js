/**
 * admin/a_script.js
 *
 * Pełny plik admin — AdminMachines + AdminEmployees
 * - czytelne logi błędów
 * - edycja pracownika: BU select, role multi-select, permissions checkboxy
 * - filtr uprawnień (multi-select), sortowanie po surname/firstname
 *
 * Uwaga: dopasuj stałe (BU_OPTIONS, ROLE_OPTIONS, PERMISSION_OPTIONS) jeśli trzeba.
 */

/* -------------------- KONFIGURACJA: hasło + supabase -------------------- */
const ADMIN_PASSWORD = 'admin123';
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';

/* -------------------- Stałe pomocnicze (dostosuj jeśli trzeba) -------------------- */
const BU_OPTIONS = ['','BU1','BU2','BU3','BU4'];
const ROLE_OPTIONS = ['mechanik_focke','mechanik_protos','operator_focke','operator_protos','pracownik_pomocniczy','operator_krosowy'];
const PERMISSION_OPTIONS = ['P100','P70','F350','F550','GD','GDX','751','401','411','407','408','409','707','487','489','GD','GDX"'];

/* -------------------- Helpers: Supabase init + wait for SDK -------------------- */
function waitForSupabaseGlobal(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    if (window.supabase && typeof window.supabase.createClient === 'function') return resolve(window.supabase);
    let waited = 0;
    const iv = setInterval(() => {
      if (window.supabase && typeof window.supabase.createClient === 'function') { clearInterval(iv); return resolve(window.supabase); }
      waited += 200;
      if (waited >= timeoutMs) { clearInterval(iv); return reject(new Error('Timeout waiting for Supabase SDK')); }
    }, 200);
  });
}

let sb = null;
async function initSupabaseAdmin(){
  try {
    await waitForSupabaseGlobal();
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('admin: Supabase ready');
  } catch (e) {
    console.warn('admin: Supabase not available — offline mode', e);
    sb = null;
  }
}

/* -------------------- Auth modal (prostota) -------------------- */
function showAuthModal() {
  const modal = document.getElementById('adminAuthModal');
  const passInput = document.getElementById('adminAuthPass');
  const okBtn = document.getElementById('adminAuthBtn');
  const cancelBtn = document.getElementById('adminAuthCancel');

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
      alert('Błędne hasło.'); if(passInput) passInput.focus();
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

/* -------------------- AdminMachines (bez większych zmian) -------------------- */
const AdminMachines = (function(){
  let wrapEl = null;
  let tbodyRef = null;
  let machinesCache = [];
  let _inited = false;

  const MAKER_OPTIONS = ['P100','P70'];
  const PAKER_OPTIONS = ['F550','F350','GD','GDX'];
  const CELA_OPTIONS = ['', '751','401'];
  const PAK_OPTIONS  = ['', '411','407','408','409','707'];
  const KART_OPTIONS = ['', '487','489'];

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
    const selCela = makeSelect(CELA_OPTIONS, '');
    const selPak  = makeSelect(PAK_OPTIONS, '');
    const selKart = makeSelect(KART_OPTIONS, '');

    grid.appendChild(makeField('Numer', inpNum, 'Numer identyfikacyjny maszyny (np. 11, 12).'));
    grid.appendChild(makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70.'));
    grid.appendChild(makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX.'));
    grid.appendChild(makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 753.'));
    grid.appendChild(makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod: 411, 413 lub 707.'));
    grid.appendChild(makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489.'));

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
      const cel = selCela.value || '';
      const pak = selPak.value || '';
      const kart = selKart.value || '';
      if(!num){ return alert('Podaj numer maszyny.'); }
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
      const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true });
      if(error) throw error;
      machinesCache = data || [];

      const topRow = document.createElement('div');
      topRow.style.display = 'flex';
      topRow.style.justifyContent = 'flex-start';
      topRow.style.marginBottom = '10px';

      const addBtn = document.createElement('button');
      addBtn.className = 'btn';
      addBtn.textContent = 'Dodaj maszynę';
      addBtn.onclick = () => openAddModal();

      topRow.appendChild(addBtn);
      wrapEl.innerHTML = '';
      wrapEl.appendChild(topRow);

      if(!machinesCache || machinesCache.length === 0){
        wrapEl.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginTop = '6px';
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr style="text-align:left;">
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);width:36px;"></th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Numer</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Maker</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Paker</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Celafoniarka</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Pakieciarka</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Kartoniarka</th>
        <th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Akcje</th>
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
        tdHandle.style.padding = '8px';
        tdHandle.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
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
        tdNum.style.padding = '8px';
        tdNum.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdNum.textContent = m.number || '';
        tr.appendChild(tdNum);

        const tdMaker = document.createElement('td');
        tdMaker.style.padding = '8px';
        tdMaker.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdMaker.textContent = m.maker || '';
        tr.appendChild(tdMaker);

        const tdPaker = document.createElement('td');
        tdPaker.style.padding = '8px';
        tdPaker.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdPaker.textContent = m.paker || '';
        tr.appendChild(tdPaker);

        const tdCela = document.createElement('td');
        tdCela.style.padding = '8px';
        tdCela.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdCela.textContent = m.celafoniarka || '';
        tr.appendChild(tdCela);

        const tdPak = document.createElement('td');
        tdPak.style.padding = '8px';
        tdPak.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdPak.textContent = m.pakieciarka || '';
        tr.appendChild(tdPak);

        const tdKart = document.createElement('td');
        tdKart.style.padding = '8px';
        tdKart.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdKart.textContent = m.kartoniarka || '';
        tr.appendChild(tdKart);

        const tdActions = document.createElement('td');
        tdActions.style.padding = '8px';
        tdActions.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.textContent = 'Edytuj';
        editBtn.onclick = () => openEditModal(m);

        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger small';
        delBtn.style.marginLeft = '8px';
        delBtn.textContent = 'Usuń';
        delBtn.onclick = async () => {
          if(!confirm(`Na pewno usunąć maszynę ${m.number}?`)) return;
          await deleteMachine(m.number);
          await renderList();
        };

        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);
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
    if(!number || !String(number).trim()) { alert('Podaj numer maszyny.'); return; }
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    const num = String(number).trim();
    try{
      const { data: exists } = await sb.from('machines').select('number').eq('number', num).limit(1);
      if(exists && exists.length){ alert('Maszyna o numerze ' + num + ' już istnieje.'); return; }
      const { data: last } = await sb.from('machines').select('ord').order('ord', { ascending:false }).limit(1).maybeSingle();
      const nextOrd = last && last.ord ? last.ord + 1 : (machinesCache.length ? (machinesCache[machinesCache.length-1].ord || machinesCache.length) + 1 : 1);
      const insertObj = { number: num, ord: nextOrd, default_view: true, status: 'Produkcja', maker, paker, celafoniarka, pakieciarka, kartoniarka };
      const { error } = await sb.from('machines').insert([insertObj]);
      if(error){ alert('Błąd dodawania maszyny: ' + (error.message || error)); return; }
      alert('Dodano maszynę ' + num);
      await renderList();
    }catch(e){
      console.error('AdminMachines.addMachine error', e);
      alert('Błąd podczas dodawania maszyny. Sprawdź konsolę.');
    }
  }

  async function deleteMachine(number){
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    try{
      await sb.from('assignments').delete().eq('machine_number', number);
      const { error } = await sb.from('machines').delete().eq('number', number);
      if(error){ alert('Błąd usuwania maszyny: ' + (error.message || error)); return; }
      alert('Usunięto maszynę ' + number);
    }catch(e){
      console.error('AdminMachines.deleteMachine error', e);
      alert('Błąd podczas usuwania. Sprawdź konsolę.');
    }
  }

  async function editMachine(oldNumber, newNumber, maker, paker, celafoniarka, pakieciarka, kartoniarka){
    if(!newNumber || !String(newNumber).trim()) { alert('Numer nie może być pusty.'); return; }
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    const newNum = String(newNumber).trim();
    try{
      if(newNum !== String(oldNumber)){
        const { data: exists } = await sb.from('machines').select('number').eq('number', newNum).limit(1);
        if(exists && exists.length){ alert('Maszyna o numerze ' + newNum + ' już istnieje.'); return; }
      }
      const updates = { number: newNum, maker, paker, celafoniarka, pakieciarka, kartoniarka };
      const { error } = await sb.from('machines').update(updates).eq('number', oldNumber);
      if(error){ alert('Błąd aktualizacji maszyny: ' + (error.message || error)); return; }
      if(newNum !== String(oldNumber)){
        await sb.from('assignments').update({ machine_number: newNum }).eq('machine_number', oldNumber);
      }
      alert('Zaktualizowano maszynę: ' + newNum);
    }catch(e){
      console.error('AdminMachines.editMachine error', e);
      alert('Błąd podczas edycji maszyny. Sprawdź konsolę.');
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
    const selCela = makeSelect(CELA_OPTIONS, machine.celafoniarka || '');
    const selPak  = makeSelect(PAK_OPTIONS, machine.pakieciarka || '');
    const selKart = makeSelect(KART_OPTIONS, machine.kartoniarka || '');

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
    leftCol.appendChild(makeField('Numer', inpOld, 'Numer identyfikacyjny maszyny (np. 11, 12).'));
    leftCol.appendChild(makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70.'));
    leftCol.appendChild(makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX.'));

    const rightCol = document.createElement('div');
    rightCol.style.display = 'flex';
    rightCol.style.flexDirection = 'column';
    rightCol.style.gap = '8px';
    rightCol.appendChild(makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 753.'));
    rightCol.appendChild(makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod: 411, 413 lub 707.'));
    rightCol.appendChild(makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489.'));

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
      const cel = selCela.value || '';
      const pak = selPak.value || '';
      const kart = selKart.value || '';
      if(!newNum){ return alert('Numer nie może być pusty.'); }
      await editMachine(machine.number, newNum, mk, pk, cel, pak, kart);
      modal.remove();
      await renderList();
    };

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

/* -------------------- AdminEmployees (z filtrowaniem/sortowaniem + modal edycji) -------------------- */
const AdminEmployees = (function(){
  let wrap = null;      // element do renderowania listy
  let cache = [];       // pobrane dane pracowników (znormalizowane)

  /* ---- fetchEmployees: pobiera tylko firstname,surname,bu,roles,permissions,id ---- */
  async function fetchEmployees(){
    const wrapEl = document.getElementById('adminEmployeesApp');
    try {
      if(!sb){
        console.warn('fetchEmployees: sb (Supabase client) is NULL — offline mode');
        cache = [];
        return;
      }

      const { data, error, status } = await sb.from('employees')
        .select('id,firstname,surname,bu,roles,permissions')
        .order('surname', { ascending: true });

      console.debug('fetchEmployees: response status=', status, 'error=', error ? error.message : null);
      if(error){
        console.warn('fetchEmployees error', error);
        cache = [];
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      cache = rows.map(e => ({
        id: e.id,
        firstname: e.firstname || '',
        surname: e.surname || '',
        legacy_name: '',
        bu: e.bu || '',
        roles: Array.isArray(e.roles) ? e.roles.join(', ') : (e.roles || ''),
        permissions: Array.isArray(e.permissions) ? e.permissions : (e.permissions ? String(e.permissions).replace(/^{|}$/g,'').replace(/"/g,'').split(',').map(s=>s.trim()).filter(Boolean) : [])
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

    // Role
    const rolesCol = document.createElement('div');
    rolesCol.style.flex = '2';
    rolesCol.textContent = emp.roles || '';

    // Uprawnienia (permissions)
    const permsCol = document.createElement('div');
    permsCol.style.flex = '2';
    permsCol.style.whiteSpace = 'nowrap';
    permsCol.style.overflow = 'hidden';
    permsCol.style.textOverflow = 'ellipsis';
    permsCol.title = Array.isArray(emp.permissions) ? emp.permissions.join(', ') : (emp.permissions || '');
    permsCol.textContent = Array.isArray(emp.permissions) ? emp.permissions.join(', ') : (emp.permissions || '');

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

    [nameCol, buCol, rolesCol, permsCol, actionsCol].forEach(c => row.appendChild(c));
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
    modal.style.zIndex = 30000;

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
    hint.textContent = 'Uzupełnij pola. Role możesz wybrać wiele (Ctrl/Cmd+klik). Uprawnienia wybierz z checkboxów.';
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
    const existingRoles = Array.isArray(emp.roles) ? emp.roles.map(r=>String(r).trim()) : (emp.roles ? String(emp.roles).split(',').map(s=>s.trim()) : []);
    ROLE_OPTIONS.forEach(r => {
      const o = document.createElement('option');
      o.value = r;
      o.textContent = r;
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

    // action buttons
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

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

      const updates = {
        surname: (inpSurname.value || '').trim(),
        firstname: (inpFirstname.value || '').trim(),
        bu: (selBu.value || '').trim(),
        roles: selectedRoles,
        permissions: checkedPerms
      };

      // minimalna walidacja
      if(!updates.surname && !updates.firstname){
        if(!confirm('Nazwisko i imię są puste — chcesz zapisać mimo to?')) return;
      }

      try {
        await saveEmployeeChanges(emp.id, updates);
        modal.remove();
        try { await renderList(); } catch(e){ console.warn(e); }
      } catch (e) {
        console.error('Błąd zapisu pracownika z modala:', e);
        alert('Błąd podczas zapisu — sprawdź konsolę.');
      }
    };
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
        const payload = {
          surname: updates.surname,
          firstname: updates.firstname,
          bu: updates.bu,
          roles: updates.roles, // as array/text[] type
          permissions: updates.permissions
        };
        const { error } = await sb.from('employees').update(payload).eq('id', empId);
        if(error){ alert('Błąd zapisu: ' + (error.message || error)); console.error(error); return; }
        const idx = cache.findIndex(x => x.id === empId);
        if(idx > -1) cache[idx] = Object.assign({}, cache[idx], payload);
        alert('Zapisano zmiany.');
      }catch(e){
        console.error('saveEmployeeChanges error', e);
        alert('Błąd podczas zapisu. Sprawdź konsolę.');
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
        alert('Zapisano lokalnie (offline).');
      } else {
        alert('Nie znaleziono pracownika w pamięci lokalnej.');
      }
    }
  }

  /* applyFilterSort: teraz obsługuje filterPerms (array) oraz sort po firstname/surname */
  function applyFilterSort(list, query, sortField, sortDir, filterBu, filterRole, filterPerms){
    const q = String(query||'').trim().toLowerCase();
    let out = list.slice();

    // filtrowanie tekstowe - firstname/surname
    if(q) out = out.filter(e => {
      const fullname = ((e.surname||'') + ' ' + (e.firstname||'')).toLowerCase().trim();
      const legacy = (e.legacy_name||'').toLowerCase();
      return fullname.includes(q) || legacy.includes(q);
    });

    if(filterBu) out = out.filter(e => (e.bu||'') === filterBu);
    if(filterRole) out = out.filter(e => (e.roles||'').split(',').map(s=>s.trim()).includes(filterRole));

    // filtr uprawnień (filterPerms: pokazujemy tych którzy mają WSZYSTKIE zaznaczone perms)
    if(Array.isArray(filterPerms) && filterPerms.length > 0){
      out = out.filter(e => {
        const perms = Array.isArray(e.permissions) ? e.permissions : (e.permissions ? String(e.permissions).split(',').map(s=>s.trim()) : []);
        return filterPerms.every(fp => perms.includes(fp));
      });
    }

    // sortowanie
    out.sort((a,b) => {
      let av, bv;
      if(sortField === 'surname'){
        av = ((a.surname||'') + ' ' + (a.firstname||'')).toLowerCase();
        bv = ((b.surname||'') + ' ' + (b.firstname||'')).toLowerCase();
      } else if(sortField === 'firstname'){
        av = String(a.firstname || '').toLowerCase();
        bv = String(b.firstname || '').toLowerCase();
        if(av === bv) { av = ((a.surname||'') + ' ' + (a.firstname||'')).toLowerCase(); bv = ((b.surname||'') + ' ' + (b.firstname||'')).toLowerCase(); }
      } else {
        av = String(a[sortField] || '').toLowerCase();
        bv = String(b[sortField] || '').toLowerCase();
      }

      if(av === bv) return ((a.surname||'') + (a.firstname||'')).localeCompare((b.surname||'') + (b.firstname||''));
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return out;
  }

  /* renderList: rysuje nagłówki + wiersze; korzysta z cache */
  async function renderList(){
    if(!wrap) return;
    wrap.innerHTML = '';
    const statusLine = document.createElement('div');
    statusLine.className = 'muted';
    statusLine.textContent = 'Ładuję listę pracowników...';
    wrap.appendChild(statusLine);

    await fetchEmployees();

    // odczytaj filtry / sort
    const query = (document.getElementById('empSearchInput')?.value || '').trim();
    const sortField = (document.getElementById('empSortField')?.value || 'bu');
    const sortDir = (document.getElementById('empSortDir')?.value || 'asc');
    const filterBu = (document.getElementById('empFilterBu')?.value || '');
    const filterRole = (document.getElementById('empFilterRole')?.value || '');
    const filterPermsEl = document.getElementById('empFilterPerms');
    const filterPerms = filterPermsEl ? Array.from(filterPermsEl.selectedOptions).map(o => o.value).filter(Boolean) : [];

    // header (nagłówki kolumn)
    const header = document.createElement('div');
    header.className = 'admin-emp-header';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.fontWeight = '600';
    header.style.fontSize = '14px';
    header.style.background = '#f8f9fa';
    header.style.borderBottom = '1px solid #ddd';
    header.style.padding = '8px 12px';

    const cols = [
      { label: 'Nazwisko / Imię', flex: '2', align: 'left' },
      { label: 'BU', flex: '0 0 80px', align: 'center' },
      { label: 'Role', flex: '2', align: 'left' },
      { label: 'Uprawnienia', flex: '2', align: 'left' },
      { label: 'Akcje', flex: '0 0 120px', align: 'right' }
    ];
    header.innerHTML = '';
    cols.forEach(col => {
      const el = document.createElement('div');
      el.textContent = col.label;
      el.style.flex = col.flex;
      el.style.textAlign = col.align;
      header.appendChild(el);
    });
    wrap.innerHTML = '';
    wrap.appendChild(header);

    // body rows
    const filtered = applyFilterSort(cache, query, sortField, sortDir, filterBu, filterRole, filterPerms);
    if(!filtered.length){
      const m = document.createElement('div');
      m.className = 'muted';
      m.style.padding = '10px';
      m.textContent = 'Brak pracowników do wyświetlenia (sprawdź filtry).';
      wrap.appendChild(m);
      return;
    }

    filtered.forEach(emp => {
      wrap.appendChild(makeRow(emp));
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
    const filterBu = document.getElementById('empFilterBu');
    const filterRole = document.getElementById('empFilterRole');
    const permFilter = document.getElementById('empFilterPerms');

    if(search) search.addEventListener('input', () => renderList());
    if(sortField) sortField.addEventListener('change', () => renderList());
    if(sortDir) sortDir.addEventListener('change', () => renderList());
    if(refresh) refresh.addEventListener('click', () => renderList());
    if(filterBu) filterBu.addEventListener('change', () => renderList());
    if(filterRole) filterRole.addEventListener('change', () => renderList());
    if(permFilter) permFilter.addEventListener('change', () => renderList());

    // initial render & populate filters
    await renderList();
    populateFilters();
  }

  function populateFilters() {
    // bu set
    const buSet = new Set(cache.map(e => e.bu).filter(Boolean));
    const roleArr = [];
    const permSet = new Set();

    cache.forEach(e => {
      if(e.roles){
        e.roles.split(',').map(s=>s.trim()).forEach(r => { if(r && !roleArr.includes(r)) roleArr.push(r); });
      }
      const permsArr = Array.isArray(e.permissions) ? e.permissions : (e.permissions ? String(e.permissions).split(',').map(s=>s.trim()) : []);
      permsArr.forEach(p => { if(p) permSet.add(p); });
    });

    const buSel = document.getElementById('empFilterBu');
    const roleSel = document.getElementById('empFilterRole');
    const permSel = document.getElementById('empFilterPerms');

    if(buSel && buSel.options.length <= 1) {
      Array.from(buSet).sort().forEach(b => {
        const opt = document.createElement('option');
        opt.value = b; opt.textContent = b;
        buSel.appendChild(opt);
      });
    }

    if(roleSel && roleSel.options.length <= 1) {
      roleArr.sort().forEach(r => {
        const opt = document.createElement('option');
        opt.value = r; opt.textContent = r;
        roleSel.appendChild(opt);
      });
    }

    if(permSel && permSel.options.length === 0){
      Array.from(permSet).sort().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        permSel.appendChild(opt);
      });
    }
  }

  return { init, renderList };
})(); // koniec AdminEmployees

// expose modules to window
window.AdminMachines = AdminMachines;
window.AdminEmployees = AdminEmployees;

/* -------------------- Zakładki i bootstrapping admin -------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  ensureAuthThen(() => {
    const tabModify = document.getElementById('tabModify');
    const tabEmployees = document.getElementById('tabEmployees');
    const machinesSection = document.getElementById('adminMachinesSection');
    const employeesSection = document.getElementById('adminEmployeesSection');
    const backToMainBtn = document.getElementById('backToMainBtn');

    async function showModify(){
      if(machinesSection) machinesSection.style.display = '';
      if(employeesSection) employeesSection.style.display = 'none';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      if(tabModify) tabModify.classList.add('active');
      try { await AdminMachines.renderList(); } catch(e){ console.warn('showModify renderList error', e); }
    }

    async function showEmployees(){
      if(machinesSection) machinesSection.style.display = 'none';
      if(employeesSection) employeesSection.style.display = '';
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      if(tabEmployees) tabEmployees.classList.add('active');
      try { await AdminEmployees.init(); } catch(e){ console.warn('Błąd init AdminEmployees', e); }
    }

    if(tabModify) tabModify.addEventListener('click', () => showModify());
    if(tabEmployees) tabEmployees.addEventListener('click', () => showEmployees());
    if(backToMainBtn) backToMainBtn.addEventListener('click', () => { window.location.href = '../index.html'; });

    // open machines by default
    showModify();
  });
});
