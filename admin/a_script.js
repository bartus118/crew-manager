/**
 * admin/a_script.js
 *
 * Moduł administracyjny — Modyfikacja maszyn + lista pracowników (z firstname/surname)
 *
 * Zmiany:
 * - pola pracownika: firstname + surname (zamiast name)
 * - dodano modal "Uprawnienia" dostępny z listy pracowników
 * - fetch/update używa firstname/surname/roles/permissions/bu
 */

/* -------------------- KONFIGURACJA: hasło + supabase -------------------- */
const ADMIN_PASSWORD = 'admin123';
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
/* --------------------------------------------------------------------------------- */

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

/* -------------------- Auth modal -------------------- */
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

/* -------------------- AdminEmployees (mini-moduł) -------------------- */
const AdminEmployees = (function(){
  let wrap = null;
  let cache = [];

 async function fetchEmployees(){
  // debug-friendly fetch — logujemy dokładnie odpowiedź i obsługujemy różne przypadki
  const debugBannerId = 'adminEmpDebugBanner';
  // usuń stary banner jeśli jest
  const old = document.getElementById(debugBannerId);
  if(old) old.remove();

  // pokaż w UI że pobieramy
  const wrapEl = document.getElementById('adminEmployeesApp');
  if(wrapEl){
    const b = document.createElement('div');
    b.id = debugBannerId;
    b.className = 'muted';
    b.style.marginBottom = '8px';
    b.textContent = 'Ładowanie pracowników... (debug)';
    wrapEl.prepend(b);
  }

  if(!sb){
    console.warn('fetchEmployees: sb (Supabase client) is NULL — nie zainicjowano klienta Supabase.');
    // pokaż komunikat w UI
    if(wrapEl){
      const e = document.createElement('div');
      e.className = 'muted';
      e.style.color = '#a33';
      e.textContent = 'Brak połączenia z Supabase (sb === null). Sprawdź czy SDK został załadowany i czy initSupabase() wykonał się poprawnie.';
      wrapEl.prepend(e);
    }
    cache = [];
    return;
  }

  try{
    // fetch bez dodatknich filtrów — pobierzemy dokładnie to co jest w tabeli employees
    const { data, error, status } = await sb.from('employees')
      .select('id,firstname,surname,bu,roles,permissions')
      .order('surname', { ascending: true });

    console.log('fetchEmployees: raw response', { status, error, count: Array.isArray(data) ? data.length : data, sample: Array.isArray(data) && data.length ? data.slice(0,5) : data });

    if(error){
      console.warn('fetchEmployees error', error);
      // pokaż błąd w UI
      if(wrapEl){
        const e = document.createElement('div');
        e.className = 'muted';
        e.style.color = '#a33';
        e.textContent = 'Błąd przy pobieraniu pracowników: ' + (error.message || JSON.stringify(error));
        wrapEl.prepend(e);
      }
      cache = [];
      return;
    }

    // upewniamy się, że data to tablica
    const rows = Array.isArray(data) ? data : [];

    // transformacja: bierzemy jedynie firstname/surname — ignorujemy name
    cache = rows.map(e => ({
      id: e.id,
      firstname: e.firstname || '',
      surname: e.surname || '',
      legacy_name: '', // ignorujemy pole name zgodnie z wymaganiem
      bu: e.bu || '',
      roles: Array.isArray(e.roles) ? e.roles.join(', ') : (e.roles || ''),
      permissions: Array.isArray(e.permissions) ? e.permissions : (e.permissions ? String(e.permissions).replace(/^{|}$/g,'').replace(/"/g,'').split(',').map(s=>s.trim()).filter(Boolean) : [])
    }));

    // dodatkowa weryfikacja — ile rekordów ma firstname/surname
    const withNames = cache.filter(x => (String(x.firstname).trim() !== '' || String(x.surname).trim() !== ''));
    console.log('fetchEmployees: total rows=', cache.length, 'with firstname/surname=', withNames.length);

    // jeśli nie ma żadnych rekordów z firstname/surname — powiadom w UI
    if(withNames.length === 0){
      if(wrapEl){
        const e = document.createElement('div');
        e.className = 'muted';
        e.style.color = '#a33';
        e.textContent = 'Uwaga: w tabeli employees nie znaleziono rekordów z uzupełnionym firstname lub surname.';
        wrapEl.prepend(e);
      }
    }
  }catch(err){
    console.error('fetchEmployees catch', err);
    if(wrapEl){
      const e = document.createElement('div');
      e.className = 'muted';
      e.style.color = '#a33';
      e.textContent = 'Wyjątek podczas pobierania pracowników. Sprawdź konsolę.';
      wrapEl.prepend(e);
    }
    cache = [];
  }
}


  /* Tworzy widok wiersza pracownika (surname + skrócone firstname) */
  function makeRow(emp){
    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';
    div.style.padding = '8px';
    div.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '10px';

    const nameBlock = document.createElement('div');
    nameBlock.style.fontWeight = '600';
    // skrócone imię: dwie litery + kropka
    const shortName = emp.firstname ? (emp.firstname.slice(0,2) + '.') : '';
    nameBlock.textContent = emp.surname ? `${emp.surname} ${shortName}` : (emp.firstname || '');
    left.appendChild(nameBlock);

    const center = document.createElement('div');
    center.textContent = emp.bu || '';
    center.style.opacity = '0.85';
    center.style.fontSize = '13px';
    center.style.minWidth = '80px';
    center.style.textAlign = 'center';
    left.appendChild(center);

    div.appendChild(left);

    // prawa część: roles + przyciski Uprawnienia i Edytuj
    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '8px';

    const roleDiv = document.createElement('div');
    roleDiv.textContent = emp.roles || '';
    roleDiv.style.opacity = '0.85';
    roleDiv.style.fontSize = '13px';
    roleDiv.style.minWidth = '140px';
    roleDiv.style.textAlign = 'right';
    right.appendChild(roleDiv);

    // PRZYCISK: Uprawnienia
    const permBtn = document.createElement('button');
    permBtn.className = 'btn small';
    permBtn.style.padding = '6px 8px';
    permBtn.textContent = 'Uprawnienia';
    permBtn.onclick = () => openPermissionsModal(emp);
    right.appendChild(permBtn);

    // PRZYCISK: Edytuj (otwiera modal edycji)
    const editBtn = document.createElement('button');
    editBtn.className = 'btn ghost small';
    editBtn.style.padding = '6px 8px';
    editBtn.textContent = 'Edytuj';
    editBtn.onclick = () => openEditEmployeeModal(emp);
    right.appendChild(editBtn);

    div.appendChild(right);
    return div;
  }

  /* Modal edycji pracownika */
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
    box.style.width = '520px';
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

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '8px';

    // Surname
    const inpSurname = document.createElement('input');
    inpSurname.type = 'text';
    inpSurname.value = emp.surname || '';
    inpSurname.placeholder = 'Nazwisko (surname)';
    inpSurname.style.padding = '8px';
    inpSurname.style.border = '1px solid #e6eef8';
    inpSurname.style.borderRadius = '6px';
    grid.appendChild(inpSurname);

    // Firstname
    const inpFirstname = document.createElement('input');
    inpFirstname.type = 'text';
    inpFirstname.value = emp.firstname || '';
    inpFirstname.placeholder = 'Imię (firstname)';
    inpFirstname.style.padding = '8px';
    inpFirstname.style.border = '1px solid #e6eef8';
    inpFirstname.style.borderRadius = '6px';
    grid.appendChild(inpFirstname);

    // BU
    const inpBu = document.createElement('input');
    inpBu.type = 'text';
    inpBu.value = emp.bu || '';
    inpBu.placeholder = 'BU';
    inpBu.style.padding = '8px';
    inpBu.style.border = '1px solid #e6eef8';
    inpBu.style.borderRadius = '6px';
    grid.appendChild(inpBu);

    // Roles (comma-separated)
    const inpRoles = document.createElement('input');
    inpRoles.type = 'text';
    inpRoles.value = emp.roles || '';
    inpRoles.placeholder = 'roles (np. mechanik_focke,operator_focke)';
    inpRoles.style.padding = '8px';
    inpRoles.style.border = '1px solid #e6eef8';
    inpRoles.style.borderRadius = '6px';
    grid.appendChild(inpRoles);

    box.appendChild(grid);

    // permissions (CSV editable)
    const permLabel = document.createElement('div');
    permLabel.textContent = 'Permissions (kody maszyn, oddzielone przecinkami)';
    permLabel.style.marginTop = '10px';
    permLabel.style.fontSize = '13px';
    permLabel.className = 'muted';
    box.appendChild(permLabel);

    const inpPerms = document.createElement('input');
    inpPerms.type = 'text';
    inpPerms.value = Array.isArray(emp.permissions) ? emp.permissions.join(',') : (emp.permissions ? String(emp.permissions).replace(/^{|}$/g,'').replace(/"/g,'') : '');
    inpPerms.placeholder = 'np. P100,F350,401';
    inpPerms.style.padding = '8px';
    inpPerms.style.border = '1px solid #e6eef8';
    inpPerms.style.borderRadius = '6px';
    inpPerms.style.width = '100%';
    box.appendChild(inpPerms);

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
      const updates = {
        surname: (inpSurname.value || '').trim(),
        firstname: (inpFirstname.value || '').trim(),
        bu: (inpBu.value || '').trim(),
        roles: (inpRoles.value || '').split(',').map(s=>s.trim()).filter(Boolean),
        permissions: (inpPerms.value || '').split(',').map(s=>s.trim()).filter(Boolean)
      };
      await saveEmployeeChanges(emp.id, updates);
      modal.remove();
      try { await renderList(); } catch(e){ console.warn(e); }
    };
    actions.appendChild(saveBtn);

    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => { if(e.target === modal) modal.remove(); });
  }

  /* Modal Uprawnień (tylko podgląd/edytowalny CSV) */
  function openPermissionsModal(emp){
    const existing = document.getElementById('permModal');
    if(existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'permModal';
    modal.className = 'modal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.style.background = 'rgba(0,0,0,0.4)';
    modal.style.zIndex = 32000;

    const box = document.createElement('div');
    box.style.width = '420px';
    box.style.maxWidth = '94%';
    box.style.background = '#fff';
    box.style.borderRadius = '8px';
    box.style.padding = '12px';
    box.style.boxShadow = '0 10px 30px rgba(0,0,0,0.15)';
    box.style.boxSizing = 'border-box';

    const title = document.createElement('h3');
    title.textContent = `Uprawnienia — ${emp.surname || emp.firstname || ''}`;
    title.style.marginTop = '0';
    box.appendChild(title);

    const info = document.createElement('div');
    info.className = 'muted';
    info.textContent = 'Wprowadź kody maszyn oddzielone przecinkami (np. P100,F350,401).';
    box.appendChild(info);

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = Array.isArray(emp.permissions) ? emp.permissions.join(',') : (emp.permissions ? String(emp.permissions).replace(/^{|}$/g,'').replace(/"/g,'') : '');
    inp.style.width = '100%';
    inp.style.marginTop = '8px';
    inp.style.padding = '8px';
    inp.style.border = '1px solid #e6eef8';
    inp.style.borderRadius = '6px';
    box.appendChild(inp);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '10px';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn outline';
    closeBtn.textContent = 'Zamknij';
    closeBtn.onclick = () => modal.remove();

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn';
    saveBtn.textContent = 'Zapisz';
    saveBtn.onclick = async () => {
      const perms = (inp.value||'').split(',').map(s=>s.trim()).filter(Boolean);
      await saveEmployeeChanges(emp.id, { permissions: perms });
      modal.remove();
      try { await renderList(); } catch(e){ console.warn(e); }
    };

    actions.appendChild(closeBtn);
    actions.appendChild(saveBtn);
    box.appendChild(actions);

    modal.appendChild(box);
    document.body.appendChild(modal);
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
          roles: updates.roles, // text[] jeśli kolumna typu array
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

  function applyFilterSort(list, query, sortField, sortDir, filterBu, filterRole){
  const q = String(query||'').trim().toLowerCase();
  let out = list.slice();

  // filtrowanie - sprawdzamy firstname + surname oraz legacy_name
  if(q) out = out.filter(e => {
    const fullname = ((e.surname||'') + ' ' + (e.firstname||'')).toLowerCase().trim();
    const legacy = (e.legacy_name||'').toLowerCase();
    return fullname.includes(q) || legacy.includes(q);
  });

  if(filterBu) out = out.filter(e => (e.bu||'') === filterBu);
  if(filterRole) out = out.filter(e => (e.roles||'').split(',').map(s=>s.trim()).includes(filterRole));

  // sortowanie - jeśli sortField jest 'bu' lub 'surname' itp.
  out.sort((a,b) => {
    let av = String(a[sortField] || '');
    let bv = String(b[sortField] || '');
    // dla sortowania po nazwisku chcemy surname + firstname
    if(sortField === 'surname' || sortField === 'fullname'){
      av = ((a.surname||'') + ' ' + (a.firstname||'')).toLowerCase();
      bv = ((b.surname||'') + ' ' + (b.firstname||'')).toLowerCase();
    } else {
      av = av.toLowerCase();
      bv = bv.toLowerCase();
    }

    if(av === bv) return ((a.surname||'') + (a.firstname||'')).localeCompare((b.surname||'') + (b.firstname||''));
    return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  return out;
}

  async function renderList(){
    if(!wrap) return;
    wrap.innerHTML = '<div class="muted">Ładuję listę pracowników...</div>';
    await fetchEmployees();
    const query = (document.getElementById('empSearchInput')?.value || '').trim();
    const sortField = (document.getElementById('empSortField')?.value || 'bu');
    const sortDir = (document.getElementById('empSortDir')?.value || 'asc');
    const filterBu = (document.getElementById('empFilterBu')?.value || '');
    const filterRole = (document.getElementById('empFilterRole')?.value || '');
    const list = applyFilterSort(cache, query, sortField, sortDir, filterBu, filterRole);

    wrap.innerHTML = '';
    if(!list.length){
      const m = document.createElement('div'); m.className = 'muted'; m.textContent = 'Brak pracowników do wyświetlenia.'; wrap.appendChild(m); return;
    }
    list.forEach(emp => wrap.appendChild(makeRow(emp)));
  }

  async function init(){
    wrap = document.getElementById('adminEmployeesApp');
    // hooki UI
    const search = document.getElementById('empSearchInput');
    const sortField = document.getElementById('empSortField');
    const sortDir = document.getElementById('empSortDir');
    const refresh = document.getElementById('refreshEmpListBtn');
    const filterBu = document.getElementById('empFilterBu');
    const filterRole = document.getElementById('empFilterRole');

    if(search) search.addEventListener('input', () => renderList());
    if(sortField) sortField.addEventListener('change', () => renderList());
    if(sortDir) sortDir.addEventListener('change', () => renderList());
    if(refresh) refresh.addEventListener('click', () => renderList());
    if(filterBu) filterBu.addEventListener('change', () => renderList());
    if(filterRole) filterRole.addEventListener('change', () => renderList());

    await renderList();
    populateFilters();
  }

  function populateFilters() {
    const buSet = new Set(cache.map(e => e.bu).filter(Boolean));
    const roleArr = [];
    cache.forEach(e => {
      if(!e.roles) return;
      e.roles.split(',').map(s=>s.trim()).forEach(r => {
        if(r && !roleArr.includes(r)) roleArr.push(r);
      });
    });

    const buSel = document.getElementById('empFilterBu');
    const roleSel = document.getElementById('empFilterRole');

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
      await AdminMachines.renderList();
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

    showModify();
  });
});
