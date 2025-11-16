/* rdnst.js - Moduł RDNST (Pracownicy czasowi) */

const RDNST_CONFIG = {
  archiveAfterDays: 7,
  parsePattern: /^(.+?)\s+([^()]+?)\s*(\(PP\))?\s*$/i  // "Nazwisko Imie (PP)" or "Nazwisko Imie"
};

let sb = null;

/* ============ INIT SUPABASE ============ */
async function initSupabaseRdnst() {
  try {
    await window.CONFIG.waitForSupabase();
    sb = window.supabase.createClient(
      window.CONFIG.supabase.url,
      window.CONFIG.supabase.anonKey
    );
    console.log('RDNST: Supabase ready');
  } catch (e) {
    console.warn('RDNST: Supabase init error', e);
    sb = null;
  }
}

/* ============ NOTIFICATION HELPER ============ */
async function showRdnstNotification(message, title = 'Powiadomienie', icon = 'ℹ️') {
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

/* ============ PARSER ============ */
function parseWorkerLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // Try parse "Nazwisko Imie (PP)" format
  const match = trimmed.match(RDNST_CONFIG.parsePattern);
  if (match) {
    const surname = match[1].trim();
    const firstname = match[2].trim();
    
    if (surname && firstname) {
      return { surname, firstname };
    }
  }

  // Fallback: split by space (first word = surname, rest = firstname)
  const parts = trimmed.split(/\s+/).filter(p => p);
  if (parts.length >= 2) {
    return {
      surname: parts[0],
      firstname: parts.slice(1).join(' ')
    };
  } else if (parts.length === 1) {
    return {
      surname: parts[0],
      firstname: ''
    };
  }

  return null;
}

function generateShortName(surname, firstname) {
  const s = (surname || '').toString().trim();
  const f = (firstname || '').toString().trim();

  if (!s) return '';
  if (!f) return s;

  const firstTwo = f.slice(0, 2);
  const a = firstTwo.charAt(0).toUpperCase();
  const b = firstTwo.charAt(1) ? firstTwo.charAt(1).toLowerCase() : '';
  return `${s} ${a}${b}.`;
}

/* ============ PREVIEW ============ */
async function previewImport() {
  const textInput = document.getElementById('rdnstInput').value;
  const dateInput = document.getElementById('rdnstDate').value;

  if (!dateInput) {
    await showRdnstNotification('Wybierz datę pracy', 'Błąd', '⚠️');
    return;
  }

  const lines = textInput.split('\n');
  const parsed = lines
    .map(parseWorkerLine)
    .filter(p => p !== null);

  if (parsed.length === 0) {
    await showRdnstNotification('Brak pracowników do importu. Sprawdź format.', 'Błąd', '⚠️');
    return;
  }

  const previewDiv = document.getElementById('rdnstPreview');
  previewDiv.innerHTML = '';

  const previewStatus = {
    new: 0,
    exists: 0,
    items: []
  };

  // Check które już istnieją
  if (sb) {
    for (const worker of parsed) {
      try {
        const { data: existing } = await sb
          .from('rdnst')
          .select('id')
          .eq('surname', worker.surname)
          .eq('firstname', worker.firstname)
          .eq('work_date', dateInput)
          .maybeSingle();

        const status = existing ? 'exists' : 'new';
        if (status === 'exists') previewStatus.exists++;
        else previewStatus.new++;

        previewStatus.items.push({ ...worker, status });
      } catch (e) {
        console.warn('Preview check error for', worker, e);
        previewStatus.new++;
        previewStatus.items.push({ ...worker, status: 'new' });
      }
    }
  } else {
    // Offline
    previewStatus.new = parsed.length;
    previewStatus.items = parsed.map(p => ({ ...p, status: 'new' }));
  }

  // Render preview rows
  previewStatus.items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'preview-row';
    row.innerHTML = `
      <span class="worker-name">${item.surname} ${item.firstname}</span>
      <span class="status ${item.status}">${item.status === 'new' ? '✨ NOWY' : '✓ Istnieje'}</span>
    `;
    previewDiv.appendChild(row);
  });

  // Summary
  const summary = document.createElement('div');
  summary.className = 'preview-summary';
  summary.innerHTML = `📊 Razem: ${parsed.length} | ✨ Nowych: ${previewStatus.new} | ✓ Istniejących: ${previewStatus.exists}`;
  previewDiv.appendChild(summary);

  previewDiv.style.display = 'block';
}

/* ============ IMPORT ============ */
async function importWorkers() {
  const textInput = document.getElementById('rdnstInput').value;
  const dateInput = document.getElementById('rdnstDate').value;

  if (!dateInput || !textInput.trim()) {
    await showRdnstNotification('Uzupełnij datę i listę pracowników', 'Błąd', '⚠️');
    return;
  }

  if (!sb) {
    await showRdnstNotification('Brak połączenia z serwerem', 'Błąd', '❌');
    return;
  }

  const lines = textInput.split('\n');
  const parsed = lines
    .map(parseWorkerLine)
    .filter(p => p !== null);

  if (parsed.length === 0) {
    await showRdnstNotification('Brak pracowników do importu. Sprawdź format.', 'Błąd', '⚠️');
    return;
  }

  const statusDiv = document.getElementById('rdnstStatus');
  statusDiv.innerHTML = '⏳ Importuję...';
  statusDiv.className = 'status-box';
  statusDiv.style.display = 'block';

  try {
    // Get all RDNST workers for this date
    const { data: oldWorkers } = await sb
      .from('rdnst')
      .select('id, surname, firstname')
      .eq('work_date', dateInput)
      .eq('is_archived', false);

    // Create set of new workers (surname + firstname as key)
    const newWorkerKeys = new Set(
      parsed.map(w => `${w.surname}|${w.firstname}`)
    );

    // Create map of old workers for quick lookup
    const oldWorkerMap = new Map(
      (oldWorkers || []).map(w => [`${w.surname}|${w.firstname}`, w])
    );

    const results = {
      added: 0,
      kept: 0,
      removed: 0,
      errors: []
    };

    // Step 1: Find and delete workers that are NOT in new list
    const workersToRemove = (oldWorkers || []).filter(w => {
      const key = `${w.surname}|${w.firstname}`;
      return !newWorkerKeys.has(key);
    });

    if (workersToRemove.length > 0) {
      for (const worker of workersToRemove) {
        const rdnstId = `rdnst_${worker.id}`;
        try {
          // Delete assignments for this worker
          await sb
            .from('assignments')
            .delete()
            .eq('date', dateInput)
            .eq('employee_id', rdnstId);
          
          // Delete worker from rdnst table
          await sb
            .from('rdnst')
            .delete()
            .eq('id', worker.id);
          
          console.log('Removed worker:', rdnstId);
          results.removed++;
        } catch (e) {
          console.warn('Could not remove worker', rdnstId, e);
          results.errors.push(`Nie usunięto ${worker.surname}: ${e.message}`);
        }
      }
    }

    // Step 2: Add new workers or keep existing
    for (const parsedWorker of parsed) {
      const key = `${parsedWorker.surname}|${parsedWorker.firstname}`;
      const existingWorker = oldWorkerMap.get(key);

      if (existingWorker) {
        // Worker exists - KEEP with same ID (preserves assignments!)
        results.kept++;
        console.log('Kept worker:', key);
      } else {
        // New worker - INSERT
        try {
          const shortName = generateShortName(parsedWorker.surname, parsedWorker.firstname);
          const { error } = await sb.from('rdnst').insert([{
            surname: parsedWorker.surname,
            firstname: parsedWorker.firstname,
            short_name: shortName,
            work_date: dateInput,
            is_archived: false
          }]);

          if (error) {
            results.errors.push(`${parsedWorker.surname}: ${error.message}`);
          } else {
            results.added++;
            console.log('Added worker:', key);
          }
        } catch (e) {
          results.errors.push(`${parsedWorker.surname}: ${e.message}`);
        }
      }
    }

    // Show result
    let html = `✅ <strong>Import zakończony!</strong><br>
                ➕ Dodano: <strong>${results.added}</strong><br>
                ✓ Zachowani: <strong>${results.kept}</strong><br>
                ➖ Usunięci: <strong>${results.removed}</strong><br>
                📅 Data: <strong>${dateInput}</strong>`;

    if (results.errors.length > 0) {
      html += `<br><br>⚠️ <strong>Błędy (${results.errors.length}):</strong><br>${results.errors.join('<br>')}`;
      statusDiv.className = 'status-box error';
    } else {
      statusDiv.className = 'status-box success';
    }

    statusDiv.innerHTML = html;
    statusDiv.style.display = 'block';

    // Clear input and preview
    document.getElementById('rdnstInput').value = '';
    document.getElementById('rdnstPreview').style.display = 'none';

    // Refresh list
    await loadWorkersList();

  } catch (e) {
    console.error('Import error', e);
    statusDiv.className = 'status-box error';
    statusDiv.innerHTML = `❌ <strong>Błąd:</strong> ${e.message}`;
    statusDiv.style.display = 'block';
  }
}

/* ============ LOAD WORKERS - TABELA Z DNIAMI ============ */
async function loadWorkersList() {
  const listDiv = document.getElementById('workersList');
  listDiv.innerHTML = '⏳ Ładuję...';

  if (!sb) {
    listDiv.innerHTML = '<div class="muted">❌ Brak połączenia z serwerem</div>';
    return;
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 1 dzień wstecz
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 1);
    
    // 7 dni do przodu
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 7);

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const { data: workers, error } = await sb
      .from('rdnst')
      .select('*')
      .eq('is_archived', false)
      .gte('work_date', startDateStr)
      .lte('work_date', endDateStr)
      .order('work_date', { ascending: true })
      .order('surname', { ascending: true });

    if (error) throw error;

    if (!workers || workers.length === 0) {
      listDiv.innerHTML = '<div class="muted">📭 Brak pracowników w bazie</div>';
      return;
    }

    listDiv.innerHTML = '';

    // Generate all dates from start to end
    const allDates = [];
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      allDates.push(currentDate.toISOString().split('T')[0]);
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Group workers by date
    const grouped = {};
    allDates.forEach(date => {
      grouped[date] = [];
    });
    workers.forEach(w => {
      if (grouped[w.work_date]) {
        grouped[w.work_date].push(w);
      }
    });

    // Create table
    const table = document.createElement('table');
    table.className = 'rdnst-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.marginBottom = '16px';

    // HEADER
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.style.backgroundColor = '#f0f4f8';
    headerRow.style.borderBottom = '2px solid #d4dff0';

    const nameHeader = document.createElement('th');
    nameHeader.textContent = 'Pracownik';
    nameHeader.style.padding = '12px 10px';
    nameHeader.style.textAlign = 'left';
    nameHeader.style.fontWeight = '600';
    nameHeader.style.fontSize = '13px';
    nameHeader.style.color = '#0f1724';
    nameHeader.style.minWidth = '150px';
    headerRow.appendChild(nameHeader);

    // Date headers
    allDates.forEach(date => {
      const dateHeader = document.createElement('th');
      const dateObj = new Date(date + 'T00:00:00');
      const dayName = dateObj.toLocaleDateString('pl-PL', { weekday: 'short' });
      const dayNum = dateObj.toLocaleDateString('pl-PL', { day: '2-digit' });
      const monthNum = dateObj.toLocaleDateString('pl-PL', { month: '2-digit' });
      
      dateHeader.textContent = `${dayName}\n${dayNum}.${monthNum}`;
      dateHeader.style.padding = '10px 6px';
      dateHeader.style.textAlign = 'center';
      dateHeader.style.fontWeight = '600';
      dateHeader.style.fontSize = '12px';
      dateHeader.style.color = '#0f1724';
      dateHeader.style.whiteSpace = 'pre-line';
      dateHeader.style.minWidth = '60px';
      dateHeader.style.borderRight = '1px solid #e0e0e0';
      
      headerRow.appendChild(dateHeader);
    });

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // BODY
    const tbody = document.createElement('tbody');

    // Get unique workers across all dates
    const allWorkers = new Map();
    workers.forEach(w => {
      const key = `${w.surname}|${w.firstname}`;
      if (!allWorkers.has(key)) {
        allWorkers.set(key, w);
      }
    });

    // Sort by surname
    const sortedWorkers = Array.from(allWorkers.values())
      .sort((a, b) => a.surname.localeCompare(b.surname));

    // Rows for each worker
    sortedWorkers.forEach((worker, idx) => {
      const row = document.createElement('tr');
      if (idx % 2 === 0) {
        row.style.backgroundColor = '#fafbfc';
      }
      row.style.borderBottom = '1px solid #e0e0e0';

      // Worker name column
      const nameCell = document.createElement('td');
      nameCell.innerHTML = `<div style="font-weight: 600; color: #0f1724;">${worker.surname}</div><div style="font-size: 12px; color: #666;">${worker.firstname}</div>`;
      nameCell.style.padding = '10px';
      nameCell.style.borderRight = '1px solid #e0e0e0';
      row.appendChild(nameCell);

      // Date columns - check if worker is scheduled
      allDates.forEach(date => {
        const cell = document.createElement('td');
        cell.style.padding = '8px 4px';
        cell.style.textAlign = 'center';
        cell.style.borderRight = '1px solid #e0e0e0';
        cell.style.minWidth = '60px';

        const isScheduled = grouped[date]?.some(w => w.surname === worker.surname && w.firstname === worker.firstname);
        
        if (isScheduled) {
          cell.innerHTML = '✓';
          cell.style.backgroundColor = '#c8e6c9';
          cell.style.color = '#2e7d32';
          cell.style.fontWeight = 'bold';
          cell.style.fontSize = '16px';
          cell.style.cursor = 'pointer';
          cell.title = `${worker.surname} pracuje ${date}`;
          
          // Klik - usuń z tego dnia
          cell.addEventListener('click', async () => {
            const workerOnDate = grouped[date].find(w => w.surname === worker.surname && w.firstname === worker.firstname);
            if (workerOnDate && confirm(`Usunąć ${worker.surname} z ${date}?`)) {
              await removeWorker(workerOnDate.id);
              await loadWorkersList();
            }
          });
        } else {
          cell.textContent = '–';
          cell.style.color = '#ccc';
        }

        row.appendChild(cell);
      });

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    listDiv.appendChild(table);

  } catch (e) {
    console.error('Load error', e);
    listDiv.innerHTML = `<div class="muted">❌ Błąd: ${e.message}</div>`;
  }
}

async function removeWorker(id) {
  if (!sb) return;
  try {
    await sb.from('rdnst').delete().eq('id', id);
  } catch (e) {
    console.error('Remove error', e);
    await showRdnstNotification('Błąd usuwania: ' + e.message, 'Błąd', '❌');
  }
}

/* ============ ARCHIWIZACJA ============ */
async function archiveOldWorkers() {
  if (!sb) return;

  try {
    const cutoffDate = new Date(Date.now() - RDNST_CONFIG.archiveAfterDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const { data } = await sb
      .from('rdnst')
      .update({ is_archived: true })
      .lt('work_date', cutoffDate)
      .eq('is_archived', false)
      .select('id');

    if (data && data.length > 0) {
      console.log(`RDNST: Archived ${data.length} workers older than ${cutoffDate}`);
    }
  } catch (e) {
    console.warn('RDNST: Archive error', e);
  }
}

/* ============ INIT ============ */
async function initRdnst() {
  await initSupabaseRdnst();

  // Set today's date
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('rdnstDate').value = today;
  document.getElementById('todayDate').textContent = today;

  // Attach event listeners
  document.getElementById('rdnstPreviewBtn').addEventListener('click', previewImport);
  document.getElementById('rdnstImportBtn').addEventListener('click', importWorkers);

  // Back button
  const backBtn = document.getElementById('backToMainBtn');
  if(backBtn) backBtn.addEventListener('click', () => window.location.href = './index.html');

  // Load initial list
  await loadWorkersList();

  // Archive old workers (once per session)
  await archiveOldWorkers();

  console.log('RDNST module initialized');
}

document.addEventListener('DOMContentLoaded', initRdnst);
