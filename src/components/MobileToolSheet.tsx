import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

interface Props {
  open: boolean;
  showZOC: boolean;
  saving: boolean;
  onToggle: () => void;
  onHelp: () => void;
  onObjectives: () => void;
  onLog: () => void;
  onReport: () => void;
  onToggleZOC: () => void;
  onSave: () => void;
}

/** Mobile tools overlay the map instead of reserving a permanent 44px rail. */
export default function MobileToolSheet({ open, showZOC, saving, onToggle, onHelp, onObjectives, onLog, onReport, onToggleZOC, onSave }: Props) {
  const invoke = (action: () => void) => { action(); onToggle(); };
  return <div className="absolute left-2 top-2 z-20 md:hidden">
    <button aria-label="Инструменты карты" aria-expanded={open} onClick={onToggle} className="flex h-11 w-11 items-center justify-center border border-[#77715e] bg-[#f1e8d2] text-staff-ink shadow-[1px_2px_4px_rgba(34,31,22,.28)] focus-visible:outline-2 focus-visible:outline-staff-gold"><Icon name="layers" className="h-5 w-5" /></button>
    {open && <div role="menu" aria-label="Инструменты карты" className="mt-1 flex w-44 flex-col border border-[#77715e] bg-[#f1e8d2] p-1 shadow-[2px_4px_10px_rgba(34,31,22,.3)]">
      <MenuButton icon="target" onClick={() => invoke(onObjectives)}>Цели</MenuButton>
      <MenuButton icon="journal" onClick={() => invoke(onLog)}>Журнал</MenuButton>
      <MenuButton icon="report" onClick={() => invoke(onReport)}>Сводка</MenuButton>
      <MenuButton icon="layers" active={showZOC} onClick={() => invoke(onToggleZOC)}>Зоны контроля</MenuButton>
      <MenuButton icon="save" onClick={() => invoke(onSave)}>{saving ? "Сохранение…" : "Сохранить"}</MenuButton>
      <MenuButton icon="help" onClick={() => invoke(onHelp)}>Справка</MenuButton>
    </div>}
  </div>;
}
function MenuButton({ icon, active, onClick, children }: { icon: "target" | "journal" | "report" | "layers" | "save" | "help"; active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button role="menuitem" onClick={onClick} className={`flex min-h-11 items-center gap-3 border-l-2 px-3 text-left text-[12px] ${active ? "border-staff-gold bg-[#e2d6b9] text-staff-ink" : "border-transparent text-staff-ink-dim hover:bg-[#e2d6b9]"}`}><Icon name={icon} className="h-4 w-4" />{children}</button>;
}
