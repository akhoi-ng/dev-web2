import { NavLink, Outlet } from "react-router-dom";
import { FolderOpen, HardDrive, Images, Upload } from "lucide-react";

const TABS = [
  { to: "/admin/upload", label: "Tải ảnh lên", icon: Upload },
  { to: "/admin/library", label: "Thư viện ảnh", icon: Images },
  { to: "/admin/albums", label: "Album", icon: FolderOpen },
  { to: "/admin/storage", label: "Lưu trữ & CDN", icon: HardDrive },
];

export function AdminLayout() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quản trị</h1>
      </div>
      <nav aria-label="Khu quản trị" className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
        <ul className="flex gap-1 border-b border-line">
          {TABS.map(({ to, label, icon: Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg"
                  }`
                }
              >
                <Icon aria-hidden className="size-4" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
