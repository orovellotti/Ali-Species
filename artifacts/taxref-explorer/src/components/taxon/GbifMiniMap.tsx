import { useState, useRef, useEffect } from "react";

export function GbifMiniMap({ gbifKey }: { gbifKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = 512;
    const h = 256;
    canvas.width = w;
    canvas.height = h;

    let cancelled = false;
    const tiles = [
      [1, 0, 0], [1, 1, 0],
      [1, 0, 1], [1, 1, 1],
    ] as const;

    const baseTiles = tiles.map(([z, x, y]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
      return { img, x, y };
    });

    const overlayTiles = tiles.map(([z, x, y]) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://api.gbif.org/v2/map/occurrence/density/${z}/${x}/${y}@2x.png?taxonKey=${gbifKey}&bin=hex&hexPerTile=20&style=green.poly`;
      return { img, x, y };
    });

    let loadedCount = 0;
    const totalExpected = baseTiles.length;

    function draw() {
      if (cancelled) return;
      ctx!.clearRect(0, 0, w, h);
      for (const t of baseTiles) {
        const dx = t.x * (w / 2);
        const dy = t.y * (h / 2);
        try { ctx!.drawImage(t.img, dx, dy, w / 2, h / 2); } catch {}
      }
      for (const t of overlayTiles) {
        const dx = t.x * (w / 2);
        const dy = t.y * (h / 2);
        try { ctx!.drawImage(t.img, dx, dy, w / 2, h / 2); } catch {}
      }
    }

    for (const t of baseTiles) {
      t.img.onload = () => {
        loadedCount++;
        if (loadedCount >= totalExpected) {
          draw();
          setLoaded(true);
        }
      };
    }
    for (const t of overlayTiles) {
      t.img.onload = () => draw();
      t.img.onerror = () => {};
    }

    return () => { cancelled = true; };
  }, [gbifKey]);

  return (
    <canvas
      ref={canvasRef}
      className={`w-full h-auto rounded-t-2xl transition-opacity duration-300 ${loaded ? "opacity-100" : "opacity-0"}`}
      style={{ aspectRatio: "2/1", background: "#e8ecf1" }}
    />
  );
}
