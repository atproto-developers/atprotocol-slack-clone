"use client";

import { useEffect, useState } from "react";
import { connectDms, disconnectDms, restoreDmSession, type DmConfig } from "@/dm/browser-session";

export type DmConnectProps = { did: string; dmConfig: DmConfig };

export function DmConnect({ did, dmConfig }: DmConnectProps) {
  const [connectedDid, setConnectedDid] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    restoreDmSession(did, dmConfig)
      .then((session) => { if (!cancelled) setConnectedDid(session?.did ?? null); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not restore the direct-message session."); });
    return () => { cancelled = true; };
  }, [did, dmConfig]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await connectDms(did, dmConfig);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not connect direct messages.");
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectDms(dmConfig);
      setConnectedDid(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect direct messages.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="channel-nav">
      <div className="section-label"><span>DIRECT MESSAGES</span></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {connectedDid ? (
        <button className="sidebar-action" disabled={busy} onClick={() => void disconnect()}>
          <span>◈</span> {connectedDid.slice(0, 17)}… connected
        </button>
      ) : (
        <button className="sidebar-action" disabled={busy} onClick={() => void connect()}>
          <span>+</span> Connect direct messages
        </button>
      )}
    </div>
  );
}
