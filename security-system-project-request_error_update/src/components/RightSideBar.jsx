import React, { useState } from "react";

export const RightSideBar = ({
  hasPlan, planName, mode, buildings, setBuildings, 
  planImage, setPlanImage,
  selectedBuildingId, setSelectedBuildingId, 
  selectedFloorId, setSelectedFloorId, 
  selectedSensorId, setSelectedSensorId,
  liveTelemetry = {}
}) => {
  const [showBuildingPopup, setShowBuildingPopup] = useState(false);
  const [showFloorPopup, setShowFloorPopup] = useState(false);
  const [showSensorPopup, setShowSensorPopup] = useState(false); 
  const [showMoreOptionsPopup, setShowMoreOptionsPopup] = useState(false);

  const [buildingName, setBuildingName] = useState("");
  const [floorName, setFloorName] = useState("");
  const [floorFile, setFloorFile] = useState(null);
  
  const [roomName, setRoomName] = useState("");
  const [sensorId, setSensorId] = useState("");

  const getSensorThreatState = (sId) => {
    const metrics = liveTelemetry[sId];
    if (!metrics) return { fire: false, robbery: false };
    return {
      fire: !!metrics.fire,
      robbery: !!metrics.robbery
    };
  };

  const checkBuildingHasFire = (buildingObj) => {
    return buildingObj.floors?.some(f => f.sensors?.some(s => getSensorThreatState(s.sensorId || s.id).fire));
  };

  const checkBuildingHasRobbery = (buildingObj) => {
    return buildingObj.floors?.some(f => f.sensors?.some(s => getSensorThreatState(s.sensorId || s.id).robbery));
  };

  const checkFloorHasFire = (floorObj) => {
    return floorObj.sensors?.some(s => getSensorThreatState(s.sensorId || s.id).fire);
  };

  const checkFloorHasRobbery = (floorObj) => {
    return floorObj.sensors?.some(s => getSensorThreatState(s.sensorId || s.id).robbery);
  };

  const handleAddBuildingClick = () => {
    if (!hasPlan) {
      alert("Please upload a map first!");
      return;
    }
    setShowBuildingPopup(true);
  };

  const handleAddFloorClick = () => {
    if (!selectedBuildingId) {
      alert("Please select a building from the list first!");
      return;
    }
    setShowFloorPopup(true);
  };

  const handleAddSensorClick = () => {
    if (!selectedFloorId) {
      alert("Please select a specific floor from the list first!");
      return;
    }
    setShowSensorPopup(true);
  };

  const handleConfirmBuilding = () => {
    if (!buildingName.trim()) return;
    const newBuilding = {
      id: Date.now(),
      name: buildingName,
      x: 100,
      y: 100,
      floors: []
    };
    setBuildings([...buildings, newBuilding]);
    setBuildingName("");
    setShowBuildingPopup(false);
  };

  const handleConfirmFloor = () => {
    if (!floorName.trim() || !floorFile) {
      alert("Please provide both a floor name and a layout image map.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const newFloor = {
        id: Date.now(),
        name: floorName,
        image: reader.result, 
        sensors: [] 
      };

      setBuildings(buildings.map(b => {
        if (b.id === selectedBuildingId) {
          return { ...b, floors: [...(b.floors || []), newFloor] };
        }
        return b;
      }));
      setFloorName("");
      setFloorFile(null);
      setShowFloorPopup(false);
    };
    reader.readAsDataURL(floorFile);
  };

  const handleConfirmSensor = () => {
    if (!roomName.trim() || !sensorId.trim()) {
      alert("Please fill in both the Room Name and Sensor ID!");
      return;
    }

    const newSensor = {
      id: Date.now(),
      roomName: roomName,
      sensorId: sensorId,
      x: 120, 
      y: 120
    };

    setBuildings(buildings.map(b => {
      if (b.id === selectedBuildingId) {
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id === selectedFloorId) {
              return { ...f, sensors: [...(f.sensors || []), newSensor] };
            }
            return f;
          })
        };
      }
      return b;
    }));

    setRoomName("");
    setSensorId("");
    setShowSensorPopup(false);
  };

  const handleDeleteClick = () => {
    if (!selectedBuildingId) {
      alert("Please select a building, floor, or sensor to delete!");
      return;
    }

    let confirmMessage = "Are you sure you want to delete this building, along with all its floors and sensors?";
    if (selectedSensorId && selectedFloorId) {
      confirmMessage = "Are you sure you want to delete this sensor?";
    } else if (selectedFloorId) {
      confirmMessage = "Are you sure you want to delete this floor, along with all its sensors?";
    }

    if (!window.confirm(confirmMessage)) return;

    if (selectedSensorId && selectedFloorId) {
      // Delete only the selected sensor from the selected floor
      setBuildings(buildings.map(b => {
        if (b.id !== selectedBuildingId) return b;
        return {
          ...b,
          floors: b.floors.map(f => {
            if (f.id !== selectedFloorId) return f;
            return { ...f, sensors: (f.sensors || []).filter(s => s.id !== selectedSensorId) };
          })
        };
      }));
      setSelectedSensorId(null);
    } else if (selectedFloorId) {
      // Delete the selected floor (and its sensors) from the selected building
      setBuildings(buildings.map(b => {
        if (b.id !== selectedBuildingId) return b;
        return { ...b, floors: (b.floors || []).filter(f => f.id !== selectedFloorId) };
      }));
      setSelectedFloorId(null);
      setSelectedSensorId(null);
    } else {
      // Delete the selected building (and its floors/sensors)
      setBuildings(buildings.filter(b => b.id !== selectedBuildingId));
      setSelectedBuildingId(null);
      setSelectedFloorId(null);
      setSelectedSensorId(null);
    }
  };

  const handleRemoveEntireMap = () => {
    if (window.confirm("Are you sure you want to remove the entire map? This will delete all buildings, floors, and sensors. Click Save afterward to remove it from the database.")) {
      setPlanImage(null);
      setBuildings([]);
      setSelectedBuildingId(null);
      setSelectedFloorId(null);
      setSelectedSensorId(null);
      setShowMoreOptionsPopup(false);
    }
  };

  const activeBuilding = buildings.find(b => b.id === selectedBuildingId);
  const totalSensorsCount = buildings.reduce((acc, b) => acc + (b.floors?.reduce((fAcc, f) => fAcc + (f.sensors?.length || 0), 0) || 0), 0);

  return (
    <div className="sidebar right-sidebar" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {hasPlan ? (
        <>
          <div className="plan-header">
            <h3>{planName}</h3>
            <span className="mode-badge">{mode === 'settings' ? 'Editing' : 'Monitoring'}</span>
          </div>

          {mode === 'settings' ? (
            <div className="edit-controls" style={{ width: '100%' }}>
              <div className="sidebar-actions">
                <button className="action-btn" onClick={handleAddBuildingClick}>+🗔</button>
                <button className="action-btn" onClick={handleAddFloorClick}>+目</button>
                <button className="action-btn" onClick={handleAddSensorClick}>+⎔</button>
                <button className="action-btn" onClick={handleDeleteClick}>🗑</button>
                <div style={{ position: 'relative' }}>
                  <button className="action-btn" onClick={() => setShowMoreOptionsPopup(prev => !prev)}>⋮</button>
                  {showMoreOptionsPopup && (
                    <div
                      style={{
                        position: 'absolute', top: '110%', right: 0, zIndex: 50,
                        background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
                        minWidth: '180px', boxShadow: '0 4px 12px rgba(0,0,0,0.5)', overflow: 'hidden'
                      }}
                    >
                      <div
                        onClick={handleRemoveEntireMap}
                        style={{
                          padding: '10px 14px', fontSize: '0.85rem', color: '#ef4444',
                          cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#2a2a2a'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        🗑 Remove entire map
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="inventory-section">
                {buildings.length === 0 ? (
                  <p className="hint-text">No buildings added yet.</p>
                ) : (
                  <ul className="item-list" style={{ paddingLeft: '0px' }}>
                    {buildings.map((b) => {
                      const isBuildingSelected = b.id === selectedBuildingId;
                      const hasFire = checkBuildingHasFire(b);
                      const hasRobbery = checkBuildingHasRobbery(b);

                      let rowClass = `item-list-row ${isBuildingSelected ? 'selected-row' : ''}`;
                      if (hasFire) rowClass += ' sidebar-danger-blink';
                      else if (hasRobbery) rowClass += ' sidebar-robbery-blink';

                      return (
                        <React.Fragment key={b.id}>
                          <li 
                            className={rowClass}
                            onClick={() => {
                              setSelectedBuildingId(isBuildingSelected ? null : b.id);
                              setSelectedFloorId(null);
                              setSelectedSensorId(null);
                            }}
                            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', userSelect: 'none' }}
                          >
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '0.65rem', color: '#71717a', width: '12px' }}>
                                {isBuildingSelected ? "▼" : "▶"}
                              </span>
                               {b.name} {hasFire && "🔥"} {hasRobbery && "🚨"}
                            </span>
                            <span style={{ fontSize: '0.7rem', color: '#71717a' }}>({b.floors?.length || 0})</span>
                          </li>

                          {isBuildingSelected && b.floors && b.floors.length > 0 && (
                            <ul style={{ listStyle: 'none', paddingLeft: '16px', marginBottom: '4px' }}>
                              {b.floors.map((f) => {
                                const isFloorSelected = f.id === selectedFloorId;
                                const fFire = checkFloorHasFire(f);
                                const fRobbery = checkFloorHasRobbery(f);

                                let fBg = '#161616';
                                let fBorder = '#222';
                                let fColor = '#c8c8cc';

                                if (fFire) { fBg = '#7f1d1d'; fBorder = '#ef4444'; fColor = '#fff'; }
                                // Correcting layout map assignments cleanly
                                else if (fRobbery) { fBg = '#581c87'; fBorder = '#a855f7'; fColor = '#fff'; }
                                else if (isFloorSelected) { fBg = 'rgba(74, 222, 128, 0.1)'; fBorder = '#4ade80'; fColor = '#fff'; }

                                return (
                                  <React.Fragment key={f.id}>
                                    <li 
                                      className="item-list-row"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedFloorId(isFloorSelected ? null : f.id);
                                        setSelectedSensorId(null);
                                      }}
                                      style={{ 
                                        background: fBg, borderColor: fBorder, color: fColor,
                                        fontSize: '0.8rem', padding: '6px 10px', marginBottom: '2px',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer',
                                        userSelect: 'none'
                                      }}
                                    >
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.55rem', color: '#52525b', width: '10px' }}>
                                          {isFloorSelected ? "▼" : "▶"}
                                        </span>
                                         {f.name} {fFire && "🔥"} {fRobbery && "🚨"}
                                      </span>
                                      <span style={{ fontSize: '0.65rem', color: '#71717a' }}>
                                        📡 ({f.sensors?.length || 0})
                                      </span>
                                    </li>

                                    {isFloorSelected && f.sensors && f.sensors.length > 0 && (
                                      <ul style={{ listStyle: 'none', paddingLeft: '16px', marginBottom: '6px' }}>
                                        {f.sensors.map((s) => {
                                          const sensorThreat = getSensorThreatState(s.sensorId || s.id);
                                          const isSensorSelected = s.id === selectedSensorId;
                                          
                                          let sBg = '#111';
                                          let sBorder = '#252525';
                                          let sColor = '#aaa';
                                          let icon = "🟢";

                                          if (sensorThreat.fire) { sBg = '#b91c1c'; sBorder = '#f87171'; sColor = '#fff'; icon = "🔥"; }
                                          else if (sensorThreat.robbery) { sBg = '#7e22ce'; sBorder = '#c084fc'; sColor = '#fff'; icon = "🚨"; }
                                          else if (isSensorSelected) { sBg = 'rgba(129, 140, 248, 0.15)'; sBorder = '#818cf8'; sColor = '#fff'; }

                                          return (
                                            <li
                                              key={s.id}
                                              className="item-list-row"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSensorId(isSensorSelected ? null : s.id);
                                              }}
                                              style={{
                                                background: sBg, borderColor: sBorder, color: sColor,
                                                fontSize: '0.75rem', padding: '4px 8px', marginBottom: '2px',
                                                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                                                userSelect: 'none'
                                              }}
                                            >
                                              {icon} <span>{s.roomName}</span> 
                                              <span style={{ fontSize: '0.65rem', color: '#52525b' }}>[{s.sensorId || s.id}]</span>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    )}
                                  </React.Fragment>
                                );
                              })}
                            </ul>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="status-controls" style={{ width: '100%', padding: '0 15px' }}>
              <div className="status-item" style={{ display: 'flex', justifyContent: 'space-between', margin: '12px 0', fontSize: '0.9rem' }}>
                <span>Active Sensors:</span>
                <span className="stat-value" style={{ color: '#818cf8', fontWeight: 'bold' }}>{totalSensorsCount}</span>
              </div>
              
              <div className="inventory-section" style={{ padding: 0, marginTop: '20px' }}>
                <h4 style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>Active Target Monitor</h4>
                {buildings.map(b => {
                  const bFire = checkBuildingHasFire(b);
                  const bRobbery = checkBuildingHasRobbery(b);

                  let bBg = 'transparent';
                  let bBorder = 'none';
                  let bColor = '#fff';
                  if (bFire) { bBg = '#4c0519'; bBorder = '1px solid #f43f5e'; bColor = '#f43f5e'; }
                  else if (bRobbery) { bBg = '#2e1065'; bBorder = '1px solid #a855f7'; bColor = '#c084fc'; }
                  else if (selectedBuildingId === b.id) { bBg = '#222'; }

                  return (
                    <div key={b.id} style={{ margin: '6px 0', padding: '6px', background: bBg, borderRadius: '4px', border: bBorder }}>
                      <div 
                        style={{ cursor: 'pointer', fontWeight: selectedBuildingId === b.id ? 'bold' : 'normal', fontSize: '0.85rem', color: bColor }}
                        onClick={() => { setSelectedBuildingId(selectedBuildingId === b.id ? null : b.id); setSelectedFloorId(null); }}
                      >
                         {b.name} {bFire && "⚠️ FIRE"} {bRobbery && "⚠️ ROBBERY"}
                      </div>
                      {selectedBuildingId === b.id && b.floors?.map(f => {
                        const fFire = checkFloorHasFire(f);
                        const fRobbery = checkFloorHasRobbery(f);

                        let fColor = '#aaa';
                        let prefix = "📁";
                        if (fFire) { fColor = '#ef4444'; prefix = "💥 FIRE"; }
                        else if (fRobbery) { fColor = '#a855f7'; prefix = "🚨 ROBBERY"; }
                        else if (selectedFloorId === f.id) { fColor = '#4ade80'; prefix = "📂"; }

                        return (
                          <div 
                            key={f.id} 
                            style={{ paddingLeft: '14px', marginTop: '4px', cursor: 'pointer', fontSize: '0.8rem', color: fColor, fontWeight: (fFire || fRobbery) ? 'bold' : 'normal' }}
                            onClick={(e) => { e.stopPropagation(); setSelectedFloorId(selectedFloorId === f.id ? null : f.id); }}
                          >
                            {prefix} {f.name}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="empty-status"><p>No active plan detected.</p></div>
      )}

      {/* MODAL 1: ADD BUILDING */}
      {showBuildingPopup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add New Building Target</h3>
            <div className="input-group"><input type="text" placeholder="e.g., Warehouse Block C" value={buildingName} onChange={(e) => setBuildingName(e.target.value)}/></div>
            <div className="button-group">
              <button className="save-btn" onClick={handleConfirmBuilding}>Add Widget</button>
              <button className="back-btn" onClick={() => setShowBuildingPopup(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD FLOOR */}
      {showFloorPopup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add Floor to {activeBuilding?.name}</h3>
            <div className="input-group"><label>Floor Name</label><input type="text" placeholder="e.g., 1st Floor" value={floorName} onChange={(e) => setFloorName(e.target.value)}/></div>
            <div className="input-group"><label>Floor Plan Image</label><input type="file" accept="image/*" onChange={(e) => setFloorFile(e.target.files[0])} style={{ padding: '8px', background: '#222', border: '1px solid #333', borderRadius: '6px' }}/></div>
            <div className="button-group" style={{ marginTop: '25px' }}>
              <button className="save-btn" onClick={handleConfirmFloor}>Save Floor Plan</button>
              <button className="back-btn" onClick={() => { setShowFloorPopup(false); setFloorFile(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )} 

      {/* MODAL 3: ADD SENSOR POPUP */}
      {showSensorPopup && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Add a Sensor</h3>
            <div className="input-group">
              <label>Room Name</label>
              <input type="text" placeholder="e.g., Server Room" value={roomName} onChange={(e) => setRoomName(e.target.value)}/>
            </div>
            <div className="input-group">
              <label>Sensor Hardware ID</label>
              <input type="text" placeholder="e.g., SN-HUB-9942" value={sensorId} onChange={(e) => setSensorId(e.target.value)}/>
            </div>
            <div className="button-group" style={{ marginTop: '25px' }}>
              <button className="save-btn" onClick={handleConfirmSensor}>Deploy a Sensor</button>
              <button className="back-btn" onClick={() => setShowSensorPopup(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};