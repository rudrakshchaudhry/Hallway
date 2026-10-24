"use client";

import type FalkorDBCanvas from "@falkordb/canvas";
import type { PastGraphResponse } from "@hallway/types";
import { useEffect, useRef } from "react";
import styles from "./tabs.module.css";

const COLOR: Record<string, string> = {
  Person: "--fgColor-accent",
  Talk: "--fgColor-success",
  SideEvent: "--fgColor-attention",
  Meeting: "--fgColor-done",
  Conference: "--fgColor-sponsors",
  Topic: "--fgColor-muted",
};

/** The user's memory graph, drawn with @falkordb/canvas (client-only: it throws during SSR). */
export function GraphCanvas({ graph }: { graph: PastGraphResponse }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const host = ref.current;
    if (!host) return;
    void import("@falkordb/canvas").then(() => {
      if (cancelled) return;
      const css = getComputedStyle(document.documentElement);
      const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
      const el = document.createElement("falkordb-canvas") as FalkorDBCanvas;
      host.replaceChildren(el);
      const index = new Map(graph.nodes.map((n, i) => [n.id, i]));
      el.setConfig({
        backgroundColor: token("--bgColor-default", "#0d1117"),
        foregroundColor: token("--fgColor-default", "#e6edf3"),
        captionsKeys: ["name"],
      });
      el.setData({
        nodes: graph.nodes.map((n, i) => ({
          id: i,
          labels: [n.label],
          visible: true,
          color: token(COLOR[n.label] ?? "--fgColor-muted", "#8b949e"),
          data: { name: n.name },
        })),
        links: graph.edges.flatMap((e, i) => {
          const source = index.get(e.from);
          const target = index.get(e.to);
          if (source === undefined || target === undefined) return [];
          const accepted = e.type === "WITH" && graph.nodes.find((n) => n.id === e.from)?.props?.status === "accepted";
          return [{ id: i, relationship: e.type, source, target, visible: true, color: token(accepted ? "--fgColor-success" : "--borderColor-default", "#30363d"), data: {} }];
        }),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  return <div ref={ref} className={styles.graph} aria-label="Your Hallway memory graph" role="img" />;
}
