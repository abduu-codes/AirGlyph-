// canvas.js — Drawing engine, shape snapping, move, undo

class AirCanvas {
    constructor(drawCanvas, objCanvas, feedbackCanvas) {
        this.dc = drawCanvas;
        this.oc = objCanvas;
        this.fc = feedbackCanvas;
        this.ctx = drawCanvas.getContext('2d');
        this.octx = objCanvas.getContext('2d');
        this.fctx = feedbackCanvas.getContext('2d');

        this.width = drawCanvas.width;
        this.height = drawCanvas.height;
        window.airCanvas = drawCanvas;

        this.color = '#00f5ff';
        this.markerSize = 4;
        this.eraserSize = 40;

        this.mode = 'idle';
        this.drawing = false;
        this.lastPt = null;
        this.ctrlPt = null;
        this.undoStack = [];
        this.MAX_UNDO = 20;

        // Movable objects — stored in PIXEL coords
        this.objects = [];
        this.activeObj = null;
        this.pinchOffset = { x: 0, y: 0 };
        this.wasMoving = false;  // track pinch state across frames

        this.currentStroke = [];
        this.SNAP_MIN_PTS = 25;

        this._fillBg();
    }

    _fillBg() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.width, this.height);
    }

    resize(w, h) {
        const img = this.ctx.getImageData(0, 0, this.width, this.height);
        this.width = this.dc.width = this.oc.width = this.fc.width = w;
        this.height = this.dc.height = this.oc.height = this.fc.height = h;
        window.airCanvas = this.dc;
        this._fillBg();
        this.ctx.putImageData(img, 0, 0);
        this._redrawObjects();
    }

    _saveUndo() {
        this.undoStack.push(this.ctx.getImageData(0, 0, this.width, this.height));
        if (this.undoStack.length > 20) this.undoStack.shift();
    }

    undo() {
        if (!this.undoStack.length) return;
        this.ctx.putImageData(this.undoStack.pop(), 0, 0);
    }

    clearAll() {
        this._saveUndo();
        this.objects = [];
        this.octx.clearRect(0, 0, this.width, this.height);
        this._fillBg();
    }

    // Normalized → pixel (mirrored X)
    _px(pt) {
        return { x: (1 - pt.x) * this.width, y: pt.y * this.height };
    }

    update(gesture, indexPt, palmPt, thumbPt) {
        this.mode = gesture;
        this.fctx.clearRect(0, 0, this.width, this.height);

        if (!indexPt) {
            this._liftPen();
            this.activeObj = null;
            this.wasMoving = false;
            return;
        }

        const px = this._px(indexPt);
        const palmPx = palmPt ? this._px(palmPt) : px;
        // Pinch midpoint for grabbing
        const movePx = thumbPt ? this._px(thumbPt) : px;

        switch (gesture) {
            case 'draw':
                // If we were just moving, release object first
                if (this.wasMoving) { this.activeObj = null; this.wasMoving = false; }
                this._handleDraw(px);
                break;
            case 'erase':
                this._liftPen();
                this.activeObj = null;
                this.wasMoving = false;
                this._handleErase(palmPx);
                break;
            case 'move':
                this._liftPen();
                this._handleMove(movePx);
                this.wasMoving = true;
                break;
            case 'idle':
                this._liftPen();
                // Only clear activeObj when pinch is fully released
                if (this.wasMoving) { this.activeObj = null; this.wasMoving = false; }
                break;
        }

        this._drawCursor(px, gesture);
    }

    _liftPen() {
        if (this.drawing && this.currentStroke.length >= this.SNAP_MIN_PTS) {
            this._trySnapShape();
        }
        this.drawing = false;
        this.lastPt = null;
        this.ctrlPt = null;
        this.currentStroke = [];
    }

    _handleDraw(px) {
        if (!this.drawing) {
            this._saveUndo();
            this.drawing = true;
            this.lastPt = px;
            this.ctrlPt = px;
            this.currentStroke = [px];
            return;
        }
        this.currentStroke.push(px);

        const mid = { x: (this.lastPt.x + px.x) / 2, y: (this.lastPt.y + px.y) / 2 };
        this.ctx.beginPath();
        this.ctx.moveTo(this.ctrlPt.x, this.ctrlPt.y);
        this.ctx.quadraticCurveTo(this.lastPt.x, this.lastPt.y, mid.x, mid.y);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.markerSize;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();

        this.ctrlPt = mid;
        this.lastPt = px;
    }

    _handleErase(px) {
        const r = this.eraserSize / 2;
        this.ctx.beginPath();
        this.ctx.arc(px.x, px.y, r, 0, Math.PI * 2);
        this.ctx.fillStyle = '#000';
        this.ctx.fill();

        this.fctx.beginPath();
        this.fctx.arc(px.x, px.y, r, 0, Math.PI * 2);
        this.fctx.strokeStyle = 'rgba(255,255,255,0.45)';
        this.fctx.lineWidth = 1.5;
        this.fctx.stroke();
    }

    _handleMove(px) {
        // Grab object once when pinch starts
        if (!this.activeObj) {
            this.activeObj = this._findNearest(px);
            if (this.activeObj) {
                this.pinchOffset = {
                    x: px.x - this.activeObj.cx,
                    y: px.y - this.activeObj.cy
                };
                console.log('Grabbed object:', this.activeObj);
            } else {
                console.log('No object found near', px, '— objects:', this.objects.length);
            }
        }

        if (this.activeObj) {
            this.activeObj.cx = px.x - this.pinchOffset.x;
            this.activeObj.cy = px.y - this.pinchOffset.y;
            this._redrawObjects();

            // Yellow highlight on feedback layer
            this.fctx.beginPath();
            this.fctx.arc(this.activeObj.cx, this.activeObj.cy, this.activeObj.r + 10, 0, Math.PI * 2);
            this.fctx.strokeStyle = 'rgba(255,220,0,0.7)';
            this.fctx.lineWidth = 3;
            this.fctx.stroke();
        }
    }

    _drawCursor(px, gesture) {
        const c = { draw: this.color, erase: '#ffffff', move: '#ffc800', idle: '#444' }[gesture] || '#fff';
        this.fctx.beginPath();
        this.fctx.arc(px.x, px.y, 6, 0, Math.PI * 2);
        this.fctx.fillStyle = c;
        this.fctx.fill();
        this.fctx.beginPath();
        this.fctx.arc(px.x, px.y, 11, 0, Math.PI * 2);
        this.fctx.strokeStyle = c;
        this.fctx.lineWidth = 1.5;
        this.fctx.globalAlpha = 0.35;
        this.fctx.stroke();
        this.fctx.globalAlpha = 1;
    }

    _trySnapShape() {
        const pts = this.currentStroke;
        if (pts.length < this.SNAP_MIN_PTS) return;

        const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const w = maxX - minX;
        const h = maxY - minY;

        if (w < 20 || h < 20) return; // too small to snap

        const avgR = pts.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / pts.length;
        const variance = pts.reduce((s, p) => {
            const d = Math.hypot(p.x - cx, p.y - cy) - avgR;
            return s + d * d;
        }, 0) / pts.length;

        // More lenient thresholds
        const isRound = variance < avgR * avgR * 0.25;
        const isSquare = Math.abs(w - h) < w * 0.5;
        const closeDist = Math.hypot(
            pts[0].x - pts[pts.length - 1].x,
            pts[0].y - pts[pts.length - 1].y
        );
        const isClosed = closeDist < Math.max(w, h) * 0.5;

        console.log('Snap check — isRound:', isRound, 'isClosed:', isClosed, 'variance:', variance.toFixed(2), 'avgR:', avgR.toFixed(2));

        if (isRound && isSquare && isClosed) {
            // Remove drawn stroke, replace with clean circle on obj layer
            if (this.undoStack.length) {
                this.ctx.putImageData(this.undoStack[this.undoStack.length - 1], 0, 0);
            }
            const obj = { type: 'circle', cx, cy, r: avgR, color: this.color, size: this.markerSize };
            this.objects.push(obj);
            this._redrawObjects();
            console.log('Snapped circle added. Total objects:', this.objects.length);
        }
    }

    _redrawObjects() {
        this.octx.clearRect(0, 0, this.width, this.height);
        for (const obj of this.objects) {
            this.octx.beginPath();
            if (obj.type === 'circle') {
                this.octx.arc(obj.cx, obj.cy, obj.r, 0, Math.PI * 2);
            }
            this.octx.strokeStyle = obj.color;
            this.octx.lineWidth = obj.size;
            this.octx.lineCap = 'round';
            this.octx.stroke();
        }
    }

    // Grab radius = 120px — generous so pinch near circle works
    _findNearest(px) {
        let best = null, bestD = 120;
        for (const obj of this.objects) {
            // For circles: distance to CENTER, not perimeter
            const d = Math.hypot(px.x - obj.cx, px.y - obj.cy);
            const grabDist = d < obj.r + 60 ? d : Infinity; // within circle + 60px margin
            if (grabDist < bestD) { best = obj; bestD = grabDist; }
        }
        return best;
    }

    saveImage() {
        const tmp = document.createElement('canvas');
        tmp.width = this.width;
        tmp.height = this.height;
        const tctx = tmp.getContext('2d');
        tctx.drawImage(this.dc, 0, 0);
        tctx.drawImage(this.oc, 0, 0);
        const a = document.createElement('a');
        a.href = tmp.toDataURL('image/png');
        a.download = 'airglyph.png';
        a.click();
    }
}