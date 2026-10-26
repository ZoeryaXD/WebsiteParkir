const socket = io();

// Real-time Clock
setInterval(() => {
  document.getElementById('live-time').innerText = new Date().toLocaleTimeString();
}, 1000);

// Status Socket Connection
socket.on('connect', () => {
  const statusEl = document.getElementById('socket-status');
  statusEl.innerText = 'Connected (Real-time)';
  statusEl.className = 'text-xs px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
});

socket.on('disconnect', () => {
  const statusEl = document.getElementById('socket-status');
  statusEl.innerText = 'Disconnected';
  statusEl.className = 'text-xs px-3 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30';
});

// ==========================================
// SOCKET LISTENERS
// ==========================================

// 1. Terima Perubahan Status Slot Parkir
socket.on('SLOT_UPDATE', (slots) => {
  renderParkingGrid(slots);
});

// 2. Terima Trigger Alarm Mismatch
socket.on('ALARM_TRIGGERED', (alarmData) => {
  const banner = document.getElementById('alarm-banner');
  const detail = document.getElementById('alarm-detail');

  detail.innerText = alarmData.message;
  banner.classList.remove('hidden');
});

// 3. Terima Transaksi Selesaih
socket.on('TRANSACTION_COMPLETED', (log) => {
  addTransactionRow(log);
});

loadTransactionHistory();

// ==========================================
// RENDER FUNCTIONS
// ==========================================

function renderParkingGrid(slots) {
  const gridContainer = document.getElementById('parking-grid');
  gridContainer.innerHTML = '';

  const rows = [
    { category: 'REGULAR', title: 'Baris A', description: 'Kendaraan tanpa booking' },
    { category: 'BOOKING', title: 'Baris B', description: 'Kendaraan dengan booking' }
  ];

  rows.forEach(row => {
    const rowSlots = slots.filter(slot => slot.category === row.category);
    const rowContainer = document.createElement('section');
    rowContainer.innerHTML = `
      <div class="flex items-baseline justify-between mb-3">
        <h3 class="font-semibold text-slate-200">${row.title}</h3>
        <p class="text-xs text-slate-400">${row.description}</p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3"></div>
    `;
    const slotGrid = rowContainer.querySelector('div.grid');

    rowSlots.forEach(slot => {
    let cardBg = 'bg-emerald-950/40 border-emerald-600/50 text-emerald-200';
    let badgeBg = 'bg-emerald-500/20 text-emerald-300';
    let statusText = 'KOSONG';

    if (slot.status === 'TERISI') {
      cardBg = 'bg-rose-950/40 border-rose-600/50 text-rose-200';
      badgeBg = 'bg-rose-500/20 text-rose-300';
      statusText = 'TERISI';
    } else if (slot.category === 'BOOKING') {
      cardBg = 'bg-amber-950/40 border-amber-600/50 text-amber-200';
      badgeBg = 'bg-amber-500/20 text-amber-300';
      statusText = slot.bookedPlate ? 'BOOKED' : 'BOOKING';
    }

    const html = `
      <div class="border ${cardBg} rounded-xl p-4 flex flex-col justify-between h-36 relative transition-all">
        <div class="flex justify-between items-start">
          <span class="font-extrabold text-xl">${slot.id}</span>
          <span class="text-[10px] px-2 py-0.5 rounded-full ${badgeBg} font-semibold">${statusText}</span>
        </div>
        
        <div class="space-y-1 text-xs">
          ${slot.category === 'BOOKING' ? `<p class="text-amber-400/90 text-[11px]">Booking: <b>${slot.bookedPlate || 'Belum dipesan'}</b></p>` : ''}
          ${slot.currentPlate ? `<p class="text-rose-300 font-mono">🚗 Plat: <b>${slot.currentPlate}</b></p>` : ''}
        </div>

        <div class="text-[10px] text-slate-400">
          ${slot.entryTime ? `Masuk: ${new Date(slot.entryTime).toLocaleTimeString()}` : 'Siap Digunakan'}
        </div>
      </div>
    `;

      slotGrid.insertAdjacentHTML('beforeend', html);
    });

    gridContainer.appendChild(rowContainer);
  });
}

function addTransactionRow(log) {
  const tbody = document.getElementById('transaction-table');

  const transactionId = String(log.id || `${log.slotId}-${new Date(log.exitTime).getTime()}`);
  if (tbody.querySelector(`[data-transaction-id="${transactionId}"]`)) return;

  // Hapus baris kosong default jika ada
  if (tbody.children[0] && tbody.children[0].innerText.includes('Belum ada transaksi')) {
    tbody.innerHTML = '';
  }

  const row = `
    <tr data-transaction-id="${transactionId}" class="hover:bg-slate-700/30 transition">
      <td class="p-3 font-bold text-indigo-400">${log.slotId}</td>
      <td class="p-3 font-mono text-slate-200">${log.plate}</td>
      <td class="p-3">${log.durationMinutes} Menit</td>
      <td class="p-3 text-emerald-400 font-semibold">Rp ${log.totalCost.toLocaleString('id-ID')}</td>
      <td class="p-3 text-xs text-slate-400">${new Date(log.exitTime).toLocaleTimeString()}</td>
    </tr>
  `;

  tbody.innerHTML = row + tbody.innerHTML;
}

async function loadTransactionHistory() {
  try {
    const response = await fetch('/api/transactions');
    const result = await response.json();
    if (!response.ok || !result.success || !Array.isArray(result.data)) {
      throw new Error('Riwayat transaksi tidak dapat dimuat.');
    }

    result.data.slice().reverse().forEach(addTransactionRow);
  } catch (error) {
    console.error('Gagal memuat riwayat transaksi:', error);
  }
}

function dismissAlarm() {
  document.getElementById('alarm-banner').classList.add('hidden');
}

// ==========================================
// SIMULATOR HANDLERS (API CALLS)
// ==========================================

async function simCheckGate() {
  const plateNumber = document.getElementById('sim-gate-plate').value;
  const resultDiv = document.getElementById('gate-result');

  const res = await fetch('/api/gate/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plateNumber })
  });

  const data = await res.json();
  resultDiv.classList.remove('hidden');
  resultDiv.innerHTML = `
    <p><b>Status:</b> ${data.access}</p>
    <p><b>Tipe:</b> ${data.type || '-'}</p>
    <p>${data.message}</p>
  `;
}

async function simUpdateIR() {
  const slotId = document.getElementById('sim-ir-slot').value;
  const status = document.getElementById('sim-ir-status').value;

  await fetch('/api/slot/ir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, status })
  });
}

async function simVerifyConveyor() {
  const slotId = document.getElementById('sim-cam-slot').value;
  const detectedPlate = document.getElementById('sim-cam-plate').value;

  const res = await fetch('/api/verify-slot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slotId, detectedPlate })
  });

  const data = await res.json();
  const resultDiv = document.getElementById('slot-scan-result');
  resultDiv.classList.remove('hidden');
  resultDiv.innerText = data.message || `${data.status}: ${data.type || 'slot'}`;
}