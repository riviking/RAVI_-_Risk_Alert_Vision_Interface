const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http'); 
const { Server } = require('socket.io');

const User = require('./models/User');
const Layout = require('./models/Layout');
const Fire = require('./models/Fire'); // Ensure your Schema includes: snoozedUntilFire (Date), snoozedUntilRobbery (Date)
const AlarmTrack = require('./models/AlarmTrack'); // 🌟 Clean, Named Import for persisting selected track configurations
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const mongoURI = 'mongodb://localhost:27017/';

mongoose.connect(mongoURI)
  .then(() => console.log("MongoDB Database Connected Successfully!"))
  .catch((err) => console.log("Database Connection Error: ", err));

io.on('connection', (socket) => {
  console.log(`Live Dashboard Client Synced: ${socket.id}`);
  socket.on('disconnect', () => console.log(`Dashboard Client Dropped: ${socket.id}`));
});

// 📌 Centralized logic helper to evaluate active states against offline timeouts & snooze intervals
const processSensorSanitization = (log) => {
  if (!log) return null;
  
  // Convert document to a plain object to append dynamic parameters safely
  const rawLog = log.toObject ? log.toObject() : { ...log };
  const now = new Date();

  // 1. Connectivity Boundary Rule: Overrides to false if device drops offline (5 minutes)
  const OFFLINE_TIMEOUT_MS = 5 * 60 * 1000;
  const isOnline = rawLog.last_seen && (now - new Date(rawLog.last_seen)) < OFFLINE_TIMEOUT_MS;

  if (!isOnline) {
    rawLog.fire = false;
    rawLog.robbery = false;
    return rawLog;
  }

  // 2. Database Snooze Check Window: If snoozed timestamp is in the future, silence threat indicators
  if (rawLog.snoozedUntilFire && now < new Date(rawLog.snoozedUntilFire)) {
    rawLog.fire = false;
  }
  if (rawLog.snoozedUntilRobbery && now < new Date(rawLog.snoozedUntilRobbery)) {
    rawLog.robbery = false;
  }

  return rawLog;
};

// ------------------- API ROUTES -------------------

// 1️⃣ SAVE LAYOUT (POST)
app.post('/api/layout/save', async (req, res) => {
  try {
    const { masterPlanImage, infrastructure } = req.body;
    const updatedLayout = await Layout.findOneAndUpdate(
      {}, 
      { masterPlanImage, infrastructure, updatedAt: Date.now() },
      { upsert: true, new: true } 
    );
    return res.status(200).json({ message: "Layout configurations synced to cloud!", updatedLayout });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 2️⃣ LOAD LAYOUT - ROUTE A
app.get('/api/layout/load', async (req, res) => {
  try {
    const activeLayout = await Layout.findOne({});
    return res.status(200).json(activeLayout);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 3️⃣ LOAD LAYOUT - ROUTE B
app.get('/api/layout/save', async (req, res) => {
  try {
    const layout = await Layout.findOne({}); 
    if (!layout) {
      return res.status(200).json({ updatedLayout: null, infrastructure: [], masterPlanImage: null });
    }
    return res.status(200).json({ 
      updatedLayout: layout,
      infrastructure: layout.infrastructure,
      masterPlanImage: layout.masterPlanImage
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 4️⃣ ARDUINO HARDWARE DATA ENDPOINTS
app.post('/api/fire', async (req, res) => {
  try {
    const { sensorId, temp, hum, fire, robbery } = req.body;

    if (!sensorId) {
      return res.status(400).json({ error: "Missing required identifier parameter: sensorId" });
    }

    // Upsert telemetry logs safely. Notice we DON'T update snooze fields here, keeping it compatible with Hub json schema!
    const updatedSensorLog = await Fire.findOneAndUpdate(
      { _Id: sensorId }, 
      { temp, hum, fire, robbery, last_seen: new Date() },
      { upsert: true, new: true }
    );

    // Filter telemetry values with snooze rules before streaming over websockets
    const sanitizedData = processSensorSanitization(updatedSensorLog);
    io.emit('sensor_status_update', sanitizedData);

    return res.status(201).json({ message: "Sensor data saved and streamed successfully!", data: sanitizedData });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/fire', async (req, res) => {
  try {
    const entries = await Fire.find();
    // Process and filter every single trace mapping before returning payload to frontend state
    const processedEntries = entries.map(entry => processSensorSanitization(entry));
    return res.status(200).json(processedEntries);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// APP DEDICATED SNOOZE / MUTE ALARM ENDPOINT
app.post('/api/fire/snooze', async (req, res) => {
  try {
    const { sensorId, incidentType } = req.body;
    if (!sensorId || !incidentType) {
      return res.status(400).json({ error: "Required params missing: sensorId or incidentType" });
    }

    const snoozeExpiryDate = new Date(Date.now() + 60 * 60 * 1000); // 1 Hour Snooze Matrix Window
    const updatePayload = {};

    if (incidentType === 'fire') updatePayload.snoozedUntilFire = snoozeExpiryDate;
    if (incidentType === 'robbery') updatePayload.snoozedUntilRobbery = snoozeExpiryDate;

    const updatedDocument = await Fire.findOneAndUpdate(
      { _Id: sensorId },
      updatePayload,
      { new: true, upsert: true }
    );

    // Instantly notify frontend application components to kill alerts and active highlights
    const cleanUpdate = processSensorSanitization(updatedDocument);
    io.emit('sensor_status_update', cleanUpdate);

    return res.status(200).json({ message: `Successfully snoozed ${incidentType} for 1 hour`, data: cleanUpdate });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 🌟 NEW: SAVE CURRENT SELECTION TO ALARM TRACK CONFIGURATION
app.post('/api/alarm-track', async (req, res) => {
  try {
    const { trackId } = req.body;
    if (!trackId) {
      return res.status(400).json({ error: "Missing parameter: trackId" });
    }

    const updatedConfig = await AlarmTrack.findOneAndUpdate(
      { systemKey: "active_alarm_configuration" },
      { selectedTrackId: trackId },
      { upsert: true, new: true }
    );

    return res.status(200).json({ message: "Alarm track preference synced cleanly!", updatedConfig });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 🌟 NEW: FETCH PERSISTED ALARM TRACK LOG ON APPLICATION REFRESH
app.get('/api/alarm-track', async (req, res) => {
  try {
    const config = await AlarmTrack.findOne({ systemKey: "active_alarm_configuration" });
    if (!config) {
      return res.status(200).json({ selectedTrackId: "industrial" }); // Fallback default text index
    }
    return res.status(200).json({ selectedTrackId: config.selectedTrackId });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 5️⃣ SIGN UP / REGISTER
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });
    if (userExists) return res.status(400).json({ message: "Email already exists!" });
    const newUser = new User({ name, email, password });
    await newUser.save();
    return res.status(201).json({ message: "User registered successfully!", user: newUser });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 6️⃣ LOGIN / SIGN IN
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Email not found! Please register first." });
    if (user.password !== password) return res.status(400).json({ message: "Incorrect password! Please try again." });
    return res.status(200).json({ message: "Login successful!", user: { name: user.name, email: user.email } });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Server running with integrated live sockets capabilities on port ${PORT}`);
});
