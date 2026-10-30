import { CheckIcon, ChevronDownIcon } from "@/components/icons";
import type { BrowserReveal } from "@/engine/seal";
import { CUSTOM_LABEL, TOLD_SUMMARY, fillTemplate } from "@/strings/product-strings";
import { TurnRef } from "./turn-ref";

/**
 * Màn 6: what the persona told, folded under one line with the count; opened, each item with the
 * turn it was told in. Not shown when nothing was told. `fictional` labels each item of a generated scenario.
 */
export function ToldList({ items, fictional = false }: { items: BrowserReveal["toldItems"]; fictional?: boolean }) {
  if (items.length === 0) return null;
  return (
    <section className="card reveal-list" aria-labelledby="told-title">
      <details className="told">
        <summary className="sec-h">
          <h2 id="told-title" className="headline-sm">
            {fillTemplate(TOLD_SUMMARY, { count: items.length })}
          </h2>
          <ChevronDownIcon size={18} className="told-chev" />
        </summary>
        <ul>
          {items.map((item) => (
            <li key={item.turn + item.content} className="li">
              <span className="check">
                <CheckIcon size={12} />
              </span>
              <span className="body-md li-text">{item.content}</span>
              {fictional && <span className="pill pill-outline fict">{CUSTOM_LABEL.fictional}</span>}
              <TurnRef turn={item.turn} />
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
