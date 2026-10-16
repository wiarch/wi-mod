function playReady() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = new AudioCtx();
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + index * 0.09;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.32);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.34);
  });
  ctx.resume().catch(() => {});
}

async function arm() {
  if (!window.__TAURI_INTERNALS__) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen("splash-finish", () => {
    playReady();
    document.querySelector(".splash")?.classList.add("out");
  });
}

arm();
