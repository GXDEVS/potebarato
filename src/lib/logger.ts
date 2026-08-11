type Level = "info" | "warn" | "error";

function log(level: Level, module: string, message: string, data?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...data,
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export const logger = {
  info: (module: string, msg: string, data?: Record<string, unknown>) => log("info", module, msg, data),
  warn: (module: string, msg: string, data?: Record<string, unknown>) => log("warn", module, msg, data),
  error: (module: string, msg: string, data?: Record<string, unknown>) => log("error", module, msg, data),
};
