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
  sort: (() => {
    const saved = localStorage.getItem("wi-mod-sort");
    if (saved === "added" || saved === "downloaded" || saved === "updated" || saved === "name" || saved === "priority") return saved;
    return "added";
  })(),
  view: (() => {
    const saved = localStorage.getItem("wi-mod-view");
    if (saved === "grid" || saved === "list" || saved === "table") return saved;
    const scale = Number(localStorage.getItem("wi-mod-scale"));
    if (Number.isFinite(scale) && scale <= 0.4) return "list";
    return "grid";
  })(),
  cardScale: (() => {
    const saved = Number(localStorage.getItem("wi-mod-scale"));
    if (Number.isFinite(saved)) return Math.min(1.5, Math.max(0.1, Math.round(saved * 10) / 10));
    const old = localStorage.getItem("wi-mod-size");
    if (old === "sm") return 0.5;
    if (old === "lg") return 1.5;
    return 0.5;
  })(),
  query: "",
  listQuery: "",
  sideQuery: "",
  sideOpen: {},
  sideNav: {
    platforms: { page: 1 },
    modpacks: { page: 1 },
    categories: { page: 1 },
    packcats: { page: 1 },
    mods: { page: 1 },
  },
  sidePageSize: Number(localStorage.getItem("wi-mod-side-page") || 8) || 8,
  onlyUpdates: false,
  selected: new Set(),
  lastCheck: "",
  picking: false,
  detected: null,
  manual: false,
  packMode: "export",
  packsDir: "",
  importZipPath: "",
  muted: localStorage.getItem("wi-mod-mute") === "1",
  coverBg: localStorage.getItem("wi-mod-cover-bg") === "1",
  lang: (() => {
    const saved = localStorage.getItem("wi-mod-lang");
    if (saved === "en" || saved === "es") return saved;
    const nav = String(navigator.language || navigator.userLanguage || "es").toLowerCase();
    return nav.startsWith("es") ? "es" : "en";
  })(),
  showEs: true,
  theme: "nexus",
  keys: { nexus: false, curseforge: false, steam: false, rawg: false },
  windowsUser: "",
  pcName: "",
  customName: localStorage.getItem("wi-mod-custom-name") || "",
  nameSource: localStorage.getItem("wi-mod-name-source") === "custom" ? "custom" : "user",
};
state.showEs = state.lang === "es";
if (localStorage.getItem("wi-mod-lang") !== "en" && localStorage.getItem("wi-mod-lang") !== "es") {
  localStorage.setItem("wi-mod-lang", state.lang);
}

function displaySummary(mod) {
  if (state.showEs && mod.summaryEs) return mod.summaryEs;
  return mod.summary || t("noDesc");
}

const CATEGORY_ES = {
  "overhauls": "Reformas",
  "user interface": "Interfaz",
  "gameplay": "Jugabilidad",
  "models and textures": "Modelos y texturas",
  "cities, towns, villages, and hamlets": "Ciudades y pueblos",
  "immersion": "Inmersión",
  "patches": "Parches",
  "utilities": "Utilidades",
  "weapons": "Armas",
  "armour": "Armaduras",
  "armor": "Armaduras",
  "magic - gameplay": "Magia",
  "audio": "Audio",
  "visuals": "Visuales",
  "visuals and graphics": "Visuales",
  "general": "General",
  "bug fixes": "Correcciones",
  "animation": "Animación",
  "animations": "Animaciones",
  "creatures and mounts": "Criaturas y monturas",
  "quests and adventures": "Misiones",
  "npc": "Personajes",
  "npcs": "Personajes",
  "clothing and accessories": "Ropa y accesorios",
  "environmental": "Entorno",
  "environment": "Entorno",
  "items and objects": "Objetos",
  "skills and leveling": "Habilidades",
  "combat": "Combate",
  "alchemy": "Alquimia",
  "followers": "Seguidores",
  "locations": "Lugares",
  "modders resources": "Recursos",
  "new lands": "Nuevas tierras",
  "performance": "Rendimiento",
  "presets": "Preajustes",
  "stealth": "Sigilo",
  "survival": "Supervivencia",
  "weather and lighting": "Clima e iluminación",
  "lighting": "Iluminación",
  "hair and face": "Pelo y cara",
  "body, face, and hair": "Cuerpo y cara",
  "characters": "Personajes",
  "buildings": "Edificios",
  "miscellaneous": "Varios",
  "player homes": "Casas",
  "quests": "Misiones",
  "textures": "Texturas",
  "weapons and armour": "Armas y armaduras",
};

function categoryLabel(name, mod) {
  const raw = name || mod?.category || "General";
  if (!state.showEs) return raw;
  if (mod?.categoryEs && (mod.category || "General") === raw) return mod.categoryEs;
  const known = CATEGORY_ES[String(raw).toLowerCase()];
  if (known) return known;
  const found = state.mods.find((item) => (item.category || "General") === raw && item.categoryEs);
  return found?.categoryEs || raw;
}

const $ = (id) => document.getElementById(id);

const UI = {
  es: {
    loginHint: "Escribe tu usuario.", loginUser: "Usuario", loginPass: "Clave",
    loginKeep: "Guardar sesión 60 días", loginForgot: "Olvidé la clave", loginGo: "Entrar",
    bootLine: "olfateando la guarida…", pickGame: "Elegir juego", addGame: "Añadir juego",
    download: "Descargar", downloadWait: "Pediendo descarga a Nexus…",
    downloadOk: "Archivo guardado en mods/ del programa.",
    downloadManual: "No se pudo bajar por API.",
    downloadNone: "Sin archivo local. Descarga para guardarlo en mods/{juego}/…",
    noLocal: "Sin archivo local",
    readyInstall: "Listo para instalar",
    installed: "Instalado",
    downloadOne: "Local: {path}", downloadMany: "{n} archivos · {path}",
    activeOn: "Activo", activeOff: "Inactivo",
    activeTipOn: "Activo en el juego. Clic → .disabled",
    activeTipOff: "Inactivo. Clic para activar",
    gotOn: "Descargado", gotOff: "Sin descargar",
    bulkEnable: "Activar", bulkDisable: "Desactivar",
    packEnable: "Activar pack", packDisable: "Desactivar pack",
    activeOk: "{n} activos.", inactiveOk: "{n} inactivos (.disabled).",
    needDownload: "Solo mods descargados se pueden activar o desactivar.",
    activeNeedFiles: "Descarga el mod antes de activarlo.",
    addGameTitle: "Añadir juego (RAWG)", searchGame: "Buscar juego", launchGame: "Lanzar juego",
    launchTitle: "Lanzador",
    launchMissing: "Este juego no tiene lanzador vinculado. ¿Quieres que wi-mod lo busque solo o lo eliges a mano?",
    launchAuto: "Detectar automáticamente", launchManual: "Elegir manualmente",
    launchSearching: "Buscando en todos los discos y carpetas (sin tocar carpetas del sistema)…",
    launchNone: "No encontré la carpeta del juego. Elige la carpeta o el .exe a mano.",
    launchPick: "Encontré esto. Elige la carpeta del juego (o el .exe):",
    launchSaved: "Lanzador guardado.", launchOk: "Abriendo el juego…",
    launchPathPh: "Ruta del .exe o pegar steam://run/…",
    launchNeedGame: "Elige un juego arriba.",
    launchUnlinked: "Sin lanzador. Clic o Ctrl+Enter para vincular.",
    launchLinked: "Lanzar juego (Ctrl+Enter). Mayús+clic para cambiar",
    launchFolder: "Carpeta",
    launchExe: "Ejecutable",
    launchBrowseHint: "Elige la carpeta del juego o pega la ruta.",
    launchPathLabel: "Ruta",
    browse: "Examinar",
    detectGames: "Detectar",
    detectGamesTip: "Busca la carpeta del juego activo en todos los discos",
    searchMods: "Buscar mods", searchIn: "Buscar en {name}", listSearch: "Filtrar lista", menu: "Menú",
    platform: "Plataforma", platforms: "Plataformas", tags: "Etiquetas", modpack: "Modpack", category: "Categoría",
    createPack: "Crear modpack", addCategory: "Añadir categoría",
    hideNames: "Ocultar nombres", showNames: "Mostrar nombres", hide: "Ocultar", show: "Mostrar",
    dragWidth: "Arrastra el ancho", newVersion: "Versión nueva", selectAll: "Seleccionar todo",
    layout: "Diseño", grid: "Cuadrícula", listView: "Listado", tableView: "Tabla", size: "Tamaño",
    flags: "Flags",
    sizeDown: "Achicar. Bajo 0.5× pasa a lista",
    sizeReset: "Tamaño base 0.5×. Clic para volver", sizeUp: "Agrandar, máximo 1.5×",
    sort: "Orden", sortAdded: "Recién guardados", sortDownloaded: "Recién descargados", sortUpdated: "Última actualización", sortName: "Nombre", sortPriority: "Prioridad",
    priority: "Prioridad",
    priorityTip: "Orden de carga. El número mayor se carga al final y pisa archivos de los anteriores.",
    conflicts: "Conflictos",
    conflictNone: "Sin archivos en común con otros mods activos.",
    conflictWins: "Pisa a: {names}",
    conflictLoses: "Lo pisan: {names}",
    mods: "Mods",
    sideRefresh: "Actualizar mods",
    sideFoldsToggle: "Plegar o expandir secciones",
    sideFoldsCollapse: "Minimizar secciones",
    sideFoldsExpand: "Expandir secciones",
    sideSearch: "Buscar en filtros y mods", sidePage: "Página", sidePrev: "Anterior", sideNext: "Siguiente", sidePageSize: "Por página",
    assign: "Asignar", insidePack: "Dentro del pack", move: "Mover", refresh: "Actualizar",
    delete: "Eliminar", log: "Log", errors: "Errores", alerts: "Alertas", requests: "Peticiones",
    clear: "Limpiar", addMod: "Añadir mod", link: "Enlace",
    linkPh: "Nexus, Modrinth, CurseForge, Steam o página oficial", detect: "Detectar",
    manual: "Completar a mano", name: "Nombre", game: "Juego", author: "Autor", version: "Versión",
    whatItDoes: "Qué hace", packCat: "Categoría del pack", createCat: "Crear categoría",
    plusHint: "Con + creas el modpack o la categoría aquí mismo.", save: "Guardar",
    translator: "Traductor",
    translateHint: "Pega cualquier texto del mod (inglés → español). También puedes traducir la ficha guardada desde el detalle del mod.",
    original: "Original", translateRun: "Traducir a español", spanish: "Español", english: "Inglés",
    translateOutPh: "Aquí sale la traducción", copy: "Copiar", settings: "Ajustes",
    keysHint: "Las claves se guardan solo en esta PC (data).", keyNexus: "Clave Nexus Mods",
    keyPaste: "Pega una clave nueva para reemplazarla", keyCf: "Clave CurseForge",
    keySteam: "Clave Steam Web API", keyRawg: "Clave RAWG (juegos)",
    keyRawgPh: "Pega clave RAWG para reemplazarla", removeNexus: "Quitar Nexus",
    addGameDlg: "Añadir juego", rawgHint: "Busca en RAWG y ve añadiendo juegos poco a poco.",
    search: "Buscar", gameSearchPh: "Skyrim, WoW Classic, Minecraft…",
    rawgData: "Datos de juegos vía RAWG.", close: "Cerrar", importExport: "Importar y exportar",
    export: "Exportar", import: "Importar",
    exportHint: "Todo, o solo un juego, un modpack, una plataforma o los marcados.",
    exportElsewhere: "Otra ruta",
    packsFolder: "Carpeta: {path}",
    zipFilePh: "Elige un .zip…",
    whatExport: "Qué exportar", all: "Todo", oneGame: "Un juego", onePack: "Un modpack",
    byPlatform: "Por plataforma", selectedOnly: "Solo marcados", choose: "Elige", back: "Volver",
    zipFile: "Archivo .zip", whatImport: "Qué importar", modpacks: "Modpacks",
    packHint: "Pon el nombre y las categorías. Luego asigna los mods marcados.",
    emoji: "Emoji", image: "Imagen", remove: "Quitar", searchEmoji: "Buscar emoji",
    categories: "Categorías", description: "Descripción", preview: "Vista previa",
    savePack: "Guardar modpack", packCatHint: "Apartado dentro del modpack. Nombre, imagen y una nota.",
    orUrl: "O una URL", note: "Nota", erase: "Borrar", saveCat: "Guardar categoría",
    already: "Ya existe", cancel: "Cancelar", duplicate: "Duplicar", replace: "Sustituir",
    add: "Añadir", confirm: "Confirmar", yes: "Sí", useImage: "Usar imagen", view: "Ver",
    edit: "Editar", select: "Seleccionar", moveToPack: "Mover a modpack", localFile: "Archivo local", quit: "Salir",
    quitAsk: "¿Cerrar wi-mod del todo o dejarlo en la bandeja?", remember: "Recordar opción",
    tray: "Bandeja", quitClose: "Cerrar", changeName: "Cambiar nombre", tutorial: "Tutorial",
    settings: "Ajustes", keys: "Claves", sound: "Sonido", theme: "Tema", compress: "Comprimir", restore: "Restaurar",
    key: "Clave", pasteKey: "Pega la clave", docs: "Documentación",
    keyNeeded: "No tienes la clave de {name} instalada. Pégala aquí o sigue la guía.",
    keyNeededShort: "Falta la clave de {name}.",
    tourExit: "Salir del tutorial",
    next: "Siguiente", done: "Listo", allF: "Todas", allM: "Todos", noPack: "Sin modpack",
    noCats: "Sin categorías (usa +)", noDesc: "Sin descripción", hideCard: "Ocultar",
    showCard: "Mostrar", addDesc: "Añadir descripción",
    heroFallback: "Añade el juego con + para traer ficha completa desde RAWG, o espera a que se complete sola.",
    modsN: "{n} mods", packsN: "{n} modpacks", officialSite: "Sitio oficial", rawgCredit: "Datos: RAWG",
    pinOn: "Quitar de arriba", pinOff: "Fijar arriba, máximo 3", favOn: "Quitar favorito",
    favOff: "Abrir siempre este juego", keyOn: "activa", keyOff: "falta",
    keysReady: "Todos los servicios activos", keysSome: "{ready} de {total} servicios activos",
    unmute: "Activar sonido", muteOn: "Silenciar", switchEn: "Cambiar a inglés", switchEs: "Cambiar a español",
    online: "Online", offline: "Local", diskFree: "{n} libres",
    diskUsedFree: "{used} · {free} libres",
    dockMods: "Mods {n}", dockFree: "Libre {n}", ramUse: "RAM {n}",
    dockGameTip: "Juego activo",
    diskModsTip: "Tamaño de los archivos de mods de este juego",
    diskTip: "Espacio libre en el disco", ramTip: "Memoria RAM de wi-mod",
    qRawg: "🔄 Sincronizando RAWG…",
    qExtract: "📦 Extrayendo archivo…", qDown: "⬇️ Descargando mods…", qSync: "🔄 Sincronizando…",
    hideDock: "Ocultar barra", showDock: "Mostrar barra",
    coverBgUse: "Portada", coverBgDefault: "Predeterminado",
    coverBgTitleUse: "Usar portada del juego", coverBgTitleOff: "Usar fondo predeterminado",
    noDate: "sin fecha", newTag: "nueva", emptyFiltered: "Hay {n} mod(s) ocultos por el filtro.",
    clearFilters: "Quitar filtros", emptyGame: "Sin mods en este juego.", emptyInstance: "Esta instancia no tiene mods.",
    createInstance: "Instancia", instanceTitle: "Crear perfil", instanceName: "Nombre",
    instanceNamePh: "Nombre del perfil", instanceMc: "Versión de Minecraft",
    instanceLoader: "Modloader", instanceLoaderVer: "Versión del modloader",
    instanceLoaderTip: "Elige un modloader para un perfil con mods, o Vanilla para uno sin mods.",
    instanceCreate: "Crear", instanceCreating: "Creando perfil…",
    instanceDownloading: "Descargando librerías…", instanceReady: "Perfil listo.",
    javaAsk: "No encuentro Java. ¿Lo instalo ahora?",
    zipAsk: "Para .7z y .rar hace falta 7-Zip. ¿Lo instalo ahora?",
    zipInstalling: "Instalando 7-Zip…",
    javaInstalling: "Instalando Java…", javaReady: "Java listo.",
    instanceLoaders: "Buscando loaders…",
    sysBack: "Atrás", sysFwd: "Adelante", sysNone: "Sin instancia",
    searchInstance: "Buscar instancia", addInstance: "Añadir instancia",
    sysDownloads: "Descargas",
    tasks: "Tareas", tasksDone: "Completadas", tasksClear: "Limpiar",
    sysMin: "Minimizar", sysMax: "Maximizar", sysClose: "Cerrar",
    emptyAll: "Pega un enlace de Nexus con Añadir mod. La ficha trae imagen, resumen, categoría, versión y última actualización.",
    picked: "{n} marcados", pickFirst: "Marca mods primero.", noResults: "Sin resultados",
    type2: "Escribe al menos 2 letras.", searching: "Buscando…",
    noneHere: "Sin mods en este juego.", gameWord: "Juego", independent: "Independiente",
    noErrors: "Sin errores.", noAlerts: "Sin alertas.", noReqs: "Sin peticiones.", empty: "Vacío.",
    exampleLux: "Ej. Lux Stack", exampleLight: "Ej. Iluminación", packNotesPh: "De qué va este modpack…",
    catNotesPh: "Para qué sirve este apartado…", modNotePh: "Nota de este mod", urlPh: "https://…",
    tour1t: "Juego", tour1d: "Aquí eliges el juego. Los fijados quedan arriba y el favorito es el que abre al entrar.",
    tour2t: "Añadir juego", tour2d: "Dentro del selector. Si el juego no está, lo buscas en RAWG y lo agregas.",
    tour3t: "Buscar", tour3d: "Busca mods por nombre. Si pegas una URL, detecta la plataforma y el juego, lo crea si falta y guarda el mod.",
    tour4t: "Plataforma", tour4d: "Filtra por tienda. El número dice cuántas hay. La flecha pliega la lista.",
    tour5t: "Modpack", tour5d: "Agrupa mods de este juego. El + crea un modpack.",
    tour6t: "Categoría", tour6d: "Apartados de los mods. El + añade una categoría.",
    tour7t: "Sidebar", tour7d: "Ocultar deja solo iconos. Si lo achicas mucho, entra solo en ese modo. Mostrar vuelve al ancho de antes.",
    tour8t: "Ficha del juego", tour8d: "Un clic oculta o muestra la ficha. No abre los enlaces.",
    tour9t: "Lista", tour9d: "Cuadrícula o listado, tamaño de las fichas y el orden.",
    tour10t: "Mods", tour10d: "Aquí están los mods. Un clic abre la ficha. Arrastrar marca varios.",
    tour11t: "Tu usuario", tour11d: "Muestra el usuario de Windows. Desde aquí sales, importas y abres este tutorial.",
    tour12t: "Claves", tour12d: "En el menú, arriba de Tema. Nexus, CurseForge, Steam y RAWG. Modrinth no pide clave.",
    tour13t: "Tema", tour13d: "En el menú, abre Tema y haz clic en uno para aplicarlo.",
    tour14t: "Sonido", tour14d: "En el menú. Activa o silencia los clics.",
    tour15t: "Idioma", tour15d: "En el menú. Un clic cambia a inglés o español.",
    tour16t: "Avisos", tour16d: "Errores, alertas y peticiones del programa.",
  },
  en: {
    loginHint: "Enter your username.", loginUser: "User", loginPass: "Password",
    loginKeep: "Stay signed in 60 days", loginForgot: "Forgot password", loginGo: "Sign in",
    bootLine: "sniffing the den…", pickGame: "Choose game", addGame: "Add game",
    download: "Download", downloadWait: "Asking Nexus for the download…",
    downloadOk: "File saved under the app mods/ folder.",
    downloadManual: "The API could not download this file.",
    downloadNone: "No local file. Download to save under mods/{game}/…",
    noLocal: "No local file",
    readyInstall: "Ready to install",
    installed: "Installed",
    downloadOne: "Local: {path}", downloadMany: "{n} files · {path}",
    activeOn: "Active", activeOff: "Inactive",
    activeTipOn: "Active in-game. Click → .disabled",
    activeTipOff: "Inactive. Click to enable",
    gotOn: "Downloaded", gotOff: "Not downloaded",
    bulkEnable: "Enable", bulkDisable: "Disable",
    packEnable: "Enable pack", packDisable: "Disable pack",
    activeOk: "{n} enabled.", inactiveOk: "{n} disabled (.disabled).",
    needDownload: "Only downloaded mods can be enabled or disabled.",
    activeNeedFiles: "Download the mod before enabling it.",
    addGameTitle: "Add game (RAWG)", searchGame: "Search games", launchGame: "Launch game",
    launchTitle: "Launcher",
    launchMissing: "This game has no launcher linked. Should wi-mod find it, or pick it yourself?",
    launchAuto: "Detect automatically", launchManual: "Choose manually",
    launchSearching: "Searching all disks and folders (skipping OS system folders)…",
    launchNone: "Game folder not found. Pick the folder or .exe yourself.",
    launchPick: "Found these. Pick the game folder (or .exe):",
    launchSaved: "Launcher saved.", launchOk: "Opening the game…",
    launchPathPh: "Path to .exe or paste steam://run/…",
    launchNeedGame: "Pick a game above.",
    launchUnlinked: "No launcher. Click or Ctrl+Enter to link.",
    launchLinked: "Launch game (Ctrl+Enter). Shift+click to change",
    launchFolder: "Folder",
    launchExe: "Executable",
    launchBrowseHint: "Pick the game folder or paste the path.",
    launchPathLabel: "Path",
    browse: "Browse",
    detectGames: "Detect",
    detectGamesTip: "Find the active game folder across all disks",
    searchMods: "Search mods", searchIn: "Search {name}", listSearch: "Filter list", menu: "Menu",
    platform: "Platform", platforms: "Platforms", tags: "Tags", modpack: "Modpack", category: "Category",
    createPack: "Create modpack", addCategory: "Add category",
    hideNames: "Hide names", showNames: "Show names", hide: "Hide", show: "Show",
    dragWidth: "Drag to resize", newVersion: "New version", selectAll: "Select all",
    layout: "Layout", grid: "Grid", listView: "List", tableView: "Table", size: "Size",
    flags: "Flags",
    sizeDown: "Smaller. Below 0.5× switches to list",
    sizeReset: "Base size 0.5×. Click to reset", sizeUp: "Larger, max 1.5×",
    sort: "Sort", sortAdded: "Recently saved", sortDownloaded: "Recently downloaded", sortUpdated: "Last update", sortName: "Name", sortPriority: "Priority",
    priority: "Priority",
    priorityTip: "Load order. A higher number loads last and overwrites files from lower ones.",
    conflicts: "Conflicts",
    conflictNone: "No shared files with other active mods.",
    conflictWins: "Overwrites: {names}",
    conflictLoses: "Overwritten by: {names}",
    mods: "Mods",
    sideRefresh: "Refresh mods",
    sideFoldsToggle: "Collapse or expand sections",
    sideFoldsCollapse: "Collapse sections",
    sideFoldsExpand: "Expand sections",
    sideSearch: "Search filters and mods", sidePage: "Page", sidePrev: "Previous", sideNext: "Next", sidePageSize: "Per page",
    assign: "Assign", insidePack: "Inside the pack", move: "Move", refresh: "Refresh",
    delete: "Delete", log: "Log", errors: "Errors", alerts: "Alerts", requests: "Requests",
    clear: "Clear", addMod: "Add mod", link: "Link",
    linkPh: "Nexus, Modrinth, CurseForge, Steam or official page", detect: "Detect",
    manual: "Fill in by hand", name: "Name", game: "Game", author: "Author", version: "Version",
    whatItDoes: "What it does", packCat: "Pack category", createCat: "Create category",
    plusHint: "Use + to create the modpack or category here.", save: "Save",
    translator: "Translator",
    translateHint: "Paste any mod text (English → Spanish). You can also translate the saved card from the mod detail.",
    original: "Original", translateRun: "Translate to Spanish", spanish: "Spanish", english: "English",
    translateOutPh: "Translation appears here", copy: "Copy", settings: "Settings",
    keysHint: "Keys are stored only on this PC (data).", keyNexus: "Nexus Mods key",
    keyPaste: "Paste a new key to replace it", keyCf: "CurseForge key",
    keySteam: "Steam Web API key", keyRawg: "RAWG key (games)",
    keyRawgPh: "Paste a RAWG key to replace it", removeNexus: "Remove Nexus",
    addGameDlg: "Add game", rawgHint: "Search RAWG and add games as you go.",
    search: "Search", gameSearchPh: "Skyrim, WoW Classic, Minecraft…",
    rawgData: "Game data via RAWG.", close: "Close", importExport: "Import and export",
    export: "Export", import: "Import",
    exportHint: "Everything, or one game, one modpack, one platform, or the selected mods.",
    exportElsewhere: "Other path",
    packsFolder: "Folder: {path}",
    zipFilePh: "Pick a .zip…",
    whatExport: "What to export", all: "All", oneGame: "One game", onePack: "One modpack",
    byPlatform: "By platform", selectedOnly: "Selected only", choose: "Choose", back: "Back",
    zipFile: "Zip file", whatImport: "What to import", modpacks: "Modpacks",
    packHint: "Set the name and categories. Then assign the selected mods.",
    emoji: "Emoji", image: "Image", remove: "Remove", searchEmoji: "Search emoji",
    categories: "Categories", description: "Description", preview: "Preview",
    savePack: "Save modpack", packCatHint: "Section inside the modpack. Name, image, and a note.",
    orUrl: "Or a URL", note: "Note", erase: "Delete", saveCat: "Save category",
    already: "Already exists", cancel: "Cancel", duplicate: "Duplicate", replace: "Replace",
    add: "Add", confirm: "Confirm", yes: "Yes", useImage: "Use image", view: "View",
    edit: "Edit", select: "Select", moveToPack: "Move to modpack", localFile: "Local file", quit: "Quit",
    quitAsk: "Close wi-mod fully or leave it in the tray?", remember: "Remember choice",
    tray: "Tray", quitClose: "Close", changeName: "Change name", tutorial: "Tutorial",
    settings: "Settings", keys: "Keys", sound: "Sound", theme: "Theme", compress: "Compress", restore: "Restore",
    key: "Key", pasteKey: "Paste the key", docs: "Docs",
    keyNeeded: "You do not have the {name} key installed. Paste it here or open the guide.",
    keyNeededShort: "Missing {name} key.",
    tourExit: "Exit tutorial",
    next: "Next", done: "Done", allF: "All", allM: "All", noPack: "No modpack",
    noCats: "No categories (use +)", noDesc: "No description", hideCard: "Hide",
    showCard: "Show", addDesc: "Add description",
    heroFallback: "Add the game with + to pull a full RAWG card, or wait for it to fill in.",
    modsN: "{n} mods", packsN: "{n} modpacks", officialSite: "Official site", rawgCredit: "Data: RAWG",
    pinOn: "Unpin", pinOff: "Pin to top, max 3", favOn: "Unfavorite",
    favOff: "Always open this game", keyOn: "on", keyOff: "off",
    keysReady: "All services active", keysSome: "{ready} of {total} services active",
    unmute: "Unmute", muteOn: "Mute", switchEn: "Switch to English", switchEs: "Switch to Spanish",
    online: "Online", offline: "Local", diskFree: "{n} free",
    diskUsedFree: "{used} · {free} free",
    dockMods: "Mods {n}", dockFree: "Free {n}", ramUse: "RAM {n}",
    dockGameTip: "Active game",
    diskModsTip: "Size of this game's mod files",
    diskTip: "Free disk space", ramTip: "wi-mod RAM usage",
    qRawg: "🔄 Syncing RAWG…",
    qExtract: "📦 Extracting archive…", qDown: "⬇️ Downloading mods…", qSync: "🔄 Syncing…",
    hideDock: "Hide bar", showDock: "Show bar",
    coverBgUse: "Cover", coverBgDefault: "Default",
    coverBgTitleUse: "Use game cover as background", coverBgTitleOff: "Use default background",
    noDate: "no date", newTag: "new", emptyFiltered: "{n} mod(s) hidden by the filter.",
    clearFilters: "Clear filters", emptyGame: "No mods in this game.", emptyInstance: "This instance has no mods.",
    createInstance: "Instance", instanceTitle: "Create profile", instanceName: "Name",
    instanceNamePh: "Profile name", instanceMc: "Minecraft version",
    instanceLoader: "Modloader", instanceLoaderVer: "Modloader version",
    instanceLoaderTip: "Select a modloader to create a modded profile, or Vanilla for an unmodded one.",
    instanceCreate: "Create", instanceCreating: "Creating profile…",
    instanceDownloading: "Downloading libraries…", instanceReady: "Profile ready.",
    javaAsk: "Java is missing. Install it now?",
    zipAsk: "7-Zip is required for .7z and .rar. Install it now?",
    zipInstalling: "Installing 7-Zip…",
    javaInstalling: "Installing Java…", javaReady: "Java is ready.",
    instanceLoaders: "Looking up loaders…",
    sysBack: "Back", sysFwd: "Forward", sysNone: "No instance",
    searchInstance: "Search instance", addInstance: "Add instance",
    sysDownloads: "Downloads",
    tasks: "Tasks", tasksDone: "Complete", tasksClear: "Clear all",
    sysMin: "Minimize", sysMax: "Maximize", sysClose: "Close",
    emptyAll: "Paste a Nexus link with Add mod. The card brings image, summary, category, version, and last update.",
    picked: "{n} selected", pickFirst: "Select mods first.", noResults: "No results",
    type2: "Type at least 2 letters.", searching: "Searching…",
    noneHere: "No mods in this game.", gameWord: "Game", independent: "Independent",
    noErrors: "No errors.", noAlerts: "No alerts.", noReqs: "No requests.", empty: "Empty.",
    exampleLux: "e.g. Lux Stack", exampleLight: "e.g. Lighting", packNotesPh: "What this modpack is about…",
    catNotesPh: "What this section is for…", modNotePh: "Note for this mod", urlPh: "https://…",
    tour1t: "Game", tour1d: "Pick the game here. Pinned ones stay on top and the favorite opens on launch.",
    tour2t: "Add game", tour2d: "Inside the picker. If the game is missing, search RAWG and add it.",
    tour3t: "Search", tour3d: "Search mods by name. If you paste a URL, it detects the store and game, creates it if needed, and saves the mod.",
    tour4t: "Platform", tour4d: "Filter by store. The number is how many there are. The arrow folds the list.",
    tour5t: "Modpack", tour5d: "Group mods for this game. + creates a modpack.",
    tour6t: "Category", tour6d: "Mod sections. + adds a category.",
    tour7t: "Sidebar", tour7d: "Hide leaves icons only. If you shrink it a lot, it enters that mode. Show restores the previous width.",
    tour8t: "Game card", tour8d: "One click hides or shows the card. It does not open the links.",
    tour9t: "List", tour9d: "Grid or list, card size, and sort order.",
    tour10t: "Mods", tour10d: "Your mods live here. Click opens the card. Drag selects several.",
    tour11t: "Your user", tour11d: "Shows the Windows user. From here you quit, import, and open this tutorial.",
    tour12t: "Keys", tour12d: "In the menu, above Theme. Nexus, CurseForge, Steam, and RAWG. Modrinth does not need a key.",
    tour13t: "Theme", tour13d: "In the menu, open Theme and click one to apply it.",
    tour14t: "Sound", tour14d: "In the menu. Turns click sounds on or off.",
    tour15t: "Language", tour15d: "In the menu. One click switches English or Spanish.",
    tour16t: "Notices", tour16d: "Errors, alerts, and program requests.",
  },
};

function t(key, vars) {
  const pack = UI[state.lang] || UI.es;
  let text = pack[key] ?? UI.es[key] ?? key;
  if (vars) Object.keys(vars).forEach((name) => { text = text.replaceAll(`{${name}}`, String(vars[name])); });
  return text;
}

function paintChrome() {
  document.documentElement.lang = state.lang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) node.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
    node.placeholder = t(node.getAttribute("data-i18n-placeholder"));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((node) => {
    const key = node.getAttribute("data-i18n-title");
    if (key) node.title = t(key);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((node) => {
    const key = node.getAttribute("data-i18n-aria");
    if (key) node.setAttribute("aria-label", t(key));
  });
  const rail = $("side-rail");
  const layout = document.querySelector(".layout");
  if (rail && layout) {
    const icons = layout.classList.contains("side-icons");
    rail.title = icons ? t("showNames") : t("hideNames");
    rail.textContent = icons ? t("show") : t("hide");
  }
  const add = $("game-add");
  if (add) {
    add.title = t("addGameTitle");
    const svg = add.querySelector("svg");
    if (svg) add.replaceChildren(svg, document.createTextNode(t("addGame")));
    else add.textContent = t("addGame");
  }
  const gameSearch = document.querySelector(".game-menu-search");
  if (gameSearch) gameSearch.placeholder = t("searchGame");
  paintGamePlay();
}


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
    beginLoad();
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
    endLoad();
  }
}

let taskSeq = 1;
const liveTasks = [];
let loadFrame = 0;

function taskModName(id) {
  const mod = (state.mods || []).find((item) => item.id === id);
  return mod?.name || "";
}

function taskPct(task) {
  const elapsed = performance.now() - task.started;
  const tau = 2400;
  const goal = -tau * Math.log(0.08);
  if (elapsed < goal) return Math.max(4, Math.min(92, Math.round((1 - Math.exp(-elapsed / tau)) * 100)));
  return Math.min(97, 92 + Math.floor((elapsed - goal) / 700));
}

function queueHint(path) {
  const p = String(path || "");
  const mod = p.match(/\/api\/mods\/([0-9a-f]{32})\/(download|install|files|refresh|translate)/);
  if (mod) {
    const name = taskModName(mod[1]);
    if (mod[2] === "download") return name ? `⬇️ ${name}` : t("qDown");
    if (mod[2] === "install" || mod[2] === "files") return name ? `📦 ${name}` : t("qExtract");
    return name ? `🔄 ${name}` : t("qSync");
  }
  if (/minecraft\/loaders/.test(p)) return t("instanceLoaders");
  if (/minecraft\/profiles\/install/.test(p)) return t("instanceDownloading");
  if (/minecraft\/launch/.test(p)) return t("launchOk");
  if (/\/api\/java\/install/.test(p)) return t("javaInstalling");
  if (/\/api\/7zip\/install/.test(p)) return t("zipInstalling");
  if (/minecraft\/profiles/.test(p)) return t("instanceCreating");
  if (/\/api\/images/.test(p)) return t("qExtract");
  if (/\/rawg/.test(p)) return t("qRawg");
  if (/\/import/.test(p)) return t("qExtract");
  if (/download/.test(p)) return t("qDown");
  if (/refresh|localize|translate/.test(p)) return t("qSync");
  return "";
}

function paintLiveTasks(freshId) {
  const list = $("tasks-live");
  if (!list) return;
  const want = new Set(liveTasks.map((task) => String(task.id)));
  list.querySelectorAll("[data-live]").forEach((node) => {
    if (!want.has(node.dataset.live)) node.remove();
  });
  liveTasks.forEach((task, index) => {
    let node = list.querySelector(`[data-live="${task.id}"]`);
    if (!node) {
      node = document.createElement("li");
      node.dataset.live = String(task.id);
      node.className = "tasks-item" + (task.id === freshId ? " tasks-in" : "");
      node.innerHTML = `<span class="tasks-mark" aria-hidden="true">↓</span><span><b></b><small class="tasks-pct"></small></span><span></span><div class="tasks-bar"><span></span></div>`;
      list.insertBefore(node, list.children[index] || null);
    }
    const pct = taskPct(task);
    node.querySelector("b").textContent = task.label;
    node.querySelector(".tasks-pct").textContent = `${pct}%`;
    node.querySelector(".tasks-bar span").style.width = `${pct}%`;
  });
  list.hidden = !liveTasks.length;
}

function beginLoad(label) {
  const text = String(label || "").trim();
  if (!text) return 0;
  const task = { id: taskSeq++, label: text, started: performance.now() };
  liveTasks.unshift(task);
  paintLiveTasks(task.id);
  paintSysActivity();
  if (!loadFrame) {
    const tick = () => {
      if (!liveTasks.length) {
        loadFrame = 0;
        return;
      }
      paintLiveTasks();
      loadFrame = requestAnimationFrame(tick);
    };
    loadFrame = requestAnimationFrame(tick);
  }
  return task.id;
}

function endLoad(id) {
  if (!id) return;
  const index = liveTasks.findIndex((task) => task.id === id);
  if (index < 0) return;
  const [task] = liveTasks.splice(index, 1);
  pushDoneTask(task.label);
  paintLiveTasks();
  paintSysActivity();
}

function syncMute() {
  const btn = $("mute");
  if (!btn) return;
  const ico = $("mute-ico");
  const wave = "M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12";
  const slash = "M11 5 6 9H3v6h3l5 4V5zM16 9l5 6M21 9l-5 6";
  if (ico) ico.querySelector("path").setAttribute("d", state.muted ? slash : wave);
  btn.classList.toggle("on", state.muted);
  btn.title = state.muted ? t("unmute") : t("muteOn");
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[ch]));
}

function fmtDate(iso) {
  if (!iso) return t("noDate");
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
  if (!node) return;
  node.hidden = false;
  node.className = `toast ${kind}`;
  node.textContent = text;
  // popover = capa sobre <dialog modal> (z-index solo no basta)
  try {
    if (typeof node.showPopover === "function") node.showPopover();
  } catch (_) { /* ya abierto */ }
  if (kind === "bad") sfx.err();
  else if (kind === "warn") sfx.warn();
  else sfx.ok();
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => {
      try {
        if (typeof node.hidePopover === "function" && node.matches(":popover-open")) node.hidePopover();
      } catch (_) { /* ignore */ }
      node.hidden = true;
      node.classList.remove("out");
    }, 220);
  }, 3200);
}

async function api(path, options = {}) {
  const dl = String(path).match(/\/api\/mods\/([0-9a-f]{32})\/download/);
  const job = beginLoad(queueHint(path));
  if (dl) {
    markDownloading(dl[1], true);
    openTasks();
  }
  try {
  const headers = new Headers(options.headers || {});
  const token = sessionToken();
  if (token && !headers.has("X-Session")) headers.set("X-Session", token);
  let res;
  try {
    res = await fetch(path, { ...options, headers, credentials: "same-origin" });
  } catch (error) {
    pushLog("error", `${options.method || "GET"} ${path} · ${error.message || "sin conexión"}`);
    throw error;
  }
  const type = res.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error || "No se pudo completar.");
      error.status = res.status;
      error.payload = data;
      pushLog("error", `${options.method || "GET"} ${path} · ${error.message}`);
      throw error;
    }
    pushLog("req", `${options.method || "GET"} ${path} · ${res.status}`);
    return data;
  }
  if (!res.ok) {
    pushLog("error", `${options.method || "GET"} ${path} · ${res.status}`);
    throw new Error("No se pudo completar.");
  }
  pushLog("req", `${options.method || "GET"} ${path} · ${res.status}`);
  return res;
  } finally {
    endLoad(job);
    if (dl) markDownloading(dl[1], false);
  }
}

function joinPackPath(dir, name) {
  const base = String(dir || "").replace(/[\\/]+$/, "");
  const file = String(name || "").replace(/^[/\\]+/, "");
  if (!base) return file;
  return `${base}\\${file}`;
}

async function load() {
  const data = await api("/api/library");
  state.mods = data.mods || [];
  state.modpacks = data.modpacks || [];
  state.catalog = data.catalog || { platforms: [], games: [], categories: [], skills: [], rules: [] };
  state.sources = data.sources || {};
  if (data.packsDir) state.packsDir = String(data.packsDir);
  else {
    try {
      const host = window.pywebview && window.pywebview.api;
      if (host && typeof host.packs_dir === "function") {
        const dir = await host.packs_dir();
        if (dir) state.packsDir = String(dir);
      }
    } catch (_) { /* ignore */ }
  }
  {
    const saved = localStorage.getItem("wi-mod-lang");
    if (saved === "en" || saved === "es") applyLang(saved);
    else if (data.language === "en" || data.language === "es") applyLang(data.language);
  }
  if (data.theme) applyTheme(data.theme);
  if (data.keys) {
    state.keys = {
      nexus: !!data.keys.nexus,
      curseforge: !!data.keys.curseforge,
      steam: !!data.keys.steam,
      rawg: !!data.keys.rawg,
    };
  }
  paintKeys();
  const alive = new Set(state.mods.map((mod) => mod.id));
  state.selected.forEach((id) => { if (!alive.has(id)) state.selected.delete(id); });
  adoptServerGamePrefs();
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
  paintChrome();
  syncDock();
}

const AVATAR_SKIN = ["#f6d7b8", "#e8b892", "#c68642", "#8d5524", "#ffdfc4", "#f1c27d"];
const AVATAR_HAIR = ["#2b2118", "#6b4423", "#d4a017", "#1f3b73", "#b84a62", "#3d3d3d", "#efe6d8"];
const AVATAR_SHIRT = ["#e2a45c", "#7f9c7a", "#5c7ea2", "#c46b4a", "#8d6cab", "#2f2a26"];

function rollAvatar() {
  const img = $("dock-avatar");
  if (!img) return;
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const skin = pick(AVATAR_SKIN);
  const hair = pick(AVATAR_HAIR);
  const shirt = pick(AVATAR_SHIRT);
  const cuts = [
    `<path d="M18 38c2-16 10-26 30-26s28 10 30 26c-6-8-14-12-30-12s-24 4-30 12z" fill="${hair}"/>`,
    `<path d="M16 42c0-20 12-32 32-32s32 12 32 32c-8-10-18-14-32-14s-24 4-32 14z" fill="${hair}"/>`,
    `<path d="M20 36c4-18 14-24 28-24 10 0 18 4 24 14 2 8-4 4-8 2-6-8-12-10-20-8-8 2-16 8-24 16z" fill="${hair}"/>`,
    `<circle cx="48" cy="28" r="8" fill="${hair}"/><path d="M22 40c2-14 10-22 26-22s24 8 26 22c-8-6-16-8-26-8s-18 2-26 8z" fill="${hair}"/>`,
  ];
  const eyes = Math.random() > 0.45
    ? `<circle cx="36" cy="48" r="3" fill="#2b2118"/><circle cx="60" cy="48" r="3" fill="#2b2118"/>`
    : `<path d="M32 48h8M56 48h8" stroke="#2b2118" stroke-width="2.4" stroke-linecap="round"/>`;
  const mouth = Math.random() > 0.35
    ? `<path d="M40 62c4 6 12 6 16 0" fill="none" stroke="#a15c48" stroke-width="2.2" stroke-linecap="round"/>`
    : `<path d="M40 64h16" stroke="#a15c48" stroke-width="2.2" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${shirt}"/><circle cx="48" cy="46" r="22" fill="${skin}"/>${pick(cuts)}${eyes}${mouth}</svg>`;
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function setDockName(name) {
  const node = $("dock-name");
  if (node && name) node.textContent = name;
}

function applyDockName() {
  const custom = state.nameSource === "custom";
  const machine = state.windowsUser || state.pcName;
  setDockName((custom ? state.customName || machine : machine) || "WYDEX");
  const customBtn = $("name-custom");
  const field = $("name-custom-field");
  const input = $("name-custom-input");
  if (customBtn) customBtn.hidden = custom;
  if (field) field.hidden = !custom;
  if (input && document.activeElement !== input) input.value = state.customName;
}

function paintAppVersion(version) {
  const node = $("app-version");
  if (!node) return;
  const text = String(version || "").trim();
  if (text) node.textContent = text.startsWith("v") ? text : `v${text}`;
}

if ($("app-version")) {
  $("app-version").addEventListener("click", (event) => {
    const host = window.pywebview && window.pywebview.api;
    if (host && typeof host.site === "function") {
      event.preventDefault();
      host.site();
    }
  });
}

function rememberMachineNames(session) {
  state.windowsUser = String(session?.windowsUser || "").trim();
  state.pcName = String(session?.pcName || "").trim();
  if (!state.windowsUser && !state.pcName) {
    state.windowsUser = String(session?.machineUser || session?.username || "").trim();
  }
  applyDockName();
}

function syncLangToggle() {
  const btn = $("lang-toggle");
  const label = $("lang-label");
  if (!btn || !label) return;
  const toEn = state.lang !== "en";
  label.textContent = toEn ? t("english") : t("spanish");
  btn.title = toEn ? t("switchEn") : t("switchEs");
  btn.setAttribute("aria-label", btn.title);
}

function wallpaperCover(domain) {
  const row = LOCAL_COVERS[String(domain || "").toLowerCase()];
  if (row?.[1]) return row[1];
  return gameCover(domain);
}

function applyCoverBg() {
  const url = state.coverBg && state.game ? wallpaperCover(state.game) : "";
  const on = !!url;
  document.body.classList.toggle("cover-bg", on);
  document.body.style.setProperty("--cover-image", on ? `url("${String(url).replace(/"/g, "")}")` : "none");
  syncCoverToggle();
}

function syncCoverToggle() {
  const btn = $("cover-bg");
  const label = $("cover-bg-label");
  if (!btn || !label) return;
  btn.classList.toggle("on", state.coverBg);
  label.textContent = state.coverBg ? t("coverBgDefault") : t("coverBgUse");
  btn.title = state.coverBg ? t("coverBgTitleOff") : t("coverBgTitleUse");
  btn.setAttribute("aria-label", btn.title);
}

let lastStatus = null;

function fmtDisk(bytes) {
  const gb = bytes / (1024 ** 3);
  if (gb >= 10) return `${Math.round(gb)} GB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.max(0, Math.round(bytes / (1024 ** 2)))} MB`;
}

function gameModsBytes() {
  return scopedMods().reduce((sum, mod) => {
    for (const file of mod.files || []) sum += Number(file.size) || 0;
    return sum;
  }, 0);
}

function paintDockStats(data) {
  if (data) lastStatus = data;
  const info = lastStatus || {};
  const mods = $("dock-mods");
  if (mods) {
    mods.dataset.tip = t("diskModsTip");
    mods.textContent = t("dockMods", { n: fmtDisk(gameModsBytes()) });
  }
  const disk = $("dock-disk");
  if (disk) {
    disk.dataset.tip = t("diskTip");
    const free = Number(info.diskFreeBytes) || 0;
    if (free > 0) {
      const gb = free / (1024 ** 3);
      disk.textContent = t("dockFree", { n: fmtDisk(free) });
      disk.hidden = false;
      disk.classList.toggle("warn", gb < 5 && gb >= 2);
      disk.classList.toggle("bad", gb < 2);
    } else {
      disk.textContent = "—";
      disk.hidden = true;
      disk.classList.remove("warn", "bad");
    }
  }
  const ram = $("dock-ram");
  if (ram) {
    ram.dataset.tip = t("ramTip");
    const bytes = Number(info.ramBytes) || 0;
    if (bytes > 0) ram.textContent = t("ramUse", { n: `${Math.max(1, Math.round(bytes / (1024 ** 2)))} MB` });
  }
}

async function pollDock() {
  try {
    const headers = {};
    const token = sessionToken();
    if (token) headers["X-Session"] = token;
    const res = await fetch("/api/status", { headers, credentials: "same-origin" });
    if (!res.ok) throw new Error("status");
    const info = await res.json();
    paintDockStats(info);
    await takeEvents(info.events);
  } catch {
    paintDockStats({
      diskFreeBytes: lastStatus?.diskFreeBytes || 0,
      ramBytes: lastStatus?.ramBytes || 0,
    });
  }
}

let lastEvent = 0;
const downloading = new Set();
const cardJobs = new Map();

function markDownloading(id, on) {
  if (!id) return;
  if (on) downloading.add(id);
  else downloading.delete(id);
  document.querySelectorAll(`.card[data-id="${id}"]`).forEach((node) => node.classList.toggle("downloading", on));
}

function openTasks() {
  const pop = $("tasks-pop");
  const button = $("sys-downloads");
  if (!pop) return;
  pop.hidden = false;
  if (button) button.setAttribute("aria-expanded", "true");
}

async function takeEvents(events) {
  const fresh = (events || []).filter((ev) => Number(ev.n) > lastEvent);
  if (!fresh.length) return;
  lastEvent = Math.max(...fresh.map((ev) => Number(ev.n) || 0));
  let reload = false;
  fresh.forEach((ev) => {
    const modId = String(ev.modId || "");
    if (ev.phase === "download" && modId) {
      if (!cardJobs.has(modId)) cardJobs.set(modId, beginLoad(ev.name ? `⬇️ ${ev.name}` : (ev.message || t("qDown"))));
      markDownloading(modId, true);
      openTasks();
      reload = true;
      return;
    }
    if ((ev.phase === "done" || ev.phase === "fail") && modId) {
      const job = cardJobs.get(modId);
      if (job) {
        endLoad(job);
        cardJobs.delete(modId);
      }
      markDownloading(modId, false);
    }
    if (ev.message && ev.phase !== "download") {
      toast(ev.message, ev.ok === false ? "bad" : "");
      if (ev.ok === false) pushLog("error", ev.message);
    }
    if (ev.reload) reload = true;
  });
  if (!reload) return;
  const open = $("detail-dialog")?.open ? ($("detail")?.dataset.id || "") : "";
  await load();
  downloading.forEach((id) => markDownloading(id, true));
  if (!open) return;
  const mod = state.mods.find((item) => item.id === open);
  const hint = $("detail-files");
  if (mod && hint) hint.textContent = filesHint(mod);
}

function applyDockVis() {
  const on = localStorage.getItem("wi-mod-dock") !== "0";
  document.body.classList.toggle("dock-off", !on);
  const show = $("dock-show");
  if (show) show.hidden = on;
}

function syncDock() {
  syncLangToggle();
  syncCoverToggle();
  paintKeys();
  paintDockStats();
  applyDockVis();
}

function paintKeys() {
  const keys = state.keys || {};
  const pills = [...document.querySelectorAll("#dock-keys [data-key]")];
  const total = pills.length || 5;
  let ready = 0;
  pills.forEach((node) => {
    const id = node.dataset.key;
    const on = id === "modrinth" || !!keys[id];
    node.classList.toggle("on", on);
    const label = node.querySelector("em");
    if (label) label.textContent = on ? t("keyOn") : t("keyOff");
    if (on) ready += 1;
  });
  const missing = total - ready;
  const summary = $("keys-summary");
  const count = $("keys-missing");
  if (count) count.textContent = `${ready}/${total}`;
  if (summary) {
    summary.classList.toggle("ready", missing === 0);
    summary.title = missing
      ? t("keysSome", { ready, total })
      : t("keysReady");
    summary.setAttribute("aria-label", summary.title);
  }
}

function closeKeysStack() {
  const node = $("dock-keys");
  if (!node) return;
  node.classList.remove("open");
  const summary = $("keys-summary");
  if (summary) summary.setAttribute("aria-expanded", "false");
}

function softChange(run) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    run();
    return Promise.resolve();
  }
  const root = document.documentElement;
  root.classList.add("fx-out");
  return new Promise((resolve) => {
    setTimeout(() => {
      run();
      root.classList.remove("fx-out");
      resolve();
    }, 180);
  });
}

async function setLanguage(lang) {
  const next = lang === "en" ? "en" : "es";
  if (next === state.lang) return;
  await softChange(() => {
    applyLang(next);
    render();
  });
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

const GAME_SCORES = {
  worldofwarcraftclassic: 4.15,
  projectzomboid: 3.88,
  fallout4: 3.81,
  newvegas: 4.43,
  gta5: 4.47,
  gtasa: 4.5,
  minecraft: 4.44,
  stalkershadowofchernobyl: 4.27,
  stardewvalley: 4.39,
  skyrimspecialedition: 4.45,
};

function readGamePrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem("wi-mod-game-prefs") || "{}");
    return {
      pinned: Array.isArray(raw.pinned) ? raw.pinned.map((id) => String(id)) : [],
      favorite: String(raw.favorite || ""),
    };
  } catch (_) {
    return { pinned: [], favorite: "" };
  }
}

function writeGamePrefs(prefs) {
  localStorage.setItem("wi-mod-game-prefs", JSON.stringify({
    pinned: prefs.pinned || [],
    favorite: prefs.favorite || "",
  }));
}

function gameMeta(id) {
  const key = String(id || "");
  const game = catalogGame(key) || {};
  const prefs = readGamePrefs();
  const pinned = Object.prototype.hasOwnProperty.call(game, "pinned")
    ? Boolean(game.pinned)
    : prefs.pinned.includes(key);
  const favorite = Object.prototype.hasOwnProperty.call(game, "favorite")
    ? Boolean(game.favorite)
    : prefs.favorite === key;
  const listed = prefs.pinned.indexOf(key);
  const pinOrder = Number.isFinite(Number(game.pinOrder)) ? Number(game.pinOrder) : listed;
  return { pinned, favorite, pinOrder };
}

function gameScore(id) {
  const game = catalogGame(id);
  const raw = game && game.rating != null && game.rating !== ""
    ? game.rating
    : GAME_SCORES[String(id || "").toLowerCase()];
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  return (Math.round(n * 10) / 10).toFixed(1);
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
  return [...map.entries()].sort((a, b) => {
    const left = gameMeta(a[0]);
    const right = gameMeta(b[0]);
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    if (left.pinned && left.pinOrder !== right.pinOrder) return left.pinOrder - right.pinOrder;
    return a[1].localeCompare(b[1], "es");
  });
}

let gameBooted = false;

function favoriteGameId() {
  const fromCat = (state.catalog.games || []).find((item) => item && item.favorite && item.gameDomain);
  if (fromCat) return String(fromCat.gameDomain);
  return readGamePrefs().favorite;
}

function ensureActiveGame() {
  const options = gameOptions();
  if (!gameBooted) {
    gameBooted = true;
    const fav = favoriteGameId();
    if (fav && options.some(([id]) => id === fav)) state.game = fav;
  }
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
  const row = LOCAL_COVERS[String(domain || "").toLowerCase()];
  const stored = catalogGame(domain)?.imageUrl || "";
  if (stored && !stored.includes("/screenshots/")) return stored;
  if (row) return row[1];
  return stored;
}

const LOCAL_COVERS = {
  darksoulsremastered: ["/brand/darksoulsremastered.jpg", "https://media.rawg.io/media/games/29c/29c6c21cc0c78cff6f45d23631cc82f4.jpg"],
  minecraft: ["/brand/minecraft.jpg", "https://media.rawg.io/media/games/b4e/b4e4c73d5aa4ec66bbf75375c4847a2b.jpg"],
  stardewvalley: ["/brand/stardewvalley.jpg", "https://media.rawg.io/media/games/713/713269608dc8f2f40f5a670a14b2de94.jpg"],
};

function gameMark(domain) {
  const game = catalogGame(domain);
  const row = LOCAL_COVERS[String(domain || "").toLowerCase()];
  if (row) return { src: row[0], fallback: row[1], logo: false };
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

function paintGameMenu() {
  const menu = $("game-menu");
  if (!menu || menu.hidden) return;
  let search = menu.querySelector(".game-menu-search");
  if (!search) {
    menu.innerHTML = `<input class="game-menu-search" type="search" placeholder="${esc(t("searchGame"))}" autocomplete="off" spellcheck="false"><div class="game-menu-list"></div><button type="button" id="game-add" class="game-menu-add" title="${esc(t("addGameTitle"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>${esc(t("addGame"))}</button>`;
    bindGameAdd();
    search = menu.querySelector(".game-menu-search");
    search.addEventListener("input", paintGameMenu);
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeGameMenu();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const first = menu.querySelector(".game-menu-list [data-game]");
        if (first) first.click();
      }
    });
  }
  const query = search.value.trim().toLowerCase();
  const options = gameOptions().filter(([id, label]) => (
    !query || String(label).toLowerCase().includes(query) || String(id).toLowerCase().includes(query)
  ));
  const list = menu.querySelector(".game-menu-list");
  list.innerHTML = options.length
    ? options.map(([id, label]) => {
      const mark = gameMark(id);
      const meta = gameMeta(id);
      const score = gameScore(id);
      return `<button type="button" role="option" data-game="${esc(id)}" class="${id === state.game ? "on" : ""}">
        ${mark.src ? `<img alt="" class="${mark.logo ? "is-logo" : ""}" src="${esc(mark.src)}"${mark.fallback ? ` data-fallback="${esc(mark.fallback)}"` : ""} onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;this.removeAttribute('data-fallback')}">` : `<img alt="" hidden>`}
        <span class="game-menu-name">${esc(label)}</span>
        <span class="game-score">${score ? esc(score) : ""}</span>
        <span class="game-pin ${meta.pinned ? "on" : ""}" data-pin="${esc(id)}" title="${meta.pinned ? t("pinOn") : t("pinOff")}">📌</span>
        <span class="game-fav ${meta.favorite ? "on" : ""}" data-fav="${esc(id)}" title="${meta.favorite ? t("favOn") : t("favOff")}">★</span>
      </button>`;
    }).join("")
    : `<p class="hint">Ningún juego.</p>`;
  list.querySelectorAll("[data-game]").forEach((button) => {
    button.onclick = (event) => {
      const pin = event.target.closest("[data-pin]");
      const fav = event.target.closest("[data-fav]");
      if (pin) {
        event.preventDefault();
        event.stopPropagation();
        toggleGamePin(pin.dataset.pin);
        return;
      }
      if (fav) {
        event.preventDefault();
        event.stopPropagation();
        toggleGameFavorite(fav.dataset.fav);
        return;
      }
      selectGame(button.dataset.game);
      closeGameMenu();
    };
  });
}

function prefsFromCatalog() {
  const pinned = (state.catalog.games || [])
    .filter((item) => item && item.pinned && item.gameDomain)
    .sort((a, b) => Number(a.pinOrder || 0) - Number(b.pinOrder || 0))
    .map((item) => String(item.gameDomain));
  const favorite = (state.catalog.games || []).find((item) => item && item.favorite && item.gameDomain);
  return { pinned, favorite: favorite ? String(favorite.gameDomain) : "" };
}

function adoptServerGamePrefs() {
  const remote = prefsFromCatalog();
  if (remote.pinned.length || remote.favorite) writeGamePrefs(remote);
}

async function saveGameFlag(id, body) {
  const prefs = readGamePrefs();
  let pinned = prefs.pinned.filter((item) => item !== id);
  let favorite = prefs.favorite;
  if ("pin" in body) {
    if (body.pin) {
      pinned.push(id);
      if (pinned.length > 3) pinned = pinned.slice(pinned.length - 3);
    }
  }
  if ("favorite" in body) favorite = body.favorite ? id : (favorite === id ? "" : favorite);
  writeGamePrefs({ pinned, favorite });
  paintGameMenu();
  try {
    let data = await api("/api/catalog/game-flag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (data.catalog) state.catalog = data.catalog;
    for (const extra of pinned) {
      if (prefsFromCatalog().pinned.includes(extra)) continue;
      data = await api("/api/catalog/game-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: extra, pin: true }),
      });
      if (data.catalog) state.catalog = data.catalog;
    }
    if (favorite && prefsFromCatalog().favorite !== favorite) {
      data = await api("/api/catalog/game-flag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: favorite, favorite: true }),
      });
      if (data.catalog) state.catalog = data.catalog;
    }
    if (state.catalog) writeGamePrefs(prefsFromCatalog());
    paintGameMenu();
  } catch (error) {
    const missing = /404|no encontr|not found/i.test(String(error.message || error));
    if (!missing) toast(error.message, "bad");
  }
}

function toggleGamePin(id) {
  saveGameFlag(id, { pin: !gameMeta(id).pinned });
}

function toggleGameFavorite(id) {
  saveGameFlag(id, { favorite: !gameMeta(id).favorite });
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
  paintGameMenu();
  paintGamePlay();
}

function gameHasLauncher(game) {
  const row = game || catalogGame(state.game) || {};
  return Boolean(String(row.launchPath || "").trim() || Number(row.steamAppId) > 0);
}

function paintGamePlay() {
  const btn = $("game-play");
  if (!btn) return;
  const linked = gameHasLauncher();
  btn.classList.toggle("need", !linked);
  const tip = linked ? t("launchLinked") : t("launchUnlinked");
  btn.title = tip;
  btn.setAttribute("aria-label", tip);
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
  if (current?.rawgId || current?.imageUrl) {
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
  const cover = gameCover(domain);
  const mods = scopedMods().length;
  const packs = packsForGame().length;
  const score = meta.metacritic == null ? null : Number(meta.metacritic);
  const tier = score == null ? "" : score >= 75 ? "good" : score >= 50 ? "mid" : "bad";
  const modsWord = t("modsN", { n: "" }).trim();
  const packsWord = t("packsN", { n: "" }).trim();
  const pile = (kind, label, items) => {
    const names = (items || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!names.length) return "";
    return `<span class="hero-chip ${kind} hero-pile" tabindex="0">${esc(label)}<span class="hero-pile-pop">${names.map((item) => `<i>${esc(item)}</i>`).join("")}</span></span>`;
  };
  const stats = `
    <div class="hero-stats">
      ${meta.released ? `<span class="hero-chip">${esc(meta.released)}</span>` : ""}
      ${pile("genre", t("tags"), meta.genres)}
      ${pile("plat", t("platforms"), meta.platforms)}
      ${meta.rating != null ? `<span class="hero-num"><b>★ ${esc(meta.rating)}</b><small>RAWG</small></span>` : ""}
      ${score != null ? `<span class="hero-num score ${tier}"><b>${esc(score)}</b><small>Metacritic</small></span>` : ""}
      <span class="hero-num"><b>${mods}</b><small>${esc(modsWord)}</small></span>
      <span class="hero-num"><b>${packs}</b><small>${esc(packsWord)}</small></span>
    </div>`;
  node.hidden = false;
  node.style.backgroundImage = "";
  const packStrip = packHeroStrip();
  const show = $("hero-show");
  if (localStorage.getItem("wi-mod-hero") === "0") {
    node.classList.add("mini");
    if (show) show.hidden = false;
    if (packStrip) {
      node.hidden = false;
      node.innerHTML = packStrip;
      bindPackDesc();
    } else {
      node.hidden = true;
      node.innerHTML = "";
    }
    return;
  }
  if (show) show.hidden = true;
  node.classList.remove("mini");
  node.innerHTML = `
    <div class="game-hero-inner">
      ${cover ? `<img class="game-hero-cover" alt="" src="${esc(cover)}">` : `<div class="game-hero-cover"></div>`}
      <div>
        <div class="game-hero-head">
          <h2>${esc(name)}</h2>
          <button type="button" class="game-hero-toggle" id="hero-toggle">${esc(t("hideCard"))}</button>
        </div>
        ${stats}
        <p class="desc">${esc((state.lang === "es" ? (meta.descriptionEs || meta.description) : meta.description) || t("heroFallback"))}</p>
        <div class="game-hero-links">
          ${meta.rawgUrl ? `<a href="${esc(meta.rawgUrl)}" target="_blank" rel="noreferrer">RAWG</a>` : ""}
          ${meta.website ? `<a href="${esc(meta.website)}" target="_blank" rel="noreferrer">${esc(t("officialSite"))}</a>` : ""}
          <a href="https://rawg.io" target="_blank" rel="noreferrer">${esc(t("rawgCredit"))}</a>
        </div>
      </div>
    </div>
    ${packStrip}
  `;
  $("hero-toggle").onclick = () => {
    localStorage.setItem("wi-mod-hero", "0");
    renderGameHero();
  };
  const inner = node.querySelector(".game-hero-inner");
  if (inner) {
    inner.onclick = (event) => {
      if (event.target.closest("#hero-toggle")) return;
      const link = event.target.closest("a");
      if (link) event.preventDefault();
      localStorage.setItem("wi-mod-hero", "0");
      renderGameHero();
    };
  }
  bindPackDesc();
}

function packHeroStrip() {
  if (!state.modpack) return "";
  const pack = packById(state.modpack);
  if (!pack) return "";
  const icon = markIcon("modpack", pack.id) || `<span class="side-emoji">📦</span>`;
  const desc = String(pack.notes || "").trim();
  const text = desc
    ? `<p class="pack-hero-desc">${esc(desc)}</p>`
    : `<button type="button" class="pack-hero-desc pack-hero-add" id="pack-desc-add">${esc(t("addDesc"))}</button>`;
  return `<div class="pack-hero">${icon}<div><p class="pack-hero-kicker">Modpack</p><p class="pack-hero-name">${esc(pack.name || "")}</p>${text}
    <div class="pack-hero-actions">
      <button type="button" class="ghost" id="pack-enable">${esc(t("packEnable"))}</button>
      <button type="button" class="ghost" id="pack-disable">${esc(t("packDisable"))}</button>
    </div>
  </div></div>`;
}

function bindPackDesc() {
  const btn = $("pack-desc-add");
  if (!btn) return;
  btn.onclick = () => {
    if (!state.modpack) return;
    openModpacksDialog();
    editModpack(state.modpack);
    $("mp-notes")?.focus();
  };
  const enable = $("pack-enable");
  const disable = $("pack-disable");
  if (enable) enable.onclick = () => setPackActive(true);
  if (disable) disable.onclick = () => setPackActive(false);
}

async function setPackActive(active) {
  if (!state.modpack) return;
  try {
    const data = await api("/api/mods/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modpackId: state.modpack, active: Boolean(active) }),
    });
    toast(active ? t("activeOk", { n: data.count || 0 }) : t("inactiveOk", { n: data.count || 0 }));
    sfx.ok();
    await load();
  } catch (error) {
    toast(error.message, "bad");
    sfx.err();
  }
}

function modDownloaded(mod) {
  return (mod?.files || []).some((file) => file && String(file.storedAs || "").trim());
}

function fileState(mod) {
  if (!modDownloaded(mod)) return t("noLocal");
  const bits = [t("gotOn")];
  if (mod.installed) bits.push(t("installed"));
  if (statusOn(mod, "in")) bits.push(t("activeOn"));
  return bits.join(" · ");
}

async function setMarkedActive(active) {
  const ids = [...state.selected].filter((id) => {
    const mod = state.mods.find((item) => item.id === id);
    return mod && modDownloaded(mod);
  });
  if (!ids.length) {
    toast(t("needDownload"), "warn");
    return;
  }
  const button = active ? $("bulk-enable") : $("bulk-disable");
  setLoading(button, true, "…");
  try {
    const data = await api("/api/mods/active", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, active: Boolean(active) }),
    });
    toast(active ? t("activeOk", { n: data.count || 0 }) : t("inactiveOk", { n: data.count || 0 }));
    sfx.ok();
    await load();
  } catch (error) {
    toast(error.message, "bad");
    sfx.err();
  } finally {
    setLoading(button, false);
  }
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
  const listQ = String(state.listQuery || "").trim().toLowerCase();
  let mods = scopedMods().filter((mod) => {
    if (state.platform && String(mod.platform || "Nexus") !== state.platform) return false;
    if (state.modpack && String(mod.modpackId || "") !== state.modpack) return false;
    if (state.packCat && String(mod.modpackCategoryId || "") !== state.packCat) return false;
    if (state.category && String(mod.category || "General") !== state.category) return false;
    const hasFiles = (mod.files || []).length > 0;
    if (state.files === "with" && !hasFiles) return false;
    if (state.files === "without" && hasFiles) return false;
    if (state.onlyUpdates && !mod.updateAvailable) return false;
    if (!q && !listQ) return true;
    const blob = `${mod.name} ${mod.author} ${mod.gameName} ${mod.category} ${mod.categoryEs || ""} ${mod.platform} ${packLabel(mod)} ${mod.summary} ${mod.summaryEs || ""} ${mod.techNotes || ""} ${mod.compatNotes || ""} ${mod.notes || ""}`.toLowerCase();
    if (q && !blob.includes(q)) return false;
    if (listQ && !blob.includes(listQ)) return false;
    return true;
  });
  const lastDownload = (mod) => {
    const stamps = (mod.files || []).map((file) => String(file.addedAt || "")).filter(Boolean);
    return stamps.length ? stamps.sort().at(-1) : "";
  };
  const by = {
    added: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)),
    downloaded: (a, b) => lastDownload(b).localeCompare(lastDownload(a)) || String(b.addedAt).localeCompare(String(a.addedAt)),
    updated: (a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    name: (a, b) => String(a.name).localeCompare(String(b.name), "es"),
    priority: (a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0) || String(a.name).localeCompare(String(b.name), "es"),
  };
  if (state.modpack) {
    mods.sort((a, b) => (Number(a.packOrder) || 0) - (Number(b.packOrder) || 0) || String(a.name).localeCompare(String(b.name), "es"));
  } else {
    mods.sort(by[state.sort] || by.added);
  }
  return mods;
}

function clearFilters() {
  state.platform = "";
  state.modpack = "";
  state.packCat = "";
  state.category = "";
  state.files = "all";
  state.query = "";
  state.listQuery = "";
  state.sideQuery = "";
  Object.keys(state.sideNav).forEach((key) => { state.sideNav[key] = { page: 1 }; });
  if ($("search")) $("search").value = "";
  if ($("list-search")) $("list-search").value = "";
  if ($("side-search")) $("side-search").value = "";
}

function askInput({
  title, hint = "", placeholder = "", value = "", okLabel = "Añadir",
  mode = "text", options = [], browse = "", label = "",
}) {
  return new Promise((resolve) => {
    const dialog = $("ask-dialog");
    const textWrap = $("ask-text-wrap");
    const selectWrap = $("ask-select-wrap");
    const text = $("ask-text");
    const select = $("ask-select");
    const browseBtn = $("ask-browse");
    const textLabel = $("ask-text-label");
    $("ask-title").textContent = title;
    $("ask-hint").hidden = !hint;
    $("ask-hint").textContent = hint || "";
    $("ask-ok").textContent = okLabel;
    if (textLabel) textLabel.textContent = label || t("name");
    const finish = (result) => {
      dialog.close();
      resolve(result);
    };
    if (mode === "select") {
      textWrap.hidden = true;
      selectWrap.hidden = false;
      text.required = false;
      if (browseBtn) browseBtn.hidden = true;
      select.innerHTML = options.map(([id, label]) => (
        `<option value="${esc(id)}">${esc(label)}</option>`
      )).join("");
    } else {
      textWrap.hidden = false;
      selectWrap.hidden = true;
      text.required = !browse;
      text.value = value || "";
      text.placeholder = placeholder || "";
      if (browseBtn) {
        browseBtn.hidden = !browse;
        browseBtn.textContent = t("browse");
      }
    }
    const onBrowse = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      let picked = "";
      if (browse === "folder") picked = await pickFolderPath({ forceNative: true });
      else if (browse === "file") picked = await pickExePath({ forceNative: true });
      if (picked) {
        text.value = picked;
        text.focus();
      }
    };
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
      browseBtn?.removeEventListener("click", onBrowse);
    };
    $("ask-form").addEventListener("submit", onSubmit);
    $("ask-cancel").addEventListener("click", onCancel);
    $("ask-x").addEventListener("click", onCancel);
    browseBtn?.addEventListener("click", onBrowse);
    sfx.open();
    dialog.showModal();
    if (mode !== "select") setTimeout(() => (browse ? browseBtn || text : text)?.focus?.(), 30);
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

const SIDE_PAGE_SIZES = [5, 8, 15, 30];

function sidePageSize() {
  const n = Number(state.sidePageSize) || 8;
  return SIDE_PAGE_SIZES.includes(n) ? n : 8;
}

function modsForSide(kind, value) {
  const id = String(value || "");
  if (!id) return [];
  return scopedMods().filter((mod) => {
    if (kind === "platform") return String(mod.platform || "Nexus") === id;
    if (kind === "modpack") return String(mod.modpackId || "") === id;
    if (kind === "packCat") return String(mod.modpackId || "") === String(state.modpack || "") && String(mod.modpackCategoryId || "") === id;
    if (kind === "category") return String(mod.category || "General") === id;
    return false;
  }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
}

function sideOpenKey(kind, value) {
  return `${kind}:${value}`;
}

function sideGroupOpen(kind, value, _current) {
  const key = sideOpenKey(kind, value);
  if (state.sideOpen[key] === true) return true;
  if (state.sideOpen[key] === false) return false;
  if (kind === "category") return false;
  return true;
}

function sidePaged(key, items, labelOf, modsOf) {
  if (!state.sideNav[key]) state.sideNav[key] = { page: 1 };
  const nav = state.sideNav[key];
  const q = String(state.sideQuery || "").trim().toLowerCase();
  const filtered = !q ? items.slice() : items.filter((item) => {
    if (String(labelOf(item) || "").toLowerCase().includes(q)) return true;
    const mods = typeof modsOf === "function" ? modsOf(item) : [];
    return mods.some((mod) => String(mod.name || "").toLowerCase().includes(q));
  });
  const size = sidePageSize();
  const pages = Math.max(1, Math.ceil(filtered.length / size) || 1);
  nav.page = Math.min(Math.max(1, Number(nav.page) || 1), pages);
  const start = (nav.page - 1) * size;
  const shown = filtered.slice(start, start + size);
  const need = filtered.length > size;
  if (!need) {
    nav.page = 1;
    return { shown: filtered, navHtml: "" };
  }
  const sizes = SIDE_PAGE_SIZES.map((n) => (
    `<option value="${n}"${n === size ? " selected" : ""}>${n}</option>`
  )).join("");
  const navHtml = `<div class="side-nav" data-side="${esc(key)}">
    <div class="side-nav-pager">
      <label class="side-nav-size-wrap" title="${esc(t("sidePageSize"))}">
        <select class="side-nav-size" data-side="${esc(key)}" aria-label="${esc(t("sidePageSize"))}">${sizes}</select>
      </label>
      <input type="number" class="side-nav-page" data-side="${esc(key)}" min="1" max="${pages}" value="${nav.page}" aria-label="${esc(t("sidePage"))}">
      <span class="side-nav-of">/ ${pages}</span>
      <button type="button" class="side-nav-prev" data-side="${esc(key)}" ${nav.page <= 1 ? "disabled" : ""} title="${esc(t("sidePrev"))}">«</button>
      <button type="button" class="side-nav-next" data-side="${esc(key)}" ${nav.page >= pages ? "disabled" : ""} title="${esc(t("sideNext"))}">»</button>
    </div>
  </div>`;
  return { shown, navHtml };
}

function bindSideNavControls() {
  document.querySelectorAll(".side-nav-page").forEach((input) => {
    input.onchange = () => {
      const side = input.dataset.side;
      state.sideNav[side] = state.sideNav[side] || { page: 1 };
      state.sideNav[side].page = Math.max(1, Number(input.value) || 1);
      renderFilters();
    };
  });
  document.querySelectorAll(".side-nav-size").forEach((select) => {
    select.onchange = () => {
      state.sidePageSize = Number(select.value) || 8;
      localStorage.setItem("wi-mod-side-page", String(state.sidePageSize));
      Object.keys(state.sideNav).forEach((key) => { state.sideNav[key].page = 1; });
      renderFilters();
    };
  });
  document.querySelectorAll(".side-nav-prev").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const side = button.dataset.side;
      state.sideNav[side] = state.sideNav[side] || { page: 1 };
      state.sideNav[side].page = Math.max(1, (state.sideNav[side].page || 1) - 1);
      renderFilters();
    };
  });
  document.querySelectorAll(".side-nav-next").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const side = button.dataset.side;
      state.sideNav[side] = state.sideNav[side] || { page: 1 };
      state.sideNav[side].page = (state.sideNav[side].page || 1) + 1;
      renderFilters();
    };
  });
  document.querySelectorAll("[data-side-twist]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const key = button.dataset.sideTwist;
      const parts = key.split(":");
      const kind = parts[0];
      const value = parts.slice(1).join(":");
      const current = kind === "platform" ? state.platform
        : kind === "modpack" ? state.modpack
          : kind === "packCat" ? state.packCat
            : state.category;
      state.sideOpen[key] = !sideGroupOpen(kind, value, current);
      renderFilters();
    };
  });
  document.querySelectorAll("[data-mod-jump]").forEach((button) => {
    button.onclick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const id = button.dataset.modJump;
      if (!id) return;
      sfx.click();
      openDetail(id);
    };
  });
  bindSideSearch();
}

function bindSideSearch() {
  const input = $("side-search");
  if (!input || input.dataset.bound) return;
  input.dataset.bound = "1";
  input.value = state.sideQuery || "";
  input.addEventListener("input", () => {
    state.sideQuery = input.value;
    Object.keys(state.sideNav).forEach((key) => { state.sideNav[key].page = 1; });
    renderFilters();
    const again = $("side-search");
    if (again) {
      again.focus();
      const caret = again.value.length;
      if (again.setSelectionRange) again.setSelectionRange(caret, caret);
    }
  });
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
  const platformPage = sidePaged(
    "platforms",
    platformMap,
    (row) => row.label,
    (row) => modsForSide("platform", row.id),
  );
  $("platforms").innerHTML = platformPage.navHtml
    + sideEntry(t("allF"), "", state.platform, "platform")
    + platformPage.shown.map((row) => (
      sideEntry(`${row.label} (${row.count})`, row.id, state.platform, "platform", modsForSide("platform", row.id))
    )).join("");

  const gamePacks = packsForGame();
  const packPage = sidePaged(
    "modpacks",
    gamePacks,
    (pack) => pack.name,
    (pack) => modsForSide("modpack", pack.id),
  );
  const packChips = packPage.shown.map((pack) => {
    const n = scopedMods().filter((mod) => mod.modpackId === pack.id).length;
    return sideEntry(`${pack.name} (${n})`, pack.id, state.modpack, "modpack", modsForSide("modpack", pack.id));
  });
  let inside = "";
  if (state.modpack) {
    const pack = packById(state.modpack);
    const packCats = pack ? (pack.categories || []) : [];
    const catPage = sidePaged(
      "packcats",
      packCats,
      (cat) => cat.name,
      (cat) => modsForSide("packCat", cat.id),
    );
    const rows = catPage.shown.map((cat) => {
      const n = scopedMods().filter((mod) => mod.modpackId === pack.id && mod.modpackCategoryId === cat.id).length;
      return sideEntry(`${cat.name} (${n})`, cat.id, state.packCat, "packCat", modsForSide("packCat", cat.id), {
        emoji: cat.emoji,
        imageUrl: cat.imageUrl,
      });
    }).join("");
    inside = `<div class="pack-cats">
      <div class="side-head">
        <p class="side-label">Dentro del pack</p>
        <button type="button" class="side-add" data-add="packcat" title="Añadir categoría">+</button>
      </div>
      ${catPage.navHtml}${sideEntry(t("allF"), "", state.packCat, "packCat")}${rows}
    </div>`;
  }
  $("modpacks").innerHTML = packPage.navHtml + sideEntry(t("allM"), "", state.modpack, "modpack") + packChips.join("") + inside;

  const cats = counts((mod) => mod.category || "General");
  (state.catalog.categories || []).forEach((name) => {
    if (!cats.some((row) => row.id === name)) cats.push({ id: name, label: name, count: 0 });
  });
  cats.sort((a, b) => a.label.localeCompare(b.label, "es"));
  const catsPage = sidePaged(
    "categories",
    cats,
    (row) => `${categoryLabel(row.id)} ${row.label}`,
    (row) => modsForSide("category", row.id),
  );
  $("categories").innerHTML = catsPage.navHtml
    + sideEntry(t("allF"), "", state.category, "category")
    + catsPage.shown.map((row) => (
      sideEntry(`${categoryLabel(row.id)} (${row.count})`, row.id, state.category, "category", modsForSide("category", row.id))
    )).join("");

  const sideMods = visible().slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"));
  const modsPage = sidePaged("mods", sideMods, (mod) => mod.name);
  const modsBox = $("side-mods-list");
  if (modsBox) {
    modsBox.innerHTML = modsPage.navHtml + (modsPage.shown.length
      ? `<div class="side-mods side-mods-root">${modsPage.shown.map((mod) => sideModButton(mod)).join("")}</div>`
      : "");
  }

  const foldCount = (id, n) => {
    const text = String(n);
    const node = $(id);
    if (node) node.textContent = text;
    const badge = $(`${id}-badge`);
    if (badge) badge.textContent = text;
  };
  foldCount("fold-platforms", platformMap.length);
  foldCount("fold-modpacks", gamePacks.length);
  foldCount("fold-categories", cats.length);
  foldCount("fold-mods", sideMods.length);

  fillCategorySelect($("add-category"), $("add-category").value || "");
  fillModpackSelects($("add-modpack"), $("add-pack-cat"), $("add-modpack")?.value || "", $("add-pack-cat")?.value || "", state.game);
  document.querySelectorAll(".side [data-kind]").forEach((button) => {
    button.onclick = (event) => {
      const edit = event.target.closest("[data-edit]");
      if (edit) {
        event.preventDefault();
        event.stopPropagation();
        const picked = edit.dataset.edit;
        if (button.dataset.kind === "category") {
          openCategoryDialog(picked);
          return;
        }
        openModpacksDialog();
        editModpack(picked);
        return;
      }
      const kind = button.dataset.kind;
      const raw = button.getAttribute("data-value");
      const value = raw == null ? "" : decodeURIComponent(raw);
      if (kind === "modpack" && value && String(state.modpack) === value) {
        event.preventDefault();
        openModpacksDialog();
        editModpack(value);
        return;
      }
      if (kind === "category" && value && String(state.category) === value) {
        event.preventDefault();
        openCategoryDialog(value);
        return;
      }
      state[kind] = value;
      if (kind === "modpack") state.packCat = "";
      sfx.click();
      render();
      if (kind === "platform") scheduleRemoteSearch();
    };
    button.oncontextmenu = (event) => {
      const raw = button.getAttribute("data-value");
      const value = raw == null ? "" : decodeURIComponent(raw);
      if (!value) return;
      event.preventDefault();
      event.stopPropagation();
      if (button.dataset.kind === "modpack") {
        openModpacksDialog();
        editModpack(value);
        return;
      }
      openMarkPop(button.dataset.kind, value, event.clientX, event.clientY);
    };
    const kind = button.dataset.kind;
    const raw = button.getAttribute("data-value");
    const value = raw == null ? "" : decodeURIComponent(raw);
    const droppable = (kind === "modpack")
      || (kind === "packCat")
      || ((kind === "category" || kind === "platform") && value);
    if (!droppable) return;
    button.ondragover = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      button.classList.add("drop");
    };
    button.ondragleave = () => button.classList.remove("drop");
    button.ondrop = async (event) => {
      event.preventDefault();
      button.classList.remove("drop");
      let ids = [];
      try {
        ids = JSON.parse(event.dataTransfer.getData("application/x-wimod") || "[]");
      } catch (_) {
        ids = [];
      }
      if (!Array.isArray(ids) || !ids.length) return;
      try {
        await dropMarked(kind, value, ids.filter((id) => typeof id === "string"));
      } catch (error) {
        toast(error.message, "bad");
      }
    };
  });
  document.querySelectorAll(".side-add[data-add]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      sideAdd(button.dataset.add);
    };
  });
  bindSideNavControls();
}

function sideFoldShut(id) {
  const block = document.querySelector(`.side-block[data-fold="${id}"]`);
  const layout = document.querySelector(".layout");
  return Boolean(block?.classList.contains("is-shut") || layout?.classList.contains("side-icons"));
}

async function sideAdd(kind) {
  sfx.click();
  if (kind === "modpack") {
    const minecraft = String(state.game || "").toLowerCase().startsWith("minecraft");
    if (minecraft || sideFoldShut("modpacks")) {
      if (!state.game) {
        toast("Elige un juego arriba.", "warn");
        return;
      }
      const pack = minecraft
        ? await openInstanceDialog()
        : await createModpackInline(state.game, gameLabel(state.game));
      if (pack?.id) state.modpack = pack.id;
      return;
    }
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

function markOf(kind, id) {
  const marks = state.catalog?.marks || {};
  return marks[`${String(kind || "").toLowerCase()}:${id}`] || null;
}

function markIcon(kind, id, fallback) {
  const mark = markOf(kind, id) || fallback || {};
  if (mark.imageUrl) return `<img class="side-ico" alt="" src="${esc(mark.imageUrl)}">`;
  if (String(kind || "").toLowerCase() === "platform") {
    const brand = platformMark(id);
    if (brand) return brand;
  }
  if (mark.emoji) return `<span class="side-emoji">${esc(mark.emoji)}</span>`;
  return "";
}

function platformMark(name) {
  const key = String(name || "").trim().toLowerCase();
  if (key === "independiente") {
    return `<svg class="side-ico side-globe" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><ellipse cx="12" cy="12" rx="4.2" ry="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3.4 12h17.2M4.6 8.2h14.8M4.6 15.8h14.8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  }
  const src = {
    nexus: THEME_ICONS.nexus,
    modrinth: THEME_ICONS.modrinth,
    curseforge: THEME_ICONS.curseforge,
    "steam workshop": THEME_ICONS.steam,
    steam: THEME_ICONS.steam,
    moddb: THEME_ICONS.moddb,
  }[key];
  return src ? `<img class="side-ico" alt="" src="${src}">` : "";
}

function sideInitial(label) {
  const clean = String(label || "").replace(/\s*\(\d+\)\s*$/, "").trim();
  return ([...clean][0] || "·").toUpperCase();
}

function chip(label, value, current, kind) {
  return sideEntry(label, value, current, kind);
}

function sideModsVisible(mods, groupLabel) {
  const q = String(state.sideQuery || "").trim().toLowerCase();
  if (!q) return mods.slice();
  if (String(groupLabel || "").toLowerCase().includes(q)) return mods.slice();
  return mods.filter((mod) => String(mod.name || "").toLowerCase().includes(q));
}

function modPictureSrc(mod) {
  if (mod?.pictureFile) return `/media/${encodeURI(mod.pictureFile)}`;
  if (mod?.pictureUrl) return String(mod.pictureUrl);
  return "";
}

function sideModButton(mod) {
  const src = modPictureSrc(mod);
  const thumb = src
    ? `<img class="side-mod-thumb" alt="" src="${esc(src)}" loading="lazy">`
    : `<span class="side-mod-thumb empty" aria-hidden="true"></span>`;
  return `<button type="button" class="side-mod" data-mod-jump="${esc(mod.id)}" title="${esc(mod.name)}">${thumb}<span>${esc(mod.name)}</span></button>`;
}

function sideModsHtml(mods) {
  if (!mods.length) return "";
  return `<div class="side-mods">${mods.map((mod) => sideModButton(mod)).join("")}</div>`;
}

function sideEntry(label, value, current, kind, mods, markFallback) {
  const on = String(value) === String(current) ? "on" : "";
  const markKind = kind === "packCat" ? "packcat" : kind;
  const icon = value ? markIcon(markKind, value, markFallback) : "";
  const pencil = (kind === "modpack" || kind === "category") && on && value
    ? `<span class="chip-edit" data-edit="${esc(value)}" title="${kind === "category" ? "Editar categoría" : "Editar modpack"}">✎</span>`
    : "";
  const chipClass = kind === "packCat" ? `pack-cat-chip ${on}` : on;
  const chip = `<button type="button" class="${chipClass}" data-kind="${kind}" data-value="${encodeURIComponent(value)}" title="${esc(label)}">${icon}<span class="side-initial">${esc(sideInitial(label))}</span><span>${esc(label)}</span>${pencil}</button>`;
  if (!value || kind === "modpack" || kind === "platform") {
    return `<div class="side-entry${on ? " is-on" : ""}"><div class="side-entry-row"><span class="side-twist-spacer" aria-hidden="true"></span>${chip}</div></div>`;
  }
  const list = Array.isArray(mods) ? mods : modsForSide(kind, value);
  const visible = sideModsVisible(list, label);
  const q = String(state.sideQuery || "").trim().toLowerCase();
  const matchQ = !!q && (
    String(label || "").toLowerCase().includes(q)
    || list.some((mod) => String(mod.name || "").toLowerCase().includes(q))
  );
  const open = matchQ || sideGroupOpen(kind, value, current);
  const key = sideOpenKey(kind, value);
  const twist = `<button type="button" class="side-twist${open ? " open" : ""}" data-side-twist="${esc(key)}" aria-expanded="${open ? "true" : "false"}" title="▸">▸</button>`;
  return `<div class="side-entry${on ? " is-on" : ""}${open ? " is-open" : ""}">
    <div class="side-entry-row">${twist}${chip}</div>
    ${open ? sideModsHtml(visible) : ""}
  </div>`;
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
  return [...set].sort((a, b) => categoryLabel(a).localeCompare(categoryLabel(b), "es"));
}

function fillCategorySelect(node, preferred) {
  if (!node) return;
  const current = preferred || node.value || "General";
  node.innerHTML = categoryOptions(current).map((name) => (
    `<option value="${esc(name)}" ${name === current ? "selected" : ""}>${esc(categoryLabel(name))}</option>`
  )).join("");
}

const THEME_ICONS = {
  nexus: "/brand/nexus.ico",
  modrinth: "/brand/modrinth.png",
  curseforge: "/brand/curseforge.ico",
  steam: "/brand/steam.ico",
  moddb: "/brand/moddb.png",
  rawg: "/brand/rawg.png",
};

function applyTheme(theme) {
  const allowed = ["nexus", "modrinth", "curseforge", "steam", "moddb", "rawg"];
  state.theme = allowed.includes(theme) ? theme : "nexus";
  document.documentElement.dataset.theme = state.theme;
  document.querySelectorAll(".theme-panel [data-theme]").forEach((button) => {
    button.classList.toggle("on", button.dataset.theme === state.theme);
  });
  const img = $("theme-summary-img");
  if (img) img.src = THEME_ICONS[state.theme] || THEME_ICONS.nexus;
  const summary = $("theme-summary");
  if (summary) summary.title = summary.getAttribute("aria-label") || "Tema";
  document.querySelectorAll('input[name="theme"]').forEach((input) => {
    input.checked = input.value === state.theme;
  });
}

function closeThemeSwitch() {
  const node = $("more-theme") || $("theme-switch") || document.querySelector(".theme-switch");
  if (node) node.classList.remove("open");
  const summary = $("theme-summary");
  if (summary) summary.setAttribute("aria-expanded", "false");
}

async function setTheme(theme) {
  if (theme === state.theme) return;
  await softChange(() => applyTheme(theme));
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

const PLATFORMS = ["Nexus", "Modrinth", "CurseForge", "Steam Workshop", "ModDB", "Independiente"];

function platformsForGame(domain) {
  const key = String(domain || "").trim().toLowerCase();
  const map = state.sources || {};
  if (map[key]) return map[key];
  if (key.startsWith("minecraft")) return ["Modrinth", "CurseForge", "Independiente"];
  if (key === "wow" || key.startsWith("worldofwarcraft")) return ["CurseForge", "Independiente"];
  if (key === "fallout4" || key === "newvegas" || key === "stalkershadowofchernobyl") {
    return ["Nexus", "ModDB", "Independiente"];
  }
  return ["Nexus", "Independiente"];
}

function searchPlatformLabel() {
  return searchPlatforms().join(" y ");
}

function searchPlatforms() {
  if (state.platform) return [state.platform];
  const stores = (platformsForGame(state.game) || []).filter((name) => name !== "Independiente");
  if (stores.length > 1) return stores;
  const remote = remoteTarget();
  if (remote) return [remote];
  return [stores[0] || "Independiente"];
}

function paintSearchPlatform() {
  const names = searchPlatforms();
  if ($("search")) {
    $("search").placeholder = names.length > 1 ? t("searchMods") : t("searchIn", { name: names[0] });
  }
  const node = $("search-platform");
  if (!node) return;
  node.innerHTML = names.map((name) => `<span>${esc(name)}</span>`).join("");
  if ($("search")) $("search").style.paddingRight = `${node.offsetWidth + 22}px`;
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
  if (text.includes("moddb.com")) return "ModDB";
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
  packNode.innerHTML = `<option value="">${esc(t("noPack"))}</option>` + packs.map((pack) => (
    `<option value="${esc(pack.id)}" ${pack.id === current ? "selected" : ""}>${esc(pack.name)} · ${esc(pack.gameName || pack.gameDomain)}</option>`
  )).join("");
  const pack = packById(packNode.value);
  const cats = pack ? (pack.categories || []) : [];
  catNode.disabled = !pack;
  if (!pack) {
    catNode.innerHTML = `<option value="">—</option>`;
  } else if (!cats.length) {
    catNode.innerHTML = `<option value="">${esc(t("noCats"))}</option>`;
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
  if (domain.toLowerCase().startsWith("minecraft")) return openInstanceDialog();
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
    closeOpenDialogs();
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

const SCALE_MIN = 0.1;
const SCALE_MAX = 1.5;
const SCALE_DEFAULT = 0.5;

function cardScale() {
  const n = Number(state.cardScale);
  if (!Number.isFinite(n)) return SCALE_DEFAULT;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(n * 10) / 10));
}

function scaleMode(scale = cardScale()) {
  if (scale <= 0.2) return "dense";
  if (scale <= 0.4) return "list";
  return "grid";
}

function visualScale(scale) {
  const n = Math.min(SCALE_MAX, Math.max(SCALE_MIN, scale));
  if (n <= 0.4) return 0.32 + ((n - SCALE_MIN) / 0.3) * 0.5;
  if (n <= 1) return 0.78 + (n - 0.5) * 0.2;
  return 0.88 + (n - 1) * 0.34;
}

function syncViewToggle() {
  const grid = $("grid");
  const scale = cardScale();
  const mode = scaleMode(scale);
  const table = state.view === "table";
  if (!table) state.view = mode === "grid" ? "grid" : "list";
  if (grid) {
    grid.classList.toggle("table", table);
    grid.classList.toggle("list", !table && mode !== "grid");
    grid.classList.toggle("dense", !table && mode === "dense");
    grid.classList.remove("size-sm", "size-md", "size-lg");
    grid.style.setProperty("--card-scale", String(visualScale(scale)));
    grid.classList.toggle("picking", state.picking);
  }
  document.querySelectorAll(".view-toggle [data-view]").forEach((button) => {
    button.classList.toggle("on", button.dataset.view === state.view);
  });
  const label = $("size-reset");
  if (label) {
    const text = `${scale}×`;
    label.textContent = text;
    label.classList.toggle("on", scale === SCALE_DEFAULT);
    label.title = scale === SCALE_DEFAULT ? t("sizeReset") : `${text}. ${t("sizeReset")}`;
  }
  const down = $("size-down");
  const up = $("size-up");
  if (down) {
    down.disabled = scale <= SCALE_MIN;
    down.title = t("sizeDown");
  }
  if (up) {
    up.disabled = scale >= SCALE_MAX;
    up.title = t("sizeUp");
  }
}

function setView(view) {
  sfx.click();
  if (view === "table") {
    state.view = "table";
    localStorage.setItem("wi-mod-view", "table");
    render();
    return;
  }
  const wasTable = state.view === "table";
  if (view === "list" && (wasTable || scaleMode() === "grid")) {
    state.view = "list";
    localStorage.setItem("wi-mod-view", "list");
    setCardScale(0.4, true, true);
    if (wasTable) render();
    return;
  }
  if (view === "grid" && (wasTable || scaleMode() !== "grid")) {
    state.view = "grid";
    localStorage.setItem("wi-mod-view", "grid");
    setCardScale(SCALE_DEFAULT, true, true);
    if (wasTable) render();
    return;
  }
  state.view = view === "list" ? "list" : "grid";
  localStorage.setItem("wi-mod-view", state.view);
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

function paintSelection() {
  const grid = $("grid");
  if (grid) grid.classList.toggle("picking", state.picking);
  document.querySelectorAll("#grid .card").forEach((card) => {
    const on = state.selected.has(card.dataset.id);
    card.classList.toggle("on", on);
    card.draggable = true;
  });
  paintPickAll();
  paintBulk();
}

function paintPickAll() {
  const button = $("pick-all");
  if (!button) return;
  button.hidden = !state.picking;
  const ids = visible().map((mod) => mod.id);
  const allOn = ids.length > 0 && ids.every((id) => state.selected.has(id));
  button.textContent = allOn ? "Quitar todo" : "Seleccionar todo";
}

function selectEverything() {
  const ids = visible().map((mod) => mod.id);
  if (!ids.length) return;
  const allOn = ids.every((id) => state.selected.has(id));
  if (allOn) {
    ids.forEach((id) => state.selected.delete(id));
    dropPickingIfEmpty();
    sfx.soft();
    paintSelection();
    return;
  }
  armPicking();
  ids.forEach((id) => state.selected.add(id));
  state.lastCheck = ids[ids.length - 1];
  sfx.soft();
  paintSelection();
}

let clipIds = [];

function typingField(event) {
  const node = event.target;
  if (!node || !node.closest) return false;
  if (node.closest("input, textarea, select, [contenteditable='true']")) return true;
  if (node.closest("dialog[open]")) return true;
  return false;
}

async function copyMarked() {
  const ids = [...state.selected];
  if (!ids.length) {
    toast("Nada marcado.", "warn");
    return;
  }
  clipIds = ids;
  const names = state.mods.filter((mod) => state.selected.has(mod.id)).map((mod) => mod.name || "Mod");
  try {
    await navigator.clipboard.writeText(names.join("\n"));
  } catch (_) { /* el portapapeles del sistema puede estar bloqueado */ }
  toast(ids.length === 1 ? "1 mod copiado." : `${ids.length} mods copiados.`);
}

async function pasteMarked() {
  if (!clipIds.length) {
    toast("Nada que pegar.", "warn");
    return;
  }
  const data = await api("/api/mods/clone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: clipIds }),
  });
  const fresh = (data.mods || []).map((mod) => mod.id);
  toast(data.count === 1 ? "1 mod pegado." : `${data.count} mods pegados.`);
  await load();
  armPicking();
  state.selected.clear();
  fresh.forEach((id) => state.selected.add(id));
  if (fresh.length) state.lastCheck = fresh[0];
  render();
}

function installLibraryKeys() {
  document.addEventListener("keydown", (event) => {
    if (event.repeat || typingField(event)) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (ctrl && key === "a") {
      event.preventDefault();
      selectEverything();
      return;
    }
    if (ctrl && key === "c") {
      event.preventDefault();
      copyMarked();
      return;
    }
    if (ctrl && key === "v") {
      event.preventDefault();
      pasteMarked().catch((error) => toast(error.message, "bad"));
      return;
    }
    if (ctrl && key === "enter") {
      event.preventDefault();
      playActiveGame(event);
      return;
    }
    if (event.key === "Delete" && state.selected.size) {
      event.preventDefault();
      deleteMarked();
    }
  });
}
installLibraryKeys();

function selectAllVisible() {
  if (!state.picking) return;
  const ids = visible().map((mod) => mod.id);
  const allOn = ids.length > 0 && ids.every((id) => state.selected.has(id));
  ids.forEach((id) => {
    if (allOn) state.selected.delete(id);
    else state.selected.add(id);
  });
  dropPickingIfEmpty();
  sfx.soft();
  paintSelection();
}

function dropPickingIfEmpty() {
  if (state.selected.size) return false;
  state.picking = false;
  state.lastCheck = "";
  const button = $("pick-mode");
  if (button) {
    button.classList.remove("on");
    button.textContent = "Habilitar selección";
  }
  return true;
}

function armPicking() {
  if (state.picking) return;
  state.picking = true;
  const button = $("pick-mode");
  if (button) {
    button.classList.add("on");
    button.textContent = "Quitar selección";
  }
}

function pickClick(id, event) {
  const ids = visible().map((mod) => mod.id);
  const ctrl = Boolean(event?.ctrlKey || event?.metaKey);
  const shift = Boolean(event?.shiftKey);
  const toggle = ctrl || state.picking;
  armPicking();
  if (shift) {
    const anchor = state.lastCheck && ids.includes(state.lastCheck) ? state.lastCheck : id;
    const a = ids.indexOf(anchor);
    const b = ids.indexOf(id);
    if (a >= 0 && b >= 0) {
      if (!ctrl) state.selected.clear();
      const [from, to] = a < b ? [a, b] : [b, a];
      ids.slice(from, to + 1).forEach((item) => state.selected.add(item));
    }
  } else if (toggle) {
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    state.lastCheck = id;
  } else {
    state.selected.clear();
    state.selected.add(id);
    state.lastCheck = id;
  }
  dropPickingIfEmpty();
  sfx.soft();
  paintSelection();
}

function dragIdsFor(id) {
  if (state.selected.has(id)) return [...state.selected];
  return [id];
}

let dragGhost = null;

const MOD_BOX_ICO = `<svg class="shot-box-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4v8l-8 4-8-4V8z"/><path d="M12 12v8M4 8l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4 8l8 4 8-4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function paintMultiShot(shotEl, domain) {
  if (!shotEl) return;
  const cover = gameCover(domain);
  const label = shotEl.querySelector("span");
  if (label) label.textContent = gameLabel(domain) || t("gameWord");
  shotEl.querySelector(".shot-box-ico")?.remove();
  shotEl.classList.toggle("shot-box", !cover);
  if (cover) {
    shotEl.style.backgroundImage = `url(${JSON.stringify(cover)})`;
  } else {
    shotEl.style.backgroundImage = "";
    shotEl.insertAdjacentHTML("afterbegin", MOD_BOX_ICO);
  }
}

function showDragGhost(card, count, x, y) {
  hideDragGhost(true);
  const rect = card.getBoundingClientRect();
  const copy = card.cloneNode(true);
  copy.classList.remove("dragging", "drag-group", "on");
  copy.style.animation = "none";
  copy.style.transition = "none";
  copy.style.transform = "none";
  copy.style.width = "100%";
  copy.style.height = "100%";
  copy.style.minHeight = "0";
  copy.style.margin = "0";
  if (count > 1) {
    const mod = state.mods.find((item) => item.id === card.dataset.id);
    paintMultiShot(copy.querySelector(".shot"), mod?.gameDomain || state.game);
  }
  const wrap = document.createElement("div");
  wrap.id = "drag-ghost";
  wrap.style.left = `${rect.left}px`;
  wrap.style.top = `${rect.top}px`;
  wrap.style.width = `${rect.width}px`;
  wrap.style.height = `${rect.height}px`;
  wrap.style.transform = "translate(0px, 0px) scale(1)";
  const chip = document.createElement("span");
  chip.className = "drag-count";
  chip.textContent = count === 1 ? "1 mod" : t("modsN", { n: count });
  wrap.append(copy, chip);
  document.body.appendChild(wrap);
  const pointerX = x || rect.left + rect.width / 2;
  const pointerY = y || rect.top + rect.height / 2;
  dragGhost = { node: wrap, left: rect.left, top: rect.top, w: rect.width, h: rect.height, follow: false };
  wrap.offsetWidth;
  wrap.classList.add("fly");
  placeDragGhost(pointerX, pointerY);
  wrap.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "transform" || !dragGhost || dragGhost.node !== wrap) return;
    wrap.classList.remove("fly");
    dragGhost.follow = true;
  });
}

function placeDragGhost(x, y) {
  if (!dragGhost || (!x && !y)) return;
  const tx = x - dragGhost.left - dragGhost.w / 2;
  const ty = y - dragGhost.top - dragGhost.h / 2;
  dragGhost.node.style.transform = `translate(${tx}px, ${ty}px) scale(0.32)`;
}

function hideDragGhost(instant) {
  const wrap = dragGhost?.node || document.getElementById("drag-ghost");
  dragGhost = null;
  document.querySelectorAll(".card.drag-group").forEach((card) => card.classList.remove("drag-group"));
  if (!wrap) return;
  if (instant) {
    wrap.remove();
    return;
  }
  wrap.classList.add("gone");
  setTimeout(() => wrap.remove(), 180);
}

document.addEventListener("dragover", (event) => {
  if (!dragGhost?.follow) return;
  placeDragGhost(event.clientX, event.clientY);
});

function beginMarquee(event, fromCard) {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  const toggle = event.ctrlKey || event.metaKey;
  const additive = event.shiftKey;
  const before = new Set(state.selected);
  let moved = false;
  const box = document.createElement("div");
  box.id = "marquee";
  box.hidden = true;
  document.body.appendChild(box);
  const onMove = (ev) => {
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 5) return;
    if (!moved) {
      moved = true;
      document.body.classList.add("marquee-on");
    }
    const left = Math.min(startX, ev.clientX);
    const top = Math.min(startY, ev.clientY);
    const width = Math.abs(dx);
    const height = Math.abs(dy);
    box.hidden = false;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.width = `${width}px`;
    box.style.height = `${height}px`;
    const band = { left, top, right: left + width, bottom: top + height };
    const hit = new Set();
    document.querySelectorAll("#grid .card").forEach((card) => {
      const rect = card.getBoundingClientRect();
      if (rect.left < band.right && rect.right > band.left && rect.top < band.bottom && rect.bottom > band.top) {
        hit.add(card.dataset.id);
      }
    });
    state.selected.clear();
    if (toggle) {
      before.forEach((id) => state.selected.add(id));
      hit.forEach((id) => {
        if (before.has(id)) state.selected.delete(id);
        else state.selected.add(id);
      });
    } else {
      if (additive) before.forEach((id) => state.selected.add(id));
      hit.forEach((id) => state.selected.add(id));
    }
    document.querySelectorAll("#grid .card").forEach((card) => {
      card.classList.toggle("on", state.selected.has(card.dataset.id));
    });
  };
  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    box.remove();
    document.body.classList.remove("marquee-on");
    if (!moved) return;
    state.dragged = true;
    setTimeout(() => { state.dragged = false; }, 0);
    const ids = [...state.selected];
    if (!ids.length) {
      dropPickingIfEmpty();
      paintSelection();
      return;
    }
    state.lastCheck = ids[ids.length - 1];
    armPicking();
    sfx.soft();
    paintSelection();
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function installMarquee() {
  const host = document.querySelector("main");
  if (!host || host.dataset.marquee) return;
  host.dataset.marquee = "1";
  host.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    if (event.target.closest(".card, button, a, input, select, textarea, label, dialog, .bulk, .view-dock")) return;
    beginMarquee(event, false);
  });
}
installMarquee();

async function dropMarked(kind, value, ids) {
  if (!ids.length) return;
  const body = { ids };
  if (kind === "category") body.category = value;
  else if (kind === "platform") body.platform = value;
  else if (kind === "packCat") {
    body.modpackId = state.modpack || "";
    body.modpackCategoryId = value || "";
  } else {
    body.modpackId = value || "";
    body.modpackCategoryId = "";
  }
  const data = await api("/api/mods/assign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const where = kind === "category" || kind === "platform"
    ? value
    : (value ? "el modpack" : "fuera del modpack");
  toast(`${data.count} en ${where}.`);
  await load();
}

function setCardScale(next, quiet, keepView) {
  const value = Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(Number(next) * 10) / 10));
  if (value === cardScale()) return;
  const prevView = state.view;
  const prevScale = cardScale();
  state.cardScale = value;
  if (!keepView) {
    if (value <= SCALE_MIN) state.view = "list";
    else if (prevScale <= SCALE_MIN) state.view = "table";
    localStorage.setItem("wi-mod-view", state.view);
  }
  localStorage.setItem("wi-mod-scale", String(value));
  if (!quiet) sfx.click();
  if (state.view !== prevView) render();
  else syncViewToggle();
}

function paintBulk() {
  const bar = $("bulk");
  const n = state.selected.size;
  bar.hidden = n === 0;
  if (!n) return;
  $("bulk-count").textContent = t("picked", { n });
  fillCategorySelect($("bulk-category"), $("bulk-category").value || "General");
  fillModpackSelects(
    $("bulk-pack"),
    $("bulk-pack-cat"),
    $("bulk-pack").value || state.modpack || "",
    $("bulk-pack-cat").value || "",
    state.game
  );
  const canToggle = [...state.selected].some((id) => {
    const mod = state.mods.find((item) => item.id === id);
    return mod && modDownloaded(mod);
  });
  ["bulk-enable", "bulk-disable"].forEach((id) => {
    const button = $(id);
    if (!button) return;
    button.disabled = !canToggle;
    button.title = canToggle ? "" : t("needDownload");
  });
}

const MOD_STATUS = [
  ["got", "Descargado", "Sin descargar"],
  ["in", "Activo", "Inactivo"],
];

function statusOn(mod, id) {
  return String(mod.status || "").split("+").includes(id);
}

function statusPicks(mod) {
  const hasFiles = modDownloaded(mod);
  return `<span class="status-picks">${MOD_STATUS.map(([id]) => {
    const on = statusOn(mod, id);
    const label = id === "in" ? (on ? t("activeOn") : t("activeOff")) : (on ? t("gotOn") : t("gotOff"));
    const tip = id === "in"
      ? (!hasFiles ? t("activeNeedFiles") : (on ? t("activeTipOn") : t("activeTipOff")))
      : label;
    const locked = id === "in" && !hasFiles;
    return `<button type="button" class="status-pick ${on ? "on" : ""}${locked ? " locked" : ""}" data-status="${id}" ${locked ? "disabled" : ""} title="${esc(tip)}">${esc(label)}</button>`;
  }).join("")}</span>`;
}

function conflictCell(mod) {
  const row = mod.conflict || {};
  const wins = Number(row.wins) || 0;
  const loses = Number(row.loses) || 0;
  const over = (row.overwrites || []).join(", ");
  const under = (row.overwrittenBy || []).join(", ");
  const bits = [];
  if (wins) bits.push(t("conflictWins", { names: over || String(wins) }));
  if (loses) bits.push(t("conflictLoses", { names: under || String(loses) }));
  const title = bits.length ? bits.join(" · ") : t("conflictNone");
  const mark = wins && loses ? "±" : wins ? "↑" : loses ? "↓" : "·";
  const kind = wins && loses ? "both" : wins ? "win" : loses ? "lose" : "none";
  const count = wins || loses ? `${loses ? loses : ""}${wins && loses ? "/" : ""}${wins ? wins : ""}` : "";
  return `<span class="conflict ${kind}" title="${esc(title)}"><span>${esc(t("conflicts"))}</span><b>${mark}${count ? ` ${count}` : ""}</b></span>`;
}

function priorityCell(mod) {
  const n = Number(mod.priority) || 0;
  return `<label class="prio" title="${esc(t("priorityTip"))}"><span>${esc(t("priority"))}</span><input type="number" min="1" step="1" data-priority value="${n}" aria-label="${esc(t("priority"))}"></label>`;
}

async function placePriority(ids, targetId, after) {
  const movingIds = ids.filter((id) => id && id !== targetId);
  if (!movingIds.length) return;
  const first = state.mods.find((mod) => mod.id === movingIds[0]);
  if (!first) return;
  const game = String(first.gameDomain || "").toLowerCase();
  const peers = state.mods
    .filter((mod) => String(mod.gameDomain || "").toLowerCase() === game)
    .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0) || String(a.name).localeCompare(String(b.name), "es"));
  const moving = new Set(movingIds);
  const block = peers.filter((mod) => moving.has(mod.id));
  const rest = peers.filter((mod) => !moving.has(mod.id));
  let at = rest.findIndex((mod) => mod.id === targetId);
  if (at < 0) at = rest.length;
  else if (after) at += 1;
  let slot = at + 1;
  state.sort = "priority";
  const sort = $("sort");
  if (sort) sort.value = "priority";
  localStorage.setItem("wi-mod-sort", "priority");
  try {
    for (const mod of block) {
      const data = await api(`/api/mods/${mod.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: slot }),
      });
      if (data.mod) Object.assign(mod, data.mod);
      slot += 1;
    }
    await load();
  } catch (error) {
    toast(error.message, "bad");
    render();
  }
}

async function setPriority(id, value) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  const n = Math.max(1, Math.round(Number(value) || 1));
  try {
    const data = await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: n }),
    });
    if (data.mod) Object.assign(mod, data.mod);
    await load();
  } catch (error) {
    toast(error.message, "bad");
    render();
  }
}

function packMoves() {
  if (!state.modpack) return "";
  return `<span class="pack-moves"><button type="button" data-pack-move="-1" title="Subir en el pack">↑</button><button type="button" data-pack-move="1" title="Bajar en el pack">↓</button></span>`;
}

function paintUpdateBanner() {
  const banner = $("update-banner");
  if (!banner) return;
  const pending = scopedMods().filter((mod) => mod.updateAvailable);
  banner.hidden = !pending.length;
  banner.classList.toggle("on", state.onlyUpdates);
  banner.textContent = state.onlyUpdates
    ? `Viendo ${pending.length} con versión nueva`
    : `${pending.length} con versión nueva`;
  banner.onclick = () => {
    state.onlyUpdates = !state.onlyUpdates;
    render();
  };
}

async function setModStatus(id, status) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  if (status === "in" && !modDownloaded(mod) && !statusOn(mod, "in")) {
    toast(t("activeNeedFiles"), "warn");
    return;
  }
  const flags = new Set(String(mod.status || "").split("+").filter((part) => part === "got" || part === "in"));
  if (flags.has(status)) flags.delete(status);
  else flags.add(status);
  const next = ["got", "in"].filter((part) => flags.has(part)).join("+");
  const prev = mod.status;
  mod.status = next;
  paintSelection();
  document.querySelector(`.card[data-id="${id}"]`)?.classList.toggle("inactive", !statusOn(mod, "in") && modDownloaded(mod));
  try {
    const data = await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    if (data.mod) Object.assign(mod, data.mod);
    if (status === "in") {
      toast(statusOn(mod, "in") ? t("activeOk", { n: 1 }) : t("inactiveOk", { n: 1 }));
    }
    paintDetailActive(mod);
    render();
  } catch (error) {
    mod.status = prev;
    toast(error.message, "bad");
    render();
  }
}

async function moveInPack(id, dir) {
  if (!state.modpack) return;
  const shown = visible();
  const index = shown.findIndex((mod) => mod.id === id);
  const target = index + dir;
  if (index < 0 || target < 0 || target >= shown.length) return;
  const next = shown.slice();
  const [row] = next.splice(index, 1);
  next.splice(target, 0, row);
  const hidden = state.mods.filter((mod) => mod.modpackId === state.modpack && !next.some((item) => item.id === mod.id));
  const order = next.concat(hidden);
  order.forEach((mod, n) => { mod.packOrder = n + 1; });
  render();
  try {
    await api("/api/mods/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: order.map((mod) => mod.id) }),
    });
  } catch (error) {
    toast(error.message, "bad");
  }
}

function render() {
  applyCoverBg();
  renderFilters();
  renderGameHero();
  syncViewToggle();
  paintPickAll();
  paintBulk();
  paintSearchPlatform();
  paintUpdateBanner();
  paintDockStats();
  paintSysbar();
  const mods = visible();
  $("count").textContent = "";
  if (!mods.length) {
    const pool = state.modpack
      ? scopedMods().filter((mod) => String(mod.modpackId || "") === state.modpack)
      : scopedMods();
    const other = state.mods.length - scopedMods().length;
    if (state.modpack && !pool.length) {
      $("grid").innerHTML = `<p class="empty">${esc(t("emptyInstance"))}</p>`;
    } else if (pool.length) {
      $("grid").innerHTML = `<p class="empty">${esc(t("emptyFiltered", { n: pool.length }))} <button type="button" class="ghost" id="clear-filters">${esc(t("clearFilters"))}</button></p>`;
      $("clear-filters").onclick = () => { clearFilters(); render(); };
    } else if (other) {
      $("grid").innerHTML = `<p class="empty">${esc(t("emptyGame"))}</p>`;
    } else {
      $("grid").innerHTML = `<p class="empty">${esc(t("emptyAll"))}</p>`;
    }
    return;
  }
  if (state.view === "table") {
    $("grid").innerHTML = `<table class="mod-table"><thead><tr>
      <th>${esc(t("priority"))}</th>
      <th>${esc(t("conflicts"))}</th>
      <th>${esc(t("flags"))}</th>
      <th>${esc(t("name"))}</th>
      <th>${esc(t("category"))}</th>
      <th>${esc(t("version"))}</th>
    </tr></thead><tbody>${mods.map((mod) => `
      <tr class="card ${state.selected.has(mod.id) ? "on" : ""} ${!statusOn(mod, "in") && (mod.files || []).length ? "inactive" : ""} ${downloading.has(mod.id) ? "downloading" : ""}" data-id="${mod.id}">
        <td>${priorityCell(mod)}</td>
        <td>${conflictCell(mod)}</td>
        <td class="flags">${statusPicks(mod)}</td>
        <td class="mod-name">${esc(mod.name)}${mod.updateAvailable ? `<span class="ver-new">${esc(t("newTag"))}</span>` : ""} <span class="meta">${esc(fileState(mod))}</span></td>
        <td>${esc(categoryLabel(mod.category, mod))}</td>
        <td>${esc(mod.version || "?")}</td>
      </tr>`).join("")}</tbody></table>`;
  } else $("grid").innerHTML = mods.map((mod, index) => `
    <article class="card ${state.selected.has(mod.id) ? "on" : ""} ${!statusOn(mod, "in") && (mod.files || []).length ? "inactive" : ""} ${downloading.has(mod.id) ? "downloading" : ""}" data-id="${mod.id}" style="animation-delay:${Math.min(index, 10) * 35}ms">
      <div class="shot" ${shot(mod)}><span>${esc(mod.gameName || mod.gameDomain || "Juego")}</span></div>
      <div class="card-body">
        <h3>${esc(mod.name)}${mod.updateAvailable ? `<span class="ver-new">${esc(t("newTag"))}</span>` : ""}</h3>
        <p class="meta">${esc(mod.platform || "Nexus")}${packLabel(mod) ? ` · ${esc(packLabel(mod))}` : ""} · ${esc(categoryLabel(mod.category, mod))} · v${esc(mod.version || "?")}</p>
        <p class="sub">${esc(displaySummary(mod))}${mod.summaryEs ? ` <span class="meta">${state.showEs ? "ES" : "EN"}</span>` : ""}</p>
      </div>
      <footer>
        ${conflictCell(mod)}
        ${priorityCell(mod)}
        ${statusPicks(mod)}
        ${packMoves()}
        <span class="meta">${esc(fileState(mod))} · ${esc(fmtDate(mod.updatedAt))}</span>
      </footer>
    </article>
  `).join("");
  document.querySelectorAll(".card").forEach((card) => {
    card.ondragstart = (event) => {
      const ids = dragIdsFor(card.dataset.id);
      event.dataTransfer.setData("application/x-wimod", JSON.stringify(ids));
      event.dataTransfer.setData("text/plain", ids.length === 1 ? "1 mod" : `${ids.length} mods`);
      event.dataTransfer.effectAllowed = "move";
      const blank = new Image();
      blank.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
      event.dataTransfer.setDragImage(blank, 0, 0);
      ids.forEach((id) => document.querySelector(`.card[data-id="${id}"]`)?.classList.add("drag-group"));
      card.classList.add("dragging");
      showDragGhost(card, ids.length, event.clientX, event.clientY);
      state.dragged = true;
    };
    card.ondragend = () => {
      card.classList.remove("dragging");
      hideDragGhost();
      setTimeout(() => { state.dragged = false; }, 0);
    };
    card.draggable = true;
    card.ondragover = (event) => {
      if (!state.dragged) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = card.getBoundingClientRect();
      const after = event.clientY > rect.top + rect.height / 2;
      card.classList.toggle("drop-after", after);
      card.classList.toggle("drop-before", !after);
      event.dataTransfer.dropEffect = "move";
    };
    card.ondragleave = () => card.classList.remove("drop-before", "drop-after");
    card.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const after = card.classList.contains("drop-after");
      card.classList.remove("drop-before", "drop-after");
      let ids = [];
      try {
        ids = JSON.parse(event.dataTransfer.getData("application/x-wimod") || "[]");
      } catch (_) {
        ids = [];
      }
      if (!Array.isArray(ids) || !ids.length) return;
      placePriority(ids, card.dataset.id, after);
    };
    card.onmousedown = (event) => {
      if (event.target.closest("input, label, button, a")) {
        card.draggable = false;
        return;
      }
      card.draggable = true;
      if (event.shiftKey || event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };
    const prio = card.querySelector("[data-priority]");
    if (prio) {
      prio.onclick = (event) => event.stopPropagation();
      prio.onchange = (event) => {
        event.stopPropagation();
        setPriority(card.dataset.id, event.target.value);
      };
    }
    card.onclick = (event) => {
      if (state.dragged) return;
      if (event.target.closest("input, button, a, .prio")) return;
      const status = event.target.closest("[data-status]");
      if (status) {
        event.preventDefault();
        event.stopPropagation();
        setModStatus(card.dataset.id, status.dataset.status);
        return;
      }
      const move = event.target.closest("[data-pack-move]");
      if (move) {
        event.preventDefault();
        event.stopPropagation();
        moveInPack(card.dataset.id, Number(move.dataset.packMove));
        return;
      }
      if (event.ctrlKey || event.metaKey || event.shiftKey || state.picking) {
        pickClick(card.dataset.id, event);
        return;
      }
      sfx.open();
      openDetail(card.dataset.id);
    };
    card.ondblclick = (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      sfx.open();
      openDetail(card.dataset.id);
    };
    card.oncontextmenu = (event) => {
      event.preventDefault();
      openModMenu(card.dataset.id, event.clientX, event.clientY);
    };
  });
}

async function ensurePastedGame(domain, name) {
  const id = String(domain || "").trim().toLowerCase();
  if (!id || catalogGame(id)) return;
  const label = String(name || id).trim() || id;
  try {
    const data = await api(
      `/api/rawg/resolve?domain=${encodeURIComponent(id)}&name=${encodeURIComponent(label)}`
    );
    if (data.game) {
      const list = [...(state.catalog.games || [])];
      const idx = list.findIndex((item) => String(item.gameDomain || "").toLowerCase() === id);
      if (idx >= 0) list[idx] = { ...list[idx], ...data.game };
      else list.push(data.game);
      state.catalog = { ...state.catalog, games: list };
      return;
    }
  } catch (_) { /* sin RAWG igual entra el juego */ }
  const list = [...(state.catalog.games || [])];
  list.push({ gameDomain: id, gameName: label });
  state.catalog = { ...state.catalog, games: list };
}

let ingestingUrl = false;

async function ingestPastedMod() {
  if (ingestingUrl) return;
  ingestingUrl = true;
  try {
    await detect();
    if (!state.detected || !state.detected.name) return;
    await saveMod({ preventDefault() {} });
  } finally {
    ingestingUrl = false;
  }
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
  const needKey = (() => {
    const id = keyIdForUrl(page);
    return id === "nexus" || id === "curseforge" ? id : "";
  })();
  if (needKey && !ensureServiceKey(needKey)) {
    status.className = "status bad";
    status.textContent = t("keyNeededShort", {
      name: (KEY_POPS[needKey]?.label || needKey).replace(/^Clave\s+/i, ""),
    });
    return;
  }
  status.textContent = isNexusUrl(page)
    ? "Olfateando Nexus…"
    : (/modrinth\.com/i.test(page) ? "Olfateando Modrinth…"
      : (/curseforge\.com/i.test(page) ? "Olfateando CurseForge…"
        : (/moddb\.com/i.test(page) ? "Olfateando ModDB…" : "Leyendo la página oficial…")));
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
    maybePromptKeyError(error);
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
  const targetGame = String(state.detected?.gameDomain || "").trim().toLowerCase() || state.game || "";
  const targetName = state.detected?.gameName || gameLabel(targetGame);
  const picked = state.detected?.platform || platformFromUrl(pageUrl);
  const allowed = platformsForGame(targetGame);
  const locked = Boolean((state.sources || {})[targetGame])
    || targetGame.startsWith("minecraft")
    || targetGame === "wow"
    || targetGame.startsWith("worldofwarcraft");
  if (locked && allowed.length && picked && !allowed.includes(picked)) {
    status.textContent = `Este juego solo acepta ${allowed.join(", ")}.`;
    sfx.warn();
    setLoading(button, false);
    return;
  }
  await ensurePastedGame(targetGame, targetName);
  const official = picked !== "Nexus";
  const body = {
    url: pageUrl,
    platform: picked,
    category: $("add-category").value,
    modpackId: $("add-modpack").value || "",
    modpackCategoryId: $("add-pack-cat").value || "",
    gameDomain: targetGame,
    gameName: targetName,
    mode,
  };
  if (!state.detected || official) {
    body.manual = {
      name: $("manual-name").value || state.detected?.name || "",
      gameName: $("manual-game").value || targetName,
      gameDomain: targetGame,
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
    if (saved.mod?.gameDomain) selectGame(saved.mod.gameDomain);
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
        if (saved.mod?.gameDomain) selectGame(saved.mod.gameDomain);
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
    <p class="hint" id="detail-files">${esc(filesHint(mod))}</p>
    <footer>
      <button class="danger" type="button" id="detail-delete">Eliminar</button>
      <span class="row">
        <span id="detail-refresh-slot">${refreshButton(mod)}</span>
        <button class="ghost" type="button" id="detail-active"></button>
        <button class="ghost" type="button" id="detail-file" hidden>Archivo local</button>
        <button class="ghost" type="button" id="detail-download" data-i18n="download">Descargar</button>
        <button class="ghost" type="button" id="detail-install">Instalar</button>
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
  $("detail-download").onclick = () => downloadMod(mod.id);
  const fileBtn = $("detail-file");
  if (fileBtn) {
    fileBtn.hidden = !(mod.files || []).length;
    fileBtn.textContent = t("localFile");
    fileBtn.onclick = () => revealMod(mod.id);
  }
  $("detail-install").onclick = () => installMod(mod);
  $("detail-active").onclick = () => setModStatus(mod.id, "in");
  $("detail-delete").onclick = () => removeMod(mod.id);
  $("detail").dataset.id = mod.id;
  paintDetailActive(mod);
  probeUpdate(mod.id);
}

function paintDetailActive(mod) {
  const button = $("detail-active");
  if (!button || $("detail")?.dataset.id !== mod.id) return;
  const hasFiles = modDownloaded(mod);
  const on = statusOn(mod, "in");
  button.disabled = !hasFiles && !on;
  button.textContent = on ? t("bulkDisable") : t("bulkEnable");
  button.classList.toggle("on", on && hasFiles);
  button.title = !hasFiles ? t("activeNeedFiles") : (on ? t("activeTipOn") : t("activeTipOff"));
}

function filesHint(mod) {
  const files = mod.files || [];
  if (!files.length) return t("downloadNone");
  return fileState(mod);
}

function fomodPlugins(plan) {
  const rows = [];
  for (const step of plan?.installSteps || []) {
    for (const group of step.groups || []) {
      for (const plugin of group.plugins || []) {
        if (plugin.type === "Required") continue;
        rows.push(plugin);
      }
    }
  }
  return rows;
}

function askFomod(plan) {
  const plugins = fomodPlugins(plan);
  if (!plugins.length) return Promise.resolve([]);
  return new Promise((resolve) => {
    const host = $("detail");
    const box = document.createElement("div");
    box.className = "fomod-steps";
    box.innerHTML = `<p class="hint">${esc(plan.moduleName || "FOMOD")}</p>${plugins.map((plugin, index) => `
      <label class="fomod-opt"><input type="checkbox" data-fomod="${index}" ${plugin.type === "Recommended" ? "checked" : ""}> <span><b>${esc(plugin.name)}</b>${plugin.description ? `<small>${esc(plugin.description)}</small>` : ""}</span></label>`).join("")}
      <span class="row"><button type="button" class="ghost" id="fomod-cancel">Cancelar</button><button type="button" class="solid" id="fomod-go">Desplegar</button></span>`;
    host.append(box);
    box.querySelector("#fomod-cancel").onclick = () => { box.remove(); resolve(null); };
    box.querySelector("#fomod-go").onclick = () => {
      const names = [...box.querySelectorAll("input:checked")].map((input) => plugins[Number(input.dataset.fomod)].name);
      box.remove();
      resolve(names);
    };
  });
}

async function installMod(mod, retried) {
  const button = $("detail-install");
  setLoading(button, true, "…");
  try {
    const data = await api(`/api/mods/${mod.id}/install`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (data.kind === "FOMOD" && data.plan && !data.deployed) {
      const picks = await askFomod(data.plan);
      if (!picks) return;
      const done = await api(`/api/mods/${mod.id}/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plugins: picks }),
      });
      mod.installed = true;
      toast(`Enlazados ${done.linked || 0} en Data. Saltados ${done.skipped || 0}.`);
      render();
      return;
    }
    mod.installed = true;
    toast(`Enlazados ${data.linked || 0} en Data. Saltados ${data.skipped || 0}.`);
    render();
  } catch (error) {
    if (!retried && /7-zip|7z\.exe/i.test(error.message || "") && await askConfirm(t("zipAsk"))) {
      await api("/api/7zip/install", { method: "POST" });
      return installMod(mod, true);
    }
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

async function revealMod(id) {
  try {
    await api(`/api/mods/${id}/reveal`, { method: "POST" });
  } catch (error) {
    toast(error.message, "bad");
  }
}

async function downloadMod(id) {
  const button = $("detail-download");
  setLoading(button, true, "Descargando");
  sfx.sniff();
  toast(t("downloadWait"), "warn");
  try {
    const data = await api(`/api/mods/${id}/download`, { method: "POST" });
    if (data.ok) {
      toast(data.savedAs ? `Guardado en ${data.savedAs}` : t("downloadOk"));
      sfx.ok();
      await load();
      openDetail(id);
      return;
    }
    toast(data.error || t("downloadManual"), "warn");
    if (data.mod) {
      await load();
      openDetail(id);
    }
  } catch (error) {
    toast(error.message, "bad");
    sfx.err();
  } finally {
    setLoading(button, false);
  }
}

async function assignMarked(kind) {
  const ids = [...state.selected];
  if (!ids.length) {
    toast(t("pickFirst"), "warn");
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

async function refreshMarked() {
  const ids = [...state.selected];
  if (!ids.length) {
    toast(t("pickFirst"), "warn");
    return;
  }
  if (!(await askConfirm(`¿Actualizar ${ids.length} mods marcados? Si hay versión nueva, se aplica la ficha.`))) return;
  const button = $("bulk-refresh");
  setLoading(button, true, "Actualizando");
  let applied = 0;
  let same = 0;
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        const check = await api(`/api/mods/${id}/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apply: false }),
        });
        if (check.changed) {
          await api(`/api/mods/${id}/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apply: true }),
          });
          applied += 1;
        } else {
          same += 1;
        }
      } catch (_) {
        failed += 1;
      }
    }
    toast(`Actualizados ${applied}. Sin cambio ${same}. Fallos ${failed}.`);
    await load();
  } finally {
    setLoading(button, false);
  }
}

async function deleteMarked() {
  const ids = [...state.selected];
  if (!ids.length) {
    toast(t("pickFirst"), "warn");
    return;
  }
  if (!(await askConfirm(`¿Eliminar ${ids.length} mods marcados y sus archivos?`))) return;
  const button = $("bulk-delete");
  setLoading(button, true, "Eliminando");
  let removed = 0;
  let failed = 0;
  try {
    for (const id of ids) {
      try {
        await api(`/api/mods/${id}`, { method: "DELETE" });
        state.selected.delete(id);
        removed += 1;
      } catch (_) {
        failed += 1;
      }
    }
    toast(failed ? `Eliminados ${removed}. Fallos ${failed}.` : `Eliminados ${removed}.`);
    closeOpenDialogs();
    await load();
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

function closeOpenDialogs() {
  document.querySelectorAll("dialog[open]").forEach((node) => node.close());
}

async function removeMod(id) {
  if (!(await askConfirm("¿Eliminar este mod y sus archivos?"))) return;
  await api(`/api/mods/${id}`, { method: "DELETE" });
  closeOpenDialogs();
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
  closeOpenDialogs();
  await load();
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
    if ($("steam-status")) {
      $("steam-status").textContent = data.hasSteamKey ? `Steam: ${data.steamHint}` : "Steam: sin clave.";
    }
    $("rawg-status").textContent = data.hasRawgKey ? `RAWG: ${data.rawgHint}` : "RAWG: sin clave.";
    fillSecret($("api-key"), data.apiKey);
    fillSecret($("rawg-key"), data.rawgApiKey);
    fillSecret($("cf-key"), data.curseforgeApiKey);
    fillSecret($("steam-key"), data.steamApiKey);
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
  $("game-results").innerHTML = `<p class="hint">${esc(t("type2"))}</p>`;
  $("game-dialog").showModal();
  setTimeout(() => $("game-search").focus(), 40);
}

async function searchRawgGames(query) {
  const box = $("game-results");
  const q = (query || "").trim();
  if (q.length < 2) {
    box.innerHTML = `<p class="hint">${esc(t("type2"))}</p>`;
    return;
  }
  if (!ensureServiceKey("rawg")) {
    box.innerHTML = `<p class="hint">${esc(t("keyNeededShort", { name: "RAWG" }))}</p>`;
    return;
  }
  box.innerHTML = `<p class="hint">${esc(t("searching"))}</p>`;
  try {
    const data = await api(`/api/rawg/search?q=${encodeURIComponent(q)}`);
    const rows = data.results || [];
    if (!rows.length) {
      box.innerHTML = `<p class="hint">${esc(t("noResults"))}</p>`;
      return;
    }
    box.innerHTML = rows.map((game) => `
      <div class="game-hit">
        <img alt="" src="${esc(game.imageUrl || "")}" loading="lazy">
        <div>
          <b>${esc(game.gameName || "")}</b>
          <p class="meta">${esc(game.released || "¿?")}${game.platforms?.length ? ` · ${esc(game.platforms.slice(0, 3).join(", "))}` : ""} · ${esc(game.gameDomain || "")}</p>
        </div>
        <button type="button" class="solid" data-rawg-add="${esc(String(game.rawgId || ""))}">${esc(t("add"))}</button>
      </div>
    `).join("");
    box.querySelectorAll("[data-rawg-add]").forEach((button) => {
      button.onclick = () => addRawgGame(button.dataset.rawgAdd, button);
    });
  } catch (error) {
    maybePromptKeyError(error);
    box.innerHTML = `<p class="hint">${esc(error.message)}</p>`;
  }
}

async function addRawgGame(rawgId, button) {
  if (!rawgId) return;
  if (!ensureServiceKey("rawg")) return;
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
    if (!maybePromptKeyError(error)) toast(error.message, "bad");
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
$("lang-toggle").onclick = () => setLanguage(state.lang === "en" ? "es" : "en");
$("cover-bg").onclick = () => {
  state.coverBg = !state.coverBg;
  localStorage.setItem("wi-mod-cover-bg", state.coverBg ? "1" : "0");
  applyCoverBg();
  sfx.click();
};
document.querySelectorAll(".theme-panel [data-theme]").forEach((button) => {
  const pick = () => setTheme(button.dataset.theme);
  button.onclick = pick;
});
if ($("theme-summary")) {
  $("theme-summary").onclick = (event) => {
    event.stopPropagation();
    const node = $("more-theme");
    if (!node) return;
    const open = !node.classList.contains("open");
    if (open) closeKeysStack();
    node.classList.toggle("open", open);
    event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) sfx.open();
  };
}
document.addEventListener("pointerdown", (event) => {
  const node = $("more-theme");
  if (!node || !node.classList.contains("open")) return;
  if (node.contains(event.target)) return;
  closeThemeSwitch();
});
if ($("translate-open")) $("translate-open").onclick = () => {
  sfx.open();
  $("translate-in").value = "";
  $("translate-out").value = "";
  $("translate-dialog").showModal();
};
function placePop(pop, anchor) {
  pop.hidden = false;
  const rect = anchor.getBoundingClientRect();
  const box = pop.getBoundingClientRect();
  const header = document.querySelector(".top");
  const below = !!(header && header.contains(anchor));
  const left = Math.max(8, Math.min(below ? rect.right - box.width : rect.left, window.innerWidth - box.width - 8));
  let top = below ? rect.bottom + 8 : rect.top - box.height - 8;
  const dock = document.querySelector(".dock");
  const limit = dock ? dock.getBoundingClientRect().top - 8 : window.innerHeight - 8;
  if (below && top + box.height > limit) top = Math.max(8, limit - box.height);
  if (!below) top = Math.max(8, limit - box.height);
  pop.classList.toggle("flip", left + box.width > window.innerWidth - 200);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
}
function setSettingsOpen(on) {
  const wrap = $("more-settings");
  const panel = $("settings-panel");
  const toggle = $("settings-toggle");
  if (!wrap || !panel || !toggle) return;
  wrap.classList.toggle("open", on);
  panel.hidden = !on;
  toggle.setAttribute("aria-expanded", on ? "true" : "false");
}
if ($("settings-toggle")) {
  $("settings-toggle").onclick = (event) => {
    event.stopPropagation();
    const open = $("settings-panel")?.hidden !== false;
    setSettingsOpen(open);
    if (open) sfx.click();
    else sfx.soft();
  };
}
$("more-open").onclick = (event) => {
  event.stopPropagation();
  rollAvatar();
  const pop = $("more-pop");
  const open = pop.hidden;
  pop.hidden = !open;
  $("tape-pop").hidden = true;
  event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
  if (!open) {
    setSettingsOpen(false);
    return;
  }
  sfx.open();
  placePop(pop, event.currentTarget);
};
$("tape-open").onclick = (event) => {
  event.stopPropagation();
  $("more-pop").hidden = true;
  $("tape-pop").hidden = true;
  $("more-open").setAttribute("aria-expanded", "false");
  setSettingsOpen(false);
  openPackDialog();
};
document.addEventListener("pointerdown", (event) => {
  const more = $("more-pop");
  const tape = $("tape-pop");
  const inMore = more && (more.contains(event.target) || event.target.closest("#more-open") || event.target.closest("#key-pop"));
  const inTape = tape && (tape.contains(event.target) || event.target.closest("#tape-open"));
  if (more && !more.hidden && !inMore && !inTape) {
    more.hidden = true;
    $("more-open").setAttribute("aria-expanded", "false");
    setSettingsOpen(false);
  }
  if (tape && !tape.hidden && !inTape) tape.hidden = true;
});
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
if ($("add-open")) $("add-open").onclick = () => { sfx.open(); resetAdd(); $("add-dialog").showModal(); };
function hideModMenu() {
  const menu = $("mod-menu");
  if (menu) menu.hidden = true;
}

function parkAppSettings() {
  const panel = $("settings-panel");
  const home = $("more-settings");
  const slot = $("app-settings");
  const menu = $("app-menu");
  if (panel && home && panel.parentElement !== home) home.append(panel);
  if (slot) slot.hidden = true;
  if (menu) menu.classList.remove("open");
  const toggle = menu?.querySelector('[data-act="settings"]');
  if (toggle) toggle.setAttribute("aria-expanded", "false");
  setSettingsOpen(false);
}

function hideAppMenu() {
  parkAppSettings();
  const menu = $("app-menu");
  if (menu) menu.hidden = true;
}

function toggleAppSettings() {
  const menu = $("app-menu");
  const panel = $("settings-panel");
  const slot = $("app-settings");
  const toggle = menu?.querySelector('[data-act="settings"]');
  if (!menu || !panel || !slot) return;
  if (!slot.hidden) {
    parkAppSettings();
    return;
  }
  slot.append(panel);
  setSettingsOpen(false);
  panel.hidden = false;
  slot.hidden = false;
  menu.classList.add("open");
  if (toggle) toggle.setAttribute("aria-expanded", "true");
  const pad = 8;
  const left = parseFloat(menu.style.left) || 0;
  const top = parseFloat(menu.style.top) || 0;
  menu.style.left = `${Math.max(pad, Math.min(left, window.innerWidth - menu.offsetWidth - pad))}px`;
  menu.style.top = `${Math.max(pad, Math.min(top, window.innerHeight - menu.offsetHeight - pad))}px`;
}

function plainSurface(target) {
  if (!target || !target.closest) return false;
  return !target.closest(".card, button, a, input, textarea, select, label, dialog, #mod-menu, #app-menu, .mark-pop, #more-pop, #tape-pop, [data-kind], .side-mod, .side-twist, .side-fold, .side-add, .prio, summary");
}

function openAppMenu(x, y) {
  const menu = $("app-menu");
  if (!menu) return;
  hideModMenu();
  menu.classList.toggle("flip", x > window.innerWidth * 0.62);
  menu.hidden = false;
  const pad = 8;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(pad, Math.min(x, window.innerWidth - width - pad))}px`;
  menu.style.top = `${Math.max(pad, Math.min(y, window.innerHeight - height - pad))}px`;
}

function openModMenu(id, x, y) {
  const menu = $("mod-menu");
  if (!menu || !id) return;
  menuModId = id;
  const file = menu.querySelector('[data-act="file"]');
  if (file) {
    const mod = state.mods.find((item) => item.id === id);
    file.hidden = !modDownloaded(mod);
  }
  const pick = menu.querySelector('[data-act="pick"] span');
  if (pick) pick.textContent = state.selected.has(id) ? "Quitar selección" : t("select");
  menu.hidden = false;
  const pad = 8;
  const width = menu.offsetWidth;
  const height = menu.offsetHeight;
  menu.style.left = `${Math.max(pad, Math.min(x, window.innerWidth - width - pad))}px`;
  menu.style.top = `${Math.max(pad, Math.min(y, window.innerHeight - height - pad))}px`;
}

function openEdit(id) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  $("edit-dialog").dataset.id = id;
  $("edit-title").textContent = mod.name || "";
  $("edit-name").value = mod.name || "";
  $("edit-note").value = mod.notes || "";
  fillCategorySelect($("edit-category"), mod.category || "General");
  $("edit-dialog").showModal();
  $("edit-name").focus();
}

function openNote(id) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  $("note-dialog").dataset.id = id;
  $("note-name").textContent = mod.name || "";
  $("note-text").value = mod.notes || "";
  $("note-dialog").showModal();
  $("note-text").focus();
}

function openMove(id) {
  const mod = state.mods.find((item) => item.id === id);
  if (!mod) return;
  $("move-dialog").dataset.id = id;
  $("move-name").textContent = mod.name || "";
  fillModpackSelects(
    $("move-pack"),
    $("move-cat"),
    mod.modpackId || "",
    mod.modpackCategoryId || "",
    mod.gameDomain || "",
  );
  $("move-dialog").showModal();
}

let menuModId = "";

$("mod-menu").onclick = (event) => {
  event.stopPropagation();
  const act = event.target.closest("[data-act]")?.dataset.act;
  const id = menuModId;
  hideModMenu();
  if (!id || !act) return;
  if (act === "view") {
    sfx.open();
    openDetail(id);
  }
  if (act === "file") revealMod(id);
  if (act === "edit") openEdit(id);
  if (act === "note") openNote(id);
  if (act === "move") openMove(id);
  if (act === "pick") {
    if (!state.picking) {
      state.picking = true;
      const button = $("pick-mode");
      if (button) {
        button.classList.add("on");
        button.textContent = "Quitar selección";
      }
    }
    if (state.selected.has(id)) state.selected.delete(id);
    else state.selected.add(id);
    sfx.soft();
    render();
  }
};
let plainClick = { t: 0, x: 0, y: 0, el: null };
document.addEventListener("click", (event) => {
  if (!event.target.closest("#mod-menu")) hideModMenu();
  if (!event.target.closest("#app-menu")) hideAppMenu();
  if (!plainSurface(event.target)) {
    plainClick = { t: 0, x: 0, y: 0, el: null };
    return;
  }
  const now = Date.now();
  const again = plainClick.el === event.target
    && now - plainClick.t < 700
    && Math.abs(event.clientX - plainClick.x) < 12
    && Math.abs(event.clientY - plainClick.y) < 12;
  if (again) {
    openAppMenu(event.clientX, event.clientY);
    plainClick = { t: 0, x: 0, y: 0, el: null };
    return;
  }
  plainClick = { t: now, x: event.clientX, y: event.clientY, el: event.target };
});
document.addEventListener("contextmenu", (event) => {
  if (event.target.closest(".card")) {
    hideAppMenu();
    return;
  }
  hideModMenu();
  if (!plainSurface(event.target)) return;
  event.preventDefault();
  openAppMenu(event.clientX, event.clientY);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideModMenu();
    hideAppMenu();
  }
});
window.addEventListener("scroll", () => {
  hideModMenu();
  hideAppMenu();
}, true);
if ($("app-menu")) {
  $("app-menu").querySelectorAll("button").forEach((button) => {
    button.onclick = (event) => {
      const act = button.dataset.act;
      if (act === "settings") {
        event.stopPropagation();
        toggleAppSettings();
        return;
      }
      hideAppMenu();
      if (act === "refresh") refreshAllMods($("refresh-all") || button);
      else if (act === "detect") startGameDetect();
      else if (act === "tour") startTour();
      else if (act === "quit") askQuit(false);
    };
  });
}

$("edit-x").onclick = () => $("edit-dialog").close();
$("edit-cancel").onclick = () => $("edit-dialog").close();
$("edit-form").onsubmit = async (event) => {
  event.preventDefault();
  const id = $("edit-dialog").dataset.id;
  const button = event.submitter;
  setLoading(button, true, "Guardando");
  try {
    await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: $("edit-name").value.trim(),
        category: $("edit-category").value || "General",
        notes: $("edit-note").value || "",
      }),
    });
    toast("Mod actualizado.");
    $("edit-dialog").close();
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};

$("note-x").onclick = () => $("note-dialog").close();
$("note-cancel").onclick = () => $("note-dialog").close();
$("note-form").onsubmit = async (event) => {
  event.preventDefault();
  const id = $("note-dialog").dataset.id;
  const button = event.submitter;
  setLoading(button, true, "Guardando");
  try {
    await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: $("note-text").value || "" }),
    });
    toast("Nota guardada.");
    $("note-dialog").close();
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};

$("move-x").onclick = () => $("move-dialog").close();
$("move-cancel").onclick = () => $("move-dialog").close();
$("move-form").onsubmit = async (event) => {
  event.preventDefault();
  const id = $("move-dialog").dataset.id;
  const button = event.submitter;
  setLoading(button, true, "Moviendo");
  try {
    await api(`/api/mods/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        modpackId: $("move-pack").value || "",
        modpackCategoryId: $("move-cat").value || "",
      }),
    });
    toast("Mod movido.");
    $("move-dialog").close();
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
};

$("bulk-cat").onclick = () => assignMarked("category");
$("bulk-move").onclick = () => assignMarked("pack");
$("bulk-enable").onclick = () => setMarkedActive(true);
$("bulk-disable").onclick = () => setMarkedActive(false);
$("bulk-refresh").onclick = () => refreshMarked();
$("bulk-delete").onclick = () => deleteMarked();
$("add-url").oninput = () => syncAddSource();
$("add-url").addEventListener("paste", (event) => {
  const text = (event.clipboardData && event.clipboardData.getData("text") || "").trim();
  if (!/^https?:\/\//i.test(text)) return;
  event.preventDefault();
  $("add-url").value = text;
  ingestPastedMod();
});
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
if ($("settings-open")) $("settings-open").onclick = () => { sfx.open(); openSettings(); };

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
  steam: {
    label: "Clave Steam Web API",
    field: "steamApiKey",
    flag: "hasSteamKey",
    doc: "https://steamcommunity.com/dev/apikey",
    docLabel: "Sacar clave en Steam",
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
  pop.classList.remove("need");
}

function hasServiceKey(id) {
  if (id === "modrinth") return true;
  return Boolean(state.keys?.[id]);
}

function keyIdFromPlatform(platform) {
  const name = String(platform || "").toLowerCase();
  if (name.includes("curse")) return "curseforge";
  if (name.includes("steam")) return "steam";
  if (name.includes("rawg")) return "rawg";
  if (name.includes("modrinth")) return "modrinth";
  if (name.includes("nexus")) return "nexus";
  return "";
}

function keyIdFromError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  if (/curseforge/.test(msg)) return "curseforge";
  if (/steam/.test(msg)) return "steam";
  if (/rawg/.test(msg)) return "rawg";
  if (/nexus/.test(msg)) return "nexus";
  if (/clave|api key|apikey/.test(msg)) return "nexus";
  return "";
}

function keyIdForUrl(url) {
  return keyIdFromPlatform(platformFromUrl(url));
}

function promptMissingKey(id, reason) {
  const spec = KEY_POPS[id];
  if (!spec?.field) return false;
  const name = spec.label.replace(/^Clave\s+/i, "") || id;
  const note = reason || t("keyNeeded", { name });
  toast(t("keyNeededShort", { name }), "bad");
  openKeyPop(id, { note, center: true });
  return false;
}

function ensureServiceKey(id) {
  if (hasServiceKey(id)) return true;
  return promptMissingKey(id);
}

function maybePromptKeyError(error) {
  const msg = String(error?.message || error || "");
  const low = msg.toLowerCase();
  const looksMissing = error?.status === 401 || /clave|api key|apikey|ajustes/.test(low);
  if (!looksMissing) return false;
  const id = keyIdFromError(error);
  if (!id || !KEY_POPS[id]?.field) return false;
  promptMissingKey(id, msg || undefined);
  return true;
}

function openKeyPop(pillOrId, options = {}) {
  const id = typeof pillOrId === "string" ? pillOrId : pillOrId?.dataset?.key;
  const pill = typeof pillOrId === "string" ? null : pillOrId;
  const spec = KEY_POPS[id];
  const pop = $("key-pop");
  if (!spec || !pop) return;
  if (!options.center && !options.note && pill && !pop.hidden && pop.dataset.key === id) {
    closeKeyPop();
    return;
  }
  pop.dataset.key = id;
  const needsKey = !!spec.field;
  const note = options.note || spec.note || "";
  $("key-pop-note").hidden = !note;
  $("key-pop-note").textContent = note;
  $("key-pop-field").hidden = !needsKey;
  $("key-pop-label").textContent = needsKey ? spec.label : "";
  $("key-pop-input").value = "";
  $("key-pop-input").placeholder = state.keys?.[id] ? "Pega otra clave para reemplazarla" : "Pega la clave";
  $("key-pop-save").hidden = !needsKey;
  $("key-pop-doc").href = spec.doc;
  $("key-pop-doc").textContent = spec.docLabel;
  $("key-pop-status").textContent = "";
  $("key-pop-status").className = "status";
  pop.classList.toggle("need", Boolean(options.note || options.center));
  pop.hidden = false;
  const box = pop.getBoundingClientRect();
  if (options.center || !pill) {
    const left = Math.max(8, Math.round((window.innerWidth - box.width) / 2));
    const top = Math.max(8, Math.round((window.innerHeight - box.height) / 3));
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  } else {
    const rect = pill.getBoundingClientRect();
    const dock = document.querySelector(".dock");
    const limit = dock ? dock.getBoundingClientRect().top - 8 : window.innerHeight - 8;
    const flip = $("more-pop")?.classList.contains("flip");
    const left = Math.max(8, Math.min(flip ? rect.left - box.width - 8 : rect.right + 8, window.innerWidth - box.width - 8));
    let top = rect.top;
    if (top + box.height > limit) top = Math.max(8, limit - box.height);
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }
  if (needsKey) $("key-pop-input").focus();
}

$("dock-keys").onclick = (event) => {
  const summary = event.target.closest("#keys-summary");
  if (summary) {
    event.stopPropagation();
    const node = $("dock-keys");
    const open = !node.classList.contains("open");
    if (open) closeThemeSwitch();
    node.classList.toggle("open", open);
    summary.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) sfx.open();
    return;
  }
  const pill = event.target.closest("[data-key]");
  if (!pill) return;
  sfx.open();
  openKeyPop(pill);
};
document.addEventListener("pointerdown", (event) => {
  const pop = $("key-pop");
  if (pop && !pop.hidden) {
    if (!(pop.contains(event.target) || event.target.closest("#dock-keys [data-key]"))) closeKeyPop();
  }
  const keys = $("dock-keys");
  if (keys && keys.classList.contains("open") && !keys.contains(event.target) && !(pop && pop.contains(event.target))) {
    closeKeysStack();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  closeKeyPop();
  closeKeysStack();
  closeThemeSwitch();
  const more = $("more-pop");
  const tape = $("tape-pop");
  if (more) more.hidden = true;
  if (tape) tape.hidden = true;
  const dots = $("more-open");
  if (dots) dots.setAttribute("aria-expanded", "false");
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
      steam: !!data.hasSteamKey,
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
    const steam = ($("steam-key")?.value || "").trim();
    if (nexus) body.apiKey = nexus;
    if (rawg) body.rawgApiKey = rawg;
    if (curse) body.curseforgeApiKey = curse;
    if (steam) body.steamApiKey = steam;
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
    if ($("steam-status")) {
      $("steam-status").textContent = data.hasSteamKey ? `Steam: ${data.steamHint}` : "Steam: sin clave.";
    }
    fillSecret($("api-key"), data.apiKey);
    fillSecret($("rawg-key"), data.rawgApiKey);
    fillSecret($("cf-key"), data.curseforgeApiKey);
    fillSecret($("steam-key"), data.steamApiKey);
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
let launchSetupBound = null;

async function pickExePath({ forceNative = false } = {}) {
  const host = window.pywebview && window.pywebview.api;
  if (host && typeof host.pick_exe === "function") {
    try {
      const picked = await host.pick_exe();
      if (picked) return String(picked);
    } catch (_) { /* fallback */ }
  }
  if (forceNative) return "";
  return askInput({
    title: t("launchManual"),
    hint: t("launchBrowseHint"),
    placeholder: t("launchPathPh"),
    label: t("launchPathLabel"),
    browse: "folder",
    value: "",
    okLabel: t("save"),
  });
}

async function pickFolderPath({ forceNative = false } = {}) {
  const host = window.pywebview && window.pywebview.api;
  if (host && typeof host.pick_folder === "function") {
    try {
      const picked = await host.pick_folder();
      if (picked) return String(picked);
    } catch (_) { /* fallback */ }
  }
  if (forceNative) return "";
  return "";
}

function closeLaunchDialog() {
  if (launchSetupBound) {
    launchSetupBound.cleanup();
    launchSetupBound = null;
  }
  const dialog = $("launch-dialog");
  if (dialog?.open) dialog.close();
}

function resetLaunchDialog(gameName) {
  const msg = $("launch-msg");
  const status = $("launch-status");
  const hits = $("launch-hits");
  if (msg) {
    msg.hidden = false;
    msg.textContent = t("launchMissing");
  }
  if (status) {
    status.hidden = true;
    status.textContent = "";
  }
  if (hits) {
    hits.hidden = true;
    hits.innerHTML = "";
  }
  const title = $("launch-dialog")?.querySelector("h2");
  if (title) title.textContent = gameName ? `${t("launchTitle")} · ${gameName}` : t("launchTitle");
  ["launch-auto", "launch-manual"].forEach((id) => {
    const btn = $(id);
    if (btn) btn.hidden = false;
  });
}

async function saveLaunchPath(domain, path) {
  const data = await api("/api/game/launch-path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: domain, path }),
  });
  if (data.catalog) state.catalog = data.catalog;
  paintGamePlay();
  return data.game || catalogGame(domain);
}

async function runLaunch(domain, path) {
  const data = await api("/api/game/launch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: domain, path: path || undefined }),
  });
  if (data.catalog) state.catalog = data.catalog;
  toast(t("launchOk"));
  sfx.ok();
  return data;
}

function paintLaunchHits(domain, candidates) {
  const box = $("launch-hits");
  const status = $("launch-status");
  if (!box) return;
  box.hidden = false;
  box.innerHTML = candidates.map((hit, index) => {
    const kind = hit.isFile === false || hit.kind === "folder" ? t("launchFolder") : t("launchExe");
    return `<button type="button" class="launch-hit" data-launch-hit="${index}">
      <b>${esc(hit.name || hit.path)}</b>
      <span class="meta">${esc(kind)} · ${esc(hit.path)}</span>
    </button>`;
  }).join("");
  if (status) {
    status.hidden = false;
    status.textContent = t("launchPick");
  }
  box.querySelectorAll("[data-launch-hit]").forEach((button) => {
    button.onclick = async () => {
      const hit = candidates[Number(button.dataset.launchHit)];
      if (!hit?.path) return;
      setLoading(button, true, "…");
      try {
        await saveLaunchPath(domain, hit.path);
        closeLaunchDialog();
        toast(t("launchSaved"));
        await runLaunch(domain, hit.path);
      } catch (error) {
        toast(error.message, "bad");
        sfx.err();
      } finally {
        setLoading(button, false);
      }
    };
  });
}

async function launchAutoDetect(domain) {
  const status = $("launch-status");
  const autoBtn = $("launch-auto");
  if (status) {
    status.hidden = false;
    status.textContent = t("launchSearching");
  }
  setLoading(autoBtn, true, "…");
  try {
    const data = await api("/api/game/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: domain }),
    });
    const hits = (data.candidates || []).filter((row) => row?.path);
    if (!hits.length) {
      if (status) status.textContent = t("launchNone");
      toast(t("launchNone"), "bad");
      await launchManualPick(domain);
      return;
    }
    // Carpeta/exe claro (uno solo, o el top gana por mucho) → vincular y listo
    const top = hits[0];
    const second = hits[1];
    const clear =
      hits.length === 1
      || (Number(top.score) >= 70 && (!second || Number(top.score) - Number(second.score) >= 25));
    if (clear) {
      await saveLaunchPath(domain, top.path);
      closeLaunchDialog();
      toast(t("launchSaved"));
      await runLaunch(domain, top.path);
      return;
    }
    paintLaunchHits(domain, hits);
  } catch (error) {
    if (status) status.textContent = error.message;
    toast(error.message, "bad");
    sfx.err();
    await launchManualPick(domain);
  } finally {
    setLoading(autoBtn, false);
  }
}

async function launchManualPick(domain) {
  // Diálogo con Examinar → selector de carpetas de Windows
  let path = await askInput({
    title: t("launchManual"),
    hint: t("launchBrowseHint"),
    placeholder: t("launchPathPh"),
    label: t("launchPathLabel"),
    browse: "folder",
    value: "",
    okLabel: t("save"),
  });
  if (!path) return;
  try {
    await saveLaunchPath(domain, path);
    closeLaunchDialog();
    toast(t("launchSaved"));
    await runLaunch(domain, path);
  } catch (error) {
    toast(error.message, "bad");
    sfx.err();
  }
}

function openLaunchSetup(game, { auto = false } = {}) {
  const dialog = $("launch-dialog");
  if (!dialog) return;
  const domain = String(game?.gameDomain || state.game || "");
  if (launchSetupBound) {
    launchSetupBound.cleanup();
    launchSetupBound = null;
  }
  resetLaunchDialog(game?.gameName || gameLabel(domain));
  const finish = () => {
    closeLaunchDialog();
  };
  const onAuto = async (event) => {
    event.preventDefault();
    await launchAutoDetect(domain);
  };
  const onManual = async (event) => {
    event.preventDefault();
    await launchManualPick(domain);
  };
  const cleanup = () => {
    $("launch-auto")?.removeEventListener("click", onAuto);
    $("launch-manual")?.removeEventListener("click", onManual);
    $("launch-cancel")?.removeEventListener("click", finish);
    launchSetupBound = null;
  };
  launchSetupBound = { cleanup, domain };
  $("launch-auto")?.addEventListener("click", onAuto);
  $("launch-manual")?.addEventListener("click", onManual);
  $("launch-cancel")?.addEventListener("click", finish);
  sfx.warn();
  dialog.showModal();
  if (auto) launchAutoDetect(domain);
}

function startGameDetect() {
  const domain = state.game;
  if (!domain) {
    toast(t("launchNeedGame"), "bad");
    return;
  }
  const more = $("more-pop");
  if (more) more.hidden = true;
  const game = catalogGame(domain) || { gameDomain: domain, gameName: gameLabel(domain) };
  openLaunchSetup(game, { auto: true });
}

async function playActiveGame(event) {
  event?.preventDefault?.();
  const domain = state.game;
  if (!domain) {
    toast(t("launchNeedGame"), "bad");
    return;
  }
  const pack = state.modpack ? packById(state.modpack) : null;
  if (minecraftPack(domain) || minecraftPack(pack?.gameDomain) || pack?.mcVersion) {
    if (!pack?.name) {
      toast("Elige una instancia.", "bad");
      return;
    }
    try {
      await api("/api/minecraft/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: pack.name }),
      });
      toast(t("launchOk"));
      sfx.ok();
    } catch (error) {
      toast(error.message, "bad");
      sfx.err();
    }
    return;
  }
  const game = catalogGame(domain) || { gameDomain: domain, gameName: gameLabel(domain) };
  const forceSetup = event?.shiftKey || event?.altKey;
  if (!forceSetup && gameHasLauncher(game)) {
    try {
      await runLaunch(domain);
      return;
    } catch (error) {
      if (error?.payload?.error !== "missing_launch" && error?.status !== 409) {
        toast(error.message, "bad");
        sfx.err();
        if (!(await askConfirm(`${error.message}\n¿Vincular otro lanzador?`))) return;
      }
    }
  }
  openLaunchSetup(game);
}

function isMinecraftDomain(domain) {
  const name = String(gameLabel(domain) || domain || "").toLowerCase();
  return String(domain || "").toLowerCase() === "minecraft" || name.includes("minecraft");
}

function bindGameAdd() {
  const button = $("game-add");
  if (!button || button.dataset.bound) return;
  button.dataset.bound = "1";
  button.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeGameMenu();
    openGameDialog();
  };
}
bindGameAdd();
if ($("game-play")) $("game-play").onclick = playActiveGame;

let instanceLoaders = {};
let instanceFinish = null;

function instanceLoaderPicked() {
  return document.querySelector('input[name="instance-loader"]:checked')?.value || "";
}

function paintInstanceLoaders(found) {
  for (const name of ["forge", "fabric", "quilt", "neoforge", "vanilla"]) {
    const input = document.querySelector(`input[name="instance-loader"][value="${name}"]`);
    if (!input) continue;
    const enabled = name === "vanilla" || (found[name] || []).length > 0;
    input.disabled = !enabled;
    input.closest("label")?.classList.toggle("off", !enabled);
    if (!enabled && input.checked) input.checked = false;
  }
  if (!instanceLoaderPicked()) {
    const first = document.querySelector('input[name="instance-loader"]:not(:disabled)');
    if (first) first.checked = true;
  }
}

function fillInstanceLoaderVersions() {
  const select = $("instance-loader-version");
  if (!select) return;
  const loader = instanceLoaderPicked();
  const versions = loader && loader !== "vanilla" ? (instanceLoaders[loader] || []) : [];
  select.disabled = !versions.length;
  select.innerHTML = versions.map((version) => `<option value="${esc(version)}">${esc(version)}</option>`).join("");
}

async function refreshInstanceLoaders() {
  const version = $("instance-mc")?.value || "";
  if (!version) return;
  const data = await api(`/api/minecraft/loaders?version=${encodeURIComponent(version)}`);
  instanceLoaders = data.loaders || {};
  paintInstanceLoaders(instanceLoaders);
  fillInstanceLoaderVersions();
}

function minecraftPack(domain) {
  return String(domain || "").toLowerCase().startsWith("minecraft");
}

function paintMpMinecraft(pack) {
  const on = minecraftPack(pack?.gameDomain || state.game);
  $("mp-mc")?.toggleAttribute("hidden", !on);
  $("mp-mc-ver")?.toggleAttribute("hidden", !on);
  $("modpacks-form")?.classList.toggle("mc-pack", on);
}

let mpMcToken = 0;

async function fillMpMinecraft(pack) {
  const token = ++mpMcToken;
  paintMpMinecraft(pack);
  if ($("mp-mc")?.hidden) return;
  const data = await api("/api/minecraft/versions");
  if (token !== mpMcToken) return;
  const select = $("instance-mc");
  if (!select) return;
  select.innerHTML = (data.versions || []).map((version) => `<option value="${esc(version)}">${esc(version)}</option>`).join("");
  if (pack?.mcVersion) select.value = pack.mcVersion;
  await refreshInstanceLoaders();
  if (token !== mpMcToken) return;
  if (pack?.loaderType) {
    const radio = document.querySelector(`input[name="instance-loader"][value="${pack.loaderType}"]`);
    if (radio && !radio.disabled) radio.checked = true;
    fillInstanceLoaderVersions();
  }
  if (pack?.loaderVersion && $("instance-loader-version")) $("instance-loader-version").value = pack.loaderVersion;
}

function openInstanceDialog() {
  const dialog = $("modpacks-dialog");
  if (!dialog) return Promise.resolve(null);
  return new Promise((resolve) => {
    instanceFinish = resolve;
    openModpacksDialog();
    const onClose = () => {
      dialog.removeEventListener("close", onClose);
      const finish = instanceFinish;
      instanceFinish = null;
      finish?.(null);
    };
    dialog.addEventListener("close", onClose);
  });
}

if ($("instance-mc")) $("instance-mc").onchange = () => { refreshInstanceLoaders().catch((error) => toast(error.message || String(error), "bad")); };
document.querySelectorAll('input[name="instance-loader"]').forEach((input) => {
  input.onchange = () => fillInstanceLoaderVersions();
});
if ($("launch-form")) $("launch-form").onsubmit = (event) => event.preventDefault();
$("game-picker").onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  const menu = $("game-menu");
  const open = menu.hidden;
  if (open) {
    menu.hidden = false;
    $("game-picker").setAttribute("aria-expanded", "true");
    const search = menu.querySelector(".game-menu-search");
    if (search) search.value = "";
    renderGameScope();
    menu.querySelector(".game-menu-search")?.focus();
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

function selectedInstanceFilter() {
  const pack = state.modpack ? packById(state.modpack) : null;
  const mc = String(pack?.mcVersion || "").trim();
  const loader = String(pack?.loaderType || "").trim().toLowerCase();
  if (!mc) return null;
  return { mc, loader: loader === "vanilla" ? "" : loader };
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
  const needKey = target === "CurseForge" ? "curseforge" : (target === "Nexus" ? "nexus" : "");
  if (needKey && !ensureServiceKey(needKey)) {
    box.innerHTML = `<p class="hint">${esc(t("keyNeededShort", {
      name: (KEY_POPS[needKey]?.label || needKey).replace(/^Clave\s+/i, ""),
    }))}</p>`;
    return;
  }
  const token = ++remoteToken;
  const filter = selectedInstanceFilter();
  const tag = filter ? ` · ${filter.loader ? `${filter.loader} ` : ""}${filter.mc}` : "";
  box.innerHTML = `<p class="hint">Buscando en ${esc(target)}${esc(tag)}…</p>`;
  const game = target === "Modrinth" ? "" : `&game=${encodeURIComponent(state.game)}`;
  const compat = filter
    ? `&mc=${encodeURIComponent(filter.mc)}${filter.loader ? `&loader=${encodeURIComponent(filter.loader)}` : ""}`
    : "";
  const path = target === "Modrinth"
    ? "/api/modrinth/search"
    : (target === "CurseForge" ? "/api/curseforge/search" : "/api/nexus/search");
  try {
    const data = await api(`${path}?q=${encodeURIComponent(q)}${game}${compat}`);
    if (token !== remoteToken) return;
    paintRemote(data.results || [], target, filter);
  } catch (error) {
    if (token !== remoteToken) return;
    maybePromptKeyError(error);
    box.innerHTML = `<p class="hint">${esc(error.message)}</p>`;
  }
}

function paintRemote(results, label, filter) {
  const box = $("search-remote");
  const where = label || "Nexus";
  const tag = filter ? ` compatible con ${filter.loader ? `${filter.loader} ` : ""}${filter.mc}` : "";
  if (!results.length) {
    box.innerHTML = `<p class="hint">Nada en ${esc(where)}${esc(tag)}.</p>`;
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
        placeSavedMod(hit.savedId);
        return;
      }
      addRemoteMod(hit, button);
    };
  });
}

async function placeSavedMod(id) {
  const pack = state.modpack || "";
  const mod = state.mods.find((row) => row.id === id);
  if (pack && (!mod || mod.modpackId !== pack || (state.packCat && mod.modpackCategoryId !== state.packCat))) {
    try {
      await api(`/api/mods/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modpackId: pack,
          modpackCategoryId: state.packCat || "",
        }),
      });
      toast("En la instancia.");
      await load();
      revealAdded(id);
      return;
    } catch (error) {
      toast(error.message, "bad");
    }
  }
  hideRemoteSearch();
  openDetail(id);
}

function revealAdded(id) {
  if (visible().some((mod) => mod.id === id)) return;
  state.query = "";
  state.listQuery = "";
  if ($("search")) $("search").value = "";
  if ($("list-search")) $("list-search").value = "";
  hideRemoteSearch();
  render();
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
        modpackId: state.modpack || "",
        modpackCategoryId: state.packCat || "",
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
    button.onclick = () => placeSavedMod(hit.savedId);
    await load();
    revealAdded(hit.savedId);
  } catch (error) {
    button.disabled = false;
    button.textContent = "Añadir";
    if (!maybePromptKeyError(error)) toast(error.message, "bad");
  }
}

$("search").oninput = (event) => {
  state.query = event.target.value;
  render();
  scheduleRemoteSearch();
};
if ($("list-search")) {
  $("list-search").oninput = (event) => {
    state.listQuery = event.target.value;
    render();
  };
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideRemoteSearch();
});
$("sort").onchange = (event) => {
  state.sort = event.target.value;
  localStorage.setItem("wi-mod-sort", state.sort);
  sfx.click();
  render();
};
$("sort").value = state.sort;
$("pick-all").onclick = () => selectAllVisible();
document.querySelectorAll(".view-toggle [data-view]").forEach((button) => {
  button.onclick = () => setView(button.dataset.view);
});
$("size-down").onclick = () => setCardScale(cardScale() - 0.1);
$("size-reset").onclick = () => setCardScale(SCALE_DEFAULT);
$("size-up").onclick = () => setCardScale(cardScale() + 0.1);
window.addEventListener("wheel", (event) => {
  if (!event.ctrlKey && !event.metaKey) return;
  if (typingField(event)) return;
  event.preventDefault();
  setCardScale(cardScale() + (event.deltaY < 0 ? 0.1 : -0.1), true);
}, { capture: true, passive: false });
$("hero-show").onclick = () => {
  localStorage.setItem("wi-mod-hero", "1");
  renderGameHero();
};
if ($("dock-hide")) {
  $("dock-hide").onclick = () => {
    localStorage.setItem("wi-mod-dock", "0");
    const log = $("log-panel");
    if (log) log.hidden = true;
    applyDockVis();
  };
}
if ($("dock-show")) {
  $("dock-show").onclick = () => {
    localStorage.setItem("wi-mod-dock", "1");
    applyDockVis();
  };
}
$("export").onclick = () => { $("tape-pop").hidden = true; openPackDialog(); };
$("import").onclick = () => { $("tape-pop").hidden = true; openPackDialog(); };
$("pack-scope").onchange = syncPackDialog;
$("pack-value").onchange = syncPackDialog;
$("pack-file").onchange = previewPackFile;
$("pack-form").onsubmit = (event) => event.preventDefault();
$("pack-export").onclick = (event) => runPackAction(event, "export");
if ($("pack-export-elsewhere")) {
  $("pack-export-elsewhere").onclick = (event) => runPackAction(event, "export", { choosePath: true });
}
$("pack-import").onclick = (event) => runPackAction(event, "import");
$("pack-go-export").onclick = () => showPackPane("export");
$("pack-go-import").onclick = () => showPackPane("import");
$("pack-back").onclick = () => showPackPane("home");
$("pack-back-2").onclick = () => showPackPane("home");
$("pack-in-scope").onchange = fillImportChoices;
if ($("pack-file-browse")) {
  $("pack-file-browse").onclick = async () => {
    sfx.click();
    const host = window.pywebview && window.pywebview.api;
    if (host && typeof host.pick_zip === "function") {
      try {
        const picked = await host.pick_zip();
        if (!picked) return;
        state.importZipPath = String(picked);
        const pathInput = $("pack-file-path");
        if (pathInput) pathInput.value = state.importZipPath;
        $("pack-file").value = "";
        await previewPackFromPath(state.importZipPath);
        return;
      } catch (error) {
        toast(error.message, "bad");
        return;
      }
    }
    $("pack-file")?.click();
  };
}
if ($("packs-open")) $("packs-open").onclick = () => { sfx.open(); openModpacksDialog(); };
$("mp-delete").onclick = () => deleteCurrentModpack();
$("modpacks-form").onsubmit = saveModpackForm;
$("packcat-form").onsubmit = savePackCatForm;
$("mp-cat-add").onclick = () => addMpCatRow();
$("mp-name").addEventListener("input", paintMpMark);
$("mp-notes").addEventListener("input", paintMpMark);
$("mp-emoji-toggle").onclick = () => {
  const box = $("mp-emoji-box");
  box.hidden = !box.hidden;
  if (!box.hidden) {
    paintMpEmojiGrid();
    $("mp-emoji-search").focus();
  }
};
$("mp-emoji-search").addEventListener("input", paintMpEmojiGrid);
$("mp-emoji-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-i]");
  if (!button) return;
  const emoji = MARK_EMOJIS[Number(button.dataset.i)]?.[1] || "";
  if (!emoji) return;
  setMpMark(emoji, "");
  $("mp-emoji-box").hidden = true;
});
$("mp-mark-file").addEventListener("change", async () => {
  const file = $("mp-mark-file").files?.[0];
  $("mp-mark-file").value = "";
  if (!file) return;
  try {
    const upload = new FormData();
    upload.append("file", file);
    const uploaded = await api("/api/images", { method: "POST", body: upload });
    setMpMark("", uploaded.imageUrl || "");
  } catch (error) {
    toast(error.message, "bad");
  }
});
$("mp-mark-clear").onclick = () => setMpMark("", "");
$("cat-form").onsubmit = saveCategoryForm;
$("cat-emoji-toggle").onclick = () => {
  const box = $("cat-emoji-box");
  box.hidden = !box.hidden;
  if (!box.hidden) {
    paintCatEmojiGrid();
    $("cat-emoji-search").focus();
  }
};
$("cat-emoji-search").addEventListener("input", paintCatEmojiGrid);
$("cat-emoji-grid").addEventListener("click", (event) => {
  const button = event.target.closest("[data-i]");
  if (!button) return;
  const emoji = MARK_EMOJIS[Number(button.dataset.i)]?.[1] || "";
  if (!emoji) return;
  setCatMark(emoji, "");
  $("cat-emoji-box").hidden = true;
});
$("cat-mark-file").addEventListener("change", async () => {
  const file = $("cat-mark-file").files?.[0];
  $("cat-mark-file").value = "";
  if (!file) return;
  try {
    const upload = new FormData();
    upload.append("file", file);
    const uploaded = await api("/api/images", { method: "POST", body: upload });
    setCatMark("", uploaded.imageUrl || "");
  } catch (error) {
    toast(error.message, "bad");
  }
});
$("cat-mark-clear").onclick = () => setCatMark("", "");

function gameOptionsForPacks() {
  return [
    ["stardewvalley", "Stardew Valley"],
    ["minecraft", "Minecraft"],
    ["gtasa", "GTA San Andreas"],
    ["skyrimspecialedition", "The Elder Scrolls V: Skyrim Special Edition"],
    ["projectzomboid", "Project Zomboid"],
  ];
}

function openModpacksDialog() {
  resetModpackForm();
  const dialog = $("modpacks-dialog");
  if (dialog && !dialog.open) {
    sfx.open();
    dialog.showModal();
  }
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

let catMarkDraft = { emoji: "", imageUrl: "", dirty: false };

function paintCatMark() {
  const face = $("cat-mark-face");
  const clear = $("cat-mark-clear");
  if (!face) return;
  if (catMarkDraft.imageUrl) face.innerHTML = `<img alt="" src="${esc(catMarkDraft.imageUrl)}">`;
  else face.textContent = catMarkDraft.emoji || "🏷️";
  if (clear) clear.hidden = !(catMarkDraft.emoji || catMarkDraft.imageUrl);
}

function setCatMark(emoji, imageUrl) {
  catMarkDraft = { emoji: emoji || "", imageUrl: imageUrl || "", dirty: true };
  paintCatMark();
}

function paintCatEmojiGrid() {
  const query = ($("cat-emoji-search").value || "").trim().toLowerCase();
  $("cat-emoji-grid").innerHTML = MARK_EMOJIS.map(([name, emoji], index) => (
    !query || name.includes(query) || emoji.includes(query)
      ? `<button type="button" data-i="${index}">${emoji}</button>`
      : ""
  )).join("");
}

function openCategoryDialog(name) {
  const current = String(name || "");
  if (!current) return;
  $("cat-old").value = current;
  $("cat-name").value = categoryLabel(current);
  const mark = markOf("category", current) || {};
  catMarkDraft = { emoji: mark.emoji || "", imageUrl: mark.imageUrl || "", dirty: false };
  if ($("cat-emoji-box")) $("cat-emoji-box").hidden = true;
  if ($("cat-emoji-search")) $("cat-emoji-search").value = "";
  paintCatMark();
  $("cat-dialog").showModal();
}

async function saveCategoryForm(event) {
  event.preventDefault();
  const old = $("cat-old").value;
  let next = ($("cat-name").value || "").trim();
  if (!next) return;
  if (next === categoryLabel(old)) next = old;
  const button = event.submitter || $("cat-form").querySelector("[type=submit]");
  setLoading(button, true, "Guardando");
  try {
    if (next !== old) {
      const data = await api("/api/catalog/rename", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: old, name: next }),
      });
      state.catalog = data.catalog || state.catalog;
      if (state.category === old) state.category = next;
    }
    if (catMarkDraft.dirty) {
      const marked = await api("/api/catalog/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "category",
          id: next,
          emoji: catMarkDraft.emoji,
          imageUrl: catMarkDraft.imageUrl,
        }),
      });
      state.catalog = marked.catalog || state.catalog;
      catMarkDraft.dirty = false;
    }
    toast("Categoría guardada.");
    $("cat-dialog").close();
    await load();
  } catch (error) {
    toast(error.message, "bad");
  } finally {
    setLoading(button, false);
  }
}

let mpMarkDraft = { emoji: "", imageUrl: "", dirty: false };

function paintMpMark() {
  const face = $("mp-mark-face");
  const clear = $("mp-mark-clear");
  if (!face) return;
  if (mpMarkDraft.imageUrl) face.innerHTML = `<img alt="" src="${esc(mpMarkDraft.imageUrl)}">`;
  else face.textContent = mpMarkDraft.emoji || "📦";
  if (clear) clear.hidden = !(mpMarkDraft.emoji || mpMarkDraft.imageUrl);
  const name = $("mp-preview-name");
  const notes = $("mp-preview-notes");
  if (name) name.textContent = ($("mp-name")?.value || "").trim() || "Nombre";
  if (notes) {
    const text = ($("mp-notes")?.value || "").trim();
    notes.textContent = text;
    notes.hidden = !text;
  }
}

function setMpMark(emoji, imageUrl) {
  mpMarkDraft = { emoji: emoji || "", imageUrl: imageUrl || "", dirty: true };
  paintMpMark();
}

function loadMpMark(id) {
  const mark = id ? (markOf("modpack", id) || {}) : {};
  mpMarkDraft = { emoji: mark.emoji || "", imageUrl: mark.imageUrl || "", dirty: false };
  const box = $("mp-emoji-box");
  if (box) box.hidden = true;
  if ($("mp-emoji-search")) $("mp-emoji-search").value = "";
  paintMpMark();
}

function paintMpEmojiGrid() {
  const query = ($("mp-emoji-search").value || "").trim().toLowerCase();
  $("mp-emoji-grid").innerHTML = MARK_EMOJIS.map(([name, emoji], index) => (
    !query || name.includes(query) || emoji.includes(query)
      ? `<button type="button" data-i="${index}">${emoji}</button>`
      : ""
  )).join("");
}

async function applyMpMark(id) {
  if (!mpMarkDraft.dirty || !id) return;
  const data = await api("/api/catalog/mark", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "modpack",
      id,
      emoji: mpMarkDraft.emoji,
      imageUrl: mpMarkDraft.imageUrl,
    }),
  });
  state.catalog = data.catalog || state.catalog;
  mpMarkDraft.dirty = false;
}

function resetModpackForm() {
  $("mp-edit-id").value = "";
  $("mp-name").value = "";
  $("mp-notes").value = "";
  $("mp-save").textContent = t("instanceCreate");
  $("mp-delete").hidden = true;
  const title = $("modpacks-dialog")?.querySelector("h2");
  if (title) title.textContent = t("createPack");
  $("mp-cats").innerHTML = "";
  addMpCatRow();
  loadMpMark("");
  fillMpMinecraft(null).catch((error) => toast(error.message || String(error), "bad"));
}

function editModpack(id) {
  const pack = packById(id);
  if (!pack) return;
  $("mp-edit-id").value = pack.id;
  $("mp-name").value = pack.name || "";
  $("mp-notes").value = pack.notes || "";
  $("mp-save").textContent = "Actualizar";
  $("mp-delete").hidden = false;
  const title = $("modpacks-dialog")?.querySelector("h2");
  if (title) title.textContent = t("modpacks");
  $("mp-cats").innerHTML = "";
  addMpCatRow();
  loadMpMark(pack.id);
  fillMpMinecraft(pack).catch((error) => toast(error.message || String(error), "bad"));
}

async function deleteCurrentModpack() {
  const id = $("mp-edit-id").value;
  const pack = packById(id);
  if (!pack) return;
  if (!(await askConfirm(`¿Eliminar “${pack.name}”? Los mods quedan sin pack.`))) return;
  try {
    await api(`/api/modpacks/${id}`, { method: "DELETE" });
    if (state.modpack === id) state.modpack = "";
    toast("Modpack eliminado.", "warn");
    closeOpenDialogs();
    await load();
  } catch (error) {
    toast(error.message, "bad");
  }
}

async function createInstance(name, body) {
  await api("/api/minecraft/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mc_version: body.mcVersion,
      loader_type: body.loaderType,
      loader_version: body.loaderVersion,
    }),
  });
}

function installInstance(name) {
  return api("/api/minecraft/profiles/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(() => toast(t("instanceReady")));
}

async function saveModpackForm(event) {
  event.preventDefault();
  const name = ($("mp-name").value || "").trim();
  const editId = $("mp-edit-id").value;
  const existing = editId ? packById(editId) : null;
  const gameDomain = existing?.gameDomain || state.game || "";
  if (!name || !gameDomain) {
    toast("Elige un juego arriba.", "warn");
    return;
  }
  const gameName = existing?.gameName || gameLabel(gameDomain) || gameDomain;
  const body = {
    name,
    gameDomain,
    gameName,
    notes: $("mp-notes").value || "",
  };
  if (!$("mp-mc")?.hidden) {
    const mc = $("instance-mc")?.value || "";
    const loader = instanceLoaderPicked();
    const build = loader === "vanilla" ? mc : ($("instance-loader-version")?.value || "");
    if (!mc || !loader || (loader !== "vanilla" && !build)) {
      toast(t("pickFirst"), "bad");
      return;
    }
    body.mcVersion = mc;
    body.loaderType = loader;
    body.loaderVersion = build;
  }
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
    let installAfter = false;
    if (!editId && body.loaderType) {
      try {
        await createInstance(name, body);
      } catch (error) {
        if (!/java/i.test(error.message || "")) throw error;
        if (!(await askConfirm(t("javaAsk")))) throw error;
        await api("/api/java/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mc_version: body.mcVersion || "" }),
        });
        toast(t("javaReady"));
        await createInstance(name, body);
      }
      installAfter = body.loaderType !== "vanilla";
    }
    if (pack?.id) await applyMpMark(pack.id);
    if (!editId && pack?.id) {
      if (pack.gameDomain) {
        state.game = pack.gameDomain;
        localStorage.setItem("wi-mod-game", state.game);
      }
      state.modpack = pack.id;
      await load();
      const finish = instanceFinish;
      instanceFinish = null;
      $("modpacks-dialog").close();
      finish?.(pack);
      if (installAfter) installInstance(name).catch((error) => toast(error.message, "bad"));
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
if ($("detect-games")) {
  $("detect-games").onclick = () => {
    sfx.click();
    startGameDetect();
  };
}

async function refreshAllMods(button) {
  if (!button) return;
  setLoading(button, true, "Revisando");
  sfx.sniff();
  try {
    const data = await api("/api/refresh", { method: "POST" });
    const fails = data.failed?.length ? ` ${data.failed.length} fallaron.` : "";
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
}

$("refresh-all").onclick = () => refreshAllMods($("refresh-all"));
if ($("side-refresh")) $("side-refresh").onclick = () => refreshAllMods($("side-refresh"));

function openPackDialog() {
  state.packPreview = null;
  state.importZipPath = "";
  sfx.open();
  $("pack-file").value = "";
  if ($("pack-file-path")) $("pack-file-path").value = "";
  if ($("pack-scope").value === "selected" && !state.selected.size) $("pack-scope").value = "all";
  showPackPane("home");
  $("pack-dialog").showModal();
}

function showPackPane(mode) {
  state.packMode = mode;
  $("pack-home").hidden = mode !== "home";
  $("pack-export-pane").hidden = mode !== "export";
  $("pack-import-pane").hidden = mode !== "import";
  $("pack-title").textContent = mode === "export" ? "Exportar" : mode === "import" ? "Importar" : "Importar y exportar";
  paintPackFolderHints();
  if (mode === "export") syncPackDialog();
  if (mode === "import") paintImportPreview();
}

function paintPackFolderHints() {
  const dir = state.packsDir || "";
  const out = $("pack-export-path");
  const inn = $("pack-import-path");
  if (out) {
    out.hidden = !dir;
    out.textContent = dir ? t("packsFolder", { path: dir }) : "";
  }
  if (inn) {
    inn.hidden = !dir;
    inn.textContent = dir ? t("packsFolder", { path: dir }) : "";
  }
  const pathInput = $("pack-file-path");
  if (pathInput && !state.importZipPath) {
    pathInput.placeholder = t("zipFilePh");
    pathInput.value = "";
  }
}

function packFilter() {
  if (state.packMode === "import") {
    const scope = $("pack-in-scope")?.value || "all";
    const value = $("pack-in-value")?.value || "";
    const filt = { scope };
    if (scope === "game") filt.game = value;
    if (scope === "modpack") filt.modpack = value;
    return filt;
  }
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

async function previewPackFromPath(path) {
  state.packPreview = null;
  if (!path) {
    paintImportPreview();
    return;
  }
  try {
    const data = await api("/api/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    state.packPreview = data.preview || null;
    paintImportPreview();
  } catch (error) {
    state.packPreview = null;
    paintImportPreview();
    toast(error.message, "bad");
  }
}

async function previewPackFile() {
  const file = $("pack-file").files?.[0];
  state.packPreview = null;
  state.importZipPath = "";
  const pathInput = $("pack-file-path");
  if (pathInput) pathInput.value = file ? file.name : "";
  if (!file) {
    paintImportPreview();
    return;
  }
  const form = new FormData();
  form.append("file", file);
  try {
    const data = await api("/api/import/preview", { method: "POST", body: form });
    state.packPreview = data.preview || null;
  } catch (error) {
    toast(error.message, "bad");
  }
  paintImportPreview();
}

function paintImportPreview() {
  const box = $("pack-preview");
  const pick = $("pack-import-pick");
  const preview = state.packPreview;
  if (!box || !pick) return;
  if (!preview) {
    box.hidden = true;
    box.innerHTML = "";
    pick.hidden = true;
    return;
  }
  box.hidden = false;
  pick.hidden = false;
  const games = (preview.games || []).map((row) => esc(row.name)).join(", ") || "ninguno";
  const packs = (preview.modpacks || []).map((row) => esc(row.name)).join(", ") || "ninguno";
  box.innerHTML = `<p><b>${preview.mods}</b> mods</p><p><b>${(preview.games || []).length}</b> juegos: ${games}</p><p><b>${(preview.modpacks || []).length}</b> modpacks: ${packs}</p>`;
  fillImportChoices();
}

function fillImportChoices() {
  const preview = state.packPreview;
  const scope = $("pack-in-scope");
  const wrap = $("pack-in-wrap");
  const select = $("pack-in-value");
  if (!preview || !scope || !select || !wrap) return;
  const kind = scope.value;
  const needs = kind === "game" || kind === "modpack";
  wrap.hidden = !needs;
  if (!needs) return;
  const rows = kind === "game" ? (preview.games || []) : (preview.modpacks || []);
  const current = select.value;
  select.innerHTML = rows.length
    ? rows.map((row) => `<option value="${esc(row.id)}">${esc(row.name)}${row.game ? ` · ${row.game}` : ""} (${row.count})</option>`).join("")
    : `<option value="">(vacío)</option>`;
  if (current && [...select.options].some((opt) => opt.value === current)) select.value = current;
}

function syncPackDialog() {
  const scope = $("pack-scope").value;
  const wrap = $("pack-value-wrap");
  const select = $("pack-value");
  const selectedOpt = $("pack-scope").querySelector('option[value="selected"]');
  if (selectedOpt) selectedOpt.hidden = false;
  const needsValue = scope === "platform" || scope === "game" || scope === "modpack";
  wrap.hidden = !needsValue;
  const preview = state.packPreview;
  if (needsValue) {
    let options = [];
    if (scope === "platform") {
      options = counts((mod) => mod.platform || "Nexus", state.mods).map((row) => [row.id, `${row.label} (${row.count})`]);
    } else if (scope === "game") {
      if (preview?.games?.length) {
        options = preview.games.map((row) => [row.id, `${row.name} (${row.count})`]);
      } else {
        options = gameOptions().filter(([id]) => id).map(([id, label]) => {
          const n = state.mods.filter((mod) => String(mod.gameDomain || "") === id).length;
          return [id, `${label} (${n})`];
        });
      }
    } else if (preview?.modpacks?.length) {
      options = preview.modpacks.map((row) => [row.id, `${row.name}${row.game ? ` · ${row.game}` : ""} (${row.count})`]);
    } else {
      options = state.modpacks.map((pack) => {
        const n = state.mods.filter((mod) => mod.modpackId === pack.id).length;
        return [pack.id, `${pack.name} · ${pack.gameName || pack.gameDomain} (${n})`];
      });
    }
    const current = select.value;
    select.innerHTML = options.length
      ? options.map(([id, label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join("")
      : `<option value="">(vacío)</option>`;
    if (current && [...select.options].some((opt) => opt.value === current)) select.value = current;
  }
  const filt = packFilter();
  const n = countForPack(filt);
  if (preview && scope === "all") {
    $("pack-count").textContent = `El zip trae ${preview.mods} mods, ${preview.games.length} juegos y ${preview.modpacks.length} modpacks.`;
    return;
  }
  if (scope === "all") {
    $("pack-count").textContent = `Todo: ${state.mods.length} mods, ${(state.catalog.games || []).length} juegos, ${state.modpacks.length} modpacks.`;
    return;
  }
  $("pack-count").textContent = preview
    ? `Ese filtro en el zip. En tu biblioteca hay ${n} mod(s) parecidos.`
    : `${n} mod(s) con ese filtro.`;
}

function exportSuggestedName(filt) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, (ch) => (ch === "T" ? "-" : ""));
  const scope = filt?.scope || "all";
  let label = "wi-mod";
  if (scope === "platform" && filt.platform) label = `wi-mod-${filt.platform}`;
  else if (scope === "game" && filt.game) label = `wi-mod-${filt.game}`;
  else if (scope === "modpack" && filt.modpack) label = `wi-mod-pack`;
  else if (scope === "selected") label = "wi-mod-seleccion";
  return `${String(label).replace(/[^\w.-]+/g, "-").replace(/-+/g, "-")}-${stamp}.zip`;
}

/** null = canceló; string = ruta; undefined = sin diálogo nativo (web). */
async function pickSavePath(filename) {
  const host = window.pywebview && window.pywebview.api;
  if (host && typeof host.pick_save === "function") {
    try {
      const picked = await host.pick_save(filename || "wi-mod.zip");
      return picked ? String(picked) : null;
    } catch (_) {
      return null;
    }
  }
  if (typeof window.showSaveFilePicker === "function") {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename || "wi-mod.zip",
        types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }],
      });
      return handle; // FileSystemFileHandle → saveBlobAs
    } catch (error) {
      if (error && error.name === "AbortError") return null;
    }
  }
  return undefined;
}

async function saveBlobAs(blob, filename, handle) {
  if (handle && typeof handle.createWritable === "function") {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "wi-mod.zip";
  link.click();
  URL.revokeObjectURL(url);
}

async function runPackAction(event, mode, opts = {}) {
  event.preventDefault();
  const filt = packFilter();
  const choosePath = Boolean(opts.choosePath);
  const button = mode === "import"
    ? $("pack-import")
    : (choosePath ? $("pack-export-elsewhere") : $("pack-export"));
  if (mode === "export") {
    if (filt.scope === "selected" && !filt.ids.length) {
      toast("Marca mods o cambia el alcance.", "warn");
      return;
    }
    if (filt.scope !== "all" && filt.scope !== "game" && filt.scope !== "modpack" && !countForPack(filt)) {
      toast("No hay mods con ese filtro.", "warn");
      return;
    }
    if ((filt.scope === "game" || filt.scope === "modpack" || filt.scope === "platform") && !($("pack-value").value || "")) {
      toast("Elige uno.", "warn");
      return;
    }
    const suggested = exportSuggestedName(filt);
    let destPath = "";
    let fileHandle = null;
    if (choosePath) {
      const picked = await pickSavePath(suggested);
      if (picked === null) return;
      destPath = typeof picked === "string" ? picked : "";
      fileHandle = picked && typeof picked === "object" ? picked : null;
    } else if (state.packsDir) {
      // Ruta por defecto: Documents\wi-mod\packs (se crea sola)
      try {
        const host = window.pywebview && window.pywebview.api;
        if (host && typeof host.packs_dir === "function") {
          const dir = await host.packs_dir();
          if (dir) state.packsDir = String(dir);
        }
      } catch (_) { /* ignore */ }
      destPath = joinPackPath(state.packsDir, suggested);
    }
    setLoading(button, true, "Exportando");
    sfx.sniff();
    try {
      const payload = destPath ? { ...filt, dest: destPath } : { ...filt };
      const res = await api("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res && typeof res === "object" && !(res instanceof Response) && res.ok) {
        $("pack-dialog").close();
        toast(res.path ? `Guardado en ${res.path}` : "Paquete exportado.");
      } else if (res instanceof Response) {
        const blob = await res.blob();
        await saveBlobAs(blob, suggested, fileHandle);
        $("pack-dialog").close();
        toast("Paquete exportado.");
      } else {
        $("pack-dialog").close();
        toast("Paquete exportado.");
      }
    } catch (error) {
      toast(error.message, "bad");
    } finally {
      setLoading(button, false);
    }
    return;
  }
  const zipPath = state.importZipPath;
  const file = $("pack-file").files[0];
  if (!zipPath && !file) {
    toast("Elige el .zip a importar.", "warn");
    return;
  }
  if ((filt.scope === "game" || filt.scope === "modpack") && !($("pack-in-value").value || "")) {
    toast("Elige uno.", "warn");
    return;
  }
  setLoading(button, true, "Importando");
  sfx.sniff();
  try {
    let data;
    if (zipPath) {
      data = await api("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...filt, path: zipPath }),
      });
    } else {
      const form = new FormData();
      form.append("file", file);
      form.append("scope", filt.scope);
      if (filt.platform) form.append("platform", filt.platform);
      if (filt.game) form.append("game", filt.game);
      if (filt.modpack) form.append("modpack", filt.modpack);
      data = await api("/api/import", { method: "POST", body: form });
    }
    const skip = data.result.skipped ? ` · ${data.result.skipped} omitidos` : "";
    $("pack-dialog").close();
    toast(`Importado: ${data.result.added} nuevos, ${data.result.updated} actualizados${skip}.`);
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

const SKIP_LOGIN = true;

function showLogin() {
  if (SKIP_LOGIN) {
    hideLogin();
    return;
  }
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
    hint.textContent = "Escribe la clave.";
    button.textContent = "Entrar";
    button.disabled = loginLength ? pass.length !== loginLength : pass.length < 1;
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
$("logout").onclick = () => {
  $("more-pop").hidden = true;
  $("more-open").setAttribute("aria-expanded", "false");
  closeAppMenu();
  askQuit(false);
};

function savedQuit() {
  const mode = localStorage.getItem("wi-mod-quit");
  return mode === "quit" || mode === "tray" ? mode : "";
}

function askQuit(fromClose) {
  const dialog = $("quit-dialog");
  if (!dialog || dialog.open) return;
  const saved = savedQuit();
  if (fromClose && saved) {
    leaveApp(saved, true);
    return;
  }
  const box = $("quit-remember");
  if (box) box.checked = Boolean(saved);
  dialog.showModal();
}

async function leaveApp(mode, remember) {
  const dialog = $("quit-dialog");
  const box = $("quit-remember");
  const keep = remember === undefined ? Boolean(box && box.checked) : remember;
  if (keep) localStorage.setItem("wi-mod-quit", mode);
  else localStorage.removeItem("wi-mod-quit");
  if (dialog && dialog.open) dialog.close();
  try {
    await api("/api/quit-pref", { method: "POST", body: JSON.stringify({ mode: keep ? mode : "" }) });
  } catch (_) { /* la preferencia local basta en el navegador */ }
  const host = window.pywebview && window.pywebview.api;
  if (mode === "tray") {
    if (host && typeof host.tray === "function") {
      host.tray();
      return;
    }
    toast("La bandeja solo está en la app de escritorio.");
    return;
  }
  if (host && typeof host.quit === "function") {
    host.quit();
    return;
  }
  window.wiModClosing = true;
  if (window.__TAURI_INTERNALS__) {
    import("@tauri-apps/api/window")
      .then(({ getCurrentWindow }) => getCurrentWindow().close())
      .catch(() => window.close());
    return;
  }
  window.close();
}

window.wiModAskQuit = () => askQuit(true);

if ($("quit-cancel")) $("quit-cancel").onclick = () => $("quit-dialog").close();
if ($("quit-form")) $("quit-form").onsubmit = (event) => {
  event.preventDefault();
  $("quit-dialog").close();
};
if ($("quit-close")) $("quit-close").onclick = () => leaveApp("quit");
if ($("quit-tray")) $("quit-tray").onclick = () => leaveApp("tray");
document.addEventListener("keydown", (event) => {
  if (event.key === "F4" && event.altKey) {
    event.preventDefault();
    askQuit(true);
  }
});

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

const bootAt = performance.now();

function hideBoot() {
  const boot = $("boot");
  if (!boot || boot.classList.contains("hide") || boot.dataset.leaving) return;
  boot.dataset.leaving = "1";
  const wait = Math.max(0, 3000 - (performance.now() - bootAt));
  setTimeout(() => {
    boot.classList.add("hide");
    setTimeout(() => boot.remove(), 400);
    window.dispatchEvent(new Event("wimod-ready"));
  }, wait);
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
  const line = $("boot-line");
  if (line) line.textContent = "La guarida no responde. Cierra wi-mod y ábrelo otra vez.";
  pushLog("error", "La guarida no responde.");
}, 12000);
api("/api/session")
  .then((session) => {
    clearTimeout(sessionTimer);
    rememberMachineNames(session);
    paintAppVersion(session.appVersion);
    if (session.quitMode === "quit" || session.quitMode === "tray") {
      localStorage.setItem("wi-mod-quit", session.quitMode);
    }
    return enterApp();
  })
  .catch((error) => {
    clearTimeout(sessionTimer);
    setDockName("WYDEX");
    enterApp().catch(() => {
      hideBoot();
      pushLog("error", error.message || "No se pudo abrir la guarida.");
    });
  });

const appLogs = [];
let logTab = "error";

function logArg(value) {
  if (value instanceof Error) return value.message || String(value);
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function paintLogBadge() {
  const counts = { error: 0, warn: 0, req: 0 };
  appLogs.forEach((row) => { if (counts[row.level] != null) counts[row.level] += 1; });
  Object.entries(counts).forEach(([level, count]) => {
    const badge = $(`log-n-${level}`);
    const tab = $(`tab-n-${level}`);
    if (badge) badge.textContent = String(count);
    if (tab) tab.textContent = String(count);
    const chip = document.querySelector(`.log-count.${level}`);
    if (chip) chip.classList.toggle("hot", count > 0);
  });
}

function paintLogList() {
  const list = $("log-list");
  if (!list) return;
  const rows = appLogs.filter((row) => row.level === logTab);
  if (!rows.length) {
    const empty = { error: t("noErrors"), warn: t("noAlerts"), req: t("noReqs") };
    list.innerHTML = `<li>${empty[logTab] || "Vacío."}</li>`;
    return;
  }
  list.innerHTML = rows.slice().reverse().map((row) => (
    `<li data-level="${row.level}"><time>${esc(row.stamp)}</time>${esc(row.text)}</li>`
  )).join("");
}

function pushLog(level, text) {
  const line = String(text || "").replace(/\s+/g, " ").trim();
  if (!line) return;
  const kind = level === "warn" || level === "req" ? level : "error";
  const stamp = new Date().toLocaleTimeString("es", { hour12: false });
  appLogs.push({ level: kind, text: line, stamp });
  if (appLogs.length > 120) appLogs.shift();
  paintLogBadge();
  const panel = $("log-panel");
  if (panel && !panel.hidden) paintLogList();
}

function installLog() {
  const open = $("log-open");
  const panel = $("log-panel");
  if (!open || !panel) return;
  open.onclick = () => {
    const next = panel.hidden;
    panel.hidden = !next;
    open.setAttribute("aria-expanded", next ? "true" : "false");
    if (next) paintLogList();
  };
  document.querySelectorAll("[data-log-tab]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      logTab = button.dataset.logTab || "error";
      document.querySelectorAll("[data-log-tab]").forEach((tab) => {
        tab.classList.toggle("on", tab === button);
      });
      paintLogList();
    };
  });
  const clear = $("log-clear");
  if (clear) {
    clear.onclick = (event) => {
      event.stopPropagation();
      for (let i = appLogs.length - 1; i >= 0; i -= 1) {
        if (appLogs[i].level === logTab) appLogs.splice(i, 1);
      }
      paintLogBadge();
      paintLogList();
    };
  }
  ["error", "warn"].forEach((level) => {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      orig(...args);
      pushLog(level === "warn" ? "warn" : "error", args.map(logArg).join(" "));
    };
  });
  window.addEventListener("error", (event) => {
    pushLog("error", event.message || "Error de script");
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    pushLog("error", reason instanceof Error ? reason.message : logArg(reason));
  });
  paintLogBadge();
}

installLog();

function upgradeSelect(select) {
  if (!select || select.dataset.combo) return;
  const parent = select.parentNode;
  if (!parent) return;
  select.dataset.combo = "1";
  const combo = document.createElement("span");
  combo.className = "combo";
  parent.insertBefore(combo, select);
  combo.appendChild(select);
  select.classList.add("combo-native");
  const face = document.createElement("button");
  face.type = "button";
  face.className = "combo-face";
  const pop = document.createElement("div");
  pop.className = "combo-pop";
  pop.hidden = true;
  const search = document.createElement("input");
  search.type = "search";
  search.className = "combo-search";
  search.placeholder = "Buscar";
  search.setAttribute("aria-label", "Buscar");
  const list = document.createElement("div");
  list.className = "combo-list";
  pop.append(search, list);
  combo.append(face, pop);
  const paint = () => {
    const option = [...select.options].find((item) => item.value === select.value) || select.selectedOptions[0];
    face.textContent = option ? option.textContent : "";
    face.disabled = select.disabled;
    combo.classList.toggle("off", select.disabled);
  };
  const close = () => {
    if (pop.matches(":popover-open")) pop.hidePopover();
    pop.hidden = true;
    combo.classList.remove("open");
  };
  const renderList = () => {
    const query = search.value.trim().toLowerCase();
    const options = [...select.options].filter((item) => !query || item.textContent.toLowerCase().includes(query));
    if (!options.length) {
      list.innerHTML = `<p class="combo-empty">Sin resultados</p>`;
      return;
    }
    list.innerHTML = options.map((item) => (
      `<button type="button" class="combo-opt${item.value === select.value ? " on" : ""}" data-value="${esc(item.value)}">${esc(item.textContent)}</button>`
    )).join("");
    list.querySelectorAll(".combo-opt").forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        select.value = button.dataset.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        paint();
        close();
      };
    });
  };
  const place = () => {
    const dialog = face.closest("dialog");
    const rect = face.getBoundingClientRect();
    const width = Math.max(rect.width, 220);
    const gap = 6;
    if (dialog) {
      if (pop.parentNode !== dialog) dialog.appendChild(pop);
      const host = dialog.getBoundingClientRect();
      let left = rect.left - host.left;
      if (host.left + left + width > window.innerWidth - 8) left = window.innerWidth - 8 - host.left - width;
      pop.style.position = "absolute";
      pop.style.zIndex = "5";
      pop.style.width = `${width}px`;
      pop.style.left = `${Math.max(8, left)}px`;
      if (window.innerHeight - rect.bottom < 200 && rect.top - host.top > 160) {
        pop.style.top = "auto";
        pop.style.bottom = `${host.bottom - rect.top + gap}px`;
      } else {
        pop.style.bottom = "auto";
        pop.style.top = `${rect.bottom - host.top + gap}px`;
      }
      return;
    }
    if (pop.parentNode !== document.body) document.body.appendChild(pop);
    pop.style.position = "fixed";
    let left = rect.left;
    if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width;
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(8, left)}px`;
    if (window.innerHeight - rect.bottom < 240 && rect.top > 160) {
      pop.style.top = "auto";
      pop.style.bottom = `${window.innerHeight - rect.top + gap}px`;
    } else {
      pop.style.bottom = "auto";
      pop.style.top = `${rect.bottom + gap}px`;
    }
  };
  const open = () => {
    if (select.disabled) return;
    document.querySelectorAll(".combo-pop").forEach((panel) => {
      if (panel === pop) return;
      if (panel.matches(":popover-open")) panel.hidePopover();
      panel.hidden = true;
    });
    document.querySelectorAll(".combo.open").forEach((node) => node.classList.remove("open"));
    search.value = "";
    renderList();
    place();
    pop.hidden = false;
    combo.classList.add("open");
    search.focus();
  };
  face.onclick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (pop.hidden) open();
    else close();
  };
  search.oninput = renderList;
  search.onclick = (event) => event.stopPropagation();
  search.onkeydown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const first = list.querySelector(".combo-opt");
      if (first) first.click();
    }
  };
  select.addEventListener("change", paint);
  new MutationObserver(paint).observe(select, { childList: true, attributes: true, attributeFilter: ["disabled"] });
  paint();
}

function installCombos() {
  document.querySelectorAll("select").forEach(upgradeSelect);
  document.addEventListener("click", (event) => {
    if (event.target.closest(".combo, .combo-pop")) return;
    document.querySelectorAll(".combo-pop").forEach((panel) => {
      if (panel.matches(":popover-open")) panel.hidePopover();
      panel.hidden = true;
    });
    document.querySelectorAll(".combo.open").forEach((node) => node.classList.remove("open"));
  });
}
installCombos();

const MARK_EMOJIS = [
  ["espada combate", "⚔️"], ["escudo", "🛡️"], ["arco", "🏹"], ["hacha", "🪓"], ["daga", "🗡️"],
  ["magia", "🪄"], ["fuego", "🔥"], ["hielo", "❄️"], ["rayo", "⚡"], ["veneno", "☠️"],
  ["pocion", "🧪"], ["corazon vida", "❤️"], ["calavera", "💀"], ["dragon", "🐉"], ["lobo", "🐺"],
  ["armadura", "🪖"], ["casco", "⛑️"], ["bota", "👢"], ["anillo", "💍"], ["gema", "💎"],
  ["oro", "🪙"], ["moneda", "💰"], ["cofre", "🧰"], ["llave", "🗝️"], ["mapa", "🗺️"],
  ["brujula", "🧭"], ["libro", "📖"], ["pergamino", "📜"], ["nota", "📝"], ["engranaje", "⚙️"],
  ["herramienta", "🔧"], ["martillo", "🔨"], ["casa", "🏠"], ["castillo", "🏰"], ["tienda", "⛺"],
  ["arbol", "🌲"], ["montaña", "⛰️"], ["agua", "💧"], ["sol", "☀️"], ["luna", "🌙"],
  ["estrella", "⭐"], ["corona", "👑"], ["bandera", "🚩"], ["objetivo", "🎯"], ["dado", "🎲"],
  ["control", "🎮"], ["pc", "💻"], ["nexus", "🌀"], ["caja mod", "📦"], ["carpeta", "📁"],
  ["musica", "🎵"], ["ojo", "👁️"], ["huella", "🐾"], ["caballo", "🐴"], ["ciudad", "🏙️"],
  ["pueblo", "🏘️"], ["comida", "🍖"], ["pan", "🍞"], ["espada laser", "🔫"], ["bomba", "💣"],
  ["reloj", "⏱️"], ["check", "✅"], ["alerta", "⚠️"], ["nuevo", "✨"], ["pin", "📌"],
  ["etiqueta", "🏷️"], ["usuario", "👤"], ["grupo", "👥"], ["mundo", "🌍"], ["nieve", "🌨️"],
];

let markTarget = null;

function paintMarkGrid() {
  const query = ($("mark-search").value || "").trim().toLowerCase();
  $("mark-grid").innerHTML = MARK_EMOJIS.map(([name, emoji], index) => (
    !query || name.includes(query) || emoji.includes(query)
      ? `<button type="button" data-i="${index}">${emoji}</button>`
      : ""
  )).join("");
}

function placeMarkPop(x, y) {
  const pop = $("mark-pop");
  pop.hidden = false;
  const dock = document.querySelector(".dock");
  const bottomGap = (dock ? dock.getBoundingClientRect().height : 0) + 12;
  const margin = 8;
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  const maxLeft = Math.max(margin, window.innerWidth - width - margin);
  const maxTop = Math.max(margin, window.innerHeight - height - bottomGap);
  pop.style.left = `${Math.min(Math.max(margin, x), maxLeft)}px`;
  pop.style.top = `${Math.min(Math.max(margin, y), maxTop)}px`;
}

function openMarkPop(kind, id, x, y) {
  markTarget = { kind: String(kind || "").toLowerCase(), id };
  const mark = markOf(markTarget.kind, id) || {};
  $("mark-search").value = "";
  $("mark-url").value = mark.imageUrl || "";
  $("mark-file").value = "";
  paintMarkGrid();
  placeMarkPop(x, y);
}

async function saveMark(emoji, imageUrl) {
  if (!markTarget) return;
  const data = await api("/api/catalog/mark", {
    method: "POST",
    body: JSON.stringify({
      kind: markTarget.kind,
      id: markTarget.id,
      emoji: emoji || "",
      imageUrl: imageUrl || "",
    }),
  });
  state.catalog = data.catalog || state.catalog;
  $("mark-pop").hidden = true;
  render();
}

function installMarks() {
  const pop = $("mark-pop");
  if (!pop) return;
  $("mark-search").addEventListener("input", paintMarkGrid);
  $("mark-grid").addEventListener("click", (event) => {
    const button = event.target.closest("[data-i]");
    if (!button) return;
    const emoji = MARK_EMOJIS[Number(button.dataset.i)]?.[1] || "";
    if (!emoji) return;
    saveMark(emoji, "").catch((error) => toast(error.message, "bad"));
  });
  $("mark-file").addEventListener("change", async () => {
    const file = $("mark-file").files?.[0];
    if (!file || !markTarget) return;
    try {
      const upload = new FormData();
      upload.append("file", file);
      const uploaded = await api("/api/images", { method: "POST", body: upload });
      await saveMark("", uploaded.imageUrl || "");
    } catch (error) {
      toast(error.message, "bad");
    }
  });
  $("mark-url-go").addEventListener("click", () => {
    const imageUrl = ($("mark-url").value || "").trim();
    if (!imageUrl) {
      toast("Pega una URL.", "warn");
      return;
    }
    saveMark("", imageUrl).catch((error) => toast(error.message, "bad"));
  });
  $("mark-clear").addEventListener("click", () => {
    saveMark("", "").catch((error) => toast(error.message, "bad"));
  });
  document.addEventListener("click", (event) => {
    if (pop.hidden || event.target.closest("#mark-pop")) return;
    pop.hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || pop.hidden) return;
    pop.hidden = true;
  });
}
installMarks();

const navStack = [];
let navAt = -1;
let navLock = false;

function loaderSrc(type) {
  const file = {
    forge: "loader-forge.png",
    fabric: "loader-fabric.png",
    quilt: "loader-quilt.png",
    neoforge: "loader-neoforge.ico",
    vanilla: "loader-vanilla.ico",
  }[String(type || "").toLowerCase()];
  if (!file) return "";
  const icon = document.querySelector("link[rel='icon']")?.getAttribute("href") || "/brand/wi-mod.svg";
  return icon.replace(/[^/]+$/, "") + file;
}

function instanceTitle(pack) {
  if (!pack) return t("sysNone");
  const loader = String(pack.loaderType || "");
  const mc = String(pack.mcVersion || "");
  const pretty = { forge: "Forge", fabric: "Fabric", quilt: "Quilt", neoforge: "NeoForge", vanilla: "Vanilla" };
  if (loader && mc) return `${pretty[loader.toLowerCase()] || loader} ${mc}`;
  return pack.name || t("sysNone");
}

function paintSysNav() {
  const back = $("sys-back");
  const fwd = $("sys-fwd");
  if (back) back.disabled = navAt <= 0;
  if (fwd) fwd.disabled = navAt < 0 || navAt >= navStack.length - 1;
}

function navRemember() {
  if (navLock) return;
  const snap = { game: state.game || "", modpack: state.modpack || "" };
  const cur = navStack[navAt];
  if (cur && cur.game === snap.game && cur.modpack === snap.modpack) return;
  navStack.splice(navAt + 1);
  navStack.push(snap);
  if (navStack.length > 40) navStack.shift();
  navAt = navStack.length - 1;
  paintSysNav();
}

function navGo(dir) {
  const next = navAt + dir;
  if (next < 0 || next >= navStack.length) return;
  const snap = navStack[next];
  navLock = true;
  navAt = next;
  state.game = snap.game;
  state.modpack = snap.modpack;
  state.packCat = "";
  if (state.game) localStorage.setItem("wi-mod-game", state.game);
  render();
  navLock = false;
  paintSysNav();
}

function closeSysMenu() {
  const menu = $("sys-instance-menu");
  const btn = $("sys-instance");
  if (menu) menu.hidden = true;
  if (btn) btn.setAttribute("aria-expanded", "false");
}

function paintSysbar() {
  const name = $("sys-instance-name");
  const ico = $("sys-instance-ico");
  const pack = packById(state.modpack);
  if (name) name.textContent = instanceTitle(pack);
  if (ico) {
    const mark = pack ? markOf("modpack", pack.id) : null;
    const src = mark?.imageUrl || loaderSrc(pack?.loaderType);
    ico.hidden = !src;
    if (src) ico.src = src;
  }
  navRemember();
}

const TASK_KEY = "wi-mod-tasks";
const doneTasks = (() => {
  try {
    const raw = JSON.parse(sessionStorage.getItem(TASK_KEY) || "[]");
    return Array.isArray(raw) ? raw : [];
  } catch (_) {
    return [];
  }
})();

function taskAgo(at) {
  const min = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

function paintDoneTasks(freshId) {
  const list = $("tasks-done");
  if (!list) return;
  list.hidden = !doneTasks.length;
  list.innerHTML = doneTasks.map((task) => `
    <li class="${task.id === freshId ? "tasks-in" : ""}">
      <span class="tasks-mark" aria-hidden="true">↓</span>
      <span><b>${esc(task.label)}</b><small>${esc(taskAgo(task.at))}</small></span>
      <button type="button" class="tasks-x" data-task="${task.id}" aria-label="Quitar">✕</button>
    </li>
  `).join("");
  list.querySelectorAll("[data-task]").forEach((button) => {
    button.onclick = (event) => {
      event.stopPropagation();
      const id = Number(button.dataset.task);
      const index = doneTasks.findIndex((task) => task.id === id);
      if (index >= 0) doneTasks.splice(index, 1);
      try { sessionStorage.setItem(TASK_KEY, JSON.stringify(doneTasks)); } catch (_) { /* ignore */ }
      paintDoneTasks();
    };
  });
}

function pushDoneTask(label) {
  const text = String(label || "").trim();
  if (!text) return;
  const id = Date.now() + Math.floor(Math.random() * 1000);
  doneTasks.unshift({ id, label: text, at: Date.now() });
  if (doneTasks.length > 30) doneTasks.pop();
  try { sessionStorage.setItem(TASK_KEY, JSON.stringify(doneTasks)); } catch (_) { /* ignore */ }
  paintDoneTasks(id);
}

function paintSysActivity() {
  const badge = $("sys-dl-badge");
  const dl = $("sys-downloads");
  const n = liveTasks.length;
  if (dl) dl.classList.toggle("on", n > 0);
  if (badge) {
    badge.hidden = n < 1;
    badge.textContent = String(n);
  }
}

function bindTasks() {
  const button = $("sys-downloads");
  const pop = $("tasks-pop");
  if (!button || !pop || button.dataset.bound) return;
  button.dataset.bound = "1";
  paintDoneTasks();
  button.onclick = (event) => {
    event.stopPropagation();
    const open = pop.hidden;
    pop.hidden = !open;
    button.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".tasks-wrap")) {
      pop.hidden = true;
      button.setAttribute("aria-expanded", "false");
    }
  });
  const clear = $("tasks-clear");
  if (clear) clear.onclick = (event) => {
    event.stopPropagation();
    doneTasks.splice(0, doneTasks.length);
    try { sessionStorage.removeItem(TASK_KEY); } catch (_) { /* ignore */ }
    paintDoneTasks();
  };
  const fold = $("tasks-fold");
  if (fold) fold.onclick = (event) => {
    event.stopPropagation();
    const list = $("tasks-done");
    if (!list) return;
    const shut = fold.getAttribute("aria-expanded") !== "false";
    fold.setAttribute("aria-expanded", shut ? "false" : "true");
    list.style.display = shut ? "none" : "";
  };
}

function instanceIcon(pack) {
  const marked = markIcon("modpack", pack.id);
  if (marked) return marked.replace("side-emoji", "side-emoji sys-pack-ico").replace("side-ico", "side-ico sys-pack-ico");
  const src = loaderSrc(pack.loaderType);
  if (src) return `<img class="sys-pack-ico" alt="" src="${esc(src)}">`;
  return `<span class="sys-pack-ico">📦</span>`;
}

function fillSysMenu() {
  const menu = $("sys-instance-menu");
  if (!menu) return;
  let search = menu.querySelector(".sys-menu-search");
  if (!search) {
    menu.innerHTML = `<input class="sys-menu-search" type="search" placeholder="${esc(t("searchInstance"))}" autocomplete="off" spellcheck="false"><div class="sys-menu-list"></div><button type="button" class="sys-menu-add" id="sys-instance-add"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg><span>${esc(t("addInstance"))}</span></button>`;
    search = menu.querySelector(".sys-menu-search");
    search.addEventListener("input", () => fillSysMenu());
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeSysMenu();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        menu.querySelector(".sys-menu-list [data-pack]")?.click();
      }
    });
    menu.querySelector("#sys-instance-add").onclick = async (event) => {
      event.stopPropagation();
      closeSysMenu();
      const pack = await createModpackInline(state.game, gameLabel(state.game));
      if (!pack?.id) return;
      state.modpack = pack.id;
      state.packCat = "";
      render();
    };
  }
  const query = search.value.trim().toLowerCase();
  const packs = (typeof packsForGame === "function" ? packsForGame() : []).filter((pack) => {
    if (!query) return true;
    const title = instanceTitle(pack).toLowerCase();
    const name = String(pack.name || "").toLowerCase();
    return title.includes(query) || name.includes(query);
  });
  const list = menu.querySelector(".sys-menu-list");
  list.innerHTML = packs.length
    ? packs.map((pack) => {
      const on = pack.id === state.modpack ? " on" : "";
      return `<button type="button" class="${on}" data-pack="${esc(pack.id)}">${instanceIcon(pack)}<span>${esc(pack.name || instanceTitle(pack))}<small style="opacity:.6;margin-left:8px">${esc(instanceTitle(pack))}</small></span></button>`;
    }).join("")
    : `<button type="button" disabled>${esc(t("sysNone"))}</button>`;
  list.querySelectorAll("[data-pack]").forEach((button) => {
    button.onclick = () => {
      state.modpack = button.dataset.pack || "";
      state.packCat = "";
      sfx.click();
      closeSysMenu();
      render();
    };
  });
}

function bindSysbar() {
  const back = $("sys-back");
  const fwd = $("sys-fwd");
  const chip = $("sys-instance");
  if (back) back.onclick = () => navGo(-1);
  if (fwd) fwd.onclick = () => navGo(1);
  if (chip) chip.onclick = (event) => {
    event.stopPropagation();
    const menu = $("sys-instance-menu");
    if (!menu) return;
    const open = menu.hidden;
    if (open) {
      fillSysMenu();
      menu.querySelector(".sys-menu-search")?.focus();
    }
    menu.hidden = !open;
    chip.setAttribute("aria-expanded", open ? "true" : "false");
  };
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".sys-instance-wrap")) closeSysMenu();
  });
  const hostOf = () => (window.pywebview && window.pywebview.api) || null;
  const showWins = () => {
    const wins = $("sys-wins");
    const host = hostOf();
    if (wins) wins.hidden = !(host && typeof host.win_min === "function");
  };
  showWins();
  window.addEventListener("pywebviewready", showWins);
  const min = $("sys-min");
  const max = $("sys-max");
  const close = $("sys-close");
  const flipMax = () => max && max.classList.toggle("is-max");
  if (min) min.onclick = () => hostOf()?.win_min?.();
  if (max) max.onclick = () => { hostOf()?.win_max?.(); flipMax(); };
  if (close) close.onclick = () => hostOf()?.win_close?.();
  document.querySelectorAll(".pywebview-drag-region").forEach((node) => {
    node.addEventListener("dblclick", () => { hostOf()?.win_max?.(); flipMax(); });
  });
}

function bindSideFolds() {
  const key = "wi-mod-side-folds";
  let shut = [];
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "[]");
    shut = Array.isArray(raw) ? raw.map((id) => String(id)) : [];
  } catch (_) {
    shut = [];
  }
  const persist = () => localStorage.setItem(key, JSON.stringify(shut));
  const applyBlock = (block, closed) => {
    const btn = block.querySelector(".side-fold");
    block.classList.toggle("is-shut", closed);
    if (btn) btn.setAttribute("aria-expanded", closed ? "false" : "true");
  };
  const paintFoldsToggle = () => {
    const toggle = $("side-folds-toggle");
    if (!toggle) return;
    const blocks = [...document.querySelectorAll(".side-block[data-fold]")];
    const allShut = blocks.length > 0 && blocks.every((block) => block.classList.contains("is-shut"));
    toggle.setAttribute("aria-pressed", allShut ? "true" : "false");
    toggle.title = allShut ? t("sideFoldsExpand") : t("sideFoldsCollapse");
    toggle.setAttribute("aria-label", toggle.title);
    const collapse = toggle.querySelector(".folds-collapse");
    const expand = toggle.querySelector(".folds-expand");
    if (collapse) collapse.hidden = allShut;
    if (expand) expand.hidden = !allShut;
  };
  document.querySelectorAll(".side-block").forEach((block) => {
    const id = block.dataset.fold;
    const btn = block.querySelector(".side-fold");
    if (!id || !btn) return;
    applyBlock(block, shut.includes(id));
    btn.addEventListener("click", () => {
      const closed = !block.classList.contains("is-shut");
      applyBlock(block, closed);
      shut = shut.filter((item) => item !== id);
      if (closed) shut.push(id);
      persist();
      paintFoldsToggle();
    });
  });
  const toggle = $("side-folds-toggle");
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = "1";
    toggle.addEventListener("click", () => {
      const blocks = [...document.querySelectorAll(".side-block[data-fold]")];
      const allShut = blocks.length > 0 && blocks.every((block) => block.classList.contains("is-shut"));
      const closeAll = !allShut;
      shut = [];
      blocks.forEach((block) => {
        const id = block.dataset.fold;
        applyBlock(block, closeAll);
        if (closeAll && id) shut.push(id);
      });
      persist();
      paintFoldsToggle();
      sfx.click();
    });
  }
  paintFoldsToggle();
}
bindSideFolds();
bindSysbar();
bindTasks();
bindSideSearch();

function bindSideSize() {
  const layout = document.querySelector(".layout");
  const handle = $("side-resize");
  const rail = $("side-rail");
  if (!layout || !handle || !rail) return;
  const normalWidth = () => {
    const saved = Number(localStorage.getItem("wi-mod-side-w"));
    return saved >= 180 && saved <= 480 ? saved : 230;
  };
  const rememberWidth = () => {
    if (layout.classList.contains("side-icons")) return;
    const side = layout.querySelector(".side");
    const width = Math.round(side ? side.getBoundingClientRect().width : 0);
    if (width >= 180 && width <= 480) localStorage.setItem("wi-mod-side-w", String(width));
  };
  const paintRail = (icons) => {
    layout.classList.toggle("side-icons", icons);
    rail.setAttribute("aria-pressed", icons ? "true" : "false");
    rail.title = icons ? t("showNames") : t("hideNames");
    rail.textContent = icons ? t("show") : t("hide");
    if (icons) layout.style.removeProperty("--side-w");
    else layout.style.setProperty("--side-w", `${normalWidth()}px`);
  };
  paintRail(localStorage.getItem("wi-mod-side-icons") === "1");
  rail.onclick = () => {
    const icons = !layout.classList.contains("side-icons");
    if (icons) rememberWidth();
    paintRail(icons);
    localStorage.setItem("wi-mod-side-icons", icons ? "1" : "0");
  };
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    rememberWidth();
    handle.classList.add("on");
    const move = (ev) => {
      const width = Math.min(480, ev.clientX - layout.getBoundingClientRect().left);
      if (width < 150) {
        if (!layout.classList.contains("side-icons")) {
          layout.classList.add("side-icons");
          rail.setAttribute("aria-pressed", "true");
          rail.title = t("showNames");
          rail.textContent = t("show");
          layout.style.removeProperty("--side-w");
          localStorage.setItem("wi-mod-side-icons", "1");
        }
        return;
      }
      if (layout.classList.contains("side-icons")) {
        layout.classList.remove("side-icons");
        rail.setAttribute("aria-pressed", "false");
        rail.title = t("hideNames");
        rail.textContent = t("hide");
        localStorage.setItem("wi-mod-side-icons", "0");
      }
      layout.style.setProperty("--side-w", `${width}px`);
    };
    const up = () => {
      handle.classList.remove("on");
      if (!layout.classList.contains("side-icons")) {
        const width = Math.round(parseFloat(getComputedStyle(layout).getPropertyValue("--side-w")));
        if (width >= 180) localStorage.setItem("wi-mod-side-w", String(width));
      }
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });
}
bindSideSize();

const TOUR_STEPS = [
  { sel: "#game-picker", title: "tour1t", text: "tour1d" },
  { sel: "#game-add", title: "tour2t", text: "tour2d" },
  { sel: "#search", title: "tour3t", text: "tour3d" },
  { sel: "[data-fold='platforms']", title: "tour4t", text: "tour4d" },
  { sel: "[data-fold='modpacks']", title: "tour5t", text: "tour5d" },
  { sel: "[data-fold='categories']", title: "tour6t", text: "tour6d" },
  { sel: "#side-rail", title: "tour7t", text: "tour7d" },
  { sel: "#game-hero", title: "tour8t", text: "tour8d" },
  { sel: ".view-dock", title: "tour9t", text: "tour9d" },
  { sel: "#grid", title: "tour10t", text: "tour10d" },
  { sel: "#more-open", title: "tour11t", text: "tour11d" },
  { sel: "#dock-keys", title: "tour12t", text: "tour12d" },
  { sel: "#more-theme", title: "tour13t", text: "tour13d" },
  { sel: "#mute", title: "tour14t", text: "tour14d" },
  { sel: "#lang-toggle", title: "tour15t", text: "tour15d" },
  { sel: "#log-open", title: "tour16t", text: "tour16d" },
];

let tourIndex = -1;

function tourTarget() {
  const step = TOUR_STEPS[tourIndex];
  return step ? document.querySelector(step.sel) : null;
}

let placingTour = false;
let tourMoveUntil = 0;

function placeTour() {
  if (placingTour) return;
  const tour = $("tour");
  const ring = $("tour-ring");
  const card = $("tour-card");
  const el = tourTarget();
  if (!tour || !ring || !card || !el) return;
  const animate = performance.now() < tourMoveUntil;
  placingTour = true;
  el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: animate ? "smooth" : "auto" });
  const rect = el.getBoundingClientRect();
  const pad = 8;
  ring.classList.toggle("tour-move", animate);
  card.classList.toggle("tour-move", animate);
  if (animate) void ring.offsetWidth;
  ring.style.left = `${Math.max(4, rect.left - pad)}px`;
  ring.style.top = `${Math.max(4, rect.top - pad)}px`;
  ring.style.width = `${rect.width + pad * 2}px`;
  ring.style.height = `${rect.height + pad * 2}px`;
  const cardW = Math.min(360, window.innerWidth - 24);
  let left = rect.left;
  if (left + cardW > window.innerWidth - 12) left = window.innerWidth - cardW - 12;
  left = Math.max(12, left);
  let top = rect.bottom + 14;
  if (top + 170 > window.innerHeight) top = Math.max(12, rect.top - 180);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  placingTour = false;
}

function showTourStep(animate) {
  const upcoming = TOUR_STEPS[tourIndex];
  if (upcoming?.sel === "#game-add") {
    const menu = $("game-menu");
    if (menu) {
      menu.hidden = false;
      $("game-picker")?.setAttribute("aria-expanded", "true");
      paintGameMenu();
    }
  } else closeGameMenu();
  while (tourIndex < TOUR_STEPS.length && !tourTarget()) tourIndex += 1;
  if (tourIndex >= TOUR_STEPS.length) {
    stopTour();
    return;
  }
  const step = TOUR_STEPS[tourIndex];
  const pop = $("more-pop");
  const target = tourTarget();
  if (pop && target && pop.contains(target)) {
    pop.hidden = false;
    const anchor = $("more-open");
    if (anchor) placePop(pop, anchor);
  }
  tourMoveUntil = animate ? performance.now() + 560 : 0;
  $("tour-kicker").textContent = `${tourIndex + 1} / ${TOUR_STEPS.length}`;
  $("tour-title").textContent = t(step.title);
  $("tour-text").textContent = t(step.text);
  $("tour-next").textContent = tourIndex === TOUR_STEPS.length - 1 ? t("done") : t("next");
  placeTour();
}

function stopTour() {
  tourIndex = -1;
  const tour = $("tour");
  if (tour) tour.hidden = true;
  window.removeEventListener("resize", placeTour);
  window.removeEventListener("scroll", placeTour, true);
}

function startTour() {
  const tour = $("tour");
  if (!tour) return;
  tour.hidden = false;
  tourIndex = 0;
  showTourStep();
  window.addEventListener("resize", placeTour);
  window.addEventListener("scroll", placeTour, true);
}

if ($("name-custom")) {
  $("name-custom").onclick = () => {
    if (!state.customName) state.customName = ($("dock-name").textContent || "").trim();
    state.nameSource = "custom";
    localStorage.setItem("wi-mod-name-source", "custom");
    localStorage.setItem("wi-mod-custom-name", state.customName);
    applyDockName();
    const pop = $("more-pop");
    if (!pop.hidden) placePop(pop, $("more-open"));
    const input = $("name-custom-input");
    if (input) {
      input.focus();
      input.select();
    }
    sfx.click();
  };
}
if ($("name-custom-input")) {
  $("name-custom-input").addEventListener("input", () => {
    state.customName = $("name-custom-input").value.trim();
    localStorage.setItem("wi-mod-custom-name", state.customName);
    const machine = state.windowsUser || state.pcName;
    setDockName(state.customName || machine || "WYDEX");
  });
  $("name-custom-input").addEventListener("keydown", (event) => event.stopPropagation());
}
if ($("tour-open")) {
  $("tour-open").onclick = () => {
    $("more-pop").hidden = true;
    $("more-open").setAttribute("aria-expanded", "false");
    sfx.click();
    startTour();
  };
}
if ($("tour-next")) {
  $("tour-next").onclick = () => {
    if (tourIndex < 0) return;
    sfx.click();
    tourIndex += 1;
    showTourStep(true);
  };
}
if ($("tour-exit")) $("tour-exit").onclick = () => { sfx.soft(); stopTour(); };
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && $("tour") && !$("tour").hidden) stopTour();
});
paintChrome();
syncDock();
applyCoverBg();
pollDock();
setInterval(pollDock, 2500);
window.addEventListener("online", pollDock);
window.addEventListener("offline", () => paintDockStats({ ...(lastStatus || {}), online: false }));
