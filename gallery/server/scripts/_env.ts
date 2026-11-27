// Import đầu tiên trong mọi script: nạp .env trước khi các module khác đọc process.env
import { ConfigError, loadEnvFile, readConfig, type Config } from "../src/config.js";

loadEnvFile();

let config: Config;
try {
  config = readConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(err.message);
    process.exit(1);
  }
  throw err;
}

export { config };
