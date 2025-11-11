/**
 * admin/a_script.js
 *
 * Moduł administracyjny — Modyfikacja maszyn (wersja z poprawionymi selectami dla urządzeń)
 *
 * Zmiany:
 * - osobne listy opcji dla celafoniarka / pakieciarka / kartoniarka
 * - selecty w formularzu dodawania i w modalu edycji używają teraz tych list
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
      document.getElementById('tabOrder')?.click();
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
  let listEditableEl = null;
  let machinesCache = [];
  let _inited = false;

  const MAKER_OPTIONS = ['P100','P70'];
  const PAKER_OPTIONS = ['F550','F350','GD','GDX'];

  // oddzielne listy opcji zgodnie z prośbą
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
    label.appendChild(document.createElement('br'));
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

  async function renderList(){
    if(!wrapEl) return;
    wrapEl.innerHTML = '';
    wrapEl.appendChild(makeMuted('Ładuję listę maszyn...'));
    if(!sb){ wrapEl.innerHTML=''; wrapEl.appendChild(makeMuted('Brak połączenia z serwerem (offline).')); return; }

    try{
      const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true });
      if(error) throw error;
      machinesCache = data || [];

      // formularz dodawania
      const addBox = document.createElement('div');
      addBox.style.marginBottom = '12px';
      addBox.style.display = 'flex';
      addBox.style.flexWrap = 'wrap';
      addBox.style.gap = '12px';
      addBox.style.alignItems = 'flex-start';

      const inpNum = document.createElement('input');
      inpNum.placeholder = 'Numer maszyny';
      inpNum.style.padding = '8px';
      inpNum.style.borderRadius = '6px';
      inpNum.style.border = '1px solid #e6eef8';
      inpNum.style.minWidth = '120px';

      const selMaker = document.createElement('select');
      selMaker.style.padding = '8px';
      selMaker.style.borderRadius = '6px';
      selMaker.style.border = '1px solid #e6eef8';
      MAKER_OPTIONS.forEach(mk => { const o = document.createElement('option'); o.value = mk; o.textContent = mk; selMaker.appendChild(o); });

      const selPaker = document.createElement('select');
      selPaker.style.padding = '8px';
      selPaker.style.borderRadius = '6px';
      selPaker.style.border = '1px solid #e6eef8';
      PAKER_OPTIONS.forEach(pk => { const o = document.createElement('option'); o.value = pk; o.textContent = pk; selPaker.appendChild(o); });

      const selCela = makeSelect(CELA_OPTIONS, '');
      const selPak  = makeSelect(PAK_OPTIONS, '');
      const selKart = makeSelect(KART_OPTIONS, '');

      const fNum = makeField('Numer', inpNum, 'Numer identyfikacyjny maszyny (np. 11, 12).');
      const fMaker = makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70.');
      const fPaker = makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX.');
      const fCela = makeField('Celafoniarka', selCela, 'Celafoniarka — wybierz kod: 751 lub 753.');
      const fPak  = makeField('Pakieciarka', selPak, 'Pakieciarka — wybierz kod: 411, 413 lub 707.');
      const fKart = makeField('Kartoniarka', selKart, 'Kartoniarka — wybierz kod: 487 lub 489.');

      const addCol = document.createElement('div');
      addCol.style.display = 'flex';
      addCol.style.flexDirection = 'column';
      addCol.style.justifyContent = 'flex-end';
      addCol.style.gap = '8px';
      const addBtn = document.createElement('button');
      addBtn.className = 'btn';
      addBtn.textContent = 'Dodaj maszynę';
      addBtn.onclick = async () => {
        const num = (inpNum.value || '').trim();
        const mk = selMaker.value;
        const pk = selPaker.value;
        const cel = selCela.value || '';
        const pak = selPak.value || '';
        const kart = selKart.value || '';
        if(!num){ return alert('Podaj numer maszyny.'); }
        await addMachine(num, mk, pk, cel, pak, kart);
        inpNum.value=''; selCela.value=''; selPak.value=''; selKart.value='';
      };
      addCol.appendChild(addBtn);

      addBox.appendChild(fNum);
      addBox.appendChild(fMaker);
      addBox.appendChild(fPaker);
      addBox.appendChild(fCela);
      addBox.appendChild(fPak);
      addBox.appendChild(fKart);
      addBox.appendChild(addCol);

      wrapEl.innerHTML = '';
      wrapEl.appendChild(addBox);

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

      machinesCache.forEach(m => {
        const tr = document.createElement('tr');
        const td = (text) => { const t = document.createElement('td'); t.style.padding='8px'; t.style.borderBottom='1px solid rgba(0,0,0,0.04)'; t.textContent = text; return t; };

        tr.appendChild(td(m.number || ''));
        tr.appendChild(td(m.maker || ''));
        tr.appendChild(td(m.paker || ''));
        tr.appendChild(td(m.celafoniarka || ''));
        tr.appendChild(td(m.pakieciarka || ''));
        tr.appendChild(td(m.kartoniarka || ''));

        const tdActions = document.createElement('td');
        tdActions.style.padding = '8px';
        tdActions.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.textContent = 'Edytuj';
        editBtn.onclick = () => openEditModal(m);

        // Usuń zostawiam, ale można łatwo usunąć jeśli chcesz
        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger small';
        delBtn.style.marginLeft = '8px';
        delBtn.textContent = 'Usuń';
        delBtn.onclick = async () => {
          if(!confirm(`Na pewno usunąć maszynę ${m.number}?`)) return;
          await deleteMachine(m.number);
          await renderList();
          try { document.getElementById('saveMachineOrderBtn') && AdminMachines.refreshOrderView(); } catch(e){}
        };

        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrapEl.appendChild(table);
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
      try { AdminMachines.refreshOrderView(); } catch(e){}
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

  async function renderEditableOrderList(){
    const el = document.getElementById('machineListEditable');
    if(!el) return;
    el.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
    el.innerHTML = '';
    if(!sb){ el.appendChild(makeMuted('Brak połączenia z serwerem.')); return; }
    try{
      const { data } = await sb.from('machines').select('*').order('ord',{ascending:true});
      const machines = data || [];
      if(!machines.length){ el.appendChild(makeMuted('Brak maszyn w bazie.')); return; }
      const placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = '0px';

      machines.forEach(m=>{
        const row = document.createElement('div');
        row.className = 'admin-machine-row';
        row.dataset.number = m.number;
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px';
        row.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        row.style.background = '#fff';
        row.style.transition = 'background 120ms ease, transform 120ms ease';
        row.draggable = true;

        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.innerHTML = `<span class="drag-handle" style="cursor:grab;margin-right:8px;">⇅</span>
                          <strong>${m.number}</strong>
                          <span style="margin-left:8px;color:#6b7280;font-size:13px;">
                            (${m.maker||''}/${m.paker||''}${m.celafoniarka? ' • ' + m.celafoniarka : ''}${m.pakieciarka? ' • ' + m.pakieciarka : ''}${m.kartoniarka? ' • ' + m.kartoniarka : ''})
                          </span>`;
        row.appendChild(left);
        el.appendChild(row);
      });

      function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.admin-machine-row:not(.dragging)')];
        return draggableElements.find(child => {
          const box = child.getBoundingClientRect();
          return y < box.top + box.height / 2;
        }) || null;
      }

      let dragSrc = null;
      el.querySelectorAll('.admin-machine-row').forEach(item=>{
        item.addEventListener('dragstart', (e) => {
          dragSrc = item;
          item.classList.add('dragging');
          const h = item.getBoundingClientRect().height;
          placeholder.style.height = `${h}px`;
          try { e.dataTransfer.setData('text/plain', 'moving'); } catch(err){}
          e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
          if (dragSrc) dragSrc.classList.remove('dragging');
          if (placeholder.parentElement) placeholder.remove();
          dragSrc = null;
        });
        item.addEventListener('dragenter', () => { if(item !== dragSrc) item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); });
      });

      el.ondragover = (e) => {
        e.preventDefault();
        const after = getDragAfterElement(el, e.clientY);
        if(after === null){
          if(el.lastElementChild !== placeholder) el.appendChild(placeholder);
        } else {
          if(after !== placeholder) el.insertBefore(placeholder, after);
        }
      };

      el.ondrop = (e) => {
        e.preventDefault();
        if(!dragSrc) return;
        if(placeholder.parentElement){
          el.insertBefore(dragSrc, placeholder);
          placeholder.remove();
        }
        dragSrc = null;
      };

      document.ondragend = () => {
        if(dragSrc) dragSrc.classList.remove('dragging');
        if(placeholder.parentElement) placeholder.remove();
        dragSrc = null;
      };

    }catch(e){
      console.error('renderEditableOrderList error', e);
      el.appendChild(makeMuted('Błąd ładowania listy. Sprawdź konsolę.'));
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
    box.style.maxWidth = '620px';
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
    form.style.gridTemplateColumns = 'repeat(auto-fit, minmax(160px, 1fr))';
    form.style.gap = '10px';
    form.style.marginTop = '8px';

    const inpOld = document.createElement('input');
    inpOld.type = 'text';
    inpOld.value = machine.number || '';
    inpOld.placeholder = 'Numer maszyny';
    inpOld.style.padding = '8px';
    inpOld.style.border = '1px solid #e6eef8';
    inpOld.style.borderRadius = '6px';

    const selMaker = document.createElement('select');
    selMaker.style.padding = '8px';
    selMaker.style.borderRadius = '6px';
    selMaker.style.border = '1px solid #e6eef8';
    MAKER_OPTIONS.forEach(mk => { const o=document.createElement('option'); o.value=mk; o.textContent=mk; selMaker.appendChild(o); });
    selMaker.value = machine.maker || MAKER_OPTIONS[0];

    const selPaker = document.createElement('select');
    selPaker.style.padding = '8px';
    selPaker.style.borderRadius = '6px';
    selPaker.style.border = '1px solid #e6eef8';
    PAKER_OPTIONS.forEach(pk => { const o=document.createElement('option'); o.value=pk; o.textContent=pk; selPaker.appendChild(o); });
    selPaker.value = machine.paker || PAKER_OPTIONS[0];

    const selCela = makeSelect(CELA_OPTIONS, machine.celafoniarka || '');
    const selPak  = makeSelect(PAK_OPTIONS,  machine.pakieciarka || '');
    const selKart = makeSelect(KART_OPTIONS, machine.kartoniarka || '');

    const fNum = makeField('Numer', inpOld, 'Numer identyfikacyjny maszyny.');
    const fMaker = makeField('Maker', selMaker, 'Typ maszyny — wybierz P100 lub P70.');
    const fPaker = makeField('Paker', selPaker, 'Model pakowarki: F550, F350, GD lub GDX.');
    const fCela = makeField('Celafoniarka', selCela, 'Celafoniarka — kod urządzenia: 751 lub 753.');
    const fPak  = makeField('Pakieciarka', selPak, 'Pakieciarka — kod urządzenia: 411, 413 lub 707.');
    const fKart = makeField('Kartoniarka', selKart, 'Kartoniarka — kod urządzenia: 487 lub 489.');

    form.appendChild(fNum);
    form.appendChild(fMaker);
    form.appendChild(fPaker);
    form.appendChild(fCela);
    form.appendChild(fPak);
    form.appendChild(fKart);

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
      refreshOrderViewSafe();
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    box.appendChild(title);
    box.appendChild(form);
    box.appendChild(actions);
    modal.appendChild(box);
    document.body.appendChild(modal);
  }

  function refreshOrderViewSafe(){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=>{ renderEditableOrderList().catch(e=>console.warn(e)); }, { once:true });
    } else {
      renderEditableOrderList().catch(e=>console.warn(e));
    }
  }

  async function init(){
    const doInit = async () => {
      if(_inited){
        refreshOrderViewSafe();
        try { await renderList(); } catch(e){}
        return;
      }

      wrapEl = document.getElementById('adminMachinesApp');
      listEditableEl = document.getElementById('machineListEditable');

      const saveOrderBtn = document.getElementById('saveMachineOrderBtn');
      if(saveOrderBtn) saveOrderBtn.addEventListener('click', async () => {
        const rows = Array.from(listEditableEl.querySelectorAll('.admin-machine-row'));
        if(!rows.length) { alert('Brak wierszy do zapisania.'); return; }
        if(!sb){ alert('Brak połączenia z serwerem.'); return; }
        try{
          for(let i=0;i<rows.length;i++){
            const num = rows[i].dataset.number;
            await sb.from('machines').update({ ord: i+1, default_view: true }).eq('number', num);
          }
          alert('Zapisano kolejność jako widok domyślny.');
          refreshOrderViewSafe();
        }catch(e){
          console.error('save order error', e);
          alert('Błąd przy zapisie kolejności. Sprawdź konsolę.');
        }
      });

      try { await renderList(); } catch(e){ console.warn(e); }
      refreshOrderViewSafe();
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
    const tabOrder = document.getElementById('tabOrder');
    const tabModify = document.getElementById('tabModify');
    const orderSection = document.getElementById('adminOrderSection');
    const machinesSection = document.getElementById('adminMachinesSection');
    const backToMainBtn = document.getElementById('backToMainBtn');

    function showOrder(){
      if(orderSection) orderSection.style.display = '';
      if(machinesSection) machinesSection.style.display = 'none';
      if(tabOrder) { tabOrder.classList.remove('ghost'); tabOrder.classList.add('active'); }
      if(tabModify) { tabModify.classList.remove('active'); tabModify.classList.add('ghost'); }
    }
    async function showModify(){
      if(orderSection) orderSection.style.display = 'none';
      if(machinesSection) machinesSection.style.display = '';
      if(tabOrder) { tabOrder.classList.remove('active'); tabOrder.classList.add('ghost'); }
      if(tabModify) tabModify.classList.remove('ghost'); tabModify.classList.add('active');
      await AdminMachines.renderList();
    }

    if(tabOrder) tabOrder.addEventListener('click', () => { showOrder(); AdminMachines.refreshOrderView(); });
    if(tabModify) tabModify.addEventListener('click', () => showModify());

    if(backToMainBtn) backToMainBtn.addEventListener('click', () => { window.location.href = '../index.html'; });

    showOrder();
  });
});
