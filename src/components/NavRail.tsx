"use client";

import { Icon, type IconName } from "@/components/Icon";
import type { Panel } from "@/store/gameStore";

export type RailItemId =
  | "dossier"
  | "map"
  | "situation"
  | "orders"
  | "supply"
  | "recon"
  | "radio"
  | "journal"
  | "settings";

interface RailItem {
  id: RailItemId;
  icon: IconName;
  label: string;
  shortcut?: string;
}

const PLAY_ITEMS: RailItem[] = [
  { id: "map", icon: "map", label: "Карта", shortcut: "M" },
  { id: "situation", icon: "binoculars", label: "Обстановка" },
  { id: "orders", icon: "orders", label: "Приказы", shortcut: "O" },
  { id: "supply", icon: "supply", label: "Снабжение" },
  { id: "recon", icon: "target", label: "Разведка" },
  { id: "radio", icon: "radio", label: "Радио", shortcut: "S" },
  { id: "journal", icon: "book", label: "Журнал", shortcut: "L" },
];

const DOSSIER_ITEMS: RailItem[] = [
  { id: "dossier", icon: "dossier", label: "Досье" },
  { id: "map", icon: "map", label: "Карта" },
  { id: "orders", icon: "orders", label: "Сценарии" },
  { id: "supply", icon: "archive", label: "Источники" },
  { id: "recon", icon: "binoculars", label: "Справка" },
  { id: "radio", icon: "radio", label: "Сохранения" },
  { id: "journal", icon: "journal", label: "Журнал" },
];

export default function NavRail({
  active = "map",
  variant = "play",
  saving = false,
  toggledRecon = false,
  onNavigate,
  onPanel,
  onToggleRecon,
  onSave,
}: {
  active?: RailItemId;
  variant?: "play" | "dossier";
  saving?: boolean;
  toggledRecon?: boolean;
  onNavigate?: (item: RailItemId) => void;
  onPanel?: (panel: Panel | null) => void;
  onToggleRecon?: () => void;
  onSave?: () => void;
}) {
  const items = variant === "dossier" ? DOSSIER_ITEMS : PLAY_ITEMS;

  const handle = (id: RailItemId) => {
    if (onNavigate) {
      onNavigate(id);
      return;
    }
    if (id === "recon") onToggleRecon?.();
    else if (id === "radio") onSave?.();
    else if (id === "situation" || id === "supply") onPanel?.("report");
    else if (id === "orders") onPanel?.("objectives");
    else if (id === "journal") onPanel?.("log");
    else if (id === "settings") onPanel?.("help");
  };

  return (
    <nav
      aria-label={variant === "dossier" ? "Разделы досье" : "Оперативные инструменты"}
      className="staff-rail z-10 flex w-[88px] shrink-0 flex-col items-stretch border-r border-staff-edge/70 py-2"
    >
      <div className="flex flex-col gap-1 px-2">
        {items.map((item) => {
          const isActive =
            active === item.id || (item.id === "recon" && toggledRecon);
          return (
            <button
              key={item.id}
              type="button"
              title={`${item.id === "radio" && saving ? "Сохранение…" : item.label}${item.shortcut ? ` · ${item.shortcut}` : ""}`}
              aria-current={isActive ? "page" : undefined}
              aria-pressed={item.id === "recon" ? toggledRecon : undefined}
              onClick={() => handle(item.id)}
              className={`rail-control group flex min-h-[66px] flex-col items-center justify-center gap-1 border px-1 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                isActive
                  ? "border-staff-gold/35 bg-staff-gold/15 text-staff-gold"
                  : "border-transparent text-staff-mute hover:border-staff-edge hover:bg-staff-panel2/55 hover:text-staff-ink-dim"
              }`}
            >
              {item.id === "radio" && saving ? (
                <span className="text-lg leading-none">•••</span>
              ) : (
                <Icon
                  name={item.icon}
                  className={`h-[22px] w-[22px] ${
                    isActive
                      ? "text-staff-gold"
                      : "text-staff-ink-dim/75 group-hover:text-staff-gold/80"
                  }`}
                />
              )}
              <span className="max-w-full leading-tight">{item.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-auto px-2 pb-1">
        <button
          type="button"
          onClick={() => handle("settings")}
          className="rail-control group flex min-h-[66px] w-full flex-col items-center justify-center gap-1 border border-transparent px-1 py-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-staff-mute hover:border-staff-edge hover:bg-staff-panel2/55 hover:text-staff-ink-dim"
          title="Настройки и справка"
        >
          <Icon
            name="gear"
            className="h-[22px] w-[22px] text-staff-ink-dim/75 group-hover:text-staff-gold/80"
          />
          <span>Настройки</span>
        </button>
        <div className="mt-2 text-center text-[8px] tracking-[0.08em] text-staff-mute/65">
          v.1.0.0.1941
        </div>
      </div>
    </nav>
  );
}
