# wi-mod

Biblioteca local de mods para Windows. Corre en `127.0.0.1`, guarda todo en `data/` y abre una ventana propia.

Plataformas: Nexus Mods, Modrinth, CurseForge, Steam Workshop y páginas oficiales. La paleta y la tipografía siguen la plataforma elegida.

## Requisitos

- Windows
- Python 3.12
- Dependencias de `requirements.txt`

## Uso

```bat
py -3 -m pip install -r requirements.txt
py -3 app.py
```

O doble clic en `wi-mod.bat`. Si existe `dist\wi-mod.exe`, abre el ejecutable.

El usuario y la clave empiezan vacíos. Al escribir el nombre se consulta la base: si no existe se puede crear la clave; si existe, entrar pide el mismo largo de clave. **Olvidé la clave** deja elegir otra.

## Datos

`data/` no se sube al repositorio. Ahí quedan la biblioteca, las sesiones, las portadas y el perfil de la ventana.

La clave de RAWG se guarda en esa base, desde Ajustes, o con la variable `WI_MOD_RAWG_KEY` la primera vez que falte.

## Pruebas

```bat
py -3 -m unittest tests.test_core -q
```

## Ejecutable

```bat
py -3 -m PyInstaller --noconfirm wi-mod.spec
```

El resultado es `dist\wi-mod.exe`. Cierra wi-mod antes de volver a compilar. Los datos del ejecutable viven en `dist\data\`.
