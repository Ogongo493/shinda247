const DATABASE_URL = process.env.FIREBASE_DATABASE_URL?.replace(/\/$/, "");

async function rtdbPut(path: string, data: unknown): Promise<void> {
  if (!DATABASE_URL) return;
  try {
    const res = await fetch(`${DATABASE_URL}${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[rtdb] PUT ${path} failed: ${res.status} ${text}`);
    }
  } catch (err) {
    console.warn(`[rtdb] PUT ${path} error:`, err);
  }
}

export async function writeGameState(payload: unknown): Promise<void> {
  await rtdbPut("/game/state", payload);
}
