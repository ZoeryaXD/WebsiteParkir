const bookingSocket = io();
const slotContainer = document.getElementById('booking-slots');
const availabilityCount = document.getElementById('availability-count');
const selectedSlotLabel = document.getElementById('selected-slot');
const plateInput = document.getElementById('plate-number');
const bookingForm = document.getElementById('booking-form');
const submitButton = document.getElementById('submit-booking');
const bookingMessage = document.getElementById('booking-message');
const connectionStatus = document.getElementById('connection-status');
const digitalTicket = document.getElementById('digital-ticket');
const printTicketButton = document.getElementById('print-ticket');

let bookingSlots = [];
let selectedSlotId = null;
let countdownTimer = null;
let activeBooking = null;

bookingSocket.on('connect', () => {
  connectionStatus.textContent = 'Live';
});

bookingSocket.on('disconnect', () => {
  connectionStatus.textContent = 'Offline';
});

bookingSocket.on('SLOT_UPDATE', loadBookingSlots);

async function loadBookingSlots() {
  try {
    const response = await fetch('/api/bookings/slots');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error('Slot tidak dapat dimuat.');
    bookingSlots = result.data;
    renderBookingSlots();
    syncActiveBooking();
  } catch (error) {
    availabilityCount.textContent = 'Gagal memuat';
    slotContainer.innerHTML = '<p class="slot-state">Tidak dapat terhubung ke server. Muat ulang halaman untuk mencoba lagi.</p>';
  }
}

function renderBookingSlots() {
  const availableCount = bookingSlots.filter(slot => slot.available).length;
  availabilityCount.textContent = `${availableCount} dari ${bookingSlots.length} tersedia`;
  slotContainer.replaceChildren();

  if (selectedSlotId && !bookingSlots.some(slot => slot.id === selectedSlotId && slot.available)) {
    selectedSlotId = null;
  }

  bookingSlots.forEach(slot => {
    const available = slot.available;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slot-option${available ? '' : ' is-booked'}${selectedSlotId === slot.id ? ' is-selected' : ''}`;
    button.disabled = !available;
    button.setAttribute('aria-pressed', String(selectedSlotId === slot.id));

    const name = document.createElement('span');
    name.className = 'slot-name';
    name.textContent = slot.id;

    const state = document.createElement('span');
    state.className = 'slot-state';
    state.innerHTML = '<i class="state-dot" aria-hidden="true"></i>';
    state.append(available ? 'Tersedia' : 'Terbooking');
    button.append(name, state);

    if (available) {
      button.addEventListener('click', () => {
        selectedSlotId = slot.id;
        selectedSlotLabel.textContent = slot.id;
        submitButton.disabled = false;
        renderBookingSlots();
      });
    }

    slotContainer.append(button);
  });

  if (!selectedSlotId) {
    selectedSlotLabel.textContent = 'Belum dipilih';
    submitButton.disabled = true;
  }
}

function showBookingMessage(message, isError = false) {
  bookingMessage.hidden = false;
  bookingMessage.classList.toggle('is-error', isError);
  bookingMessage.textContent = message;
}

bookingForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedSlotId) return;

  submitButton.disabled = true;
  showBookingMessage('Memproses booking...');

  try {
    const response = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: selectedSlotId, plateNumber: plateInput.value })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Booking tidak berhasil.');

    const bookedSlot = result.booking.slotId;
    const expiresAt = new Date(result.booking.expiresAt);
    activeBooking = { slotId: bookedSlot, plateNumber: result.booking.plateNumber };
    localStorage.setItem('parkingDigitalTicketId', result.booking.ticket.id);
    renderDigitalTicket(result.booking.ticket);
    selectedSlotId = null;
    selectedSlotLabel.textContent = bookedSlot;
    showBookingMessage(`Booking slot ${bookedSlot} berhasil. Plat ${result.booking.plateNumber} harus terdeteksi sebelum ${expiresAt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}.`);
    startExpiryCountdown(expiresAt);
    await loadBookingSlots();
  } catch (error) {
    showBookingMessage(error.message, true);
    submitButton.disabled = !selectedSlotId;
    await loadBookingSlots();
  }
});

function renderDigitalTicket(ticket) {
  digitalTicket.hidden = false;
  document.getElementById('ticket-qr').src = ticket.qrImageDataUrl;
  document.getElementById('ticket-plate').textContent = ticket.plateNumber;
  document.getElementById('ticket-slot').textContent = ticket.slotId;
  document.getElementById('ticket-printed-at').textContent = new Date(ticket.printedAt).toLocaleString('id-ID');
  document.getElementById('ticket-status').textContent = ticket.status === 'ACTIVE' ? 'Aktif' : ticket.status;
}

async function restoreDigitalTicket() {
  const ticketId = localStorage.getItem('parkingDigitalTicketId');
  if (!ticketId) return;

  try {
    const response = await fetch(`/api/tickets/${encodeURIComponent(ticketId)}`);
    const result = await response.json();
    if (!response.ok || !result.success) {
      localStorage.removeItem('parkingDigitalTicketId');
      return;
    }
    renderDigitalTicket(result.ticket);
  } catch (error) {
    console.error('Gagal memuat karcis digital:', error);
  }
}

printTicketButton.addEventListener('click', () => window.print());

function startExpiryCountdown(expiresAt) {
  clearInterval(countdownTimer);
  countdownTimer = setInterval(async () => {
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining > 0) return;

    clearInterval(countdownTimer);
    showBookingMessage('Waktu booking habis. Slot sudah dilepas dan dapat dipilih kembali.', true);
    selectedSlotLabel.textContent = 'Belum dipilih';
    await loadBookingSlots();
  }, 1000);
}

function syncActiveBooking() {
  if (!activeBooking) return;

  const booking = bookingSlots.find(slot => slot.id === activeBooking.slotId);
  if (booking?.detected) {
    clearInterval(countdownTimer);
    countdownTimer = null;
    showBookingMessage(`Plat ${activeBooking.plateNumber} sudah terdeteksi. Booking slot ${activeBooking.slotId} tetap aktif.`);
    activeBooking = null;
  }
}

plateInput.addEventListener('input', () => {
  const start = plateInput.selectionStart;
  const end = plateInput.selectionEnd;
  plateInput.value = plateInput.value.toUpperCase();
  plateInput.setSelectionRange(start, end);
});

loadBookingSlots();
restoreDigitalTicket();