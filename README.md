# RAVI — Risk Alert Vision Interface

An IoT-based security monitoring platform integrating fire detection, access control, and panic-alert subsystems into a single real-time dashboard.

Built for **BECS 31811 — Creative Design Project II (2024/25)**, Cluster B, Project 02, University of Kelaniya, Department of Electronics & Computer Engineering.



---

## Overview

RAVI covers three integrated subsystems, each running on its own ESP32 node:

- **Fire detection** — MQ2 smoke sensor + DHT11 temperature/humidity, with trend-based scoring and auto-reset
- **Access control / intrusion detection** — dual-PIR motion sensing, 4x4 keypad entry/exit passcodes, LCD status display, breach alarm
- **Panic button** — dedicated emergency trigger with audible alarm, runs on the fire detection node's hardware

All nodes report over WiFi (HTTP POST) to a central Node.js backend, which stores telemetry in MongoDB and pushes live updates to a React dashboard via Socket.io.

## Architecture

```
[Fire node]  [Access control node]  [Panic node]
     |                |                  |
     └────────── Wi-Fi / HTTP POST ──────┘
                       |
              Node.js + Express API
                       |
        MongoDB  <-----+-----> Socket.io (realtime)
                       |
              React dashboard (live map, alerts)
```

## Tech stack

| Layer | Technology |
|---|---|
| Firmware | ESP32, Arduino/C++ |
| Sensors | MQ2 (smoke), DHT11 (temp/humidity), PIR x2, 4x4 keypad, I2C LCD |
| Backend | Node.js, Express, Mongoose |
| Database | MongoDB |
| Realtime | Socket.io |
| Frontend | React (Vite), Socket.io-client |

## Project structure

```
/backend
  server.js          # Express app, API routes, Socket.io server
  models/             # Mongoose schemas (User, Layout, Fire, AlarmTrack)
/frontend
  src/
    App.jsx           # Root component, socket connection, alarm audio logic
    pages/             # Dashboard, IncidentsPage, AnalyticsPage, SettingsPage
    components/        # SideBar, RightSideBar
/firmware
  firesensor.ino       # Fire detection + panic button node
  robarry.ino          # Access control / intrusion detection node
```

## Getting started

### Backend
```bash
cd backend
npm install
# create a .env file with PORT and any Mongo connection overrides
npm start
```
The API listens on `http://localhost:5000` by default and expects a local MongoDB instance at `mongodb://localhost:27017/`.

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Firmware
Flash `firesensor.ino` and `robarry.ino` to separate ESP32 boards via Arduino IDE. Update the WiFi credentials and `serverHost`/`serverUrl` constants in each file to match your backend's IP address before flashing.

## Key API endpoints

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/fire` | Ingest sensor telemetry (fire, robbery/access, panic) |
| GET | `/api/fire` | Fetch all sensor logs |
| POST | `/api/fire/snooze` | Snooze an active alert for 1 hour |
| POST | `/api/layout/save` | Save building/floor layout configuration |
| GET | `/api/layout/load` | Load saved layout configuration |
| POST | `/api/register`, `/api/login` | Basic user auth |

## Known limitations

This is an academic prototype, not a production-hardened system. Documenting these openly rather than hiding them:

- **No API authentication** — endpoints are unauthenticated; anyone with network access can read/write sensor and layout data.
- **Passwords stored in plain text** — `User` model does not hash passwords.
- **Panic button data is transmitted but not persisted** — the backend does not currently store or surface panic events separately from fire/access data.
- **GPIO12 used as a keypad row pin** — this is an ESP32 strapping pin and can cause intermittent boot failures; should be reassigned.
- **Inconsistent hardcoded server IPs** — the two firmware files point to different backend IP addresses; these need to be synced or replaced with a config step.
- **`FIRE_RESET_TIME` comment/code mismatch** — code currently resets after 5 seconds; comments describe 30 seconds. Needs alignment.
- **`IncidentsPage` and `AnalyticsPage` are placeholder stubs** — not yet implemented.

## Team

| Member | Role |
|---|---|
| Rivindu | Project planning, task distribution, fire detection & panic button firmware, PCB soldering (access control) |
| Teshan | React frontend, team coordination |
| Savithi | Node.js backend & database |
| Prabodha | Access control circuit/code, PIR structure design |
| Tharushika | Fire detection circuit |
| Hijaz | Power supply circuit, enclosures/wiring, PCB design (fire/panic circuits) |
| Naduni | Panic button circuit and coding |

## License

Academic project — no license currently specified. Add one (e.g. MIT) if this is intended for reuse beyond the coursework context.

## Acknowledgments

Built as part of BECS 31811 — Creative Design Project II, Department of Electronics & Computer Engineering, University of Kelaniya.
