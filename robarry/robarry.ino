#include <Arduino.h>
#include <Keypad.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ── UNIQUE DEVICE CONFIGURATION ──────────────────────────────────
const char* SENSOR_ID = "A003"; 

// 📶 Network Configuration Setup
const char* ssid = "realme Note 50";          
const char* password = "tekka#12";  

// 🖥️ Backend Server API Endpoint Connection String
const char* serverUrl = "http://172.20.62.177:5000/api/fire";

// ── Pin definitions ──────────────────────────────────────────────
#define PIR_HIGH   13   // Chest-height PIR
#define PIR_LOW    14   // Floor-height PIR
#define RELAY_PIN   4   // Relay → Light
#define BUZZER_PIN  5   // Buzzer

// ── LCD Setup ────────────────────────────────────────────────────
LiquidCrystal_I2C lcd(0x27, 16, 2); 

// ── Keypad Configuration ─────────────────────────────────────────
const byte ROWS = 4; 
const byte COLS = 4; 
char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};
byte rowPins[ROWS] = {12, 25, 26, 27}; 
byte colPins[COLS] = {18, 19, 32, 33}; 

Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

// ── Logic Constants & Passcodes ──────────────────────────────────
const String ENTRY_PASSCODE = "1234"; 
const String EXIT_PASSCODE  = "5678"; 

const unsigned long PASSCODE_TIMEOUT_MS = 20000; 
const unsigned long EXIT_WINDOW_MS = 20000;     
const unsigned long HEARTBEAT_INTERVAL_MS = 5000; 
const unsigned long ALARM_BLINK_INTERVAL_MS = 500; 
const unsigned long WIFI_WATCHDOG_INTERVAL_MS = 10000; 

enum SystemState { 
  STATE_IDLE, 
  STATE_AWAITING_PASSCODE, 
  STATE_INSIDE_WAITING, 
  STATE_EXIT_MODE, 
  STATE_ALARM,
  STATE_COOLDOWN 
};
SystemState currentState = STATE_IDLE;

unsigned long motionConfirmedTime = 0;
unsigned long exitModeStartTime = 0;
unsigned long alarmTriggeredTime = 0;
unsigned long previousHeartbeatMillis = 0;
unsigned long lastAlarmToggleMillis = 0;
unsigned long lastWiFiCheckMillis = 0; 
unsigned long cooldownStartTime = 0; 
unsigned long insideModeStartTime = 0;   // ⭐ පළමු පුද්ගලයා ඇතුළු වූ වෙලාව සටහන් කර ගැනීමට නව Variable එකක්

String enteredPasscode = "";
int wrongAttempts = 0;
int lastRemainingSeconds = -1;
bool alarmToggleState = false;           

// ── FreeRTOS Multithreading Configuration (Core 0 Engine) ────────
struct TelemetryMessage {
  char nodeId[16];
  float temp;
  float hum;
  bool fire;
  bool robbery;
};

QueueHandle_t telemetryQueue;

void telemetryTask(void * pvParameters) {
  TelemetryMessage msg;
  while (true) {
    if (xQueueReceive(telemetryQueue, &msg, portMAX_DELAY) == pdPASS) {
      if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(serverUrl);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(1000); 

        String jsonPayload = "{\"sensorId\":\"" + String(msg.nodeId) + "\","
                             "\"temp\":" + String(msg.temp, 1) + ","
                             "\"hum\":" + String(msg.hum, 1) + ","
                             "\"fire\":" + (msg.fire ? "true" : "false") + ","
                             "\"robbery\":" + (msg.robbery ? "true" : "false") + "}";

        Serial.print("[Background Core-0] Outbound JSON: ");
        Serial.println(jsonPayload);

        int httpResponseCode = http.POST(jsonPayload);

        if (httpResponseCode > 0) {
          Serial.print("[Background Core-0] Server Response: ");
          Serial.println(httpResponseCode);
        } else {
          Serial.print("[Background Core-0] ⚠️ Failed/Timeout. Error: ");
          Serial.println(httpResponseCode);
        }
        http.end();
      } else {
        Serial.println("[Background Core-0] ❌ Packet dropped. Wi-Fi offline.");
      }
    }
  }
}

void sendTelemetry(String nodeId, float temperature, float humidity, bool fireAlert, bool robberyAlert) {
  TelemetryMessage msg;
  memset(&msg, 0, sizeof(msg));
  strncpy(msg.nodeId, nodeId.c_str(), sizeof(msg.nodeId) - 1);
  msg.temp = temperature;
  msg.hum = humidity;
  msg.fire = fireAlert;
  msg.robbery = robberyAlert;

  if (telemetryQueue != NULL) {
    xQueueSend(telemetryQueue, &msg, 0);
  }
}

// ── Dual PIR Filters (Layer 1 & Layer 2) ─────────────────────────
bool checkHumanMotion() {
  if (digitalRead(PIR_HIGH) == HIGH && digitalRead(PIR_LOW) == HIGH) {
    delay(200); 
    if (digitalRead(PIR_HIGH) == HIGH && digitalRead(PIR_LOW) == HIGH) {
      return true; 
    }
  }
  return false;
}

// ── Reset System to Safe State ───────────────────────────────────
void resetSystem() {
  digitalWrite(RELAY_PIN, HIGH);   // Active-LOW රිලේ එක ආරම්භයේදී OFF කිරීමට HIGH ලබා දේ
  digitalWrite(BUZZER_PIN, LOW);   // Active-HIGH බසර් එක OFF කිරීමට LOW ලබා දේ
  enteredPasscode = "";
  wrongAttempts = 0;
  currentState = STATE_IDLE;
  lastRemainingSeconds = -1;
  alarmToggleState = false;
  
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SYSTEM SECURED");
  lcd.setCursor(0, 1);
  lcd.print("Monitoring...");
  Serial.println("[SYSTEM] Secure state active. Monitoring entrance...");
  
  sendTelemetry(SENSOR_ID, 0.0, 0.0, false, false);
}

void setup() {
  Serial.begin(115200);
  
  lcd.init();
  lcd.backlight();
  
  pinMode(PIR_HIGH,   INPUT);
  pinMode(PIR_LOW,    INPUT);
  pinMode(RELAY_PIN,  OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  telemetryQueue = xQueueCreate(5, sizeof(TelemetryMessage));

  if (telemetryQueue != NULL) {
    xTaskCreatePinnedToCore(
      telemetryTask,      
      "TelemetryTask",    
      4096,               
      NULL,               
      1,                  
      NULL,               
      0                   
    );
  }

  Serial.println("Initializing Wireless Connection Routine in background...");
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid, password);

  resetSystem();
}

void loop() {
  char key = keypad.getKey();
  unsigned long currentMillis = millis();

  // 🔄 BACKGROUND WI-FI WATCHDOG
  if (currentMillis - lastWiFiCheckMillis >= WIFI_WATCHDOG_INTERVAL_MS) {
    lastWiFiCheckMillis = currentMillis;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[⚠️ WATCHDOG] Wi-Fi link down. Requesting reconnection...");
      WiFi.begin(ssid, password);
    }
  }

  // 1. PIR සෙන්සර් මඟින් චලන හඳුනා ගැනීම
  // ⭐ FIXED UPDATE: පළමු පුද්ගලයා ඇතුළු වූ සැණින් ඇතිවන PIR දෘඩාංග ඝට්ටන (Hardware overlap) වැළැක්වීමට තත්පර 5ක ආරක්ෂිත කාල කවුළුවක් (Lockout Window) යොදා ඇත.
  bool allowMotionDetection = false;
  if (currentState == STATE_IDLE) {
    allowMotionDetection = true;
  } else if (currentState == STATE_INSIDE_WAITING && (currentMillis - insideModeStartTime >= 5000)) {
    allowMotionDetection = true; // පළමු පුද්ගලයා ඇතුළු වී තත්පර 5කට පසුව පමණක් නැවත අලුත් චලන හඳුනා ගනී.
  }

  if (allowMotionDetection) {
    if (digitalRead(PIR_LOW) == HIGH && digitalRead(PIR_HIGH) == LOW) {
      Serial.println("[DASHBOARD] Log: Animal detected. Ignored.");
      delay(500);
    }
    
    if (checkHumanMotion()) {
      Serial.println("[DASHBOARD] Log: New Human motion detected. Entrance Passcode Required.");
      motionConfirmedTime = currentMillis;
      currentState = STATE_AWAITING_PASSCODE; 
      enteredPasscode = "";
      lastRemainingSeconds = -1;
      
      lcd.clear();
      lcd.setCursor(0, 0);
      lcd.print("ENTER PASSCODE:");
    }
  }

  // 2. STATE_AWAITING_PASSCODE: Passcode බලාපොරොත්තුවෙන් සිටීම (20 Seconds Countdown)
  if (currentState == STATE_AWAITING_PASSCODE) {
    int remainingSeconds = (PASSCODE_TIMEOUT_MS - (currentMillis - motionConfirmedTime)) / 1000;
    if (remainingSeconds != lastRemainingSeconds && remainingSeconds >= 0) {
      lcd.setCursor(13, 0); lcd.print("   "); lcd.setCursor(13, 0);
      lcd.print(remainingSeconds); lcd.print("s");
      lastRemainingSeconds = remainingSeconds;
    }

    if (currentMillis - motionConfirmedTime > PASSCODE_TIMEOUT_MS) {
      Serial.println("[DASHBOARD - RED ALERT] Timeout! No entry passcode entered.");
      lcd.clear(); lcd.setCursor(0, 0); lcd.print("TIMEOUT! ALARM");
      
      alarmTriggeredTime = currentMillis;
      lastAlarmToggleMillis = currentMillis; 
      alarmToggleState = true;
      
      digitalWrite(RELAY_PIN, LOW);   // ඇලර්ට් තත්වයේ ආරම්භයේදීම බල්බය ක්‍රියාත්මක කරයි (Active-LOW)
      digitalWrite(BUZZER_PIN, HIGH);
      
      currentState = STATE_ALARM;
      lcd.setCursor(0, 1); lcd.print("ENTER CODE TO STOP"); 
      sendTelemetry(SENSOR_ID, 0.0, 0.0, false, true);
      return;
    }
  }

  // 3. STATE_EXIT_MODE: පිටවීමේ Countdown එක
  if (currentState == STATE_EXIT_MODE) {
    int remainingExitSeconds = (EXIT_WINDOW_MS - (currentMillis - exitModeStartTime)) / 1000;
    if (remainingExitSeconds != lastRemainingSeconds && remainingExitSeconds >= 0) {
      lcd.setCursor(13, 0); lcd.print("   "); lcd.setCursor(13, 0);
      lcd.print(remainingExitSeconds); lcd.print("s");
      lastRemainingSeconds = remainingExitSeconds;
    }

    if (checkHumanMotion()) {
      Serial.println("[DASHBOARD - GREEN MESSAGE] Authorized Exit Confirmed. User left.");
      lcd.clear(); lcd.setCursor(0, 0); lcd.print("EXIT SUCCESSFUL");
      lcd.setCursor(0, 1); lcd.print("Goodbye!");
      delay(3000);
      resetSystem(); 
      return;
    }

    if (currentMillis - exitModeStartTime > EXIT_WINDOW_MS) {
      Serial.println("[DASHBOARD - RED ALERT] Security Breach! Exit code used but no one left.");
      lcd.clear(); lcd.setCursor(0, 0); lcd.print("SECURITY BREACH!");
      
      alarmTriggeredTime = currentMillis;
      lastAlarmToggleMillis = currentMillis; 
      alarmToggleState = true;
      
      digitalWrite(RELAY_PIN, LOW);   
      digitalWrite(BUZZER_PIN, HIGH);
      
      currentState = STATE_ALARM;
      lcd.setCursor(0, 1); lcd.print("ENTER CODE TO STOP"); 
      sendTelemetry(SENSOR_ID, 0.0, 0.0, false, true);
      return;
    }
  }

  // ── Keypad Inputs ලබා ගැනීම සහ තර්කන පාලනය ────────────────────────────
  if (key && currentState != STATE_COOLDOWN) {
    if (key == '#') {
      if (enteredPasscode == ENTRY_PASSCODE && currentState == STATE_AWAITING_PASSCODE) {
        Serial.println("[DASHBOARD - GREEN MESSAGE] Correct Entry Passcode. Access Granted.");
        lcd.clear(); lcd.setCursor(0, 0); lcd.print("ACCESS GRANTED");
        lcd.setCursor(0, 1); lcd.print("Welcome!");
        delay(3000);
        
        currentState = STATE_INSIDE_WAITING; 
        insideModeStartTime = millis(); // ⭐ ඇතුළු වූ වෙලාව මෙතැනදී සටහන් කර ගනී.
        enteredPasscode = "";
        wrongAttempts = 0;
        
        lcd.clear(); lcd.setCursor(0, 0); lcd.print("ENTER EXIT CODE:");
        Serial.println("[SYSTEM] System is in entrance mode but waiting for Exit Passcode. No timeout.");
      } 
      else if (enteredPasscode == EXIT_PASSCODE && currentState == STATE_INSIDE_WAITING) {
        Serial.println("[DASHBOARD] Log: Exit passcode entered. Switching to EXIT MODE.");
        exitModeStartTime = currentMillis;
        currentState = STATE_EXIT_MODE; 
        enteredPasscode = "";
        lastRemainingSeconds = -1;
        
        lcd.clear(); lcd.setCursor(0, 0); lcd.print("EXIT MODE:");
        lcd.setCursor(0, 1); lcd.print("Please leave now");
      } 
      else if (enteredPasscode == ENTRY_PASSCODE && currentState == STATE_ALARM) { 
        Serial.println("[DASHBOARD - GREEN MESSAGE] Correct Passcode. Initializing 10s Cooldown.");
        
        digitalWrite(RELAY_PIN, HIGH);  
        digitalWrite(BUZZER_PIN, LOW);  
        
        currentState = STATE_COOLDOWN;
        cooldownStartTime = currentMillis; 
        enteredPasscode = "";
        wrongAttempts = 0;
        lastRemainingSeconds = -1;
        alarmToggleState = false;
        
        lcd.clear();
        lcd.setCursor(0, 0);
        lcd.print("ALARM CLEARED!");
        
        sendTelemetry(SENSOR_ID, 0.0, 0.0, false, false); 
      }
      else {
        if (currentState == STATE_ALARM) { 
          enteredPasscode = "";
          lcd.setCursor(0, 1); lcd.print("                ");
        } else {
          wrongAttempts++;
          enteredPasscode = "";
          lcd.setCursor(0, 1); lcd.print("                ");
          
          if (wrongAttempts == 1) {
            lcd.setCursor(0, 1); lcd.print("WRONG! 1 Try Lft");
            Serial.println("[DASHBOARD - RED ALERT] Incorrect passcode! 1 Chance left.");
          } 
          else if (wrongAttempts >= 2) {
            lcd.clear(); lcd.setCursor(0, 0); lcd.print("ALARM TRIGGERED");
            
            alarmTriggeredTime = currentMillis;
            lastAlarmToggleMillis = currentMillis; 
            alarmToggleState = true;
            
            digitalWrite(RELAY_PIN, LOW);  
            digitalWrite(BUZZER_PIN, HIGH);
            
            currentState = STATE_ALARM;
            lcd.setCursor(0, 1); lcd.print("ENTER CODE TO STOP"); 
            sendTelemetry(SENSOR_ID, 0.0, 0.0, false, true);
          }
        }
      }
    } 
    else if (key == '*') {
      enteredPasscode = "";
      lcd.setCursor(0, 1); lcd.print("                ");
    } 
    else {
      if (currentState != STATE_EXIT_MODE) {
        enteredPasscode += key;
        if (currentState == STATE_AWAITING_PASSCODE || currentState == STATE_INSIDE_WAITING || currentState == STATE_ALARM) {
          lcd.setCursor(enteredPasscode.length() - 1, 1);
          lcd.print("*");
        }
      }
    }
  }

  // 4. ── BLINKING & OUTPUT MANAGEMENT AREA ───────────────────
  if (currentState == STATE_ALARM) {
    if (currentMillis - lastAlarmToggleMillis >= ALARM_BLINK_INTERVAL_MS) {
      lastAlarmToggleMillis = currentMillis;
      alarmToggleState = !alarmToggleState; 
      
      digitalWrite(RELAY_PIN, alarmToggleState ? LOW : HIGH); 
      digitalWrite(BUZZER_PIN, alarmToggleState ? HIGH : LOW);
    }
  } else {
    digitalWrite(RELAY_PIN, HIGH); // Active-LOW Safe OFF
    digitalWrite(BUZZER_PIN, LOW); // Active-HIGH Safe OFF
  }

  // 5. STATE_COOLDOWN: තත්පර 10ක ආරක්ෂිත විරාම පාලනය (Restart Window)
  if (currentState == STATE_COOLDOWN) {
    int remainingCooldown = (10000 - (currentMillis - cooldownStartTime)) / 1000;
    
    if (remainingCooldown != lastRemainingSeconds && remainingCooldown >= 0) {
      lcd.setCursor(0, 1);
      lcd.print("Restarting: ");
      lcd.print(remainingCooldown);
      lcd.print("s   ");
      lastRemainingSeconds = remainingCooldown;
    }

    if (currentMillis - cooldownStartTime > 10000) {
      resetSystem(); 
    }
  }

  // ⏱️ BACKGROUND TIMING HEARTBEAT STREAM
  if (currentState != STATE_ALARM && currentState != STATE_COOLDOWN) {
    if (currentMillis - previousHeartbeatMillis >= HEARTBEAT_INTERVAL_MS) {
      previousHeartbeatMillis = currentMillis;
      sendTelemetry(SENSOR_ID, 0.0, 0.0, false, false);
    }
  }

  delay(50);
}