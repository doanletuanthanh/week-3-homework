"use client";

import { createContext, useContext } from "react";

/** Opens the transcript drawer at a turn. Provided by the reveal screen. */
export const OpenTurnContext = createContext<(turn: number) => void>(() => {});

/** "Lượt N": the only way from the reveal into the transcript. */
export function TurnRef({ turn, lower }: { turn: number; lower?: boolean }) {
  const openTurn = useContext(OpenTurnContext);
  return (
    <button type="button" className="tref" onClick={() => openTurn(turn)}>
      {lower ? "lượt" : "Lượt"} {turn}
    </button>
  );
}
