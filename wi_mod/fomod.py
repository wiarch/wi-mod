"""ModuleConfig.xml → JSON para pintar los pasos en la interfaz."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from typing import Any


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _text(node: ET.Element | None) -> str:
    if node is None or node.text is None:
        return ""
    return " ".join(node.text.split())


def _child(node: ET.Element, name: str) -> ET.Element | None:
    for item in list(node):
        if _local(item.tag) == name:
            return item
    return None


def _children(node: ET.Element, name: str) -> list[ET.Element]:
    return [item for item in list(node) if _local(item.tag) == name]


def _files(node: ET.Element | None) -> list[dict[str, str]]:
    if node is None:
        return []
    rows: list[dict[str, str]] = []
    for item in list(node):
        kind = _local(item.tag)
        if kind not in {"file", "folder"}:
            continue
        rows.append({
            "type": kind,
            "source": str(item.attrib.get("source") or "").replace("\\", "/"),
            "destination": str(item.attrib.get("destination") or "").replace("\\", "/"),
            "priority": str(item.attrib.get("priority") or "0"),
        })
    return rows


def _flags(node: ET.Element | None) -> list[dict[str, str]]:
    if node is None:
        return []
    rows = []
    for item in list(node):
        if _local(item.tag) != "flag":
            continue
        rows.append({"name": str(item.attrib.get("name") or _text(item)), "value": _text(item)})
    return rows


def _plugin_type(node: ET.Element) -> str:
    desc = _child(node, "typeDescriptor")
    if desc is None:
        return "Optional"
    typed = _child(desc, "type")
    if typed is not None:
        return str(typed.attrib.get("name") or "Optional")
    return "Optional"


def parse_module(xml_bytes: bytes) -> dict[str, Any]:
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as exc:
        raise ValueError("El ModuleConfig.xml no es válido.") from exc
    steps = []
    install = _child(root, "installSteps")
    for step in _children(install, "installStep") if install is not None else []:
        groups = []
        optional = _child(step, "optionalFileGroups") or step
        for group in _children(optional, "group"):
            plugins_node = _child(group, "plugins") or group
            plugins = []
            for plugin in _children(plugins_node, "plugin"):
                image = _child(plugin, "image")
                plugins.append({
                    "name": str(plugin.attrib.get("name") or ""),
                    "description": _text(_child(plugin, "description")),
                    "image": str(image.attrib.get("path") or "") if image is not None else "",
                    "type": _plugin_type(plugin),
                    "flags": _flags(_child(plugin, "conditionFlags")),
                    "files": _files(_child(plugin, "files")),
                })
            groups.append({
                "name": str(group.attrib.get("name") or ""),
                "type": str(group.attrib.get("type") or "SelectAny"),
                "plugins": plugins,
            })
        steps.append({"name": str(step.attrib.get("name") or ""), "groups": groups})
    required = []
    req = _child(root, "requiredInstallFiles")
    required.extend(_files(req))
    return {
        "moduleName": _text(_child(root, "moduleName")) or str(root.attrib.get("name") or ""),
        "installSteps": steps,
        "requiredFiles": required,
    }
