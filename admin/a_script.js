/**
 * admin/a_script.js
 *
 * Moduł administracyjny — Modyfikacja maszyn
 * Dodatkowo: formularz dodawania w modal'u (przycisk nad tabelą).
 *
 * UWAGA: podmień cały plik admin/a_script.js na poniższy.
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
  passInput.value = '';
  passInput.focus();

  function closeModal() { modal.style.display = 'none'; modal.setAttribute('aria-hidden', 'true'); }

  async function tryLogin() {
    const v = (passInput.value || '');
    if (v === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuthenticated', '1');
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
      // show the modify tab if present
      document.getElementById('tabModify')?.click();
    } else {
      alert('Błędne hasło.'); passInput.focus();
    }
  }

  okBtn.onclick = tryLogin;
  cancelBtn.onclick = () => { window.location.href = '../index.html'; };
  passInput.onkeydown = (e) => { if(e.key === 'Enter') tryLogin(); };
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

/* -------------------- AdminMachines -------------------- */
const AdminMachines = (function(){
  let wrapEl = null;
  let tbodyRef = null;
  let machinesCache = [];
  let _inited = false;

  const MAKER_OPTIONS = ['P100','P70'];
  const PAKER_OPTIONS = ['F550','F350','GD','GDX'];
  const CELA_OPTIONS = ['', '751','753'];
  const PAK_OPTIONS  = ['', '411','413','707'];
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
    controlEl.style.width = '100%';
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

  /* -------------------- ZAPIS KOLEJNOŚCI - pomocnicza funkcja -------------------- */
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
      console.log('Kolejność maszyn zapisana.');
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

  /* -------------------- OPEN ADD MODAL -------------------- */
  function openAddModal(){
    // remove existing add modal if present
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

    // grid of fields
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

    const fNum = makeField('Numer', inpNum, 'Numer identyfikacyjny maszyny (np. 11, 12).');
    const fMaker = makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70.');
    const fPaker = makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX.');
    const fCela = makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 753.');
    const fPak  = makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod: 411, 413 lub 707.');
    const fKart = makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489.');

    // append fields in order to grid
    grid.appendChild(fNum);
    grid.appendChild(fMaker);
    grid.appendChild(fPaker);
    grid.appendChild(fCela);
    grid.appendChild(fPak);
    grid.appendChild(fKart);

    // actions
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

  /* -------------------- renderList (tabela z drag handle)
     ZAMIENIONO: formularz dodawania przeniesiony do modala.
     Nad tabelą pojawia się przycisk "Dodaj maszynę".
  */
  async function renderList(){
    if(!wrapEl) return;
    wrapEl.innerHTML = '';
    wrapEl.appendChild(makeMuted('Ładuję listę maszyn...'));
    if(!sb){ wrapEl.innerHTML=''; wrapEl.appendChild(makeMuted('Brak połączenia z serwerem (offline).')); return; }

    try{
      const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true });
      if(error) throw error;
      machinesCache = data || [];

      // top row: single "Dodaj maszynę" button (nad tabelą)
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

      // tabela maszyn: pierwsza kolumna = uchwyt drag (≡)
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

      // placeholder used during drag
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

        // kolumna: drag-handle (tylko za nią zaczyna się drag)
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

        // OBSŁUGA DRAG NA HANDLE
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

      // DRAG & DROP dla tabeli (placeholder tr) + automatyczne zapisywanie po drop
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
        // automatyczne zapisanie kolejności
        const rows = Array.from(tbody.querySelectorAll('tr.admin-machine-row'));
        await saveOrderFromRows(rows);
      });

      // global cleanup
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

  /* -------------------- CRUD -------------------- */
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

  /* -------------------- Modal edycji (dynamiczny) -------------------- */
  function openEditModal(machine){
    // remove existing edit modal if present
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

    const form = document.createElement('div');
    form.style.display = 'grid';
    form.style.gridTemplateColumns = '1fr 1fr';
    form.style.gap = '8px';
    form.style.marginTop = '8px';

    const inpOld = document.createElement('input');
    inpOld.type = 'text';
    inpOld.value = machine.number || '';
    inpOld.placeholder = 'Numer maszyny';
    inpOld.style.padding = '8px';
    inpOld.style.border = '1px solid #e6eef8';
    inpOld.style.borderRadius = '6px';

    const selMaker = makeSelect(MAKER_OPTIONS, machine.maker || MAKER_OPTIONS[0]);
    const selPaker = makeSelect(PAKER_OPTIONS, machine.paker || PAKER_OPTIONS[0]);
    const selCela = makeSelect(CELA_OPTIONS, machine.celafoniarka || '');
    const selPak  = makeSelect(PAK_OPTIONS, machine.pakieciarka || '');
    const selKart = makeSelect(KART_OPTIONS, machine.kartoniarka || '');

    // layout
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

  function refreshOrderViewSafe(){
    // kept for compatibility (no separate order view now)
    return Promise.resolve();
  }

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
})();

/* -------------------- Zakładki i bootstrapping admin -------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  ensureAuthThen(() => {
    const tabModify = document.getElementById('tabModify');
    const machinesSection = document.getElementById('adminMachinesSection');
    const backToMainBtn = document.getElementById('backToMainBtn');

    async function showModify(){
      if(machinesSection) machinesSection.style.display = '';
      if(tabModify) tabModify.classList.add('active');
      await AdminMachines.renderList();
    }

    if(tabModify) tabModify.addEventListener('click', () => showModify());
    if(backToMainBtn) backToMainBtn.addEventListener('click', () => { window.location.href = '../index.html'; });

    // show modify right away after auth
    showModify();
  });
});
