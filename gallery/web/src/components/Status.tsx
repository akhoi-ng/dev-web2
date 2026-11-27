import type { ReactNode } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { PhotoStatus } from "../lib/api";

export function Spinner({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 text-sm text-muted ${className}`}>
      <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      {label}
    </span>
  );
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-danger bg-danger-soft px-4 py-3 text-sm text-danger">
      <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{children}</div>
      {onRetry && (
        <button type="button" className="font-medium underline underline-offset-2" onClick={onRetry}>
          Thử lại
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card grid place-items-center gap-2 px-6 py-16 text-center">
      <p className="text-base font-semibold">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

const STATUS: Record<PhotoStatus, { label: string; className: string }> = {
  PUBLISHED: { label: "Công khai", className: "bg-success-soft text-success" },
  HIDDEN: { label: "Đang ẩn", className: "bg-warning-soft text-warning" },
  DELETING: { label: "Đang dọn file", className: "bg-danger-soft text-danger" },
};

export function StatusBadge({ status }: { status: PhotoStatus }) {
  const s = STATUS[status];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.label}</span>;
}
