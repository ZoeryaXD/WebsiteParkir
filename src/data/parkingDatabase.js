const fs = require('node:fs');
const path = require('node:path');

const databasePath = path.join(__dirname, 'parking-data.json');

function createInitialDatabase() {
  const createSlot = (id, category) => ({
    id,
    category,
    status: 'KOSONG',
    bookedPlate: null,
    currentPlate: null,
    entryTime: null,
    activeTicketId: null,
    ...(category === 'BOOKING' && {
      bookingId: null,
      bookingCreatedAt: null,
      bookingExpiresAt: null,
      bookingDetectedAt: null,
      bookingStatus: null
    })
  });

  return {
    parkingSlots: [
      createSlot('A1', 'REGULAR'),
      createSlot('A2', 'REGULAR'),
      createSlot('A3', 'REGULAR'),
      createSlot('B1', 'BOOKING'),
      createSlot('B2', 'BOOKING'),
      createSlot('B3', 'BOOKING')
    ],
    tickets: [],
    transactionLogs: [],
    alarmLogs: []
  };
}

function writeDatabase(database) {
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(database, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryPath, databasePath);
}

function readDatabase() {
  let contents;
  try {
    contents = fs.readFileSync(databasePath, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`Database tidak dapat dibaca (${databasePath}): ${error.message}`);
    }

    const initialDatabase = createInitialDatabase();
    writeDatabase(initialDatabase);
    return initialDatabase;
  }

  let database;
  try {
    database = JSON.parse(contents);
  } catch (error) {
    throw new Error(`Format JSON database tidak valid (${databasePath}): ${error.message}`);
  }

  if (
    !database ||
    !Array.isArray(database.parkingSlots) ||
    !Array.isArray(database.transactionLogs) ||
    !Array.isArray(database.alarmLogs)
  ) {
    throw new Error(`Struktur database tidak valid (${databasePath}).`);
  }

  database.tickets ||= [];
  database.parkingSlots.forEach(slot => {
    if (!Object.hasOwn(slot, 'activeTicketId')) slot.activeTicketId = null;
  });
  return database;
}

const database = readDatabase();
const { parkingSlots, tickets, transactionLogs, alarmLogs } = database;

function saveDatabase() {
  writeDatabase({ parkingSlots, tickets, transactionLogs, alarmLogs });
}

module.exports = { parkingSlots, tickets, transactionLogs, alarmLogs, saveDatabase };