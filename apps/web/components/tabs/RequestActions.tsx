"use client";

import type { MeetingStatus } from "@hallway/types";
import { Button } from "@primer/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Mark accepted (fallback when the invitee can't use the link) and Mark as met. */
export function RequestActions({ meetingId, status }: { meetingId: string; status: MeetingStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (action: "accepted" | "met") => {
    setBusy(true);
    await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/${action}`, { method: "POST" });
    setBusy(false);
    router.refresh();
  };
  if (status === "pending")
    return (
      <Button size="small" onClick={() => act("accepted")} disabled={busy}>
        Mark accepted
      </Button>
    );
  if (status === "accepted")
    return (
      <Button size="small" variant="primary" onClick={() => act("met")} disabled={busy}>
        Mark as met
      </Button>
    );
  return null;
}
