# 🏎️ CrossPlay Arena — Real 3D Multiplayer Racing & Gaming Platform

A real-time couch multiplayer gaming platform where players use their mobile smartphones as supercar cockpit controllers to battle on a main TV or desktop monitor.

Engineered with **Node.js**, **Express**, **Socket.IO**, and **Pure Vanilla HTML5 / CSS3 / JavaScript (Zero External Frameworks)** for authentic arcade thrills, 60 FPS graphics, and sub-millisecond input response.

---

## 🌟 Real Racing Features & Innovations

### 1. 🏁 3D Pseudo-Road Perspective Engine
- **Horizon Chase / OutRun Style 3D Projection:** Renders a deep 2.4 km Grand Prix circuit with 3D elevation hills, technical chicanes, blind crests, and hairpin turns.
- **Dynamic Track Features:** Red & white striped rumble kerbs, roadside neon billboards (`NITRO`, `APEX`, `DRIFT`, `OCTANE`), speed pads, and starting/finish gantries.
- **Parallax Cyberpunk Horizon:** Distant neon city skyscrapers and mountain silhouettes that rotate with road curvature and camera heading.

### 2. 📺 Split-Screen & Cinematic Viewport System
- **Real Multiplayer Split-Screen:** 
  - **2 Players:** Splits screen horizontally (Top = Player 1, Bottom = Player 2).
  - **3 or 4 Players:** 4-way quadrant split screen!
  - Each player gets their own dedicated 3D chase camera, viewing the road, upcoming turns, and rivals ahead or in their mirrors.
- **Broadcast Cam Mode:** Single full-screen camera tracking the race leader and lead battle with a simple click on the **VIEW MODE** button!

### 3. ⚙️ Authentic Supercar Vehicle Dynamics
- **6-Speed Transmission & RPM Tachometer:** 
  - Dynamic gear ratios (1st through 6th gear) accelerating up to 280+ KM/H (and 330+ KM/H with Nitrous!).
  - Engine revving from 1000 idle to 8500 redline with rev-limiter audio bouncing!
- **Centrifugal Curve Physics:** Curves exert lateral G-forces pulling cars toward the outside of the turn, demanding apex cornering and counter-steering.
- **Power Drifting & Mini-Turbo:** Brake and steer hard into corners to initiate a power drift with tire smoke and skid marks. Hold the drift to charge a **Mini-Turbo (Drift Boost)**!
- **Slipstream Drafting:** Drive directly behind an opponent to get sucked into their low-pressure pocket, cutting drag and gaining a +12% slingshot speed advantage!
- **Off-Road Penalties & Bumping:** Running off the asphalt onto the grass limits top speed and kicks up dust. Lateral car contact triggers collision bumping with bright spark bursts.

### 4. 📱 Supercar Cockpit Mobile Controller
- **Pedals Driving Interface:**
  - **Right Thumb:** Large metallic **GAS (Throttle) Pedal** that depresses with haptic vibration.
  - **Left Thumb:** Metallic **BRAKE Pedal** that decelerates and illuminates the car's LED brake lights!
  - **DRIFT / HANDBRAKE Button:** Instantly initiates powerslides around corners.
  - **NITROUS OXIDE (NOS) Trigger:** Glowing blue bottle switch with animated flame trails and haptic rumble.
- **Motion Sensor Steering:**
  - **GYRO TILT TO STEER:** Toggle the motion sensor on your phone to steer the car by physically tilting your smartphone like a real steering wheel!
  - **Tactile Paddles:** High-precision Left ◀ and Right ▶ steering paddles.
- **In-Hand Telemetry Dashboard:** Digital Speedometer, Gear indicator, RPM readout, and live Nitro fuel gauge right in your palm.

### 5. 🔊 Synthesized Racing Audio Engine (Web Audio API)
- Multi-harmonic engine roar whose pitch dynamically follows RPM and gear shifts.
- Screeching tire skids on hard braking and drifts.
- Nitrous boost sonic boom.
- Starting countdown traffic lights (🔴 3... 🔴 2... 🔴 1... 🟢 GO!).

---

## 📁 File Structure

```
mobile-game-controller/
├── server/
│   └── index.js             # Real-time vehicle physics & Socket.IO room simulation
├── client/
│   └── public/
│       ├── index.html       # 3D Pseudo-Road engine, split-screen viewports, pro cockpit HUD
│       └── controller.html  # Mobile cockpit controller (Gas/Brake pedals, NOS, Gyro tilt)
├── tests/
│   └── test_multiplayer.js  # Automated E2E test suite (Validates physics, telemetry, & sync)
├── package.json             # Manifest with express, socket.io, and nodemon
└── README.md                # Documentation & quick start guide
```

---

## 🚀 Quick Start Guide

### 1. Launch the Server
```bash
npm install
npm start
```
Or for development with auto-reload:
```bash
npm run dev
```

### 2. Open the Main Screen
Navigate to **`http://localhost:3000`** on your TV, laptop, or desktop monitor.
- A 6-character room code and automatic QR code will be generated.

### 3. Connect Mobile Phones
On smartphones connected to the same Wi-Fi:
```
http://<YOUR_LOCAL_IP>:3000/controller
```
*(Or point your phone camera at the on-screen QR code!)*

Enter a driver tag and tap **CONNECT COCKPIT ⚡**.

### 4. Start the Race!
Select **3D PRO RACING** and tap **START GRAND PRIX ▶**.
Watch the starting traffic lights count down: 3... 2... 1... **GREEN GO!**

---

## 🕹️ Controls Reference

| Control | Action | Details |
|---|---|---|
| **GAS Pedal (Right Thumb)** | Accelerate | Full throttle torque with engine rev sound |
| **BRAKE Pedal (Left Thumb)** | Brake | Deceleration with rear LED taillight flares |
| **DRIFT / E-BRAKE** | Powerslide | Initiates high-speed drift & charges Mini-Turbo |
| **NITRO (NOS)** | Nitrous Boost | Injects nitrous, exhausts flames, reaches 330+ KM/H |
| **◀ / ▶ Paddles** | Steer | Progressive steering into turns |
| **GYRO STEER (Toggle)** | Motion Tilt | Physically tilt phone left/right to steer |
| **VIEW MODE (Main Screen)** | Toggle View | Switch between Split-Screen and Broadcast Cam |

---

## 🛡️ License

MIT License. Engineered for multiplayer arcade thrills!
