// State Slot Parkir Dummy
const parkingSlots = [
  { id: 'A1', category: 'REGULAR', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null },
  { id: 'A2', category: 'REGULAR', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null },
  { id: 'A3', category: 'REGULAR', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null },
  { id: 'B1', category: 'BOOKING', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null, bookingId: null, bookingCreatedAt: null, bookingExpiresAt: null, bookingDetectedAt: null, bookingStatus: null },
  { id: 'B2', category: 'BOOKING', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null, bookingId: null, bookingCreatedAt: null, bookingExpiresAt: null, bookingDetectedAt: null, bookingStatus: null },
  { id: 'B3', category: 'BOOKING', status: 'KOSONG', bookedPlate: null, currentPlate: null, entryTime: null, bookingId: null, bookingCreatedAt: null, bookingExpiresAt: null, bookingDetectedAt: null, bookingStatus: null }
];

// Log Transaksi & Alarm History
const transactionLogs = [];
const alarmLogs = [];

module.exports = { parkingSlots, transactionLogs, alarmLogs };