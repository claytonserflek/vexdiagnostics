import type { ThemePreference } from "../theme";
import { IconMoon, IconSun } from "../components/Icons";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsPage({
  theme,
  onThemeChange,
}: {
  theme: ThemePreference;
  onThemeChange: (t: ThemePreference) => void;
}) {
  return (
    <>
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
        <p className="page-subtitle">Display and app preferences.</p>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 className="panel-title">Appearance</h3>
        <p className="panel-hint">Choose how VEX Diagnostics looks on this device.</p>
        <div className="chip-row" style={{ marginBottom: 0 }}>
          {THEME_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`chip${theme === o.value ? " active-accent" : ""}`}
              onClick={() => onThemeChange(o.value)}
              aria-pressed={theme === o.value}
            >
              {o.value === "light" && <IconSun />}
              {o.value === "dark" && <IconMoon />}
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel" style={{ maxWidth: 480 }}>
        <h3 className="panel-title">About</h3>
        <p className="panel-hint" style={{ marginBottom: 0 }}>
          VEX Diagnostics analyzes drivetrain telemetry with deterministic statistics -- no AI/ML in the
          diagnostic path. See the project README and <code className="mono">docs/</code> for the full test
          protocol and algorithm.
        </p>
      </div>
    </>
  );
}
