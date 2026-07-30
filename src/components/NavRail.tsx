"use client";

import type { Panel } from "@/store/gameStore";

type RailItemId =
  | "dossier"
  | "map"
  | "situation"
  | "orders"
  | "supply"
  | "recon"
  | "radio"
  | "journal"
  | "settings";

const PLAY_ITEMS: Array<{ id: RailItemId; icon: string; label: string; panel?: Panel }> = [
  { id: "map", icon: "▰", label: "Карта" },
  { id: "situation", icon: "◉", label: "Обстановка", panel: "report" },
  { id: "orders", icon: "☰", label: "Приказы", panel: "objectives" },
  { id: "supply", icon: "▥", label: "Снабжение", panel: "report" },
  { id: "recon", icon: "◈", label: "Разведка" },
  { id: "radio", icon: "▣", label: "Радио" },
  { id: "journal", icon: "▤", label: "Журнал", panel: "log" },
];

const DOSSIER_ITEMS: Array<{ id: RailItemId; icon: string; label: string; panel?: Panel }> = [
  { id: "dossier", icon: "▰", label: "Досье" },
  { id: "map", icon: "▱", label: "Карта" },
  { id: "orders", icon: "☰", label: "Приказы" },
  { id: "supply", icon: "▥", label: "Снабжение" },
  { id: "recon", icon: "◈", label: "Разведка" },
  { id: "radio", icon: "▣", label: "Радио" },
  { id: "journal", icon: "▤", label: "Журнал" },
];

export default function NavRail({
  active = "map",
  variant = "play",
  saving = false,
  onPanel,
  onToggleRecon,
  onSave,
}: {
  active?: RailItemId;
  variant?: "play" | "dossier";
  saving?: boolean;
  onPanel?: (panel: Panel | null) => void;
  onToggleRecon?: () => void;
  onSave?: () => void;
}) {
  const items = variant === "dossier" ? DOSSIER_ITEMS : PLAY_ITEMS;
  const handle = (id: RailItemId, panel?: Panel) => {
    if (id === "recon") {
      onToggleRecon?.();
      return;
    }
    if (id === "radio") {
      onSave?.();
      return;
    }
    if (panel) onPanel?.(panel);
  };

  return (
    <nav className="staff-rail z-10 flex w-[82px] shrink-0 flex-col items-stretch border-r border-staff-edge/70 py-2">
      <div className="flex flex-col gap-1 px-2">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              title={item.id === "radio" && saving ? "Сохранение…" : item.label}
              aria-current={isActive ? "page" : undefined}
              onClick={() => handle(item.id, item.panel)}
              className={`group flex min-h-16 flex-col items-center justify-center gap-1 border px-1 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] transition ${
                isActive
                  ? "border-staff-gold/35 bg-staff-gold/15 text-staff-gold shadow-[inset_0_0_16px_rgba(198,160,90,0.08)]"
                  : "border-transparent text-staff-mute hover:border-staff-edge hover:bg-staff-panel2/55 hover:text-staff-ink-dim"
              }`}
            >
              <span className={`text-[22px] leading-none ${isActive ? "text-staff-gold" : "text-staff-ink-dim/75 group-hover:text-staff-gold/80"}`}>
                {item.id === "radio" && saving ? "…" : item.icon}
              </span>
              <span className="leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto px-2 pb-1">
        <button
          type="button"
          onClick={() => onPanel?.("help")}
          className="group flex min-h-16 w-full flex-col items-center justify-center gap-1 border border-transparent px-1 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-staff-mute transition hover:border-staff-edge hover:bg-staff-panel2/55 hover:text-staff-ink-dim"
          title="Настройки и справка"
        >
          <span className="text-[22px] leading-none text-staff-ink-dim/75 group-hover:text-staff-gold/80">⚙</span>
          <span>Настройки</span>
        </button>
        <div className="mt-2 text-center text-[9px] text-staff-mute/65">v.1.0.0.1941</div>
      </div>
    </nav>
  );
}
