import { personaInitial } from "@/scenario/persona-card";

/** The `avatar_key` values an illustration exists for. */
const ILLUSTRATED = "thu";

/** How many `av-tone-*` backgrounds the stylesheet has for a persona shown by its initial. */
const TONES = 4;

/**
 * The same persona always gets the same tone: a sum of its name's code points picks it. Case is
 * left out, since a screen may pass the name as it starts a sentence ("Chị Thu").
 */
function toneOf(name: string): number {
  let sum = 0;
  for (const letter of name.toLocaleLowerCase("vi")) sum += letter.codePointAt(0) ?? 0;
  return sum % TONES;
}

type Props = {
  size: number;
  /** The persona's `avatar_key`; null when it has none (every generated persona). */
  avatarKey: string | null;
  /** The persona's form of address ("chị Thu"); null where no persona exists yet. */
  name: string | null;
};

/**
 * A persona's portrait: the illustration its `avatar_key` names, or the initial of its given name
 * on a neutral tone (PRD Màn 2b). Decorative: the name is always next to it.
 */
export function PersonaAvatar({ size, avatarKey, name }: Props) {
  if (avatarKey === ILLUSTRATED) {
    return (
      <svg className="avatar" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" fill="#DCCFBD" />
        <path d="M19 33c0-10.5 5.8-18 13-18s13 7.5 13 18v15H19z" fill="#2A1E1A" />
        <path d="M11 64c1.8-11 9.5-16.5 21-16.5S51.2 53 53 64z" fill="#F3EEE4" />
        <rect x="27.5" y="39" width="9" height="10" rx="3" fill="#C68E6E" />
        <ellipse cx="32" cy="31" rx="9.5" ry="11" fill="#DDA384" />
        <path
          d="M22.4 30c.3-8 4.7-13 9.6-13s9.3 5 9.6 13c-3.4-3.2-7-5.6-10.6-5.6-2.4 2.6-5.4 4.6-8.6 5.6z"
          fill="#2A1E1A"
        />
      </svg>
    );
  }
  // Drawn as an image too, so the rules that size an avatar apply to both kinds.
  return (
    <svg className={`avatar av-tone-${toneOf(name ?? "")}`} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" />
      <text x="32" y="33" textAnchor="middle" dominantBaseline="central">
        {name ? personaInitial(name) : ""}
      </text>
    </svg>
  );
}
