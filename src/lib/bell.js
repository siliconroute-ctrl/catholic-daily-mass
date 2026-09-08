/**
 * Church bell — plays a real recording if you add one at /church-bell.mp3,
 * otherwise synthesises a simple bell-like chime in-browser (Web Audio API)
 * so the feature works out of the box with no external asset required.
 */
export function ringBell() {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const audio = new Audio("/church-bell.mp3");
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", () => synthesizeBell().then(finish));
    audio.play().catch(() => synthesizeBell().then(finish));

    // Safety net in case neither event fires
    setTimeout(finish, 6000);
  });
}

function synthesizeBell() {
  return new Promise((resolve) => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const fundamental = 220; // warm, low bell tone
      const partials = [1, 2.0, 2.4, 3.0]; // rough bell overtone ratios

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.35, now + 0.02);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      master.connect(ctx.destination);

      partials.forEach((ratio, i) => {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = fundamental * ratio;
        const g = ctx.createGain();
        g.gain.value = 1 / (i + 1);
        osc.connect(g);
        g.connect(master);
        osc.start(now);
        osc.stop(now + 2.8);
      });

      setTimeout(() => {
        try {
          ctx.close();
        } catch {
          /* ignore */
        }
        resolve();
      }, 2900);
    } catch {
      resolve();
    }
  });
}
