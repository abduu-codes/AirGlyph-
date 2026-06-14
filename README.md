# AirGlyph ✋🎨

> Draw in the air. Control with your hand. No touch required.

AirGlyph is a gesture-controlled drawing application that runs entirely in the browser. Using your webcam and Google MediaPipe, it tracks your hand in real time and turns your finger movements into art — no installation, no backend, no mouse needed.

---

## Live Demo

🔗 **[Try it live →](https://abduu-codes.github.io/AirGlyph-/)**

---

## Gestures

| Gesture | Action |
|---|---|
| ☝️ Index finger up | Draw |
| ✊ Fist | Lift pen / Pause |
| 🖐 Open palm | Erase |
| 🤌 Pinch (index + thumb) | Grab & move shapes |

---

## Features

- **Real-time hand tracking** — 21 landmark points detected at 60fps
- **Smooth drawing** — weighted coordinate averaging + dead-zone filter eliminates finger tremors
- **Shape snapping** — draw a rough circle and it snaps to a perfect one
- **Movable shapes** — pinch a snapped circle and drag it anywhere
- **Color picker** — full color wheel + 12 presets + recent color history
- **Marker & eraser size** — adjustable via sliders
- **Undo** — step back through your drawing history
- **Clear all** — wipe the canvas instantly
- **Save as PNG** — download your artwork
- **Camera preview** — live webcam feed in corner with size toggle
- **Mode badge** — always shows current gesture mode on screen

---

## Tech Stack

| Technology | Purpose |
|---|---|
| HTML5 Canvas API | 3-layer rendering (draw / objects / feedback) |
| Google MediaPipe Hands | Hand landmark detection |
| Vanilla JavaScript (ES6+) | All app logic — zero frameworks |
| CSS3 | Dark theme UI |
| WebRTC getUserMedia | Webcam access |

---

## Project Structure

```
airglyph/
├── index.html     — App layout, styles, loading screen, initialization
├── gesture.js     — MediaPipe setup, landmark reading, gesture detection
├── canvas.js      — Drawing engine, shape snapping, object movement, undo
└── ui.js          — Color picker, sliders, buttons, color history
```

---

## How to Run

**Option 1 — Direct (easiest):**
Download all 4 files into one folder and open `index.html` in Google Chrome.

> ⚠️ Chrome may block camera on local files. If it does, use Option 2.

**Option 2 — Local server:**
```bash
# Python
python -m http.server 8000

# Then open
http://localhost:8000
```

**Option 3 — VS Code:**
Install the **Live Server** extension → right-click `index.html` → Open with Live Server.

---

## How It Works

```
Webcam frame
    ↓
MediaPipe Hands (21 landmarks)
    ↓
Gesture Engine (finger-up detection + pinch distance)
    ↓
Canvas State Manager (draw / erase / move / idle)
    ↓
3-Layer Canvas Renderer
  ├── Layer 1: Permanent strokes
  ├── Layer 2: Movable objects
  └── Layer 3: Cursor & feedback
```

**Finger-up detection:**
A finger is "up" when its tip landmark Y is less than its base landmark Y.

**Smoothing:**
Last 9 frames are weighted-averaged (recent frames count more). A dead-zone filter ignores movement below a threshold to kill micro-tremors.

**Shape snapping:**
When the pen lifts, the stroke is analyzed for circularity. If variance from average radius is low and the stroke is closed, it snaps to a perfect circle and becomes a movable object.

---

## Browser Support

| Browser | Support |
|---|---|
| Google Chrome | ✅ Recommended |
| Microsoft Edge | ✅ Works |
| Firefox | ⚠️ May have camera issues |
| Safari | ❌ MediaPipe not supported |

---

## About

Built as a **2nd semester project** for BS Gaming & Animation at the **University of Engineering & Technology (UET)**.

---

## License

MIT — free to use, modify, and share.
