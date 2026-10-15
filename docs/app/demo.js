/* Prueba web: biblioteca en este navegador. 20 mods y 10 juegos. */
(function () {
  const MODS = 20;
  const GAMES = 10;
  const KEY = "wi-mod-demo-v1";
  const DESKTOP = "La versión de escritorio no tiene este límite.";
  const NEXUS = ["Nexus", "Independiente"];
  const SOURCES = {
    minecraft: ["Modrinth", "CurseForge", "Independiente"],
    skyrimspecialedition: NEXUS,
    skyrim: NEXUS,
    skyrimvr: NEXUS,
    enderal: NEXUS,
    darksoulsremastered: NEXUS,
    darksouls3: NEXUS,
    darksouls2: NEXUS,
    darksouls: NEXUS,
    eldenring: NEXUS,
    stardewvalley: NEXUS,
    fallout4: NEXUS,
    newvegas: NEXUS,
    witcher3: NEXUS,
    cyberpunk2077: NEXUS,
    baldursgate3: NEXUS,
    monsterhunterworld: NEXUS,
    hollowknight: NEXUS,
    worldofwarcraft: ["CurseForge", "Independiente"],
    wow: ["CurseForge", "Independiente"],
  };
  const CATALOG = [
    ["minecraft", "Minecraft", "2011"],
    ["skyrimspecialedition", "Skyrim Special Edition", "2016"],
    ["skyrim", "Skyrim", "2011"],
    ["stardewvalley", "Stardew Valley", "2016"],
    ["darksoulsremastered", "Dark Souls Remastered", "2018"],
    ["worldofwarcraft", "World of Warcraft", "2004"],
    ["fallout4", "Fallout 4", "2015"],
    ["newvegas", "Fallout: New Vegas", "2010"],
    ["witcher3", "The Witcher 3", "2015"],
    ["cyberpunk2077", "Cyberpunk 2077", "2020"],
    ["baldursgate3", "Baldur's Gate 3", "2023"],
    ["eldenring", "Elden Ring", "2022"],
    ["hollowknight", "Hollow Knight", "2017"],
    ["monsterhunterworld", "Monster Hunter: World", "2018"],
    ["darksouls3", "Dark Souls III", "2016"],
  ].map(([gameDomain, gameName, released], index) => ({
    rawgId: index + 1,
    gameDomain,
    gameName,
    released,
    imageUrl: "",
    platforms: [],
  }));

  function id() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((n) => n.toString(16).padStart(2, "0")).join("");
  }

  function empty() {
    return {
      mods: [],
      modpacks: [],
      games: [],
      categories: ["General"],
      language: "es",
      theme: "nexus",
    };
  }

  function db() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "");
      if (saved && Array.isArray(saved.mods) && Array.isArray(saved.games)) return saved;
    } catch (_) { /* vacío */ }
    return empty();
  }

  function save(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    paintBar(data);
  }

  function platformsFor(domain) {
    const key = String(domain || "").trim().toLowerCase();
    if (SOURCES[key]) return SOURCES[key];
    if (key.startsWith("minecraft")) return SOURCES.minecraft;
    if (key === "wow" || key.startsWith("worldofwarcraft")) return SOURCES.worldofwarcraft;
    return NEXUS;
  }

  function platformOf(url) {
    const text = String(url || "").toLowerCase();
    if (/nexusmods\.com\/[^/]+\/mods\/\d+/.test(text)) return "Nexus";
    if (text.includes("modrinth.com")) return "Modrinth";
    if (text.includes("curseforge.com")) return "CurseForge";
    if (text.includes("steamcommunity.com") && /workshop|sharedfiles|filedetails/.test(text)) return "Steam Workshop";
    if (text.trim()) return "Independiente";
    return "Nexus";
  }

  function library(data) {
    return {
      mods: data.mods,
      modpacks: data.modpacks,
      catalog: {
        platforms: ["Nexus", "Modrinth", "CurseForge", "Steam Workshop", "Independiente"],
        games: data.games,
        categories: data.categories,
        skills: [],
        rules: [],
      },
      language: data.language,
      theme: data.theme,
      sources: Object.fromEntries(Object.entries(SOURCES).map(([key, names]) => [key, names.slice()])),
    };
  }

  function blankMod(fields) {
    const stamp = new Date().toISOString();
    return {
      id: id(),
      nexusUrl: "",
      platform: "Nexus",
      gameDomain: "",
      gameName: "",
      modId: null,
      name: "",
      summary: "",
      summaryEs: "",
      author: "",
      category: "General",
      categoryEs: "",
      version: "",
      updatedAt: stamp,
      createdAt: stamp,
      endorsements: 0,
      downloads: 0,
      uniqueDownloads: 0,
      pictureFile: null,
      pictureUrl: "",
      filesUrl: "",
      modpackId: "",
      modpackCategoryId: "",
      modpack: "",
      notes: "",
      files: [],
      addedAt: stamp,
      updateAvailable: false,
      remoteVersion: "",
      ...fields,
    };
  }

  function limitMods() {
    return `La prueba web guarda ${MODS} mods como máximo. ${DESKTOP}`;
  }

  function limitGames() {
    return `La prueba web guarda ${GAMES} juegos como máximo. ${DESKTOP}`;
  }

  function desktopOnly() {
    return `Eso está en la versión de escritorio. ${DESKTOP}`;
  }

  async function readJson(init) {
    if (!init || init.body == null) return {};
    if (typeof init.body === "string") return JSON.parse(init.body || "{}");
    if (typeof init.body.text === "function") return JSON.parse((await init.body.text()) || "{}");
    return {};
  }

  function reply(status, data) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function findMod(data, modId) {
    return data.mods.find((mod) => mod.id === modId) || null;
  }

  function applyMod(mod, body) {
    const manual = body.manual || {};
    const url = String(body.url || mod.nexusUrl || "");
    const platform = String(body.platform || manual.platform || platformOf(url));
    const gameDomain = String(body.gameDomain || manual.gameDomain || mod.gameDomain || "").toLowerCase();
    const allowed = platformsFor(gameDomain);
    if (gameDomain && !allowed.includes(platform)) {
      throw new Error(`Este juego solo acepta mods de ${allowed.join(", ")}.`);
    }
    mod.nexusUrl = url;
    mod.platform = platform;
    mod.gameDomain = gameDomain;
    mod.gameName = String(body.gameName || manual.gameName || mod.gameName || gameDomain);
    mod.name = String(manual.name || body.name || mod.name || "Mod");
    mod.author = String(manual.author || mod.author || "");
    mod.summary = String(manual.summary || mod.summary || "");
    mod.version = String(manual.version || mod.version || "");
    mod.category = String(body.category || manual.category || mod.category || "General");
    mod.pictureUrl = String(manual.pictureUrl || body.pictureUrl || mod.pictureUrl || "");
    if ("notes" in body) mod.notes = String(body.notes || "");
    if ("modpackId" in body) mod.modpackId = String(body.modpackId || "");
    if ("modpackCategoryId" in body) mod.modpackCategoryId = String(body.modpackCategoryId || "");
    const pack = db().modpacks.find((item) => item.id === mod.modpackId);
    mod.modpack = pack ? pack.name : "";
    mod.updatedAt = new Date().toISOString();
    return mod;
  }

  async function searchModrinth(q) {
    const params = new URLSearchParams({ query: q, limit: "8" });
    const res = await fetch(`https://api.modrinth.com/v2/search?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Modrinth no respondió.");
    const payload = await res.json();
    const data = db();
    const kinds = { mod: "mod", modpack: "modpack", resourcepack: "resourcepack", datapack: "datapack", shader: "shader", plugin: "plugin" };
    return (payload.hits || []).map((row) => {
      const kind = kinds[row.project_type] || "mod";
      const url = `https://modrinth.com/${kind}/${row.slug}`;
      const saved = data.mods.find((mod) => mod.nexusUrl === url);
      return {
        platform: "Modrinth",
        name: row.title || row.slug,
        author: row.author || "",
        summary: row.description || "",
        downloads: row.downloads || 0,
        pictureUrl: row.icon_url || "",
        url,
        savedId: saved ? saved.id : "",
      };
    });
  }

  async function route(url, init) {
    const parsed = new URL(url, location.origin);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    const method = String((init && init.method) || "GET").toUpperCase();
    const data = db();

    if (path === "/api/session") {
      return reply(200, { username: "prueba", role: "user", needsPassword: false, admin: "" });
    }
    if (path === "/api/logout" && method === "POST") return reply(200, { ok: true });
    if (path === "/api/library") return reply(200, library(data));
    if (path === "/api/settings" && method === "GET") {
      return reply(200, {
        hasKey: false,
        hint: "",
        hasRawgKey: false,
        rawgHint: "",
        language: data.language,
        theme: data.theme,
        profile: { name: "prueba" },
      });
    }
    if (path === "/api/settings" && (method === "PUT" || method === "POST")) {
      const body = await readJson(init);
      if (body.language) data.language = String(body.language).startsWith("en") ? "en" : "es";
      if (body.theme) data.theme = String(body.theme);
      save(data);
      return reply(200, { ok: true, language: data.language, theme: data.theme });
    }
    if (path === "/api/modrinth/search") {
      const q = parsed.searchParams.get("q") || "";
      try {
        const results = await searchModrinth(q);
        return reply(200, { results, supported: true, platform: "Modrinth" });
      } catch (error) {
        return reply(502, { error: error.message || "Modrinth no respondió." });
      }
    }
    if (path === "/api/nexus/search") {
      return reply(400, { error: `La búsqueda de Nexus es de la versión de escritorio. En la prueba pega el enlace. ${DESKTOP}` });
    }
    if (path === "/api/rawg/search") {
      const q = (parsed.searchParams.get("q") || "").trim().toLowerCase();
      const results = CATALOG.filter((game) => game.gameName.toLowerCase().includes(q) || game.gameDomain.includes(q));
      return reply(200, { results });
    }
    if (path === "/api/rawg/add" && method === "POST") {
      const body = await readJson(init);
      const game = CATALOG.find((item) => String(item.rawgId) === String(body.rawgId));
      if (!game) return reply(404, { error: "Ese juego no está en la prueba." });
      if (!data.games.some((item) => item.gameDomain === game.gameDomain)) {
        if (data.games.length >= GAMES) return reply(400, { error: limitGames() });
        data.games.push({ gameDomain: game.gameDomain, gameName: game.gameName, imageUrl: "" });
        save(data);
      }
      return reply(200, { game, catalog: library(data).catalog });
    }
    if (path === "/api/preview" && method === "POST") {
      const body = await readJson(init);
      const urlValue = String(body.url || "");
      const platform = platformOf(urlValue);
      const saved = data.mods.find((mod) => mod.nexusUrl && mod.nexusUrl === urlValue);
      return reply(200, {
        name: "",
        author: "",
        summary: "",
        version: "",
        platform,
        official: platform !== "Nexus",
        pictureUrl: "",
        duplicate: Boolean(saved),
        existingName: saved ? saved.name : "",
        existingId: saved ? saved.id : "",
      });
    }
    if (path === "/api/mods" && method === "POST") {
      const body = await readJson(init);
      const mode = String(body.mode || "");
      const urlValue = String(body.url || "");
      const existing = data.mods.find((mod) => urlValue && mod.nexusUrl === urlValue);
      if (existing && mode !== "replace" && mode !== "duplicate") {
        return reply(409, {
          error: "Ese mod ya está en la biblioteca.",
          duplicate: true,
          existingId: existing.id,
          existingName: existing.name,
        });
      }
      if (mode === "replace" && existing) {
        try {
          applyMod(existing, body);
        } catch (error) {
          return reply(400, { error: error.message });
        }
        save(data);
        return reply(200, { mod: existing });
      }
      if (data.mods.length >= MODS) return reply(400, { error: limitMods() });
      let mod;
      try {
        mod = applyMod(blankMod({}), body);
      } catch (error) {
        return reply(400, { error: error.message });
      }
      data.mods.unshift(mod);
      if (mod.category && !data.categories.includes(mod.category)) data.categories.push(mod.category);
      save(data);
      return reply(201, { mod });
    }
    if (path === "/api/mods/assign" && method === "POST") {
      const body = await readJson(init);
      const ids = body.ids || [];
      ids.forEach((modId) => {
        const mod = findMod(data, modId);
        if (!mod) return;
        if (body.category) mod.category = body.category;
        if ("modpackId" in body) mod.modpackId = body.modpackId || "";
        if ("modpackCategoryId" in body) mod.modpackCategoryId = body.modpackCategoryId || "";
      });
      save(data);
      return reply(200, { mods: data.mods.filter((mod) => ids.includes(mod.id)), count: ids.length });
    }

    const modMatch = path.match(/^\/api\/mods\/([^/]+)$/);
    if (modMatch && method === "PATCH") {
      const mod = findMod(data, modMatch[1]);
      if (!mod) return reply(404, { error: "Mod no encontrado." });
      const body = await readJson(init);
      if ("notes" in body) mod.notes = String(body.notes || "");
      if ("category" in body) mod.category = String(body.category || "General");
      if ("modpackId" in body) mod.modpackId = String(body.modpackId || "");
      if ("modpackCategoryId" in body) mod.modpackCategoryId = String(body.modpackCategoryId || "");
      const pack = data.modpacks.find((item) => item.id === mod.modpackId);
      mod.modpack = pack ? pack.name : "";
      save(data);
      return reply(200, { mod });
    }
    if (modMatch && method === "DELETE") {
      data.mods = data.mods.filter((mod) => mod.id !== modMatch[1]);
      save(data);
      return reply(200, { ok: true });
    }
    if (/^\/api\/mods\/[^/]+\/(files|refresh)/.test(path)) return reply(400, { error: desktopOnly() });

    if (path === "/api/modpacks" && method === "GET") return reply(200, { modpacks: data.modpacks });
    if (path === "/api/modpacks" && method === "POST") {
      const body = await readJson(init);
      const pack = {
        id: id(),
        name: String(body.name || "Modpack"),
        gameDomain: String(body.gameDomain || ""),
        gameName: String(body.gameName || ""),
        notes: String(body.notes || ""),
        categories: (body.categories || []).map((cat) => ({
          id: id(),
          name: String(cat.name || "General"),
          notes: "",
          imageUrl: "",
        })),
      };
      data.modpacks.push(pack);
      save(data);
      return reply(201, { modpack: pack });
    }
    const packCat = path.match(/^\/api\/modpacks\/([^/]+)\/categories$/);
    if (packCat && method === "POST") {
      const pack = data.modpacks.find((item) => item.id === packCat[1]);
      if (!pack) return reply(404, { error: "Ese modpack no existe." });
      const body = await readJson(init);
      pack.categories.push({ id: id(), name: String(body.name || "General"), notes: "", imageUrl: "" });
      save(data);
      return reply(201, { modpack: pack });
    }
    const packOne = path.match(/^\/api\/modpacks\/([^/]+)$/);
    if (packOne && method === "PATCH") {
      const pack = data.modpacks.find((item) => item.id === packOne[1]);
      if (!pack) return reply(404, { error: "Ese modpack no existe." });
      const body = await readJson(init);
      if (body.name) pack.name = String(body.name);
      if ("notes" in body) pack.notes = String(body.notes || "");
      if (body.gameDomain) pack.gameDomain = String(body.gameDomain);
      if (body.gameName) pack.gameName = String(body.gameName);
      save(data);
      return reply(200, { modpack: pack });
    }
    if (packOne && method === "DELETE") {
      data.modpacks = data.modpacks.filter((item) => item.id !== packOne[1]);
      save(data);
      return reply(200, { ok: true });
    }

    if (path === "/api/refresh" || path === "/api/export" || path === "/api/import" || path === "/api/translate" || path === "/api/localize") {
      return reply(400, { error: desktopOnly() });
    }
    if (path === "/api/catalog" && method === "POST") {
      const body = await readJson(init);
      const name = String((body.item && body.item.name) || body.name || "").trim();
      if (body.kind === "category" && name && !data.categories.includes(name)) data.categories.push(name);
      save(data);
      return reply(200, { catalog: library(data).catalog });
    }
    return reply(404, { error: desktopOnly() });
  }

  function paintBar(data) {
    const node = document.getElementById("demo-counts");
    if (!node) return;
    const box = dbSafe(data);
    node.textContent = `${box.mods.length}/${MODS} mods · ${box.games.length}/${GAMES} juegos`;
  }

  function dbSafe(data) {
    return data || db();
  }

  function mountBar() {
    if (document.getElementById("demo-bar")) return;
    const style = document.createElement("style");
    style.textContent = `
      #demo-bar {
        position: fixed; z-index: 80; top: 0; left: 0; right: 0;
        display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap;
        padding: 8px 14px; background: #2a2118; color: #f6efe6;
        border-bottom: 1px solid #e08a2c; font: 14px/1.3 "Segoe UI", sans-serif;
      }
      #demo-bar a {
        color: #1a1208; background: linear-gradient(120deg, #f0a04a, #c45c26);
        text-decoration: none; font-weight: 700; border-radius: 999px; padding: 6px 12px;
      }
      body { padding-top: 42px; }
    `;
    document.head.appendChild(style);
    const bar = document.createElement("div");
    bar.id = "demo-bar";
    bar.innerHTML = `Prueba web · <span id="demo-counts"></span> · <a href="../wi-mod-portable.zip">Descargar escritorio</a>`;
    document.body.prepend(bar);
    paintBar(db());
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    let path = "";
    try { path = new URL(url, location.origin).pathname; } catch (_) { path = ""; }
    if (path.startsWith("/api/")) return route(url, init || {});
    return realFetch(input, init);
  };

  if (document.body) mountBar();
  else document.addEventListener("DOMContentLoaded", mountBar);
})();
