/**
 * Real-time hub using Server-Sent Events (SSE) — free, no external service,
 * no polling needed on the client. Each authenticated member holds one stream.
 */
const clients = new Map(); // userId -> Set<res>

export function addClient(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  res.on('close', () => {
    const set = clients.get(userId);
    if (set) {
      set.delete(res);
      if (set.size === 0) clients.delete(userId);
    }
  });
}

export function sendToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set) return false;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch { /* client gone */ }
  }
  return true;
}

export function sendToUsers(userIds, event, data) {
  userIds.forEach((id) => sendToUser(id, event, data));
}

export function heartbeat() {
  for (const set of clients.values()) {
    for (const res of set) {
      try { res.write(': ping\n\n'); } catch { /* ignore */ }
    }
  }
}
