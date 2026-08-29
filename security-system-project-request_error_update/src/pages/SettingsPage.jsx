import React, { useState, useRef, useEffect } from "react";
import { ALARM_OPTIONS } from "../App"; // Import standard options from App

export const SettingsPage = ({ 
  isUploading, setIsUploading, onUpload, planImage, setPlanImage,
  buildings, setBuildings, selectedBuildingId, selectedFloorId,
  setSelectedBuildingId, setSelectedFloorId, onNavigateBack,
  // 🟢 NEW ALARM STATE PROPS PASSED FROM APP
  selectedAlarmSound, setSelectedAlarmSound
}) => {
  const [tempName, setTempName] = useState(""); 
  const [selectedFile, setSelectedFile] = useState(null);  
  const [isSavingToDb, setIsSavingToDb] = useState(false);
  
  // Local temporary state to store choice before hitting "Update Emergency Sound"
  const [localSoundSelection, setLocalSoundSelection] = useState(selectedAlarmSound);
  
  const [currentView, setCurrentView] = useState("menu"); 
  
  const dragInfo = useRef({ isDragging: false, targetId: null, targetType: null, startX: 0, startY: 0 });
  const viewportRef = useRef(null);

  // 🌟 Sync local state when backend fetches initial database configuration on load
  useEffect(() => {
    setLocalSoundSelection(selectedAlarmSound);
  }, [selectedAlarmSound]);

  // --- 🗑️ DELETE FUNCTIONALITY INTEGRATED ---
  const handleDeleteSelected = () => {
    if (!selectedBuildingId && !selectedFloorId) {
      alert("Please select a building or floor to delete first.");
      return;
    }

    if (!window.confirm("Are you sure you want to delete the selected item?")) return;

    setBuildings(prevBuildings => {
      // If a floor is selected, remove the floor from the specific building
      if (selectedFloorId) {
        return prevBuildings.map(b => ({
          ...b,
          floors: b.floors.filter(f => f.id !== selectedFloorId)
        }));
      } 
      // Otherwise, remove the building
      else {
        return prevBuildings.filter(b => b.id !== selectedBuildingId);
      }
    });

    // Reset selection after deletion
    setSelectedFloorId(null);
    setSelectedBuildingId(null);
  };

  const handleWidgetMouseDown = (e, id, currentX, currentY, type) => {
    e.preventDefault();
    e.stopPropagation(); 
    dragInfo.current = {
      isDragging: true,
      targetId: id,
      targetType: type, 
      startX: e.clientX - currentX,
      startY: e.clientY - currentY
    };
    
    // Select the item on click
    if (type === 'building') setSelectedBuildingId(id);
    else if (type === 'sensor') setSelectedFloorId(selectedFloorId || id); // Maintain current context
  };

  const handleViewportMouseMove = (e) => {
    if (!dragInfo.current.isDragging) return;

    const { targetId, targetType, startX, startY } = dragInfo.current;
    
    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    if (viewportRef.current) {
      const bounds = viewportRef.current.getBoundingClientRect();
      newX = Math.max(25, Math.min(newX, bounds.width - 25));
      newY = Math.max(25, Math.min(newY, bounds.height - 25));
    }
    
    if (targetType === 'building') {
      setBuildings(buildings.map(b => b.id === targetId ? { ...b, x: newX, y: newY } : b));
    } 
    else if (targetType === 'sensor') {
      setBuildings(buildings.map(b => {
        if (b.id === selectedBuildingId) {
          return {
            ...b,
            floors: b.floors.map(f => {
              if (f.id === selectedFloorId) {
                return {
                  ...f,
                  sensors: f.sensors.map(s => s.id === targetId ? { ...s, x: newX, y: newY } : s)
                };
              }
              return f;
            })
          };
        }
        return b;
      }));
    }
  };

  const handleGlobalMouseUp = () => {
    dragInfo.current.isDragging = false;
  };

  const handleSaveToMongoDB = async () => {
    try {
      setIsSavingToDb(true);
      const payload = {
        masterPlanImage: planImage,
        infrastructure: buildings
      };

      const response = await fetch("http://localhost:5000/api/layout/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert("✨ Architecture configuration tree synced to cloud database!");
      } else {
        alert("❌ Failed to push network config to database.");
      }
    } catch (err) {
      console.error(err);
      alert("❌ Critical Error connecting with server api link workspace.");
    } finally {
      setIsSavingToDb(false);
    }
  };

  const handleBackNavigation = () => {
    if (selectedFloorId) {
      setSelectedFloorId(null);
    } else if (currentView === "canvas") {
      setCurrentView("menu");
    } else {
      onNavigateBack();
    }
  };

  const handleTestTriggerSound = (e) => {
    e.stopPropagation();
    const activeTarget = ALARM_OPTIONS.find(o => o.id === localSoundSelection);
    if (activeTarget) {
      const demoAudio = new Audio(activeTarget.url);
      demoAudio.volume = 0.5;
      demoAudio.play().catch(err => alert("Interaction required before previewing audio loops."));
      setTimeout(() => { demoAudio.pause(); }, 3000); 
    }
  };

  const handleSaveAlarmConfiguration = (e) => {
    e.stopPropagation();
    setSelectedAlarmSound(localSoundSelection);
    alert(`Emergency System Updated: Alarm tone set to ${ALARM_OPTIONS.find(o => o.id === localSoundSelection)?.name}`);
  };

  let currentActiveMapImage = planImage;
  let activeSensorsArray = [];

  if (selectedFloorId) {
    for (const building of buildings) {
      const matchingFloor = building.floors?.find(f => f.id === selectedFloorId);
      if (matchingFloor) {
        currentActiveMapImage = matchingFloor.image;
        activeSensorsArray = matchingFloor.sensors || []; 
        break;
      }
    }
  }

  if (isUploading) {
    return (
        <div className="settings-container">
            <h2>Upload a Plan</h2>
            <br/>
            <div className="input-group">
              <label>Plan Name</label>
              <input type="text" placeholder="e.g., Main Campus Map" value={tempName} onChange={(e) => setTempName(e.target.value)}/>
            </div>
            <div className="upload-group">
              <input type="file" accept="image/*" onChange={(e) => setSelectedFile(e.target.files[0])}/>
            </div>
            <div className="button-group">
              <button className="save-btn" disabled={!selectedFile || !tempName} onClick={() => {
                onUpload(selectedFile, tempName);
                setCurrentView("canvas");
              }}>Confirm & Set Plan</button>
              <button className="back-btn" onClick={() => setIsUploading(false)}>Cancel</button>
            </div>    
        </div>
    );
  }

  return (
    <div className="settings-container" onMouseUp={handleGlobalMouseUp} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      
      {/* 🧭 NAVIGATION CONTROL BAR */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#1a1a1a", padding: "10px 14px", borderRadius: "8px", border: "1px solid #333", marginBottom: "12px" }}>
        
        <button className="back-btn" onClick={handleBackNavigation} style={{ padding: "6px 12px", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "6px" }}>
          ←
        </button>

        {currentView === "canvas" && (
          <>
            <button 
              className="save-btn" 
              onClick={handleSaveToMongoDB} 
              disabled={isSavingToDb}
              style={{ 
                flex: "initial", width: "100px", padding: "6px 0", height: "32px",
                fontSize: "0.8rem", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center"
              }}
            >
              {isSavingToDb ? "🖫Saving..." : "🖫Save"}
            </button>
            
            {/* 🗑️ NEW DELETE BUTTON */}
           {/* <button 
              className="back-btn" 
              onClick={handleDeleteSelected}
              style={{ padding: "6px 12px", fontSize: "0.85rem", background: "#7f1d1d", color: "#fff" }}
            >
              🗑 Delete
            </button>*/}
          </>
        )}
      </div>

      {/* ✨ RENDER SWITCH LOGIC BASED ON currentView STATE */}
      {currentView === "canvas" && planImage ? (
        <div className="settings-workspace" style={{ flex: 1 }}>
           <div className="plan-viewport" ref={viewportRef} onMouseMove={handleViewportMouseMove} style={{ position: 'relative', overflow: 'hidden' }}>
              
              <div className="plan-canvas" style={{ position: 'relative', display: 'inline-block' }}>
                <img 
                  src={currentActiveMapImage} 
                  alt="Setup Layout" 
                  style={{ maxWidth: '100%', maxHeight: '100%', display: 'block', pointerEvents: "none" }}
                />
                
                {!selectedFloorId && buildings.map((building) => (
                   <div
                     key={building.id}
                     className="building-widget"
                     onMouseDown={(e) => handleWidgetMouseDown(e, building.id, building.x, building.y, 'building')}
                     style={{
                       position: 'absolute', left: `${building.x}px`, top: `${building.y}px`,
                       transform: 'translate(-50%, -50%)', cursor: 'move',
                       boxShadow: building.id === selectedBuildingId ? '0 0 15px #818cf8' : '0 4px 10px rgba(0,0,0,0.4)',
                       borderColor: building.id === selectedBuildingId ? '#818cf8' : '#fff'
                     }}
                   >
                     <span className="widget-label">{building.name}</span>
                   </div>
                 ))}  

                {selectedFloorId && activeSensorsArray.map((sensor) => (
                   <div
                     key={sensor.id}
                     className="building-widget" 
                     onMouseDown={(e) => handleWidgetMouseDown(e, sensor.id, sensor.x, sensor.y, 'sensor')}
                     style={{
                       position: 'absolute', left: `${sensor.x}px`, top: `${sensor.y}px`,
                       transform: 'translate(-50%, -50%)', cursor: 'move',
                       background: '#10b981', 
                       borderColor: '#fff',
                       boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
                     }}
                   >
                     <span className="widget-label" style={{ backgroundColor: '#064e3b', borderColor: '#10b981' }}>
                       {sensor.roomName} ({sensor.sensorId})
                     </span>
                   </div>
                 ))}  
              </div>
           </div>
           
           {!selectedFloorId && (
             <button className="back-btn" onClick={() => setIsUploading(true)} style={{ width: 'fit-content', marginTop: "8px" }}>
               Replace the plan
             </button>
           )}
        </div>
      ) : (
        /* 🛠️ OPTIONS MENU VIEW PANEL */
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          
          <div 
            className="settings-option" 
            onClick={() => {
              if (planImage) {
                setCurrentView("canvas"); 
              } else {
                setIsUploading(true); 
              }
            }} 
            style={{ margin: 0 }}
          >
            <h3>Set the plan</h3>
            <p>{planImage ? "View and adjust active building plan layers" : "Upload a new Building map"}</p>
          </div>
          
          <div className="settings-option" onClick={() => alert("Emergency Contacts Configuration Panel Open.")} style={{ margin: 0 }}>
            <h3>Update Emergency Contacts</h3>
            <p>Manage phone numbers and names</p>
          </div>

          <div className="settings-option" onClick={(e) => e.stopPropagation()} style={{ margin: 0, cursor: 'default' }}>
            <h3>Set the Alarm Tone</h3>
            <p style={{ marginBottom: "12px" }}>Select and test your built-in emergency system sound profile</p>
            
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select 
                value={localSoundSelection} 
                onChange={(e) => setLocalSoundSelection(e.target.value)}
                style={{
                  background: '#1a1a1a', border: '1px solid #333', borderRadius: '6px',
                  padding: '10px', color: '#fff', fontSize: '0.9rem', flex: 1, outline: 'none'
                }}
              >
                {ALARM_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{option.name}</option>
                ))}
              </select>

              <button className="back-btn" type="button" onClick={handleTestTriggerSound} style={{ padding: "10px 14px", fontSize: "0.85rem" }}>
                🔊 Test
              </button>
              
              <button className="save-btn" type="button" onClick={handleSaveAlarmConfiguration} style={{ padding: "10px 14px", fontSize: "0.85rem", backgroundColor: "#ef4444", flex: "initial" }}>
                Update Sound
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};