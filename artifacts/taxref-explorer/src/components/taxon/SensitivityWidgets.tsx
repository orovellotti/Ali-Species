export function ScoreRing({ score, ringColor, size = 80 }: { score: number; ringColor: string; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-muted/30" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className={ringColor} strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.6s ease" }} />
    </svg>
  );
}

export function SensitivityRadar({
  ecological, regulatory, territorial, management, fillClass, strokeClass,
}: {
  ecological: number; regulatory: number; territorial: number; management: number;
  fillClass: string; strokeClass: string;
}) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 62;
  const axes = [
    { label: "Ecologique", value: ecological, angle: -Math.PI / 2 },
    { label: "Reglementaire", value: regulatory, angle: 0 },
    { label: "Territorial", value: territorial, angle: Math.PI / 2 },
    { label: "Gestion", value: management, angle: Math.PI },
  ];
  const point = (v: number, angle: number) => [cx + Math.cos(angle) * r * v, cy + Math.sin(angle) * r * v] as const;
  const polygon = axes.map(a => point(Math.max(0.02, a.value), a.angle).join(",")).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map(level => (
    <polygon
      key={level}
      points={axes.map(a => point(level, a.angle).join(",")).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeOpacity={level === 1 ? 0.25 : 0.12}
      strokeWidth={level === 1 ? 1 : 0.5}
    />
  ));
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto max-w-[180px] text-muted-foreground">
      {grid}
      {axes.map((a, i) => {
        const [x, y] = point(1, a.angle);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="currentColor" strokeOpacity={0.15} strokeWidth={0.5} />;
      })}
      <polygon points={polygon} className={`${fillClass} ${strokeClass}`} strokeWidth={1.5} />
      {axes.map((a, i) => {
        const [x, y] = point(1, a.angle);
        const lx = cx + (x - cx) * 1.18;
        const ly = cy + (y - cy) * 1.18;
        return (
          <text
            key={i}
            x={lx}
            y={ly}
            textAnchor={Math.abs(x - cx) < 1 ? "middle" : x > cx ? "start" : "end"}
            dominantBaseline={Math.abs(y - cy) < 1 ? "middle" : y > cy ? "hanging" : "auto"}
            className="fill-muted-foreground"
            fontSize="9"
            fontWeight="600"
          >
            {a.label}
          </text>
        );
      })}
      {axes.map((a, i) => {
        const [x, y] = point(Math.max(0.02, a.value), a.angle);
        return <circle key={i} cx={x} cy={y} r={2.5} className={strokeClass.replace("stroke-", "fill-")} />;
      })}
    </svg>
  );
}

export function dimensionColors(label: string): { fill: string; stroke: string } {
  if (label === "tres-eleve" || label === "Tres elevee") return { fill: "fill-red-400/30", stroke: "stroke-red-500" };
  if (label === "elevee" || label === "Elevee") return { fill: "fill-orange-400/30", stroke: "stroke-orange-500" };
  if (label === "moderee" || label === "Moderee") return { fill: "fill-amber-400/30", stroke: "stroke-amber-500" };
  if (label === "faible" || label === "Faible") return { fill: "fill-emerald-400/25", stroke: "stroke-emerald-500" };
  return { fill: "fill-primary/25", stroke: "stroke-primary" };
}

export function DimensionBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-28 text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%`, transition: "width 0.5s ease" }} />
      </div>
      <span className="w-8 text-right text-xs font-mono text-muted-foreground">{value.toFixed(1)}</span>
    </div>
  );
}
