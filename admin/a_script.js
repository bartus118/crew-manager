// admin/a_script.js
// Logika panelu admina — ustawianie kolejności maszyn

const SUPABASE_URL = 'https://vuptrwfxgirrkvxkjmnn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1cHRyd2Z4Z2lycmt2eGtqbW5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NDM3NjUsImV4cCI6MjA3ODAxOTc2NX0.0hLoti7nvGQhQRsrKTt1Yy_cr5Br_XeAHsPdpAnG7NY';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const machineListEl = document.getElementById('machineList');
const reloadBtn = document.getElementById('reloadBtn');
const saveOrderBtn = document.getElementById('saveOrderBtn');

let machines = [];

/* 1) Wczytaj maszyny (tylko default_view = true, posortowane po ord) */
async function loadMachines(){
  machineListEl.innerHTML = '<div class="muted">Ładuję...</div>';
  try{
    const { data, error } = await sb.from('machines').select('*').order('ord', { ascending:true }).eq('default_view', true);
    if(error) throw error;
    machines = (data || []).map(m => ({ number: String(m.number), ord: m.ord ?? 9999 }));
    renderList();
  }catch(e){
    console.error(e);
    machineListEl.innerHTML = '<div class="muted">Błąd ładowania maszyn.</div>';
  }
}

/* 2) Render listy i drag & drop */
function renderList(){
  machineListEl.innerHTML = '';
  machines.forEach((m, idx) => {
    const row = document.createElement('div');
    row.className = 'mrow';
    row.dataset.number = m.number;
    row.draggable = true;
    row.innerHTML = `<div style="display:flex;align-items:center"><span class="drag-handle">☰</span><strong>${m.number}</strong></div><div class="status">ord: ${m.ord ?? (idx+1)}</div>`;
    machineListEl.appendChild(row);

    // drag handlers
    row.addEventListener('dragstart', (e)=>{
      row.classList.add('dragging');
      e.dataTransfer.setData('text/plain', m.number);
      e.dataTransfer.effectAllowed = 'move';
      window._dragSrc = row;
    });
    row.addEventListener('dragend', ()=>{ row.classList.remove('dragging'); window._dragSrc = null; });

    row.addEventListener('dragover', (e)=>{ e.preventDefault(); });
    row.addEventListener('drop', (e)=>{
      e.preventDefault();
      const src = window._dragSrc;
      if(!src || src === row) return;
      const rect = row.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height/2;
      if(after){
        row.parentNode.insertBefore(src, row.nextSibling);
      } else {
        row.parentNode.insertBefore(src, row);
      }
      // rebuild machines order array from DOM
      machines = Array.from(machineListEl.querySelectorAll('.mrow')).map((r,i)=>({ number: r.dataset.number, ord: i+1 }));
      // update ord display
      machineListEl.querySelectorAll('.mrow').forEach((r,i)=> r.querySelector('.status').textContent = 'ord: ' + (i+1));
    });
  });
}

/* 3) Zapisz ord do DB - aktualizujemy po kolei */
async function saveOrder(){
  if(!machines || machines.length === 0) return alert('Brak maszyn do zapisania.');
  saveOrderBtn.disabled = true;
  try{
    // rebuild machines array in case user reordered without drop event
    machines = Array.from(machineListEl.querySelectorAll('.mrow')).map((r,i)=>({ number: r.dataset.number, ord: i+1 }));

    for(let i=0;i<machines.length;i++){
      const m = machines[i];
      const { error } = await sb.from('machines').update({ ord: i+1, default_view: true }).eq('number', m.number);
      if(error) console.warn('Błąd zapisu ord dla', m.number, error);
    }
    alert('Zapisano kolejność.');
    await loadMachines();
  }catch(e){
    console.error(e);
    alert('Błąd podczas zapisu.');
  } finally {
    saveOrderBtn.disabled = false;
  }
}

reloadBtn.addEventListener('click', loadMachines);
saveOrderBtn.addEventListener('click', saveOrder);

/* initial */
loadMachines();
