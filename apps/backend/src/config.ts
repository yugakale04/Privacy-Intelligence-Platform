const DEFAULT_PORT = 3000;
const DEFAULT_HOST = "127.0.0.1";

function readPort(value: string | undefined): number {
  if (value === undefined || value === "") {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }

  return port;
}

export interface BackendConfig {
  host: string;
  port: number;
}

export function getConfig(environment: NodeJS.ProcessEnv = process.env): BackendConfig {
  return {
    host: environment.HOST || DEFAULT_HOST,
    port: readPort(environment.PORT)
  };
}
