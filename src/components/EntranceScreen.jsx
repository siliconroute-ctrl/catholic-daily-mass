import { HeroArt, EXTERIOR_PHOTOS } from "./EucharistArt.jsx";
import { REGIONS } from "../lib/regions.js";

export default function EntranceScreen({
  dateLabel,
  year,
  weekdayCycle,
  region,
  onRegionChange,
  onEnter,
  onAbout,
}) {
  return (
    <div className="entrance">
      <HeroArt className="entrance-banner" photos={EXTERIOR_PHOTOS} alt="A Catholic church" />

      <div className="entrance-body">
        <h1 className="brand">Catholic Daily Mass</h1>
        <p className="brand-sub">{dateLabel}</p>

        <div className="meta-row">
          <span className="year-pill">Year {year}</span>
          <span className="year-pill year-pill-secondary">
            Weekday Year {weekdayCycle}
          </span>
        </div>

        <div className="entrance-controls">
          <label className="entrance-country">
            <span className="entrance-country-label">Select your country</span>
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

          <button className="about-link" onClick={onAbout}>
            About this app
          </button>
        </div>
      </div>
    </div>
  );
}
