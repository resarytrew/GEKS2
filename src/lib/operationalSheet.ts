export type MobileSheetState = "collapsed" | "peek" | "full";

/** Pure responsive projection: a map selection exposes, but never force-opens, the sheet. */
export function getMobileSheetView(state: MobileSheetState, hasContext: boolean): MobileSheetState {
  return state === "collapsed" && hasContext ? "peek" : state;
}

export type OperationalTab = "inspect" | "orders" | "situation";

export function isOperationalTab(value: string): value is OperationalTab {
  return value === "inspect" || value === "orders" || value === "situation";
}
