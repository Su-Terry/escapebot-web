"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SignInButton } from "@clerk/nextjs";
import { startReplay } from "@/app/play/actions";

interface Props {
  shareId: string;
  scenarioTitle: string;
  isAuthenticated: boolean;
}

const btnStyle: React.CSSProperties = {
  display: "inline-block",
  marginTop: 12,
  padding: "12px 28px",
  background: "#1a1a1a",
  color: "#fff",
  borderRadius: 8,
  border: "none",
  fontSize: 15,
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "none",
};

export function ReplayCTA({ shareId, scenarioTitle, isAuthenticated }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!isAuthenticated) {
    // Use Clerk's SignInButton so it hooks into the app's existing Clerk login flow.
    // forceRedirectUrl brings B back to this share page after sign-in.
    return (
      <SignInButton forceRedirectUrl={`/s/${shareId}`}>
        <button style={btnStyle}>登入以重玩這一關</button>
      </SignInButton>
    );
  }

  async function handleClick(force?: boolean) {
    setLoading(true);
    try {
      const result = await startReplay(shareId, force);
      if (result.status === "conflict") {
        setLoading(false);
        const ok = window.confirm(
          `你目前有進行中的遊戲，重玩「${scenarioTitle}」將會結束它。確定嗎？`,
        );
        if (ok) {
          await handleClick(true);
        }
        return;
      }
      router.push("/play?replay=1");
    } catch {
      setLoading(false);
      window.alert("重玩失敗，請稍後再試。");
    }
  }

  return (
    <button
      onClick={() => handleClick()}
      disabled={loading}
      style={{ ...btnStyle, background: loading ? "#555" : "#1a1a1a", cursor: loading ? "not-allowed" : "pointer" }}
    >
      {loading ? "載入中…" : "重玩這一關"}
    </button>
  );
}
