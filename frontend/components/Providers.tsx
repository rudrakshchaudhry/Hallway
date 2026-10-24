"use client";

import type { ReactNode } from "react";
import { BaseStyles } from "@primer/react";

export function Providers({ children }: { children: ReactNode }) {
  return <BaseStyles>{children}</BaseStyles>;
}
