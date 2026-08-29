// ============================================================
// FIRE DETECTION + PANIC SYSTEM (HTTP VERSION)
// ESP32 + MQ2 + DHT11 + NODE SERVER API
// Auto reset fire alert after 30 seconds
// ============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ================= WIFI =================
const char* ssid = "realme Note 50";
const char* password = "tekka#12";

// ================= SERVER =================
const char* serverHost = " 10.23.167.177";
const int serverPort = 5000;
const char* apiPath = "/api/fire";

// Unique sensor identifier
const char* SENSOR_ID = "sensor01";

// ================= DHT11 =================
#define DHTPIN 4
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ================= MQ2 =================
#define MQ2_PIN 34

// ================= BUZZER =================
#define BUZZER_PIN 26

// ================= BUTTON =================
#define BUTTON_PIN 18

// ================= FILTER =================
float smokeF = 0;
float tempF = 0;
float humF = 0;

float prevSmoke = 0;
float prevTemp = 0;
float prevHum = 0;

// ================= FIRE LOGIC =================
int fireCounter = 0;
bool fireDetected = false;

unsigned long fireDetectedTime = 0;
const unsigned long FIRE_RESET_TIME = 5000; // 30 seconds

// ================= PANIC =================
bool panicAlarm = false;
bool isPressed = false;
unsigned long buttonPressedTime = 0;
unsigned long panicStartTime = 0;

const unsigned long PANIC_DURATION = 30000;

// ================= TIMING =================
unsigned long lastSendTime = 0;
const unsigned long SEND_INTERVAL = 5000; // 5 seconds

// ============================================================
// MQ2 SAMPLING
// ============================================================
float readMQ2() {
  long total = 0;

  for (int i = 0; i < 20; i++) {
    total += analogRead(MQ2_PIN);
    delay(10);
  }

  return total / 20.0;
}

// ============================================================
// FIRE SIREN
// ============================================================
void fireAlarmPattern() {
  for (int i = 0; i < 2; i++) {
    for (int f = 800; f <= 2000; f += 20) {
      tone(BUZZER_PIN, f);
      delay(5);
    }

    for (int f = 2000; f >= 800; f -= 20) {
      tone(BUZZER_PIN, f);
      delay(5);
    }
  }
}

// ============================================================
// PANIC SOUND
// ============================================================
void panicAlarmPattern() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 2000);
    delay(120);
    noTone(BUZZER_PIN);
    delay(120);
  }
}

// ============================================================
// SEND DATA VIA HTTP API
// ============================================================
void sendToServer(const char* sensorId, float smoke, float temp, float hum, int score, bool fire, bool robbery, bool panic) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected");
    return;
  }

  String apiUrl = "http://" + String(serverHost) + ":" + String(serverPort) + String(apiPath);

  String json = "{";
  json += "\"sensorId\":\"" + String(sensorId) + "\",";
  json += "\"smoke\":" + String(smoke, 2) + ",";
  json += "\"temp\":" + String(temp, 2) + ",";
  json += "\"hum\":" + String(hum, 2) + ",";
  json += "\"score\":" + String(score) + ",";
  json += "\"fire\":" + String(fire ? "true" : "false") + ",";
  json += "\"robbery\":" + String(robbery ? "true" : "false") + ",";
  json += "\"panic\":" + String(panic ? "true" : "false");
  json += "}";

  HTTPClient http;
  http.begin(apiUrl);
  http.addHeader("Content-Type", "application/json");

  Serial.println("[DEBUG] POST " + apiUrl);
  Serial.println("[DEBUG] Payload: " + json);

  int httpCode = http.POST(json);
  String response = http.getString();

  Serial.print("[HTTP] Status: ");
  Serial.println(httpCode);
  Serial.println("[HTTP] Response: " + response);

  http.end();
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  WiFi.begin(ssid, password);
  Serial.print("Connecting WiFi");

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
  Serial.println(WiFi.localIP());

  dht.begin();
  delay(2000);

  float s = readMQ2();
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  smokeF = s;
  tempF = t;
  humF = h;

  prevSmoke = smokeF;
  prevTemp = tempF;
  prevHum = humF;
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  unsigned long now = millis();

  // ================= PANIC BUTTON =================
  int btn = digitalRead(BUTTON_PIN);

  if (btn == LOW) {
    if (!isPressed) {
      buttonPressedTime = now;
      isPressed = true;
    }

    if ((now - buttonPressedTime >= 3000) && !panicAlarm) {
      panicAlarm = true;
      panicStartTime = now;
      Serial.println("[ALERT] PANIC ACTIVATED");
    }
  } else {
    isPressed = false;
  }

  if (panicAlarm && (now - panicStartTime >= PANIC_DURATION)) {
    panicAlarm = false;
    Serial.println("[INFO] PANIC OFF");
  }

  // ================= BUZZER =================
  if (panicAlarm) {
    panicAlarmPattern();
  }
  else if (fireDetected) {
    fireAlarmPattern();
  }
  else {
    noTone(BUZZER_PIN);
  }

  // ================= SENSOR READ & SEND =================
  if (now - lastSendTime >= SEND_INTERVAL) {
    lastSendTime = now;

    float smokeRaw = readMQ2();
    float tempRaw = dht.readTemperature();
    float humRaw = dht.readHumidity();

    if (!isnan(tempRaw) && !isnan(humRaw)) {

      smokeF = 0.9 * smokeF + 0.1 * smokeRaw;
      tempF  = 0.9 * tempF + 0.1 * tempRaw;
      humF   = 0.9 * humF + 0.1 * humRaw;

      float smokeTrend = smokeF - prevSmoke;
      float tempTrend  = tempF - prevTemp;
      float humTrend   = humF - prevHum;

      prevSmoke = smokeF;
      prevTemp = tempF;
      prevHum = humF;

      // ================= SCORE =================
      int score = 0;

      if (smokeTrend > 5) score += 2;
      if (tempTrend > 0.1) score += 2;
      if (smokeF > 500) score += 3;
      if (humTrend > 0.5) score -= 1;

      // ================= FIRE LOGIC WITH AUTO RESET =================
      if (!fireDetected) {
        if (score >= 3) {
          fireCounter++;
        } else if (fireCounter > 0) {
          fireCounter--;
        }

        if (fireCounter >= 5) {
          fireDetected = true;
          fireDetectedTime = now;
          Serial.println("[ALERT] FIRE DETECTED");
        }
      }
      else {
        if (now - fireDetectedTime >= FIRE_RESET_TIME) {
          fireDetected = false;
          fireCounter = 0;

          prevSmoke = smokeF;
          prevTemp = tempF;
          prevHum = humF;

          Serial.println("[INFO] FIRE RESET TO NOMINAL");
        }
      }

      // ================= SERIAL MONITOR =================
      Serial.println("\n====================");
      Serial.print("Smoke: ");
      Serial.println(smokeF);
      Serial.print("Temp: ");
      Serial.println(tempF);
      Serial.print("Hum: ");
      Serial.println(humF);
      Serial.print("Score: ");
      Serial.println(score);
      Serial.print("Fire: ");
      Serial.println(fireDetected);
      Serial.print("Panic: ");
      Serial.println(panicAlarm);
      Serial.print("Fire Counter: ");
      Serial.println(fireCounter);

      // ================= SEND VIA HTTP API =================
      sendToServer(SENSOR_ID, smokeF, tempF, humF, score, fireDetected, false, panicAlarm);
    }
  }
}