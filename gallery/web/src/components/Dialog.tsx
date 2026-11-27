import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  titleId: string;
  children: ReactNode;
  /** any: bấm ra ngoài hoặc Esc để đóng; closerequest: chỉ Esc */
  closedBy?: "any" | "closerequest";
  /** md: form thường; xl: khung rộng cho trình chỉnh sửa ảnh */
  size?: "md" | "xl";
  className?: string;
}

/**
 * Modal dùng <dialog> gốc mở bằng showModal(): trình duyệt lo focus, top layer, trang phía sau inert,
 * Esc / cử chỉ back và trả focus về nút đã mở. Không thêm role="dialog", aria-modal hay focus trap.
 */
export function Dialog({ open, onClose, title, titleId, children, closedBy = "closerequest", size = "md", className = "" }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // React không ghi thuộc tính autofocus ra DOM (nó gọi focus() lúc dialog còn đóng), nên đánh
      // dấu bằng data-autofocus và focus sau khi showModal()
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    } else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onCloseRef.current();
    dialog.addEventListener("close", handleClose);

    // Safari chưa hỗ trợ closedby="any": tự đóng khi nhấn VÀ thả chuột bên ngoài khung dialog
    let cleanupFallback = () => {};
    if (closedBy === "any" && !("closedBy" in HTMLDialogElement.prototype)) {
      const outside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
      };
      let pressedOutside = false;
      const down = (e: PointerEvent) => (pressedOutside = outside(e));
      const up = (e: PointerEvent) => {
        if (pressedOutside && outside(e)) dialog.close();
      };
      dialog.addEventListener("pointerdown", down);
      dialog.addEventListener("pointerup", up);
      cleanupFallback = () => {
        dialog.removeEventListener("pointerdown", down);
        dialog.removeEventListener("pointerup", up);
      };
    }
    return () => {
      dialog.removeEventListener("close", handleClose);
      cleanupFallback();
    };
  }, [closedBy]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      {...({ closedby: closedBy } as object)}
      className={`${size === "xl" ? "w-[min(100%-2rem,64rem)]" : "w-[min(100%-2rem,32rem)]"} rounded-2xl p-0 shadow-2xl ${className}`}
    >
      {open && (
        <div className={`flex flex-col ${size === "xl" ? "max-h-[92dvh]" : "max-h-[85dvh]"}`}>
          <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
            <h1 id={titleId} className="text-base font-semibold">
              {title}
            </h1>
            <button type="button" className="btn-ghost -mr-2 p-2" aria-label="Đóng" onClick={() => ref.current?.close()}>
              <X aria-hidden className="size-4" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: string;
  confirmLabel: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

/** Xác nhận thao tác khó hoàn tác; focus mặc định ở nút Hủy (lựa chọn an toàn). */
export function ConfirmDialog({ open, title, confirmLabel, busy, danger = true, onConfirm, onCancel, children }: ConfirmProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} titleId="confirm-title" closedBy="any">
      <div className="space-y-5 text-sm">
        <div className="text-muted">{children}</div>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" data-autofocus onClick={onCancel} disabled={busy}>
            Hủy
          </button>
          <button type="button" className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
