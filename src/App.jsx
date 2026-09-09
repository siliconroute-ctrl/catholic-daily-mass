import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchReadings,
  normaliseReadings,
  displayDate,
} from "./lib/universalis.js";
import * as tts from "./lib/tts.js";
import { liturgicalYearLetter, weekdayCycleNumeral } from "./lib/liturgicalYear.js";
import { loadSavedRegion, saveRegion } from "./lib/regions.js";
import EntranceScreen from "./components/EntranceScreen.jsx";
import AboutPage from "./components/AboutPage.jsx";
import { HeroArt, INTERIOR_PHOTOS } from "./components/EucharistArt.jsx";
import { fetchAudioManifest } from "./lib/cloudAudio.js";
import { MASS_CONCLUSION_SECTIONS } from "./lib/massConclusion.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function App() {
  const [entered, setEntered] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [date, setDate] = useState(() => new Date());
  const [region, setRegion] = useState(() => loadSavedRegion());
  const [state, setState] = useState({ status: "loading" });
  const [reading, setReading] = useState(null);
  const [playState, setPlayState] = useState("idle");
  const [maleVoiceMissing, setMaleVoiceMissing] = useState(false);
  const [hdAudio, setHdAudio] = useState(null); // manifest for pre-generated audio, or null
  const topRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (tts.isSupported()) {
      tts.hasMaleVoice().then((has) => setMaleVoiceMissing(!has));
    }
  }, []);

  const load = useCallback((d, cal) => {
    setState({ status: "loading" });
    fetchReadings(d, cal)
      .then((raw) => {
        setState({ status: "ready", data: normaliseReadings(raw) });
        if (topRef.current) topRef.current.scrollIntoView({ block: "start" });
      })
      .catch((err) => setState({ status: "error", message: err.message }));
  }, []);

  const stopAll = useCallback(() => {
    tts.stop();
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.currentTime = 0;
    }
    setPlayState("idle");
    setReading(null);
  }, []);

  // Fetch quietly in the background even while on the entrance screen, so
  // the readings are already there the moment the person steps in. Also
  // check whether HD audio exists for this date.
  useEffect(() => {
    stopAll();
    setHdAudio(null);
    load(date, region);
    let cancelled = false;
    fetchAudioManifest(date).then((m) => {
      if (!cancelled) setHdAudio(m);
    });
    return () => {
      cancelled = true;
    };
  }, [date, region, load, stopAll]);

  useEffect(() => () => stopAll(), [stopAll]);

  // Highlight the section being read while the HD audio plays.
  const onAudioTime = () => {
    const a = audioRef.current;
    if (!a || !hdAudio) return;
    const t = a.currentTime;
    const sec = hdAudio.sections.find((s) => t >= s.start && t < s.end);
    const key = sec ? sec.key : null;
    setReading(key === "bell" ? null : key);
  };

  const ARCHIVE_DAYS = 3;
  const today = new Date();
  const earliestDate = new Date(today.getTime() - ARCHIVE_DAYS * DAY_MS);

  const clampDate = (d) => {
    if (d.getTime() > today.getTime() && !sameDay(d, today)) return today;
    if (d.getTime() < earliestDate.getTime() && !sameDay(d, earliestDate)) return earliestDate;
    return d;
  };

  const shift = (days) =>
    setDate((d) => clampDate(new Date(d.getTime() + days * DAY_MS)));

  const isToday = sameDay(date, today);
  const isEarliestArchiveDay = sameDay(date, earliestDate);
  const year = liturgicalYearLetter(date);
  const weekdayCycle = weekdayCycleNumeral(date);

  const onRegionChange = (e) => {
    const cal = e.target.value;
    setRegion(cal);
    saveRegion(cal);
  };

  const onListen = () => {
    if (state.status !== "ready") return;

    // Preferred path: pre-generated HD audio for this date.
    if (hdAudio && audioRef.current) {
      const a = audioRef.current;
      if (playState === "playing") {
        a.pause();
        setPlayState("paused");
      } else {
        a.play()
          .then(() => setPlayState("playing"))
          .catch(() => {
            // If the browser refuses (rare), fall back to the device voice.
            setHdAudio(null);
            startDeviceVoice();
          });
      }
      return;
    }

    // Fallback: device text-to-speech.
    if (playState === "playing") {
      tts.pause();
      setPlayState("paused");
    } else if (playState === "paused") {
      tts.resume();
      setPlayState("playing");
    } else {
      startDeviceVoice();
    }
  };

  const startDeviceVoice = () => {
    tts.play(state.data.sections, {
      onProgress: (key) => setReading(key),
      onDone: () => {
        setPlayState("idle");
        setReading(null);
      },
    });
    setPlayState("playing");
  };

  const onStop = () => stopAll();

  if (showAbout) {
    return (
      <AboutPage
        copyrightHtml={state.status === "ready" ? state.data.copyright : ""}
        onBack={() => setShowAbout(false)}
      />
    );
  }

  if (!entered) {
    return (
      <EntranceScreen
        dateLabel={displayDate(date)}
        year={year}
        weekdayCycle={weekdayCycle}
        region={region}
        onRegionChange={onRegionChange}
        onEnter={() => setEntered(true)}
        onAbout={() => setShowAbout(true)}
      />
    );
  }

  return (
    <div className="page" ref={topRef}>
      <HeroArt className="top-banner" photos={INTERIOR_PHOTOS} alt="Inside a Catholic church during Mass" />

      <div className="ribbon" aria-hidden="true" />

      <header className="masthead">
        <h1 className="brand">Catholic Daily Mass</h1>
        <p className="brand-sub">The readings at Mass, every day</p>
      </header>

      <div className="meta-row">
        <span className="year-pill">Year {year}</span>
        <span className="year-pill year-pill-secondary">
          Weekday Year {weekdayCycle}
        </span>
      </div>

      <nav className="datenav" aria-label="Choose a date">
        <button
          className="datenav-btn"
          onClick={() => shift(-1)}
          disabled={isEarliestArchiveDay}
          aria-label="Previous day"
        >
          &#8249;
        </button>
        <div className="datenav-center">
          <span className="datenav-date">{displayDate(date)}</span>
          {!isToday && (
            <button className="today-link" onClick={() => setDate(new Date())}>
              Back to today
            </button>
          )}
        </div>
        <button
          className="datenav-btn"
          onClick={() => shift(1)}
          disabled={isToday}
          aria-label="Next day"
        >
          &#8250;
        </button>
      </nav>
      {isEarliestArchiveDay && (
        <p className="archive-note">Readings are archived for {ARCHIVE_DAYS} days.</p>
      )}

      <main className="missal">
        {state.status === "loading" && <p className="status">Turning the page&hellip;</p>}

        {state.status === "error" && (
          <div className="status">
            <p>{state.message}</p>
            <button className="retry" onClick={() => load(date, region)}>
              Try again
            </button>
          </div>
        )}

        {state.status === "ready" && (
          <>
            {state.data.day && <h2 className="feast">{state.data.day}</h2>}

            {state.data.sections.map((s) => (
              <section
                key={s.key}
                className={
                  "reading" +
                  (s.key === "Mass_G" ? " gospel" : "") +
                  (reading === s.key ? " being-read" : "")
                }
              >
                <h3 className="reading-label">{s.label}</h3>
                {s.source && (
                  <p className="reading-source" dangerouslySetInnerHTML={{ __html: s.source }} />
                )}
                {s.paragraphs?.length ? (
                  <div className="reading-text">
                    {s.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                ) : (
                  <div className="reading-text" dangerouslySetInnerHTML={{ __html: s.text }} />
                )}
              </section>
            ))}

            {state.data.sections.length === 0 && (
              <p className="status">
                No readings were returned for this day. Try another date, or
                read them directly on Universalis below.
              </p>
            )}

            {state.data.sections.length > 0 && (
              <>
                <hr className="conclusion-divider" />
                {MASS_CONCLUSION_SECTIONS.map((s) => (
                  <section
                    key={s.key}
                    className={"reading conclusion" + (reading === s.key ? " being-read" : "")}
                  >
                    <h3 className="reading-label">{s.label}</h3>
                    {s.intro && <p className="conclusion-intro">{s.intro}</p>}
                    <div className={"reading-text" + (s.key === "concluding-rite" ? " blessing-text" : "")}>
                      <p>{s.text}</p>
                    </div>
                  </section>
                ))}
                <p className="conclusion-note">
                  This app does not include the Eucharistic Prayer, as it can
                  only be validly celebrated by an ordained priest at Mass.
                </p>
              </>
            )}
          </>
        )}
      </main>

      <footer className="colophon">
        <p className="attribution">
          Readings provided by{" "}
          <a href="https://www.universalis.com/mass.htm" target="_blank" rel="noreferrer">
            Universalis
          </a>
          .
        </p>
        <p className="ministry">A free ministry of the Catholic Daily Mass community. &#10013;</p>
        <p className="about-row">
          <button className="about-link" onClick={() => setShowAbout(true)}>
            About, copyright &amp; how it works
          </button>
        </p>

        {maleVoiceMissing && !hdAudio && (
          <details className="voice-notice">
            <summary>No male voice found for the Gospel on this device</summary>
            <p>
              The Gospel is currently read in the same voice as the other
              readings, since this phone doesn&rsquo;t have a voice
              identifiable as male installed.
            </p>
            <p>
              To add one: open your phone&rsquo;s <strong>Settings</strong> &rarr;{" "}
              <strong>Text-to-speech output</strong> (on Samsung: Settings &rarr;
              General management &rarr; Text-to-speech &rarr; tap the engine&rsquo;s
              gear icon &rarr; Install voice data), then choose a male voice for
              English.
            </p>
            <button
              className="voice-reset"
              onClick={() => {
                tts.resetRememberedVoices();
                tts.hasMaleVoice().then((has) => setMaleVoiceMissing(!has));
              }}
            >
              I&rsquo;ve installed one — check again
            </button>
          </details>
        )}
      </footer>

      {hdAudio && (
        <audio
          ref={audioRef}
          src={hdAudio.src}
          preload="auto"
          onTimeUpdate={onAudioTime}
          onEnded={stopAll}
        />
      )}

      {state.status === "ready" && state.data.sections.length > 0 && (hdAudio || tts.isSupported()) && (
        <div className="listenbar" role="toolbar" aria-label="Listen">
          <button className="listen-main" onClick={onListen}>
            {playState === "playing" ? "Pause" : playState === "paused" ? "Resume" : "\u25B6 Listen to the readings"}
          </button>
          {playState !== "idle" && (
            <button className="listen-stop" onClick={onStop}>
              Stop
            </button>
          )}
          <span className="voice-source">{hdAudio ? "HD voice" : "Device voice"}</span>
        </div>
      )}
    </div>
  );
}
