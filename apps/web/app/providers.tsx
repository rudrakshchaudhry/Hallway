"use client";

import { BaseStyles } from "@primer/react";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return <BaseStyles>{children}</BaseStyles>;
}
