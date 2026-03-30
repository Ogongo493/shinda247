import { useState, useEffect } from "react";

export function usePlayerId() {
  const [playerId, setPlayerId] = useState<string>("");

  useEffect(() => {
    let id = localStorage.getItem("shinda_player_id");
    if (!id) {
      // Generate a random player ID if none exists
      id = "player-" + Math.random().toString(36).substring(2, 10);
      localStorage.setItem("shinda_player_id", id);
    }
    setPlayerId(id);
  }, []);

  return playerId;
}
