// Kiểm tra kết nối tới các kho đang cấu hình: ghi, đọc, (đọc qua URL công khai), xóa một object thử.
//   npm run storage:check                  mọi kho
//   npm run storage:check -- --storage r2  một kho
import { config } from "./_env.js";
import { createStorageRegistry } from "../src/storage/index.js";

const registry = await createStorageRegistry(config);
const i = process.argv.indexOf("--storage");
const only = i >= 0 ? process.argv[i + 1] : undefined;
const targets = registry.info().filter((s) => !only || s.name === only);
if (targets.length === 0) {
  console.error(`Không có kho "${only}". Các kho: ${registry.names.join(", ")}`);
  process.exit(1);
}

let allOk = true;
for (const info of targets) {
  console.log(`\n=== ${info.name}${info.isDefault ? " (mặc định)" : ""} - ${info.label}`);
  console.log(info.details);
  const steps = await registry.get(info.name).test();
  for (const s of steps) {
    const mark = s.ok ? "OK  " : s.optional ? "WARN" : "FAIL";
    console.log(`${mark} ${s.step} (${s.ms} ms)${s.detail ? ` - ${s.detail}` : ""}`);
  }
  const ok = steps.every((s) => s.ok || s.optional);
  console.log(ok ? "Kết nối tốt." : "Kết nối lỗi.");
  allOk &&= ok;
}
process.exit(allOk ? 0 : 1);
