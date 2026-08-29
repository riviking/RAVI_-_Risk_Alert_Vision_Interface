import { RightSideBar } from "./components/RightSideBar";
import { SideBar } from "./components/SideBar";
import { SettingsPage } from "./pages/SettingsPage";
import { Dashboard } from "./pages/Dashboard";
import { IncidentsPage } from "./pages/IncidentsPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";

const BACKEND_URL = "http://localhost:5000";
const socket = io(BACKEND_URL);

export const ALARM_OPTIONS = [
  { id: "industrial", name: "Industrial Klaxon", url: "/sounds/klaxon.mp3" },
  { id: "beeps", name: "Rapid High Beeps", url: "/sounds/beeps.mp3" },
  { id: "pulsar", name: "Sci-Fi Pulsar Pulse", url: "/sounds/pulsar.mp3" }
];

const OFFLINE_TIMEOUT_MS = 5 * 60 * 1000;

function App() {
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [planImage, setPlanImage] = useState(null);   
  const [planName, setPlanName] = useState("");     
  const [isUploading, setIsUploading] = useState(false); 
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  const [selectedFloorId, setSelectedFloorId] = useState(null); 
  const [selectedSensorId, setSelectedSensorId] = useState(null);
  const [buildings, setBuildings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [liveTelemetryMap, setLiveTelemetryMap] = useState({});
  
  const [hasInteracted, setHasInteracted] = useState(false);
  const [selectedAlarmSound, setSelectedAlarmSound] = useState("industrial");
  const audioRef = useRef(null);

  const isDeviceOnline = (lastSeen) => {
    if (!lastSeen) return false;
    return (new Date() - new Date(lastSeen)) < OFFLINE_TIMEOUT_MS;
  };

  const triggerManualAudioPreview = (soundId) => {
    setHasInteracted(true);
    const soundToPlay = soundId || selectedAlarmSound;
    const activeOption = ALARM_OPTIONS.find(o => o.id === soundToPlay) || ALARM_OPTIONS[0];
    
    const previewAudio = new Audio(activeOption.url);
    previewAudio.volume = 0.7;
    previewAudio.play()
      .then(() => {
        console.log(`🔊 Playing preview for tone: ${activeOption.name}`);
        setTimeout(() => { previewAudio.pause(); }, 3500);
      })
      .catch(err => console.error("❌ Direct playback fallback failed:", err));
  };

  // 🌟 Custom wrapper handler to commit alarm selection to backend on change
  const handleAlarmSoundChange = async (soundId) => {
    setSelectedAlarmSound(soundId);
    try {
      await fetch(`${BACKEND_URL}/api/alarm-track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: soundId })
      });
    } catch (err) {
      console.error("❌ Failed to sync updated track selection to DB:", err);
    }
  };

  useEffect(() => {
    const fetchSavedLayout = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${BACKEND_URL}/api/layout/load`);
        if (response.ok) {
          const data = await response.json();
          if (data?.masterPlanImage) setPlanImage(data.masterPlanImage);
          if (data?.infrastructure) setBuildings(data.infrastructure);
          setPlanName("Operational Core Map");
        }
      } catch (err) {
        console.error("❌ Failed to contact database server environment:", err);
      } finally {
        setIsLoading(false);
      }
    };

    const fetchInitialSensorStates = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/fire`);
        if (response.ok) {
          const entries = await response.json();
          const initialMap = {};
          
          entries.forEach(log => { 
            if (log._Id) {
              initialMap[log._Id] = log; 
            }
          });
          setLiveTelemetryMap(initialMap);
        }
      } catch (err) {
        console.error("Failed to recover historical device traces:", err);
      }
    };

    // 🌟 Recovers the saved track from the database on initial mount
    const fetchSavedAlarmTrack = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/alarm-track`);
        if (response.ok) {
          const data = await response.json();
          if (data?.selectedTrackId) {
            setSelectedAlarmSound(data.selectedTrackId);
          }
        }
      } catch (err) {
        console.error("Failed to restore alarm track config from DB:", err);
      }
    };

    fetchSavedLayout();
    fetchInitialSensorStates();
    fetchSavedAlarmTrack();

    socket.on('connect', () => console.log("⚡ React Dashboard linked to Local WebSocket Channel!"));
    
    socket.on('sensor_status_update', (incomingData) => {
      if (incomingData?._Id) {
        setLiveTelemetryMap(prevMap => ({ ...prevMap, [incomingData._Id]: incomingData }));
      }
    });

    return () => {
      socket.off('connect');
      socket.off('sensor_status_update');
    };
  }, []);

  // 🛡️ BACKGROUND AUDIO SYSTEM THREAT MONITOR
  useEffect(() => {
    let systemHasActiveThreat = false;
    
    for (const building of buildings) {
      if (systemHasActiveThreat) break; 
      
      building.floors?.forEach(floor => {
        floor.sensors?.forEach(sensor => {
          const sensorKey = sensor.sensorId || sensor.id;
          const metrics = liveTelemetryMap[sensorKey];
          
          if (metrics && isDeviceOnline(metrics.last_seen)) {
            // Evaluated values are explicitly handled by the backend routing now!
            if (metrics.fire || metrics.robbery) {
              systemHasActiveThreat = true;
            }
          }
        });
      });
    }

    if (systemHasActiveThreat && hasInteracted) { 
      const activeOption = ALARM_OPTIONS.find(o => o.id === selectedAlarmSound) || ALARM_OPTIONS[0];
      
      if (!audioRef.current) {
        audioRef.current = new Audio(activeOption.url);
        audioRef.current.loop = true;
      } else if (audioRef.current.src !== window.location.origin + activeOption.url) {
        audioRef.current.pause();
        audioRef.current = new Audio(activeOption.url);
        audioRef.current.loop = true;
      }
      
      audioRef.current.play().catch(err => {
        console.warn("⚠️ Audio playback blocked by browser security rules.", err);
      });
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0; 
      }
    }
  }, [liveTelemetryMap, buildings, selectedAlarmSound, hasInteracted]);

  // Communicates directly with backend to snooze incidents persistently
  const handleMuteIncident = async (sensorId, incidentType) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/fire/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sensorId, incidentType })
      });
      if (!response.ok) {
        console.error("Failed to transmit snooze instruction matrix down to DB.");
      }
    } catch (err) {
      console.error("Network communication failure executing snooze update:", err);
    }
  };

  return (
    <div className="app-container" onClick={() => setHasInteracted(true)}>
      <SideBar onNavigate={(page) => { setCurrentPage(page); setIsUploading(false); }} currentPage={currentPage} />
      <div className="center-layout">
        {currentPage === 'dashboard' && (
          <Dashboard 
            planImage={planImage} buildings={buildings} 
            selectedBuildingId={selectedBuildingId} setSelectedBuildingId={setSelectedBuildingId}
            selectedFloorId={selectedFloorId} setSelectedFloorId={setSelectedFloorId}
            liveTelemetry={liveTelemetryMap} onMuteIncident={handleMuteIncident}
          />
        )}
        {currentPage === 'incidents' && <IncidentsPage />}
        {currentPage === 'analytics' && <AnalyticsPage />}
        {currentPage === 'settings' && (
          <SettingsPage 
            isUploading={isUploading} setIsUploading={setIsUploading} onUpload={(file, name) => {
              if (file) {
                const reader = new FileReader();
                reader.onloadend = () => { setPlanImage(reader.result); setPlanName(name); setIsUploading(false); };
                reader.readAsDataURL(file);
              }
            }}
            planImage={planImage} setPlanImage={setPlanImage}
            buildings={buildings} setBuildings={setBuildings}  
            selectedBuildingId={selectedBuildingId} setSelectedBuildingId={setSelectedBuildingId}
            selectedFloorId={selectedFloorId} setSelectedFloorId={setSelectedFloorId}
            onNavigateBack={() => setCurrentPage('dashboard')}
            selectedAlarmSound={selectedAlarmSound}
            // 🌟 Linked to database state-sync update helper
            setSelectedAlarmSound={handleAlarmSoundChange}
            onTestSound={triggerManualAudioPreview}
          />
        )}
      </div>
      <RightSideBar
        planName={planName} hasPlan={!!planImage} mode={currentPage}
        buildings={buildings} setBuildings={setBuildings}  
        planImage={planImage} setPlanImage={setPlanImage}
        selectedBuildingId={selectedBuildingId} setSelectedBuildingId={setSelectedBuildingId}
        selectedFloorId={selectedFloorId} setSelectedFloorId={setSelectedFloorId}
        selectedSensorId={selectedSensorId} setSelectedSensorId={setSelectedSensorId}
        liveTelemetry={liveTelemetryMap} onTestSound={triggerManualAudioPreview}
      />   
    </div>
  );
}

export default App;
