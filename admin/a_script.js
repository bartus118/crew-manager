/**
 * admin/a_script.js
 *
 * Moduł administracyjny — Modyfikacja maszyn (wersja rozszerzona)
 *
 * Funkcje:
 *  - prosty client-side login (modal) — ADMIN_PASSWORD
 *  - idempotentne init modułu AdminMachines
 *  - zakładki: Kolejność (istniejąca) oraz Modyfikacja maszyn (nowa)
 *  - Modyfikacja maszyn: lista maszyn z kolumnami (Numer, Maker, Paker, Akcje)
 *      - dodawanie maszyn (number, maker, paker)
 *      - edycja maszyn (możliwość zmiany numeru + maker + paker)
 *      - usuwanie maszyn (usuwa również przypisania w tabeli assignments)
 *
 * UWAGI:
 *  - Maker: 'P100' | 'P70'
 *  - Paker: 'F550' | 'F350' | 'GD' | 'GDX'
 *  - Sesja admina jest zapisana w sessionStorage['adminAuthenticated'] = '1' (ważna do zamknięcia karty)
 *
 * Nie zmieniam niczego poza admin logic.
 */

/* -------------------- KONFIGURACJA: hasło + supabase -------------------- */
const ADMIN_PASSWORD = 'admin123'; // <- zmień jeśli chcesz inne
const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';
/* --------------------------------------------------------------------------------- */

/* poczekaj aż globalny supabase (CDN) będzie dostępny */
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

/* Inicjalizacja klienta Supabase dla admina */
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

/* -------------------- Proste uwierzytelnienie (modal) -------------------- */
/* showAuthModal() — modal logowania; po poprawnym haśle dispatchuje 'adminAuthenticated' */
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

  function closeModal() {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }

  async function tryLogin() {
    const v = (passInput.value || '');
    if (v === ADMIN_PASSWORD) {
      sessionStorage.setItem('adminAuthenticated', '1');
      closeModal();

      // po zamknięciu modala: zainicjuj supabase i moduły admina, odśwież widoki
      await initSupabaseAdmin();
      try {
        if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
          AdminMachines.init();
          try { AdminMachines.refreshOrderView(); } catch(e){/*ignore*/ }
          try { AdminMachines.renderList(); } catch(e){/*ignore*/ }
        }
      } catch(e){
        console.warn('Błąd po logowaniu przy init AdminMachines:', e);
      }

      // wyślij zdarzenie, żeby reszta skryptu wiedziała, że jesteśmy zalogowani
      try {
        document.dispatchEvent(new CustomEvent('adminAuthenticated'));
      } catch (e) {
        /* ignore */
      }

      // pokaż zakładkę Kolejność (jeśli istnieje)
      document.getElementById('tabOrder')?.click();
    } else {
      alert('Błędne hasło.');
      passInput.focus();
    }
  }

  okBtn.onclick = tryLogin;
  cancelBtn.onclick = () => {
    // użytkownik anulował — wróć do strony głównej
    window.location.href = '../index.html';
  };

  passInput.onkeydown = (e) => {
    if(e.key === 'Enter') tryLogin();
  };
}

/* Sprawdź autoryzację i zapewnij inicjalizację modułów admin */
function ensureAuthThen(cb) {
  const ok = sessionStorage.getItem('adminAuthenticated') === '1';
  if (ok) {
    // jeśli już zalogowany -> init supabase, init modułów, potem cb
    initSupabaseAdmin()
      .then(async () => {
        try {
          if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
            AdminMachines.init();
            try { AdminMachines.refreshOrderView(); } catch(e){/*ignore*/ }
            try { AdminMachines.renderList(); } catch(e){/*ignore*/ }
          }
        } catch (e) {
          console.warn('Błąd podczas init AdminMachines:', e);
        }
      })
      .then(() => { try { cb && cb(); } catch (e) { console.warn(e); } })
      .catch(err => {
        console.warn('Błąd initSupabaseAdmin w ensureAuthThen:', err);
        showAuthModal();
      });
  } else {
    // show modal and listen for custom event once
    showAuthModal();

    const handler = () => {
      document.removeEventListener('adminAuthenticated', handler);
      // po otrzymaniu auth — init i cb
      initSupabaseAdmin()
        .then(async () => {
          try {
            if (typeof AdminMachines !== 'undefined' && AdminMachines.init) {
              AdminMachines.init();
              try { AdminMachines.refreshOrderView(); } catch(e){/*ignore*/ }
              try { AdminMachines.renderList(); } catch(e){/*ignore*/ }
            }
          } catch (e) {
            console.warn('Błąd podczas init AdminMachines po zdarzeniu auth:', e);
          }
        })
        .then(() => { try { cb && cb(); } catch (e) { console.warn(e); } })
        .catch(err => {
          console.warn('Błąd initSupabaseAdmin po zdarzeniu auth:', err);
        });
    };

    document.addEventListener('adminAuthenticated', handler);
  }
}

/* -------------------- Moduł AdminMachines (idempotentny init) -------------------- */
const AdminMachines = (function(){
  let wrapEl = null;            // kontener główny (adminMachinesApp)
  let listEditableEl = null;    // lista editable (machineListEditable)
  let addFormEl = null;         // formularz dodawania
  let machinesCache = [];       // cache maszyn
  let _inited = false;          // flaga init

  // dostępne wartości — trzymaj tutaj by łatwo zmienić
  const MAKER_OPTIONS = ['P100','P70'];
  const PAKER_OPTIONS = ['F550','F350','GD','GDX'];

  function makeMuted(text){
    const d = document.createElement('div');
    d.className = 'muted';
    d.textContent = text;
    return d;
  }

  /* -------------------- renderList
     Renderuje tabelę maszyn z kolumnami: Numer | Maker | Paker | Akcje
     Dodatkowo generuje formularz dodawania nad tabelą (jeśli jeszcze nie istnieje).
  */
  async function renderList(){
    if(!wrapEl) return;
    wrapEl.innerHTML = '';
    wrapEl.appendChild(makeMuted('Ładuję listę maszyn...'));

    if(!sb){
      wrapEl.innerHTML = '';
      wrapEl.appendChild(makeMuted('Brak połączenia z Supabase (offline).'));
      return;
    }

    try{
      const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true });
      if(error) throw error;
      machinesCache = data || [];

      // NAGŁÓWEK FORMULARZA DODAWANIA
      const addBox = document.createElement('div');
      addBox.style.marginBottom = '10px';
      addBox.style.display = 'flex';
      addBox.style.flexWrap = 'wrap';
      addBox.style.gap = '8px';
      addBox.style.alignItems = 'center';

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
      MAKER_OPTIONS.forEach(mk => {
        const o = document.createElement('option'); o.value = mk; o.textContent = mk; selMaker.appendChild(o);
      });

      const selPaker = document.createElement('select');
      selPaker.style.padding = '8px';
      selPaker.style.borderRadius = '6px';
      selPaker.style.border = '1px solid #e6eef8';
      PAKER_OPTIONS.forEach(pk => {
        const o = document.createElement('option'); o.value = pk; o.textContent = pk; selPaker.appendChild(o);
      });

      const addBtn = document.createElement('button');
      addBtn.className = 'btn';
      addBtn.textContent = 'Dodaj maszynę';
      addBtn.onclick = async () => {
        const num = (inpNum.value || '').trim();
        const mk = selMaker.value;
        const pk = selPaker.value;
        if(!num){ return alert('Podaj numer maszyny.'); }
        await addMachine(num, mk, pk);
        inpNum.value = '';
      };

      addBox.appendChild(inpNum);
      addBox.appendChild(selMaker);
      addBox.appendChild(selPaker);
      addBox.appendChild(addBtn);

      wrapEl.innerHTML = '';
      wrapEl.appendChild(addBox);

      // TABELA
      if(!machinesCache || machinesCache.length === 0){
        wrapEl.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginTop = '6px';

      // nagłówki
      const thead = document.createElement('thead');
      thead.innerHTML = `<tr style="text-align:left;"><th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Numer</th><th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Maker</th><th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Paker</th><th style="padding:8px;border-bottom:1px solid rgba(0,0,0,0.06);">Akcje</th></tr>`;
      table.appendChild(thead);

      const tbody = document.createElement('tbody');

      machinesCache.forEach(m => {
        const tr = document.createElement('tr');

        const tdNum = document.createElement('td');
        tdNum.style.padding = '8px';
        tdNum.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdNum.textContent = m.number || '';

        const tdMaker = document.createElement('td');
        tdMaker.style.padding = '8px';
        tdMaker.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdMaker.textContent = m.maker || '';

        const tdPaker = document.createElement('td');
        tdPaker.style.padding = '8px';
        tdPaker.style.borderBottom = '1px solid rgba(0,0,0,0.04)';
        tdPaker.textContent = m.paker || '';

        const tdActions = document.createElement('td');
        tdActions.style.padding = '8px';
        tdActions.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

        // Edytuj -> otwiera modal edycji
        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.textContent = 'Edytuj';
        editBtn.onclick = () => openEditModal(m);

        // Usuń -> potwierdzenie + usunięcie (usuwa też assignments)
        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger small';
        delBtn.style.marginLeft = '8px';
        delBtn.textContent = 'Usuń';
        delBtn.onclick = async () => {
          if(!confirm(`Na pewno usunąć maszynę ${m.number}?`)) return;
          await deleteMachine(m.number);
          await renderList();
          // odśwież widok kolejności po usunięciu
          try { document.getElementById('saveMachineOrderBtn') && AdminMachines.refreshOrderView(); } catch(e){}
        };

        tdActions.appendChild(editBtn);
        tdActions.appendChild(delBtn);

        tr.appendChild(tdNum);
        tr.appendChild(tdMaker);
        tr.appendChild(tdPaker);
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

  /* -------------------- addMachine
     Dodaje maszynę do tabeli machines (upsert, ale tutaj preferujemy insert — sprawdzamy unikalność).
  */
  async function addMachine(number, maker='P100', paker='F550'){
    if(!number || !String(number).trim()) { alert('Podaj numer maszyny.'); return; }
    if(!MAKER_OPTIONS.includes(maker) || !PAKER_OPTIONS.includes(paker)) { alert('Błędny typ Maker/Paker.'); return; }
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }

    const num = String(number).trim();
    try{
      // sprawdź unikalność numeru
      const { data: exists } = await sb.from('machines').select('number').eq('number', num).limit(1);
      if(exists && exists.length){
        alert('Maszyna o numerze ' + num + ' już istnieje.');
        return;
      }

      // pobierz ostatni ord
      const { data: last } = await sb.from('machines').select('ord').order('ord', { ascending:false }).limit(1).maybeSingle();
      const nextOrd = last && last.ord ? last.ord + 1 : (machinesCache.length ? (machinesCache[machinesCache.length-1].ord || machinesCache.length) + 1 : 1);

      const { error } = await sb.from('machines').insert([{ number: num, ord: nextOrd, default_view: true, status: 'Produkcja', maker, paker }]);
      if(error){ alert('Błąd dodawania maszyny: ' + (error.message || error)); return; }

      alert('Dodano maszynę ' + num);
      await renderList();
      // odśwież widok kolejności
      try { AdminMachines.refreshOrderView(); } catch(e){/*ignore*/ }
    }catch(e){
      console.error('AdminMachines.addMachine error', e);
      alert('Błąd podczas dodawania maszyny. Sprawdź konsolę.');
    }
  }

  /* -------------------- deleteMachine
     Usuwa maszynę (usuwa też przypisania w assignments).
  */
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

  /* -------------------- editMachine
     Edycja rekordu maszyny: zmiana numeru, maker, paker.
     - jeśli zmiana numeru: sprawdzamy unikalność (poza aktualnym rekordem)
  */
  async function editMachine(oldNumber, newNumber, maker, paker){
    if(!newNumber || !String(newNumber).trim()) { alert('Numer nie może być pusty.'); return; }
    if(!MAKER_OPTIONS.includes(maker) || !PAKER_OPTIONS.includes(paker)) { alert('Błędny typ Maker/Paker.'); return; }
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }

    const newNum = String(newNumber).trim();
    try{
      if(newNum !== String(oldNumber)){
        // sprawdź czy nowy numer już istnieje
        const { data: exists } = await sb.from('machines').select('number').eq('number', newNum).limit(1);
        if(exists && exists.length){
          alert('Maszyna o numerze ' + newNum + ' już istnieje. Wybierz inny numer.');
          return;
        }
      }

      // aktualizuj rekord w machines
      const updates = { number: newNum, maker, paker };
      const { error } = await sb.from('machines').update(updates).eq('number', oldNumber);
      if(error){ alert('Błąd aktualizacji maszyny: ' + (error.message || error)); return; }

      // jeśli numer się zmienił, musimy również zaktualizować assignments (przypisania)
      if(newNum !== String(oldNumber)){
        await sb.from('assignments').update({ machine_number: newNum }).eq('machine_number', oldNumber);
      }

      alert('Zaktualizowano maszynę: ' + newNum);
    }catch(e){
      console.error('AdminMachines.editMachine error', e);
      alert('Błąd podczas edycji maszyny. Sprawdź konsolę.');
    }
  }

  
  
    /* -------------------- renderEditableOrderList (używane przez zakładkę Kolejność)
     Tutaj tylko pokazujemy maker/paker obok numeru, tak aby kolejność nadal była widoczna.
     WERSJA BEZ PRZYCISKU "USUŃ".
  */
  async function renderEditableOrderList(){
    const el = document.getElementById('machineListEditable');
    if(!el) return;

    // usuń stare placeholdery
    el.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
    el.innerHTML = '';

    if(!sb){
      el.appendChild(makeMuted('Brak połączenia z serwerem.'));
      return;
    }

    try{
      const { data } = await sb.from('machines').select('*').order('ord',{ascending:true});
      const machines = data || [];
      if(!machines.length){
        el.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      // placeholder
      const placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = '0px';
      placeholder.style.transition = 'height 120ms ease, opacity 120ms ease';
      placeholder.style.opacity = '0.9';
      placeholder.style.border = '2px dashed rgba(96,165,250,0.8)';
      placeholder.style.background = 'rgba(219,234,254,0.3)';
      placeholder.style.borderRadius = '8px';
      placeholder.style.margin = '6px 0';

      // utwórz wiersze
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

        // zawartość tylko: uchwyt + numer + maker/paker
        const left = document.createElement('div');
        left.style.display = 'flex';
        left.style.alignItems = 'center';
        left.innerHTML = `
          <span class="drag-handle" style="cursor:grab;margin-right:8px;">⇅</span>
          <strong>${m.number}</strong>
          <span style="margin-left:8px;color:#6b7280;font-size:13px;">(${m.maker||''}/${m.paker||''})</span>
        `;

        row.appendChild(left);
        el.appendChild(row);
      });

      // pomocnicze funkcje
      function removeAllPlaceholders() {
        el.querySelectorAll('.drag-placeholder').forEach(p => p.remove());
      }
      function clearDragClasses() {
        el.querySelectorAll('.admin-machine-row').forEach(r => r.classList.remove('drag-over','dragging'));
      }
      function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.admin-machine-row:not(.dragging)')];
        return draggableElements.find(child => {
          const box = child.getBoundingClientRect();
          return y < box.top + box.height / 2;
        }) || null;
      }

      // drag & drop
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
          removeAllPlaceholders();
          clearDragClasses();
          dragSrc = null;
        });
      });

      el.ondragover = (e) => {
        e.preventDefault();
        const after = getDragAfterElement(el, e.clientY);
        el.querySelectorAll('.drag-placeholder').forEach(p => { if(p !== placeholder) p.remove(); });
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
        clearDragClasses();
        dragSrc = null;
      };

      document.ondragend = () => {
        if(dragSrc) dragSrc.classList.remove('dragging');
        removeAllPlaceholders();
        clearDragClasses();
        dragSrc = null;
      };

      removeAllPlaceholders();
    }catch(e){
      console.error('renderEditableOrderList error', e);
      el.appendChild(makeMuted('Błąd ładowania listy. Sprawdź konsolę.'));
    }
  }



  function refreshOrderViewSafe(){
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', ()=>{ renderEditableOrderList().catch(e=>console.warn(e)); }, { once:true });
    } else {
      renderEditableOrderList().catch(e=>console.warn(e));
    }
  }

  /* -------------------- Modal edycji (dynamiczny)
     Tworzy prosty modal w DOM, wypełnia go danymi maszyny i pozwala edytować numer/maker/paker.
  */
  function openEditModal(machine){
    // utworzenie elementów modala (jeśli już istnieje - usuń stare)
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

    form.appendChild(inpOld);
    form.appendChild(selMaker);
    form.appendChild(selPaker);

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
      if(!newNum){ return alert('Numer nie może być pusty.'); }
      await editMachine(machine.number, newNum, mk, pk);
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

  /* -------------------- init (idempotentne)
     - podłącza eventy (tylko raz)
     - przygotowuje referencje do DOM
     - wykonuje początkowy render listy
  */
  function init(){
    const doInit = async () => {
      if(_inited){
        // jeśli już zainicjowane, odśwież widoki
        refreshOrderViewSafe();
        try { await renderList(); } catch(e){/*ignore*/ }
        return;
      }

      wrapEl = document.getElementById('adminMachinesApp');
      listEditableEl = document.getElementById('machineListEditable');

      // podłącz eventy do istniejących przycisków (jeśli są) - np. przycisk zapisu kolejności
      const saveOrderBtn = document.getElementById('saveMachineOrderBtn');
      if(saveOrderBtn) saveOrderBtn.addEventListener('click', async () => {
        // jeśli chcesz, można tu dodać dodatkową walidację
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

      // initial render
      try { await renderList(); } catch(e){ console.warn(e); }

      // initial render order list
      refreshOrderViewSafe();

      _inited = true;
    };

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', doInit, { once:true });
    } else {
      doInit();
    }
  }

  // expose public API
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
  // Przy starcie - najpierw zapewnij autoryzację, potem dalsza inicjalizacja.
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
      if(tabModify) { tabModify.classList.remove('ghost'); tabModify.classList.add('active'); }
      await AdminMachines.renderList();
    }

    if(tabOrder) tabOrder.addEventListener('click', () => { showOrder(); AdminMachines.refreshOrderView(); });
    if(tabModify) tabModify.addEventListener('click', () => showModify());

    if(backToMainBtn) backToMainBtn.addEventListener('click', () => {
      window.location.href = '../index.html';
    });

    // pokaż sekcję kolejności na start
    showOrder();
  });
});
