import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError } from "../../api/client.js";
import { mfaApi } from "../../api/index.js";
import { useAuth } from "../../auth/AuthContext.jsx";
import DataStatus from "../../components/DataStatus.jsx";
import PageHeading from "../../components/PageHeading.jsx";
import { useApiData } from "../../hooks/useApiData.js";
import { useDocumentTitle } from "../../hooks/useDocumentTitle.js";
import { Notice, describeError } from "../auth/shared.jsx";

/*
 * /account/security — Block 10: xác thực hai bước (TOTP) cho bản SPA.
 *   Tắt  -> "Bật": POST /api/auth/mfa/setup -> QR + secret nhập tay -> nhập mã -> POST .../confirm
 *           -> MFA bật, mã khôi phục hiện MỘT lần, API cấp token mới (nơi khác bị đăng xuất)
 *   Bật  -> mật khẩu + mã (xác thực lại) cho: thay thiết bị, tạo lại mã khôi phục, tắt MFA
 * QR, secret và mã khôi phục chỉ nằm trong state của trang; rời trang là mất (API trả no-store).
 */

const card = "rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200 sm:p-8";
const input =
  "mt-1 w-full rounded-xl border border-stone-300 px-4 py-2.5 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200";
const btnPrimary = "rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60";
const btnGhost = "rounded-xl border border-stone-300 px-5 py-2.5 font-semibold hover:bg-stone-100 disabled:opacity-60";
const btnDanger = "rounded-xl bg-red-600 px-5 py-2.5 font-semibold text-white hover:bg-red-700 disabled:opacity-60";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadCodes(codes, email) {
  const body = [`Mã khôi phục Lửa Hồng — ${email}`, "Mỗi mã chỉ dùng được một lần.", "", ...codes, ""].join("\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "lua-hong-recovery-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

// Bước thiết lập: QR + secret nhập tay + ô xác nhận mã
function SetupPanel({ setup, onConfirmed, onCancel }) {
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const { data } = await mfaApi.confirm({ code });
      await onConfirmed(data);
    } catch (err) {
      setCode("");
      setError(describeError(err));
      setPending(false);
    }
  }

  return (
    <section className={card} data-mfa-setup>
      <h2 className="text-lg font-bold">{setup.replacing ? "Thay thiết bị xác thực" : "Bật xác thực hai bước"}</h2>
      <p className="mt-1 text-sm text-stone-500">
        {setup.replacing
          ? "Secret cũ vẫn dùng được cho tới khi bạn xác nhận mã của secret mới."
          : "MFA chỉ được bật sau khi bạn nhập đúng một mã từ ứng dụng."}
      </p>
      {error && <div className="mt-4"><Notice code={error.code}>{error.message}</Notice></div>}

      <div className="mt-5 grid gap-6 sm:grid-cols-[auto_1fr]">
        <div className="text-center">
          <img src={setup.qr} alt="Mã QR để thêm tài khoản vào ứng dụng Authenticator" width="220" height="220"
               className="mx-auto rounded-lg ring-1 ring-stone-200" />
          <p className="mt-2 text-xs text-stone-500">1. Quét bằng Google Authenticator, Microsoft Authenticator, 2FAS…</p>
        </div>
        <div className="min-w-0 space-y-5">
          <div>
            <p className="text-sm font-semibold">Không quét được? Nhập tay secret key này:</p>
            <div className="mt-1 flex items-start gap-2">
              <p className="min-w-0 flex-1 break-all rounded-xl bg-stone-50 px-4 py-3 font-mono text-sm tracking-wider" data-mfa-secret>{setup.secret}</p>
              <button type="button" className={btnGhost + " px-3 text-sm"}
                      onClick={async () => setCopied(await copyText(setup.secret.replace(/ /g, "")))}>
                {copied ? "Đã chép" : "Chép"}
              </button>
            </div>
            <p className="mt-1 text-xs text-stone-500">Loại: dựa trên thời gian (TOTP), {setup.digits} chữ số, {setup.period} giây, {setup.algorithm}.</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-3">
            <label htmlFor="setup-code" className="text-sm font-semibold">2. Nhập mã 6 chữ số ứng dụng đang hiện</label>
            <input id="setup-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required
                   value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456"
                   className={input + " text-center font-mono text-lg tracking-widest"} />
            <button type="submit" disabled={pending || code.length !== 6} className={btnPrimary + " w-full"}>
              {pending ? "Đang xác nhận…" : setup.replacing ? "Xác nhận thiết bị mới" : "Xác nhận và bật MFA"}
            </button>
          </form>
          <button type="button" onClick={onCancel} disabled={pending} className="text-sm font-semibold text-stone-500 hover:text-brand-700">
            Hủy thiết lập
          </button>
        </div>
      </div>
    </section>
  );
}

// Mã khôi phục: hiện một lần duy nhất
function RecoveryCodesPanel({ heading, codes, email, onDone }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className={card + " ring-amber-300"} data-recovery-codes>
      <h2 className="text-lg font-bold">{heading}</h2>
      <p className="mt-1 text-sm text-stone-600">
        Lưu các mã dưới đây ở nơi an toàn. Khi mất điện thoại, mỗi mã thay được mã 6 chữ số <strong>một lần</strong>.
        Trang này sẽ <strong>không hiện lại</strong> các mã này.
      </p>
      <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-[15px] tracking-wider">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-stone-50 px-3 py-2 text-center ring-1 ring-stone-200">{c}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className={btnGhost} onClick={async () => setCopied(await copyText(codes.join("\n")))}>{copied ? "Đã chép" : "Chép tất cả"}</button>
        <button type="button" className={btnGhost} onClick={() => downloadCodes(codes, email)}>Tải file .txt</button>
        <button type="button" className={btnPrimary + " ml-auto"} onClick={onDone}>Tôi đã lưu các mã</button>
      </div>
    </section>
  );
}

// Xác thực lại (mật khẩu + mã) rồi chọn: thay thiết bị, tạo lại mã khôi phục, tắt MFA
function ManagePanel({ status, onSetup, onCodes, onDisabled }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);

  async function run(action) {
    if (pending) return;
    if (action === "disable" && !window.confirm("Tắt xác thực hai bước? Các thiết bị khác sẽ bị đăng xuất.")) return;
    setPending(action);
    setError(null);
    const body = { password, code };
    try {
      if (action === "setup") onSetup((await mfaApi.setup(body)).data);
      else if (action === "codes") onCodes((await mfaApi.recoveryCodes(body)).data.recoveryCodes);
      else await onDisabled((await mfaApi.disable(body)).data);
    } catch (err) {
      setError(describeError(err));
      setPending(null);
      return;
    }
    setPassword("");
    setCode("");
    setPending(null);
  }

  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Thay đổi MFA</h2>
      <p className="mt-1 text-sm text-stone-500">
        Các thao tác dưới đây cần xác thực lại: nhập mật khẩu hiện tại và mã 6 chữ số (hoặc một mã khôi phục).
        Sai {status.policy.reauthAttempts} lần trong {status.policy.reauthWindowMin} phút sẽ bị tạm khóa.
      </p>
      {error && <div className="mt-4"><Notice code={error.code}>{error.message}</Notice></div>}
      <form onSubmit={(e) => e.preventDefault()} className="mt-5 space-y-4" data-mfa-reauth>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="re-password" className="text-sm font-semibold">Mật khẩu hiện tại</label>
            <input id="re-password" type="password" autoComplete="current-password" maxLength={128} required
                   value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          </div>
          <div>
            <label htmlFor="re-code" className="text-sm font-semibold">Mã xác thực / mã khôi phục</label>
            <input id="re-code" type="text" autoComplete="one-time-code" maxLength={20} required
                   value={code} onChange={(e) => setCode(e.target.value)} className={input + " font-mono"} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 border-t border-stone-100 pt-4">
          <button type="button" disabled={Boolean(pending) || !password || !code} onClick={() => run("setup")} className={btnPrimary}>
            {pending === "setup" ? "Đang xử lý…" : "Thay thiết bị (secret mới)"}
          </button>
          <button type="button" disabled={Boolean(pending) || !password || !code} onClick={() => run("codes")} className={btnGhost}>
            {pending === "codes" ? "Đang xử lý…" : "Tạo lại mã khôi phục"}
          </button>
          <button type="button" disabled={Boolean(pending) || !password || !code} onClick={() => run("disable")} className={btnDanger}>
            {pending === "disable" ? "Đang tắt…" : "Tắt MFA"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default function SecurityPage() {
  useDocumentTitle("Bảo mật tài khoản");
  const { user, applyTokens } = useAuth();
  const { state: navState } = useLocation();
  const [version, setVersion] = useState(0);
  const status = useApiData((signal) => mfaApi.status(signal), [version]);
  const reload = () => setVersion((v) => v + 1);

  const [setup, setSetup] = useState(null); // { qr, secret, otpauthUri, replacing, ... }
  const [codes, setCodes] = useState(null); // { heading, list }
  const [notice, setNotice] = useState(
    navState && navState.recoveryUsed
      ? {
          tone: "info",
          text: `Bạn vừa đăng nhập bằng mã khôi phục (còn ${navState.recoveryRemaining ?? "?"} mã). Nếu đã mất điện thoại, hãy thay thiết bị hoặc tạo lại mã khôi phục.`,
        }
      : null,
  );
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  async function start(loader) {
    if (starting) return;
    setStarting(true);
    setError(null);
    setNotice(null);
    try {
      setSetup((await loader()).data);
    } catch (err) {
      setError(describeError(err));
      if (err instanceof ApiError && err.code === "NO_PENDING_SETUP") reload();
    } finally {
      setStarting(false);
    }
  }

  async function onConfirmed(data) {
    const { recoveryCodes, replaced, accessToken, expiresIn, tokenType } = data;
    // tokenVersion vừa tăng: dùng cặp token mới API vừa cấp cho thiết bị này
    await applyTokens({ accessToken, expiresIn, tokenType });
    setSetup(null);
    setCodes({ heading: replaced ? "Đã thay thiết bị xác thực" : "Đã bật xác thực hai bước", list: recoveryCodes });
    reload();
  }

  async function onCancel() {
    try {
      await mfaApi.cancel();
    } catch {
      // Secret đang chờ vẫn vô hại: chưa xác nhận thì không thay secret đang dùng
    }
    setSetup(null);
    setNotice({ tone: "info", text: "Đã hủy thiết lập MFA." });
    reload();
  }

  async function onDisabled(data) {
    await applyTokens(data);
    setNotice({ tone: "ok", text: "Đã tắt xác thực hai bước. Các thiết bị khác đã bị đăng xuất." });
    reload();
  }

  const email = user ? user.displayEmail || user.email : "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeading heading="Bảo mật tài khoản" subheading={user ? `${email} · role ${user.role}` : undefined} />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {error && <Notice code={error.code}>{error.message}</Notice>}

      {codes ? (
        <RecoveryCodesPanel heading={codes.heading} codes={codes.list} email={email} onDone={() => setCodes(null)} />
      ) : setup ? (
        <SetupPanel setup={setup} onConfirmed={onConfirmed} onCancel={onCancel} />
      ) : (
        <DataStatus state={status}>
          {(s) => (
            <>
              <section className={card} data-mfa-status={s.mfaEnabled ? "enabled" : "disabled"}>
                <h2 className="text-lg font-bold">Xác thực hai bước (MFA)</h2>
                {s.mfaEnabled ? (
                  <p className="mt-2 text-sm text-stone-600">
                    <span className="mr-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">Đang bật</span>
                    Mỗi lần đăng nhập cần thêm mã 6 chữ số từ ứng dụng Authenticator. Còn{" "}
                    <strong data-recovery-remaining>{s.recoveryRemaining}</strong> mã khôi phục chưa dùng.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-stone-600">
                      <span className="mr-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-600">Đang tắt</span>
                      Bật MFA để mật khẩu bị lộ cũng chưa đủ đăng nhập. Cần một ứng dụng như Google Authenticator, Microsoft Authenticator hoặc 2FAS.
                    </p>
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button type="button" disabled={starting} onClick={() => start(() => mfaApi.setup())} className={btnPrimary}>
                        {starting ? "Đang tạo secret…" : "Bật xác thực hai bước"}
                      </button>
                      {s.pending && (
                        <button type="button" disabled={starting} onClick={() => start((signal) => mfaApi.pendingSetup(signal))} className={btnGhost}>
                          Tiếp tục thiết lập đang dở
                        </button>
                      )}
                    </div>
                  </>
                )}
              </section>
              {s.mfaEnabled && (
                <ManagePanel
                  status={s}
                  onSetup={(data) => setSetup(data)}
                  onCodes={(list) => setCodes({ heading: "Đã tạo mã khôi phục mới", list })}
                  onDisabled={onDisabled}
                />
              )}
            </>
          )}
        </DataStatus>
      )}
    </div>
  );
}
