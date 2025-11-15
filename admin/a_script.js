
/**
 * admin/a_script.js
 *
 * Pełny plik admin — AdminMachines + AdminEmployees
 * - czytelne logi błędów
 * - edycja pracownika: BU select, role multi-select, permissions checkboxy (chipy filtrów)
 * - sortowanie po surname/firstname
 * - stare filtry uprawnień (selecty) usunięte — używamy chipów
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
const PERMISSION_OPTIONS = ['P100','P70','F350','F550','GD','GDX','751','401','411','407','408','409','707','487','489'];

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

/* -------------------- AdminEmployees (z chipami i bez wcześniejszych filtrów uprawnień) -------------------- */
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

  // ----------------------------
  // Filtry uprawnień — chipy (JS)
  // ----------------------------
  // stan wybranych uprawnień (Set dla szybkich operacji)
  const selectedPermFilters = new Set();
  const selectedBuFilters = new Set();
  const selectedRoleFilters = new Set();

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
    btn.textContent = selArr.length ? selArr.join(', ') : '— Role —';
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
          e.roles.split(',').map(s=>s.trim()).forEach(r => { if(r) roleSet.add(r); });
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
        span.textContent = role;

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
        header.style.padding = '12px 0';
        header.style.width = '100%';

        const cols = [
          { label: 'Nazwisko / Imię', width: '240px', flex: '2' },
          { label: 'BU', width: '60px', flex: '0 0 80px' },
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
        topControls.style.alignItems = 'flex-start';
        topControls.style.marginBottom = '8px';
        topControls.style.width = '100%';
        // left: header
        topControls.appendChild(header);
        // right: permChips container (if exists in DOM, we'll reattach into wrap later)
        wrap.appendChild(topControls);

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
  /* === Perm bridge (safe append) ===
   Append this at the very end of a_script.js (safe, idempotent).
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

});
