import type {
  CommandState,
  Echelon,
  GamePhase,
  Side,
  SupplyState,
  Terrain,
  UnitType,
} from "@/engine/types";

export const SIDE_LABEL: Record<Side, string> = { germany: "Германия · группа армий «Север»", ussr: "СССР · Северо-Западный фронт" };
export const SIDE_SHORT: Record<Side, string> = { germany: "Вермахт", ussr: "РККА" };

export const PHASE_LABEL: Record<GamePhase, string> = {
  morning_report: "Утренняя сводка",
  events: "События и карты",
  planning: "Планирование",
  plans_locked: "Планы зафиксированы",
  execution: "Исполнение",
  reaction: "Реакции",
  after_action: "Разбор действий",
  command: "Штабная фаза",
  air: "Воздушная фаза",
  activation: "Фаза активаций",
  combat: "Наземные бои",
  exploitation: "Развитие прорыва",
  supply: "Ночное снабжение",
  end_of_day: "Итоги суток",
};

export const PHASE_HINT: Record<GamePhase, string> = {
  morning_report: "Изучите обстановку, подкрепления и задачи. Нажмите «Начать сутки».",
  events: "Разыгрываются исторические события и карты.",
  planning: "Составьте скрытый план стороны и отдайте приказы.",
  plans_locked: "Оба плана зафиксированы; подготовка одновременного исполнения.",
  execution: "Приказы обеих сторон исполняются по трёхчасовым импульсам.",
  reaction: "Проверяются заранее назначенные реакции.",
  after_action: "Просмотрите контакты, потери и причины задержек.",
  command: "Распределите командные очки, назначьте приказы и карты.",
  air: "Назначьте авиацию (каркой Luftflotte 1 / поддержка).",
  activation: "Активируйте корпуса: двигайтесь и атакуйте. Затем завершите активацию стороны.",
  combat: "Разрешение наземных боёв.",
  exploitation: "Подвижные части могут развить успех.",
  supply: "Линии снабжения, восстановление организации и расход припасов.",
  end_of_day: "Подсчёт очков и переход к новым суткам.",
};

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  infantry: "Пехота",
  rifle: "Стрелковая",
  motorized: "Моторизованная",
  tank: "Танковая",
  mechanized: "Механизированная",
  cavalry: "Кавалерия",
  artillery: "Артиллерия",
  engineer: "Инженерная",
  air: "Авиация",
  headquarters: "Штаб",
  security: "Охранение",
};

export const ECHELON_LABEL: Record<Echelon, string> = {
  division: "Дивизия",
  brigade: "Бригада",
  regiment: "Полк",
  corps_hq: "Штаб корпуса",
  army_hq: "Штаб армии",
  front_hq: "Штаб фронта",
  support: "Часть усиления",
};

export const SUPPLY_LABEL: Record<SupplyState, string> = {
  full: "Полное",
  limited: "Ограниченное",
  low: "Низкое",
  isolated: "Изолированное",
  none: "Нет снабжения",
};

export const SUPPLY_COLOR: Record<SupplyState, string> = {
  full: "#7bbf6a",
  limited: "#d8c24a",
  low: "#e0a13b",
  isolated: "#cf5b3a",
  none: "#9c2f24",
};

export const COMMAND_LABEL: Record<CommandState, string> = {
  in_command: "В командовании",
  delayed: "Задержка связи",
  out_of_command: "Вне связи",
  disorganized: "Дезорганизована",
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  clear: "Равнина",
  forest: "Лес",
  dense_forest: "Густой лес",
  swamp: "Болото",
  city: "Город",
  major_city: "Крупный город",
  fortified: "Укрепрайон",
  coast: "Побережье",
  lake: "Озеро",
  sea: "Море",
};

export function ordinalTurn(turn: number): string {
  return `${turn}-е сутки`;
}
