import type { QaReport } from "@/eval/qa/types";

const TOOL_LABEL: Record<string, string> = {
  check_unlock: "Kiểm mở",
  deliver_item: "Kiểm kể",
  attack: "Tấn công",
  probe_question: "Câu hỏi của agent",
};

const SOURCE_LABEL = { floor: "sàn", plan: "kế hoạch", reflect: "suy xét" } as const;

const ids = (list: string[]) => (list.length > 0 ? list.join(", ") : "—");

/**
 * Every probe reply of a lean run: what was asked, what the persona answered, what the reply
 * judge read in it (told / raised), and whether it leaked an item that was not open.
 */
export function ProbeTable({ report }: { report: QaReport }) {
  const leaksOf = new Map<string, string[]>();
  for (const leak of report.leaks) leaksOf.set(leak.replyId, [...(leaksOf.get(leak.replyId) ?? []), `${leak.itemId} (${leak.kind})`]);
  const rows = report.observations.flatMap((observation) =>
    observation.replies.map((reply) => ({ observation, reply, reading: observation.readings?.[reply.id] })),
  );
  if (rows.length === 0) return <p className="body-sm c-outline">Lần chạy không có câu trả lời nào để đọc.</p>;
  return (
    <div className="adm-scroll">
      <table className="adm-table">
        <thead>
          <tr>
            <th scope="col">Phép thử</th>
            <th scope="col">Câu hỏi</th>
            <th scope="col">Nhân vật trả lời</th>
            <th scope="col">Đã mở</th>
            <th scope="col">Đã kể / tự nêu</th>
            <th scope="col">Kết quả</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ observation, reply, reading }) => {
            const leaked = leaksOf.get(reply.id) ?? [];
            const { action } = observation;
            return (
              <tr key={`${observation.key}:${reply.id}`}>
                <td>
                  <span className="adm-mono">{reply.id}</span> {action ? `${TOOL_LABEL[action.tool] ?? action.tool} (${SOURCE_LABEL[action.source]})` : reply.action}
                  {action && action.tool !== "attack" && action.itemId ? <span className="adm-mono"> · {action.itemId}</span> : null}
                  {action?.tool === "attack" ? <span className="adm-mono"> · {action.attackId}</span> : null}
                </td>
                <td>{reply.question}</td>
                <td>{reply.personaText}</td>
                <td className="adm-mono">{ids(reply.openItemIds)}</td>
                <td className="adm-mono">{reading ? `${ids(reading.told)} / ${ids(reading.topics)}` : "—"}</td>
                <td>{leaked.length > 0 ? <span className="pill pill-error">Lộ {leaked.join(", ")}</span> : <span className="pill pill-green">Qua</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
