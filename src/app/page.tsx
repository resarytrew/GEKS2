"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/gameStore";
import { SCENARIO } from "@/scenarios/baltic-1941/scenario";
import { restoreSaveGame } from "@/engine/persistence";
import { createRaseiniaiWegoTestState } from "@/scenarios/baltic-1941/wego-test";
import {
  readLocalSaves,
  removeLocalSave,
} from "@/lib/localSaves";

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
      setList(
        [...local, ...remote].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        ),
      );
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
    <div className="min-h-screen w-full bg-staff-bg text-staff-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
        <header className="overflow-hidden rounded-xl border border-staff-edge bg-gradient-to-br from-staff-panel to-staff-void p-8 shadow-xl">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-staff-gold">
            <span className="h-px w-8 bg-staff-gold/60" /> Baltic Front 1941
          </div>
          <h1 className="mt-3 font-dispatch text-4xl leading-tight text-staff-ink sm:text-5xl">
            Северо-Западный фронт:<br />Прибалтика 1941
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-staff-ink-dim">
            Исторический операционный варгейм о Прибалтийской оборонительной операции
            ({SCENARIO.period}). {SCENARIO.scale}. Два игрока принимают решения на уровне
            дивизий и корпусов: управляют снабжением и штабами, организуют прорывы и
            контрудары, разыгрывают исторические карты — и соревнуются с реальным темпом
            кампании.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              onClick={startNew}
              className="rounded-lg bg-staff-gold px-6 py-3 text-sm font-bold uppercase tracking-wider text-staff-void shadow-lg transition hover:brightness-110"
            >
              Новая партия · hot-seat ▶
            </button>
            <button
              onClick={startFixture}
              className="rounded-lg border border-staff-gold/50 px-6 py-3 text-sm uppercase tracking-wider text-staff-gold transition hover:bg-staff-gold/10"
            >
              Raseiniai WEGO Test
            </button>
            <a
              href="#modes"
              className="rounded-lg border border-staff-edge px-6 py-3 text-sm uppercase tracking-wider text-staff-ink-dim transition hover:border-staff-edge2 hover:text-staff-ink"
            >
              Режимы игры
            </a>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-xl border border-staff-edge bg-staff-panel p-5 lg:col-span-2">
            <h2 className="font-dispatch text-lg text-staff-gold">Сохранённые партии</h2>
            <p className="mt-1 text-[11px] text-staff-mute">Каждая партия хранится как детерминированный журнал команд — повтор полностью воспроизводим.</p>
            <div className="mt-4 flex flex-col gap-2">
              {list.length === 0 && (
                <div className="rounded border border-dashed border-staff-edge px-4 py-6 text-center text-[12px] text-staff-mute">
                  Сохранённых партий пока нет. Начните новую.
                </div>
              )}
              {list.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-lg border border-staff-edge bg-staff-panel2/50 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-staff-ink">{m.name}</div>
                    <div className="text-[10px] text-staff-mute">
                      {m.date ?? `ход ${m.turn}`} · {m.status === "completed" ? (m.resultType ?? "завершена") : "активна"}
                      {m.winner ? ` · победа: ${m.winner === "germany" ? "Германия" : "СССР"}` : ""}
                    </div>
                  </div>
                  <button
                    onClick={() => resume(m)}
                    disabled={loadingId === m.id}
                    className="rounded bg-staff-panel2 px-3 py-1.5 text-[11px] uppercase tracking-wider text-staff-ink-dim hover:text-staff-ink disabled:opacity-50"
                  >
                    {loadingId === m.id ? "…" : "Продолжить"}
                  </button>
                  <button onClick={() => remove(m.id)} className="text-staff-mute hover:text-red-300" title="Удалить">✕</button>
                </div>
              ))}
            </div>
          </section>

          <section id="modes" className="rounded-xl border border-staff-edge bg-staff-panel p-5">
            <h2 className="font-dispatch text-lg text-staff-gold">Режимы</h2>
            <div className="mt-3 flex flex-col gap-2 text-[12px]">
              <ModeRow label="Hot-seat на одном ПК" active>Доступен</ModeRow>
              <ModeRow label="Соревновательная партия">Основа готова · сеть в разработке</ModeRow>
              <ModeRow label="Против ИИ">ИИ через те же команды · в разработке</ModeRow>
              <ModeRow label="Режим преподавателя">Список партий и повтор · в разработке</ModeRow>
              <ModeRow label="Короткие сценарии">Каркас сценариев заложен</ModeRow>
            </div>
            <p className="mt-4 text-[10px] leading-relaxed text-staff-mute">
              Движок построен по принципу «команда → событие → редьюсер» и полностью отделён от
              интерфейса: это позволяет добавить сеть, ИИ и повторы без переписывания правил.
            </p>
          </section>
        </div>

        <section className="rounded-xl border border-staff-edge bg-staff-panel/60 p-5 text-[12px] leading-relaxed text-staff-ink-dim">
          <h2 className="font-dispatch text-base text-staff-ink">Образовательный замысел</h2>
          <p className="mt-2">
            Игрок оказывается внутри оперативной обстановки лета 1941 года и принимает решения,
            сопоставимые с решениями командующих. Германия соревнуется со временем и снабжением;
            СССР может одержать победу, срывая темп, сохраняя соединения и разрушая переправы.
            Исторические данные помечены по степени достоверности и не выдаются за подтверждённый
            архивный факт — это игровой продукт, а не источник.
          </p>
        </section>
      </div>
    </div>
  );
}

function ModeRow({ label, children, active }: { label: string; children: React.ReactNode; active?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded border px-3 py-2 ${active ? "border-staff-gold/40 bg-staff-gold/10" : "border-staff-edge bg-staff-panel2/40 opacity-70"}`}>
      <span className="text-staff-ink">{label}</span>
      <span className={`text-[10px] uppercase tracking-wider ${active ? "text-staff-gold" : "text-staff-mute"}`}>{children}</span>
    </div>
  );
}
