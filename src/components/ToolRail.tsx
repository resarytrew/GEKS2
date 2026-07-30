import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";

interface ToolRailProps {
  showZOC: boolean;
  saving: boolean;
  onHelp: () => void;
  onObjectives: () => void;
  onLog: () => void;
  onReport: () => void;
  onToggleZOC: () => void;
  onSave: () => void;
}

/** Secondary map actions live in one rail; they are intentionally absent from TopBar. */
export default function ToolRail({ showZOC, saving, onHelp, onObjectives, onLog, onReport, onToggleZOC, onSave }: ToolRailProps) {
  return <nav aria-label="Инструменты карты" className="hidden w-11 shrink-0 flex-col md:flex items-center gap-1 border-r border-[#8f8978] bg-[#ebe1c9] py-2">
    <ToolButton title="Справка" onClick={onHelp}><Icon name="help" className="h-4 w-4" /></ToolButton>
    <ToolButton title="Оперативные цели" onClick={onObjectives}><Icon name="target" className="h-4 w-4" /></ToolButton>
    <ToolButton title="Журнал штаба" onClick={onLog}><Icon name="journal" className="h-4 w-4" /></ToolButton>
    <ToolButton title="Зоны контроля" active={showZOC} onClick={onToggleZOC}><Icon name="layers" className="h-4 w-4" /></ToolButton>
    <ToolButton title="Сохранить партию" onClick={onSave}>{saving ? <span className="text-xs">…</span> : <Icon name="save" className="h-4 w-4" />}</ToolButton>
    <div className="mt-auto" />
    <ToolButton title="Оперативная сводка" onClick={onReport}><Icon name="report" className="h-4 w-4" /></ToolButton>
  </nav>;
}

function ToolButton({ children, title, onClick, active }: { children: ReactNode; title: string; onClick: () => void; active?: boolean }) {
  return <button aria-label={title} title={title} onClick={onClick} className={`relative flex h-9 w-9 items-center justify-center border-l-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-staff-gold ${active ? "border-staff-gold bg-[#d7c28b] text-staff-ink" : "border-transparent text-staff-ink-dim hover:border-[#77715e] hover:bg-[#ded2b5] hover:text-staff-ink"}`}>{children}</button>;
}
