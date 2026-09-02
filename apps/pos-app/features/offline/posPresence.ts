import { supabase } from "../../services/supabase";
import { getIsConnected, onConnectivityChange } from "./networkStatus";

let channel: ReturnType<typeof supabase.channel> | null = null;

function join(chanName: string) {
  if (channel) return;
  channel = supabase.channel(chanName, { config: { presence: { key: "pos" } } });
  channel
    .on("presence", { event: "sync" }, () => {})
    .subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel?.track({ online: true });
      }
    });
}

function leave() {
  if (!channel) return;
  void supabase.removeChannel(channel);
  channel = null;
}

export function startPresence(workspaceId: string): () => void {
  const chanName = `pos-terminals:${workspaceId}`;

  if (getIsConnected()) join(chanName);

  function onConnected() { join(chanName); }
  function onDisconnected() { leave(); }

  const connectivityHandlers: Record<string, () => void> = { true: onConnected, false: onDisconnected };
  const unsub = onConnectivityChange((isConnected) => {
    connectivityHandlers[String(isConnected)]();
  });

  return () => { leave(); unsub(); };
}
