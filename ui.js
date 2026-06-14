// ui.js — Control panel, color picker, sliders, color history

class UIController {
    constructor(airCanvas) {
        this.ac = airCanvas;
        this.colorHistory = [];
        this.MAX_HISTORY = 6;
        this._bind();
    }

    _bind() {
        const colorPicker = document.getElementById('colorPicker');

        // Color picker input
        colorPicker.addEventListener('input', e => {
            this.ac.color = e.target.value;
            this._updatePreview(e.target.value);
        });
        // Add to history on close (user finished picking)
        colorPicker.addEventListener('change', e => {
            this._addToHistory(e.target.value);
        });

        // Preset colors
        document.querySelectorAll('.preset-color').forEach(btn => {
            btn.addEventListener('click', () => {
                const c = btn.dataset.color;
                this.ac.color = c;
                colorPicker.value = c;
                this._updatePreview(c);
                this._addToHistory(c);
            });
        });

        // Marker size
        document.getElementById('markerSize').addEventListener('input', e => {
            this.ac.markerSize = parseInt(e.target.value);
            document.getElementById('markerSizeVal').textContent = e.target.value + 'px';
        });

        // Eraser size
        document.getElementById('eraserSize').addEventListener('input', e => {
            this.ac.eraserSize = parseInt(e.target.value);
            document.getElementById('eraserSizeVal').textContent = e.target.value + 'px';
        });

        // Buttons
        document.getElementById('btnUndo').addEventListener('click', () => this.ac.undo());
        document.getElementById('btnClear').addEventListener('click', () => {
            if (confirm('Clear the entire canvas?')) this.ac.clearAll();
        });
        document.getElementById('btnSave').addEventListener('click', () => this.ac.saveImage());
    }

    _updatePreview(color) {
        document.getElementById('colorPreview').style.background = color;
        document.getElementById('colorPreview').style.boxShadow = `0 0 10px ${color}`;
        document.documentElement.style.setProperty('--cursor-color', color);
    }

    _addToHistory(color) {
        // Remove duplicate then prepend
        this.colorHistory = this.colorHistory.filter(c => c !== color);
        this.colorHistory.unshift(color);
        if (this.colorHistory.length > this.MAX_HISTORY) this.colorHistory.pop();
        this._renderHistory();
    }

    _renderHistory() {
        const container = document.getElementById('colorHistory');
        container.innerHTML = '';
        this.colorHistory.forEach(c => {
            const dot = document.createElement('div');
            dot.className = 'history-dot';
            dot.style.background = c;
            dot.title = c;
            dot.addEventListener('click', () => {
                this.ac.color = c;
                document.getElementById('colorPicker').value = c;
                this._updatePreview(c);
            });
            container.appendChild(dot);
        });
    }

    updateMode(gesture) {
        const badge = document.getElementById('modeBadge');
        const icons = { draw: '✏️ Drawing', erase: '🖐 Erasing', move: '🤌 Moving', idle: '✊ Idle' };
        const classes = { draw: 'mode-draw', erase: 'mode-erase', move: 'mode-move', idle: 'mode-idle' };
        badge.textContent = icons[gesture] || '✊ Idle';
        badge.className = 'mode-badge ' + (classes[gesture] || 'mode-idle');
    }
}