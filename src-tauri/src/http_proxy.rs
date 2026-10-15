//! Proxy HTTP hacia APIs externas (Nexus, CurseForge, Steam, RAWG, Modrinth).
//! Evita CORS en Desktop y mantiene API keys fuera del WebView cuando se pueden.

use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

const APP_NAME: &str = "wi-mod";
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
const TIMEOUT_SECS: u64 = 40;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Provider {
    Nexus,
    CurseForge,
    Steam,
    Rawg,
    Modrinth,
}

impl Provider {
    fn parse(raw: &str) -> Result<Self, String> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "nexus" | "nexusmods" => Ok(Self::Nexus),
            "curseforge" | "cf" => Ok(Self::CurseForge),
            "steam" => Ok(Self::Steam),
            "rawg" => Ok(Self::Rawg),
            "modrinth" => Ok(Self::Modrinth),
            other => Err(format!("Proveedor no soportado: {other}")),
        }
    }

    fn base_url(self) -> &'static str {
        match self {
            Self::Nexus => "https://api.nexusmods.com",
            Self::CurseForge => "https://api.curseforge.com",
            Self::Steam => "https://api.steampowered.com",
            Self::Rawg => "https://api.rawg.io",
            Self::Modrinth => "https://api.modrinth.com",
        }
    }

    fn requires_key(self) -> bool {
        matches!(
            self,
            Self::Nexus | Self::CurseForge | Self::Steam | Self::Rawg
        )
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchExternalRequest {
    /// nexus | curseforge | steam | rawg | modrinth
    pub provider: String,
    /// GET | POST
    #[serde(default = "default_method")]
    pub method: String,
    /// Ruta relativa al host del proveedor, ej. `/v1/games/skyrim/mods/1.json`
    pub path: String,
    #[serde(default)]
    pub query: HashMap<String, String>,
    /// Cuerpo JSON (solo POST)
    #[serde(default)]
    pub body: Option<Value>,
    /// Clave del proveedor (desde Settings / storage)
    #[serde(default)]
    pub api_key: Option<String>,
    /// Headers extra opcionales (no pisan Authorization internos)
    #[serde(default)]
    pub headers: HashMap<String, String>,
}

fn default_method() -> String {
    "GET".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchExternalResponse {
    pub status: u16,
    pub ok: bool,
    pub headers: HashMap<String, String>,
    pub body: Value,
}

fn build_url(
    provider: Provider,
    path: &str,
    query: &HashMap<String, String>,
    api_key: Option<&str>,
) -> Result<String, String> {
    let path = path.trim();
    if path.is_empty() || !path.starts_with('/') {
        return Err("path debe empezar con /".into());
    }
    if path.contains("://") || path.contains("..") {
        return Err("path inválido".into());
    }

    let mut params = query.clone();
    // Steam y RAWG llevan la clave en query string.
    if let Some(key) = api_key.map(str::trim).filter(|k| !k.is_empty()) {
        match provider {
            Provider::Rawg | Provider::Steam => {
                params.entry("key".into()).or_insert_with(|| key.to_string());
            }
            _ => {}
        }
    }

    let base = provider.base_url();
    if params.is_empty() {
        return Ok(format!("{base}{path}"));
    }
    let qs = params
        .iter()
        .map(|(k, v)| format!("{}={}", urlencoding_encode(k), urlencoding_encode(v)))
        .collect::<Vec<_>>()
        .join("&");
    Ok(format!("{base}{path}?{qs}"))
}

fn urlencoding_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn apply_auth_headers(
    provider: Provider,
    builder: reqwest::RequestBuilder,
    api_key: Option<&str>,
) -> Result<reqwest::RequestBuilder, String> {
    let key = api_key.map(str::trim).unwrap_or("");
    if provider.requires_key() && key.is_empty() {
        return Err(format!(
            "Falta la API key de {:?}. Guárdala en Ajustes.",
            provider
        ));
    }

    let ua = format!("{APP_NAME}/{APP_VERSION} (local library)");
    let builder = builder
        .header("User-Agent", ua)
        .header("Accept", "application/json");

    Ok(match provider {
        Provider::Nexus => builder
            .header("apikey", key)
            .header("Application-Name", APP_NAME)
            .header("Application-Version", APP_VERSION),
        Provider::CurseForge => builder.header("x-api-key", key),
        Provider::Steam | Provider::Rawg | Provider::Modrinth => builder,
    })
}

fn parse_body(text: &str) -> Value {
    if text.trim().is_empty() {
        return Value::Null;
    }
    serde_json::from_str(text).unwrap_or_else(|_| Value::String(text.to_string()))
}

#[tauri::command]
pub async fn fetch_external_api(
    request: FetchExternalRequest,
) -> Result<FetchExternalResponse, String> {
    let provider = Provider::parse(&request.provider)?;
    let method = request.method.trim().to_ascii_uppercase();
    if method != "GET" && method != "POST" {
        return Err("method debe ser GET o POST".into());
    }

    let api_key = request.api_key.as_deref();
    let url = build_url(provider, &request.path, &request.query, api_key)?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(TIMEOUT_SECS))
        .build()
        .map_err(|e| e.to_string())?;

    let mut builder = match method.as_str() {
        "POST" => client.post(&url),
        _ => client.get(&url),
    };
    builder = apply_auth_headers(provider, builder, api_key)?;

    for (k, v) in &request.headers {
        let lower = k.to_ascii_lowercase();
        if lower == "apikey"
            || lower == "x-api-key"
            || lower == "authorization"
            || lower == "host"
        {
            continue;
        }
        builder = builder.header(k, v);
    }

    if method == "POST" {
        if let Some(body) = &request.body {
            builder = builder.json(body);
        }
    }

    let response = builder.send().await.map_err(|e| {
        if e.is_timeout() {
            "Tiempo de espera agotado con la API.".into()
        } else {
            format!("Sin conexión con la API: {e}")
        }
    })?;

    let status = response.status().as_u16();
    let ok = response.status().is_success();
    let mut headers = HashMap::new();
    for (k, v) in response.headers().iter() {
        if let Ok(val) = v.to_str() {
            headers.insert(k.as_str().to_ascii_lowercase(), val.to_string());
        }
    }
    let text = response.text().await.map_err(|e| e.to_string())?;
    let body = parse_body(&text);

    if !ok {
        let detail = body
            .get("message")
            .or_else(|| body.get("error"))
            .and_then(|v| v.as_str())
            .unwrap_or("La API respondió con error.");
        return Err(format!("HTTP {status}: {detail}"));
    }

    Ok(FetchExternalResponse {
        status,
        ok,
        headers,
        body,
    })
}
