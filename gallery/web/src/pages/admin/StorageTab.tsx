import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CircleCheck, CircleX, PlugZap, RefreshCw, Star, Trash } from "lucide-react";
import { api, ApiError, type Overview, type StorageInfo, type StorageTestResult, type TestStep } from "../../lib/api";
import { formatBytes, numberFmt, savedPercent } from "../../lib/format";
import { ErrorBox, Spinner } from "../../components/Status";
import { useDocumentTitle } from "../../hooks/usePhotoFeed";

const LABELS: Record<string, string> = {
  driver: "Driver",
  root: "Thư mục gốc",
  provider: "Nhà cung cấp",
  endpoint: "S3 API endpoint",
  region: "Region",
  bucket: "Bucket",
  forcePathStyle: "Path-style",
  accessKeyId: "Access key",
  publicBaseUrl: "URL công khai (CDN)",
};

export function StorageTab() {
  useDocumentTitle("Lưu trữ & CDN");
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanResult, setCleanResult] = useState<string | null>(null);

  const load = useCallback(() => {
    api<Overview>("/api/admin/overview")
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Không tải được thông tin kho"));
  }, []);
  useEffect(load, [load]);

  const runCleanup = async () => {
    setCleaning(true);
    try {
      const r = await api<{ summary: Record<string, number> }>("/api/admin/cleanup", { method: "POST" });
      const s = r.summary;
      setCleanResult(
        `Đã xóa ${s.keysDeleted ?? 0} key mồ côi, hoàn tất ${s.photosFinalized ?? 0} ảnh đang xóa` +
          ((s.keysFailed ?? 0) + (s.photosFailed ?? 0) > 0 ? `; còn ${(s.keysFailed ?? 0) + (s.photosFailed ?? 0)} mục lỗi, sẽ thử lại.` : "."),
      );
      load();
    } catch (err) {
      setCleanResult(err instanceof ApiError ? err.message : "Không chạy được tác vụ dọn");
    } finally {
      setCleaning(false);
    }
  };

  if (error) return <ErrorBox onRetry={load}>{error}</ErrorBox>;
  if (!data) return <Spinner label="Đang tải…" />;

  const totalVariants = data.bytes.variants.reduce((n, v) => n + v.bytes, 0);
  const photoCount = (data.photos.PUBLISHED ?? 0) + (data.photos.HIDDEN ?? 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {data.faults.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border border-warning bg-warning-soft p-4 text-sm text-warning lg:col-span-2">
          <AlertTriangle aria-hidden className="size-5 shrink-0" />
          <p>
            Đang bật FAULT_INJECTION=<code>{data.faults.join(",")}</code> để nghiệm thu luồng lỗi. Tắt biến này trước khi dùng thật.
          </p>
        </div>
      )}
      {data.orphanStorages.length > 0 && (
        <div role="alert" className="flex gap-3 rounded-xl border border-danger bg-danger-soft p-4 text-sm text-danger lg:col-span-2">
          <AlertTriangle aria-hidden className="size-5 shrink-0" />
          <p>
            Có ảnh nằm ở kho không còn trong cấu hình:{" "}
            {data.orphanStorages.map((o) => `${o.name} (${o.photoCount} ảnh)`).join(", ")}. Thêm lại kho vào <code>STORAGE_PROFILES</code> hoặc chuyển file sang kho khác.
          </p>
        </div>
      )}

      <section className="space-y-3 lg:col-span-2" aria-labelledby="storages-title">
        <div>
          <h2 id="storages-title" className="font-semibold">
            Các kho lưu trữ
          </h2>
          <p className="mt-1 text-sm text-muted">
            Khai báo trong <code>.env</code> bằng <code>STORAGE_PROFILES</code>, đọc lúc khởi động. Admin chọn kho khi tải ảnh lên; mỗi ảnh ghi tên kho của nó nên
            hiển thị, tải về và xóa luôn đi đúng kho. DB không lưu thông tin xác thực.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {data.storages.map((s) => (
            <StorageCard key={s.name} storage={s} mediaBaseUrl={data.mediaBaseUrl} />
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="usage-title">
        <h2 id="usage-title" className="font-semibold">
          Dung lượng và tỷ lệ tiết kiệm
        </h2>
        <dl className="grid grid-cols-3 gap-3 text-center">
          {[
            ["Ảnh công khai", numberFmt.format(data.photos.PUBLISHED ?? 0)],
            ["Đang ẩn", numberFmt.format(data.photos.HIDDEN ?? 0)],
            ["Đang dọn file", numberFmt.format(data.photos.DELETING ?? 0)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-surface-2 p-3">
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        <table className="w-full text-sm">
          <caption className="sr-only">Dung lượng theo loại file</caption>
          <thead className="text-xs text-muted">
            <tr>
              <th scope="col" className="pb-1.5 text-left font-normal">
                Loại file
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                Tổng
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                TB / ảnh
              </th>
              <th scope="col" className="pb-1.5 text-right font-normal">
                So với file gốc
              </th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr className="border-t border-line">
              <th scope="row" className="py-1.5 text-left font-normal">
                File người dùng tải lên
              </th>
              <td className="text-right">{formatBytes(data.bytes.source)}</td>
              <td className="text-right">{photoCount ? formatBytes(data.bytes.source / photoCount) : "—"}</td>
              <td className="text-right text-muted">100%</td>
            </tr>
            <tr className="border-t border-line">
              <th scope="row" className="py-1.5 text-left font-normal">
                Bản gốc chuẩn hóa (tải về)
              </th>
              <td className="text-right">{formatBytes(data.bytes.original)}</td>
              <td className="text-right">{photoCount ? formatBytes(data.bytes.original / photoCount) : "—"}</td>
              <td className="text-right text-muted">{data.bytes.source ? `${Math.round((data.bytes.original / data.bytes.source) * 100)}%` : "—"}</td>
            </tr>
            {data.bytes.variants.map((v) => (
              <tr key={v.width} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-normal">
                  WebP ≤ {v.width}px <span className="text-xs text-muted">({v.count})</span>
                </th>
                <td className="text-right">{formatBytes(v.bytes)}</td>
                <td className="text-right">{v.count ? formatBytes(v.bytes / v.count) : "—"}</td>
                <td className="text-right text-success">{data.bytes.source ? `−${savedPercent(v.bytes, data.bytes.source)}%` : "—"}</td>
              </tr>
            ))}
            <tr className="border-t border-line font-medium">
              <th scope="row" className="py-1.5 text-left">
                Toàn bộ variant
              </th>
              <td className="text-right">{formatBytes(totalVariants)}</td>
              <td />
              <td className="text-right text-success">{data.bytes.source ? `−${savedPercent(totalVariants, data.bytes.source)}%` : "—"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <div className="space-y-4">
        <section className="card space-y-3 p-5" aria-labelledby="limits-title">
          <h2 id="limits-title" className="font-semibold">
            Giới hạn upload và variant
          </h2>
          <ul className="space-y-1.5 text-sm">
            <li>1 đến {data.limits.maxFiles} ảnh trong một request multipart</li>
            <li>Mỗi file tối đa {formatBytes(data.limits.maxFileBytes)}; vượt ngưỡng chỉ file đó bị từ chối</li>
            <li>Tổng request tối đa {formatBytes(data.limits.maxRequestBytes)}; vượt ngưỡng trả 413, không ảnh nào được công bố</li>
            <li>Tối đa {numberFmt.format(data.limits.maxPixels)} pixel, kiểm tra từ header trước khi giải mã</li>
            <li>Chỉ JPEG và PNG, nhận dạng theo chữ ký file; ảnh chỉ nằm trong RAM, không ghi file tạm ra đĩa</li>
            <li>Variant WebP: {data.limits.variants.map((v) => `${v.width}px (q${v.quality})`).join(", ")}; không phóng lớn ảnh nhỏ</li>
          </ul>
        </section>

        <section className="card space-y-3 p-5" aria-labelledby="cleanup-title">
          <h2 id="cleanup-title" className="font-semibold">
            Dọn file
          </h2>
          <p className="text-sm text-muted">
            Khi DB lỗi sau lúc đã ghi file, hoặc kho lỗi lúc xóa ảnh, server giữ danh sách (kho, key) để xóa lại. Tác vụ dọn tự chạy định kỳ; có thể chạy ngay tại đây.
          </p>
          <p className="text-sm">
            <strong className="tabular-nums">{data.cleanup.keys}</strong> key mồ côi chờ xóa · <strong className="tabular-nums">{data.cleanup.deletingPhotos}</strong> ảnh đang
            dọn file
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" onClick={runCleanup} disabled={cleaning}>
              <Trash aria-hidden className="size-4" /> {cleaning ? "Đang dọn…" : "Chạy dọn ngay"}
            </button>
            <button type="button" className="btn-ghost" onClick={load}>
              <RefreshCw aria-hidden className="size-4" /> Làm mới
            </button>
          </div>
          <p role="status" className="text-sm text-muted">
            {cleanResult}
          </p>
        </section>
      </div>
    </div>
  );
}

function StorageCard({ storage, mediaBaseUrl }: { storage: StorageInfo; mediaBaseUrl: string }) {
  const [test, setTest] = useState<{ ok: boolean; steps: TestStep[] } | null>(null);
  const [testing, setTesting] = useState(false);
  const titleId = `storage-${storage.name}`;

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    const fail = (detail: string) => setTest({ ok: false, steps: [{ step: "Kiểm tra kết nối", ok: false, ms: 0, detail }] });
    try {
      // 502 khi một bước bắt buộc thất bại; body vẫn có danh sách bước nên đọc body ở mọi mã trạng thái
      const res = await fetch(`/api/admin/storage/test?storage=${encodeURIComponent(storage.name)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      });
      const body = (await res.json().catch(() => null)) as (StorageTestResult & { error?: { message: string } }) | null;
      if (body?.steps) setTest({ ok: body.ok, steps: body.steps });
      else fail(body?.error?.message ?? `HTTP ${res.status}`);
    } catch {
      fail("Không kết nối được tới máy chủ");
    } finally {
      setTesting(false);
    }
  };

  return (
    <article className="card space-y-4 p-5" aria-labelledby={titleId}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id={titleId} className="flex items-center gap-2 font-semibold">
            {storage.label}
            {storage.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                <Star aria-hidden className="size-3" /> Mặc định
              </span>
            )}
          </h3>
          <p className="font-mono text-xs text-muted">{storage.name}</p>
        </div>
        <p className="text-sm text-muted">
          <strong className="tabular-nums text-fg">{numberFmt.format(storage.photoCount)}</strong> ảnh · {formatBytes(storage.sourceBytes)} gốc
        </p>
      </header>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {Object.entries(storage.details).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{LABELS[k] ?? k}</dt>
            <dd className="break-all font-mono text-xs leading-5">{v === null ? "—" : typeof v === "boolean" ? (v ? "bật" : "tắt") : v}</dd>
          </div>
        ))}
        <dt className="text-muted">URL ảnh</dt>
        <dd className="break-all font-mono text-xs leading-5">{storage.publicBaseUrl ? `${storage.publicBaseUrl}/<key>` : `${mediaBaseUrl}/<key>`}</dd>
        <dt className="text-muted">Tải bản gốc</dt>
        <dd className="text-xs leading-5">{storage.downloadMode === "presigned" ? "URL có chữ ký 5 phút (presigned)" : "Web server stream file (proxy)"}</dd>
      </dl>
      <div className="space-y-3">
        <button type="button" className="btn-primary" onClick={runTest} disabled={testing}>
          <PlugZap aria-hidden className="size-4" />
          {testing ? "Đang kiểm tra…" : "Kiểm tra kết nối"}
        </button>
        {test && (
          <div role="status" className="space-y-2">
            <p className={`text-sm font-medium ${test.ok ? "text-success" : "text-danger"}`}>{test.ok ? "Ghi, đọc và xóa đều thành công." : "Kết nối lỗi."}</p>
            <ol className="space-y-1.5 text-sm">
              {test.steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  {s.ok ? (
                    <CircleCheck aria-label="Đạt" className="mt-0.5 size-4 shrink-0 text-success" />
                  ) : s.optional ? (
                    <AlertTriangle aria-label="Cảnh báo" className="mt-0.5 size-4 shrink-0 text-warning" />
                  ) : (
                    <CircleX aria-label="Lỗi" className="mt-0.5 size-4 shrink-0 text-danger" />
                  )}
                  <span className="min-w-0">
                    <span className="break-all">{s.step}</span> <span className="text-xs text-muted">{s.ms} ms</span>
                    {s.detail && <span className="block break-all text-xs text-muted">{s.detail}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </article>
  );
}
