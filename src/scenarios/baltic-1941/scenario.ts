/**
 * Scenario: "Прибалтийская стратегическая оборонительная операция".
 *
 * The Order of Battle below reflects the opening days on the south-western
 * sector of the North-Western Front (8th & 11th Armies, 3rd & 12th Mechanized
 * Corps) facing Army Group North's Panzer Group 4 (LVI and XXXXI Motorized
 * Corps) and elements of 18th Army. Many figures are reconstructed from memory
 * of published OOBs and are therefore marked "probable" or "placeholder". They
 * must NOT be presented to players as confirmed archival fact.
 */

import type {
  GameState,
  HeadquartersState,
  HistoricalSourceReference,
  ObjectiveState,
  Side,
  SideScore,
  UnitState,
  CardInstance,
  CardDefinition,
  WeatherState,
} from "@/engine/types";
import { buildWorld, placeNear, CITIES } from "./world";
import { sourceReference } from "./sources";

export const SCENARIO = {
  id: "baltic-1941",
  name: "Северо-Западный фронт: Прибалтика 1941",
  nameEn: "Baltic Front 1941",
  period: "22 июня — 9 июля 1941",
  totalTurns: 18,
  scale: "≈ 10–13 км / гекс · дивизия",
  blurb:
    "Группа армий «Север» рвётся к Пскову и Ленинграду. Северо-Западный фронт должен выиграть время, сохранить армии и не дать вермахту окружных котлов.",
};

export const SOURCES = {
  oobAGNorth: sourceReference("ag-north"),
  oobNWF: sourceReference("nwf"),
  raseniai: sourceReference("raseniai"),
  kv: sourceReference("kv"),
  directive3: sourceReference("dir3"),
  geo: sourceReference("geo"),
} satisfies Record<string, HistoricalSourceReference>;

export const COMMANDERS: Record<string, { name: string; role: string; bio: string }> = {
  hoepner: { name: "Эрих Гёпнер", role: "Командующий 4-й танковой группой", bio: "Энергичный командир подвижных соединений; гнал танковые корпуса в глубину, стремясь к глубоким охватам." },
  manstein: { name: "Эрих фон Манштейн", role: "Командир LVI моторизованного корпуса", bio: "Добился самого глубокого броска к Двине, но рисковал отрывом от снабжения и соседей." },
  reinhardt: { name: "Георг-Ганс Рейнхардт", role: "Командир XXXXI моторизованного корпуса", bio: "Шёл на Шяуляй и принял на себя контрудар советских мехкорпусов под Расейняем." },
  kuznetsov: { name: "Фёдор Кузнецов", role: "Командующий Северо-Западным фронтом", bio: "Пытался организовать оборону и контрудары в условиях тяжёлой потери управления 22 июня." },
  sobennikov: { name: "Пётр Собенников", role: "Командующий 8-й армией", bio: "Оборонял приморское направление; затем принял фронт." },
  morozov: { name: "Василий Морозов", role: "Командующий 11-й армией", bio: "Его армия приняла на себя главный удар в полосе Шяуляй — Каунас." },
  kurkin: { name: "Алексей Куркин", role: "Командир 3-го механизированного корпуса", bio: "Корпус с тяжёлыми КВ нанёс контрудар под Расейняем." },
  shestopalov: { name: "Николай Шестопалов", role: "Командир 12-го механизированного корпуса", bio: "Корпус понёс тяжёлые потери в столкновениях с танками противника." },
};

interface UnitSeed {
  id: string;
  name: string;
  short: string;
  side: Side;
  echelon: UnitState["echelon"];
  unitType: UnitState["unitType"];
  corps?: string;
  army?: string;
  lon: number;
  lat: number;
  qOff?: number;
  rOff?: number;
  attack: number;
  defense: number;
  movement: number;
  quality: number;
  morale: number;
  organization: number;
  steps: number;
  stack: number;
  moveClass: UnitState["movementClass"];
  fuel: number;
  ammo: number;
  command: UnitState["commandState"];
  traits: string[];
  commander?: string;
  sources: HistoricalSourceReference[];
}

const GERMAN_UNITS: UnitSeed[] = [
  { id: "ger-1pz", name: "1-я танковая дивизия", short: "1. Pz", side: "germany", echelon: "division", unitType: "tank", corps: "ger-hq-xxxi", lon: 21.5, lat: 55.2, attack: 7, defense: 4, movement: 9, quality: 4, morale: 82, organization: 85, steps: 3, stack: 2, moveClass: "tracked", fuel: 80, ammo: 80, command: "in_command", traits: ["tracked", "combined_arms"], commander: "reinhardt", sources: [SOURCES.oobAGNorth] },
  { id: "ger-6pz", name: "6-я танковая дивизия", short: "6. Pz", side: "germany", echelon: "division", unitType: "tank", corps: "ger-hq-xxxi", lon: 21.42, lat: 55.42, attack: 7, defense: 4, movement: 9, quality: 4, morale: 80, organization: 82, steps: 3, stack: 2, moveClass: "tracked", fuel: 78, ammo: 78, command: "in_command", traits: ["tracked", "combined_arms"], commander: "reinhardt", sources: [SOURCES.oobAGNorth] },
  { id: "ger-269", name: "269-я пехотная дивизия", short: "269. ID", side: "germany", echelon: "division", unitType: "infantry", corps: "ger-hq-xxxi", lon: 21.62, lat: 55.55, attack: 5, defense: 6, movement: 5, quality: 3, morale: 78, organization: 80, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 80, command: "in_command", traits: ["foot"], commander: "reinhardt", sources: [SOURCES.oobAGNorth] },
  { id: "ger-8pz", name: "8-я танковая дивизия", short: "8. Pz", side: "germany", echelon: "division", unitType: "tank", corps: "ger-hq-lvi", lon: 21.92, lat: 54.92, attack: 7, defense: 4, movement: 9, quality: 4, morale: 80, organization: 83, steps: 3, stack: 2, moveClass: "tracked", fuel: 76, ammo: 78, command: "in_command", traits: ["tracked", "combined_arms"], commander: "manstein", sources: [SOURCES.oobAGNorth] },
  { id: "ger-3mot", name: "3-я моторизованная дивизия", short: "3. ID(mot)", side: "germany", echelon: "division", unitType: "motorized", corps: "ger-hq-lvi", lon: 21.82, lat: 54.82, attack: 6, defense: 4, movement: 8, quality: 4, morale: 80, organization: 82, steps: 3, stack: 2, moveClass: "motorized", fuel: 74, ammo: 78, command: "in_command", traits: ["motorized"], commander: "manstein", sources: [SOURCES.oobAGNorth] },
  { id: "ger-290", name: "290-я пехотная дивизия", short: "290. ID", side: "germany", echelon: "division", unitType: "infantry", corps: "ger-hq-lvi", lon: 22.0, lat: 54.86, attack: 5, defense: 6, movement: 5, quality: 3, morale: 78, organization: 80, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 78, command: "in_command", traits: ["foot"], commander: "manstein", sources: [SOURCES.oobAGNorth] },
  { id: "ger-1id", name: "1-я пехотная дивизия", short: "1. ID", side: "germany", echelon: "division", unitType: "infantry", corps: "ger-hq-xxvi", lon: 21.2, lat: 55.62, attack: 5, defense: 6, movement: 5, quality: 3, morale: 78, organization: 80, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 78, command: "in_command", traits: ["foot"], sources: [SOURCES.oobAGNorth] },
  { id: "ger-61id", name: "61-я пехотная дивизия", short: "61. ID", side: "germany", echelon: "division", unitType: "infantry", corps: "ger-hq-xxvi", lon: 21.32, lat: 55.78, attack: 5, defense: 6, movement: 5, quality: 3, morale: 78, organization: 80, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 78, command: "in_command", traits: ["foot"], sources: [SOURCES.oobAGNorth] },
  { id: "ger-21id", name: "21-я пехотная дивизия", short: "21. ID", side: "germany", echelon: "division", unitType: "infantry", corps: "ger-hq-xxvi", lon: 20.98, lat: 55.5, attack: 5, defense: 6, movement: 5, quality: 3, morale: 76, organization: 78, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 76, command: "in_command", traits: ["foot"], sources: [SOURCES.oobAGNorth] },
];

const SOVIET_UNITS: UnitSeed[] = [
  { id: "sov-2td", name: "2-я танковая дивизия (3-й МК)", short: "2 ТД", side: "ussr", echelon: "division", unitType: "tank", corps: "sov-hq-3mc", army: "sov-hq-11a", lon: 23.2, lat: 55.42, attack: 6, defense: 3, movement: 8, quality: 2, morale: 58, organization: 48, steps: 3, stack: 2, moveClass: "tracked", fuel: 55, ammo: 55, command: "in_command", traits: ["tracked", "heavy_armor"], commander: "kurkin", sources: [SOURCES.oobNWF, SOURCES.kv, SOURCES.raseniai] },
  { id: "sov-5td", name: "5-я танковая дивизия (3-й МК)", short: "5 ТД", side: "ussr", echelon: "division", unitType: "tank", corps: "sov-hq-3mc", army: "sov-hq-11a", lon: 22.95, lat: 55.62, attack: 5, defense: 3, movement: 8, quality: 2, morale: 56, organization: 46, steps: 3, stack: 2, moveClass: "tracked", fuel: 50, ammo: 52, command: "delayed", traits: ["tracked"], commander: "kurkin", sources: [SOURCES.oobNWF, SOURCES.raseniai] },
  { id: "sov-84md", name: "84-я моторизованная дивизия (3-й МК)", short: "84 МСД", side: "ussr", echelon: "division", unitType: "motorized", corps: "sov-hq-3mc", army: "sov-hq-11a", lon: 23.32, lat: 55.52, attack: 4, defense: 3, movement: 7, quality: 2, morale: 54, organization: 44, steps: 2, stack: 2, moveClass: "motorized", fuel: 48, ammo: 50, command: "out_of_command", traits: ["motorized"], commander: "kurkin", sources: [SOURCES.oobNWF] },
  { id: "sov-23td", name: "23-я танковая дивизия (12-й МК)", short: "23 ТД", side: "ussr", echelon: "division", unitType: "tank", corps: "sov-hq-12mc", army: "sov-hq-8a", lon: 23.5, lat: 56.05, attack: 5, defense: 3, movement: 8, quality: 2, morale: 54, organization: 42, steps: 3, stack: 2, moveClass: "tracked", fuel: 46, ammo: 48, command: "out_of_command", traits: ["tracked"], commander: "shestopalov", sources: [SOURCES.oobNWF, SOURCES.raseniai] },
  { id: "sov-28td", name: "28-я танковая дивизия (12-й МК)", short: "28 ТД", side: "ussr", echelon: "division", unitType: "tank", corps: "sov-hq-12mc", army: "sov-hq-8a", lon: 23.72, lat: 55.9, attack: 5, defense: 3, movement: 8, quality: 2, morale: 52, organization: 40, steps: 3, stack: 2, moveClass: "tracked", fuel: 44, ammo: 46, command: "out_of_command", traits: ["tracked"], commander: "shestopalov", sources: [SOURCES.oobNWF] },
  { id: "sov-202md", name: "202-я моторизованная дивизия (12-й МК)", short: "202 МСД", side: "ussr", echelon: "division", unitType: "motorized", corps: "sov-hq-12mc", army: "sov-hq-8a", lon: 23.34, lat: 56.2, attack: 4, defense: 3, movement: 7, quality: 2, morale: 52, organization: 40, steps: 2, stack: 2, moveClass: "motorized", fuel: 42, ammo: 44, command: "out_of_command", traits: ["motorized"], commander: "shestopalov", sources: [SOURCES.oobNWF] },
  { id: "sov-10sd", name: "10-я стрелковая дивизия (10-й СК)", short: "10 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-10rc", army: "sov-hq-8a", lon: 22.4, lat: 55.22, attack: 3, defense: 5, movement: 4, quality: 2, morale: 56, organization: 50, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 70, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-48sd", name: "48-я стрелковая дивизия (10-й СК)", short: "48 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-10rc", army: "sov-hq-8a", lon: 21.62, lat: 55.78, attack: 3, defense: 5, movement: 4, quality: 2, morale: 54, organization: 48, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 68, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-125sd", name: "125-я стрелковая дивизия (11-й СК)", short: "125 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-11rc", army: "sov-hq-11a", lon: 21.5, lat: 55.95, attack: 3, defense: 5, movement: 4, quality: 2, morale: 54, organization: 48, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 68, command: "delayed", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-11sd", name: "11-я стрелковая дивизия (11-й СК)", short: "11 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-11rc", army: "sov-hq-11a", lon: 21.82, lat: 55.92, attack: 3, defense: 5, movement: 4, quality: 2, morale: 54, organization: 48, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 68, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-5sd", name: "5-я стрелковая дивизия (16-й СК)", short: "5 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-11a", army: "sov-hq-11a", lon: 23.82, lat: 55.0, attack: 3, defense: 5, movement: 4, quality: 2, morale: 56, organization: 52, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 72, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-33sd", name: "33-я стрелковая дивизия (16-й СК)", short: "33 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-11a", army: "sov-hq-11a", lon: 24.0, lat: 55.22, attack: 3, defense: 5, movement: 4, quality: 2, morale: 56, organization: 52, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 72, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
  { id: "sov-188sd", name: "188-я стрелковая дивизия (16-й СК)", short: "188 СД", side: "ussr", echelon: "division", unitType: "rifle", corps: "sov-hq-11a", army: "sov-hq-11a", lon: 24.22, lat: 55.42, attack: 3, defense: 5, movement: 4, quality: 2, morale: 55, organization: 50, steps: 3, stack: 2, moveClass: "foot", fuel: 100, ammo: 70, command: "in_command", traits: ["foot"], sources: [SOURCES.oobNWF] },
];

interface HqSeed {
  id: string;
  name: string;
  side: Side;
  echelon: HeadquartersState["echelon"];
  lon: number;
  lat: number;
  qOff?: number;
  rOff?: number;
  range: number;
  cp: number;
  throughput: number;
  comm: number;
  initiative: number;
  parentArmy?: string;
  commander?: string;
}

const HEADQUARTERS: HqSeed[] = [
  { id: "ger-hq-pzg4", name: "Штаб 4-й танковой группы (Гёпнер)", side: "germany", echelon: "front_hq", lon: 21.78, lat: 55.08, range: 8, cp: 6, throughput: 5, comm: 4, initiative: 5, commander: "hoepner" },
  { id: "ger-hq-lvi", name: "Штаб LVI мк (Манштейн)", side: "germany", echelon: "corps_hq", lon: 21.9, lat: 54.95, range: 5, cp: 4, throughput: 4, comm: 4, initiative: 5, parentArmy: "ger-hq-pzg4", commander: "manstein" },
  { id: "ger-hq-xxxi", name: "Штаб XXXXI мк (Рейнхардт)", side: "germany", echelon: "corps_hq", lon: 21.7, lat: 55.3, range: 5, cp: 4, throughput: 4, comm: 4, initiative: 4, parentArmy: "ger-hq-pzg4", commander: "reinhardt" },
  { id: "ger-hq-xxvi", name: "Штаб XXVI армейского корпуса", side: "germany", echelon: "corps_hq", lon: 21.1, lat: 55.7, range: 5, cp: 3, throughput: 3, comm: 3, initiative: 3, parentArmy: "ger-hq-pzg4" },
  { id: "sov-hq-front", name: "Штаб Северо-Западного фронта (Кузнецов)", side: "ussr", echelon: "front_hq", lon: 23.6, lat: 56.0, range: 4, cp: 5, throughput: 3, comm: 2, initiative: 2, commander: "kuznetsov" },
  { id: "sov-hq-8a", name: "Штаб 8-й армии (Собенников)", side: "ussr", echelon: "army_hq", lon: 21.24, lat: 55.87, range: 3, cp: 3, throughput: 2, comm: 2, initiative: 2, parentArmy: "sov-hq-front", commander: "sobennikov" },
  { id: "sov-hq-11a", name: "Штаб 11-й армии (Морозов)", side: "ussr", echelon: "army_hq", lon: 23.5, lat: 55.7, range: 3, cp: 3, throughput: 2, comm: 2, initiative: 2, parentArmy: "sov-hq-front", commander: "morozov" },
  { id: "sov-hq-3mc", name: "Штаб 3-го механизированного корпуса (Куркин)", side: "ussr", echelon: "corps_hq", lon: 23.05, lat: 55.5, range: 3, cp: 3, throughput: 2, comm: 2, initiative: 3, parentArmy: "sov-hq-11a", commander: "kurkin" },
  { id: "sov-hq-12mc", name: "Штаб 12-го механизированного корпуса (Шестопалов)", side: "ussr", echelon: "corps_hq", lon: 23.4, lat: 56.0, range: 3, cp: 3, throughput: 2, comm: 2, initiative: 2, parentArmy: "sov-hq-8a", commander: "shestopalov" },
  { id: "sov-hq-10rc", name: "Штаб 10-го стрелкового корпуса", side: "ussr", echelon: "corps_hq", lon: 22.5, lat: 55.3, range: 3, cp: 2, throughput: 2, comm: 2, initiative: 2, parentArmy: "sov-hq-8a" },
  { id: "sov-hq-11rc", name: "Штаб 11-го стрелкового корпуса", side: "ussr", echelon: "corps_hq", lon: 21.7, lat: 55.95, range: 3, cp: 2, throughput: 2, comm: 2, initiative: 2, parentArmy: "sov-hq-11a" },
];

export const CARD_DEFS: CardDefinition[] = [
  { defId: "ger-avangard", side: "germany", type: "operational", title: "Передовые отряды", text: "После успешного боя одна танковая или моторизованная дивизия выполняет ограниченное продвижение.", commandCost: 1, effects: [{ kind: "extra_advance" }], availableFromTurn: 1, historicalSources: [SOURCES.oobAGNorth] },
  { defId: "ger-luftflotte", side: "germany", type: "air", title: "Luftflotte 1", text: "Назначить авиационную поддержку одному бою, удару по мосту или штабу (+3 к силе атаки).", commandCost: 1, effects: [{ kind: "air_support", value: 3 }], availableFromTurn: 1, historicalSources: [SOURCES.oobAGNorth] },
  { defId: "ger-manstein", side: "germany", type: "commander", title: "Корпус Манштейна", text: "Временно повысить оперативную инициативу одного моторизованного корпуса (+2 командных очка на ход).", commandCost: 1, effects: [{ kind: "temp_initiative", value: 2, durationTurns: 2 }], availableFromTurn: 1, historicalSources: [SOURCES.oobAGNorth] },
  { defId: "ger-bridge-seize", side: "germany", type: "engineer", title: "Захват переправы", text: "Восстановить или навести понтонную переправу через разрушенный мост.", commandCost: 2, effects: [{ kind: "build_pontoon" }], availableFromTurn: 1, historicalSources: [SOURCES.oobAGNorth] },
  { defId: "sov-directive3", side: "ussr", type: "directive", title: "Директива № 3", text: "Контрудар механизированных корпусов: +2 инициативы корпусу, но организованный отход затруднён.", commandCost: 2, effects: [{ kind: "temp_initiative", value: 2, durationTurns: 2 }], mandatory: false, availableFromTurn: 2, historicalSources: [SOURCES.directive3, SOURCES.raseniai] },
  { defId: "sov-raseniai", side: "ussr", type: "directive", title: "Контрудар под Расейняем", text: "Сосредоточить мехкорпуса и нанести удар: продвижение после боя для подвижных частей.", commandCost: 2, effects: [{ kind: "extra_advance" }, { kind: "air_support", value: 2 }], availableFromTurn: 2, conditionNote: "Игрок сам собирает соединения и начинает операцию.", historicalSources: [SOURCES.raseniai] },
  { defId: "sov-kv", side: "ussr", type: "opportunity", title: "Тяжёлые танки (КВ)", text: "Добавить свойство тяжёлой брони соединению на ограниченный срок.", commandCost: 1, effects: [{ kind: "add_trait", trait: "heavy_armor", durationTurns: 3 }], availableFromTurn: 2, historicalSources: [SOURCES.kv] },
  { defId: "sov-bridge", side: "ussr", type: "engineer", title: "Подрыв мостов", text: "Немедленно разрушить мост в указанной точке.", commandCost: 1, effects: [{ kind: "destroy_bridge" }], availableFromTurn: 1, historicalSources: [SOURCES.geo] },
  { defId: "sov-collect", side: "ussr", type: "staff", title: "Сбор разрозненных частей", text: "Восстановить организацию ослабленной дивизии возле армейского штаба.", commandCost: 1, effects: [{ kind: "restore_org", value: 35 }], availableFromTurn: 1, historicalSources: [SOURCES.oobNWF] },
  { defId: "sov-initiative", side: "ussr", type: "operational", title: "Местная инициатива", text: "Позволить соединению вне командной дальности выполнить одно действие.", commandCost: 1, effects: [{ kind: "activate_ooc" }], availableFromTurn: 1, historicalSources: [SOURCES.oobNWF] },
];

export const OBJECTIVES: ObjectiveState[] = [
  { id: "g-taurage", side: "germany", kind: "capture_hex", description: "Захватить Таураге к концу 3-х суток", targetHexId: "city-taurage", requiredTurn: 3, points: 4, status: "active", historicalBaseline: "Исторически немецкие авангарды вышли к Таураге 22–23 июня." },
  { id: "g-raseiniai", side: "germany", kind: "capture_hex", description: "Захватить Расейняй к концу 4-х суток", targetHexId: "city-raseiniai", requiredTurn: 4, points: 5, status: "active", historicalBaseline: "Бои за Расейняй шли 23–25 июня." },
  { id: "g-siauliai", side: "germany", kind: "capture_hex", description: "Захватить Шяуляй к концу 6-х суток", targetHexId: "city-siauliai", requiredTurn: 6, points: 6, status: "active", historicalBaseline: "Шяуляй был оставлен в конце июня." },
  { id: "g-daugavpils", side: "germany", kind: "capture_hex", description: "Форсировать Двину и взять Даугавпилс к историческому ориентиру 26 июня", targetHexId: "city-daugavpils", requiredTurn: 5, points: 12, status: "active", historicalBaseline: "Авангард LVI корпуса исторически вышел к Даугавпилсу 26 июня.", deadline: { historicalDate: "1941-06-26", targetTurn: 5, scoringCurve: { earlyPerTurn: 1, latePerTurn: 2, minimum: 0, maximum: 16 } } },
  { id: "g-destroy", side: "germany", kind: "destroy_units", description: "Уничтожить не менее 3 советских соединений", targetTypeSide: "ussr", points: 8, status: "active" },
  { id: "g-mobile", side: "germany", kind: "preserve_units", description: "Сохранить боеспособность подвижных дивизий", targetTypeSide: "germany", points: 6, status: "active" },
  { id: "s-taurage", side: "ussr", kind: "hold_hex", description: "Удержать Таураге до конца 3-х суток", targetHexId: "city-taurage", requiredTurn: 3, points: 4, status: "active" },
  { id: "s-raseiniai", side: "ussr", kind: "hold_hex", description: "Удержать Расейняй до конца 4-х суток", targetHexId: "city-raseiniai", requiredTurn: 4, points: 5, status: "active" },
  { id: "s-siauliai", side: "ussr", kind: "hold_hex", description: "Удержать Шяуляй до конца 6-х суток", targetHexId: "city-siauliai", requiredTurn: 6, points: 6, status: "active" },
  { id: "s-killmobile", side: "ussr", kind: "destroy_units", description: "Нанести поражение немецкой подвижной дивизии", targetTypeSide: "germany", points: 8, status: "active" },
  { id: "s-preserve2td", side: "ussr", kind: "preserve_units", description: "Сохранить 2-ю танковую дивизию (КВ)", targetTypeSide: "ussr", points: 6, status: "active", historicalBaseline: "3-й мехкорпус понёс тяжёлые потери, но вёл упорные бои." },
  { id: "s-bridges", side: "ussr", kind: "destroy_bridges", description: "Уничтожить не менее 2 мостов", points: 5, status: "active" },
  { id: "s-survive", side: "ussr", kind: "reach_turn", description: "Продержаться до конца операции (18 суток)", requiredTurn: 18, points: 10, status: "active" },
];

export interface ScenarioEventDef {
  id: string;
  turn: number;
  title: string;
  text: string;
  kind: "weather" | "card" | "reinforcement" | "narrative";
  weather?: WeatherState["condition"];
  cardDefId?: string;
  side?: Side;
}

export const EVENTS: ScenarioEventDef[] = [
  { id: "e1", turn: 1, title: "22 июня 1941 — вторжение", text: "На рассвете авиация и артиллерия вермахта обрушились на приграничные части. Нарушена связь, смешаны планы прикрытия.", kind: "narrative" },
  { id: "e2", turn: 2, title: "23 июня — Директива № 3", text: "Ставка требует перехода в контрнаступление. Мехкорпусам приказано сосредоточиться и нанести удар.", kind: "card", cardDefId: "sov-directive3", side: "ussr" },
  { id: "e3", turn: 3, title: "24 июня — встречный бой под Расейняем", text: "3-й и 12-й мехкорпуса контратакуют 4-ю танковую группу. Тяжёлые КВ наводят панику в тыловых колоннах.", kind: "card", cardDefId: "sov-raseniai", side: "ussr" },
  { id: "e4", turn: 4, title: "25 июня — дожди", text: "Проходят дожди, грунтовые дороги размыло. Темп наступления снижается.", kind: "weather", weather: "rain" },
  { id: "e5", turn: 5, title: "26 июня — выход к Даугавпилсу", text: "Исторически авангард LVI корпуса прорвался к Двине и захватил мосты у Даугавпилса. Сможете ли вы повторить или предотвратить это?", kind: "narrative" },
  { id: "e6", turn: 6, title: "27 июня —Luftflotte 1 наращивает давление", text: "Люфтваффе усиливает удары по советским коммуникациям.", kind: "card", cardDefId: "ger-luftflotte", side: "germany" },
  { id: "e7", turn: 8, title: "30 июня — прояснение", text: "Погода улучшается, дороги подсыхают.", kind: "weather", weather: "clear" },
  { id: "e8", turn: 10, title: "3 июля — падение Риги", text: "Исторически Рига была оставлена в начале июля. Удержите ли вы залив или захватите его раньше срока?", kind: "narrative" },
  { id: "e9", turn: 14, title: "7 июля — бросок к Острову", text: "Исторически немецкие войска вышли к Острову и Пскову. Решается судьба путей к Ленинграду.", kind: "narrative" },
  { id: "e10", turn: 18, title: "9 июля — итог операции", text: "Операция завершена. Подводятся итоги и историческое сравнение.", kind: "narrative" },
];

const START_DATE = new Date(Date.UTC(1941, 5, 22));

export function dateForTurn(turn: number): string {
  const d = new Date(START_DATE);
  d.setUTCDate(d.getUTCDate() + (turn - 1));
  return d.toISOString().slice(0, 10);
}

function emptyScore(): SideScore {
  return { operationalPoints: 0, territorialPoints: 0, delayPoints: 0, preservationPoints: 0, destructionPoints: 0, objectivePoints: 0, penalties: 0 };
}

export interface NewGameOptions {
  seed?: number;
  matchId?: string;
  mode?: string;
  name?: string;
}

export function createInitialState(options: NewGameOptions = {}): GameState {
  const { hexes, cityHex } = buildWorld();

  // Resolve objective target hexes from city placements.
  const resolvedObjectives = OBJECTIVES.map((o) => {
    if (o.targetHexId && o.targetHexId.startsWith("city-")) {
      const cityId = o.targetHexId.replace("city-", "");
      const real = cityHex[cityId];
      return { ...o, targetHexId: real ?? o.targetHexId };
    }
    return o;
  });

  const units: Record<string, UnitState> = {};
  for (const s of [...GERMAN_UNITS, ...SOVIET_UNITS]) {
    const hexId = placeNear(hexes, s.lon, s.lat, s.qOff ?? 0, s.rOff ?? 0);
    const unit: UnitState = {
      id: s.id,
      entityType: "combat_unit",
      status: "active",
      historicalName: s.name,
      shortName: s.short,
      side: s.side,
      echelon: s.echelon,
      unitType: s.unitType,
      parentCorpsId: s.corps,
      parentArmyId: s.army,
      hexId,
      attack: s.attack,
      defense: s.defense,
      movement: s.movement,
      quality: s.quality,
      morale: s.morale,
      organization: s.organization,
      maxSteps: s.steps,
      currentSteps: s.steps,
      stackingCost: s.stack,
      fuel: s.fuel,
      ammunition: s.ammo,
      supplyState: "full",
      commandState: s.command,
      fatigue: s.side === "ussr" ? 15 : 0,
      movementClass: s.moveClass,
      traits: s.traits,
      commanderId: s.commander,
      statusEffects: [],
      historicalSources: s.sources,
    };
    units[s.id] = unit;
    if (hexes[hexId]) hexes[hexId].stackUnitIds.push(s.id);
  }

  const headquarters: Record<string, HeadquartersState> = {};
  for (const h of HEADQUARTERS) {
    const hexId = placeNear(hexes, h.lon, h.lat, h.qOff ?? 0, h.rOff ?? 0);
    const hq: HeadquartersState = {
      id: h.id,
      entityType: "headquarters",
      status: "active",
      name: h.name,
      historicalName: h.name,
      shortName: h.name.replace(/^Штаб\s+/, "").slice(0, 12),
      side: h.side,
      echelon: h.echelon,
      unitType: "headquarters",
      hexId,
      attack: 0,
      defense: 1,
      movement: h.echelon === "front_hq" ? 3 : 5,
      quality: h.comm,
      morale: 65,
      organization: 70,
      maxSteps: 1,
      currentSteps: 1,
      stackingCost: 1,
      fuel: 70,
      ammunition: 20,
      commandState: "in_command",
      fatigue: 0,
      movementClass: "motorized",
      traits: ["headquarters"],
      commanderId: h.commander,
      statusEffects: [],
      commandRange: h.range,
      commandPoints: h.cp,
      maxCommandPoints: h.cp,
      throughput: h.throughput,
      commQuality: h.comm,
      initiative: h.initiative,
      supplyState: "full",
      parentArmyId: h.parentArmy,
      unitIds: Object.values(units)
        .filter((u) => u.parentCorpsId === h.id || u.parentArmyId === h.id)
        .map((u) => u.id),
      historicalSources: [h.side === "germany" ? SOURCES.oobAGNorth : SOURCES.oobNWF],
      movedThisTurn: false,
    };
    headquarters[h.id] = hq;
    units[h.id] = hq;
    if (hexes[hexId] && !hexes[hexId].stackUnitIds.includes(h.id)) {
      hexes[hexId].stackUnitIds.push(h.id);
    }
  }

  // Build card deck + initial hands.
  const cards: Record<string, CardInstance> = {};
  const hands: Record<Side, string[]> = { germany: [], ussr: [] };
  const deck: string[] = [];
  CARD_DEFS.forEach((def, i) => {
    const instId = `card-${i}`;
    cards[instId] = { id: instId, defId: def.defId, state: "deck" };
    deck.push(instId);
  });
  // Starting hands: 3 cards each, deterministic from available set.
  const startFor = (side: Side, defs: string[]) => {
    defs.slice(0, 3).forEach((defId) => {
      const inst = Object.values(cards).find((c) => c.defId === defId);
      if (inst) {
        inst.state = "hand";
        hands[side].push(inst.id);
      }
    });
  };
  startFor("germany", ["ger-avangard", "ger-luftflotte", "ger-manstein"]);
  startFor("ussr", ["sov-bridge", "sov-collect", "sov-initiative"]);

  const seed = options.seed ?? 19410622;
  const landHexes = Object.values(hexes).filter((hex) => hex.terrain !== "sea" && hex.terrain !== "lake");
  const germanSource = [...landHexes]
    .filter((hex) => hex.control === "germany")
    .sort((a, b) => (a.lon ?? 0) - (b.lon ?? 0))[0];
  const sovietSource = [...landHexes]
    .filter((hex) => hex.control === "ussr")
    .sort((a, b) => (b.lon ?? 0) - (a.lon ?? 0))[0];

  return {
    schemaVersion: 3,
    engineVersion: "0.3.0",
    scenarioVersion: "0.3.0",
    version: 1,
    scenarioId: SCENARIO.id,
    matchId: options.matchId ?? crypto.randomUUID(),
    mode: options.mode ?? "hotseat",
    turn: 1,
    date: dateForTurn(1),
    phase: "morning_report",
    activeSide: "germany",
    initiativeSide: "germany",
    seed,
    rngCursor: 0,
    hexes,
    units,
    headquarters,
    cards,
    playerHands: hands,
    cardDeck: deck.filter((id) => !hands.germany.includes(id) && !hands.ussr.includes(id)),
    objectives: resolvedObjectives,
    scores: { germany: emptyScore(), ussr: emptyScore() },
    weather: { condition: "clear", label: "Ясно", movementModifier: 0, airPointsModifier: 0 },
    airState: { germanyAirPoints: 6, sovietAirPoints: 3, reconRevealedHexIds: [], interdictedHexIds: [] },
    pendingDecisions: [],
    eventLog: [{ type: "TURN_ADVANCED", turn: 1, date: dateForTurn(1) }],
    status: "active",
    activationsThisPhase: { germany: 0, ussr: 0 },
    maxActivationsPerPhase: 6,
    sideActivationDone: { germany: false, ussr: false },
    plans: {
      germany: { side: "germany", orders: [], reactions: [], committed: false },
      ussr: { side: "ussr", orders: [], reactions: [], committed: false },
    },
    impulse: 0,
    contacts: [],
    supplySources: {
      ...(germanSource
        ? {
            "source-germany-west": {
              id: "source-germany-west",
              side: "germany" as const,
              hexId: germanSource.id,
              kind: "map_edge" as const,
              capacity: 12,
              active: true,
              sourceIds: [SOURCES.geo.sourceId],
            },
          }
        : {}),
      ...(sovietSource
        ? {
            "source-ussr-east": {
              id: "source-ussr-east",
              side: "ussr" as const,
              hexId: sovietSource.id,
              kind: "map_edge" as const,
              capacity: 12,
              active: true,
              sourceIds: [SOURCES.geo.sourceId],
            },
          }
        : {}),
    },
    scoreEventIds: [],
    processedCommandIds: [],
    preparedBridgeDemolitions: {},
  };
}

export { CITIES };
