import { useCallback, useRef, useState } from "react";
import { ApiError } from "../api/client.js";

const MSG_VALIDATION = "Vui lòng kiểm tra lại các ô được đánh dấu.";
const MSG_NOT_FOUND = "Bản ghi không còn tồn tại.";
const MSG_GENERIC = "Không kết nối được máy chủ, vui lòng thử lại.";
const MSG_UNAUTHENTICATED = "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.";
const MSG_FORBIDDEN = "Bạn không đủ quyền thực hiện thao tác này.";
const MSG_RATE_LIMITED = "Bạn thao tác quá nhanh, vui lòng thử lại sau.";

// Gửi form: chặn gửi đúp, gom lỗi theo ô và lỗi chung.
export function useSubmit() {
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const pendingRef = useRef(false);

  const submit = useCallback(async (action) => {
    if (pendingRef.current) return null;
    pendingRef.current = true;
    setPending(true);
    setFieldErrors({});
    setFormError("");
    try {
      return await action();
    } catch (error) {
      if (error instanceof ApiError && error.kind === "business" && error.code === "VALIDATION_FAILED") {
        setFieldErrors(error.fields || {});
        setFormError(MSG_VALIDATION);
      } else if (error instanceof ApiError && error.kind === "business" && error.code === "NOT_FOUND") {
        setFormError(MSG_NOT_FOUND);
      } else if (error instanceof ApiError && error.status === 401) {
        // Lớp gọi API đã thử refresh và xóa token; RequireAuth đưa người dùng về /login
        setFormError(MSG_UNAUTHENTICATED);
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError(MSG_FORBIDDEN); // giữ đăng nhập
      } else if (error instanceof ApiError && error.status === 429) {
        setFormError(MSG_RATE_LIMITED);
      } else {
        setFormError(MSG_GENERIC);
      }
      return null;
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }, []);

  return { pending, fieldErrors, formError, submit };
}
