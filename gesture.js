// gesture.js — MediaPipe hand tracking + robust gesture detection

const GESTURE = { DRAW: 'draw', ERASE: 'erase', MOVE: 'move', IDLE: 'idle' };

class GestureEngine {
    constructor(onGesture) {
        this.onGesture = onGesture;
        this.hands = null;
        this.camera = null;
        this.lastGesture = GESTURE.IDLE;
        this.gestureBuffer = [];
        this.BUFFER_SIZE = 6;
        this.smoothHistory = [];
        this.SMOOTH_SIZE = 9;
        this.DEAD_ZONE = 0.004;
        this.running = false;
    }

    async init(videoEl) {
        this.videoEl = videoEl;

        this.hands = new Hands({
            locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}`
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.80,
            minTrackingConfidence: 0.75
        });

        this.hands.onResults(r => this._processResults(r));

        this.camera = new Camera(videoEl, {
            onFrame: async () => {
                if (this.running) await this.hands.send({ image: videoEl });
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        this.running = true;
    }

    // ── Core helpers ──────────────────────────────────────────

    // Is finger tip higher than its PIP joint (Y axis)?
    _isFingerUp(lm, tip, pip) {
        return lm[tip].y < lm[pip].y;
    }

    // Euclidean distance between two landmarks (normalized)
    _dist(a, b) {
        return Math.hypot(a.x - b.x, a.y - b.y);
    }

    // Angle at point B formed by A→B→C (degrees)
    _angle(A, B, C) {
        const ab = { x: A.x - B.x, y: A.y - B.y };
        const cb = { x: C.x - B.x, y: C.y - B.y };
        const dot = ab.x * cb.x + ab.y * cb.y;
        const mag = Math.hypot(ab.x, ab.y) * Math.hypot(cb.x, cb.y);
        if (mag === 0) return 0;
        return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
    }

    // ── Index finger pointing CHECK (the main fix) ────────────
    /*
      We check 4 things:
      1. Index tip is clearly ABOVE its base (finger is up)
      2. Other 3 fingers are DOWN (not open palm / erase)
      3. Finger is STRAIGHT — angle at joints 6 and 7 should be > 150°
         (a bent/sideways finger has a smaller angle)
      4. Finger is pointing TOWARD camera — tip Z is less than MCP Z
         AND the finger vector (MCP→tip) has a forward Z component
    */
    _isIndexPointing(lm) {
        // 1. Index tip above base
        const tipAboveBase = lm[8].y < lm[5].y - 0.04;
        if (!tipAboveBase) return false;

        // 2. Other fingers curled — middle, ring, pinky tips below their PIP
        const middleCurled = lm[12].y > lm[10].y;
        const ringCurled = lm[16].y > lm[14].y;
        const pinkyCurled = lm[20].y > lm[18].y;
        if (!middleCurled || !ringCurled || !pinkyCurled) return false;

        // 3. Finger straightness — check angle at landmark 6 (DIP) and 7 (PIP)
        //    Landmarks: 5=MCP, 6=PIP, 7=DIP, 8=TIP
        const angleAt6 = this._angle(lm[5], lm[6], lm[7]);
        const angleAt7 = this._angle(lm[6], lm[7], lm[8]);
        const isStraight = angleAt6 > 140 && angleAt7 > 140;
        if (!isStraight) return false;

        // 4. Finger pointing toward camera (Z depth check)
        //    Tip should be closer to camera (lower Z) than MCP base
        //    Also check the wrist→index_base vector to confirm hand faces forward
        const tipCloser = lm[8].z < lm[5].z - 0.01;
        const wristForward = lm[5].z < lm[0].z + 0.05; // index base not behind wrist

        return tipCloser && wristForward;
    }

    // ── Pinch distance in pixels ──────────────────────────────
    _pinchDist(lm, canvasW) {
        return Math.hypot(
            (lm[4].x - lm[8].x) * canvasW,
            (lm[4].y - lm[8].y) * canvasW
        );
    }

    // ── Open palm check for eraser ────────────────────────────
    _isOpenPalm(lm) {
        // All 4 fingers up + spread out
        const allUp =
            this._isFingerUp(lm, 8, 6) &&
            this._isFingerUp(lm, 12, 10) &&
            this._isFingerUp(lm, 16, 14) &&
            this._isFingerUp(lm, 20, 18);

        if (!allUp) return false;

        // Palm facing camera: wrist Z should be > middle finger MCP Z
        // (palm toward camera means fingers closer than wrist in Z)
        const palmFacing = lm[9].z < lm[0].z + 0.1;
        return palmFacing;
    }

    // ── Main gesture classifier ───────────────────────────────
    _detectGesture(lm, canvasW) {
        const pinch = this._pinchDist(lm, canvasW);

        // Move: index up + pinch tight
        if (this._isFingerUp(lm, 8, 6) && pinch < 44) return GESTURE.MOVE;

        // Erase: open palm facing camera
        if (this._isOpenPalm(lm)) return GESTURE.ERASE;

        // Draw: index fully extended, straight, pointing toward camera
        if (this._isIndexPointing(lm)) return GESTURE.DRAW;

        return GESTURE.IDLE;
    }

    // ── Weighted smoothing with dead zone ─────────────────────
    _smooth(x, y) {
        const last = this.smoothHistory[this.smoothHistory.length - 1];
        if (last && Math.hypot(x - last.x, y - last.y) < this.DEAD_ZONE) {
            return { x: last.x, y: last.y };
        }
        this.smoothHistory.push({ x, y });
        if (this.smoothHistory.length > this.SMOOTH_SIZE) this.smoothHistory.shift();
        let wx = 0, wy = 0, wt = 0;
        this.smoothHistory.forEach((p, i) => {
            const w = i + 1;
            wx += p.x * w; wy += p.y * w; wt += w;
        });
        return { x: wx / wt, y: wy / wt };
    }

    // ── Frame processor ───────────────────────────────────────
    _processResults(results) {
        if (!results.multiHandLandmarks?.length) {
            this._commit(GESTURE.IDLE, null, null);
            return;
        }

        const lm = results.multiHandLandmarks[0];
        const canvasW = window.airCanvas?.width || 640;
        const gesture = this._detectGesture(lm, canvasW);

        const { x, y } = this._smooth(lm[8].x, lm[8].y);
        const palmPt = { x: lm[9].x, y: lm[9].y };

        // Stability buffer — prevent flickering between modes
        this.gestureBuffer.push(gesture);
        if (this.gestureBuffer.length > this.BUFFER_SIZE) this.gestureBuffer.shift();

        const allSame = this.gestureBuffer.every(g => g === gesture);

        // Draw mode commits immediately (no lag), others wait for buffer
        if (gesture === GESTURE.DRAW || allSame) {
            this._commit(gesture, { x, y }, palmPt);
        } else {
            this._commit(this.lastGesture, { x, y }, palmPt);
        }
    }

    _commit(gesture, indexPt, palmPt) {
        this.lastGesture = gesture;
        this.onGesture({ gesture, indexPt, palmPt });
    }

    stop() {
        this.running = false;
        this.camera?.stop();
    }
}