const state = {
  mods: [],
  platform: "",
  game: "",
  category: "",
  files: "all",
  sort: "added",
  query: "",
  selected: new Set(),
  detected: null,
  manual: false,
  muted: localStorage.getItem("wi-mod-mute") === "1",
  showEs: localStorage.getItem("wi-mod-show-es") !== "0",
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
  const res = await fetch(path, options);
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "No se pudo completar.");
    return data;
  }
  if (!res.ok) throw new Error("No se pudo completar.");
  return res;
}

async function load() {
  const data = await api("/api/library");
  state.mods = data.mods || [];
  const alive = new Set(state.mods.map((mod) => mod.id));
  state.selected.forEach((id) => { if (!alive.has(id)) state.selected.delete(id); });
  render();
}

function visible() {
  const q = state.query.trim().toLowerCase();
  let mods = state.mods.filter((mod) => {
    if (state.platform && String(mod.platform || "Nexus") !== state.platform) return false;
    if (state.game && String(mod.gameDomain || "") !== state.game) return false;
    if (state.category && String(mod.category || "General") !== state.category) return false;
    const hasFiles = (mod.files || []).length > 0;
    if (state.files === "with" && !hasFiles) return false;
    if (state.files === "without" && hasFiles) return false;
    if (!q) return true;
    const blob = `${mod.name} ${mod.author} ${mod.gameName} ${mod.category} ${mod.platform} ${mod.summary} ${mod.summaryEs || ""}`.toLowerCase();
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
  state.game = "";
  state.category = "";
  state.files = "all";
  state.query = "";
  if ($("search")) $("search").value = "";
}

function counts(key) {
  const map = new Map();
  state.mods.forEach((mod) => {
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
  const platforms = counts((mod) => mod.platform || "Nexus");
  $("platforms").innerHTML = chip("Todas", "", state.platform, "platform") + platforms.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.platform, "platform")
  )).join("");
  const games = counts(gameKey).filter((row) => row.id);
  $("games").innerHTML = chip("Todos", "", state.game, "game") + games.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.game, "game")
  )).join("");
  const cats = counts((mod) => mod.category || "General");
  $("categories").innerHTML = chip("Todas", "", state.category, "category") + cats.map((row) => (
    chip(`${row.label} (${row.count})`, row.id, state.category, "category")
  )).join("");
  const fileRows = [["Todos", "all"], ["Con descarga", "with"], ["Sin descarga", "without"]];
  $("file-filters").innerHTML = fileRows.map(([label, id]) => chip(label, id, state.files, "files")).join("");
  $("category-list").innerHTML = cats.map((row) => `<option value="${esc(row.label)}"></option>`).join("");
  document.querySelectorAll(".side button").forEach((button) => {
    button.onclick = () => {
      const kind = button.dataset.kind;
      const raw = button.getAttribute("data-value");
      state[kind] = raw == null ? "" : decodeURIComponent(raw);
      sfx.click();
      render();
    };
  });
}

function chip(label, value, current, kind) {
  const on = String(value) === String(current) ? "on" : "";
  return `<button type="button" class="${on}" data-kind="${kind}" data-value="${encodeURIComponent(value)}">${esc(label)}</button>`;
}

function shot(mod) {
  if (mod.pictureFile) return `style="background-image:url('/media/${encodeURI(mod.pictureFile)}')"`;
  if (mod.pictureUrl) return `style="background-image:url('${esc(mod.pictureUrl)}')"`;
  return "";
}

function render() {
  renderFilters();
  const mods = visible();
  const selected = mods.filter((mod) => state.selected.has(mod.id)).length;
  $("count").textContent = selected
    ? `${mods.length} mods · ${selected} marcados`
    : `${mods.length} mods`;
  if (!mods.length) {
    if (state.mods.length) {
      $("grid").innerHTML = `<p class="empty">Hay ${state.mods.length} mod(s) ocultos por el filtro. <button type="button" class="ghost" id="clear-filters">Quitar filtros</button></p>`;
      $("clear-filters").onclick = () => { clearFilters(); render(); };
    } else {
      $("grid").innerHTML = `<p class="empty">Pega un enlace de Nexus con Añadir mod. La ficha trae imagen, resumen, categoría, versión y última actualización.</p>`;
    }
    return;
  }
  $("grid").innerHTML = mods.map((mod, index) => `
    <article class="card ${state.selected.has(mod.id) ? "on" : ""}" data-id="${mod.id}" style="animation-delay:${Math.min(index, 10) * 35}ms">
      <div class="shot" ${shot(mod)}><span>${esc(mod.gameName || mod.gameDomain || "Juego")}</span></div>
      <h3>${esc(mod.name)}</h3>
      <p class="meta">${esc(mod.platform || "Nexus")} · ${esc(mod.category || "General")} · v${esc(mod.version || "?")}</p>
      <p class="sub">${esc(displaySummary(mod))}${mod.summaryEs ? ` <span class="meta">${state.showEs ? "ES" : "EN"}</span>` : ""}</p>
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
  $("add-category").value = mod.category || "";
}

async function detect() {
  const button = $("detect");
  const status = $("add-status");
  status.className = "status";
  status.textContent = "Olfateando Nexus…";
  setLoading(button, true, "Detectando");
  sfx.sniff();
  try {
    state.detected = await api("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: $("add-url").value }),
    });
    state.manual = false;
    $("manual").hidden = true;
    fillPreview(state.detected);
    status.textContent = state.detected.duplicate
      ? "Ya estaba en la guarida. Al guardar se actualiza la ficha."
      : "Presa detectada.";
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

async function saveMod(event) {
  event.preventDefault();
  const button = $("add-save");
  const status = $("add-status");
  status.className = "status";
  status.textContent = "Guardando en la guarida…";
  setLoading(button, true, "Guardando");
  const body = {
    url: $("add-url").value,
    platform: $("add-platform").value || "Nexus",
    category: $("add-category").value,
    notes: $("add-notes").value,
  };
  if (!state.detected) {
    body.manual = {
      name: $("manual-name").value,
      gameName: $("manual-game").value,
      author: $("manual-author").value,
      version: $("manual-version").value,
      summary: $("manual-summary").value,
      category: $("add-category").value,
      platform: $("add-platform").value || "Nexus",
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
    toast("Mod guardado.");
    await load();
    if (saved.mod && saved.mod.id) openDetail(saved.mod.id);
  } catch (error) {
    status.className = "status bad";
    status.textContent = error.message;
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

function depList(items, kind) {
  const rows = (items || []).map((dep, index) => `
    <div class="file dep-row" data-kind="${kind}" data-index="${index}">
      <a href="${esc(dep.nexusUrl || "#")}" target="_blank" rel="noreferrer">${esc(dep.name || "Mod")}</a>
      <button class="danger" type="button" data-dep-drop="${kind}:${index}">Quitar</button>
    </div>`).join("");
  return rows || `<p class="hint">Ninguna todavía.</p>`;
}

function openDetail(id) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  const image = mod.pictureFile
    ? `/media/${encodeURI(mod.pictureFile)}`
    : (mod.pictureUrl || "");
  const checked = mod.checkedAt || mod.fetchedAt;
  const summaryText = displaySummary(mod);
  const downloaded = (mod.files || []).length
    ? `<p class="meta">Descarga local: ${esc((mod.files[0] || {}).name || "archivo")} · ${esc(fmtSize((mod.files[0] || {}).size))}</p>`
    : "";
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
          ${mod.nexusUrl ? `<a href="${esc(mod.nexusUrl)}" target="_blank" rel="noreferrer">Nexus</a>` : ""}
          ${mod.filesUrl || mod.nexusUrl ? `<a href="${esc(mod.filesUrl || (mod.nexusUrl + "?tab=files"))}" target="_blank" rel="noreferrer">Files</a>` : ""}
        </p>
      </div>
    </div>
    <div class="row" style="justify-content:space-between">
      <p class="meta">${mod.summaryEs ? (state.showEs ? "Mostrando español" : "Mostrando original") : "Sin traducción guardada"}</p>
      <span class="row">
        ${mod.summaryEs ? `<button class="ghost" type="button" id="detail-lang">${state.showEs ? "Ver original" : "Ver español"}</button>` : ""}
        <button class="ghost" type="button" id="detail-translate">${mod.summaryEs ? "Retraducir" : "Traducir ficha"}</button>
      </span>
    </div>
    <p class="summary" id="detail-summary" title="${esc(mod.summary || "")}">${esc(summaryText || "Sin descripción.")}</p>
    <div class="row">
      <label style="flex:1">Plataforma<input id="detail-platform" value="${esc(mod.platform || "Nexus")}" list="platform-list"></label>
      <label style="flex:1">Categoría<input id="detail-category" value="${esc(mod.category || "")}" list="category-list"></label>
    </div>
    <label>Notas<textarea id="detail-notes" rows="2">${esc(mod.notes || "")}</textarea></label>
    <div class="deps">
      <p class="meta"><b>Requeridas</b></p>
      <div class="files" id="deps-required">${depList(mod.depsRequired, "required")}</div>
      <p class="meta"><b>Opcionales</b></p>
      <div class="files" id="deps-optional">${depList(mod.depsOptional, "optional")}</div>
      <div class="row">
        <input id="dep-url" type="url" placeholder="https://www.nexusmods.com/.../mods/123" style="flex:1">
        <select id="dep-kind">
          <option value="required">Requerida</option>
          <option value="optional" selected>Opcional</option>
        </select>
        <button class="ghost" type="button" id="dep-add">Añadir</button>
      </div>
    </div>
    ${downloaded}
    <footer>
      <button class="danger" type="button" id="detail-delete">Eliminar</button>
      <span class="row">
        <button class="ghost" type="button" id="detail-download">Descargar</button>
        <button class="ghost refresh-btn" type="button" id="detail-refresh">
          Buscar act.
          <small>Última: ${esc(fmtWhen(checked))}</small>
        </button>
        <button class="solid" type="button" id="detail-save">Guardar</button>
      </span>
    </footer>`;
  $("detail-dialog").showModal();
  $("detail-close").onclick = () => $("detail-dialog").close();
  $("detail-save").onclick = () => saveDetail(mod.id);
  $("detail-refresh").onclick = () => refreshOne(mod.id);
  $("detail-download").onclick = () => downloadMod(mod.id);
  $("detail-delete").onclick = () => removeMod(mod.id);
  $("detail-translate").onclick = () => translateMod(mod.id);
  $("dep-add").onclick = () => addDependency(mod.id);
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
  document.querySelectorAll("[data-dep-drop]").forEach((button) => {
    button.onclick = () => removeDependency(mod.id, button.dataset.depDrop);
  });
}

async function addDependency(id) {
  const url = ($("dep-url").value || "").trim();
  const kind = $("dep-kind").value === "required" ? "required" : "optional";
  if (!url) {
    toast("Pega el enlace del mod dependiente.", "warn");
    return;
  }
  const match = url.match(/nexusmods\.com\/([A-Za-z0-9_-]+)\/mods\/(\d+)/i);
  if (!match) {
    toast("Ese enlace no parece de Nexus.", "bad");
    return;
  }
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  const key = kind === "required" ? "depsRequired" : "depsOptional";
  const list = [...(mod[key] || [])];
  const item = {
    name: `${match[1]} #${match[2]}`,
    gameDomain: match[1].toLowerCase(),
    modId: Number(match[2]),
    nexusUrl: `https://www.nexusmods.com/${match[1].toLowerCase()}/mods/${match[2]}`,
    kind,
    source: "user",
  };
  if (list.some((dep) => dep.gameDomain === item.gameDomain && dep.modId === item.modId)) {
    toast("Esa dependencia ya está.", "warn");
    return;
  }
  list.push(item);
  await api(`/api/mods/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: list }),
  });
  toast("Dependencia añadida.");
  await load();
  openDetail(id);
}

async function removeDependency(id, stamp) {
  const [kind, indexText] = String(stamp || "").split(":");
  const index = Number(indexText);
  const mod = state.mods.find((item) => item.id === id);
  if (!mod || Number.isNaN(index)) return;
  const key = kind === "required" ? "depsRequired" : "depsOptional";
  const list = [...(mod[key] || [])];
  list.splice(index, 1);
  await api(`/api/mods/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [key]: list }),
  });
  await load();
  openDetail(id);
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
        platform: $("detail-platform").value || "Nexus",
        category: $("detail-category").value,
        notes: $("detail-notes").value,
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
      toast(`Sin actualización nueva. Revisado: ${fmtWhen(check.checkedAt)}`);
      openDetail(id);
      return;
    }
    sfx.warn();
    const remote = check.remote || {};
    const local = check.local || {};
    const ok = confirm(
      `Hay una versión nueva en Nexus.\n\n` +
      `Local: v${local.version || "?"} (${fmtDate(local.updatedAt)})\n` +
      `Nexus: v${remote.version || "?"} (${fmtDate(remote.updatedAt)})\n\n` +
      `¿Actualizar la ficha?\n` +
      `Ojo: una versión nueva puede romper tu lista o el juego. Si tu pack funciona, puedes dejarla.`
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
  if (!confirm("¿Eliminar este mod y sus archivos guardados?")) return;
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
    $("settings-status").textContent = data.hasKey ? `Clave guardada ${data.hint}${who}` : "Sin clave.";
    $("settings-status").className = "status";
  } catch (error) {
    $("settings-status").textContent = error.message;
  }
  $("api-key").value = "";
  $("settings-dialog").showModal();
}

function resetAdd() {
  $("add-form").reset();
  $("preview").hidden = true;
  $("manual").hidden = true;
  $("add-status").textContent = "";
  state.detected = null;
  state.manual = false;
}

document.querySelectorAll("[data-close]").forEach((button) => {
  button.onclick = () => { sfx.soft(); button.closest("dialog").close(); };
});
$("mute").onclick = () => {
  state.muted = !state.muted;
  localStorage.setItem("wi-mod-mute", state.muted ? "1" : "0");
  syncMute();
  if (!state.muted) sfx.click();
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
$("detect").onclick = detect;
$("manual-toggle").onclick = () => {
  state.manual = true;
  state.detected = null;
  $("manual").hidden = false;
  sfx.click();
};
$("add-form").onsubmit = saveMod;
$("settings-open").onclick = () => { sfx.open(); openSettings(); };
$("settings-form").onsubmit = async (event) => {
  event.preventDefault();
  const button = event.submitter || event.target.querySelector('button[type="submit"]');
  setLoading(button, true, "Guardando");
  try {
    const data = await api("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: $("api-key").value }),
    });
    $("settings-status").className = "status";
    $("settings-status").textContent = data.profile.name
      ? `Lista. Sesión de ${data.profile.name}.`
      : "Clave guardada.";
    $("api-key").value = "";
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
  $("settings-status").textContent = "Clave quitada.";
  toast("Clave quitada.", "warn");
};
$("search").oninput = (event) => { state.query = event.target.value; render(); };
$("sort").onchange = (event) => { state.sort = event.target.value; sfx.click(); render(); };
$("export").onclick = exportZip;
$("import").onclick = () => { sfx.click(); $("import-file").click(); };
$("import-file").onchange = async () => {
  const file = $("import-file").files[0];
  $("import-file").value = "";
  if (!file) return;
  const button = $("import");
  setLoading(button, true, "Restaurando");
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/api/import", { method: "POST", body: form });
    toast(`Restaurado: ${data.result.added} nuevos, ${data.result.updated} actualizados.`);
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};
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

async function exportZip() {
  const ids = [...state.selected];
  if (!ids.length && !confirm("No hay mods marcados. ¿Comprimir toda la biblioteca?")) return;
  const button = $("export");
  setLoading(button, true, "Comprimiendo");
  sfx.sniff();
  try {
    const res = await api("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ids.length ? ids : null }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "wi-mod.zip";
    link.click();
    URL.revokeObjectURL(url);
    toast("Paquete listo.");
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

syncMute();
document.addEventListener("pointerdown", () => sfx.unlock(), { once: true });
load()
  .then(() => {
    const boot = $("boot");
    if (boot) {
      setTimeout(() => boot.classList.add("hide"), 420);
      setTimeout(() => boot.remove(), 900);
    }
  })
  .catch((error) => {
    toast(error.message, "bad");
    $("boot")?.classList.add("hide");
  });
