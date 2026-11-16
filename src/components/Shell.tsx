"use client";

import { BriefcaseBusiness, KanbanSquare, LayoutDashboard, Search, Settings, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ToastProvider } from "./Toast";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/jobs", label: "Find jobs", icon: Search },
  { href: "/applications", label: "Applications", icon: KanbanSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <ToastProvider>
      <div className="min-h-dvh md:pl-56">
        {/* Desktop: fixed sidebar */}
        <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
            <span className="grid size-8 place-items-center rounded-lg bg-accent text-on-accent">
              <BriefcaseBusiness className="size-[18px]" aria-hidden />
            </span>
            <span className="text-[17px] font-semibold tracking-tight">JobApply</span>
          </Link>
          <nav className="flex flex-col gap-0.5" aria-label="Main">
            {NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={active(href) ? "page" : undefined}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active(href) ? "bg-accent-soft text-accent" : "text-muted hover:bg-sunken hover:text-ink",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <p className="mt-auto px-3 text-xs leading-relaxed text-muted">Your resume and applications stay on this computer.</p>
        </aside>

        <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:px-8 md:pb-12 md:pt-9">{children}</main>

        {/* Mobile: bottom tab bar */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface md:hidden" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cx("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active(href) ? "text-accent" : "text-muted")}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
