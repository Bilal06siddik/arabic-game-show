import { useCallback, useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';

/* ─── Color Palette (skribbl.io exact) ─── */
const PALETTE: string[] = [
  '#000000', '#808080', '#c0c0c0', '#ffffff',
  '#800000', '#ff0000', '#ff6600', '#ffcc00',
  '#808000', '#008000', '#00ff00', '#00ff80',
  '#008080', '#00ffff', '#0000ff', '#0080ff',
  '#000080', '#8000ff', '#ff00ff', '#ff0080',
  '#804000', '#ff8040', '#ffcc80', '#ffe0c0',
];

const BRUSH_SIZES = [4, 8, 14, 22, 32];
const MAX_HISTORY = 40;

type Tool = 'brush' | 'fill' | 'eraser';

interface DrawingPadProps {
  disabled?: boolean;
  onSubmit: (imageDataUrl: string) => void;
  timeLeft?: number;
  showTimer?: boolean;
}

/* ─── Flood-fill ─── */
function floodFill(ctx: CanvasRenderingContext2D, startX: number, startY: number, fillColor: string, canvas: HTMLCanvasElement) {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const toIdx = (x: number, y: number) => (y * canvas.width + x) * 4;

  const sr = data[toIdx(startX, startY)];
  const sg = data[toIdx(startX, startY) + 1];
  const sb = data[toIdx(startX, startY) + 2];
  const sa = data[toIdx(startX, startY) + 3];

  const tmp = document.createElement('canvas');
  tmp.width = 1; tmp.height = 1;
  const tmpCtx = tmp.getContext('2d')!;
  tmpCtx.fillStyle = fillColor;
  tmpCtx.fillRect(0, 0, 1, 1);
  const fd = tmpCtx.getImageData(0, 0, 1, 1).data;
  const [fr, fg, fb, fa] = [fd[0], fd[1], fd[2], fd[3]];
  if (sr === fr && sg === fg && sb === fb && sa === fa) return;

  const match = (idx: number) => data[idx] === sr && data[idx + 1] === sg && data[idx + 2] === sb && data[idx + 3] === sa;
  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(canvas.width * canvas.height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
    if (visited[y * canvas.width + x]) continue;
    const idx = toIdx(x, y);
    if (!match(idx)) continue;
    visited[y * canvas.width + x] = 1;
    data[idx] = fr; data[idx + 1] = fg; data[idx + 2] = fb; data[idx + 3] = fa;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  ctx.putImageData(imageData, 0, 0);
}

export function DrawingPad({ disabled, onSubmit, timeLeft = 30, showTimer = false }: DrawingPadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(8);
  const [tool, setTool] = useState<Tool>('brush');

  // Undo/redo history: array of ImageData snapshots
  const historyRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const totalTime = 30;
  const timerPct = showTimer ? Math.max(0, (timeLeft / totalTime) * 100) : 100;
  const timerClass = timerPct > 60 ? 'plenty' : timerPct > 25 ? 'mid' : 'low';

  /* ── Snapshot helper ── */
  const saveSnapshot = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snap);
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
    redoRef.current = [];
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(false);
  }, []);

  /* ── Undo ── */
  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || historyRef.current.length === 0) return;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    redoRef.current.push(current);
    const prev = historyRef.current.pop()!;
    ctx.putImageData(prev, 0, 0);
    setCanUndo(historyRef.current.length > 0);
    setCanRedo(true);
  }

  /* ── Redo ── */
  function redo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || redoRef.current.length === 0) return;
    const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(current);
    const next = redoRef.current.pop()!;
    ctx.putImageData(next, 0, 0);
    setCanUndo(true);
    setCanRedo(redoRef.current.length > 0);
  }

  /* ── Init Canvas ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  /* ── Keyboard shortcuts: Ctrl+Z / Ctrl+Y ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (disabled) return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled]);

  /* ── Point from event ── */
  function getPoint(e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      const t = e.touches[0] ?? e.changedTouches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  /* ── Mouse handlers ── */
  function onPointerDown(e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const { x, y } = getPoint(e);

    if (tool === 'fill') {
      saveSnapshot();
      floodFill(ctx, Math.floor(x), Math.floor(y), color, canvas);
      return;
    }

    saveSnapshot();
    setIsDrawing(true);
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.fillStyle = tool === 'eraser' ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(x, y, (tool === 'eraser' ? brushSize * 3 : brushSize) / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing || disabled || tool === 'fill') return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d')!;
    ctx.lineWidth = tool === 'eraser' ? brushSize * 3 : brushSize;
    ctx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    const { x, y } = getPoint(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerUp() {
    setIsDrawing(false);
    canvasRef.current?.getContext('2d')?.beginPath();
  }

  function clearCanvas() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    saveSnapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function submitCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSubmit(canvas.toDataURL('image/png'));
  }

  const cursorStyle = tool === 'fill' ? 'crosshair' : 'crosshair';

  return (
    <div className="skribbl-pad">
      {showTimer && (
        <div className="skribbl-timer-bar-wrap">
          <div className={`skribbl-timer-bar ${timerClass}`} style={{ width: `${timerPct}%` }} />
          <span className="skribbl-timer-label">{timeLeft}s</span>
        </div>
      )}

      <div className="skribbl-layout">
        {/* Left sidebar */}
        <div className="skribbl-sidebar">
          <div className="skribbl-tools-group">
            <button type="button" title="Brush (B)" className={`skribbl-tool-btn${tool === 'brush' ? ' active' : ''}`} onClick={() => setTool('brush')} disabled={disabled}>✏️</button>
            <button type="button" title="Fill (F)" className={`skribbl-tool-btn${tool === 'fill' ? ' active' : ''}`} onClick={() => setTool('fill')} disabled={disabled}>🪣</button>
            <button type="button" title="Eraser (E)" className={`skribbl-tool-btn${tool === 'eraser' ? ' active' : ''}`} onClick={() => setTool('eraser')} disabled={disabled}>🧹</button>
          </div>

          <div className="skribbl-divider" />

          {/* Brush sizes */}
          <div className="skribbl-sizes-group">
            {BRUSH_SIZES.map((s) => (
              <button
                key={s}
                type="button"
                title={`Size ${s}`}
                className={`skribbl-size-btn${brushSize === s ? ' active' : ''}`}
                onClick={() => { setBrushSize(s); if (tool === 'fill') setTool('brush'); }}
                disabled={disabled}
              >
                <span className="skribbl-size-dot" style={{
                  width: Math.min(s, 28),
                  height: Math.min(s, 28),
                  background: tool === 'eraser' ? '#aaa' : color,
                  border: color.toLowerCase() === '#ffffff' || color.toLowerCase() === '#ffffff' ? '1px solid #666' : '1px solid rgba(255,255,255,0.2)'
                }} />
              </button>
            ))}
          </div>

          <div className="skribbl-divider" />

          {/* Undo */}
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            className={`skribbl-tool-btn${!canUndo || disabled ? '' : ''}`}
            style={{ fontSize: '0.9rem' }}
            onClick={undo}
            disabled={disabled || !canUndo}
          >
            ↩️
          </button>

          {/* Redo */}
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            className="skribbl-tool-btn"
            style={{ fontSize: '0.9rem' }}
            onClick={redo}
            disabled={disabled || !canRedo}
          >
            ↪️
          </button>

          <div className="skribbl-divider" />

          {/* Clear */}
          <button type="button" className="skribbl-tool-btn skribbl-clear-btn" title="Clear canvas" onClick={clearCanvas} disabled={disabled}>
            🗑️
          </button>
        </div>

        {/* Canvas */}
        <div className="skribbl-canvas-wrap">
          <canvas
            ref={canvasRef}
            width={800}
            height={480}
            className="skribbl-canvas"
            style={{ cursor: cursorStyle }}
            onMouseDown={onPointerDown}
            onMouseMove={onPointerMove}
            onMouseUp={onPointerUp}
            onMouseLeave={onPointerUp}
            onTouchStart={onPointerDown}
            onTouchMove={onPointerMove}
            onTouchEnd={onPointerUp}
          />
        </div>
      </div>

      {/* Bottom: palette + submit */}
      <div className="skribbl-bottom">
        <div className="skribbl-palette">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`skribbl-swatch${color === c && tool !== 'eraser' ? ' active' : ''}`}
              style={{ backgroundColor: c, outline: c === '#ffffff' ? '1px solid #bbb' : undefined }}
              onClick={() => { setColor(c); setTool('brush'); }}
              disabled={disabled}
            />
          ))}
        </div>
        <button type="button" className="skribbl-submit-btn" onClick={submitCanvas} disabled={disabled}>
          ✓ SUBMIT
        </button>
      </div>
    </div>
  );
}
