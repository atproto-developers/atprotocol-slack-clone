import { WorkspaceManager } from "./workspace-manager";

export function WorkspaceShell({ did }: { did: string }) {
  return <WorkspaceManager did={did} />;
}
