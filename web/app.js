const state = {
  mods: [],
  modpacks: [],
  catalog: { platforms: [], games: [], categories: [], skills: [], rules: [] },
  platform: "",
  game: localStorage.getItem("wi-mod-game") || "",
  modpack: "",
  packCat: "",
  category: "",
  files: "all",
  sort: "added",
  view: localStorage.getItem("wi-mod-view") === "list" ? "list" : "grid",
  cardSize: ["sm", "md", "lg"].includes(localStorage.getItem("wi-mod-size")) ? localStorage.getItem("wi-mod-size") : "md",
  query: "",
  selected: new Set(),
  lastCheck: "",
  picking: false,
  detected: null,
  manual: false,
  packMode: "export",
  muted: localStorage.getItem("wi-mod-mute") === "1",
  lang: localStorage.getItem("wi-mod-lang") === "en" ? "en" : "es",
  showEs: localStorage.getItem("wi-mod-lang") !== "en",
  theme: "nexus",
  keys: { nexus: false, curseforge: false, rawg: false },
};

function displaySummary(mod) {
  if (state.showEs && mod.summaryEs) return mod.summaryEs;
  return mod.summary || "Sin descripción";
}

function categoryLabel(name, mod) {
  const raw = name || mod?.category || "General";
  if (!state.showEs) return raw;
  if (mod?.categoryEs && (mod.category || "General") === raw) return mod.categoryEs;
  const found = state.mods.find((item) => (item.category || "General") === raw && item.categoryEs);
  return found?.categoryEs || raw;
}

const $ = (id) => document.getElementById(id);

const sfx = {
  ctx: null,
  unlock() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  },
  tone(freq, ms, type = "triangle", gain = 0.04, slide = 0) {
    if (state.muted || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      this.unlock();
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const amp = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), now + ms / 1000);
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(gain, now + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + ms / 1000);
      osc.connect(amp);
      amp.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000 + 0.02);
    } catch (_) { /* ignore audio errors */ }
  },
  click() { this.tone(420, 55, "triangle", 0.03); },
  sniff() { this.tone(660, 70, "sine", 0.035, -180); setTimeout(() => this.tone(520, 80, "sine", 0.028, -120), 55); },
  ok() { this.tone(520, 70, "triangle", 0.035); setTimeout(() => this.tone(760, 110, "triangle", 0.03), 60); },
  warn() { this.tone(280, 120, "sawtooth", 0.02, -40); },
  err() { this.tone(160, 160, "square", 0.025, -50); },
  open() { this.tone(300, 90, "sine", 0.03, 220); },
  soft() { this.tone(240, 40, "sine", 0.02); },
};

function setLoading(button, on, label) {
  if (!button) return;
  if (on) {
    if (!button.dataset.label) button.dataset.label = button.innerHTML;
    button.classList.add("btn-loading");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    if (label) button.setAttribute("aria-label", label);
  } else {
    button.classList.remove("btn-loading");
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.removeAttribute("aria-label");
    if (button.dataset.label) button.innerHTML = button.dataset.label;
  }
}

function syncMute() {
  const btn = $("mute");
  if (!btn) return;
  btn.textContent = state.muted ? "🔇" : "🔊";
  btn.classList.toggle("on", state.muted);
  btn.title = state.muted ? "Activar sonido" : "Silenciar";
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function fmtDate(iso) {
  if (!iso) return "sin fecha";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es", { year: "numeric", month: "short", day: "numeric" });
}

function fmtWhen(iso) {
  if (!iso) return "nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function refreshButton(mod) {
  if (!mod?.updateAvailable) return "";
  const next = mod.remoteVersion ? `v${mod.remoteVersion}` : "Versión nueva";
  return `<button class="ghost refresh-btn" type="button" id="detail-refresh">Actualizar<small>${esc(next)}</small></button>`;
}

function fmtCount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("es");
}

function statIcon(kind) {
  const paths = {
    trophy: `<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>`,
    down: `<path d="M12 3v12M7 11l5 5 5-5M5 21h14"/>`,
    chart: `<path d="M4 19V10M10 19V4M16 19v-6M22 19H2"/>`,
    tag: `<path d="M20 13l-7 7-9-9V4h7l9 9z"/><circle cx="7.5" cy="7.5" r="1"/>`,
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[kind] || ""}</svg>`;
}

function statRow(mod) {
  const items = [
    ["trophy", "Apoyos", fmtCount(mod.endorsements)],
    ["down", "Únicos", fmtCount(mod.uniqueDownloads)],
    ["chart", "Descargas", fmtCount(mod.downloads)],
    ["tag", "Versión", mod.version || "?"],
  ];
  return `<div class="stat-row">${items.map(([kind, label, value]) => `
    <div class="stat">${statIcon(kind)}<span>${esc(label)}</span><strong>${esc(value)}</strong></div>
  `).join("")}</div>`;
}

function toast(text, kind = "ok") {
  const node = $("toast");
  node.hidden = false;
  node.className = `toast ${kind}`;
  node.textContent = text;
  if (kind === "bad") sfx.err();
  else if (kind === "warn") sfx.warn();
  else sfx.ok();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => {
      node.hidden = true;
      node.classList.remove("out");
    }, 220);
  }, 3000);
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = sessionToken();
  if (token && !headers.has("X-Session")) headers.set("X-Session", token);
  const res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error || "No se pudo completar.");
      error.status = res.status;
      error.payload = data;
      throw error;
    }
    return data;
  }
  if (!res.ok) throw new Error("No se pudo completar.");
  return res;
}

async function load() {
  const data = await api("/api/library");
  state.mods = data.mods || [];
  state.modpacks = data.modpacks || [];
  state.catalog = data.catalog || { platforms: [], games: [], categories: [], skills: [], rules: [] };
  state.sources = data.sources || {};
  if (data.language === "en" || data.language === "es") applyLang(data.language);
  if (data.theme) applyTheme(data.theme);
  if (data.keys) state.keys = { nexus: !!data.keys.nexus, curseforge: !!data.keys.curseforge, rawg: !!data.keys.rawg };
  paintKeys();
  const alive = new Set(state.mods.map((mod) => mod.id));
  state.selected.forEach((id) => { if (!alive.has(id)) state.selected.delete(id); });
  ensureActiveGame();
  render();
  enrichActiveGame();
  if (state.lang === "es") localizeLibrary();
}

function applyLang(lang, persistLocal = true) {
  state.lang = lang === "en" ? "en" : "es";
  state.showEs = state.lang === "es";
  if (persistLocal) localStorage.setItem("wi-mod-lang", state.lang);
  document.querySelectorAll('input[name="language"]').forEach((input) => {
    input.checked = input.value === state.lang;
  });
  syncDock();
}

const AVATAR_STYLES = ["lorelei", "adventurer", "avataaars", "micah", "personas", "big-smile", "notionists"];

function rollAvatar() {
  const img = $("dock-avatar");
  if (!img) return;
  const style = AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
  const seed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  img.src = `https://api.dicebear.com/10.x/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

function setDockName(name) {
  const node = $("dock-name");
  if (node && name) node.textContent = name;
}

function syncDock() {
  document.querySelectorAll(".lang-switch [data-lang]").forEach((button) => {
    button.classList.toggle("on", button.dataset.lang === state.lang);
  });
  paintKeys();
}

function paintKeys() {
  const keys = state.keys || {};
  document.querySelectorAll("#dock-keys [data-key]").forEach((node) => {
    const id = node.dataset.key;
    const on = id === "modrinth" || !!keys[id];
    node.classList.toggle("on", on);
    const label = node.querySelector("em");
    if (label) label.textContent = on ? "activa" : "falta";
  });
}

async function setLanguage(lang) {
  const next = lang === "en" ? "en" : "es";
  if (next === state.lang) return;
  applyLang(next);
  render();
  sfx.click();
  try {
    await api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: next }),
    });
    if (next === "es") localizeLibrary();
  } catch (_) {
    /* se guarda en local y se reintenta al entrar */
  }
}

async function localizeLibrary() {
  try {
    const data = await api("/api/localize", { method: "POST" });
    if (data.catalog) state.catalog = data.catalog;
    if ((data.mods || 0) > 0) {
      const fresh = await api("/api/library");
      state.mods = fresh.mods || state.mods;
      state.catalog = fresh.catalog || state.catalog;
    }
    render();
  } catch (_) {
    /* traducción opcional */
  }
}

function gameOptions() {
  const map = new Map(gameOptionsForPacks());
  (state.catalog.games || []).forEach((item) => {
    const id = item.gameDomain || "";
    if (id) map.set(id, item.gameName || id);
  });
  state.mods.forEach((mod) => {
    if (mod.gameDomain) map.set(mod.gameDomain, mod.gameName || mod.gameDomain);
  });
  state.modpacks.forEach((pack) => {
    if (pack.gameDomain) map.set(pack.gameDomain, pack.gameName || pack.gameDomain);
  });
  return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
}

function ensureActiveGame() {
  const options = gameOptions();
  if (state.game && options.some(([id]) => id === state.game)) {
    localStorage.setItem("wi-mod-game", state.game);
    return;
  }
  const prefer = options.find(([id]) => id === "skyrimspecialedition") || options[0];
  state.game = prefer ? prefer[0] : "skyrimspecialedition";
  localStorage.setItem("wi-mod-game", state.game);
}

function catalogGame(domain) {
  const id = String(domain || state.game || "");
  return (state.catalog.games || []).find((item) => String(item.gameDomain || "") === id) || null;
}

function gameLabel(domain) {
  const id = String(domain || "");
  const cat = catalogGame(id);
  if (cat?.gameName) return cat.gameName;
  const mod = state.mods.find((row) => String(row.gameDomain || "") === id);
  if (mod?.gameName) return mod.gameName;
  const pack = state.modpacks.find((row) => String(row.gameDomain || "") === id);
  if (pack?.gameName) return pack.gameName;
  return gameOptions().find(([gid]) => gid === id)?.[1] || id || "Juego";
}

function gameCover(domain) {
  return catalogGame(domain)?.imageUrl || "";
}

function gameMark(domain) {
  const game = catalogGame(domain);
  if (game?.logoUrl) return { src: game.logoUrl, logo: true };
  if (game?.imageUrl) return { src: game.imageUrl, logo: false };
  return { src: "", logo: false };
}

function closeGameMenu() {
  const menu = $("game-menu");
  const picker = $("game-picker");
  if (menu) menu.hidden = true;
  if (picker) picker.setAttribute("aria-expanded", "false");
}

function renderGameScope() {
  ensureActiveGame();
  const nameNode = $("game-picker-name");
  const imgNode = $("game-picker-img");
  if (!nameNode) return;
  const gameName = gameLabel(state.game);
  nameNode.textContent = gameName;
  nameNode.title = gameName;
  $("game-picker").title = gameName;
  const mark = gameMark(state.game);
  if (imgNode) {
    imgNode.classList.toggle("is-logo", mark.logo);
    if (mark.src) {
      imgNode.src = mark.src;
      imgNode.hidden = false;
    } else {
      imgNode.removeAttribute("src");
      imgNode.hidden = true;
    }
  }
  const menu = $("game-menu");
  if (!menu || menu.hidden) return;
  const options = gameOptions();
  menu.innerHTML = options.map(([id, label]) => {
    const mark = gameMark(id);
    return `<button type="button" role="option" data-game="${esc(id)}" class="${id === state.game ? "on" : ""}">
      ${mark.src ? `<img alt="" class="${mark.logo ? "is-logo" : ""}" src="${esc(mark.src)}" loading="lazy">` : `<img alt="" hidden>`}
      <span>${esc(label)}</span>
    </button>`;
  }).join("");
  menu.querySelectorAll("[data-game]").forEach((button) => {
    button.onclick = () => {
      selectGame(button.dataset.game);
      closeGameMenu();
    };
  });
}

function selectGame(domain) {
  if (!domain || domain === state.game) {
    renderGameHero();
    return;
  }
  state.game = domain;
  localStorage.setItem("wi-mod-game", state.game);
  state.modpack = "";
  state.packCat = "";
  sfx.click();
  render();
  enrichActiveGame();
  scheduleRemoteSearch();
}

let heroResolveToken = 0;

async function enrichActiveGame() {
  const domain = state.game;
  if (!domain) return;
  const current = catalogGame(domain);
  if (current?.imageUrl && current?.description && "steamAppId" in current) {
    renderGameHero();
    return;
  }
  const token = ++heroResolveToken;
  try {
    const data = await api(
      `/api/rawg/resolve?domain=${encodeURIComponent(domain)}&name=${encodeURIComponent(gameLabel(domain))}`
    );
    if (token !== heroResolveToken) return;
    if (data.game) {
      const list = [...(state.catalog.games || [])];
      const idx = list.findIndex((item) => String(item.gameDomain || "") === domain);
      if (idx >= 0) list[idx] = { ...list[idx], ...data.game };
      else list.push(data.game);
      state.catalog = { ...state.catalog, games: list };
      renderGameScope();
      renderGameHero();
    }
  } catch (_) {
    /* sin red / sin clave: hero queda básico */
  }
}

function renderGameHero() {
  const node = $("game-hero");
  if (!node) return;
  const domain = state.game;
  if (!domain) {
    node.hidden = true;
    node.innerHTML = "";
    return;
  }
  const meta = catalogGame(domain) || {};
  const name = meta.gameName || gameLabel(domain);
  const cover = meta.imageUrl || "";
  const mods = scopedMods().length;
  const packs = packsForGame().length;
  const bits = [
    meta.released || "",
    meta.genres?.length ? meta.genres.slice(0, 3).join(", ") : "",
    meta.platforms?.length ? meta.platforms.slice(0, 3).join(", ") : "",
    meta.rating != null ? `★ ${meta.rating}` : "",
    meta.metacritic != null ? `Metacritic ${meta.metacritic}` : "",
  ].filter(Boolean);
  node.hidden = false;
  node.style.backgroundImage = "";
  node.innerHTML = `
    <div class="game-hero-inner">
      ${cover ? `<img class="game-hero-cover" alt="" src="${esc(cover)}">` : `<div class="game-hero-cover"></div>`}
      <div>
        <h2>${esc(name)}</h2>
        <p class="meta">${esc(bits.join(" · ") || domain)} · ${mods} mods · ${packs} modpacks</p>
        <p class="desc">${esc((state.lang === "es" ? (meta.descriptionEs || meta.description) : meta.description) || "Añade el juego con + para traer ficha completa desde RAWG, o espera a que se complete sola.")}</p>
        <div class="game-hero-links">
          ${meta.rawgUrl ? `<a href="${esc(meta.rawgUrl)}" target="_blank" rel="noreferrer">RAWG</a>` : ""}
          ${meta.website ? `<a href="${esc(meta.website)}" target="_blank" rel="noreferrer">Sitio oficial</a>` : ""}
          <a href="https://rawg.io" target="_blank" rel="noreferrer">Datos: RAWG</a>
        </div>
      </div>
    </div>
  `;
}

function scopedMods() {
  if (!state.game) return state.mods;
  return state.mods.filter((mod) => String(mod.gameDomain || "") === state.game);
}

function packsForGame() {
  if (!state.game) return state.modpacks;
  return state.modpacks.filter((pack) => String(pack.gameDomain || "") === state.game);
}

function packById(id) {
  return state.modpacks.find((pack) => pack.id === id) || null;
}

function packCatById(pack, catId) {
  return (pack?.categories || []).find((item) => item.id === catId) || null;
}

function packCatMark(cat) {
  if (!cat || !cat.imageUrl) return "";
  return `<img class="pc-ico" alt="" src="${esc(cat.imageUrl)}">`;
}

function packLabel(mod) {
  const pack = packById(mod.modpackId);
  if (!pack) return mod.modpack || "";
  const cat = packCatById(pack, mod.modpackCategoryId);
  if (!cat) return pack.name;
  return `${pack.name} · ${cat.name}`;
}

function visible() {
  const q = state.query.trim().toLowerCase();
  let mods = scopedMods().filter((mod) => {
    if (state.platform && String(mod.platform || "Nexus") !== state.platform) return false;
    if (state.modpack && String(mod.modpackId || "") !== state.modpack) return false;
    if (state.packCat && String(mod.modpackCategoryId || "") !== state.packCat) return false;
    if (state.category && String(mod.category || "General") !== state.category) return false;
    const hasFiles = (mod.files || []).length > 0;
    if (state.files === "with" && !hasFiles) return false;
    if (state.files === "without" && hasFiles) return false;
    if (!q) return true;
    const blob = `${mod.name} ${mod.author} ${mod.gameName} ${mod.category} ${mod.categoryEs || ""} ${mod.platform} ${packLabel(mod)} ${mod.summary} ${mod.summaryEs || ""} ${mod.techNotes || ""} ${mod.compatNotes || ""} ${mod.notes || ""}`.toLowerCase();
    return blob.includes(q);
  });
  const by = {
    added: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)),
    updated: (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    name: (a, b) => String(a.name).localeCompare(String(b.name), "es"),
  };
  mods.sort(by[state.sort] || by.added);
  return mods;
}

function clearFilters() {
  state.platform = "";
  state.modpack = "";
  state.packCat = "";
  state.category = "";
  state.files = "all";
  state.query = "";
  if ($("search")) $("search").value = "";
}

function askInput({ title, hint = "", placeholder = "", value = "", okLabel = "Añadir", mode = "text", options = [] }) {
  return new Promise((resolve) => {
    const dialog = $("ask-dialog");
    const textWrap = $("ask-text-wrap");
    const selectWrap = $("ask-select-wrap");
    const text = $("ask-text");
    const select = $("ask-select");
    $("ask-title").textContent = title;
    $("ask-hint").hidden = !hint;
    $("ask-hint").textContent = hint || "";
    $("ask-ok").textContent = okLabel;
    const finish = (result) => {
      dialog.close();
      resolve(result);
    };
    if (mode === "select") {
      textWrap.hidden = true;
      selectWrap.hidden = false;
      text.required = false;
      select.innerHTML = options.map(([id, label]) => (
        `<option value="${esc(id)}">${esc(label)}</option>`
      )).join("");
    } else {
      textWrap.hidden = false;
      selectWrap.hidden = true;
      text.required = true;
      text.value = value || "";
      text.placeholder = placeholder || "";
    }
    const onSubmit = (event) => {
      event.preventDefault();
      cleanup();
      if (mode === "select") finish(select.value || null);
      else finish((text.value || "").trim() || null);
    };
    const onCancel = () => { cleanup(); finish(null); };
    const cleanup = () => {
      $("ask-form").removeEventListener("submit", onSubmit);
      $("ask-cancel").removeEventListener("click", onCancel);
      $("ask-x").removeEventListener("click", onCancel);
    };
    $("ask-form").addEventListener("submit", onSubmit);
    $("ask-cancel").addEventListener("click", onCancel);
    $("ask-x").addEventListener("click", onCancel);
    sfx.open();
    dialog.showModal();
    if (mode !== "select") setTimeout(() => text.focus(), 30);
  });
}

function askConfirm(message) {
  return new Promise((resolve) => {
    const dialog = $("confirm-dialog");
    $("confirm-msg").textContent = message;
    const finish = (ok) => {
      dialog.close();
      resolve(ok);
    };
    const onSubmit = (event) => { event.preventDefault(); cleanup(); finish(true); };
    const onCancel = () => { cleanup(); finish(false); };
    const cleanup = () => {
      $("confirm-form").removeEventListener("submit", onSubmit);
      $("confirm-cancel").removeEventListener("click", onCancel);
      $("confirm-x").removeEventListener("click", onCancel);
    };
    $("confirm-form").addEventListener("submit", onSubmit);
    $("confirm-cancel").addEventListener("click", onCancel);
    $("confirm-x").addEventListener("click", onCancel);
    sfx.open();
    dialog.showModal();
  });
}

function counts(key, mods = scopedMods()) {
  const map = new Map();
  mods.forEach((mod) => {
    const id = key(mod);
    const row = map.get(id) || { id, label: id, count: 0 };
    row.count += 1;
    if (key === gameKey) row.label = mod.gameName || mod.gameDomain || "Sin juego";
    map.set(id, row);
  });
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

function gameKey(mod) {
  return mod.gameDomain || "";
}

function renderFilters() {
  renderGameScope();
  if (state.modpack) {
    const pack = packById(state.modpack);
    if (!pack || String(pack.gameDomain || "") !== state.game) {
      state.modpack = "";
      state.packCat = "";
    }
  }

  const allowed = platformsForGame(state.game);
  if (state.platform && allowed && !allowed.includes(state.platform)) state.platform = "";
  const platformNames = allowed ? [...allowed] : [...PLATFORMS];
  scopedMods().forEach((mod) => {
    const name = mod.platform || "Nexus";
    if (!platformNames.includes(name)) platformNames.push(name);
  });
  const platformMap = platformNames.map((name) => ({
    id: name,
    label: name,
    count: scopedMods().filter((mod) => (mod.platform || "Nexus") === name).length,
  }));
  $("platforms").innerHTML = chip("Todas", "", state.platform, "platform") + platformMap.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.platform, "platform")
  )).join("");

  const gamePacks = packsForGame();
  const packChips = gamePacks.map((pack) => {
    const n = scopedMods().filter((mod) => mod.modpackId === pack.id).length;
    return chip(`${pack.name} (${n})`, pack.id, state.modpack, "modpack");
  });
  let inside = "";
  if (state.modpack) {
    const pack = packById(state.modpack);
    const cats = pack ? (pack.categories || []) : [];
    const rows = cats.map((cat) => {
      const n = scopedMods().filter((mod) => mod.modpackId === pack.id && mod.modpackCategoryId === cat.id).length;
      const img = cat.imageUrl ? `<img class="pc-ico" alt="" src="${esc(cat.imageUrl)}">` : "";
      return `<button type="button" class="pack-cat-chip ${cat.id === state.packCat ? "on" : ""}" data-kind="packCat" data-value="${encodeURIComponent(cat.id)}">${img}<span>${esc(cat.name)} (${n})</span></button>`;
    }).join("");
    inside = `<div class="pack-cats">
      <div class="side-head">
        <p class="side-label">Dentro del pack</p>
        <button type="button" class="side-add" data-add="packcat" title="Añadir categoría">+</button>
      </div>
      ${chip("Todas", "", state.packCat, "packCat")}${rows}
    </div>`;
  }
  $("modpacks").innerHTML = chip("Todos", "", state.modpack, "modpack") + packChips.join("") + inside;

  const cats = counts((mod) => mod.category || "General");
  (state.catalog.categories || []).forEach((name) => {
    if (!cats.some((row) => row.id === name)) cats.push({ id: name, label: name, count: 0 });
  });
  cats.sort((a, b) => a.label.localeCompare(b.label, "es"));
  $("categories").innerHTML = chip("Todas", "", state.category, "category") + cats.map((row) => (
    chip(`${categoryLabel(row.id)} (${row.count})`, row.id, state.category, "category")
  )).join("");

  fillCategorySelect($("add-category"), $("add-category").value || "");
  fillModpackSelects($("add-modpack"), $("add-pack-cat"), $("add-modpack")?.value || "", $("add-pack-cat")?.value || "", state.game);
  document.querySelectorAll(".side [data-kind]").forEach((button) => {
    button.onclick = () => {
      const kind = button.dataset.kind;
      const raw = button.getAttribute("data-value");
      state[kind] = raw == null ? "" : decodeURIComponent(raw);
      if (kind === "modpack") state.packCat = "";
      sfx.click();
      render();
      if (kind === "platform") scheduleRemoteSearch();
    };
  });
  document.querySelectorAll(".side-add[data-add]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      sideAdd(button.dataset.add);
    };
  });
}

async function sideAdd(kind) {
  sfx.click();
  if (kind === "modpack") {
    startSideName("modpacks", "Nombre del pack", async (name) => {
      if (!state.game) throw new Error("Elige un juego arriba.");
      const saved = await api("/api/modpacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          gameDomain: state.game,
          gameName: gameLabel(state.game),
          notes: "",
        }),
      });
      if (saved.modpack?.id) state.modpack = saved.modpack.id;
      toast("Modpack creado.");
    });
    return;
  }
  if (kind === "packcat") {
    openPackCatDialog(state.modpack);
    return;
  }
  if (kind === "game") {
    openGameDialog();
    return;
  }
  if (kind === "category") {
    startSideName("categories", "Overhauls, Patches…", async (name) => {
      await api("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "category", name }),
      });
      toast("Añadido.");
    });
  }
}

function startSideName(boxId, placeholder, save) {
  const box = $(boxId);
  if (!box || box.querySelector(".side-name")) {
    box?.querySelector(".side-name input")?.focus();
    return;
  }
  const row = document.createElement("form");
  row.className = "side-name";
  row.innerHTML = `<input type="text" maxlength="80" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false"><button class="solid" type="submit">OK</button>`;
  box.prepend(row);
  const input = row.querySelector("input");
  input.focus();
  row.onsubmit = async (event) => {
    event.preventDefault();
    const name = input.value.trim();
    if (!name) return;
    input.disabled = true;
    try {
      await save(name);
      await load();
    } catch (error) {
      input.disabled = false;
      toast(error.message, "bad");
    }
  };
  input.onkeydown = (event) => {
    if (event.key === "Escape") row.remove();
  };
}

function chip(label, value, current, kind) {
  const on = String(value) === String(current) ? "on" : "";
  return `<button type="button" class="${on}" data-kind="${kind}" data-value="${encodeURIComponent(value)}">${esc(label)}</button>`;
}

const BASE_CATEGORIES = [
  "General", "Overhauls", "User Interface", "Gameplay", "Models and Textures",
  "Cities, Towns, Villages, and Hamlets", "Immersion", "Patches", "Utilities",
  "Weapons", "Armour", "Magic - Gameplay", "Audio", "Visuals",
];

function categoryOptions(preferred) {
  const set = new Set(BASE_CATEGORIES);
  state.mods.forEach((mod) => {
    if (mod.category) set.add(mod.category);
  });
  (state.catalog.categories || []).forEach((name) => set.add(name));
  if (preferred) set.add(preferred);
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

function fillCategorySelect(node, preferred) {
  if (!node) return;
  const current = preferred || node.value || "General";
  node.innerHTML = categoryOptions(current).map((name) => (
    `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(categoryLabel(name))}</option>`
  )).join("");
}

function applyTheme(theme) {
  const allowed = ["nexus", "modrinth", "curseforge", "steam"];
  state.theme = allowed.includes(theme) ? theme : "nexus";
  document.documentElement.dataset.theme = state.theme;
  document.querySelectorAll(".theme-switch [data-theme]").forEach((button) => {
    button.classList.toggle("on", button.dataset.theme === state.theme);
  });
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.checked = input.value === state.theme;
  });
}

async function setTheme(theme) {
  if (theme === state.theme) return;
  applyTheme(theme);
  sfx.click();
  try {
    await api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: state.theme }),
    });
  } catch (_) {
    /* se reintenta al guardar ajustes */
  }
}

const PLATFORMS = ["Nexus", "Modrinth", "CurseForge", "Steam Workshop", "Independiente"];

function platformsForGame(domain) {
  const key = String(domain || "").trim().toLowerCase();
  const map = state.sources || {};
  if (map[key]) return map[key];
  if (key.startsWith("minecraft")) return ["Modrinth", "CurseForge", "Independiente"];
  if (key === "wow" || key.startsWith("worldofwarcraft")) return ["CurseForge", "Independiente"];
  return ["Nexus", "Independiente"];
}

function searchPlatformLabel() {
  if (state.platform) return state.platform;
  const remote = remoteTarget();
  if (remote) return remote;
  const allowed = platformsForGame(state.game) || [];
  return allowed.find((name) => name !== "Independiente") || "Independiente";
}

function remoteTarget() {
  const allowed = platformsForGame(state.game);
  const pick = state.platform || "";
  const open = (name) => (!allowed || allowed.includes(name)) && (!pick || pick === name);
  if (open("Nexus") && (pick === "Nexus" || !pick)) return "Nexus";
  if (open("Modrinth") && (pick === "Modrinth" || !pick)) return "Modrinth";
  if (open("CurseForge") && (pick === "CurseForge" || !pick)) return "CurseForge";
  return "";
}

function platformFromUrl(url) {
  const text = String(url || "").toLowerCase();
  if (/nexusmods\.com\/[^/]+\/mods\/\d+/.test(text)) return "Nexus";
  if (text.includes("modrinth.com")) return "Modrinth";
  if (text.includes("curseforge.com")) return "CurseForge";
  if (text.includes("steamcommunity.com") && /workshop|sharedfiles|filedetails/.test(text)) return "Steam Workshop";
  if (text.trim()) return "Independiente";
  return "Nexus";
}

function isNexusUrl(url) {
  return platformFromUrl(url) === "Nexus" && /nexusmods\.com/i.test(String(url || ""));
}

function syncAddSource() {
  const picked = platformFromUrl($("add-url").value);
  const known = picked !== "Nexus";
  const select = $("add-platform");
  const allowed = platformsForGame(state.game);
  if (!select) return;
  if (allowed && $("add-url").value.trim() && !allowed.includes(picked)) {
    fillPlatformSelect(select, allowed[0]);
    select.disabled = true;
    if ($("add-status")) $("add-status").textContent = `Este juego solo acepta ${allowed.join(", ")}.`;
    return;
  }
  if ($("add-url").value.trim() && known) {
    fillPlatformSelect(select, picked);
    select.value = picked;
    select.disabled = true;
    $("manual").hidden = false;
    state.manual = true;
  } else {
    select.disabled = false;
    if (!state.detected) fillPlatformSelect(select, "Nexus");
  }
}

function fillPlatformSelect(node, preferred) {
  if (!node) return;
  const allowed = platformsForGame(state.game);
  const options = allowed ? [...allowed] : [...PLATFORMS];
  let current = preferred || node.value || options[0] || "Nexus";
  if (!options.includes(current)) current = options[0] || current;
  if (current && !options.includes(current)) options.push(current);
  node.innerHTML = options.map((name) => (
    `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(name)}</option>`
  )).join("");
}

function fillNamedSelect(node, names, preferred, emptyLabel) {
  if (!node) return;
  const current = preferred || "";
  const list = [...new Set((names || []).filter(Boolean))];
  if (current && !list.includes(current)) list.push(current);
  list.sort((a, b) => a.localeCompare(b, "es"));
  node.innerHTML = `<option value="">${esc(emptyLabel || "—")}</option>` + list.map((name) => (
    `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(name)}</option>`
  )).join("");
}

function fillModpackSelects(packNode, catNode, packId, catId, gameDomain) {
  if (!packNode || !catNode) return;
  const game = String(gameDomain || "").toLowerCase();
  const packs = state.modpacks.filter((pack) => !game || String(pack.gameDomain || "").toLowerCase() === game);
  const current = packId || "";
  packNode.innerHTML = `<option value="">Sin modpack</option>` + packs.map((pack) => (
    `<option value="${esc(pack.id)}" ${pack.id === current ? "selected" : ""}>${esc(pack.name)} · ${esc(pack.gameName || pack.gameDomain)}</option>`
  )).join("");
  const pack = packById(packNode.value);
  const cats = pack ? (pack.categories || []) : [];
  catNode.disabled = !pack;
  if (!pack) {
    catNode.innerHTML = `<option value="">—</option>`;
  } else if (!cats.length) {
    catNode.innerHTML = `<option value="">Sin categorías (usa +)</option>`;
  } else {
    catNode.innerHTML = cats.map((cat) => (
      `<option value="${esc(cat.id)}" ${cat.id === catId ? "selected" : ""}>${esc(cat.name)}</option>`
    )).join("");
  }
  packNode.onchange = () => {
    fillModpackSelects(packNode, catNode, packNode.value, "", gameDomain);
  };
}

async function createModpackInline(gameDomain, gameName) {
  const domain = String(gameDomain || "").trim();
  if (!domain) {
    toast("Elige un juego arriba.", "warn");
    return null;
  }
  const name = await askInput({ title: "Modpack", placeholder: "Nombre del pack", okLabel: "Crear" });
  if (!name) return null;
  const saved = await api("/api/modpacks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      gameDomain: domain,
      gameName: gameName || gameLabel(domain),
      notes: "",
    }),
  });
  await load();
  toast("Modpack creado.");
  return saved.modpack || null;
}

function refillPackSelects(packNode, catNode, packId, catId, gameDomain) {
  if (!packNode?.isConnected || !catNode?.isConnected) return;
  fillModpackSelects(packNode, catNode, packId, catId, gameDomain);
}

function createCategoryInline(packNode, catNode, gameDomain) {
  const packId = packNode?.value || "";
  if (!packId || !packById(packId)) {
    toast("Crea o elige un modpack.", "warn");
    return;
  }
  const dialog = $("packcat-dialog");
  const onClose = () => {
    dialog.removeEventListener("close", onClose);
    const picked = dialog.dataset.pick || catNode.value || "";
    dialog.dataset.pick = "";
    refillPackSelects(packNode, catNode, packNode.value || packId, picked, gameDomain);
  };
  dialog.addEventListener("close", onClose);
  openPackCatDialog(packId);
}

function paintCatPreview(src) {
  const preview = $("pc-preview");
  if (!preview) return;
  if (!src) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  preview.src = src;
  preview.hidden = false;
}

function openPackCatDialog(packId, catId) {
  const pack = packById(packId);
  if (!pack) {
    toast("Elige un modpack primero.", "warn");
    return;
  }
  const cat = catId ? packCatById(pack, catId) : null;
  sfx.open();
  $("packcat-title").textContent = cat ? "Editar categoría" : "Nueva categoría";
  $("packcat-pack").textContent = `Modpack: ${pack.name} · ${pack.gameName || pack.gameDomain}`;
  $("pc-pack-id").value = pack.id;
  $("pc-edit-id").value = cat ? cat.id : "";
  $("pc-name").value = cat ? cat.name : "";
  const current = cat?.imageUrl || "";
  $("pc-image").value = String(current).startsWith("http") ? current : "";
  $("pc-image").dataset.keep = String(current).startsWith("/") ? current : "";
  $("pc-file").value = "";
  $("pc-notes").value = cat ? (cat.notes || "") : "";
  paintCatPreview(current);
  const del = $("pc-delete");
  del.hidden = !cat;
  del.onclick = () => deletePackCat(pack.id, cat?.id);
  $("pc-file").onchange = () => {
    const picked = $("pc-file").files?.[0];
    if (picked) paintCatPreview(URL.createObjectURL(picked));
  };
  $("packcat-dialog").showModal();
}

async function deletePackCat(packId, catId) {
  if (!catId) return;
  if (!(await askConfirm("¿Borrar esta categoría del pack?"))) return;
  try {
    await api(`/api/modpacks/${packId}/categories/${catId}`, { method: "DELETE" });
    $("packcat-dialog").close();
    toast("Categoría borrada.", "warn");
    await load();
  } catch (error) {
    toast(error.message, "bad");
  }
}

async function savePackCatForm(event) {
  event.preventDefault();
  const packId = $("pc-pack-id").value || state.modpack;
  if (!packId) {
    toast("Elige un modpack primero.", "warn");
    return;
  }
  const name = ($("pc-name").value || "").trim();
  if (!name) {
    toast("Pon un nombre.", "warn");
    return;
  }
  const editId = $("pc-edit-id").value;
  const button = event.submitter || $("packcat-form").querySelector('button[type="submit"]');
  setLoading(button, true, "Guardando");
  try {
    const file = $("pc-file").files?.[0];
    let imageUrl = ($("pc-image").value || "").trim() || $("pc-image").dataset.keep || "";
    if (file) {
      const upload = new FormData();
      upload.append("file", file);
      const uploaded = await api("/api/images", { method: "POST", body: upload });
      imageUrl = uploaded.imageUrl || "";
    }
    const payload = { name, imageUrl, notes: $("pc-notes").value || "" };
    let saved;
    if (editId) {
      saved = await api(`/api/modpacks/${packId}/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Categoría actualizada.");
    } else {
      saved = await api(`/api/modpacks/${packId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast("Categoría creada.");
    }
    const cats = saved?.modpack?.categories || [];
    const match = cats.find((cat) => cat.id === editId) || [...cats].reverse().find((cat) => cat.name === name);
    $("packcat-dialog").dataset.pick = match?.id || "";
    await load();
    $("packcat-dialog").close();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

function shot(mod) {
  if (mod.pictureFile) return `style="background-image:url('/media/${encodeURI(mod.pictureFile)}')"`;
  if (mod.pictureUrl) return `style="background-image:url('${esc(mod.pictureUrl)}')"`;
  return "";
}

function syncViewToggle() {
  const grid = $("grid");
  if (grid) {
    grid.classList.toggle("list", state.view === "list");
    grid.classList.remove("size-sm", "size-md", "size-lg");
    grid.classList.add(`size-${state.cardSize}`);
    grid.classList.toggle("picking", state.picking);
  }
  document.querySelectorAll(".view-toggle [data-view]").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
  });
  document.querySelectorAll(".view-toggle [data-size]").forEach((button) => {
    button.classList.toggle("on", button.dataset.size === state.cardSize);
  });
}

function setView(view) {
  state.view = view === "list" ? "list" : "grid";
  localStorage.setItem("wi-mod-view", state.view);
  sfx.click();
  syncViewToggle();
}

function setPicking(on) {
  state.picking = Boolean(on);
  if (!state.picking) {
    state.selected.clear();
    state.lastCheck = "";
  }
  const button = $("pick-mode");
  if (button) {
    button.classList.toggle("on", state.picking);
    button.textContent = state.picking ? "Quitar selección" : "Habilitar selección";
  }
  sfx.click();
  render();
}

function paintPickAll() {
  const button = $("pick-all");
  if (!button) return;
  button.hidden = !state.picking;
  const ids = visible().map((mod) => mod.id);
  const allOn = ids.length > 0 && ids.every((id) => state.selected.has(id));
  button.textContent = allOn ? "Quitar todo" : "Seleccionar todo";
}

function selectAllVisible() {
  if (!state.picking) return;
  const ids = visible().map((mod) => mod.id);
  const allOn = ids.length > 0 && ids.every((id) => state.selected.has(id));
  ids.forEach((id) => {
    if (allOn) state.selected.delete(id);
    else state.selected.add(id);
  });
  sfx.soft();
  render();
}

function togglePick(id, shift) {
  const ids = visible().map((mod) => mod.id);
  if (shift && state.lastCheck) {
    const a = ids.indexOf(state.lastCheck);
    const b = ids.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [from, to] = a < b ? [a, b] : [b, a];
      ids.slice(from, to + 1).forEach((item) => state.selected.add(item));
    }
  } else if (state.selected.has(id)) {
    state.selected.delete(id);
  } else {
    state.selected.add(id);
  }
  state.lastCheck = id;
  sfx.soft();
  render();
}

function setCardSize(size) {
  state.cardSize = size === "sm" || size === "lg" ? size : "md";
  localStorage.setItem("wi-mod-size", state.cardSize);
  sfx.click();
  syncViewToggle();
}

function paintBulk() {
  const bar = $("bulk");
  const n = state.selected.size;
  bar.hidden = n === 0;
  if (!n) return;
  $("bulk-count").textContent = `${n} marcados`;
  const visibleIds = visible().map((mod) => mod.id);
  const allOn = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id));
  $("bulk-all").textContent = allOn ? "Desmarcar visibles" : "Marcar visibles";
  fillCategorySelect($("bulk-category"), $("bulk-category").value || "General");
  fillModpackSelects(
    $("bulk-pack"),
    $("bulk-pack-cat"),
    $("bulk-pack").value || state.modpack || "",
    $("bulk-pack-cat").value || "",
    state.game
  );
}

function render() {
  renderFilters();
  renderGameHero();
  syncViewToggle();
  paintPickAll();
  paintBulk();
  if ($("search")) {
    const where = searchPlatformLabel();
    $("search").placeholder = `Buscar en ${where}`;
    if ($("search-platform")) $("search-platform").textContent = where;
  }
  const mods = visible();
  const selected = mods.filter((mod) => state.selected.has(mod.id)).length;
  $("count").textContent = selected
    ? `${mods.length} mods · ${selected} marcados`
    : `${mods.length} mods`;
  if (!mods.length) {
    const inGame = scopedMods().length;
    const other = state.mods.length - inGame;
    if (inGame) {
      $("grid").innerHTML = `<p class="empty">Hay ${inGame} mod(s) ocultos por el filtro. <button type="button" class="ghost" id="clear-filters">Quitar filtros</button></p>`;
      $("clear-filters").onclick = () => { clearFilters(); render(); };
    } else if (other) {
      $("grid").innerHTML = `<p class="empty">Sin mods en este juego. Hay ${other} en otros — cambia el select de arriba.</p>`;
    } else {
      $("grid").innerHTML = `<p class="empty">Pega un enlace de Nexus con Añadir mod. La ficha trae imagen, resumen, categoría, versión y última actualización.</p>`;
    }
    return;
  }
  $("grid").innerHTML = mods.map((mod, index) => `
    <article class="card ${state.selected.has(mod.id) ? "on" : ""}" data-id="${mod.id}" style="animation-delay:${Math.min(index, 10) * 35}ms">
      <div class="shot" ${shot(mod)}><span>${esc(mod.gameName || mod.gameDomain || "Juego")}</span></div>
      <div class="card-body">
        <h3>${esc(mod.name)}</h3>
        <p class="meta">${esc(mod.platform || "Nexus")}${packLabel(mod) ? ` · ${esc(packLabel(mod))}` : ""} · ${esc(categoryLabel(mod.category, mod))} · v${esc(mod.version || "?")}</p>
        <p class="sub">${esc(displaySummary(mod))}${mod.summaryEs ? ` <span class="meta">${state.showEs ? "ES" : "EN"}</span>` : ""}</p>
      </div>
      <footer>
        ${state.picking ? `<label class="check"><input type="checkbox" data-check="${mod.id}" ${state.selected.has(mod.id) ? "checked" : ""}> marcar</label>` : `<span></span>`}
        <span class="meta">${esc(fmtDate(mod.updatedAt))}</span>
      </footer>
    </article>
  `).join("");
  document.querySelectorAll(".card").forEach((card) => {
    card.onclick = (event) => {
      if (state.picking) {
        togglePick(card.dataset.id, event.shiftKey);
        return;
      }
      sfx.open();
      openDetail(card.dataset.id);
    };
  });
  document.querySelectorAll("[data-check]").forEach((box) => {
    box.onclick = (event) => {
      event.stopPropagation();
      togglePick(box.dataset.check, event.shiftKey);
    };
  });
}

function fillPreview(mod) {
  $("preview").hidden = false;
  $("preview").innerHTML = `
    <img alt="" src="${esc(mod.pictureUrl || "")}">
    <div>
      <h3>${esc(mod.name)}</h3>
      <p>${esc(mod.gameName)} · ${esc(categoryLabel(mod.category, mod))} · v${esc(mod.version || "?")}<br>
      ${esc(mod.author)} · ${esc(fmtDate(mod.updatedAt))}<br>${esc(mod.summary || "")}</p>
    </div>`;
  fillCategorySelect($("add-category"), mod.category || "General");
  fillPlatformSelect($("add-platform"), mod.platform || "Nexus");
  fillModpackSelects($("add-modpack"), $("add-pack-cat"), mod.modpackId || "", mod.modpackCategoryId || "", mod.gameDomain || "");
}

async function detect() {
  const button = $("detect");
  const status = $("add-status");
  status.className = "status";
  const page = $("add-url").value;
  status.textContent = isNexusUrl(page)
    ? "Olfateando Nexus…"
    : (/modrinth\.com/i.test(page) ? "Olfateando Modrinth…" : (/curseforge\.com/i.test(page) ? "Olfateando CurseForge…" : "Leyendo la página oficial…"));
  setLoading(button, true, "Detectando");
  sfx.sniff();
  try {
    state.detected = await api("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: $("add-url").value }),
    });
    state.manual = Boolean(state.detected.official);
    $("manual").hidden = !state.detected.official;
    if (state.detected.official) {
      $("manual-name").value = state.detected.name || "";
      $("manual-author").value = state.detected.author || "";
      $("manual-summary").value = state.detected.summary || "";
      const picked = state.detected.platform || platformFromUrl($("add-url").value);
      fillPlatformSelect($("add-platform"), picked);
      $("add-platform").value = picked;
      $("add-platform").disabled = true;
    }
    fillPreview(state.detected);
    status.textContent = state.detected.duplicate
      ? `Ya existe “${state.detected.existingName || state.detected.name || "este mod"}”. Al guardar elige duplicar o sustituir.`
      : (state.detected.official ? `Página lista. Plataforma: ${state.detected.platform || "Independiente"}.` : "Presa detectada.");
    sfx.ok();
  } catch (error) {
    state.detected = null;
    $("manual").hidden = false;
    status.className = "status bad";
    status.textContent = error.message;
    sfx.err();
  } finally {
    setLoading(button, false);
  }
}

function askDuplicate(name) {
  return new Promise((resolve) => {
    const dialog = $("dup-dialog");
    $("dup-msg").textContent = `“${name || "Este mod"}” ya está en la biblioteca. ¿Duplicarlo o sustituir la ficha?`;
    const finish = (choice) => {
      cleanup();
      dialog.close();
      resolve(choice);
    };
    const onCopy = () => finish("duplicate");
    const onReplace = () => finish("replace");
    const onCancel = () => finish("");
    const cleanup = () => {
      $("dup-copy").removeEventListener("click", onCopy);
      $("dup-replace").removeEventListener("click", onReplace);
      $("dup-cancel").removeEventListener("click", onCancel);
      $("dup-x").removeEventListener("click", onCancel);
    };
    $("dup-copy").addEventListener("click", onCopy);
    $("dup-replace").addEventListener("click", onReplace);
    $("dup-cancel").addEventListener("click", onCancel);
    $("dup-x").addEventListener("click", onCancel);
    sfx.warn();
    dialog.showModal();
  });
}

async function saveMod(event) {
  event.preventDefault();
  const button = $("add-save");
  const status = $("add-status");
  status.className = "status";
  let mode = "";
  if (state.detected?.duplicate) {
    mode = await askDuplicate(state.detected.existingName || state.detected.name);
    if (!mode) {
      status.textContent = "No se guardó. Elige duplicar o sustituir.";
      return;
    }
  }
  status.textContent = "Guardando en la guarida…";
  setLoading(button, true, "Guardando");
  const pageUrl = $("add-url").value;
  const picked = platformFromUrl(pageUrl);
  const allowed = platformsForGame(state.game);
  if (allowed && !allowed.includes(picked)) {
    status.textContent = `Este juego solo acepta ${allowed.join(", ")}.`;
    sfx.warn();
    return;
  }
  const official = picked !== "Nexus";
  const body = {
    url: pageUrl,
    platform: picked,
    category: $("add-category").value,
    modpackId: $("add-modpack").value || "",
    modpackCategoryId: $("add-pack-cat").value || "",
    gameDomain: state.game || "",
    gameName: gameLabel(state.game),
    mode,
  };
  if (!state.detected || official) {
    body.manual = {
      name: $("manual-name").value || state.detected?.name || "",
      gameName: $("manual-game").value || gameLabel(state.game),
      gameDomain: state.game || "",
      author: $("manual-author").value || state.detected?.author || "",
      version: $("manual-version").value,
      summary: $("manual-summary").value || state.detected?.summary || "",
      category: $("add-category").value,
      platform: picked,
    };
  }
  try {
    const saved = await api("/api/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    $("add-dialog").close();
    clearFilters();
    toast(mode === "duplicate" ? "Copia guardada." : mode === "replace" ? "Ficha sustituida." : "Mod guardado.");
    await load();
    if (saved.mod && saved.mod.id) openDetail(saved.mod.id);
  } catch (error) {
    if (error.payload?.duplicate) {
      setLoading(button, false);
      const mode = await askDuplicate(error.payload.existingName);
      if (!mode) {
        status.textContent = "No se guardó. Elige duplicar o sustituir.";
        return;
      }
      body.mode = mode;
      setLoading(button, true, "Guardando");
      try {
        const saved = await api("/api/mods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        $("add-dialog").close();
        clearFilters();
        toast(mode === "duplicate" ? "Copia guardada." : "Ficha sustituida.");
        await load();
        if (saved.mod && saved.mod.id) openDetail(saved.mod.id);
        return;
      } catch (retryError) {
        status.className = "status bad";
        status.textContent = retryError.message;
        toast(retryError.message, "bad");
        return;
      } finally {
        setLoading(button, false);
      }
    }
    status.className = "status bad";
    status.textContent = error.message;
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

function openDetail(id) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  const image = mod.pictureFile
    ? `/media/${encodeURI(mod.pictureFile)}`
    : (mod.pictureUrl || "");
  const summaryText = displaySummary(mod);
  $("detail").innerHTML = `
    <header>
      <h2>${esc(mod.name)}</h2>
      <button class="icon" type="button" id="detail-close">✕</button>
    </header>
    <div class="detail-head${image ? "" : " solo"}">
      ${image ? `<img class="hero" alt="" src="${esc(image)}">` : ""}
      <div class="detail-side">
        <p class="hint">${esc(mod.gameName || "")} · ${esc(mod.author || "?")}</p>
        <p class="meta">${mod.nexusUrl ? `<a href="${esc(mod.nexusUrl)}" target="_blank" rel="noreferrer">${esc(mod.platform || "Nexus")}</a>` : esc(mod.platform || "Nexus")} · ${esc(categoryLabel(mod.category, mod))} · ${esc(fmtDate(mod.updatedAt))}</p>
        ${statRow(mod)}
        <p class="summary" id="detail-summary" title="${esc(mod.summary || "")}">${esc(summaryText || "Sin descripción.")}</p>
      </div>
    </div>
    <div class="row">
      <label style="flex:1">Modpack
        <span class="pick-add">
          <select id="detail-modpack"></select>
          <button type="button" class="side-add" id="detail-pack-new" title="Crear modpack">+</button>
        </span>
      </label>
      <label style="flex:1">Categoría
        <span class="pick-add">
          <select id="detail-pack-cat"></select>
          <button type="button" class="side-add" id="detail-cat-new" title="Crear categoría">+</button>
        </span>
      </label>
    </div>
    <label>Nota
      <textarea id="detail-note" rows="3" placeholder="Nota de este mod">${esc(mod.notes || "")}</textarea>
    </label>
    <footer>
      <button class="danger" type="button" id="detail-delete">Eliminar</button>
      <span class="row">
        <span id="detail-refresh-slot">${refreshButton(mod)}</span>
        <button class="solid" type="button" id="detail-save">Guardar</button>
      </span>
    </footer>`;
  fillModpackSelects(
    $("detail-modpack"),
    $("detail-pack-cat"),
    mod.modpackId || "",
    mod.modpackCategoryId || "",
    mod.gameDomain || ""
  );
  $("detail-dialog").showModal();
  $("detail-close").onclick = () => $("detail-dialog").close();
  $("detail-pack-new").onclick = async () => {
    const pack = await createModpackInline(mod.gameDomain, mod.gameName);
    if (!pack?.id) return;
    refillPackSelects($("detail-modpack"), $("detail-pack-cat"), pack.id, "", mod.gameDomain);
  };
  $("detail-cat-new").onclick = () => {
    createCategoryInline($("detail-modpack"), $("detail-pack-cat"), mod.gameDomain);
  };
  $("detail-save").onclick = () => saveDetail(mod.id);
  const refresh = $("detail-refresh");
  if (refresh) refresh.onclick = () => refreshOne(mod.id);
  $("detail-delete").onclick = () => removeMod(mod.id);
  $("detail").dataset.id = mod.id;
  probeUpdate(mod.id);
}

async function downloadMod(id) {
  const button = $("detail-download");
  setLoading(button, true, "Descargando");
  sfx.sniff();
  toast("Pediendo descarga a Nexus…", "warn");
  try {
    const data = await api(`/api/mods/${id}/download`, { method: "POST" });
    if (data.ok) {
      toast("Archivo guardado en la biblioteca.");
      await load();
      openDetail(id);
      return;
    }
    if (data.filesUrl) window.open(data.filesUrl, "_blank", "noreferrer");
    toast(data.error || "Abre Files en Nexus y adjunta el archivo.", "warn");
    if (data.mod) {
      await load();
      openDetail(id);
    }
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

async function assignMarked(kind) {
  const ids = [...state.selected];
  if (!ids.length) {
    toast("Marca mods primero.", "warn");
    return;
  }
  const body = { ids };
  const button = kind === "category" ? $("bulk-cat") : $("bulk-move");
  if (kind === "category") {
    body.category = $("bulk-category").value || "General";
  } else {
    body.modpackId = $("bulk-pack").value || "";
    body.modpackCategoryId = $("bulk-pack-cat").value || "";
  }
  setLoading(button, true, kind === "category" ? "Asignando" : "Moviendo");
  try {
    const data = await api("/api/mods/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    toast(kind === "category" ? `${data.count} en la categoría.` : `${data.count} movidos.`);
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

async function saveDetail(id) {
  const button = $("detail-save");
  setLoading(button, true, "Guardando");
  try {
    await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modpackId: $("detail-modpack").value || "",
        modpackCategoryId: $("detail-pack-cat").value || "",
        notes: $("detail-note").value || "",
      }),
    });
    toast("Cambios guardados.");
    await load();
    openDetail(id);
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

let probeToken = 0;

async function probeUpdate(id) {
  const mod = state.mods.find((item) => item.id === id);
  const page = String(mod?.nexusUrl || "");
  const tracked = /nexusmods\.com\/[^/]+\/mods\/\d+/i.test(page)
    || /modrinth\.com\/(?:mod|modpack|resourcepack|datapack|shader|plugin|project)\//i.test(page)
    || /curseforge\.com\/[^/]+\/[^/]+\/[^/?#]+/i.test(page);
  if (!mod || !tracked) return;
  const token = ++probeToken;
  try {
    const check = await api(`/api/mods/${id}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: false }),
    });
    if (token !== probeToken || $("detail")?.dataset.id !== id) return;
    if (check.mod) {
      const index = state.mods.findIndex((item) => item.id === id);
      if (index >= 0) state.mods[index] = check.mod;
    }
    const slot = $("detail-refresh-slot");
    if (!slot) return;
    if (!check.changed) {
      slot.innerHTML = "";
      return;
    }
    const current = state.mods.find((item) => item.id === id) || mod;
    slot.innerHTML = refreshButton({
      ...current,
      updateAvailable: true,
      remoteVersion: check.remote?.version || current.remoteVersion || "",
    });
    const button = $("detail-refresh");
    if (button) button.onclick = () => refreshOne(id);
  } catch (_) {
    /* sin aviso si Nexus no responde */
  }
}

async function refreshOne(id) {
  const button = $("detail-refresh");
  setLoading(button, true, "Buscando");
  sfx.sniff();
  try {
    const check = await api(`/api/mods/${id}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: false }),
    });
    await load();
    if (!check.changed) {
      toast(`Sin versión nueva. Stats de Nexus actualizados · ${fmtWhen(check.checkedAt)}`);
      openDetail(id);
      return;
    }
    sfx.warn();
    const remote = check.remote || {};
    const local = check.local || {};
    const ok = await askConfirm(
      `Versión nueva · Local v${local.version || "?"} → Nexus v${remote.version || "?"}. ¿Actualizar la ficha?`
    );
    if (!ok) {
      toast("Se dejó la versión actual. La fecha de revisión sí se guardó.", "warn");
      openDetail(id);
      return;
    }
    setLoading($("detail-refresh"), true, "Actualizando");
    await api(`/api/mods/${id}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apply: true }),
    });
    toast("Ficha actualizada a la versión de Nexus.");
    await load();
    openDetail(id);
  } catch (error) {
    toast(error.message, "bad");
    openDetail(id);
  }
}

async function removeMod(id) {
  if (!(await askConfirm("¿Eliminar este mod y sus archivos?"))) return;
  await api(`/api/mods/${id}`, { method: "DELETE" });
  $("detail-dialog").close();
  await load();
}

async function upload(id, files) {
  if (!files.length) return;
  const form = new FormData();
  [...files].forEach((file) => form.append("file", file));
  try {
    await api(`/api/mods/${id}/files`, { method: "POST", body: form });
    toast("Archivos guardados.");
    await load();
    openDetail(id);
  } catch (error) {
    toast(error.message);
  }
}

async function dropFile(modId, fileId) {
  await api(`/api/mods/${modId}/files/${fileId}`, { method: "DELETE" });
  await load();
  openDetail(modId);
}

function fillSecret(node, value) {
  if (!node) return;
  node.value = value || "";
}

async function openSettings() {
  try {
    const data = await api("/api/settings");
    const who = data.profile && data.profile.name ? ` · ${data.profile.name}` : "";
    $("settings-status").textContent = data.hasKey ? `Nexus: ${data.hint}${who}` : "Nexus: sin clave.";
    $("settings-status").className = "status";
    if ($("cf-status")) {
      $("cf-status").textContent = data.hasCurseforgeKey ? `CurseForge: ${data.curseforgeHint}` : "CurseForge: sin clave.";
    }
    $("rawg-status").textContent = data.hasRawgKey ? `RAWG: ${data.rawgHint}` : "RAWG: sin clave.";
    fillSecret($("api-key"), data.apiKey);
    fillSecret($("rawg-key"), data.rawgApiKey);
    fillSecret($("cf-key"), data.curseforgeApiKey);
    if (data.language) applyLang(data.language);
  } catch (error) {
    $("settings-status").textContent = error.message;
  }
  $("settings-dialog").showModal();
}

let gameSearchTimer = null;

function openGameDialog() {
  sfx.open();
  $("game-search").value = "";
  $("game-results").innerHTML = `<p class="hint">Escribe al menos 2 letras.</p>`;
  $("game-dialog").showModal();
  setTimeout(() => $("game-search").focus(), 40);
}

async function searchRawgGames(query) {
  const box = $("game-results");
  const q = (query || "").trim();
  if (q.length < 2) {
    box.innerHTML = `<p class="hint">Escribe al menos 2 letras.</p>`;
    return;
  }
  box.innerHTML = `<p class="hint">Buscando…</p>`;
  try {
    const data = await api(`/api/rawg/search?q=${encodeURIComponent(q)}`);
    const rows = data.results || [];
    if (!rows.length) {
      box.innerHTML = `<p class="hint">Sin resultados.</p>`;
      return;
    }
    box.innerHTML = rows.map((game) => `
      <div class="game-hit">
        <img alt="" src="${esc(game.imageUrl || "")}" loading="lazy">
        <div>
          <b>${esc(game.gameName || "")}</b>
          <p class="meta">${esc(game.released || "¿?")}${game.platforms?.length ? ` · ${esc(game.platforms.slice(0, 3).join(", "))}` : ""} · ${esc(game.gameDomain || "")}</p>
        </div>
        <button type="button" class="solid" data-rawg-add="${esc(String(game.rawgId || ""))}">Añadir</button>
      </div>
    `).join("");
    box.querySelectorAll("[data-rawg-add]").forEach((button) => {
      button.onclick = () => addRawgGame(button.dataset.rawgAdd, button);
    });
  } catch (error) {
    box.innerHTML = `<p class="hint">${esc(error.message)}</p>`;
  }
}

async function addRawgGame(rawgId, button) {
  if (!rawgId) return;
  setLoading(button, true, "…");
  try {
    const data = await api("/api/rawg/add", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rawgId: Number(rawgId) || rawgId }),
    });
    const game = data.game || {};
    state.catalog = data.catalog || state.catalog;
    if (game.gameDomain) {
      state.game = game.gameDomain;
      localStorage.setItem("wi-mod-game", state.game);
      state.modpack = "";
      state.packCat = "";
    }
    toast(`${game.gameName || "Juego"} añadido.`);
    await load();
    $("game-dialog").close();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

function resetAdd() {
  $("add-form").reset();
  $("preview").hidden = true;
  $("manual").hidden = true;
  $("add-status").textContent = "";
  state.detected = null;
  state.manual = false;
  fillPlatformSelect($("add-platform"), "Nexus");
  $("add-platform").disabled = false;
  fillCategorySelect($("add-category"), "General");
  fillModpackSelects($("add-modpack"), $("add-pack-cat"), "", "", state.game);
}

document.querySelectorAll("[data-close]").forEach((button) => {
  button.onclick = () => { sfx.soft(); button.closest("dialog").close(); };
});
function closeAppMenu() {
  const menu = $("app-menu");
  const btn = $("app-menu-btn");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

$("mute").onclick = () => {
  state.muted = !state.muted;
  localStorage.setItem("wi-mod-mute", state.muted ? "1" : "0");
  syncMute();
  if (!state.muted) sfx.click();
};
document.querySelectorAll(".lang-switch [data-lang]").forEach((button) => {
  button.onclick = () => setLanguage(button.dataset.lang);
});
document.querySelectorAll(".theme-switch [data-theme]").forEach((button) => {
  button.onclick = () => setTheme(button.dataset.theme);
});
$("app-menu-btn").onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeGameMenu();
  const menu = $("app-menu");
  const open = menu.hidden;
  menu.hidden = !open;
  $("app-menu-btn").setAttribute("aria-expanded", open ? "true" : "false");
  if (open) sfx.click();
};
$("app-menu").onclick = (event) => {
  const item = event.target.closest("button[role='menuitem']");
  if (item) closeAppMenu();
};
$("translate-open").onclick = () => {
  sfx.open();
  $("translate-in").value = "";
  $("translate-out").value = "";
  $("translate-dialog").showModal();
};
$("translate-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = $("translate-run");
  setLoading(button, true, "Traduciendo");
  sfx.sniff();
  try {
    const data = await api("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: $("translate-in").value, source: "en", target: "es" }),
    });
    $("translate-out").value = data.text || "";
    toast("Traducción lista.");
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};
$("translate-copy").onclick = async () => {
  const text = $("translate-out").value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Copiado.");
  } catch (_) {
    $("translate-out").select();
    toast("Selecciona y copia con Ctrl+C.", "warn");
  }
};
$("add-open").onclick = () => { sfx.open(); resetAdd(); $("add-dialog").showModal(); };
$("bulk-cat").onclick = () => assignMarked("category");
$("bulk-move").onclick = () => assignMarked("pack");
$("bulk-clear").onclick = () => { state.selected.clear(); sfx.soft(); render(); };
$("bulk-all").onclick = () => {
  const ids = visible().map((mod) => mod.id);
  const allOn = ids.length > 0 && ids.every((id) => state.selected.has(id));
  ids.forEach((id) => { if (allOn) state.selected.delete(id); else state.selected.add(id); });
  sfx.soft();
  render();
};
$("add-url").oninput = () => syncAddSource();
$("detect").onclick = detect;
$("manual-toggle").onclick = () => {
  state.manual = true;
  state.detected = null;
  $("manual").hidden = false;
  sfx.click();
};
$("add-form").onsubmit = saveMod;
$("add-pack-new").onclick = async () => {
  const pack = await createModpackInline(state.game, gameLabel(state.game));
  if (!pack?.id) return;
  refillPackSelects($("add-modpack"), $("add-pack-cat"), pack.id, "", state.game);
};
$("add-cat-new").onclick = () => {
  createCategoryInline($("add-modpack"), $("add-pack-cat"), state.game);
};
$("dup-form").onsubmit = (event) => event.preventDefault();
$("settings-open").onclick = () => { sfx.open(); openSettings(); };

const KEY_POPS = {
  nexus: {
    label: "Clave Nexus Mods",
    field: "apiKey",
    flag: "hasKey",
    doc: "https://www.nexusmods.com/users/myaccount?tab=api+access",
    docLabel: "Sacar clave en Nexus",
  },
  modrinth: {
    note: "Modrinth ya está activa. No pide clave.",
    doc: "https://docs.modrinth.com/api/",
    docLabel: "Documentación de Modrinth",
  },
  curseforge: {
    label: "Clave CurseForge",
    field: "curseforgeApiKey",
    flag: "hasCurseforgeKey",
    doc: "https://console.curseforge.com/#/api-keys",
    docLabel: "Sacar clave en CurseForge",
  },
  rawg: {
    label: "Clave RAWG",
    field: "rawgApiKey",
    flag: "hasRawgKey",
    doc: "https://rawg.io/apidocs",
    docLabel: "Documentación de RAWG",
  },
};

function closeKeyPop() {
  const pop = $("key-pop");
  if (!pop) return;
  pop.hidden = true;
  pop.dataset.key = "";
}

function openKeyPop(pill) {
  const id = pill.dataset.key;
  const spec = KEY_POPS[id];
  const pop = $("key-pop");
  if (!spec || !pop) return;
  if (!pop.hidden && pop.dataset.key === id) {
    closeKeyPop();
    return;
  }
  pop.dataset.key = id;
  const needsKey = !!spec.field;
  $("key-pop-note").hidden = !spec.note;
  $("key-pop-note").textContent = spec.note || "";
  $("key-pop-field").hidden = !needsKey;
  $("key-pop-label").textContent = needsKey ? spec.label : "";
  $("key-pop-input").value = "";
  $("key-pop-input").placeholder = state.keys?.[id] ? "Pega otra clave para reemplazarla" : "Pega la clave";
  $("key-pop-save").hidden = !needsKey;
  $("key-pop-doc").href = spec.doc;
  $("key-pop-doc").textContent = spec.docLabel;
  $("key-pop-status").textContent = "";
  $("key-pop-status").className = "status";
  pop.hidden = false;
  const rect = pill.getBoundingClientRect();
  const box = pop.getBoundingClientRect();
  const left = Math.max(8, Math.min(rect.left + rect.width / 2 - box.width / 2, window.innerWidth - box.width - 8));
  let top = rect.top - box.height - 10;
  if (top < 8) top = rect.bottom + 10;
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  if (needsKey) $("key-pop-input").focus();
}

$("dock-keys").onclick = (event) => {
  const pill = event.target.closest("[data-key]");
  if (!pill) return;
  sfx.open();
  openKeyPop(pill);
};
document.addEventListener("pointerdown", (event) => {
  const pop = $("key-pop");
  if (!pop || pop.hidden) return;
  if (pop.contains(event.target) || event.target.closest("#dock-keys [data-key]")) return;
  closeKeyPop();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeKeyPop();
});
$("key-pop-form").onsubmit = async (event) => {
  event.preventDefault();
  const id = $("key-pop").dataset.key;
  const spec = KEY_POPS[id];
  if (!spec?.field) return;
  const value = ($("key-pop-input").value || "").trim();
  if (!value) return;
  const button = $("key-pop-save");
  setLoading(button, true, "Guardando");
  try {
    const data = await api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [spec.field]: value }),
    });
    state.keys = {
      nexus: !!data.hasKey,
      curseforge: !!data.hasCurseforgeKey,
      rawg: !!data.hasRawgKey,
    };
    paintKeys();
    closeKeyPop();
    toast("Clave guardada.");
  } catch (error) {
    $("key-pop-status").className = "status bad";
    $("key-pop-status").textContent = error.message;
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};
$("settings-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  setLoading(button, true, "Guardando");
  try {
    const body = {};
    const nexus = ($("api-key").value || "").trim();
    const rawg = ($("rawg-key").value || "").trim();
    const curse = ($("cf-key")?.value || "").trim();
    if (nexus) body.apiKey = nexus;
    if (rawg) body.rawgApiKey = rawg;
    if (curse) body.curseforgeApiKey = curse;
    const data = await api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    $("settings-status").className = "status";
    $("settings-status").textContent = data.hasKey
      ? (data.profile?.name ? `Nexus: ${data.profile.name}` : `Nexus: ${data.hint}`)
      : "Nexus: sin clave.";
    $("rawg-status").textContent = data.hasRawgKey ? `RAWG: ${data.rawgHint}` : "RAWG: sin clave.";
    if ($("cf-status")) {
      $("cf-status").textContent = data.hasCurseforgeKey ? `CurseForge: ${data.curseforgeHint}` : "CurseForge: sin clave.";
    }
    fillSecret($("api-key"), data.apiKey);
    fillSecret($("rawg-key"), data.rawgApiKey);
    fillSecret($("cf-key"), data.curseforgeApiKey);
    if (data.language) applyLang(data.language);
    if (data.theme) applyTheme(data.theme);
    await load();
    toast("Ajustes guardados.");
  } catch (error) {
    $("settings-status").className = "status bad";
    $("settings-status").textContent = error.message;
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};
$("clear-key").onclick = async () => {
  await api("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey: "" }),
  });
  $("settings-status").textContent = "Nexus: sin clave.";
  fillSecret($("api-key"), "");
  toast("Clave Nexus quitada.", "warn");
};
$("game-add").onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  closeGameMenu();
  openGameDialog();
};
$("game-picker").onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  const menu = $("game-menu");
  const open = menu.hidden;
  if (open) {
    menu.hidden = false;
    $("game-picker").setAttribute("aria-expanded", "true");
    renderGameScope();
  } else {
    closeGameMenu();
  }
};
document.addEventListener("click", (event) => {
  if (!event.target.closest?.(".game-picker-wrap")) closeGameMenu();
  if (!event.target.closest?.(".app-menu-wrap")) closeAppMenu();
  if (!event.target.closest?.(".search-wrap")) hideRemoteSearch();
});
$("game-form").onsubmit = (event) => event.preventDefault();
$("game-search").oninput = (event) => {
  clearTimeout(gameSearchTimer);
  gameSearchTimer = setTimeout(() => searchRawgGames(event.target.value), 320);
};
let remoteTimer = 0;
let remoteToken = 0;

function hideRemoteSearch() {
  const box = $("search-remote");
  if (!box) return;
  box.hidden = true;
}

function scheduleRemoteSearch() {
  clearTimeout(remoteTimer);
  remoteTimer = setTimeout(runRemoteSearch, 320);
}

async function runRemoteSearch() {
  const box = $("search-remote");
  if (!box) return;
  const q = state.query.trim();
  if (q.length < 2) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  const target = remoteTarget();
  box.hidden = false;
  if (!target) {
    const label = searchPlatformLabel();
    box.innerHTML = `<p class="hint">${esc(label)} se añade con el enlace del mod.</p>`;
    return;
  }
  if (!state.game) {
    box.innerHTML = `<p class="hint">Elige un juego arriba.</p>`;
    return;
  }
  const token = ++remoteToken;
  box.innerHTML = `<p class="hint">Buscando en ${esc(target)}…</p>`;
  const game = target === "Modrinth" ? "" : `&game=${encodeURIComponent(state.game)}`;
  const path = target === "Modrinth"
    ? "/api/modrinth/search"
    : (target === "CurseForge" ? "/api/curseforge/search" : "/api/nexus/search");
  try {
    const data = await api(`${path}?q=${encodeURIComponent(q)}${game}`);
    if (token !== remoteToken) return;
    paintRemote(data.results || [], target);
  } catch (error) {
    if (token !== remoteToken) return;
    box.innerHTML = `<p class="hint">${esc(error.message)}</p>`;
  }
}

function paintRemote(results, label) {
  const box = $("search-remote");
  const where = label || "Nexus";
  if (!results.length) {
    box.innerHTML = `<p class="hint">Nada en ${esc(where)} para esta búsqueda.</p>`;
    return;
  }
  box.innerHTML = results.map((hit, index) => `
    <article class="search-hit">
      ${hit.pictureUrl ? `<img alt="" src="${esc(hit.pictureUrl)}">` : `<span></span>`}
      <div>
        <b>${esc(hit.name)}</b>
        <p class="meta">${esc(where)} · ${esc(hit.author || "?")} · ↓ ${esc(fmtCount(hit.downloads))}</p>
      </div>
      <button type="button" class="${hit.savedId ? "ghost" : "solid"}" data-remote="${index}">${hit.savedId ? "Ya está" : "Añadir"}</button>
    </article>
  `).join("");
  box.querySelectorAll("[data-remote]").forEach((button) => {
    const hit = results[Number(button.dataset.remote)];
    if (!hit) return;
    button.onclick = () => {
      if (hit.savedId) {
        hideRemoteSearch();
        openDetail(hit.savedId);
        return;
      }
      addRemoteMod(hit, button);
    };
  });
}

async function addRemoteMod(hit, button) {
  button.disabled = true;
  button.textContent = "Añadiendo…";
  try {
    const saved = await api("/api/mods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: hit.url,
        platform: hit.platform || "Nexus",
        gameDomain: hit.gameDomain || state.game,
        gameName: hit.gameName || gameLabel(state.game),
        manual: hit.platform && hit.platform !== "Nexus" ? {
          name: hit.name,
          author: hit.author || "",
          summary: hit.summary || "",
          gameDomain: state.game,
          gameName: gameLabel(state.game),
          platform: hit.platform,
        } : undefined,
      }),
    });
    toast("Mod guardado.");
    hit.savedId = saved.mod?.id || hit.savedId;
    button.className = "ghost";
    button.textContent = "Ya está";
    button.disabled = false;
    button.onclick = () => {
      hideRemoteSearch();
      if (hit.savedId) openDetail(hit.savedId);
    };
    await load();
  } catch (error) {
    button.disabled = false;
    button.textContent = "Añadir";
    toast(error.message, "bad");
  }
}

$("search").oninput = (event) => {
  state.query = event.target.value;
  render();
  scheduleRemoteSearch();
};
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideRemoteSearch();
});
$("sort").onchange = (event) => { state.sort = event.target.value; sfx.click(); render(); };
$("pick-mode").onclick = () => setPicking(!state.picking);
$("pick-all").onclick = () => selectAllVisible();
document.querySelectorAll(".view-toggle [data-view]").forEach((button) => {
  button.onclick = () => setView(button.dataset.view);
});
document.querySelectorAll(".view-toggle [data-size]").forEach((button) => {
  button.onclick = () => setCardSize(button.dataset.size);
});
$("export").onclick = () => openPackDialog("export");
$("import").onclick = () => openPackDialog("import");
$("pack-scope").onchange = syncPackDialog;
$("pack-form").onsubmit = runPackAction;
$("packs-open").onclick = () => { sfx.open(); openModpacksDialog(); };
$("mp-reset").onclick = () => resetModpackForm();
$("modpacks-form").onsubmit = saveModpackForm;
$("packcat-form").onsubmit = savePackCatForm;
$("mp-cat-add").onclick = () => addMpCatRow();

function gameOptionsForPacks() {
  return [
    ["darksouls3", "Dark Souls"],
    ["skyrimspecialedition", "Skyrim"],
    ["minecraft", "Minecraft"],
    ["stardewvalley", "Stardew Valley"],
  ];
}

function openModpacksDialog() {
  resetModpackForm();
  renderModpacksList();
  $("modpacks-dialog").showModal();
}

function mpCatNames() {
  return [...$("mp-cats").querySelectorAll("input")].map((input) => input.value.trim()).filter(Boolean);
}

function addMpCatRow(name = "") {
  const row = document.createElement("div");
  row.className = "mp-cat-row";
  row.innerHTML = `<input type="text" placeholder="Ej. Iluminación" value="${esc(name)}" maxlength="80"><button type="button" class="ghost" title="Quitar">✕</button>`;
  row.querySelector("button").onclick = () => row.remove();
  $("mp-cats").appendChild(row);
}

function resetModpackForm() {
  $("mp-edit-id").value = "";
  $("mp-name").value = "";
  $("mp-notes").value = "";
  $("mp-save").textContent = "Guardar modpack";
  $("mp-cats").innerHTML = "";
  addMpCatRow();
  const games = gameOptions();
  const current = state.game || games[0]?.[0] || "";
  $("mp-game").innerHTML = games.map(([id, label]) => (
    `<option value="${esc(id)}" ${id === current ? "selected" : ""}>${esc(label)}</option>`
  )).join("");
}

function renderModpacksList() {
  const node = $("modpacks-list");
  if (!state.modpacks.length) {
    node.innerHTML = `<p class="hint">Ningún modpack todavía.</p>`;
    return;
  }
  node.innerHTML = state.modpacks.map((pack) => {
    const n = state.mods.filter((mod) => mod.modpackId === pack.id).length;
    const sections = (pack.categories || []).map((cat) => cat.name).join(", ") || "sin categorías";
    return `<div class="file">
      <div>
        <b>${esc(pack.name)}</b>
        <p class="meta">${esc(pack.gameName || pack.gameDomain)} · ${n} mods · ${esc(sections)}</p>
      </div>
      <span class="row">
        <button class="ghost" type="button" data-mp-edit="${pack.id}">Editar</button>
        <button class="danger" type="button" data-mp-del="${pack.id}">Borrar</button>
      </span>
    </div>`;
  }).join("");
  node.querySelectorAll("[data-mp-edit]").forEach((button) => {
    button.onclick = () => editModpack(button.dataset.mpEdit);
  });
  node.querySelectorAll("[data-mp-del]").forEach((button) => {
    button.onclick = () => deleteModpack(button.dataset.mpDel);
  });
}

function editModpack(id) {
  const pack = packById(id);
  if (!pack) return;
  $("mp-edit-id").value = pack.id;
  $("mp-name").value = pack.name || "";
  $("mp-notes").value = pack.notes || "";
  $("mp-save").textContent = "Actualizar";
  $("mp-cats").innerHTML = "";
  addMpCatRow();
  const games = gameOptionsForPacks();
  if (pack.gameDomain && !games.some(([gid]) => gid === pack.gameDomain)) {
    games.unshift([pack.gameDomain, pack.gameName || pack.gameDomain]);
  }
  $("mp-game").innerHTML = games.map(([gid, label]) => (
    `<option value="${esc(gid)}" ${gid === pack.gameDomain ? "selected" : ""}>${esc(label)}</option>`
  )).join("");
}

async function deleteModpack(id) {
  const pack = packById(id);
  if (!pack) return;
  if (!(await askConfirm(`¿Borrar “${pack.name}”? Los mods quedan sin pack.`))) return;
  try {
    await api(`/api/modpacks/${id}`, { method: "DELETE" });
    toast("Modpack borrado.", "warn");
    await load();
    openModpacksDialog();
  } catch (error) {
    toast(error.message, "bad");
  }
}

async function saveModpackForm(event) {
  event.preventDefault();
  const name = ($("mp-name").value || "").trim();
  const gameDomain = $("mp-game").value || "";
  if (!name || !gameDomain) {
    toast("Nombre y juego obligatorios.", "warn");
    return;
  }
  const editId = $("mp-edit-id").value;
  const gameName = gameOptionsForPacks().find(([id]) => id === gameDomain)?.[1] || gameDomain;
  const body = {
    name,
    gameDomain,
    gameName,
    notes: $("mp-notes").value || "",
  };
  const extra = mpCatNames().map((label) => ({ name: label }));
  const button = $("mp-save");
  setLoading(button, true, "Guardando");
  try {
    let saved;
    if (editId) {
      saved = await api(`/api/modpacks/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      for (const cat of extra) {
        saved = await api(`/api/modpacks/${editId}/categories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cat),
        });
      }
      toast(extra.length ? "Modpack y categorías guardados." : "Modpack actualizado.");
    } else {
      if (extra.length) body.categories = extra;
      saved = await api("/api/modpacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast(extra.length ? "Modpack creado con categorías." : "Modpack creado.");
    }
    const pack = saved.modpack;
    if (!editId && pack?.id) {
      if (pack.gameDomain) {
        state.game = pack.gameDomain;
        localStorage.setItem("wi-mod-game", state.game);
      }
      state.modpack = pack.id;
      await load();
      $("modpacks-dialog").close();
      return;
    }
    await load();
    openModpacksDialog();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}
$("refresh-all").onclick = async () => {
  const button = $("refresh-all");
  setLoading(button, true, "Revisando");
  sfx.sniff();
  try {
    const data = await api("/api/refresh", { method: "POST" });
    const fails = data.failed.length ? ` ${data.failed.length} fallaron.` : "";
    toast(
      data.available
        ? `Revisados ${data.checked}. ${data.available} con versión nueva (ábrelo y confirma).${fails}`
        : `Revisados ${data.checked}. Ninguno con versión nueva.${fails}`,
      data.available ? "warn" : "ok"
    );
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};

function openPackDialog(mode) {
  state.packMode = mode === "import" ? "import" : "export";
  sfx.open();
  $("pack-title").textContent = state.packMode === "import" ? "Restaurar" : "Comprimir";
  $("pack-go").textContent = state.packMode === "import" ? "Restaurar" : "Comprimir";
  $("pack-hint").textContent = state.packMode === "import"
    ? "Elige qué traer del .zip: todo, una plataforma, un juego o un modpack."
    : "Empaqueta ficha + archivos. Puedes filtrar por plataforma, juego o modpack.";
  const selectedOpt = $("pack-scope").querySelector('option[value="selected"]');
  if (selectedOpt) selectedOpt.hidden = state.packMode === "import";
  if (state.packMode === "import" && $("pack-scope").value === "selected") {
    $("pack-scope").value = "all";
  }
  $("pack-file").value = "";
  syncPackDialog();
  $("pack-dialog").showModal();
}

function packFilter() {
  const scope = $("pack-scope").value;
  const value = $("pack-value").value || "";
  const filt = { scope };
  if (scope === "platform") filt.platform = value;
  if (scope === "game") filt.game = value;
  if (scope === "modpack") filt.modpack = value;
  if (scope === "selected") filt.ids = [...state.selected];
  return filt;
}

function countForPack(filt) {
  if (filt.scope === "all") return state.mods.length;
  if (filt.scope === "selected") return state.selected.size;
  return state.mods.filter((mod) => {
    if (filt.scope === "platform") return String(mod.platform || "Nexus") === filt.platform;
    if (filt.scope === "game") return String(mod.gameDomain || "") === filt.game;
    if (filt.scope === "modpack") return String(mod.modpackId || "") === filt.modpack;
    return false;
  }).length;
}

function syncPackDialog() {
  const scope = $("pack-scope").value;
  const wrap = $("pack-value-wrap");
  const fileWrap = $("pack-file-wrap");
  const select = $("pack-value");
  fileWrap.hidden = state.packMode !== "import";
  const needsValue = scope === "platform" || scope === "game" || scope === "modpack";
  wrap.hidden = !needsValue;
  if (needsValue) {
    let options = [];
    if (scope === "platform") {
      options = counts((mod) => mod.platform || "Nexus", state.mods).map((row) => [row.id, `${row.label} (${row.count})`]);
    } else if (scope === "game") {
      options = counts(gameKey, state.mods).filter((row) => row.id).map((row) => [row.id, `${row.label} (${row.count})`]);
    } else {
      options = state.modpacks.map((pack) => {
        const n = state.mods.filter((mod) => mod.modpackId === pack.id).length;
        return [pack.id, `${pack.name} · ${pack.gameName || pack.gameDomain} (${n})`];
      });
    }
    select.innerHTML = options.length
      ? options.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("")
      : `<option value="">(vacío)</option>`;
  }
  const filt = packFilter();
  const n = countForPack(filt);
  if (state.packMode === "import") {
    $("pack-count").textContent = filt.scope === "all"
      ? "Se restaurará todo lo que traiga el paquete (filtrable)."
      : `Filtro listo · en tu biblioteca hay ${n} mod(s) con ese criterio.`;
  } else {
    $("pack-count").textContent = `${n} mod(s) entrarán en el zip.`;
  }
}

async function runPackAction(event) {
  event.preventDefault();
  const filt = packFilter();
  const button = $("pack-go");
  if (state.packMode === "export") {
    if (filt.scope === "selected" && !filt.ids.length) {
      toast("Marca mods o cambia el alcance.", "warn");
      return;
    }
    if (!countForPack(filt)) {
      toast("No hay mods con ese filtro.", "warn");
      return;
    }
    setLoading(button, true, "Comprimiendo");
    sfx.sniff();
    try {
      const res = await api("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filt),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "wi-mod.zip";
      link.click();
      URL.revokeObjectURL(url);
      $("pack-dialog").close();
      toast(`Paquete listo (${countForPack(filt)} mods).`);
    } catch (error) {
      toast(error.message, "bad");
    } finally {
      setLoading(button, false);
    }
    return;
  }
  const file = $("pack-file").files[0];
  if (!file) {
    toast("Elige el .zip a restaurar.", "warn");
    return;
  }
  setLoading(button, true, "Restaurando");
  sfx.sniff();
  const form = new FormData();
  form.append("file", file);
  form.append("scope", filt.scope);
  if (filt.platform) form.append("platform", filt.platform);
  if (filt.game) form.append("game", filt.game);
  if (filt.modpack) form.append("modpack", filt.modpack);
  try {
    const data = await api("/api/import", { method: "POST", body: form });
    const skip = data.result.skipped ? ` · ${data.result.skipped} omitidos` : "";
    $("pack-dialog").close();
    toast(`Restaurado: ${data.result.added} nuevos, ${data.result.updated} actualizados${skip}.`);
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

let loginMode = "idle";
let loginLength = null;
let lookupSeq = 0;

function sessionToken() {
  return localStorage.getItem("wi-mod-session") || sessionStorage.getItem("wi-mod-session") || "";
}

function keepSession(token, remember) {
  if (remember) {
    localStorage.setItem("wi-mod-session", token);
    localStorage.setItem("wi-mod-keep", "1");
    sessionStorage.removeItem("wi-mod-session");
  } else {
    sessionStorage.setItem("wi-mod-session", token);
    localStorage.removeItem("wi-mod-session");
  }
}

function dropSession() {
  localStorage.removeItem("wi-mod-session");
  sessionStorage.removeItem("wi-mod-session");
}

function showLogin() {
  const box = $("login");
  if (!box) return;
  box.hidden = false;
  $("login-status").textContent = "";
  $("login-status").className = "status";
  const keep = $("login-keep");
  if (keep) keep.checked = localStorage.getItem("wi-mod-keep") === "1";
  hideBoot();
  refreshLoginUser();
}

function hideLogin() {
  const box = $("login");
  if (box) box.hidden = true;
}

function paintLogin() {
  const pass = $("login-pass").value;
  const hint = $("login-hint");
  const button = $("login-go");
  const forgot = $("login-reset");
  if (loginMode === "missing" || loginMode === "create") {
    hint.textContent = loginMode === "missing"
      ? "Ese usuario no está creado. Escribe una clave para crearlo."
      : "Este usuario aún no tiene clave. Créala.";
    button.textContent = "Crear clave";
    button.disabled = pass.length < 4;
    forgot.hidden = true;
    return;
  }
  if (loginMode === "reset") {
    hint.textContent = "Elige una clave nueva para este usuario.";
    button.textContent = "Guardar clave";
    button.disabled = pass.length < 4;
    forgot.hidden = false;
    forgot.textContent = "Volver";
    return;
  }
  if (loginMode === "enter") {
    hint.textContent = loginLength
      ? `La clave tiene ${loginLength} caracteres.`
      : "Escribe la clave.";
    button.textContent = "Entrar";
    button.disabled = loginLength ? pass.length !== loginLength : pass.length < 4;
    forgot.hidden = false;
    forgot.textContent = "Olvidé la clave";
    return;
  }
  hint.textContent = "Escribe tu usuario.";
  button.textContent = "Entrar";
  button.disabled = true;
  forgot.hidden = true;
}

async function refreshLoginUser() {
  const name = $("login-user").value.trim();
  const seq = ++lookupSeq;
  if (!name) {
    loginMode = "idle";
    loginLength = null;
    paintLogin();
    return;
  }
  try {
    const data = await api("/api/users/lookup?name=" + encodeURIComponent(name));
    if (seq !== lookupSeq) return;
    loginLength = data.passwordLength ?? null;
    if (!data.exists) loginMode = "missing";
    else if (data.needsPassword) loginMode = "create";
    else if (loginMode !== "reset") loginMode = "enter";
  } catch (error) {
    if (seq !== lookupSeq) return;
    $("login-status").className = "status bad";
    $("login-status").textContent = error.message || "No se pudo consultar el usuario.";
  }
  paintLogin();
}

async function submitLogin(event) {
  event?.preventDefault();
  const status = $("login-status");
  const button = $("login-go");
  if (button.disabled) return;
  const username = $("login-user").value.trim();
  const password = $("login-pass").value;
  const path = loginMode === "reset"
    ? "/api/password/reset"
    : (loginMode === "missing" || loginMode === "create" ? "/api/users" : "/api/login");
  status.className = "status";
  status.textContent = loginMode === "enter" ? "Entrando…" : "Guardando clave…";
  button.disabled = true;
  try {
    const remember = Boolean($("login-keep")?.checked);
    const data = await api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, remember }),
    });
    if (data.token) keepSession(data.token, remember);
    setDockName(data.username || username);
    rollAvatar();
    $("login-pass").value = "";
    loginMode = "idle";
    await enterApp();
  } catch (error) {
    status.className = "status bad";
    status.textContent = error.message || "No se pudo entrar.";
    paintLogin();
  }
}

$("login-form").onsubmit = submitLogin;
$("login-user").addEventListener("input", () => {
  loginMode = loginMode === "reset" ? "idle" : loginMode;
  window.clearTimeout($("login-user")._lookup);
  $("login-user")._lookup = window.setTimeout(refreshLoginUser, 220);
});
$("login-pass").addEventListener("input", paintLogin);
$("login-reset").onclick = () => {
  loginMode = loginMode === "reset" ? "enter" : "reset";
  $("login-pass").value = "";
  $("login-status").textContent = "";
  paintLogin();
  $("login-pass").focus();
};
$("logout").onclick = async () => {
  closeAppMenu();
  try {
    await api("/api/logout", { method: "POST" });
  } catch (_) { /* sigue el cierre local */ }
  dropSession();
  state.mods = [];
  $("login-user").value = "";
  $("login-pass").value = "";
  loginMode = "idle";
  showLogin();
};

const BOOT_LINES = [
  "olfateando la guarida…",
  "contando escamas…",
  "calentando el tesoro…",
  "rastreando mods perdidos…",
  "afilando las garras…",
  "revisando el nido…",
  "soplando el polvo de los pergaminos…",
  "despertando al dragón…",
  "escondiendo el oro bajo la cama…",
  "siguiendo un rastro de mods…",
];

function spinBootLine() {
  const node = $("boot-line");
  if (!node) return;
  let i = 0;
  node.textContent = BOOT_LINES[0];
  setInterval(() => {
    if (!document.getElementById("boot") || $("boot").classList.contains("hide")) return;
    i = (i + 1) % BOOT_LINES.length;
    node.textContent = BOOT_LINES[i];
  }, 1400);
}

function hideBoot() {
  const boot = $("boot");
  if (!boot || boot.classList.contains("hide")) return;
  boot.classList.add("hide");
  setTimeout(() => boot.remove(), 400);
}

async function enterApp() {
  await load();
  hideLogin();
  hideBoot();
}

syncMute();
syncDock();
applyTheme("nexus");
rollAvatar();
spinBootLine();
document.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
const sessionTimer = setTimeout(() => {
  hideBoot();
    showLogin();
  const status = $("login-status");
  if (status) {
    status.className = "status bad";
    status.textContent = "La guarida no responde. Cierra wi-mod y ábrelo otra vez.";
  }
}, 12000);
api("/api/session")
  .then((session) => {
    clearTimeout(sessionTimer);
    if (session.username) {
      setDockName(session.username);
      return enterApp();
    }
    dropSession();
    showLogin();
    hideBoot();
  })
  .catch((error) => {
    clearTimeout(sessionTimer);
    hideBoot();
    showLogin();
    const status = $("login-status");
    if (status) {
      status.className = "status bad";
      status.textContent = error.message || "No se pudo abrir la guarida.";
    }
  });
