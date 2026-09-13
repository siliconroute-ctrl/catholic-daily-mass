const REGIONS = [
  { name: "General", url: "https://universalis.com/20260913/jsonpmass.js" },
  { name: "South Africa", url: "https://universalis.com/africa.safrica/20260913/jsonpmass.js" },
];

for (const region of REGIONS) {
  console.log(`\n=== ${region.name} ===`);
  const res = await fetch(region.url);
  const text = await res.text();
  const start = text.indexOf("(");
  const end = text.lastIndexOf(")");
  const jsonText = text.slice(start + 1, end);
  console.log(`Total length: ${jsonText.length} characters`);

  try {
    JSON.parse(jsonText);
    console.log("✓ Parses fine as JSON — no problem here.");
  } catch (err) {
    console.log("✗ JSON PARSE FAILED:", err.message);
    const match = err.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1], 10);
      console.log(`\n--- Context around position ${pos} ---`);
      console.log(jsonText.slice(Math.max(0, pos - 80), pos + 80));
    }
  }
}
