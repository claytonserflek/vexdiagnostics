import { useEffect, useState } from "react";

interface RobotConfig {
  robotName: string;
  drivetrainType: string;
  motorCount: string;
  cartridge: string;
  wheelDiameterIn: string;
  gearRatio: string;
}

const DEFAULT_CONFIG: RobotConfig = {
  robotName: "",
  drivetrainType: "4-motor",
  motorCount: "4",
  cartridge: "green-200",
  wheelDiameterIn: "4",
  gearRatio: "1:1",
};

const STORAGE_KEY = "vexdiag.robotConfig";

function loadConfig(): RobotConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    // ignore -- fall back to defaults
  }
  return DEFAULT_CONFIG;
}

const DRIVETRAIN_TYPES = [
  { value: "2-motor", label: "2-Motor (Tank)" },
  { value: "4-motor", label: "4-Motor (Tank)" },
  { value: "6-motor", label: "6-Motor (Tank)" },
  { value: "x-drive", label: "X-Drive" },
  { value: "h-drive", label: "H-Drive" },
];

const CARTRIDGES = [
  { value: "red-100", label: "Red — 100 RPM (36:1)" },
  { value: "green-200", label: "Green — 200 RPM (18:1)" },
  { value: "blue-600", label: "Blue — 600 RPM (6:1)" },
];

const SLOT_COUNT: Record<string, number> = {
  "2-motor": 2,
  "4-motor": 4,
  "6-motor": 6,
  "x-drive": 4,
  "h-drive": 4,
};

export function RobotSetupPage() {
  const [config, setConfig] = useState<RobotConfig>(loadConfig);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      const t = setTimeout(() => setSaved(false), 1400);
      return () => clearTimeout(t);
    } catch {
      // localStorage unavailable -- config just won't persist this session
    }
  }, [config]);

  function set<K extends keyof RobotConfig>(key: K, value: RobotConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  const slots = SLOT_COUNT[config.drivetrainType] ?? (Number(config.motorCount) || 4);
  const perSide = Math.max(1, Math.round(slots / 2));

  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Robot Setup</h1>
        <p className="page-subtitle">
          Drivetrain configuration, stored on this device. This doesn't change how a test is diagnosed today, but
          having it on hand will let future comparisons account for gearing/wheel differences between robots.
        </p>
      </div>

      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="field">
          <label htmlFor="robot-name">Robot Name</label>
          <input
            id="robot-name"
            className="input"
            value={config.robotName}
            onChange={(e) => set("robotName", e.target.value)}
            placeholder="e.g. 1234A"
          />
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="drivetrain-type">Drivetrain Type</label>
            <select
              id="drivetrain-type"
              className="select"
              value={config.drivetrainType}
              onChange={(e) => set("drivetrainType", e.target.value)}
            >
              {DRIVETRAIN_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="motor-count">Number of Motors</label>
            <input
              id="motor-count"
              className="input"
              type="number"
              min={2}
              max={8}
              value={config.motorCount}
              onChange={(e) => set("motorCount", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="cartridge">Motor Cartridge</label>
            <select id="cartridge" className="select" value={config.cartridge} onChange={(e) => set("cartridge", e.target.value)}>
              {CARTRIDGES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="wheel-diameter">Wheel Diameter (in)</label>
            <input
              id="wheel-diameter"
              className="input"
              type="number"
              step="0.25"
              value={config.wheelDiameterIn}
              onChange={(e) => set("wheelDiameterIn", e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="gear-ratio">External Gear Ratio</label>
            <input
              id="gear-ratio"
              className="input"
              value={config.gearRatio}
              onChange={(e) => set("gearRatio", e.target.value)}
              placeholder="e.g. 1:1"
            />
            <span className="field-hint">Driven : driving, e.g. 3:5 for a 5:3 speed-up.</span>
          </div>
        </div>

        <span className="subtle" style={{ fontSize: "0.76rem" }}>
          {saved ? "Saved to this device." : ""}
        </span>
      </div>

      <div className="panel section-gap" style={{ maxWidth: 640 }}>
        <h3 className="panel-title">Layout Preview</h3>
        <p className="panel-hint">{slots}-motor drivetrain, {perSide} per side.</p>
        <div className="drivetrain-svg-wrap">
          <svg width={200} height={190} viewBox="0 0 200 190" role="img" aria-label="Drivetrain layout preview">
            <rect x={60} y={30} width={80} height={130} rx={8} fill="var(--surface-sunken)" stroke="var(--border)" />
            {Array.from({ length: perSide }).map((_, i) => {
              const y = 20 + i * (140 / Math.max(1, perSide - 1 || 1));
              const yy = perSide === 1 ? 85 : y;
              return (
                <g key={`l-${i}`}>
                  <line x1={40} y1={yy + 20} x2={60} y2={yy + 20} stroke="var(--border-strong)" strokeWidth={2} />
                  <rect x={20} y={yy} width={20} height={40} rx={3} fill="var(--surface)" stroke="var(--border-strong)" />
                </g>
              );
            })}
            {Array.from({ length: slots - perSide }).map((_, i) => {
              const count = slots - perSide;
              const y = 20 + i * (140 / Math.max(1, count - 1 || 1));
              const yy = count === 1 ? 85 : y;
              return (
                <g key={`r-${i}`}>
                  <line x1={160} y1={yy + 20} x2={140} y2={yy + 20} stroke="var(--border-strong)" strokeWidth={2} />
                  <rect x={160} y={yy} width={20} height={40} rx={3} fill="var(--surface)" stroke="var(--border-strong)" />
                </g>
              );
            })}
            <text x={100} y={100} textAnchor="middle" fontSize={9} letterSpacing={1.2} fill="var(--text-tertiary)">
              {config.drivetrainType.toUpperCase()}
            </text>
          </svg>
        </div>
      </div>
    </>
  );
}
