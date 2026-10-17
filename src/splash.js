import { Window, getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

async function mainByLabel() {
  try {
    const fromWebview = await WebviewWindow.getByLabel("main");
    if (fromWebview) return fromWebview;
  } catch (_) {}
  try {
    if (typeof Window.getByLabel === "function") return await Window.getByLabel("main");
  } catch (_) {}
  return null;
}

setTimeout(async () => {
  const mainWindow = await mainByLabel();
  if (mainWindow) {
    await mainWindow.show();
    try {
      await mainWindow.setFocus();
    } catch (_) {}
  }
  await getCurrentWindow().close();
}, 3000);
