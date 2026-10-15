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
  detected: null,
  manual: false,
  packMode: "export",
  muted: localStorage.getItem("wi-mod-mute") === "1",
  lang: localStorage.getItem("wi-mod-lang") === "en" ? "en" : "es",
  showEs: localStorage.getItem("wi-mod-lang") !== "en",
  theme: "nexus",
};

function displaySummary(mod) {
  if (state.showEs && mod.summaryEs) return mod.summaryEs;
  return mod.summary || "Sin descripción";
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

function fmtCount(value) {
  const n = Number(value) || 0;
  return n.toLocaleString("es");
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
  const token = localStorage.getItem("wi-mod-session") || "";
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
  if (data.language === "en" || data.language === "es") applyLang(data.language);
  if (data.theme) applyTheme(data.theme);
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
  const now = new Date();
  const locale = state.lang === "en" ? "en" : "es";
  const time = $("dock-time");
  const date = $("dock-date");
  if (time) time.textContent = now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  if (date) {
    const text = now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    date.textContent = text.charAt(0).toUpperCase() + text.slice(1);
  }
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
  nameNode.textContent = gameLabel(state.game);
  const cover = gameCover(state.game);
  if (imgNode) {
    if (cover) {
      imgNode.src = cover;
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
    const img = gameCover(id);
    return `<button type="button" role="option" data-game="${esc(id)}" class="${id === state.game ? "on" : ""}">
      ${img ? `<img alt="" src="${esc(img)}" loading="lazy">` : `<img alt="" hidden>`}
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
}

let heroResolveToken = 0;

async function enrichActiveGame() {
  const domain = state.game;
  if (!domain) return;
  const current = catalogGame(domain);
  if (current?.imageUrl && current?.description) {
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
  if (cover) node.style.backgroundImage = `url("${cover.replace(/"/g, "%22")}")`;
  else node.style.backgroundImage = "";
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
  if (!cat) return "";
  if (cat.imageUrl) return `<img class="pc-ico" alt="" src="${esc(cat.imageUrl)}">`;
  return `<span>${esc(cat.emoji || "📦")}</span>`;
}

function packLabel(mod) {
  const pack = packById(mod.modpackId);
  if (!pack) return mod.modpack || "";
  const cat = packCatById(pack, mod.modpackCategoryId);
  if (!cat) return pack.name;
  const mark = cat.emoji || "📦";
  return `${pack.name} · ${mark} ${cat.name}`;
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
    const blob = `${mod.name} ${mod.author} ${mod.gameName} ${mod.category} ${mod.platform} ${packLabel(mod)} ${mod.summary} ${mod.summaryEs || ""} ${mod.techNotes || ""} ${mod.compatNotes || ""} ${mod.notes || ""}`.toLowerCase();
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

  const platformMap = counts((mod) => mod.platform || "Nexus");
  (state.catalog.platforms || []).forEach((name) => {
    if (!platformMap.some((row) => row.id === name)) {
      platformMap.push({ id: name, label: name, count: 0 });
    }
  });
  platformMap.sort((a, b) => a.label.localeCompare(b.label, "es"));
  $("platforms").innerHTML = chip("Todas", "", state.platform, "platform") + platformMap.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.platform, "platform")
  )).join("");

  const gamePacks = packsForGame();
  const packChips = gamePacks.map((pack) => {
    const n = scopedMods().filter((mod) => mod.modpackId === pack.id).length;
    return chip(`${pack.name} (${n})`, pack.id, state.modpack, "modpack");
  });
  $("modpacks").innerHTML = chip("Todos", "", state.modpack, "modpack") + packChips.join("");

  const cats = counts((mod) => mod.category || "General");
  (state.catalog.categories || []).forEach((name) => {
    if (!cats.some((row) => row.id === name)) cats.push({ id: name, label: name, count: 0 });
  });
  cats.sort((a, b) => a.label.localeCompare(b.label, "es"));
  $("categories").innerHTML = chip("Todas", "", state.category, "category") + cats.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.category, "category")
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
    };
  });
  document.querySelectorAll(".side-add").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      sideAdd(button.dataset.add);
    };
  });
}

async function addCatalogName(kind, title, placeholder) {
  const name = await askInput({ title, placeholder, okLabel: "Añadir" });
  if (!name) return;
  try {
    await api("/api/catalog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, name }),
    });
    toast("Añadido.");
    await load();
  } catch (error) {
    toast(error.message, "bad");
  }
}

async function sideAdd(kind) {
  sfx.click();
  if (kind === "modpack") {
    openModpacksDialog();
    return;
  }
  if (kind === "platform") {
    await addCatalogName("platform", "Plataforma", "Nexus, Steam…");
    return;
  }
  if (kind === "game") {
    const options = gameOptionsForPacks();
    const picked = await askInput({
      title: "Juego",
      hint: "Elige uno de la lista.",
      mode: "select",
      options,
      okLabel: "Añadir",
    });
    if (!picked) return;
    const hit = options.find(([id]) => id === picked);
    if (!hit) return;
    try {
      await api("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "game", gameDomain: hit[0], gameName: hit[1] }),
      });
      toast(`${hit[1]} añadido.`);
      await load();
    } catch (error) {
      toast(error.message, "bad");
    }
    return;
  }
  if (kind === "category") {
    await addCatalogName("category", "Categoría Nexus", "Overhauls, Patches…");
  }
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
    `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(name)}</option>`
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
  if (!select) return;
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
  const current = preferred || node.value || "Nexus";
  const options = [...PLATFORMS];
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
      `<option value="${esc(cat.id)}" ${cat.id === catId ? "selected" : ""}>${esc(cat.emoji || "📦")} ${esc(cat.name)}</option>`
    )).join("");
  }
  packNode.onchange = () => {
    fillModpackSelects(packNode, catNode, packNode.value, "", gameDomain);
  };
}

const PACK_EMOJIS = ["📦", "🔧", "✨", "🎨", "⚔️", "💡", "🧩", "⚠️", "📝", "🏠", "🌲", "🔊", "🧊", "🔥"];

function bindEmojiPicks(box, input, current) {
  if (!box || !input) return;
  const value = current || input.value || "";
  if (value && !input.value) input.value = value;
  box.innerHTML = PACK_EMOJIS.map((emoji) => (
    `<button type="button" class="${emoji === input.value ? "on" : ""}" data-emoji="${esc(emoji)}">${emoji}</button>`
  )).join("");
  box.querySelectorAll("[data-emoji]").forEach((button) => {
    button.onclick = () => {
      input.value = button.dataset.emoji === input.value ? "" : button.dataset.emoji;
      box.querySelectorAll("button").forEach((node) => {
        node.classList.toggle("on", node.dataset.emoji === input.value);
      });
    };
  });
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
  $("pc-edit-id").value = cat ? cat.id : "";
  $("pc-name").value = cat ? cat.name : "";
  $("pc-emoji").value = cat ? (cat.emoji || "📦") : "📦";
  $("pc-image").value = cat ? (cat.imageUrl || "") : "";
  $("pc-notes").value = cat ? (cat.notes || "") : "";
  const del = $("pc-delete");
  del.hidden = !cat;
  del.onclick = () => deletePackCat(pack.id, cat?.id);
  $("pc-emoji-picks").innerHTML = PACK_EMOJIS.map((emoji) => (
    `<button type="button" class="${emoji === $("pc-emoji").value ? "on" : ""}" data-emoji="${esc(emoji)}">${emoji}</button>`
  )).join("");
  $("pc-emoji-picks").querySelectorAll("[data-emoji]").forEach((button) => {
    button.onclick = () => {
      $("pc-emoji").value = button.dataset.emoji;
      $("pc-emoji-picks").querySelectorAll("button").forEach((node) => {
        node.classList.toggle("on", node.dataset.emoji === button.dataset.emoji);
      });
    };
  });
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
  const packId = state.modpack;
  if (!packId) {
    toast("Elige un modpack primero.", "warn");
    return;
  }
  const body = {
    name: ($("pc-name").value || "").trim(),
    emoji: ($("pc-emoji").value || "📦").trim() || "📦",
    imageUrl: ($("pc-image").value || "").trim(),
    notes: $("pc-notes").value || "",
  };
  if (!body.name) {
    toast("Pon un nombre.", "warn");
    return;
  }
  const editId = $("pc-edit-id").value;
  const button = event.submitter || $("packcat-form").querySelector('button[type="submit"]');
  setLoading(button, true, "Guardando");
  try {
    if (editId) {
      await api(`/api/modpacks/${packId}/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Categoría actualizada.");
    } else {
      await api(`/api/modpacks/${packId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Categoría creada.");
    }
    $("packcat-dialog").close();
    await load();
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

function setCardSize(size) {
  state.cardSize = size === "sm" || size === "lg" ? size : "md";
  localStorage.setItem("wi-mod-size", state.cardSize);
  sfx.click();
  syncViewToggle();
}

function render() {
  renderFilters();
  renderGameHero();
  syncViewToggle();
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
        <p class="meta">${esc(mod.platform || "Nexus")}${packLabel(mod) ? ` · ${esc(packLabel(mod))}` : ""} · ${esc(mod.category || "General")} · v${esc(mod.version || "?")}</p>
        <p class="sub">${esc(displaySummary(mod))}${mod.summaryEs ? ` <span class="meta">${state.showEs ? "ES" : "EN"}</span>` : ""}</p>
      </div>
      <footer>
        <label class="check"><input type="checkbox" data-check="${mod.id}" ${state.selected.has(mod.id) ? "checked" : ""}> incluir</label>
        <span class="meta">${esc(fmtDate(mod.updatedAt))}</span>
      </footer>
    </article>
  `).join("");
  document.querySelectorAll(".card").forEach((card) => {
    card.onclick = () => { sfx.open(); openDetail(card.dataset.id); };
  });
  document.querySelectorAll("[data-check]").forEach((box) => {
    box.onclick = (event) => {
      event.stopPropagation();
      if (box.checked) state.selected.add(box.dataset.check);
      else state.selected.delete(box.dataset.check);
      sfx.soft();
      render();
    };
  });
}

function fillPreview(mod) {
  $("preview").hidden = false;
  $("preview").innerHTML = `
    <img alt="" src="${esc(mod.pictureUrl || "")}">
    <div>
      <h3>${esc(mod.name)}</h3>
      <p>${esc(mod.gameName)} · ${esc(mod.category)} · v${esc(mod.version || "?")}<br>
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
  status.textContent = isNexusUrl($("add-url").value) ? "Olfateando Nexus…" : "Leyendo la página oficial…";
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
  const checked = mod.checkedAt || mod.fetchedAt;
  const summaryText = displaySummary(mod);
  $("detail").innerHTML = `
    <header>
      <h2>${esc(mod.name)}</h2>
      <button class="icon" type="button" id="detail-close">✕</button>
    </header>
    <div class="row" style="align-items:stretch">
      ${image ? `<img class="hero" alt="" src="${esc(image)}" style="width:42%;flex:0 0 42%">` : ""}
      <div style="flex:1;display:grid;gap:4px;align-content:start">
        <p class="hint">${esc(mod.gameName || "")} · ${esc(mod.author || "?")}</p>
        <p class="meta">${esc(mod.platform || "Nexus")} · ${esc(mod.category || "General")} · v${esc(mod.version || "?")} · ${esc(fmtDate(mod.updatedAt))}</p>
        <p class="meta">👍 ${esc(fmtCount(mod.endorsements))} · ↓ ${esc(fmtCount(mod.downloads))} · únicos ${esc(fmtCount(mod.uniqueDownloads))}</p>
        <p class="row" style="gap:10px">
          ${mod.nexusUrl ? `<a href="${esc(mod.nexusUrl)}" target="_blank" rel="noreferrer">${esc(mod.platform || "Nexus")}</a>` : ""}
          ${mod.platform === "Nexus" && (mod.filesUrl || mod.nexusUrl) ? `<a href="${esc(mod.filesUrl || (mod.nexusUrl + "?tab=files"))}" target="_blank" rel="noreferrer">Files</a>` : ""}
        </p>
      </div>
    </div>
    <div class="row" style="justify-content:space-between">
      <p class="meta">${mod.summaryEs ? (state.showEs ? "ES" : "EN") : ""}</p>
      <span class="row">
        ${mod.summaryEs ? `<button class="ghost" type="button" id="detail-lang">${state.showEs ? "Original" : "Español"}</button>` : ""}
        <button class="ghost" type="button" id="detail-translate">${mod.summaryEs ? "Retraducir" : "Traducir"}</button>
      </span>
    </div>
    <p class="summary" id="detail-summary" title="${esc(mod.summary || "")}">${esc(summaryText || "Sin descripción.")}</p>
    <div class="row">
      <label style="flex:1">Modpack<select id="detail-modpack"></select></label>
      <label style="flex:1">Categoría<select id="detail-pack-cat"></select></label>
    </div>
    <p class="hint">${mod.platform === "Independiente" ? "Página oficial. Plataforma independiente." : "Ficha informativa. El archivo no se guarda aquí."}</p>
    <footer>
      <button class="danger" type="button" id="detail-delete">Eliminar</button>
      <span class="row">
        <button class="ghost refresh-btn" type="button" id="detail-refresh">
          Buscar act.
          <small>Última: ${esc(fmtWhen(checked))}</small>
        </button>
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
  $("detail-save").onclick = () => saveDetail(mod.id);
  $("detail-refresh").onclick = () => refreshOne(mod.id);
  $("detail-delete").onclick = () => removeMod(mod.id);
  $("detail-translate").onclick = () => translateMod(mod.id);
  const langBtn = $("detail-lang");
  if (langBtn) {
    langBtn.onclick = () => {
      state.showEs = !state.showEs;
      localStorage.setItem("wi-mod-show-es", state.showEs ? "1" : "0");
      sfx.click();
      openDetail(mod.id);
      render();
    };
  }
}

async function translateMod(id) {
  const button = $("detail-translate");
  setLoading(button, true, "Traduciendo");
  sfx.sniff();
  try {
    const data = await api(`/api/mods/${id}/translate`, { method: "POST" });
    state.showEs = true;
    localStorage.setItem("wi-mod-show-es", "1");
    toast("Descripción traducida al español.");
    await load();
    openDetail(id);
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
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

async function openSettings() {
  try {
    const data = await api("/api/settings");
    const who = data.profile && data.profile.name ? ` · ${data.profile.name}` : "";
    $("settings-status").textContent = data.hasKey ? `Nexus: ${data.hint}${who}` : "Nexus: sin clave.";
    $("settings-status").className = "status";
    $("rawg-status").textContent = data.hasRawgKey ? `RAWG: ${data.rawgHint}` : "RAWG: sin clave.";
    if (data.language) applyLang(data.language);
  } catch (error) {
    $("settings-status").textContent = error.message;
  }
  $("api-key").value = "";
  $("rawg-key").value = "";
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
$("add-url").oninput = () => syncAddSource();
$("detect").onclick = detect;
$("manual-toggle").onclick = () => {
  state.manual = true;
  state.detected = null;
  $("manual").hidden = false;
  sfx.click();
};
$("add-form").onsubmit = saveMod;
$("dup-form").onsubmit = (event) => event.preventDefault();
$("settings-open").onclick = () => { sfx.open(); openSettings(); };
$("settings-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  setLoading(button, true, "Guardando");
  try {
    const body = {};
    const nexus = ($("api-key").value || "").trim();
    const rawg = ($("rawg-key").value || "").trim();
    const lang = document.querySelector('input[name="language"]:checked')?.value || "es";
    const theme = document.querySelector('input[name="theme"]:checked')?.value || state.theme || "nexus";
    body.language = lang;
    body.theme = theme;
    if (nexus) body.apiKey = nexus;
    if (rawg) body.rawgApiKey = rawg;
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
    $("api-key").value = "";
    $("rawg-key").value = "";
    applyLang(data.language || lang);
    applyTheme(data.theme || theme);
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
});
$("game-form").onsubmit = (event) => event.preventDefault();
$("game-search").oninput = (event) => {
  clearTimeout(gameSearchTimer);
  gameSearchTimer = setTimeout(() => searchRawgGames(event.target.value), 320);
};
$("search").oninput = (event) => { state.query = event.target.value; render(); };
$("sort").onchange = (event) => { state.sort = event.target.value; sfx.click(); render(); };
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

function resetModpackForm() {
  $("mp-edit-id").value = "";
  $("mp-name").value = "";
  $("mp-notes").value = "";
  $("mp-save").textContent = "Guardar modpack";
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
  const button = $("mp-save");
  setLoading(button, true, "Guardando");
  try {
    if (editId) {
      await api(`/api/modpacks/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Modpack actualizado.");
    } else {
      await api("/api/modpacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast("Modpack creado.");
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

function showLogin() {
  const box = $("login");
  if (!box) return;
  box.hidden = false;
  $("login-status").textContent = "";
  $("login-status").className = "status";
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
    const data = await api(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (data.token) localStorage.setItem("wi-mod-session", data.token);
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
  const token = localStorage.getItem("wi-mod-session") || "";
  try {
    await api("/api/logout", { method: "POST" });
  } catch (_) { /* sigue el cierre local */ }
  localStorage.removeItem("wi-mod-session");
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
setInterval(syncDock, 1000);
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
