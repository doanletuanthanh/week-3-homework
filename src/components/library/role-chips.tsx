import { CheckIcon } from "@/components/icons";
import { ROLE_FILTERS, type RoleFilter } from "@/db/schema";
import { selectRoleFilter } from "@/server/actions";
import { ROLE_LABEL } from "@/strings/product-strings";

/**
 * The role filter of the library (FR-50): one form, one button per role, so a press works before
 * the page's scripts have loaded. The chosen chip sends an empty value: pressing it again clears
 * the filter.
 */
export function RoleChips({ chosen }: { chosen: RoleFilter | null }) {
  return (
    <form action={selectRoleFilter} className="chips" role="group" aria-label="Lọc theo vai trò">
      {ROLE_FILTERS.map((role) => {
        const on = role === chosen;
        return (
          <button key={role} type="submit" name="role" value={on ? "" : role} className={on ? "fchip on" : "fchip"} aria-pressed={on}>
            {on && <CheckIcon size={14} strokeWidth={2.6} />}
            {ROLE_LABEL[role]}
          </button>
        );
      })}
    </form>
  );
}
