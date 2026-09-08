import { HeroArt, EXTERIOR_PHOTOS } from "./EucharistArt.jsx";
import { REGIONS } from "../lib/regions.js";

export default function EntranceScreen({
  dateLabel,
  year,
  weekdayCycle,
  region,
  onRegionChange,
  onEnter,
}) {
  return (
    <div className="entrance">
      <HeroArt className="top-banner" photos={EXTERIOR_PHOTOS} alt="A Catholic church" />

      <div className="entrance-body">
        <h1 className="brand">Catholic Daily Mass</h1>
        <p className="brand-sub">{dateLabel}</p>

        <div className="meta-row">
          <span className="year-pill">Year {year}</span>
          <span className="year-pill year-pill-secondary">
            Weekday Year {weekdayCycle}
          </span>
        </div>

        <label className="region-picker entrance-region">
          <span className="region-picker-label">
            Select your country
            <span className="region-picker-hint">
              (guessed from your device — change anytime)
            </span>
          </span>
          <select value={region} onChange={onRegionChange}>
            {REGIONS.map((r) => (
              <option key={r.calendar} value={r.calendar}>
                {r.name}
              </option>
            ))}
          </select>
        </label>

        <button className="enter-button" onClick={onEnter}>
          Enter Today&rsquo;s Mass
        </button>
      </div>
    </div>
  );
}
