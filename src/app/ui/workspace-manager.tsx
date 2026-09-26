"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LogoutButton } from "./logout-button";
import type { WorkspaceCandidate, WorkspaceSummary } from "@/workspaces/read-model";

type Message = { uri: string; rkey: string; repo: string; value: { text?: string; createdAt?: string; parent?: string }; reactions?: Array<{ emoji: string; count: number; active: boolean }> };
type Reaction = { repo: string; value: { subject?: string; emoji?: string } };
type InboxRequest = { uri: string; repoDid: string; channelSkey: string; channelName: string; requestId: string; createdAt: string };
type ChannelSelection = { workspace: string; skey: string; name: string; visibility: string };
type PendingOperation = { workspace: string; operationId: string; request: Record<string, unknown> };
type StalledOperation = { actor: string; operationId: string; state: string; error: string | null; updatedAt: string };
type RefreshSelectedChannel = (selected: ChannelSelection, reloadContent?: boolean) => Promise<void>;

export function WorkspaceManager({ did }: { did: string }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [workspaceCandidates, setWorkspaceCandidates] = useState<WorkspaceCandidate[]>([]);
  const [inboxLoaded, setInboxLoaded] = useState(false);
  const [inboxPermissionMissing, setInboxPermissionMissing] = useState(false);
  const [activeUri, setActiveUri] = useState("");
  const [activeChannel, setActiveChannel] = useState<ChannelSelection | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceOperationId, setWorkspaceOperationId] = useState("");
  const [inviteUri, setInviteUri] = useState("");
  const [inviteDid, setInviteDid] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelVisibility, setChannelVisibility] = useState<"public" | "private">("public");
  const [privateMembers, setPrivateMembers] = useState("");
  const [transitionMembers, setTransitionMembers] = useState("");
  const [messageText, setMessageText] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [inbox, setInbox] = useState<InboxRequest[]>([]);
  const [stalledOperations, setStalledOperations] = useState<StalledOperation[]>([]);
  const [stalledOperationsTruncated, setStalledOperationsTruncated] = useState(false);
  const [privateRoster, setPrivateRoster] = useState<string[]>([]);
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [needOperatorLeave, setNeedOperatorLeave] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<PendingOperation | null>(null);
  const [operatorReady, setOperatorReady] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [needChannelRead, setNeedChannelRead] = useState(false);
  const [needChannelWrite, setNeedChannelWrite] = useState(false);
  const [needJoinWrite, setNeedJoinWrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const channelDataEpoch = useRef(0);
  const operatorDataEpoch = useRef(0);
  const workspaceRefreshEpoch = useRef(0);
  const activeUriRef = useRef(activeUri);
  const activeChannelRef = useRef<ChannelSelection | null>(null);
  const refreshSelectedChannelRef = useRef<RefreshSelectedChannel | null>(null);
  const inboxPermissionMissingRef = useRef(false);
  const inboxRequestInFlightRef = useRef(false);

  const activeWorkspace = useMemo(() => workspaces.find((workspace) => workspace.uri === activeUri) ?? null, [activeUri, workspaces]);
  const workspaceDegraded = Boolean(activeWorkspace?.degradedReasons.length);

  const selectWorkspace = useCallback((uri: string) => {
    operatorDataEpoch.current += 1;
    inboxPermissionMissingRef.current = false;
    setInboxLoaded(false);
    setInboxPermissionMissing(false);
    activeUriRef.current = uri;
    setActiveUri(uri);
    setInbox([]);
    setStalledOperations([]);
  }, []);

  const selectChannel = useCallback((channel: ChannelSelection | null) => {
    activeChannelRef.current = channel;
    setActiveChannel(channel);
  }, []);

  const clearChannelView = useCallback(() => {
    channelDataEpoch.current += 1;
    activeChannelRef.current = null;
    setActiveChannel(null); setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setReplyTo("");
    setMessageText("");
    setNeedChannelRead(false); setNeedChannelWrite(false); setNeedJoinWrite(false); setRequestSubmitted(false);
  }, []);

  const handleChannelReadFailure = useCallback((caught: unknown) => {
    const statusCode = httpStatus(caught);
    if (statusCode !== 401 && statusCode !== 403 && statusCode !== 409) return false;
    channelDataEpoch.current += 1;
    setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setReplyTo(""); setMessageText("");
    setNeedChannelWrite(false); setNeedJoinWrite(false); setRequestSubmitted(false);
    setNeedChannelRead(statusCode === 401 || statusCode === 403);
    const selected = activeChannelRef.current;
    if (selected) void refreshSelectedChannelRef.current?.(selected, false).catch((error) => setError(messageOf(error)));
    return true;
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    const requestEpoch = ++workspaceRefreshEpoch.current;
    operatorDataEpoch.current += 1;
    try {
      const result = await api<{ workspaces: WorkspaceSummary[]; candidates: WorkspaceCandidate[] }>("/api/workspaces");
      if (workspaceRefreshEpoch.current !== requestEpoch) return null;
      setWorkspaceCandidates(result.candidates);
      const current = activeUriRef.current;
      const selectedStillExists = current !== "" && result.workspaces.some((workspace) => workspace.uri === current);
      setWorkspaces(result.workspaces);
      if (!selectedStillExists) {
        const fallback = result.workspaces[0]?.uri ?? "";
        selectWorkspace(fallback);
        clearChannelView();
        setInbox([]); setStalledOperations([]);
      } else {
        const selectedChannel = activeChannelRef.current;
        if (selectedChannel?.workspace === current) {
          const workspace = result.workspaces.find((entry) => entry.uri === current);
          const channel = workspace?.channels.find((entry) => entry.skey === selectedChannel.skey);
          if (!channel) clearChannelView();
          else if (channel.visibility !== selectedChannel.visibility) {
            channelDataEpoch.current += 1;
            selectChannel({ ...selectedChannel, name: channel.name, visibility: channel.visibility });
            setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setReplyTo(""); setMessageText("");
            setNeedChannelRead(false); setNeedChannelWrite(false); setNeedJoinWrite(false); setRequestSubmitted(false);
            if (channel.visibility === "transitioning") setStatus("This channel is transitioning. Sync and posting are paused until its access changes finish.");
          } else if (channel.name !== selectedChannel.name) selectChannel({ ...selectedChannel, name: channel.name });
        }
        if (!result.workspaces.find((workspace) => workspace.uri === current)?.isAdmin) {
          setInbox([]);
          setStalledOperations([]);
        }
      }
      return result.workspaces;
    } catch (caught) {
      if (workspaceRefreshEpoch.current !== requestEpoch) return null;
      setWorkspaces([]);
      setWorkspaceCandidates([]);
      selectWorkspace("");
      clearChannelView();
      setInbox([]); setStalledOperations([]);
      throw caught;
    }
  }, [clearChannelView, selectChannel, selectWorkspace]);

  const loadMessages = useCallback(async (channel: ChannelSelection, offset = 0, append = false) => {
    const selectedChannel = activeChannelRef.current;
    if (!selectedChannel || selectedChannel.workspace !== channel.workspace || selectedChannel.skey !== channel.skey) return false;
    const requestEpoch = channelDataEpoch.current;
    const query = new URLSearchParams({ workspace: channel.workspace, skey: channel.skey, offset: String(offset) });
    let result: { messages: Array<Omit<Message, "reactions">>; reactions: Reaction[]; nextOffset: number; hasMore: boolean; degraded: boolean; degradedReasons?: string[] };
    try {
      result = await api(`/api/channels/messages?${query}`);
    } catch (caught) {
      if (channelDataEpoch.current === requestEpoch) handleChannelReadFailure(caught);
      throw caught;
    }
    if (channelDataEpoch.current !== requestEpoch) return false;
    const grouped = new Map<string, Map<string, { count: number; active: boolean }>>();
    for (const reaction of result.reactions) {
      if (typeof reaction.value.subject !== "string" || typeof reaction.value.emoji !== "string") continue;
      const emojis = grouped.get(reaction.value.subject) ?? new Map<string, { count: number; active: boolean }>();
      const current = emojis.get(reaction.value.emoji) ?? { count: 0, active: false };
      current.count += 1;
      if (reaction.repo === did) current.active = true;
      emojis.set(reaction.value.emoji, current);
      grouped.set(reaction.value.subject, emojis);
    }
    const messages = result.messages.map((message) => ({
      ...message,
      reactions: [...(grouped.get(message.uri) ?? new Map()).entries()].map(([emoji, value]) => ({ emoji, ...value })),
    }));
    setMessages((current) => {
      const combined = append ? [...current, ...messages] : messages;
      const unique = new Map(combined.map((message) => [message.uri, message]));
      return [...unique.values()].sort((a, b) => b.rkey.localeCompare(a.rkey));
    });
    setNextOffset(result.nextOffset);
    setHasMore(result.hasMore);
    setNeedChannelRead(false);
    if (result.degraded) setStatus(`${(result.degradedReasons ?? ["Channel history exceeded its sync limit."]).join(" ")} Older records need operator review.`);
    else setStatus("");
    return true;
  }, [did, handleChannelReadFailure]);

  const refreshPrivateRoster = useCallback(async (channel: ChannelSelection) => {
    const selectedChannel = activeChannelRef.current;
    if (!selectedChannel || selectedChannel.workspace !== channel.workspace || selectedChannel.skey !== channel.skey) return;
    const requestEpoch = channelDataEpoch.current;
    const query = new URLSearchParams({ workspace: channel.workspace, skey: channel.skey });
    let result: { members: string[] };
    try {
      result = await api(`/api/channels/roster?${query}`);
    } catch (caught) {
      if (channelDataEpoch.current === requestEpoch) handleChannelReadFailure(caught);
      throw caught;
    }
    if (channelDataEpoch.current !== requestEpoch) return;
    setPrivateRoster(result.members);
  }, [handleChannelReadFailure]);

  const refreshSelectedChannel = useCallback(async (requested: ChannelSelection, reloadContent = true) => {
    const selected = activeChannelRef.current;
    if (!selected || selected.workspace !== requested.workspace || selected.skey !== requested.skey || activeUriRef.current !== requested.workspace) return;
    const current = await refreshWorkspaces();
    if (!current) return;
    const latest = activeChannelRef.current;
    if (!latest || latest.workspace !== requested.workspace || latest.skey !== requested.skey || activeUriRef.current !== requested.workspace) return;
    const workspace = current.find((entry) => entry.uri === requested.workspace);
    const channel = workspace?.channels.find((entry) => entry.skey === requested.skey);
    if (!channel) { clearChannelView(); return; }
    const selection = { workspace: requested.workspace, skey: channel.skey, name: channel.name, visibility: channel.visibility };
    if (latest.name !== selection.name || latest.visibility !== selection.visibility) selectChannel(selection);
    const currentSelection = latest.name === selection.name && latest.visibility === selection.visibility ? latest : selection;
    channelDataEpoch.current += 1;
    if (channel.visibility === "transitioning") {
      setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setReplyTo(""); setMessageText("");
      setNeedChannelRead(false); setNeedChannelWrite(false); setNeedJoinWrite(false); setRequestSubmitted(false);
      setStatus("This channel is transitioning. Sync and posting are paused until its access changes finish.");
      return;
    }
    if (!reloadContent) return;
    if (channel.visibility !== "private") setPrivateRoster([]);
    void loadMessages(currentSelection).catch((caught) => {
      if (![401, 403, 409].includes(httpStatus(caught) ?? 0)) setError(messageOf(caught));
    });
    if (channel.visibility === "private") void refreshPrivateRoster(currentSelection).catch((caught) => {
      if (![401, 403, 409].includes(httpStatus(caught) ?? 0)) setError(messageOf(caught));
    });
  }, [clearChannelView, loadMessages, refreshPrivateRoster, refreshWorkspaces, selectChannel]);
  useEffect(() => { refreshSelectedChannelRef.current = refreshSelectedChannel; }, [refreshSelectedChannel]);

  const recheckChannelAfterAccessFailure = useCallback((caught: unknown) => {
    if (![401, 403, 409].includes(httpStatus(caught) ?? 0)) return;
    const selected = activeChannelRef.current;
    if (selected) void refreshSelectedChannel(selected, false).catch((error) => setError(messageOf(error)));
  }, [refreshSelectedChannel]);

  const acceptWorkspace = useCallback(async (workspace: string) => {
    setBusy(true);
    setError("");
    try {
      await api("/api/workspaces/accept", { method: "POST", body: JSON.stringify({ workspace }) });
      setStatus("Workspace invitation accepted. Loading shared records…");
      const current = await refreshWorkspaces();
      if (!current?.some((entry) => entry.uri === workspace)) return;
      selectWorkspace(workspace); clearChannelView();
      setInviteUri("");
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setBusy(false);
    }
  }, [clearChannelView, refreshWorkspaces, selectWorkspace]);

  const loadInbox = useCallback(async () => {
    if (!activeWorkspace || activeWorkspace.degradedReasons.length || inboxPermissionMissingRef.current || inboxRequestInFlightRef.current) return;
    const workspaceUri = activeWorkspace.uri;
    const requestEpoch = operatorDataEpoch.current;
    inboxRequestInFlightRef.current = true;
    try {
      const result = await api<{ requests: InboxRequest[] }>(`/api/inbox/requests?workspace=${encodeURIComponent(workspaceUri)}`);
      if (operatorDataEpoch.current !== requestEpoch || activeUriRef.current !== workspaceUri) return;
      setInbox(result.requests);
      setInboxLoaded(true);
      setInboxPermissionMissing(false);
      inboxPermissionMissingRef.current = false;
      setError("");
    } catch (caught) {
      if (operatorDataEpoch.current !== requestEpoch || activeUriRef.current !== workspaceUri) return;
      setInbox([]);
      setInboxLoaded(false);
      if (httpStatus(caught) === 401 || httpStatus(caught) === 403) {
        setInboxPermissionMissing(true);
        inboxPermissionMissingRef.current = true;
        setError("");
        return;
      }
      setError(messageOf(caught));
    } finally {
      inboxRequestInFlightRef.current = false;
    }
  }, [activeWorkspace]);

  const loadStalledOperations = useCallback(async () => {
    if (!activeWorkspace?.isAdmin) return;
    const workspaceUri = activeWorkspace.uri;
    const requestEpoch = operatorDataEpoch.current;
    try {
      const result = await api<{ operations: StalledOperation[]; truncated: boolean }>(`/api/operator/stalled?workspace=${encodeURIComponent(workspaceUri)}`);
      if (operatorDataEpoch.current !== requestEpoch || activeUriRef.current !== workspaceUri) return;
      setStalledOperations(result.operations);
      setStalledOperationsTruncated(result.truncated);
    } catch (caught) {
      if (operatorDataEpoch.current !== requestEpoch || activeUriRef.current !== workspaceUri) return;
      setStalledOperations([]);
      setStalledOperationsTruncated(false);
      setError(messageOf(caught));
    }
  }, [activeWorkspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshWorkspaces().catch((caught) => setError(messageOf(caught)));
      const savedName = sessionStorage.getItem("spaces.pendingWorkspaceName");
      if (savedName) { setWorkspaceName(savedName); sessionStorage.removeItem("spaces.pendingWorkspaceName"); }
      const savedOperationId = sessionStorage.getItem("spaces.pendingWorkspaceOperationId");
      if (savedOperationId) setWorkspaceOperationId(savedOperationId);
      const savedOperatorOperation = sessionStorage.getItem("spaces.pendingOperatorOperation");
      if (savedOperatorOperation) {
        try { setPendingOperation(JSON.parse(savedOperatorOperation) as PendingOperation); }
        catch { sessionStorage.removeItem("spaces.pendingOperatorOperation"); }
      }
      const pendingInvite = sessionStorage.getItem("spaces.pendingInvite");
      if (pendingInvite) { sessionStorage.removeItem("spaces.pendingInvite"); void acceptWorkspace(pendingInvite); }
      const pendingChannel = sessionStorage.getItem("spaces.pendingChannel");
      if (pendingChannel) {
        sessionStorage.removeItem("spaces.pendingChannel");
        try {
          const channel = JSON.parse(pendingChannel) as ChannelSelection;
          channelDataEpoch.current += 1;
          selectWorkspace(channel.workspace); selectChannel(channel);
          if (channel.visibility !== "transitioning") void loadMessages(channel).catch((caught) => setError(messageOf(caught)));
        } catch { setError("Could not restore the channel selection."); }
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptWorkspace, loadMessages, refreshWorkspaces, selectChannel, selectWorkspace]);

  useEffect(() => {
    if (!activeChannel) return;
    const timer = window.setInterval(() => {
      void refreshSelectedChannel(activeChannel).catch((caught) => setError(messageOf(caught)));
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [activeChannel, refreshSelectedChannel]);

  useEffect(() => {
    if (!activeWorkspace?.isAdmin) return;
    const timer = window.setTimeout(() => { void loadInbox(); void loadStalledOperations(); }, 0);
    const interval = window.setInterval(() => { void loadInbox(); void loadStalledOperations(); }, 60_000);
    const query = new URLSearchParams({ workspace: activeWorkspace.uri, inbox: "1", after: "0" });
    const events = new EventSource(`/api/notifications?${query}`);
    events.addEventListener("change", () => void loadInbox());
    events.addEventListener("error", () => void loadInbox());
    return () => { window.clearTimeout(timer); window.clearInterval(interval); events.close(); };
  }, [activeWorkspace?.uri, activeWorkspace?.isAdmin, loadInbox, loadStalledOperations]);

  useEffect(() => {
    if (!activeWorkspace?.isAdmin || activeWorkspace.degradedReasons.length || !operatorReady) return;
    const reconcile = () => {
      void api<{ operation: { state: string; error?: string } }>("/api/operator/reconcile", {
        method: "POST", body: JSON.stringify({ workspace: activeWorkspace.uri }),
      }).then((result) => {
        if (result.operation.state !== "completed") setStatus(`Workspace reconciliation is ${result.operation.state}.${result.operation.error ? ` ${result.operation.error}` : ""}`);
      }).catch((caught) => setError(messageOf(caught)));
    };
    const timer = window.setTimeout(reconcile, 0);
    const interval = window.setInterval(reconcile, 300_000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [activeWorkspace?.uri, activeWorkspace?.isAdmin, activeWorkspace?.degradedReasons.length, operatorReady]);

  useEffect(() => {
    if (!activeChannel) {
      if (!activeWorkspace?.uri) return;
      const workspaceUri = activeWorkspace.uri;
      const query = new URLSearchParams({ workspace: workspaceUri, after: "0" });
      const events = new EventSource(`/api/notifications?${query}`);
      const refresh = () => {
        if (activeUriRef.current !== workspaceUri) return;
        void refreshWorkspaces().catch((caught) => setError(messageOf(caught)));
      };
      events.addEventListener("change", refresh);
      events.addEventListener("error", refresh);
      const interval = window.setInterval(refresh, 60_000);
      return () => { window.clearInterval(interval); events.close(); };
    }
    const workspaceQuery = new URLSearchParams({ workspace: activeChannel.workspace, after: "0" });
    const channelQuery = new URLSearchParams({ workspace: activeChannel.workspace, skey: activeChannel.skey, after: "0" });
    const channelEvents = activeChannel.visibility === "transitioning" ? null : new EventSource(`/api/notifications?${channelQuery}`);
    const workspaceEvents = new EventSource(`/api/notifications?${workspaceQuery}`);
    const refresh = () => {
      void refreshSelectedChannel(activeChannel).catch((caught) => setError(messageOf(caught)));
    };
    channelEvents?.addEventListener("change", refresh);
    channelEvents?.addEventListener("error", refresh);
    workspaceEvents.addEventListener("change", refresh);
    workspaceEvents.addEventListener("error", refresh);
    return () => { channelEvents?.close(); workspaceEvents.close(); };
  }, [activeChannel, activeWorkspace?.uri, refreshSelectedChannel, refreshWorkspaces]);

  async function grant(action: string, workspaceUri?: string, skey?: string) {
    const ref = workspaceUri ? parseWorkspaceUri(workspaceUri) : null;
    const response = await api<{ redirectUrl: string }>("/api/oauth/permission", {
      method: "POST",
      body: JSON.stringify({ action, workspaceDid: ref?.authorityDid ?? did, ...(ref ? { workspaceSkey: ref.skey } : {}), ...(skey ? { skey } : {}) }),
    });
    window.location.assign(response.redirectUrl);
  }

  async function createWorkspace(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setStatus("Creating protocol spaces and authority records…");
    try {
      const operationId = workspaceOperationId || makeTid();
      sessionStorage.setItem("spaces.pendingWorkspaceOperationId", operationId);
      const result = await api<{ workspace: string; state: string; completedSteps: string[]; error?: string }>("/api/workspaces/bootstrap", {
        method: "POST", body: JSON.stringify({ name: workspaceName, operationId }),
      });
      const current = await refreshWorkspaces();
      if (current?.some((entry) => entry.uri === result.workspace)) {
        selectWorkspace(result.workspace); clearChannelView();
      }
      if (result.state === "completed") {
        sessionStorage.removeItem("spaces.pendingWorkspaceOperationId");
        setWorkspaceOperationId("");
        setStatus("Workspace created on AT Protocol.");
      } else setStatus(`Setup is pending after ${result.completedSteps.length} steps.${result.error ? ` ${result.error}` : ""} Retry to resume.`);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(false); }
  }

  async function beginAccept(event: FormEvent) {
    event.preventDefault();
    const ref = parseWorkspaceUri(inviteUri);
    if (!ref) { setError("Paste a workspace URI in the form at://DID/space/org.slack.workspace/key."); return; }
    sessionStorage.setItem("spaces.pendingInvite", inviteUri.trim());
    try { await grant("joinWorkspace", inviteUri.trim()); }
    catch (caught) { sessionStorage.removeItem("spaces.pendingInvite"); setError(messageOf(caught)); }
  }

  async function runOperation(request: Record<string, unknown>, workspace = activeWorkspace?.uri, operationId = makeTid()) {
    if (!workspace) return;
    if (activeWorkspace?.uri === workspace && activeWorkspace.degradedReasons.length) {
      setError(`Workspace mutations are paused in degraded mode. ${activeWorkspace.degradedReasons.join(" ")}`);
      return;
    }
    const pending = { workspace, operationId, request };
    setPendingOperation(pending);
    sessionStorage.setItem("spaces.pendingOperatorOperation", JSON.stringify(pending));
    setBusy(true); setError(""); setStatus("Submitting workspace operation…");
    try {
      const result = await api<{ operation: { state: string; completedSteps: string[]; operationId: string; error?: string } }>("/api/operator/execute", {
        method: "POST", body: JSON.stringify(pending),
      });
      const operation = result.operation;
      setOperatorReady(true);
      setStatus(`Operation ${operation.state}; ${operation.completedSteps.length} steps recorded.${operation.error ? ` ${operation.error}` : ""}`);
      if (operation.state === "completed" || operation.state === "failed") {
        setPendingOperation(null);
        sessionStorage.removeItem("spaces.pendingOperatorOperation");
      }
      const currentWorkspaces = await refreshWorkspaces();
      const refreshedWorkspace = currentWorkspaces?.find((entry) => entry.uri === workspace);
      if (request.kind === "leaveChannel" && operation.state === "completed") {
        clearChannelView(); setNeedOperatorLeave(false);
      } else if (currentWorkspaces && activeChannel?.workspace === workspace) {
        const selectionEpoch = ++channelDataEpoch.current;
        const refreshedChannel = refreshedWorkspace?.channels.find((entry) => entry.skey === activeChannel.skey);
        if (!refreshedChannel) {
          clearChannelView();
        }
        else {
          const selection = { workspace, skey: refreshedChannel.skey, name: refreshedChannel.name, visibility: refreshedChannel.visibility };
          selectChannel(selection);
          if (refreshedChannel.visibility === "transitioning") {
            setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setNeedChannelRead(false);
            setStatus("This channel is transitioning. Sync and posting are paused until its access changes finish.");
          } else {
            if (refreshedChannel.visibility === "private") {
              await refreshPrivateRoster(selection).catch((caught) => {
                if (![401, 403, 409].includes(httpStatus(caught) ?? 0)) setError(messageOf(caught));
              });
            } else setPrivateRoster([]);
            if (channelDataEpoch.current !== selectionEpoch) return;
            await loadMessages(selection).catch((caught) => {
              if (![401, 403, 409].includes(httpStatus(caught) ?? 0)) setError(messageOf(caught));
            });
          }
        }
      }
    } catch (caught) {
      const statusCode = httpStatus(caught);
      if (request.kind === "leaveWorkspace" || request.kind === "leaveChannel") setNeedOperatorLeave(true);
      setError(statusCode === 401 || statusCode === 403
        ? `${messageOf(caught)} If this is the first admin action, grant the operator method permission below and retry.`
        : messageOf(caught));
    } finally { setBusy(false); }
  }

  async function openChannel(channel: WorkspaceSummary["channels"][number]) {
    if (!activeWorkspace) return;
    const selected = { workspace: activeWorkspace.uri, skey: channel.skey, name: channel.name, visibility: channel.visibility };
    channelDataEpoch.current += 1;
    selectChannel(selected); setMessages([]); setPrivateRoster([]); setHasMore(false); setNextOffset(0); setReplyTo(""); setMessageText(""); setRequestSubmitted(false); setNeedChannelRead(false); setNeedChannelWrite(false); setError("");
    try {
      if (selected.visibility === "transitioning") {
        setStatus("This channel is transitioning. Sync and posting are paused until its access changes finish.");
        return;
      }
      if (!await loadMessages(selected)) return;
      if (selected.visibility === "private") await refreshPrivateRoster(selected);
    }
    catch (caught) {
      setError(messageOf(caught));
      if (httpStatus(caught) === 403 || httpStatus(caught) === 401) setNeedChannelRead(true);
    }
  }

  async function authorizeCurrentChannel(action: string) {
    if (!activeChannel || !activeWorkspace) return;
    sessionStorage.setItem("spaces.pendingChannel", JSON.stringify(activeChannel));
    try { await grant(action, activeWorkspace.uri, activeChannel.skey); }
    catch (caught) { sessionStorage.removeItem("spaces.pendingChannel"); setError(messageOf(caught)); }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!activeChannel || activeChannel.visibility === "transitioning" || !messageText.trim()) return;
    setBusy(true); setError("");
    try {
      await api("/api/channels/messages/write", { method: "POST", body: JSON.stringify({
        workspace: activeChannel.workspace, skey: activeChannel.skey, action: "create", text: messageText, ...(replyTo ? { parent: replyTo } : {}),
      }) });
      setMessageText(""); setReplyTo("");
      await loadMessages(activeChannel);
    } catch (caught) {
      setError(messageOf(caught));
      if (httpStatus(caught) === 401 || httpStatus(caught) === 403) setNeedChannelWrite(true);
      recheckChannelAfterAccessFailure(caught);
    } finally { setBusy(false); }
  }

  async function requestPrivateAccess(withdraw = false) {
    if (!activeChannel || activeChannel.visibility === "transitioning") return;
    try {
      await api("/api/channels/requests", { method: "POST", body: JSON.stringify({ workspace: activeChannel.workspace, skey: activeChannel.skey, ...(withdraw ? { action: "withdraw" } : {}) }) });
      setRequestSubmitted(!withdraw);
      setStatus(withdraw ? "Your private-channel request was withdrawn." : "Your access request is in the workspace inbox.");
      setNeedJoinWrite(false);
    } catch (caught) {
      setError(messageOf(caught));
      if (httpStatus(caught) === 401 || httpStatus(caught) === 403) setNeedJoinWrite(true);
      recheckChannelAfterAccessFailure(caught);
    }
  }

  async function leaveWorkspace() {
    if (!activeWorkspace || did === activeWorkspace.authorityDid) return;
    await runOperation({ kind: "leaveWorkspace" });
  }

  async function leaveChannel() {
    if (!activeChannel) return;
    await runOperation({ kind: "leaveChannel", skey: activeChannel.skey });
  }

  return (
    <main className="app-frame">
      <aside className="sidebar">
        <div className="sidebar-top"><span className="brand brand-inverse"><span className="brand-mark"><i /><i /><i /></span><span>spaces</span></span><button className="icon-button sidebar-menu" aria-label="Open menu">☰</button></div>
        <div className="workspace-heading"><span className="workspace-avatar">{activeWorkspace?.name.slice(0, 1).toUpperCase() ?? "S"}</span><span className="workspace-title"><strong>{activeWorkspace?.name ?? "Your spaces"}</strong><small>{activeWorkspace ? "AT Protocol workspace" : "Personal workspace"}</small></span></div>
        <div className="sidebar-section">
          <div className="section-label"><span>WORKSPACES</span><button className="plus-button" aria-label="Create workspace" onClick={() => { selectWorkspace(""); clearChannelView(); setInbox([]); setStalledOperations([]); }}>+</button></div>
          {workspaces.length ? workspaces.map((workspace) => <button key={workspace.uri} className={`sidebar-action ${workspace.uri === activeUri ? "selected-workspace" : ""}`} onClick={() => { selectWorkspace(workspace.uri); clearChannelView(); setInbox([]); setStalledOperations([]); }}><span>◈</span> {workspace.name}</button>) : <div className="empty-workspaces"><span className="empty-icon">⌂</span><p>No workspaces yet</p><span>Start a space for your team</span></div>}
          {workspaceCandidates.length > 0 && <div className="channel-nav"><div className="section-label"><span>ACCEPTED · NEEDS ACCESS</span></div>{workspaceCandidates.map((candidate) => <button key={candidate.uri} className="sidebar-action" title={candidate.uri} aria-label={`Authorize reading accepted workspace ${candidate.uri}`} onClick={() => void grant("workspaceRead", candidate.uri).catch((caught) => setError(messageOf(caught)))}><span>↗</span> {candidate.skey}</button>)}</div>}
          {activeWorkspace && <div className="channel-nav"><div className="section-label"><span>CHANNELS</span></div>{activeWorkspace.channels.map((channel) => <button key={channel.skey} className={`channel-nav-item ${activeChannel?.skey === channel.skey ? "active" : ""}`} onClick={() => void openChannel(channel)}><span>{channel.visibility === "private" ? "▣" : "#"}</span>{channel.name}</button>)}</div>}
        </div>
        <div className="sidebar-bottom"><div className="connection-state"><span className="connection-dot" /> CONNECTED TO ATPROTO</div><div className="profile-row"><span className="profile-avatar">{did.slice(-1).toUpperCase()}</span><span className="profile-copy"><strong>{did.slice(0, 17)}…</strong><small>Signed in</small></span><LogoutButton /></div></div>
      </aside>
      <section className="main-stage">
        <header className="topbar"><div className="breadcrumb">Your spaces <span>/</span> <strong>{activeChannel?.name ?? activeWorkspace?.name ?? "Overview"}</strong></div><div className="topbar-tools"><button className="help-button" onClick={() => void refreshWorkspaces().catch((caught) => setError(messageOf(caught)))}>↻ <span>Refresh</span></button><button className="top-avatar">{did.slice(-1).toUpperCase()}</button></div></header>
        <div className="overview-content">
          {error && <p className="form-error" role="alert">{error}</p>}
          {status && !(activeChannel?.visibility === "transitioning" && status === "This channel is transitioning. Sync and posting are paused until its access changes finish.") && <p className="status-note" role="status">{status}</p>}
          {activeWorkspace && activeWorkspace.degradedReasons.length > 0 && <div className="envelope-alert" role="alert"><strong>Workspace is in degraded mode.</strong><ul>{activeWorkspace.degradedReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p>Admin changes and inbox reconciliation are paused until the workspace is within the supported v1 limits.</p></div>}
          {pendingOperation && <p className="status-note">Operation {pendingOperation.operationId} is still pending. <button className="text-button" disabled={busy || workspaceDegraded} onClick={() => void runOperation(pendingOperation.request, pendingOperation.workspace, pendingOperation.operationId)}>Retry same operation ↻</button></p>}
          {stalledOperations.length > 0 && <div className="operation-alert" role="alert"><strong>{stalledOperations.length} operation(s) have had no progress for at least five minutes.{stalledOperationsTruncated ? " Showing the oldest 100; more stalled operations exist." : ""}</strong>{stalledOperations.map((operation) => <p key={`${operation.actor}:${operation.operationId}`}>{operation.operationId} · {operation.actor} · {operation.error ?? operation.state}</p>)}</div>}
          {!activeWorkspace && <>
            <div className="welcome-banner"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR TEAM, YOUR SPACE</div><h1>Make room for<br /><em>great work.</em></h1><p>Create a shared workspace or accept an invitation.</p></div><div className="banner-illustration" aria-hidden="true"><div className="orb orb-large" /><div className="orb orb-small" /><div className="banner-card banner-card-main"><div className="banner-card-top"><span className="mini-avatar avatar-lilac">S</span><span><b>general</b><small># your first channel</small></span><span className="card-check">✓</span></div><div className="banner-card-lines"><i /><i /><i /></div></div></div></div>
            <div id="workspace-setup" className="starter-card setup-panel"><h2>Create a workspace</h2><p>Sign in with the dedicated workspace identity that will own its spaces and authority records.</p>
              <button className="text-button" type="button" onClick={() => { sessionStorage.setItem("spaces.pendingWorkspaceName", workspaceName); void grant("workspaceAuthority"); }}>Authorize workspace setup</button>
              <form className="inline-form" onSubmit={createWorkspace}><label htmlFor="workspace-name">Workspace name</label><input id="workspace-name" value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} required maxLength={60} /><button className="primary-button" disabled={busy}>Create workspace</button></form>
            </div>
            <div className="starter-card setup-panel"><h2>Accept an invitation</h2><p>Paste the workspace URI shared by an admin. Membership remains enforced by the PDS.</p><form className="inline-form" onSubmit={beginAccept}><label htmlFor="workspace-uri">Workspace URI</label><input id="workspace-uri" value={inviteUri} onChange={(event) => setInviteUri(event.target.value)} placeholder="at://did:.../space/org.slack.workspace/key" required /><button className="primary-button" disabled={busy}>Connect invitation</button></form></div>
          </>}
          {activeWorkspace && (!activeChannel || activeChannel.workspace !== activeUri) && <>
            <div className="welcome-banner"><div><div className="eyebrow"><span className="eyebrow-line" /> WORKSPACE HOME</div><h1>{activeWorkspace.name}</h1><p>{activeWorkspace.members.length} active members · {activeWorkspace.channels.length} channels</p><p className="mono-note">{activeWorkspace.uri}</p><button className="text-button" onClick={() => void navigator.clipboard.writeText(activeWorkspace.uri).then(() => setStatus("Workspace URI copied."), () => setError("Could not copy the workspace URI."))}>Copy workspace URI</button></div><div className="banner-illustration"><div className="banner-card banner-card-main"><b>Workspace data</b><p>Authority: {activeWorkspace.authorityDid}</p><p>Directory and membership are read from AT Protocol spaces.</p></div></div></div>
            {activeWorkspace.isAdmin && <><div className="section-heading"><div><span className="eyebrow">GETTING STARTED</span><h2>Workspace controls</h2></div></div>
            <div className="starter-grid"><article className="starter-card"><span className="starter-icon icon-violet">＋</span><h3>Invite a member</h3><p>Add their DID to workspace, inbox, and public-channel membership.</p><form onSubmit={(event) => { event.preventDefault(); void runOperation({ kind: "inviteMember", subject: inviteDid }); setInviteDid(""); }}><input aria-label="Member DID" value={inviteDid} onChange={(event) => setInviteDid(event.target.value)} placeholder="did:plc:…" required /><button className="text-button" disabled={busy || workspaceDegraded}>Invite member →</button></form></article>
              <article className="starter-card"><span className="starter-icon icon-mint">#</span><h3>Create a channel</h3><p>Membership is applied before the directory entry becomes visible.</p><form onSubmit={(event) => { event.preventDefault(); const skey = `${toSlug(channelName)}-${makeShortId()}`; const members = privateMembers.split(/[\s,]+/).filter(Boolean); void runOperation({ kind: "createChannel", skey, name: channelName, visibility: channelVisibility, ...(channelVisibility === "private" ? { members } : {}) }); setChannelName(""); }}><input aria-label="Channel name" value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="project-room" required /><select aria-label="Channel visibility" value={channelVisibility} onChange={(event) => setChannelVisibility(event.target.value as "public" | "private")}><option value="public">Public</option><option value="private">Private</option></select>{channelVisibility === "private" && <input aria-label="Private member DIDs" value={privateMembers} onChange={(event) => setPrivateMembers(event.target.value)} placeholder="Member DIDs, comma separated" /> }<button className="text-button" disabled={busy || workspaceDegraded}>Create channel →</button></form></article>
              <article className="starter-card"><span className="starter-icon icon-peach">⚙</span><h3>Operator permissions</h3><p>Grant this admin identity the exact XRPC method scopes used for workspace changes.</p><button className="text-button" type="button" disabled={workspaceDegraded} onClick={() => void grant("operatorAdmin", activeWorkspace.uri)}>Grant admin controls →</button></article></div></>}
            {did !== activeWorkspace.authorityDid && <div className="starter-card lifecycle-card"><h3>Leave workspace</h3><p>Leaving removes your workspace, inbox, public-channel, and private-channel memberships.</p><button className="text-button danger" disabled={busy || workspaceDegraded} onClick={() => void leaveWorkspace()}>Leave this workspace</button>{needOperatorLeave && <button className="text-button" disabled={workspaceDegraded} onClick={() => void grant("operatorLeave", activeWorkspace.uri)}>Authorize leave control →</button>}</div>}
            {activeWorkspace.isAdmin && <>
              <div className="section-heading"><div><span className="eyebrow">MEMBERS</span><h2>Current workspace roster</h2></div></div>
              <div className="starter-card roster-list">{activeWorkspace.members.map((member) => <div className="roster-row" key={member.did}><span>{member.did}</span>{member.did !== activeWorkspace.authorityDid && <div><button className="text-button" disabled={workspaceDegraded} onClick={() => void runOperation({ kind: "setAdmin", subject: member.did, active: !activeWorkspace.admins.includes(member.did) })}>{activeWorkspace.admins.includes(member.did) ? "Demote admin" : "Make admin"}</button><button className="text-button danger" disabled={workspaceDegraded} onClick={() => void runOperation({ kind: "removeMember", subject: member.did })}>Remove</button></div>}</div>)}</div>
              <div className="section-heading"><div><span className="eyebrow">PRIVATE CHANNEL INBOX</span><h2>Join requests</h2></div><button className="text-button" disabled={workspaceDegraded} onClick={() => { inboxPermissionMissingRef.current = false; setInboxPermissionMissing(false); setInboxLoaded(false); void loadInbox(); }}>Sync inbox ↻</button></div>
              <div className="starter-card roster-list">{inbox.length === 0 ? <p>{inboxPermissionMissing ? <>Grant operator controls to sync private-channel requests. <button className="text-button" onClick={() => void grant("operatorAdmin", activeWorkspace.uri)}>Grant admin controls →</button></> : inboxLoaded ? "No pending join requests." : "Inbox has not been synced yet."}</p> : inbox.map((joinRequest) => <div className="roster-row" key={joinRequest.uri}><span>{joinRequest.repoDid} requested #{joinRequest.channelName}</span><div><button className="text-button" onClick={() => void runOperation({ kind: "decideJoinRequest", request: joinRequest.uri, requestId: joinRequest.requestId, decision: "approve" })}>Approve</button><button className="text-button danger" onClick={() => void runOperation({ kind: "decideJoinRequest", request: joinRequest.uri, requestId: joinRequest.requestId, decision: "deny" })}>Deny</button></div></div>)}</div>
            </>}
          </>}
          {activeChannel?.workspace === activeUri && <>
            <div className="section-heading"><div><span className="eyebrow">{activeChannel.visibility === "transitioning" ? "CHANNEL TRANSITION" : activeChannel.visibility === "private" ? "PRIVATE CHANNEL" : "PUBLIC CHANNEL"}</span><h2>{activeChannel.visibility === "private" ? "▣" : "#"} {activeChannel.name}</h2></div><div><button className="text-button" disabled={activeChannel.visibility === "transitioning"} onClick={() => void loadMessages(activeChannel).catch((caught) => setError(messageOf(caught)))}>Sync ↻</button>{activeWorkspace?.isAdmin && activeChannel.visibility !== "transitioning" && <><button className="text-button" disabled={workspaceDegraded} onClick={() => { const members = transitionMembers.split(/[\s,]+/).filter(Boolean); void runOperation({ kind: "transitionChannel", skey: activeChannel.skey, visibility: activeChannel.visibility === "public" ? "private" : "public", ...(activeChannel.visibility === "public" ? { members: members.length ? members : activeWorkspace.members.map((member) => member.did) } : {}) }); }}>{activeChannel.visibility === "public" ? "Make private" : "Make public"}</button><button className="text-button danger" disabled={workspaceDegraded} onClick={() => void runOperation({ kind: "archiveChannel", skey: activeChannel.skey })}>Archive</button></>}</div></div>
            {activeChannel.visibility === "transitioning" && <p className="status-note">This channel is transitioning. Sync and posting are paused until its access changes finish.</p>}
            {activeChannel.visibility === "private" && privateRoster.length > 0 && <div className="starter-card private-roster"><strong>Active private channel members</strong><p>{privateRoster.join(" · ")}</p></div>}
            {activeWorkspace?.isAdmin && <label className="transition-members">Selected members when making this channel private<input value={transitionMembers} onChange={(event) => setTransitionMembers(event.target.value)} placeholder="DIDs separated by spaces or commas (blank keeps all)" /></label>}
            {activeChannel.visibility === "private" && privateRoster.includes(did) && did !== activeWorkspace?.authorityDid && <div className="channel-lifecycle"><button className="text-button danger" disabled={busy || workspaceDegraded} onClick={() => void leaveChannel()}>Leave private channel</button>{needOperatorLeave && <button className="text-button" disabled={workspaceDegraded} onClick={() => void grant("operatorLeave", activeChannel.workspace)}>Authorize leave control →</button>}</div>}
            {activeChannel.visibility === "private" && !privateRoster.includes(did) && <div className="starter-card permission-box"><p>You are not on this channel’s active roster.</p><button className="text-button" onClick={() => void requestPrivateAccess()}>{requestSubmitted ? "Update request →" : "Request private access →"}</button><button className="text-button danger" onClick={() => void requestPrivateAccess(true)}>Withdraw request</button></div>}
            {needChannelRead && <div className="starter-card permission-box"><p>Grant workspace/channel read scope. A private-channel PDS membership check still applies.</p><button className="text-button" onClick={() => void authorizeCurrentChannel("channelRead")}>Grant channel read →</button>{activeChannel.visibility === "private" && <button className="text-button" onClick={() => void requestPrivateAccess()}>Request private access →</button>}</div>}
            {needJoinWrite && <div className="starter-card permission-box"><p>Grant write-only inbox access to submit a private-channel request.</p><button className="text-button" onClick={() => void authorizeCurrentChannel("requestJoin")}>Grant request access →</button></div>}
            {needChannelWrite && <div className="starter-card permission-box"><p>Grant message/reaction write access for this channel.</p><button className="text-button" onClick={() => void authorizeCurrentChannel("channelWrite")}>Grant message posting →</button></div>}
            <div className="message-list">{messages.map((message) => <article className="message-card" key={message.uri}><div className="message-meta"><strong>{message.repo.slice(0, 20)}…</strong><time>{message.value.createdAt}</time></div><p>{message.value.text}</p>{message.value.parent && <small>Reply to {message.value.parent}</small>}<div className="message-actions"><button onClick={() => setReplyTo(message.uri)}>Reply</button>{(message.reactions ?? []).map((reaction) => <button className={reaction.active ? "reaction-active" : ""} key={reaction.emoji} onClick={() => void toggleReaction(message.uri, reaction.emoji, reaction.active)}>{reaction.emoji} {reaction.count}</button>)}{!(message.reactions ?? []).some((reaction) => reaction.emoji === "💜") && <button onClick={() => void toggleReaction(message.uri, "💜", false)}>💜 0</button>}{message.repo === did && <><button onClick={() => void editMessage(message)}>Edit</button><button onClick={() => void deleteMessage(message.uri)}>Delete</button></>}</div></article>)}</div>
            {hasMore && <button className="text-button load-older" onClick={() => void loadMessages(activeChannel, nextOffset, true).catch((caught) => setError(messageOf(caught)))}>Load older messages</button>}
            <form className="message-compose" onSubmit={sendMessage}>{replyTo && <p>Replying to {replyTo} <button type="button" onClick={() => setReplyTo("")}>Cancel</button></p>}<textarea disabled={activeChannel.visibility === "transitioning"} value={messageText} onChange={(event) => setMessageText(Array.from(event.target.value).slice(0, 10_000).join(""))} placeholder="Write a message…" required /><div><small>{Array.from(messageText).length}/10,000</small><button className="primary-button" disabled={busy || activeChannel.visibility === "transitioning"}>Send</button></div></form>
          </>}
          <div className="data-note"><span className="note-icon">◈</span><span><strong>Your conversations belong to you.</strong><small>Records remain in their authors’ AT Protocol accounts. Workspace access is enforced by PDS member lists.</small></span><a href="https://atproto.com" target="_blank" rel="noreferrer">How it works ↗</a></div>
        </div>
      </section>
    </main>
  );

  async function toggleReaction(subject: string, emoji: string, active: boolean) {
    if (!activeChannel || activeChannel.visibility === "transitioning") return;
    try {
      await api("/api/channels/reactions", { method: "POST", body: JSON.stringify({ workspace: activeChannel.workspace, skey: activeChannel.skey, subject, emoji, active: !active }) });
      await loadMessages(activeChannel);
    } catch (caught) { setError(messageOf(caught)); if (httpStatus(caught) === 403) setNeedChannelWrite(true); recheckChannelAfterAccessFailure(caught); }
  }

  async function editMessage(message: Message) {
    if (!activeChannel || activeChannel.visibility === "transitioning") return;
    const text = window.prompt("Edit message", message.value.text ?? "");
    if (text === null) return;
    try {
      await api("/api/channels/messages/write", { method: "POST", body: JSON.stringify({ workspace: activeChannel.workspace, skey: activeChannel.skey, action: "edit", uri: message.uri, text }) });
      await loadMessages(activeChannel);
    } catch (caught) { setError(messageOf(caught)); if (httpStatus(caught) === 403) setNeedChannelWrite(true); recheckChannelAfterAccessFailure(caught); }
  }

  async function deleteMessage(uri: string) {
    if (!activeChannel || activeChannel.visibility === "transitioning" || !window.confirm("Delete this message from your repo?")) return;
    try {
      await api("/api/channels/messages/write", { method: "POST", body: JSON.stringify({ workspace: activeChannel.workspace, skey: activeChannel.skey, action: "delete", uri }) });
      await loadMessages(activeChannel);
    } catch (caught) { setError(messageOf(caught)); recheckChannelAfterAccessFailure(caught); }
  }

}

async function api<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers }, cache: "no-store" });
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(response.status, body && typeof body.error === "string" ? body.error : `Request failed (${response.status}).`);
  return body as T;
}

class ApiError extends Error { constructor(readonly status: number, message: string) { super(message); } }
function httpStatus(error: unknown): number | undefined { return error instanceof ApiError ? error.status : undefined; }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : "Request failed."; }
function parseWorkspaceUri(uri: string): { authorityDid: string; skey: string } | null {
  const match = /^at:\/\/(did:[^/]+)\/space\/org\.slack\.workspace\/([A-Za-z0-9._~:-]{1,128})$/.exec(uri.trim());
  return match ? { authorityDid: match[1], skey: match[2] } : null;
}
function makeTid(): string {
  const random = new Uint16Array(1);
  crypto.getRandomValues(random);
  let value = (BigInt(Date.now()) * 1000n << 10n) | BigInt(random[0] & 1023);
  const alphabet = "234567abcdefghijklmnopqrstuvwxyz";
  let result = "";
  for (let index = 0; index < 13; index += 1) { result = alphabet[Number(value & 31n)] + result; value >>= 5n; }
  return result;
}
function makeShortId(): string { return makeTid().slice(-5); }
function toSlug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "channel"; }
