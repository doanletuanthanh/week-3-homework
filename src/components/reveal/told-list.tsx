import { CheckIcon } from "@/components/icons";
import type { BrowserReveal } from "@/engine/seal";
import { TurnRef } from "./turn-ref";

/** Màn 6 item 3: what the persona told, each with the turn it was told in. */
export function ToldList({ items }: { items: BrowserReveal["toldItems"] }) {
  return (
    <section className="card reveal-list" aria-labelledby="told-title">
      <div className="sec-h">
        <h2 id="told-title" className="headline-sm">
          Đã kể
        </h2>
        <span className="pill pill-green">{items.length}</span>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.turn + item.content} className="li">
            <span className="check">
              <CheckIcon size={12} />
            </span>
            <span className="body-md li-text">{item.content}</span>
            <TurnRef turn={item.turn} />
          </li>
        ))}
      </ul>
    </section>
  );
}
