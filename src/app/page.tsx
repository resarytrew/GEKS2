"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { restoreSaveGame } from "@/engine/persistence";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import { readLocalSaves, removeLocalSave } from "@/lib/localSaves";
import NavRail from "@/components/NavRail";

interface MatchSummary {
  id: string;
  name: string;
  status: string;
  turn: number;
  date: string | null;
  activeSide: string | null;
  winner: string | null;
  resultType: string | null;
  summary?: { seed?: number; matchId?: string; mode?: string } | null;
  updatedAt: string;
  storage?: "local" | "postgresql";
}

export default function HomePage() {
  const router = useRouter();
  const newGame = useGame((s) => s.newGame);
  const loadGame = useGame((s) => s.loadGame);
  const [list, setList] = useState<MatchSummary[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const local = readLocalSaves();
    try {
      const res = await fetch("/api/matches");
      const data = await res.json();
      const remote = (data.matches ?? []).map((match: MatchSummary) => ({
        ...match,
        storage: "postgresql" as const,
      }));
      setList([...local, ...remote].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    } catch {
      setList(local);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const startNew = () => {
    newGame({});
    router.push("/play");
  };

  const startFixture = () => {
    loadGame(createRaseiniaiWegoTestState(), []);
    router.push("/play");
  };

  const resume = async (m: MatchSummary) => {
    setLoadingId(m.id);
    try {
      if (m.id.startsWith("local:")) {
        const local = readLocalSaves().find((saved) => saved.id === m.id);
        if (!local) throw new Error("Локальное сохранение не найдено");
        const restored = restoreSaveGame(local.save);
        if (!restored.ok) throw new Error(restored.message);
        loadGame(restored.state, restored.commands);
        useGame.setState({ matchDbId: local.id });
        router.push("/play");
        return;
      }
      const res = await fetch(`/api/matches/${m.id}`);
      const data = await res.json();
      const restored = restoreSaveGame({
        ...(data.match?.summary ?? {}),
        scenarioId: data.match?.scenarioId,
        commands: data.match?.commands,
      });
      if (!restored.ok) throw new Error(restored.message);
      loadGame(restored.state, restored.commands);
      useGame.setState({ matchDbId: m.id });
      router.push("/play");
    } finally {
      setLoadingId(null);
    }
  };

  const remove = async (id: string) => {
    if (id.startsWith("local:")) {
      removeLocalSave(id);
      await refresh();
      return;
    }
    await fetch(`/api/matches/${id}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="ops-shell flex h-screen w-full overflow-hidden text-staff-ink">
      <NavRail variant="dossier" active="dossier" />
      <main className="ops-layer relative flex min-w-0 flex-1 flex-col">
        <HomeHeader />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(680px,1fr)_392px] gap-7 px-7 py-6">
          <section className="relative flex min-h-0 flex-col overflow-hidden pl-5 pt-4">
            <div className="absolute left-0 top-9 h-[82%] w-10 rotate-[-2deg] border-y border-l border-staff-edge/35 bg-[#cfc3aa]/70 shadow-2xl" />
            <div className="dossier-paper flex h-[64%] min-h-[430px] flex-col border border-[#7a6849]/40 px-20 py-12">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.32em] text-[#5e584d]">
                <span className="text-xl text-[#5e584d]">☆</span>
                Оперативное досье №01
              </div>
              <h1 className="mt-8 max-w-4xl font-dispatch text-[clamp(46px,5vw,76px)] leading-[0.95] tracking-[-0.035em] text-[#171410]">
                Северо-Западный фронт:<br />Прибалтика 1941
              </h1>
              <div className="mt-6 h-px w-[72%] bg-[#5f523e]/55" />
              <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.42em] text-[#5f523e]">
                Историческая операция — Балтийская оборонительная операция
              </div>
              <p className="mt-6 max-w-3xl text-[15px] leading-7 text-[#2c261d]">
                Историческая кампания о первых неделях Великой Отечественной войны.
                Два игрока принимают решения на уровне дивизий и корпусов: управляют
                снабжением и штабами, организуют прорывы и контрудары, разыгрывают
                исторические карты — и соревнуются с реальным темпом кампании.
              </p>
              <div className="mt-7 grid max-w-4xl grid-cols-4 gap-5 text-[#332b20]">
                <DossierFact icon="▣" label="Период">22 июня — 9 июля 1941</DossierFact>
                <DossierFact icon="⬡" label="Масштаб">10–13 км / гекс</DossierFact>
                <DossierFact icon="▰" label="Уровень">Дивизионный</DossierFact>
                <DossierFact icon="♟" label="Игроки">2 / Hot-seat</DossierFact>
              </div>
              <div className="mt-auto flex gap-4 pt-8">
                <button
                  onClick={startNew}
                  className="min-w-72 border border-[#6e5222] bg-[#7c551d] px-7 py-4 text-[13px] font-bold uppercase tracking-[0.2em] text-[#f4e8cb] shadow-[0_10px_20px_rgba(64,40,10,0.25)] transition hover:bg-[#936528]"
                >
                  ☆ Начать кампанию
                </button>
                <button
                  onClick={startFixture}
                  className="min-w-64 border border-[#7d705e] bg-transparent px-7 py-4 text-[13px] font-bold uppercase tracking-[0.16em] text-[#5a4730] transition hover:bg-[#c2b395]/55"
                >
                  Raseiniai WEGO Test
                </button>
                <a
                  href="#campaign-log"
                  className="min-w-52 border border-[#7d705e] bg-transparent px-7 py-4 text-center text-[13px] font-bold uppercase tracking-[0.16em] text-[#5a4730] transition hover:bg-[#c2b395]/55"
                >
                  ☰ Сценарии
                </a>
              </div>
            </div>

            <section id="campaign-log" className="staff-panel-frame mt-4 min-h-0 flex-1 overflow-hidden px-5 py-4">
              <div className="flex items-center justify-between border-b border-staff-edge/70 pb-3">
                <h2 className="staff-section-title">Журнал кампаний</h2>
                <span className="text-[10px] uppercase tracking-[0.16em] text-staff-mute">
                  {list.length ? `${list.length} записей` : "нет записей"}
                </span>
              </div>
              <div className="staff-scroll mt-3 flex max-h-[calc(100%-44px)] flex-col gap-2 overflow-y-auto pr-1">
                {list.length === 0 && <EmptySave onStart={startNew} />}
                {list.map((m, index) => (
                  <SaveRow
                    key={m.id}
                    match={m}
                    index={index}
                    loading={loadingId === m.id}
                    onResume={() => resume(m)}
                    onRemove={() => remove(m.id)}
                  />
                ))}
              </div>
            </section>
          </section>

          <aside className="flex min-h-0 flex-col gap-6 pt-16">
            <ScenarioSummary />
            <EditorialNote />
          </aside>
        </div>
      </main>
    </div>
  );
}

function HomeHeader() {
  return (
    <header className="staff-topbar flex h-[68px] shrink-0 items-center border-b border-staff-edge/80 px-7">
      <div className="text-lg font-bold uppercase tracking-[0.12em] text-staff-ink">Северо-Западный фронт</div>
      <div className="ml-4 text-[10px] uppercase tracking-[0.34em] text-staff-mute">Прибалтика · 1941</div>
      <div className="ml-auto flex items-center gap-4 text-[10px] uppercase tracking-[0.16em] text-staff-mute">
        <span>Сов. секретно</span>
        <span className="h-8 w-px bg-staff-edge" />
        <span>Оперсводка № 01</span>
      </div>
    </header>
  );
}

function DossierFact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl text-[#5e584d]">{icon}</span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#6d6558]">{label}</div>
        <div className="mt-0.5 text-[12px] font-bold uppercase tracking-[0.07em] text-[#2d261d]">{children}</div>
      </div>
    </div>
  );
}

function ScenarioSummary() {
  return (
    <section className="staff-panel-frame p-5">
      <h2 className="staff-section-title">Сводка досье</h2>
      <div className="mt-4 divide-y divide-staff-edge/60 text-[12px]">
        <SummaryRow icon="◉" label="Театр войны" value="Прибалтика" />
        <SummaryRow icon="⚑" label="Стороны" value="СССР (РККА) vs Германия (Вермахт)" />
        <SummaryRow icon="▣" label="Исторический период" value={SCENARIO.period} />
        <SummaryRow icon="⬡" label="Условия победы" value="Историческая победа / альтернативные цели" />
        <SummaryRow icon="▰" label="Тип кампании" value="Историческая, с реальным темпом" />
        <SummaryRow icon="⌘" label="Сложность по умолчанию" value="Средняя" />
      </div>
      <button className="mt-5 w-full border border-staff-edge2/60 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-staff-ink-dim transition hover:border-staff-gold hover:text-staff-gold">
        ▤ Правила и исторические справки
      </button>
    </section>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <span className="w-5 shrink-0 text-lg text-staff-gold/80">{icon}</span>
      <div>
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-staff-gold/80">{label}</div>
        <div className="mt-1 text-staff-ink-dim">{value}</div>
      </div>
    </div>
  );
}

function EditorialNote() {
  return (
    <section className="staff-panel-frame p-5">
      <h2 className="staff-section-title">Редакционная пометка</h2>
      <p className="mt-4 text-[13px] leading-7 text-staff-ink-dim">
        Игрок оказывается внутри оперативной обстановки лета 1941 года и принимает
        решения, сопоставимые с решениями командующих. Германия соревнуется со
        временем и снабжением; СССР может одержать победу, срывая темп, сохраняя
        соединения и разрушая переправы. Исторические данные помечены по степени
        достоверности и не выдаются за подтверждённый архивный факт.
      </p>
      <button className="mt-5 border border-staff-edge2/60 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-staff-ink-dim transition hover:border-staff-gold hover:text-staff-gold">
        Читать подробнее ↗
      </button>
    </section>
  );
}

function EmptySave({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      className="grid min-h-20 grid-cols-[180px_1fr] items-center border border-dashed border-staff-edge/80 bg-staff-void/35 text-left transition hover:border-staff-gold/60"
    >
      <div className="flex h-full items-center justify-center border-r border-dashed border-staff-edge/70 text-4xl text-staff-gold/70">＋</div>
      <div className="px-5">
        <div className="text-[13px] font-bold uppercase tracking-[0.14em] text-staff-ink">Новая кампания</div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-staff-mute">Начать с чистого листа</div>
      </div>
    </button>
  );
}

function SaveRow({
  match,
  index,
  loading,
  onResume,
  onRemove,
}: {
  match: MatchSummary;
  index: number;
  loading: boolean;
  onResume: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[180px_1fr_152px_44px] items-center border border-staff-edge/70 bg-staff-panel/50 transition hover:border-staff-edge2">
      <div className="h-[56px] border-r border-staff-edge/60 bg-[radial-gradient(circle_at_65%_35%,rgba(151,68,46,0.34),transparent_28%),linear-gradient(135deg,#3e514c,#1e2a26_54%,#6b5431)]" />
      <div className="min-w-0 px-4">
        <div className="truncate text-[13px] font-bold uppercase tracking-[0.08em] text-staff-ink">
          {match.name || `Операция ${index + 1}`}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-staff-mute">
          Ход {match.turn} из 18 · {match.date ?? "дата неизвестна"} · {match.storage === "postgresql" ? "сервер" : "локально"}
        </div>
      </div>
      <button
        onClick={onResume}
        disabled={loading}
        className="mx-3 border border-staff-edge2/70 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-staff-ink-dim transition hover:border-staff-gold hover:text-staff-gold disabled:opacity-50"
      >
        {loading ? "…" : "Продолжить"}
      </button>
      <button onClick={onRemove} className="h-full text-staff-mute transition hover:bg-red-950/45 hover:text-red-200" title="Удалить">
        ×
      </button>
    </div>
  );
}
