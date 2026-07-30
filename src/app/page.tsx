"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { restoreSaveGame } from "@/engine/persistence";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import { readLocalSaves, removeLocalSave } from "@/lib/localSaves";
import NavRail, { type RailItemId } from "@/components/NavRail";
import { Icon, type IconName } from "@/components/Icon";

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

type HomePanel = "scenarios" | "rules" | "sources" | "editorial" | null;

export default function HomePage() {
  const router = useRouter();
  const newGame = useGame((state) => state.newGame);
  const loadGame = useGame((state) => state.loadGame);
  const [list, setList] = useState<MatchSummary[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [homePanel, setHomePanel] = useState<HomePanel>(null);

  const refresh = useCallback(async () => {
    const local = readLocalSaves();
    try {
      const response = await fetch("/api/matches");
      const data = await response.json();
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

  const resume = async (match: MatchSummary) => {
    setLoadingId(match.id);
    try {
      if (match.id.startsWith("local:")) {
        const local = readLocalSaves().find((saved) => saved.id === match.id);
        if (!local) throw new Error("Локальное сохранение не найдено");
        const restored = restoreSaveGame(local.save);
        if (!restored.ok) throw new Error(restored.message);
        loadGame(restored.state, restored.commands);
        useGame.setState({ matchDbId: local.id });
        router.push("/play");
        return;
      }
      const response = await fetch(`/api/matches/${match.id}`);
      const data = await response.json();
      const restored = restoreSaveGame({
        ...(data.match?.summary ?? {}),
        scenarioId: data.match?.scenarioId,
        commands: data.match?.commands,
      });
      if (!restored.ok) throw new Error(restored.message);
      loadGame(restored.state, restored.commands);
      useGame.setState({ matchDbId: match.id });
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
    await refresh();
  };

  const navigateRail = (item: RailItemId) => {
    if (item === "dossier") return;
    if (item === "map") startNew();
    else if (item === "orders") setHomePanel("scenarios");
    else if (item === "supply") setHomePanel("sources");
    else if (item === "recon" || item === "settings") setHomePanel("rules");
    else document.getElementById("campaign-log")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="ops-shell home-shell flex h-screen w-full overflow-hidden text-staff-ink">
      <NavRail variant="dossier" active="dossier" onNavigate={navigateRail} />
      <main className="ops-layer flex min-w-0 flex-1 flex-col">
        <HomeHeader />
        <div className="home-workspace grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_392px] gap-6 px-7 py-5">
          <section className="home-primary grid min-h-0 grid-rows-[minmax(0,1fr)_248px] gap-4 pl-5">
            <article className="dossier-paper dossier-hero relative min-h-0 overflow-hidden border border-[#7a6849]/40 px-[clamp(42px,5vw,82px)] py-[clamp(28px,4vh,46px)]">
              <div className="paper-clip" aria-hidden="true" />
              <div className="dossier-watermark" aria-hidden="true" />
              <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-[#5e584d]">
                <Icon name="star" className="h-5 w-5" />
                Оперативное досье №01
              </div>
              <h1 className="mt-[clamp(18px,3vh,32px)] max-w-[890px] font-dispatch text-[clamp(43px,4.7vw,72px)] leading-[0.92] tracking-[-0.035em] text-[#171410]">
                Северо-Западный фронт:
                <br />
                Прибалтика 1941
              </h1>
              <div className="mt-5 h-px w-[68%] bg-[#5f523e]/55" />
              <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.38em] text-[#5f523e]">
                Историческая операция — Балтийская оборонительная операция
              </div>
              <p className="mt-5 max-w-[780px] text-[14px] leading-6 text-[#2c261d]">
                Кампания о первых неделях Великой Отечественной войны. Два игрока принимают решения на уровне
                дивизий и корпусов: управляют снабжением и штабами, организуют прорывы и контрудары,
                разыгрывают исторические карты и соревнуются с реальным темпом кампании.
              </p>
              <div className="mt-6 grid max-w-[900px] grid-cols-4 gap-4 text-[#332b20]">
                <DossierFact icon="journal" label="Период">22 июня — 9 июля 1941</DossierFact>
                <DossierFact icon="target" label="Масштаб">10–13 км / гекс</DossierFact>
                <DossierFact icon="layers" label="Уровень">Дивизионный</DossierFact>
                <DossierFact icon="dossier" label="Игроки">2 / Hot-seat</DossierFact>
              </div>
              <div className="mt-auto flex flex-wrap gap-3 pt-6">
                <button onClick={startNew} className="command-button command-button-primary min-w-64">
                  <Icon name="star" className="h-4 w-4" />
                  Начать кампанию
                </button>
                <button onClick={startFixture} className="command-button min-w-56">
                  Raseiniai WEGO Test
                </button>
                <button onClick={() => setHomePanel("scenarios")} className="command-button min-w-48">
                  <Icon name="orders" className="h-4 w-4" />
                  Сценарии
                </button>
              </div>
            </article>

            <section id="campaign-log" className="staff-panel-frame min-h-0 overflow-hidden px-5 py-4">
              <div className="flex items-center justify-between border-b border-staff-edge/70 pb-3">
                <h2 className="staff-section-title">Журнал кампаний</h2>
                <span className="text-[9px] uppercase tracking-[0.16em] text-staff-mute">
                  {list.length ? `${list.length} записей` : "нет записей"}
                </span>
              </div>
              <div className="staff-scroll mt-3 flex max-h-[calc(100%-40px)] flex-col gap-2 overflow-y-auto pr-1">
                {list.length === 0 && <EmptySave onStart={startNew} />}
                {list.map((match, index) => (
                  <SaveRow
                    key={match.id}
                    match={match}
                    index={index}
                    loading={loadingId === match.id}
                    onResume={() => resume(match)}
                    onRemove={() => remove(match.id)}
                  />
                ))}
              </div>
            </section>
          </section>

          <aside className="home-sidebar staff-scroll flex min-h-0 flex-col gap-5 overflow-y-auto pt-12">
            <ScenarioSummary onRules={() => setHomePanel("rules")} />
            <EditorialNote onOpen={() => setHomePanel("editorial")} />
          </aside>
        </div>
      </main>
      {homePanel && <HomeModal panel={homePanel} onClose={() => setHomePanel(null)} onStartFixture={startFixture} />}
    </div>
  );
}

function HomeHeader() {
  return (
    <header className="staff-topbar flex h-[68px] shrink-0 items-stretch border-b border-staff-edge/80">
      <div className="flex w-[380px] items-center gap-4 border-r border-staff-edge/70 px-6">
        <div className="brand-standard flex h-12 w-12 shrink-0 items-center justify-center">
          <Icon name="star" className="h-8 w-8 text-staff-gold" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[16px] font-bold uppercase tracking-[0.12em]">Северо-Западный фронт</div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.34em] text-staff-mute">Прибалтика · 1941</div>
        </div>
      </div>
      <div className="flex w-[150px] flex-col justify-center border-r border-staff-edge/70 px-5">
        <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-staff-gold">22 июня 1941</div>
        <div className="mt-1 text-[9px] text-staff-ink-dim">1-й ход из 18</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center border-r border-staff-edge/60 px-5">
        <div className="text-[13px] font-bold uppercase tracking-[0.16em]">Планирование</div>
        <div className="mt-1 text-[10px] text-staff-ink-dim">Оперативное досье · выбор сценария</div>
      </div>
      <div className="hidden w-[170px] items-center gap-3 border-r border-staff-edge/60 px-4 xl:flex">
        <Icon name="star" className="h-7 w-7 text-staff-gold" />
        <div>
          <div className="text-[8px] uppercase tracking-[0.14em] text-staff-mute">Очки командования</div>
          <div className="tabular text-sm font-bold">17 / 21 КО</div>
        </div>
      </div>
      <div className="flex w-[250px] items-center justify-end gap-5 px-5">
        <span className="text-[9px] uppercase tracking-[0.14em] text-staff-mute">Вермахт</span>
        <span className="tabular text-xl font-bold">0</span>
        <span className="text-[9px] uppercase tracking-[0.14em] text-sov-accent">РККА</span>
        <span className="tabular text-xl font-bold">0</span>
      </div>
    </header>
  );
}

function DossierFact({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Icon name={icon} className="h-6 w-6 shrink-0 text-[#5e584d]" />
      <div className="min-w-0">
        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6d6558]">{label}</div>
        <div className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#2d261d]">{children}</div>
      </div>
    </div>
  );
}

function ScenarioSummary({ onRules }: { onRules: () => void }) {
  return (
    <section className="staff-panel-frame p-5">
      <h2 className="staff-section-title">Сводка досье</h2>
      <div className="mt-4 divide-y divide-staff-edge/60 text-[11px]">
        <SummaryRow icon="compass" label="Театр войны" value="Прибалтика" />
        <SummaryRow icon="dossier" label="Стороны" value="СССР (РККА) vs Германия (Вермахт)" />
        <SummaryRow icon="journal" label="Исторический период" value={SCENARIO.period} />
        <SummaryRow icon="target" label="Условия победы" value="Историческая победа / альтернативные цели" />
        <SummaryRow icon="layers" label="Тип кампании" value="Историческая, с реальным темпом" />
        <SummaryRow icon="gear" label="Сложность по умолчанию" value="Средняя" />
      </div>
      <button onClick={onRules} className="command-button mt-5 w-full">
        <Icon name="book" className="h-4 w-4" />
        Правила и исторические справки
      </button>
    </section>
  );
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex gap-3 py-3 first:pt-0 last:pb-0">
      <Icon name={icon} className="h-5 w-5 shrink-0 text-staff-gold/80" />
      <div>
        <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-staff-gold/80">{label}</div>
        <div className="mt-1 text-staff-ink-dim">{value}</div>
      </div>
    </div>
  );
}

function EditorialNote({ onOpen }: { onOpen: () => void }) {
  return (
    <section className="staff-panel-frame p-5">
      <h2 className="staff-section-title">Редакционная пометка</h2>
      <p className="mt-4 text-[12px] leading-6 text-staff-ink-dim">
        Игрок оказывается внутри оперативной обстановки лета 1941 года и принимает решения, сопоставимые с
        решениями командующих. Исторические данные помечены по степени достоверности и не выдаются за
        подтверждённый архивный факт.
      </p>
      <button onClick={onOpen} className="command-button mt-5">
        Читать подробнее
        <span aria-hidden="true">↗</span>
      </button>
    </section>
  );
}

function EmptySave({ onStart }: { onStart: () => void }) {
  return (
    <button
      onClick={onStart}
      className="grid min-h-[74px] grid-cols-[160px_1fr] items-center border border-dashed border-staff-edge/80 bg-staff-void/35 text-left transition hover:border-staff-gold/60"
    >
      <div className="flex h-full items-center justify-center border-r border-dashed border-staff-edge/70">
        <Icon name="dossier" className="h-8 w-8 text-staff-gold/70" />
      </div>
      <div className="px-5">
        <div className="text-[12px] font-bold uppercase tracking-[0.14em]">Новая кампания</div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-staff-mute">Начать с чистого листа</div>
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
    <div className="grid grid-cols-[160px_1fr_142px_42px] items-center border border-staff-edge/70 bg-staff-panel/50 transition hover:border-staff-edge2">
      <div className={`campaign-thumb campaign-thumb-${(index % 3) + 1} h-[56px] border-r border-staff-edge/60`} />
      <div className="min-w-0 px-4">
        <div className="truncate text-[12px] font-bold uppercase tracking-[0.08em]">
          {match.name || `Операция ${index + 1}`}
        </div>
        <div className="mt-1 text-[9px] uppercase tracking-[0.12em] text-staff-mute">
          Ход {match.turn} из 18 · {match.date ?? "дата неизвестна"} · {match.storage === "postgresql" ? "сервер" : "локально"}
        </div>
      </div>
      <button onClick={onResume} disabled={loading} className="command-button mx-2">
        {loading ? "Загрузка…" : "Продолжить"}
      </button>
      <button onClick={onRemove} className="h-full text-staff-mute hover:bg-red-950/45 hover:text-red-200" title="Удалить">
        ×
      </button>
    </div>
  );
}

function HomeModal({
  panel,
  onClose,
  onStartFixture,
}: {
  panel: Exclude<HomePanel, null>;
  onClose: () => void;
  onStartFixture: () => void;
}) {
  const content = {
    scenarios: {
      kicker: "Сценарный архив",
      title: "Доступные операции",
      body: (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button onClick={onStartFixture} className="staff-panel-inset p-4 text-left hover:border-staff-gold">
            <div className="staff-section-title">Учебный сценарий</div>
            <div className="mt-2 font-dispatch text-xl">Raseiniai WEGO Test</div>
            <p className="mt-2 text-xs leading-relaxed text-staff-mute">Короткая проверка одновременного планирования, контакта и боя.</p>
          </button>
          <div className="staff-panel-inset p-4">
            <div className="staff-section-title">Полная кампания</div>
            <div className="mt-2 font-dispatch text-xl">Прибалтика 1941</div>
            <p className="mt-2 text-xs leading-relaxed text-staff-mute">18 игровых суток, две стороны, исторические события и альтернативные цели.</p>
          </div>
        </div>
      ),
    },
    rules: {
      kicker: "Полевая инструкция",
      title: "Как вести операцию",
      body: (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ModalNote title="Планирование">Выберите соединение, задайте маршрут и тип приказа. В hot-seat планы сторон скрыты до передачи устройства.</ModalNote>
          <ModalNote title="Исполнение">Приказы обеих сторон исполняются по шести импульсам; контакт может задержать или сорвать движение.</ModalNote>
          <ModalNote title="Снабжение">Штабы, дороги и переправы образуют сеть. Изоляция снижает боеспособность и темп.</ModalNote>
          <ModalNote title="Победа">Германия набирает темп и территорию; СССР получает очки за задержку, сохранение сил и разрушение переправ.</ModalNote>
        </div>
      ),
    },
    sources: {
      kicker: "Реестр источников",
      title: "Историческая основа",
      body: (
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-staff-ink-dim">
          <p>Боевой состав и хронология сверяются с реестром сценария. Каждая запись имеет уровень достоверности: подтверждённая, вероятная или игровая реконструкция.</p>
          <p>Карта театра и координаты населённых пунктов служат игровой модели масштаба 10–13 км на гекс и не заменяют историческую карту.</p>
        </div>
      ),
    },
    editorial: {
      kicker: "Редакционная политика",
      title: "Где история, а где модель",
      body: (
        <div className="mt-5 space-y-3 text-sm leading-relaxed text-staff-ink-dim">
          <p>Игра моделирует оперативные ограничения, а не воспроизводит неизбежный исход. Проверенные факты отделены от допущений сценария.</p>
          <p>Названия соединений, даты событий и командная структура опираются на указанные источники. Боевые коэффициенты, масштаб времени и часть маршрутов являются игровой интерпретацией.</p>
        </div>
      ),
    },
  }[panel];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-staff-void/85 p-5 backdrop-blur-sm" onClick={onClose}>
      <section className="animate-telegraph staff-panel-frame w-full max-w-2xl p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="staff-section-title">{content.kicker}</div>
            <h2 className="mt-2 font-dispatch text-3xl text-staff-ink">{content.title}</h2>
          </div>
          <button aria-label="Закрыть" onClick={onClose} className="p-2 text-staff-mute hover:text-staff-gold">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        {content.body}
      </section>
    </div>
  );
}

function ModalNote({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="staff-panel-inset p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-staff-gold">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-staff-mute">{children}</p>
    </article>
  );
}
