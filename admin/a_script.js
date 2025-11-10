/**
 * admin/a_script.js
 *
 * Naprawiona wersja — idempotentne init modułu AdminMachines oraz pewne gwarancje:
 * - AdminMachines.init() bezpieczne do wywołania wielokrotnie
 * - po zalogowaniu (zarówno z głównej strony jak i z modala) zawsze:
 *    initSupabaseAdmin() -> AdminMachines.init() -> odświeżenie widoków
 *
 * Hasło domyślne: ADMIN_PASSWORD (możesz zmienić)
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
        // ignoruj jeśli dispatch nie działa
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
    // jeśli nieautoryzowany: pokaż modal i zarejestruj jednorazowy listener,
    // który wykona callback po pomyślnym zalogowaniu (dispatch 'adminAuthenticated').
    showAuthModal();

    const handler = () => {
      // po otrzymaniu zdarzenia - wykonaj inicjalizację i callback
      // odczep handler (once)
      document.removeEventListener('adminAuthenticated', handler);

      // teraz init supabase i moduły (dla pewności)
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
  let wrapEl = null;
  let listEditableEl = null;
  let newMachineInput = null;
  let addBtn = null;
  let saveOrderBtn = null;
  let exportEmpBtn = null;
  let machinesCache = [];

  // flaga, żeby init był wykonywany tylko raz (bez duplikowania listenerów)
  let _inited = false;

  function makeMuted(text){
    const d = document.createElement('div');
    d.className = 'muted';
    d.textContent = text;
    return d;
  }

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

      if(!machinesCache.length){
        wrapEl.innerHTML = '';
        wrapEl.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.innerHTML = `<thead><tr><th>Numer</th><th>Status</th><th>ord</th><th>default_view</th><th>Akcje</th></tr></thead>`;

      const tbody = document.createElement('tbody');

      machinesCache.forEach(m=>{
        const tr = document.createElement('tr');

        const num = String(m.number ?? '');
        const status = String(m.status ?? '');
        const ord = (typeof m.ord !== 'undefined' && m.ord !== null) ? m.ord : '';
        const dv = (m.default_view === true) ? 'true' : String(m.default_view);

        tr.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid #eef2f7;">${num}</td>
          <td style="padding:8px;border-bottom:1px solid #eef2f7;">${status}</td>
          <td style="padding:8px;border-bottom:1px solid #eef2f7;">${ord}</td>
          <td style="padding:8px;border-bottom:1px solid #eef2f7;">${dv}</td>
          <td style="padding:8px;border-bottom:1px solid #eef2f7;"></td>
        `;

        const actionsCell = tr.querySelector('td:last-child');

        const editBtn = document.createElement('button');
        editBtn.className = 'btn ghost small';
        editBtn.textContent = 'Edytuj status';
        editBtn.onclick = async () => {
          const newStatus = prompt(`Nowy status dla maszyny ${num}:`, status || 'Produkcja');
          if(newStatus === null) return;
          await editStatus(num, newStatus);
          await renderList();
          refreshOrderViewSafe();
        };

        const delBtn = document.createElement('button');
        delBtn.className = 'btn danger small';
        delBtn.textContent = 'Usuń';
        delBtn.style.marginLeft = '8px';
        delBtn.onclick = async () => {
          if(!confirm(`Na pewno usunąć maszynę ${num}? (to usunie też przypisania)`)) return;
          await deleteMachine(num);
          await renderList();
          refreshOrderViewSafe();
        };

        actionsCell.appendChild(editBtn);
        actionsCell.appendChild(delBtn);

        tbody.appendChild(tr);
      });

      table.appendChild(tbody);
      wrapEl.innerHTML = '';
      wrapEl.appendChild(table);
    }catch(e){
      console.error('AdminMachines.renderList error', e);
      wrapEl.innerHTML = '';
      wrapEl.appendChild(makeMuted('Błąd ładowania maszyn. Sprawdź konsolę.'));
    }
  }

  async function addMachine(number, status = 'Produkcja'){
    if(!number || !String(number).trim()) { alert('Podaj numer maszyny.'); return; }
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    const num = String(number).trim();
    try{
      const { data: exists } = await sb.from('machines').select('number').eq('number', num).limit(1);
      if(exists && exists.length){
        alert('Maszyna o numerze ' + num + ' już istnieje.');
        return;
      }

      const { data: last } = await sb.from('machines').select('ord').order('ord', { ascending:false }).limit(1).maybeSingle();
      const nextOrd = last && last.ord ? last.ord + 1 : (machinesCache.length ? machinesCache[machinesCache.length-1].ord + 1 : 1);

      const { error } = await sb.from('machines').insert([{ number: num, ord: nextOrd, default_view: true, status }]);
      if(error) { alert('Błąd dodawania: ' + (error.message || error)); return; }

      if(newMachineInput) newMachineInput.value = '';
      alert('Dodano maszynę ' + num);
      await renderList();
      refreshOrderViewSafe();
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

  async function editStatus(number, newStatus){
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    try{
      const { error } = await sb.from('machines').update({ status: newStatus }).eq('number', number);
      if(error){ alert('Błąd: ' + (error.message || error)); return; }
      alert('Zmieniono status maszyny ' + number);
    }catch(e){
      console.error('AdminMachines.editStatus error', e);
      alert('Błąd podczas zmiany statusu. Sprawdź konsolę.');
    }
  }

  async function saveOrder(){
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    if(!listEditableEl) { alert('Brak elementu do edycji kolejności.'); return; }

    const rows = Array.from(listEditableEl.querySelectorAll('.admin-machine-row'));
    if(!rows.length){ alert('Brak wierszy do zapisania.'); return; }

    try{
      for(let i=0;i<rows.length;i++){
        const num = rows[i].dataset.number;
        await sb.from('machines').update({ ord: i+1, default_view: true }).eq('number', num);
      }
      alert('Zapisano kolejność jako widok domyślny.');
      await renderList();
      refreshOrderViewSafe();
    }catch(e){
      console.error('AdminMachines.saveOrder error', e);
      alert('Błąd podczas zapisu kolejności. Sprawdź konsolę.');
    }
  }

  async function renderEditableOrderList(){
    if(!listEditableEl) return;
    listEditableEl.innerHTML = '';

    if(!sb){
      listEditableEl.appendChild(makeMuted('Brak połączenia z serwerem.'));
      return;
    }

    try{
      const { data } = await sb.from('machines').select('*').order('ord',{ascending:true});
      const machines = data || [];
      if(!machines.length){
        listEditableEl.appendChild(makeMuted('Brak maszyn w bazie.'));
        return;
      }

      machines.forEach(m=>{
        const row = document.createElement('div');
        row.className = 'admin-machine-row';
        row.dataset.number = m.number;
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '8px';
        row.style.borderBottom = '1px solid rgba(0,0,0,0.04)';

        row.innerHTML = `<div style="display:flex;align-items:center;"><span class="drag-handle" style="cursor:grab;margin-right:8px;">⇅</span><strong>${m.number}</strong><span style="margin-left:8px;color:#6b7280;font-size:13px;"> ${m.status || ''}</span></div><div><button class="btn small danger remove-machine" disabled>Usuń</button></div>`;
        listEditableEl.appendChild(row);
      });

      let dragSrc = null;
      listEditableEl.querySelectorAll('.admin-machine-row').forEach(item=>{
        item.draggable = true;
        item.addEventListener('dragstart', (e)=>{ dragSrc = item; e.dataTransfer.effectAllowed = 'move'; });
        item.addEventListener('dragover', (e)=> e.preventDefault());
        item.addEventListener('drop', (e)=>{
          e.preventDefault();
          if(dragSrc && dragSrc !== item) listEditableEl.insertBefore(dragSrc, item.nextSibling);
        });
      });
    }catch(e){
      console.error('renderEditableOrderList error', e);
      listEditableEl.appendChild(makeMuted('Błąd ładowania listy. Sprawdź konsolę.'));
    }
  }

  function refreshOrderViewSafe(){
    if(listEditableEl) renderEditableOrderList().catch(e=>console.warn(e));
  }

  async function exportEmployees(){
    if(!sb){ alert('Brak połączenia z serwerem.'); return; }
    try{
      const { data, error } = await sb.from('employees').select('*');
      if(error){ alert('Błąd: ' + (error.message || error)); return; }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'employees.json';
      a.click();
    }catch(e){
      console.error('exportEmployees error', e);
      alert('Błąd podczas eksportu. Sprawdź konsolę.');
    }
  }

  async function onShow(){
    await renderList();
  }

  /* init — idempotentne: jeśli już zainicjowane, nie podłączamy listenerów ponownie */
  function init(){
    // poczekaj na DOMContentLoaded (jeśli jeszcze nie)
    const doInit = async () => {
      if(_inited) {
        // nawet jeśli już zainicjowane, warto odświeżyć widoki
        refreshOrderViewSafe();
        try { await renderList(); } catch(e){/*ignore*/ }
        return;
      }

      wrapEl = document.getElementById('adminMachinesApp');
      listEditableEl = document.getElementById('machineListEditable');
      newMachineInput = document.getElementById('newMachineNumber');
      addBtn = document.getElementById('addMachineBtn');
      saveOrderBtn = document.getElementById('saveMachineOrderBtn');
      exportEmpBtn = document.getElementById('adminExportEmpBtn');

      // podłączania eventów - tylko raz
      if(addBtn){
        addBtn.addEventListener('click', async () => {
          const num = newMachineInput ? newMachineInput.value : prompt('Numer nowej maszyny:');
          if(!num) return alert('Podaj numer maszyny.');
          await addMachine(num, 'Produkcja');
        });
      }

      if(saveOrderBtn){
        saveOrderBtn.addEventListener('click', async () => {
          await saveOrder();
        });
      }

      if(exportEmpBtn){
        exportEmpBtn.addEventListener('click', exportEmployees);
      }

      // initial render of editable order list
      refreshOrderViewSafe();
      _inited = true;
    };

    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', doInit, { once: true });
    } else {
      doInit();
    }
  }

  return {
    init,
    renderList,
    addMachine,
    deleteMachine,
    editStatus,
    saveOrder,
    onShow,
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
      await AdminMachines.onShow();
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
