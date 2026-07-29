"use client";

import { useGame } from "@/store/gameStore";
import { IMPULSE_LABELS } from "@/engine/wego";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/orderLabels";

export default function ExecutionPanel() {
  const state = useGame((store) => store.state);
  if (!state || (state.phase !== "execution" && state.phase !== "after_action")) {
    return null;
  }
  const activeOrders = [...state.plans.germany.orders, ...state.plans.ussr.orders];
  const latestReport = state.impulseReports.at(-1);
  return (
    <section className="border-b border-staff-edge bg-staff-panel p-3">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-dispatch text-base text-staff-ink">
            Исполнение приказов
          </h2>
          <p className="text-[9px] uppercase tracking-[0.18em] text-staff-mute">
            одновременный ход
          </p>
        </div>
        <span className="font-mono text-[10px] text-staff-gold">
          {Math.min(state.impulse + 1, IMPULSE_LABELS.length)} / {IMPULSE_LABELS.length}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-6 gap-1">
        {IMPULSE_LABELS.map((label, index) => (
          <div
            key={label}
            title={label}
            className={`h-1.5 rounded ${
              index < state.impulse
                ? "bg-staff-gold"
                : index === state.impulse && state.phase === "execution"
                  ? "animate-pulse bg-staff-steel"
                  : "bg-staff-edge"
            }`}
          />
        ))}
      </div>
      {state.phase === "execution" && (
        <div className="mt-2 text-[10px] text-staff-mute">
          Текущий интервал:{" "}
          <span className="text-staff-ink">
            {IMPULSE_LABELS[Math.min(state.impulse, IMPULSE_LABELS.length - 1)]}
          </span>
        </div>
      )}
      <div className="staff-scroll mt-3 max-h-40 space-y-1 overflow-y-auto">
        {activeOrders.map((order) => (
          <div
            key={order.id}
            className="flex items-center gap-2 rounded bg-staff-void/55 px-2 py-1.5 text-[10px]"
          >
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                order.status === "completed"
                  ? "bg-green-400"
                  : order.status === "failed"
                    ? "bg-red-400"
                    : order.status === "delayed"
                      ? "bg-amber-400"
                      : "bg-staff-steel"
              }`}
            />
            <span className="min-w-0 flex-1 truncate text-staff-ink-dim">
              {ORDER_TYPE_LABELS[order.orderType]} · {order.entityIds.length}
            </span>
            <span className="text-staff-mute">{ORDER_STATUS_LABELS[order.status]}</span>
          </div>
        ))}
      </div>
      {latestReport && (
        <div className="mt-2 grid grid-cols-3 gap-1 text-center">
          <Metric label="контакты" value={latestReport.contactIds.length} />
          <Metric label="бои" value={latestReport.combatIds.length} />
          <Metric
            label="сбои"
            value={latestReport.failedOrderIds.length}
          />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-staff-void/45 px-1 py-1.5">
      <div className="font-mono text-xs text-staff-ink">{value}</div>
      <div className="text-[8px] uppercase tracking-wider text-staff-mute">
        {label}
      </div>
    </div>
  );
}
