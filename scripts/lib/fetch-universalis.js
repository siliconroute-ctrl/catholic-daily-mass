/**
 * Fetches Universalis JSONP data by actually EXECUTING it as JavaScript,
 * exactly like a browser's <script> tag does — rather than naively
 * extracting text and JSON.parse()-ing it.
 *
 * Why this matters: Universalis' feed can contain genuine JavaScript
 * expressions inside string values (e.g. a text-compression scheme using
 * chained .split().join() calls to expand repeated words). A browser
 * runs this correctly without any special handling; a plain JSON.parse()
 * has no concept of a method call and breaks the moment one appears.
 * This uses Node's built-in vm module to run the real code in a small
 * sandbox, capturing the result exactly the way universalisCallback(data)
 * would in a browser.
 */
import vm from "node:vm";

export async function fetchUniversalisData(url, userAgent) {
  const res = await fetch(url, {
    headers: { "User-Agent": userAgent || "CatholicDailyMass/1.0 (+contact via app)" },
  });
  if (!res.ok) throw new Error(`Universalis HTTP ${res.status} for ${url}`);
  const script = await res.text();

  let captured = null;
  const sandbox = {
    universalisCallback: (data) => {
      captured = data;
    },
  };
  vm.createContext(sandbox);
  try {
    vm.runInContext(script, sandbox, { timeout: 5000 });
  } catch (err) {
    throw new Error(`Failed to execute Universalis response as JavaScript: ${err.message}`);
  }

  if (captured == null) {
    throw new Error("Universalis response did not call universalisCallback — unexpected format.");
  }
  return captured;
}
