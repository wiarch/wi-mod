/* Prueba web: 5 juegos, 5 mods/juego, reinicio cada 5 h. Claves en demo-keys.js (no se sube a git). */
(function () {
  const MODS_PER_GAME = 5;
  const GAMES = 5;
  const TTL_MS = 5 * 60 * 60 * 1000;
  const KEY = "wi-mod-demo-v4";
  const DESKTOP = "La versión de escritorio no tiene este límite.";
  const KEYS = (typeof window !== "undefined" && window.__WI_DEMO_KEYS__) || {};
  const STATIC_GAMES = {
    "skyrimspecialedition": {
      "rawgId": 12447,
      "rawgSlug": "the-elder-scrolls-v-skyrim-special-edition",
      "gameName": "The Elder Scrolls V: Skyrim Special Edition",
      "gameDomain": "skyrimspecialedition",
      "imageUrl": "https://media.rawg.io/media/games/62c/62c7c8b28a27b83680b22fb9d33fc619.jpg",
      "released": "2016-10-27",
      "rating": 4.45,
      "metacritic": 74,
      "description": "Open-world RPG. The Special Edition remaster of Skyrim.",
      "platforms": [],
      "genres": []
    },
    "skyrim": {
      "rawgId": 5679,
      "rawgSlug": "the-elder-scrolls-v-skyrim",
      "gameName": "The Elder Scrolls V: Skyrim",
      "gameDomain": "skyrim",
      "imageUrl": "https://media.rawg.io/media/games/7cf/7cfc9220b401b7a300e409e539c9afd5.jpg",
      "released": "2011-11-11",
      "rating": 4.42,
      "metacritic": 94,
      "description": "Open-world RPG set in Tamriel.",
      "platforms": [],
      "genres": []
    },
    "minecraft": {
      "rawgId": 22509,
      "rawgSlug": "minecraft",
      "gameName": "Minecraft",
      "gameDomain": "minecraft",
      "imageUrl": "https://media.rawg.io/media/games/b4e/b4e4c73d5aa4ec66bbf75375c4847a2b.jpg",
      "released": "2009-05-10",
      "rating": 4.44,
      "metacritic": 83,
      "description": "Sandbox building and survival.",
      "platforms": [],
      "genres": []
    },
    "stardewvalley": {
      "rawgId": 654,
      "rawgSlug": "stardew-valley",
      "gameName": "Stardew Valley",
      "gameDomain": "stardewvalley",
      "imageUrl": "https://media.rawg.io/media/games/713/713269608dc8f2f40f5a670a14b2de94.jpg",
      "released": "2016-02-25",
      "rating": 4.39,
      "metacritic": 89,
      "description": "Farming life sim.",
      "platforms": [],
      "genres": []
    },
    "fallout4": {
      "rawgId": 3070,
      "rawgSlug": "fallout-4",
      "gameName": "Fallout 4",
      "gameDomain": "fallout4",
      "imageUrl": "https://media.rawg.io/media/games/d82/d82990b9c67ba0d2d09d4e6fa88885a7.jpg",
      "released": "2015-11-09",
      "rating": 3.81,
      "metacritic": 84,
      "description": "Post-apocalyptic open-world RPG.",
      "platforms": [],
      "genres": []
    },
    "newvegas": {
      "rawgId": 5563,
      "rawgSlug": "fallout-new-vegas",
      "gameName": "Fallout: New Vegas",
      "gameDomain": "newvegas",
      "imageUrl": "https://media.rawg.io/media/games/995/9951d9d55323d08967640f7b9ab3e342.jpg",
      "released": "2010-10-19",
      "rating": 4.43,
      "metacritic": 84,
      "description": "Fallout RPG in the Mojave.",
      "platforms": [],
      "genres": []
    },
    "witcher3": {
      "rawgId": 3328,
      "rawgSlug": "the-witcher-3-wild-hunt",
      "gameName": "The Witcher 3: Wild Hunt",
      "gameDomain": "witcher3",
      "imageUrl": "https://media.rawg.io/media/games/618/618c2031a07bbff6b4f611f10b6bcdbc.jpg",
      "released": "2015-05-18",
      "rating": 4.64,
      "metacritic": 92,
      "description": "Story-driven open-world RPG.",
      "platforms": [],
      "genres": []
    },
    "cyberpunk2077": {
      "rawgId": 41494,
      "rawgSlug": "cyberpunk-2077",
      "gameName": "Cyberpunk 2077",
      "gameDomain": "cyberpunk2077",
      "imageUrl": "https://media.rawg.io/media/games/26d/26d4437715bee60138dab4a7c8c59c92.jpg",
      "released": "2020-12-10",
      "rating": 4.23,
      "metacritic": 73,
      "description": "Open-world RPG in Night City.",
      "platforms": [],
      "genres": []
    },
    "baldursgate3": {
      "rawgId": 324997,
      "rawgSlug": "baldurs-gate-3",
      "gameName": "Baldur's Gate III",
      "gameDomain": "baldursgate3",
      "imageUrl": "https://media.rawg.io/media/games/699/69907ecf13f172e9e144069769c3be73.jpg",
      "released": "2023-08-03",
      "rating": 4.43,
      "metacritic": 97,
      "description": "CRPG based on D&D 5e.",
      "platforms": [],
      "genres": []
    },
    "eldenring": {
      "rawgId": 326243,
      "rawgSlug": "elden-ring",
      "gameName": "Elden Ring",
      "gameDomain": "eldenring",
      "imageUrl": "https://media.rawg.io/media/games/b29/b294fdd866dcdb643e7bab370a552855.jpg",
      "released": "2022-02-25",
      "rating": 4.38,
      "metacritic": 95,
      "description": "Open-world action RPG from FromSoftware.",
      "platforms": [],
      "genres": []
    },
    "gtasa": {
      "rawgId": 416,
      "rawgSlug": "grand-theft-auto-san-andreas",
      "gameName": "Grand Theft Auto: San Andreas",
      "gameDomain": "gtasa",
      "imageUrl": "https://media.rawg.io/media/games/960/960b601d9541cec776c5fa42a00bf6c4.jpg",
      "released": "2004-10-26",
      "rating": 4.5,
      "metacritic": 93,
      "description": "Open-world crime classic.",
      "platforms": [],
      "genres": []
    },
    "gta5": {
      "rawgId": 3498,
      "rawgSlug": "grand-theft-auto-v",
      "gameName": "Grand Theft Auto V",
      "gameDomain": "gta5",
      "imageUrl": "https://media.rawg.io/media/games/20a/20aa03a10cda45239fe22d035c0ebe64.jpg",
      "released": "2013-09-17",
      "rating": 4.47,
      "metacritic": 92,
      "description": "Open-world crime in Los Santos.",
      "platforms": [],
      "genres": []
    },
    "darksoulsremastered": {
      "rawgId": 51610,
      "rawgSlug": "dark-souls8482-remastered",
      "gameName": "Dark Souls: Remastered",
      "gameDomain": "darksoulsremastered",
      "imageUrl": "https://media.rawg.io/media/games/29c/29c6c21cc0c78cff6f45d23631cc82f4.jpg",
      "released": "2018-05-23",
      "rating": 4.48,
      "metacritic": 84,
      "description": "Remastered action RPG.",
      "platforms": [],
      "genres": []
    },
    "stalkershadowofchernobyl": {
      "rawgId": 17857,
      "rawgSlug": "stalker-shadow-of-chernobyl",
      "gameName": "S.T.A.L.K.E.R.: Shadow of Chernobyl",
      "gameDomain": "stalkershadowofchernobyl",
      "imageUrl": "https://media.rawg.io/media/games/348/348640e78a7fcd4bb7dcad4fea014eeb.jpg",
      "released": "2007-03-19",
      "rating": 4.27,
      "metacritic": 82,
      "description": "Survival shooter in the Zone.",
      "platforms": [],
      "genres": []
    }
  };
  function staticGame(domain) {
    const key = String(domain || "").toLowerCase();
    return STATIC_GAMES[key] ? { ...STATIC_GAMES[key] } : null;
  }
  function staticSearch(q) {
    const needle = String(q || "").trim().toLowerCase();
    if (needle.length < 2) return [];
    return Object.values(STATIC_GAMES).filter((game) =>
      String(game.gameName || "").toLowerCase().includes(needle)
      || String(game.gameDomain || "").toLowerCase().includes(needle)
      || String(game.rawgSlug || "").toLowerCase().includes(needle)
    ).map((game) => ({ ...game }));
  }
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
    const seed = ["skyrimspecialedition", "minecraft", "stardewvalley", "gtasa", "gta5"]
      .map((domain) => staticGame(domain))
      .filter(Boolean)
      .map((game) => ({
        gameDomain: game.gameDomain,
        gameName: game.gameName,
        imageUrl: game.imageUrl || "",
        description: game.description || "",
        released: game.released || "",
        rating: game.rating,
        metacritic: game.metacritic,
        rawgId: game.rawgId,
        rawgSlug: game.rawgSlug,
      }));
    return {
      mods: [],
      modpacks: [],
      games: seed,
      categories: ["General"],
      language: "es",
      theme: "nexus",
      startedAt: Date.now(),
    };
  }

  function healGames(data) {
    let changed = false;
    const games = Array.isArray(data.games) ? data.games : [];
    data.games = games.map((row) => {
      const domain = String((row && row.gameDomain) || "").toLowerCase();
      const base = staticGame(domain);
      if (!base) return row;
      const next = { ...row };
      if (!next.imageUrl && base.imageUrl) { next.imageUrl = base.imageUrl; changed = true; }
      if (!next.description && base.description) { next.description = base.description; changed = true; }
      if (!next.gameName || next.gameName === domain || next.gameName === "Skyrim") {
        next.gameName = base.gameName;
        changed = true;
      }
      if (next.rawgId == null && base.rawgId != null) { next.rawgId = base.rawgId; changed = true; }
      if (!next.rawgSlug && base.rawgSlug) { next.rawgSlug = base.rawgSlug; changed = true; }
      if (!next.released && base.released) { next.released = base.released; changed = true; }
      if (next.rating == null && base.rating != null) { next.rating = base.rating; changed = true; }
      if (next.metacritic == null && base.metacritic != null) { next.metacritic = base.metacritic; changed = true; }
      return next;
    });
    if (!data.games.length) {
      data.games = empty().games;
      changed = true;
    }
    return changed;
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
        if (healGames(saved)) localStorage.setItem(KEY, JSON.stringify(saved));
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
    const local = staticSearch(q);
    const key = KEYS.rawg;
    if (!key) return local;
    try {
      const params = new URLSearchParams({ key, search: q, page_size: "12", search_precise: "false" });
      const res = await realFetch(`https://api.rawg.io/api/games?${params}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return local;
      const payload = await res.json();
      const remote = (payload.results || []).map(normalizeRawg);
      const seen = new Set(remote.map((row) => row.gameDomain));
      local.forEach((row) => { if (!seen.has(row.gameDomain)) remote.push(row); });
      return remote;
    } catch (_) {
      return local;
    }
  }

  const nexusGameIds = Object.create(null);

  async function nexusGameId(domain) {
    const key = String(domain || "").toLowerCase();
    if (!key) return null;
    if (nexusGameIds[key]) return nexusGameIds[key];
    const body = {
      query: `query ($filter: ModsFilter, $count: Int) {
  mods(filter: $filter, count: $count) {
    nodes { game { id domainName } }
  }
}`,
      variables: {
        count: 1,
        filter: {
          op: "AND",
          gameDomainName: [{ op: "EQUALS", value: key }],
        },
      },
    };
    const res = await realFetch("https://api.nexusmods.com/v2/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const node = ((((payload || {}).data || {}).mods || {}).nodes || [])[0];
    const id = node && node.game && node.game.id;
    if (!id) return null;
    nexusGameIds[key] = String(id);
    return nexusGameIds[key];
  }

  async function fetchNexusMod(game, modId) {
    const domain = String(game || "").toLowerCase();
    const id = String(modId || "");
    if (KEYS.nexus) {
      const res = await realFetch(`https://api.nexusmods.com/v1/games/${encodeURIComponent(domain)}/mods/${id}.json`, {
        headers: {
          apikey: KEYS.nexus,
          Accept: "application/json",
          "Application-Name": "wi-mod",
          "Application-Version": "0.7.2",
        },
      });
      if (res.ok) return res.json();
    }
    const gameId = await nexusGameId(domain);
    if (!gameId) return null;
    const body = {
      query: `query ($filter: ModsFilter, $count: Int) {
  mods(filter: $filter, count: $count) {
    nodes {
      modId name summary author version downloads thumbnailUrl updatedAt
      game { id domainName name }
    }
  }
}`,
      variables: {
        count: 1,
        filter: {
          op: "AND",
          modId: [{ op: "EQUALS", value: id }],
          gameId: [{ op: "EQUALS", value: gameId }],
        },
      },
    };
    const res = await realFetch("https://api.nexusmods.com/v2/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const payload = await res.json();
    const row = ((((payload || {}).data || {}).mods || {}).nodes || [])[0];
    if (!row) return null;
    return {
      name: row.name || "",
      summary: row.summary || "",
      author: row.author || "",
      version: row.version || "",
      picture_url: row.thumbnailUrl || "",
      mod_id: row.modId,
      domain_name: ((row.game || {}).domainName) || domain,
      updated_time: row.updatedAt || "",
    };
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
      if (body.gameDomain) game = staticGame(body.gameDomain);
      if (!game && body.rawgId && KEYS.rawg) {
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
          description: "",
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
      const local = staticGame(domain);
      if (local) return reply(200, { game: local });
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
      if (platform === "Nexus" && nexusMatch) {
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
        position: fixed; z-index: 80; left: 50%; bottom: 58px; transform: translateX(-50%);
        display: flex; gap: 10px; align-items: center; flex-wrap: wrap; max-width: calc(100vw - 24px);
        padding: 6px 10px 6px 12px; border-radius: 999px;
        background: color-mix(in srgb, var(--panel, #1a1a1a) 88%, transparent);
        color: var(--text, #f2f2f2); border: 1px solid color-mix(in srgb, var(--accent, #e08a2c) 55%, transparent);
        backdrop-filter: blur(8px); font: 12px/1.3 "Segoe UI", sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,.35);
      }
      #demo-bar a {
        color: #1a1208; background: var(--accent, #e08a2c);
        text-decoration: none; font-weight: 700; border-radius: 999px; padding: 4px 10px; white-space: nowrap;
      }
      #demo-counts { opacity: .85; }
    `;
    document.head.appendChild(style);
    const bar = document.createElement("div");
    bar.id = "demo-bar";
    bar.innerHTML = `Prueba · <span id="demo-counts"></span> · <a href="../wi-mod-portable.zip">Escritorio</a>`;
    document.body.appendChild(bar);
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
