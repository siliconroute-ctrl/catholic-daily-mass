/**
 * About page — houses everything that doesn't belong on the reading page:
 * how the app works, the full copyright/attribution notice from Universalis,
 * and a "Support" section ready to hold donation details later.
 *
 * Note: a short "Readings provided by Universalis" line stays on the reading
 * page itself — their webmaster terms require a visible attribution there.
 * The full notice lives here.
 */
import { useState } from "react";

/**
 * About page — houses everything that doesn't belong on the reading page:
 * how the app works, the full copyright/attribution notice from Universalis,
 * and a "Support" section ready to hold donation details later.
 *
 * Note: a short "Readings provided by Universalis" line stays on the reading
 * page itself — their webmaster terms require a visible attribution there.
 * The full notice lives here.
 */
export default function AboutPage({ copyrightHtml, onBack }) {
  const [refreshStatus, setRefreshStatus] = useState("");

  /** Clears the app's installed files (service worker + cache storage) and
   *  cached reading data, then reloads — the same effect as manually
   *  clearing browsing data for this site, without leaving the app. The
   *  selected country is deliberately kept, since re-picking it is the one
   *  thing genuinely inconvenient to lose. */
  const onRefreshApp = async () => {
    setRefreshStatus("Refreshing \u2026");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      try {
        const keep = new Set(["cdm-region"]);
        Object.keys(localStorage)
          .filter((k) => !keep.has(k))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
      setRefreshStatus("Done \u2014 reloading now.");
      setTimeout(() => window.location.reload(), 500);
    } catch {
      setRefreshStatus(
        "Something went wrong. Try closing the app fully and reopening it instead."
      );
    }
  };

  return (
    <div className="page about-page">
      <div className="ribbon" aria-hidden="true" />

      <header className="masthead">
        <h1 className="brand">About</h1>
        <p className="brand-sub">Catholic Daily Mass</p>
      </header>

      <main className="about-main">
        <section className="about-section">
          <h2>What this app is</h2>
          <p>
            A free digital missal: the readings of the day&rsquo;s Catholic Mass,
            to read on screen or listen to, every day. It is offered as a
            ministry, not a commercial product.
          </p>
        </section>

        <section className="about-section">
          <h2>How it works</h2>
          <ul>
            <li>
              <strong>Enter Today&rsquo;s Mass</strong> opens the readings for
              the current date. Use the arrows to look back up to three days.
            </li>
            <li>
              <strong>Listen</strong> plays the readings aloud: a church bell,
              an opening blessing, then each reading in turn. A male voice
              proclaims the Gospel; a female voice reads the other passages,
              following the lector&rsquo;s conventions used at Mass.
            </li>
            <li>
              <strong>HD voice</strong> means a pre-recorded reading for that
              day is available. If not, your phone&rsquo;s own voice is used
              instead.
            </li>
            <li>
              <strong>Your country</strong> selects the local liturgical
              calendar, so regional feast days appear where they differ from
              the general calendar. It is remembered on your device.
            </li>
            <li>
              <strong>Liturgical years</strong> (A, B, C for Sundays; I and II
              for weekdays) are shown so you can follow along in a printed
              missal.
            </li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Readings, copyright and attribution</h2>
          <p>
            Readings are provided by{" "}
            <a href="https://www.universalis.com/mass.htm" target="_blank" rel="noreferrer">
              Universalis
            </a>
            , and remain the property of their respective copyright holders.
          </p>
          {copyrightHtml ? (
            <div className="copyright" dangerouslySetInnerHTML={{ __html: copyrightHtml }} />
          ) : (
            <p className="copyright">
              The full copyright notice for today&rsquo;s readings will appear
              here once they have loaded.
            </p>
          )}
          <p className="about-small">
            Church photographs are used under free licences from their
            photographers. The church bell is an original recording.
          </p>
        </section>

        <section className="about-section">
          <h2>Not seeing a recent update?</h2>
          <p>
            This app stores its files on your device so it loads quickly and
            works offline. Occasionally that means an update takes a moment
            to appear. If something looks out of date, tap below to clear
            the app&rsquo;s stored files and reload a fresh copy &mdash; your
            selected country is kept.
          </p>
          <button className="enter-button" onClick={onRefreshApp}>
            Refresh App
          </button>
          {refreshStatus && <p className="about-small">{refreshStatus}</p>}
        </section>

        <section className="about-section">
          <h2>Support this ministry</h2>
          <p>
            This app is free and always will be. If you would like to help
            with the cost of keeping it running, details of how to contribute
            will appear here soon.
          </p>
        </section>
      </main>

      <footer className="colophon about-footer">
        <button className="enter-button" onClick={onBack}>
          Back
        </button>
        <p className="ministry">A free ministry of the Catholic Daily Mass community. &#10013;</p>
      </footer>
    </div>
  );
}
