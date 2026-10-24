"use client";

import { CalendarIcon, HomeIcon, PeopleIcon, TelescopeIcon, type Icon } from "@primer/octicons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./shell.module.css";

const TABS: { href: string; label: string; icon: Icon }[] = [
  { href: "/feed", label: "My Feed", icon: HomeIcon },
  { href: "/people", label: "People", icon: PeopleIcon },
  { href: "/explore", label: "Explore", icon: TelescopeIcon },
  { href: "/agenda", label: "Agenda", icon: CalendarIcon },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className={styles.bar} aria-label="Main">
      {TABS.map(({ href, label, icon: TabIcon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className={styles.tab} aria-current={active ? "page" : undefined}>
            <TabIcon size={20} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
