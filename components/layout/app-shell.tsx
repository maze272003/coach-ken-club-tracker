"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  Gauge,
  LayoutDashboard,
  LogOutIcon,
  MenuIcon,
  Target,
  User,
  Users,
  UsersRound,
  Waves,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type NavIconName =
  | "LayoutDashboard"
  | "Users"
  | "ClipboardCheck"
  | "CalendarClock"
  | "CalendarDays"
  | "Dumbbell"
  | "Gauge"
  | "Target"
  | "User"
  | "UsersRound"
  | "Waves"
  | "dashboard"
  | "students"
  | "attendance"
  | "training"
  | "skills"
  | "goals"
  | "profile";

const iconMap: Record<NavIconName, LucideIcon> = {
  LayoutDashboard,
  Users,
  ClipboardCheck,
  CalendarClock,
  CalendarDays,
  Dumbbell,
  Gauge,
  Target,
  User,
  UsersRound,
  Waves,
  dashboard: LayoutDashboard,
  students: Users,
  attendance: ClipboardCheck,
  training: CalendarDays,
  skills: Gauge,
  goals: Target,
  profile: User,
};

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
  exact?: boolean;
};

export type ShellUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

function initials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

function NavLinks({
  items,
  onNavigate,
}: {
  items: NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main navigation" className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = iconMap[item.icon] ?? LayoutDashboard;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 px-1 py-1">
      <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <Waves className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold tracking-tight">
        CoachKen Tracker
      </span>
    </Link>
  );
}

function UserFooter({ user }: { user: ShellUser }) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="flex items-center gap-3 border-t px-3 py-3">
      <Avatar className="size-9">
        {user.image ? <AvatarImage src={user.image} alt="" /> : null}
        <AvatarFallback className="text-xs">
          {initials(user.name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{user.name ?? "Account"}</p>
        {user.email ? (
          <p className="truncate text-xs text-muted-foreground">
            {user.email}
          </p>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (signingOut) return;
          setSigningOut(true);
          void signOut().then(() => {
            router.replace("/login");
          });
        }}
        disabled={signingOut}
        aria-label="Log out"
        title="Log out"
      >
        <LogOutIcon className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

export function AppShell({
  navItems,
  user,
  children,
}: {
  navItems: NavItem[];
  user: ShellUser;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-svh bg-muted/30">
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col justify-between border-r bg-background lg:flex"
        aria-label="Sidebar"
      >
        <div className="flex flex-col gap-6 px-3 py-4">
          <Brand />
          <NavLinks items={navItems} />
        </div>
        <UserFooter user={user} />
      </aside>

      <div className="flex min-h-svh flex-col lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Open navigation menu"
              >
                <MenuIcon className="size-5" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0">
              <SheetHeader className="border-b px-4 py-3 text-left">
                <SheetTitle asChild>
                  <div>
                    <Brand />
                  </div>
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Navigation menu
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col justify-between overflow-y-auto">
                <div className="px-3 py-3">
                  <NavLinks
                    items={navItems}
                    onNavigate={() => setMobileOpen(false)}
                  />
                </div>
                <UserFooter user={user} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="text-sm font-semibold tracking-tight">
            CoachKen Tracker
          </span>
        </header>
        <main className="flex-1">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
