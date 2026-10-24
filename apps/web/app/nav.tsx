import styles from "./page.module.css";

export function Nav({ current }: { current: "today" | "events" }) {
  return (
    <nav className={styles.nav} aria-label="Sections">
      <a href="/" aria-current={current === "today" ? "page" : undefined}>
        Today
      </a>
      <a href="/events" aria-current={current === "events" ? "page" : undefined}>
        My events
      </a>
    </nav>
  );
}
