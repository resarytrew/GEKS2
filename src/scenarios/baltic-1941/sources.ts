import type {
  HistoricalSourceRecord,
  HistoricalSourceReference,
} from "@/engine/types";

const ACCESSED_ON = "2026-07-29";

export const SOURCE_REGISTRY = {
  "ag-north": {
    sourceId: "ag-north",
    title: "German Army Group North, 21 June 1941",
    author: "George F. Nafziger",
    url: "https://www.generalstaff.org/NAF/Pt_I_1941-1942/941GFAJ.pdf",
    archive: "Nafziger Collection finding aid / Combined Arms Research Library",
    confidence: "probable",
    kind: "open_oob",
    accessedOn: ACCESSED_ON,
    supports: [
      "Общий состав группы армий «Север» и её крупных соединений накануне вторжения.",
    ],
    limitations: [
      "Открытая компиляция, а не цифровой образ оригинального KTB.",
      "Точные стартовые координаты и игровые характеристики не подтверждает.",
    ],
    notes:
      "Используется вместе с тематической коллекцией Bundesarchiv; игровые позиции реконструированы.",
  },
  nwf: {
    sourceId: "nwf",
    title: "Боевой состав Северо-Западного фронта и распоряжения 8-й армии, июнь 1941",
    archive: "Электронная библиотека исторических документов",
    url: "https://docs.historyrussia.org/ru/nodes/249521-boevoe-rasporyazhenie-komanduyuschego-voyskami-8-y-armii-ot-24-iyunya-1941-g-komandiram-12-go-i-3-go-mehanizirovannyh-korpusov-na-likvidatsiyu-protivnika-24-6-41-g",
    confidence: "reconstructed",
    kind: "primary_document",
    accessedOn: ACCESSED_ON,
    supports: [
      "Совместное использование 12-го и 3-го механизированных корпусов в контрударе 24 июня.",
      "Оперативное подчинение в момент приказа 8-й армии.",
    ],
    limitations: [
      "Документ относится к 24 июня и не является полным OOB на 22 июня.",
      "В прототипе базовая армейская принадлежность 3-го МК задана 11-й армии, 12-го МК — 8-й армии; временные переподчинения моделируются приказами.",
      "Координаты частей и численные параметры — игровая реконструкция.",
    ],
    notes:
      "Иерархия соединений отражает базовое подчинение на старте; оперативные переподчинения не подменяют OOB.",
  },
  raseniai: {
    sourceId: "raseniai",
    title: "Raseiniai tank battle in historiography and sources",
    publisher: "Vilnius University Press, Lietuvos istorijos studijos",
    url: "https://www.journals.vu.lt/lietuvos-istorijos-studijos/lt/article/view/37020",
    confidence: "reconstructed",
    kind: "academic_study",
    accessedOn: ACCESSED_ON,
    supports: [
      "Наличие и общий контекст танковых боёв в районе Расейняя 23–25 июня 1941 года.",
    ],
    limitations: [
      "Статья обсуждает историографические расхождения; она не подтверждает точные игровые гексы и тайминг импульсов.",
      "Боевой эффект карты события является дизайнерской абстракцией.",
    ],
    notes:
      "Событие подтверждено, но его пространственно-временное представление в игре реконструировано.",
  },
  kv: {
    sourceId: "kv",
    title: "Эпизод с тяжёлым танком КВ у Расейняя",
    publisher: "Vilnius University Press, Lietuvos istorijos studijos",
    url: "https://www.journals.vu.lt/lietuvos-istorijos-studijos/lt/article/view/37020",
    confidence: "disputed",
    kind: "academic_study",
    accessedOn: ACCESSED_ON,
    supports: [
      "Присутствие тяжёлых танков КВ в боях 2-й танковой дивизии.",
    ],
    limitations: [
      "Идентификация машины, место, продолжительность эпизода и часть деталей расходятся в изложениях.",
      "В игре это временный оперативный модификатор, а не отдельный танк.",
    ],
    notes:
      "Нельзя представлять популярный рассказ об «одиночном КВ» как полностью подтверждённый набор деталей.",
  },
  dir3: {
    sourceId: "dir3",
    title: "Директива народного комиссара обороны № 3 от 22 июня 1941 года",
    archive: "Электронная библиотека исторических документов",
    url: "https://docs.historyrussia.org/ru/nodes/198897-direktiva-narodnogo-komissara-oborony-locale-nil-3-voennym-sovetam-severo-zapadnogo-zapadnogo-yugo-zapadnogo-i-yuzhnogo-frontov-o-zadachah-voysk-na-23-locale-nil-26-iyunya-22-iyunya-1941-g",
    confidence: "confirmed",
    kind: "primary_document",
    accessedOn: ACCESSED_ON,
    supports: [
      "Существование директивы № 3 и постановку наступательных задач фронтам на 23–26 июня.",
    ],
    limitations: [
      "Бонус инициативы, стоимость CP и запрет отхода — игровые интерпретации, а не буквальные положения документа.",
    ],
    notes:
      "Карточка отделяет подтверждённый документ от реконструированного игрового эффекта.",
  },
  geo: {
    sourceId: "geo",
    title: "География театра военных действий: современная опорная сетка",
    publisher: "OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/",
    confidence: "placeholder",
    kind: "modern_geodata",
    accessedOn: ACCESSED_ON,
    supports: [
      "Современное взаимное положение основных населённых пунктов.",
    ],
    limitations: [
      "Это не точная архивная карта дорог, железных дорог, болот, рек и мостов на июнь 1941 года.",
      "Береговая линия, дорожная сеть и гексовая привязка упрощены ради читаемости.",
    ],
    notes:
      "География — реконструкция, а не точная архивная карта.",
  },
} as const satisfies Record<string, HistoricalSourceRecord>;

export type BalticSourceId = keyof typeof SOURCE_REGISTRY;

export function sourceReference(id: BalticSourceId): HistoricalSourceReference {
  const source = SOURCE_REGISTRY[id];
  return {
    sourceId: source.sourceId,
    title: source.title,
    author: "author" in source ? source.author : undefined,
    archive: "archive" in source ? source.archive : undefined,
    url: source.url,
    confidence: source.confidence,
    notes: source.notes,
  };
}
