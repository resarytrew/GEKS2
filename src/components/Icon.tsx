import type { ReactNode, SVGProps } from "react";

type IconName = "archive" | "target" | "journal" | "layers" | "report" | "help" | "chevron" | "map" | "orders" | "close" | "compass" | "zoomIn" | "save";

export function Icon({ name, className, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<IconName, ReactNode> = {
    archive: <><path {...common} d="M3 7h18v13H3zM2 3h20v4H2zM9 12h6" /></>,
    target: <><circle {...common} cx="12" cy="12" r="8" /><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    journal: <><path {...common} d="M5 4h13a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2zM5 4v18" /><path {...common} d="M9 9h7M9 13h7" /></>,
    layers: <><path {...common} d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" /></>,
    report: <><path {...common} d="M5 3h14v18H5zM8 16v-4M12 16V8M16 16v-6" /></>,
    help: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="M9.8 9a2.4 2.4 0 1 1 3.8 2c-.9.7-1.6 1.2-1.6 2.5M12 17h.01" /></>,
    chevron: <path {...common} d="m9 5 7 7-7 7" />,
    map: <><path {...common} d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" /></>,
    orders: <><path {...common} d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" /><path {...common} d="m16 15 1.5 1.5L21 13" /></>,
    close: <path {...common} d="m6 6 12 12M18 6 6 18" />,
    compass: <><circle {...common} cx="12" cy="12" r="9" /><path {...common} d="m15 9-2 5-5 2 2-5zM12 3v2" /></>,
    zoomIn: <><circle {...common} cx="10.5" cy="10.5" r="6.5" /><path {...common} d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" /></>,
    save: <><path {...common} d="M5 3h12l3 3v15H5zM8 3v6h8V3M8 20v-6h8v6" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className} {...props}>{paths[name]}</svg>;
}
