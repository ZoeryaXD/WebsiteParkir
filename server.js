require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const apiRoutes = require('./src/routes/apiRoutes');
const { parkingSlots } = require('./src/data/parkingDatabase');
const bookingController = require('./src/controllers/bookingController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.set('socketio', io);
bookingController.restoreBookingExpirationTimers(io);

// Mounting Routes
app.use('/api', apiRoutes);

// Socket Connection Event
io.on('connection', (socket) => {
  console.log('⚡ Dashboard Admin Terhubung:', socket.id);
  // Kirimkan status awal saat client baru konek
  socket.emit('SLOT_UPDATE', parkingSlots);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server Prototipe Smart Parking berjalan di http://localhost:${PORT}`);
});