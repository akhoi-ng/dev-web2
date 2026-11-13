import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { authApi } from "../api/index.js";

// Google reCAPTCHA v2 (checkbox). Site key công khai lấy từ API (GET /api/auth/captcha) để chỉ có
// một nơi cấu hình; secret key chỉ nằm ở backend. Token của widget có hạn 2 phút và chỉ xác minh
// được một lần, nên sau mỗi lần gửi form trang gọi ref.reset() để người dùng xác nhận lại.

const SCRIPT_ID = "recaptcha-api";
const ONLOAD = "__luaHongRecaptchaOnload";

let siteKeyPromise = null;
function loadSiteKey() {
  if (!siteKeyPromise) {
    siteKeyPromise = authApi.captchaConfig().then(({ data }) => data.siteKey);
    siteKeyPromise.catch(() => {
      siteKeyPromise = null;
    });
  }
  return siteKeyPromise;
}

let scriptPromise = null;
function loadScript() {
  if (window.grecaptcha && window.grecaptcha.render) return Promise.resolve(window.grecaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      window[ONLOAD] = () => resolve(window.grecaptcha);
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = `https://www.google.com/recaptcha/api.js?onload=${ONLOAD}&render=explicit&hl=vi`;
      s.async = true;
      s.defer = true;
      s.onerror = () => {
        scriptPromise = null;
        s.remove();
        reject(new Error("Không tải được reCAPTCHA"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

const Recaptcha = forwardRef(function Recaptcha({ onChange }, ref) {
  const boxRef = useRef(null);
  const widgetRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const [failed, setFailed] = useState(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    let alive = true;
    Promise.all([loadSiteKey(), loadScript()])
      .then(([siteKey, grecaptcha]) => {
        if (!alive || !boxRef.current || widgetRef.current !== null) return;
        widgetRef.current = grecaptcha.render(boxRef.current, {
          sitekey: siteKey,
          callback: (token) => onChangeRef.current(token),
          "expired-callback": () => onChangeRef.current(""),
          "error-callback": () => onChangeRef.current(""),
        });
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetRef.current !== null && window.grecaptcha) window.grecaptcha.reset(widgetRef.current);
      onChangeRef.current("");
    },
  }));

  return (
    <div>
      <div ref={boxRef} className="min-h-[78px]" data-testid="recaptcha"></div>
      {failed && (
        <p className="text-sm text-brand-700" role="alert">
          Không tải được CAPTCHA. Kiểm tra kết nối mạng rồi tải lại trang.
        </p>
      )}
    </div>
  );
});

export default Recaptcha;
