const NEON_KEY = "wi-mod-neon";

function neonEnabled() {
  try {
    return localStorage.getItem(NEON_KEY) !== "0";
  } catch (_) {
    return true;
  }
}

function applyNeon(on) {
  const enabled = on == null ? neonEnabled() : !!on;
  document.documentElement.classList.toggle("neon-effects-active", enabled);
  return enabled;
}

function setNeonEnabled(on) {
  const enabled = !!on;
  try {
    localStorage.setItem(NEON_KEY, enabled ? "1" : "0");
  } catch (_) {}
  return applyNeon(enabled);
}

function useNeonTheme() {
  return { neonEnabled: neonEnabled(), setNeonEnabled, applyNeon };
}

window.useNeonTheme = useNeonTheme;
applyNeon();
