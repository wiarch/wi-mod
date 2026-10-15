/* Prueba web: 5 juegos, 5 mods/juego, reinicio cada 5 h. Claves en demo-keys.js (no se sube a git). */
(function () {
  const MODS_PER_GAME = 5;
  const GAMES = 5;
  const TTL_MS = 5 * 60 * 60 * 1000;
  const KEY = "wi-mod-demo-v2";
  const DESKTOP = "La versión de escritorio no tiene este límite.";
  const KEYS = (typeof window !== "undefined" && window.__WI_DEMO_KEYS__) || {};
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
    fallout4: ["Nexus", "ModDB", "Independiente"],
    newvegas: ["Nexus", "ModDB", "Independiente"],
    stalkershadowofchernobyl: ["Nexus", "ModDB", "Independiente"],
    witcher3: NEXUS,
    cyberpunk2077: NEXUS,
    baldursgate3: NEXUS,
    monsterhunterworld: NEXUS,
    hollowknight: NEXUS,
    gtasa: NEXUS,
    gta5: NEXUS,
    worldofwarcraft: ["CurseForge", "Independiente"],
    wow: ["CurseForge", "Independiente"],
  };
  const NEXUS_BY_SLUG = {
    "the-elder-scrolls-v-skyrim-special-edition": "skyrimspecialedition",
    "the-elder-scrolls-v-skyrim": "skyrim",
    "dark-souls-remastered": "darksoulsremastered",
    "elden-ring": "eldenring",
    minecraft: "minecraft",
    "stardew-valley": "stardewvalley",
    "fallout-4": "fallout4",
    "fallout-new-vegas": "newvegas",
    "the-witcher-3-wild-hunt": "witcher3",
    "cyberpunk-2077": "cyberpunk2077",
    "baldurs-gate-3": "baldursgate3",
    "monster-hunter-world": "monsterhunterworld",
    "hollow-knight": "hollowknight",
    "grand-theft-auto-san-andreas": "gtasa",
    "grand-theft-auto-v": "gta5",
    "stalker-shadow-of-chernobyl": "stalkershadowofchernobyl",
    "world-of-warcraft": "worldofwarcraft",
  };

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
      startedAt: Date.now(),
    };
  }

  function db() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "");
      if (saved && Array.isArray(saved.mods) && Array.isArray(saved.games)) {
        const started = Number(saved.startedAt) || 0;
        if (!started || Date.now() - started >= TTL_MS) {
          const fresh = empty();
          localStorage.setItem(KEY, JSON.stringify(fresh));
          return fresh;
        }
        return saved;
      }
    } catch (_) { /* vacío */ }
    const fresh = empty();
    localStorage.setItem(KEY, JSON.stringify(fresh));
    return fresh;
  }

  function save(data) {
    if (!data.startedAt) data.startedAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(data));
    paintBar(data);
  }

  function hoursLeft(data) {
    const started = Number(data.startedAt) || Date.now();
    const left = Math.max(0, TTL_MS - (Date.now() - started));
    const h = Math.floor(left / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    return `${h}h ${String(m).padStart(2, "0")}m`;
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
    if (text.includes("moddb.com")) return "ModDB";
    if (text.includes("steamcommunity.com") && /workshop|sharedfiles|filedetails/.test(text)) return "Steam Workshop";
    if (text.trim()) return "Independiente";
    return "Nexus";
  }

  function domainOf(slug, name) {
    const s = String(slug || "").trim().toLowerCase();
    if (NEXUS_BY_SLUG[s]) return NEXUS_BY_SLUG[s];
    const compact = s.replace(/[^a-z0-9]/g, "");
    if (compact) return compact.slice(0, 64);
    return String(name || "game").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 64) || "game";
  }

  function normalizeRawg(item) {
    const slug = String(item.slug || "").trim().toLowerCase();
    const gameName = String(item.name || slug || "Juego").trim();
    return {
      rawgId: item.id,
      rawgSlug: slug,
      gameName,
      gameDomain: domainOf(slug, gameName),
      imageUrl: String(item.background_image || "").trim(),
      released: String(item.released || "").slice(0, 10),
      platforms: [],
    };
  }

  function keyFlags() {
    return {
      nexus: Boolean(KEYS.nexus),
      curseforge: Boolean(KEYS.curseforge),
      steam: Boolean(KEYS.steam),
      rawg: Boolean(KEYS.rawg),
    };
  }

  function library(data) {
    return {
      mods: data.mods,
      modpacks: data.modpacks,
      catalog: {
        platforms: ["Nexus", "Modrinth", "CurseForge", "Steam Workshop", "ModDB", "Independiente"],
        games: data.games,
        categories: data.categories,
        skills: [],
        rules: [],
      },
      language: data.language,
      theme: data.theme,
      sources: Object.fromEntries(Object.entries(SOURCES).map(([key, names]) => [key, names.slice()])),
      keys: keyFlags(),
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

  function limitMods(game) {
    const label = game || "este juego";
    return `La prueba web permite ${MODS_PER_GAME} mods por juego (${label}). ${DESKTOP}`;
  }

  function limitGames() {
    return `La prueba web permite ${GAMES} juegos como máximo. ${DESKTOP}`;
  }

  function desktopOnly() {
    return `Eso está en la versión de escritorio. ${DESKTOP}`;
  }

  function modsInGame(data, domain) {
    const key = String(domain || "").toLowerCase();
    return data.mods.filter((mod) => String(mod.gameDomain || "").toLowerCase() === key).length;
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

  async function searchNexus(game, q) {
    const domain = String(game || "").trim().toLowerCase();
    const text = String(q || "").trim().slice(0, 80);
    if (domain.length < 2 || text.length < 2) return [];
    const body = {
      query: `query ($filter: ModsFilter, $count: Int, $sort: [ModsSort!]) {
  mods(filter: $filter, count: $count, sort: $sort) {
    nodes { modId name summary author version downloads endorsements thumbnailUrl status game { domainName name } }
  }
}`,
      variables: {
        count: 24,
        sort: [{ downloads: { direction: "DESC" } }],
        filter: {
          op: "AND",
          name: [{ op: "WILDCARD", value: text }],
          gameDomainName: [{ op: "EQUALS", value: domain }],
        },
      },
    };
    const res = await realFetch("https://api.nexusmods.com/v2/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error("Nexus no respondió.");
    const payload = await res.json();
    const nodes = (((payload || {}).data || {}).mods || {}).nodes || [];
    const data = db();
    return nodes.slice(0, 8).map((row) => {
      const modId = row.modId;
      const gameDomain = String(((row.game || {}).domainName) || domain).toLowerCase();
      const url = `https://www.nexusmods.com/${gameDomain}/mods/${modId}`;
      const saved = data.mods.find((mod) => mod.nexusUrl === url);
      return {
        platform: "Nexus",
        name: row.name || "",
        author: row.author || "",
        summary: row.summary || "",
        downloads: row.downloads || 0,
        pictureUrl: row.thumbnailUrl || "",
        url,
        gameDomain,
        modId,
        savedId: saved ? saved.id : "",
      };
    });
  }

  async function searchRawg(q) {
    const key = KEYS.rawg;
    if (!key) return [];
    const params = new URLSearchParams({ key, search: q, page_size: "12", search_precise: "false" });
    const res = await realFetch(`https://api.rawg.io/api/games?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error("RAWG no respondió.");
    const payload = await res.json();
    return (payload.results || []).map(normalizeRawg);
  }

  async function fetchNexusMod(game, modId) {
    const key = KEYS.nexus;
    if (!key) return null;
    const res = await realFetch(`https://api.nexusmods.com/v1/games/${encodeURIComponent(game)}/mods/${modId}.json`, {
      headers: {
        apikey: key,
        Accept: "application/json",
        "Application-Name": "wi-mod",
        "Application-Version": "0.7.1",
      },
    });
    if (!res.ok) return null;
    return res.json();
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
      const flags = keyFlags();
      return reply(200, {
        hasKey: flags.nexus,
        hint: flags.nexus ? "••••demo" : "",
        hasRawgKey: flags.rawg,
        rawgHint: flags.rawg ? "••••demo" : "",
        hasCurseforgeKey: flags.curseforge,
        hasSteamKey: flags.steam,
        language: data.language,
        theme: data.theme,
        profile: { name: "prueba" },
      });
    }
    if (path === "/api/settings" && (method === "PUT" || method === "POST")) {
      const body = await readJson(init);
      if (body.language) data.language = String(body.language).startsWith("en") ? "en" : "es";
      if (body.theme) data.theme = String(body.theme);
      if (body.apiKey || body.rawgApiKey || body.curseforgeApiKey || body.steamApiKey) {
        return reply(400, { error: "En la prueba web las claves ya están cargadas. No se pueden cambiar." });
      }
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
      const q = parsed.searchParams.get("q") || "";
      const game = parsed.searchParams.get("game") || "";
      const platform = parsed.searchParams.get("platform") || "Nexus";
      if (platform !== "Nexus") return reply(200, { results: [], supported: false, platform });
      try {
        const results = await searchNexus(game, q);
        return reply(200, { results, supported: true, platform: "Nexus" });
      } catch (error) {
        return reply(502, { error: error.message || "Nexus no respondió." });
      }
    }
    if (path === "/api/rawg/search") {
      const q = (parsed.searchParams.get("q") || "").trim();
      try {
        const results = await searchRawg(q);
        return reply(200, { results });
      } catch (error) {
        return reply(502, { error: error.message || "RAWG no respondió." });
      }
    }
    if (path === "/api/rawg/add" && method === "POST") {
      const body = await readJson(init);
      let game = null;
      if (body.rawgId && KEYS.rawg) {
        try {
          const params = new URLSearchParams({ key: KEYS.rawg });
          const res = await realFetch(`https://api.rawg.io/api/games/${encodeURIComponent(body.rawgId)}?${params}`, {
            headers: { Accept: "application/json" },
          });
          if (res.ok) game = normalizeRawg(await res.json());
        } catch (_) { /* fallback */ }
      }
      if (!game && body.gameDomain) {
        game = {
          rawgId: body.rawgId || 0,
          gameDomain: String(body.gameDomain).toLowerCase(),
          gameName: String(body.gameName || body.gameDomain),
          imageUrl: String(body.imageUrl || ""),
          released: "",
          platforms: [],
        };
      }
      if (!game) return reply(404, { error: "Ese juego no está en la prueba." });
      if (!data.games.some((item) => item.gameDomain === game.gameDomain)) {
        if (data.games.length >= GAMES) return reply(400, { error: limitGames() });
        data.games.push({
          gameDomain: game.gameDomain,
          gameName: game.gameName,
          imageUrl: game.imageUrl || "",
        });
        save(data);
      }
      return reply(200, { game, catalog: library(data).catalog });
    }
    if (path === "/api/rawg/resolve") {
      const domain = parsed.searchParams.get("domain") || "";
      const name = parsed.searchParams.get("name") || "";
      if (!KEYS.rawg) return reply(200, { game: null });
      try {
        const results = await searchRawg(name || domain);
        const hit = results.find((row) => row.gameDomain === domain) || results[0] || null;
        return reply(200, { game: hit });
      } catch (_) {
        return reply(200, { game: null });
      }
    }
    if (path === "/api/preview" && method === "POST") {
      const body = await readJson(init);
      const urlValue = String(body.url || "");
      const platform = platformOf(urlValue);
      const saved = data.mods.find((mod) => mod.nexusUrl && mod.nexusUrl === urlValue);
      let name = "";
      let author = "";
      let summary = "";
      let version = "";
      let pictureUrl = "";
      const nexusMatch = urlValue.match(/nexusmods\.com\/([^/]+)\/mods\/(\d+)/i);
      if (platform === "Nexus" && nexusMatch && KEYS.nexus) {
        try {
          const mod = await fetchNexusMod(nexusMatch[1].toLowerCase(), nexusMatch[2]);
          if (mod) {
            name = String(mod.name || "");
            summary = String(mod.summary || "").replace(/<[^>]+>/g, "");
            version = String(mod.version || "");
            pictureUrl = String(mod.picture_url || "");
            author = String((mod.user && mod.user.name) || mod.author || "");
          }
        } catch (_) { /* preview vacío */ }
      }
      return reply(200, {
        name,
        author,
        summary,
        version,
        platform,
        official: platform !== "Nexus",
        pictureUrl,
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
      const gameDomain = String(body.gameDomain || (body.manual && body.manual.gameDomain) || "").toLowerCase();
      if (gameDomain && modsInGame(data, gameDomain) >= MODS_PER_GAME) {
        return reply(400, { error: limitMods(gameDomain) });
      }
      if (gameDomain && !data.games.some((g) => g.gameDomain === gameDomain)) {
        if (data.games.length >= GAMES) return reply(400, { error: limitGames() });
        data.games.push({
          gameDomain,
          gameName: String(body.gameName || (body.manual && body.manual.gameName) || gameDomain),
          imageUrl: "",
        });
      }
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
    const box = data || db();
    node.textContent = `${box.games.length}/${GAMES} juegos · máx ${MODS_PER_GAME} mods/juego · reinicio en ${hoursLeft(box)}`;
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
    bar.innerHTML = `Prueba web limitada · <span id="demo-counts"></span> · <a href="../wi-mod-portable.zip">Descargar escritorio</a>`;
    document.body.prepend(bar);
    paintBar(db());
    setInterval(() => paintBar(db()), 30000);
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
