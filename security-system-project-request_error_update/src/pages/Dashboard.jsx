import React, { useState } from "react";

export const Dashboard = ({ 
  planImage, buildings = [], selectedBuildingId, setSelectedBuildingId, 
  selectedFloorId, setSelectedFloorId, liveTelemetry = {}, onMuteIncident 
}) => {
  
  const [activeModalSensor, setActiveModalSensor] = useState(null);

  let currentActiveMapImage = planImage;
  let activeSensorsArray = [];

  if (selectedFloorId && buildings.length > 0) {
    for (const building of buildings) {
      const matchingFloor = building.floors?.find(f => f.id === selectedFloorId);
      if (matchingFloor) {
        currentActiveMapImage = matchingFloor.image;
        activeSensorsArray = matchingFloor.sensors || [];
        break;
      }
    }
  }

  const checkIsSensorOnline = (lastSeenValue) => {
    if (!lastSeenValue) return false;
    return (new Date() - new Date(lastSeenValue)) < 120000; // 2 minutes heartbeat threshold
  };

  const getSubFloorStatusStyle = (buildingEntity) => {
    let hasFire = false;
    let hasRobbery = false;

    if (buildingEntity.floors) {
      for (const floor of buildingEntity.floors) {
        if (floor.sensors) {
          for (const s of floor.sensors) {
            const sensorKey = s.sensorId || s.id;
            const metrics = liveTelemetry[sensorKey];
            
            if (metrics) {
              if (metrics.fire) hasFire = true;
              if (metrics.robbery) hasRobbery = true;
            }
          }
        }
      }
    }

    if (hasFire) return "building-widget emergency-pulse-alert"; 
    if (hasRobbery) return "building-widget robbery-pulse-alert";   
    return "building-widget"; 
  };

  return (
    <div className="plan-viewport" style={{ display: 'flex', flexDirection: 'column', position: 'relative' }}>
      
      {planImage && (
        <div style={{ position: 'absolute', top: '15px', left: '20px', zIndex: 100, background: 'rgba(0,0,0,0.8)', padding: '6px 12px', borderRadius: '6px', border: '1px solid #333', fontSize: '0.85rem' }}>
           <span style={{ color: selectedFloorId ? '#fbfbfb' : '#ffffff', fontWeight: 'bold' }}>
            {selectedFloorId ? "Viewing: Floor" : "Viewing: Main map"}
          </span>
          {selectedFloorId && (
            <button 
              onClick={() => { setSelectedFloorId(null); }}
              style={{ marginLeft: '12px', background: '#333', border: '1px solid #444', color: '#fff', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem' }}
            >
              Go back to main map
            </button>
          )}
        </div>
      )}

      {planImage ? (
        <div className="plan-canvas" style={{ position: 'relative', display: 'inline-block' }}>
          <img 
            src={currentActiveMapImage || planImage} 
            alt="Live Operations Map" 
            style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', pointerEvents: 'none' }} 
          />

          {/* Buildings Layer */}
          {!selectedFloorId && buildings.map((building) => (
            <div
              key={building.id}
              className={getSubFloorStatusStyle(building)}
              onClick={() => {
                setSelectedBuildingId(building.id);
                if(building.floors && building.floors.length > 0) {
                  setSelectedFloorId(building.floors[0].id);
                } else {
                  alert(`Building "${building.name}" has no sub-floor maps deployed yet.`);
                }
              }}
              style={{
                position: 'absolute', 
                left: `${building.x}px`, 
                top: `${building.y}px`,
                transform: 'translate(-50%, -50%)', 
                cursor: 'pointer',
                borderColor: selectedBuildingId === building.id ? '#818cf8' : '#fff',
                boxShadow: '0 0 12px rgba(255,255,255,0.2)'
              }}
            >
              <span className="widget-label">{building.name}</span>
            </div>
          ))}

          {/* Live Deployed Sensors Layer */}
          {selectedFloorId && activeSensorsArray.map((sensor) => {
            const sensorKey = sensor.sensorId || sensor.id;
            const dataMetrics = liveTelemetry[sensorKey];
            
            const isOnline = dataMetrics ? checkIsSensorOnline(dataMetrics.last_seen) : false;
            const isFireTriggered = !!dataMetrics?.fire;
            const isRobberyTriggered = !!dataMetrics?.robbery;

            let widgetBackground = '#4b5563'; 
            let labelBackground = '#1f2937';
            let statusClassNames = 'building-widget';

            if (isFireTriggered) {
              widgetBackground = '#ef4444'; 
              labelBackground = '#7f1d1d';
              statusClassNames = 'building-widget emergency-pulse-alert'; 
            } else if (isRobberyTriggered) {
              widgetBackground = '#a855f7'; 
              labelBackground = '#581c87';
              statusClassNames = 'building-widget robbery-pulse-alert'; 
            } else if (isOnline) {
              widgetBackground = '#10b981'; 
              labelBackground = '#064e3b';
            }

            return (
              <div
                key={sensor.id}
                className={statusClassNames}
                style={{
                  position: 'absolute', 
                  left: `${sensor.x}px`, 
                  top: `${sensor.y}px`,
                  transform: 'translate(-50%, -50%)',
                  background: widgetBackground, 
                  borderColor: isOnline ? '#fff' : '#9ca3af',
                  cursor: 'pointer',
                  zIndex: (isFireTriggered || isRobberyTriggered) ? 999 : 10,
                  transition: 'background-color 0.3s ease'
                }}
                onClick={() => setActiveModalSensor({ sensor, sensorKey, dataMetrics, isOnline, isFireTriggered, isRobberyTriggered })}
              >
                <span className="widget-label" style={{ backgroundColor: labelBackground, borderColor: widgetBackground }}>
                  {sensor.roomName} {isFireTriggered && "🔥"} {isRobberyTriggered && "🚨"}
                </span>
                <div style={{ fontSize: '0.6rem', padding: '2px 4px', textAlign: 'center', color: '#fff', fontWeight: 'bold' }}>
                  {isOnline ? `${dataMetrics?.temp || 0}°C` : 'OFFLINE'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="no-plan-message" style={{ textAlign: 'center' }}>
          <h2>No Plan Set</h2>
          <p style={{ color: '#71717a', marginTop: '8px' }}>Please upload a building map.</p>
        </div>
      )}

      {/* CUSTOM POPUP PANEL MODAL */}
      {activeModalSensor && (
        <div className="modal-overlay" onClick={() => setActiveModalSensor(null)} style={{ zIndex: 10000 }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ minWidth: '320px', background: '#1c1c1e', border: '1px solid #2c2c2e', color: '#fff', padding: '20px', borderRadius: '8px' }}>
            <h3 style={{ borderBottom: '1px solid #2c2c2e', paddingBottom: '10px', marginTop: 0 }}>
              📟 Room Metrics summary
            </h3>
            
            <div style={{ textAlign: 'left', margin: '15px 0', fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div><strong>ID Reference:</strong> <span style={{ color: '#a1a1aa' }}>{activeModalSensor.sensorKey}</span></div>
              <div><strong>Location Room:</strong> <span style={{ color: '#a1a1aa' }}>{activeModalSensor.sensor.roomName}</span></div>
              <hr style={{ borderColor: '#2c2c2e', margin: '8px 0' }} />
              <div><strong>Temperature:</strong> {activeModalSensor.dataMetrics ? `${activeModalSensor.dataMetrics.temp}°C` : 'Offline'}</div>
              <div><strong>Humidity:</strong> {activeModalSensor.dataMetrics ? `${activeModalSensor.dataMetrics.hum}%` : 'Offline'}</div>
              <hr style={{ borderColor: '#2c2c2e', margin: '8px 0' }} />
              <div><strong>Fire Status:</strong> {activeModalSensor.isFireTriggered ? <span style={{ color: '#ef4444', fontWeight: 'bold' }}>DANGER ALERT 🔥</span> : <span style={{ color: '#10b981' }}>NOMINAL</span>}</div>
              <div><strong>Robbery Status:</strong> {activeModalSensor.isRobberyTriggered ? <span style={{ color: '#a855f7', fontWeight: 'bold' }}>BREACH ALERT 🚨</span> : <span style={{ color: '#10b981' }}>NOMINAL</span>}</div>
            </div>

            <button
              className="emergency-mute-btn"
              disabled={!activeModalSensor.isFireTriggered && !activeModalSensor.isRobberyTriggered}
              onClick={() => {
                const { sensorKey, isFireTriggered, isRobberyTriggered } = activeModalSensor;
                if (isFireTriggered) onMuteIncident(sensorKey, 'fire');
                if (isRobberyTriggered) onMuteIncident(sensorKey, 'robbery');
                setActiveModalSensor(null);
                alert("Incident status changes successfully committed to database storage cluster for 1 hour.");
              }}
            >
              Turn Off
            </button>

            <button 
              className="back-btn" 
              style={{ width: '100%', marginTop: '10px' }} 
              onClick={() => setActiveModalSensor(null)}
            >
              Close Window
            </button>
          </div>
        </div>
      )}

    </div>
  );
};