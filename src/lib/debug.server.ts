export function debugLog(label: string, data: unknown) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${label}]`, JSON.stringify(data, null, 2));
}
