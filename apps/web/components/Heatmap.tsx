import styles from "./heatmap.module.css";

type Props = { total: number; days: { date: string; count: number }[]; label?: string };

/** GitHub-style contribution heatmap: one column per week, five intensity levels. */
export function Heatmap({ total, days, label = "GitHub contributions in the last year" }: Props) {
  const counts = days.map((d) => d.count).filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p: number) => counts[Math.floor((counts.length - 1) * p)] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (c: number) => (c === 0 ? 0 : c <= cuts[0]! ? 1 : c <= cuts[1]! ? 2 : c <= cuts[2]! ? 3 : 4);
  // Pad the first week so rows line up with weekdays (Sunday first, like GitHub).
  const first = days[0] ? new Date(`${days[0].date}T12:00:00Z`).getUTCDay() : 0;
  const cells = [...Array.from({ length: first }, () => null), ...days];
  return (
    <figure className={styles.wrap} aria-label={`${total} ${label}`}>
      <figcaption className={styles.caption}>
        <strong>{total.toLocaleString()}</strong> {label}
      </figcaption>
      <div className={styles.grid}>
        {cells.map((d, i) => (
          <span key={d?.date ?? `pad-${i}`} className={styles.cell} data-level={d ? level(d.count) : undefined} title={d ? `${d.count} on ${d.date}` : undefined} />
        ))}
      </div>
    </figure>
  );
}
