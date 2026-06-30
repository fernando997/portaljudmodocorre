import { appendFileSync, existsSync, writeFileSync } from "fs";
import { join } from "path";

const LOG_PATH = join(process.cwd(), "debug.log");

if (!existsSync(LOG_PATH)) {
  writeFileSync(LOG_PATH, "");
}

export function debugLog(label: string, data: unknown) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${label}] ${JSON.stringify(data, null, 2)}\n`;
  try {
    appendFileSync(LOG_PATH, line);
  } catch {
    console.error("[debugLog] falha ao escrever:", line);
  }
}
