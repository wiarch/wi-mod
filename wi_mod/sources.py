"""Cada juego acepta su tienda y Independiente. Sin tienda propia: Nexus."""

from __future__ import annotations

NEXUS = ("Nexus", "Independiente")
MINECRAFT = ("Modrinth", "CurseForge", "Independiente")

GAME_SOURCES: dict[str, tuple[str, ...]] = {
    "minecraft": MINECRAFT,
    "skyrimspecialedition": NEXUS,
    "skyrim": NEXUS,
    "skyrimvr": NEXUS,
    "enderal": NEXUS,
    "darksoulsremastered": NEXUS,
    "darksouls3": NEXUS,
    "darksouls2": NEXUS,
    "darksouls": NEXUS,
    "eldenring": NEXUS,
    "stardewvalley": NEXUS,
    "fallout4": NEXUS,
    "newvegas": NEXUS,
    "witcher3": NEXUS,
    "cyberpunk2077": NEXUS,
    "baldursgate3": NEXUS,
    "monsterhunterworld": NEXUS,
    "hollowknight": NEXUS,
    "worldofwarcraft": ("CurseForge", "Independiente"),
    "wow": ("CurseForge", "Independiente"),
}


def platforms_for(domain: str) -> tuple[str, ...]:
    key = str(domain or "").strip().lower()
    if key in GAME_SOURCES:
        return GAME_SOURCES[key]
    if key.startswith("minecraft"):
        return MINECRAFT
    if key in {"worldofwarcraft", "wow"} or key.startswith("worldofwarcraft"):
        return ("CurseForge", "Independiente")
    return NEXUS


def sources_payload() -> dict[str, list[str]]:
    return {key: list(names) for key, names in GAME_SOURCES.items()}
