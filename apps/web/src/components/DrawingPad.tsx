import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';

interface DrawingPadProps {
  disabled?: boolean;
  onSubmit: (imageDataUrl: string) => void;
}

export function DrawingPad({ disabled, onSubmit }: DrawingPadProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#10253f';
  }, []);

  function getPoint(event: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }
    const rect = canvas.getBoundingClientRect();

    if ('touches' in event) {
      const touch = event.touches[0] ?? event.changedTouches[0];
      return {
        x: ((touch.clientX - rect.left) / rect.width) * canvas.width,
        y: ((touch.clientY - rect.top) / rect.height) * canvas.height,
      };
    }

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDraw(event: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    if (disabled) {
      return;
    }
    event.preventDefault();
    setDrawing(true);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) {
      return;
    }
    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  }

  function moveDraw(event: MouseEvent<HTMLCanvasElement> | TouchEvent<HTMLCanvasElement>) {
    if (!drawing || disabled) {
      return;
    }
    event.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) {
      return;
    }
    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function endDraw(): void {
    setDrawing(false);
  }

  function clearCanvas(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function submitCanvas(): void {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    onSubmit(canvas.toDataURL('image/png'));
  }

  return (
    <div className="drawing-pad">
      <canvas
        ref={canvasRef}
        width={700}
        height={320}
        onMouseDown={startDraw}
        onMouseMove={moveDraw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={moveDraw}
        onTouchEnd={endDraw}
      />
      <div className="drawing-actions">
        <button type="button" className="secondary-btn" onClick={clearCanvas} disabled={disabled}>
          Clear
        </button>
        <button type="button" className="primary-btn" onClick={submitCanvas} disabled={disabled}>
          Submit
        </button>
      </div>
    </div>
  );
}
