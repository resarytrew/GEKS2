import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "archive"
  | "binoculars"
  | "book"
  | "cards"
  | "chevron"
  | "close"
  | "compass"
  | "dossier"
  | "gear"
  | "journal"
  | "layers"
  | "map"
  | "orders"
  | "radio"
  | "report"
  | "save"
  | "star"
  | "supply"
  | "target"
  | "undo"
  | "redo"
  | "zoomIn"
  | "zoomOut";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.65,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function Icon({
  name,
  className,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, ReactNode> = {
    archive: (
      <>
        <path {...stroke} d="M3 7h18v13H3zM2 3h20v4H2zM9 12h6" />
      </>
    ),
    binoculars: (
      <>
        <path {...stroke} d="M8 9 6.5 4h-2L3 15m13-6 1.5-5h2L21 15M8 9h8M9 15h6" />
        <circle {...stroke} cx="6" cy="16" r="3" />
        <circle {...stroke} cx="18" cy="16" r="3" />
      </>
    ),
    book: (
      <>
        <path {...stroke} d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22z" />
        <path {...stroke} d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22z" />
      </>
    ),
    cards: (
      <>
        <rect {...stroke} x="4" y="5" width="13" height="16" rx="1" />
        <path {...stroke} d="m8 5 2-3 11 7-4 7M7 10h7M7 14h7" />
      </>
    ),
    chevron: <path {...stroke} d="m9 5 7 7-7 7" />,
    close: <path {...stroke} d="m6 6 12 12M18 6 6 18" />,
    compass: (
      <>
        <circle {...stroke} cx="12" cy="12" r="9" />
        <path {...stroke} d="m15 9-2 5-5 2 2-5zM12 3v2" />
      </>
    ),
    dossier: (
      <>
        <path {...stroke} d="M5 3h9l5 5v13H5zM14 3v5h5M8 13h8M8 17h6" />
      </>
    ),
    gear: (
      <>
        <circle {...stroke} cx="12" cy="12" r="3" />
        <path {...stroke} d="m12 2 1 2.2 2.4.7 2-1.4 2 2-1.4 2 .7 2.4L22 12l-2.2 1-.7 2.4 1.4 2-2 2-2-1.4-2.4.7L12 22l-1-2.2-2.4-.7-2 1.4-2-2 1.4-2-.7-2.4L2 12l2.2-1 .7-2.4-1.4-2 2-2 2 1.4 2.4-.7z" />
      </>
    ),
    journal: (
      <>
        <path {...stroke} d="M5 4h13a2 2 0 0 1 2 2v14H7a2 2 0 0 0-2 2zM5 4v18" />
        <path {...stroke} d="M9 9h7M9 13h7" />
      </>
    ),
    layers: (
      <>
        <path {...stroke} d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    map: (
      <>
        <path {...stroke} d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" />
      </>
    ),
    orders: (
      <>
        <path {...stroke} d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
        <path {...stroke} d="m16 15 1.5 1.5L21 13" />
      </>
    ),
    radio: (
      <>
        <rect {...stroke} x="3" y="7" width="18" height="13" rx="1" />
        <path {...stroke} d="m7 7 9-4M7 12h6M7 16h3" />
        <circle {...stroke} cx="17" cy="14" r="2" />
      </>
    ),
    report: (
      <>
        <path {...stroke} d="M5 3h14v18H5zM8 16v-4M12 16V8M16 16v-6" />
      </>
    ),
    save: (
      <>
        <path {...stroke} d="M5 3h12l3 3v15H5zM8 3v6h8V3M8 20v-6h8v6" />
      </>
    ),
    star: (
      <>
        <path {...stroke} d="m12 2.5 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.1l6.2-.9z" />
        <circle {...stroke} cx="12" cy="12" r="2.2" />
      </>
    ),
    supply: (
      <>
        <path {...stroke} d="M3 7h18v12H3zM7 7V4h10v3M3 12h18M8 10v4M16 10v4" />
      </>
    ),
    target: (
      <>
        <circle {...stroke} cx="12" cy="12" r="8" />
        <circle {...stroke} cx="12" cy="12" r="3" />
        <path {...stroke} d="M12 2v3M12 19v3M2 12h3M19 12h3" />
      </>
    ),
    undo: <path {...stroke} d="M9 7 4 12l5 5M5 12h8a6 6 0 0 1 6 6" />,
    redo: <path {...stroke} d="m15 7 5 5-5 5m4-5h-8a6 6 0 0 0-6 6" />,
    zoomIn: (
      <>
        <circle {...stroke} cx="10.5" cy="10.5" r="6.5" />
        <path {...stroke} d="m16 16 5 5M10.5 7.5v6M7.5 10.5h6" />
      </>
    ),
    zoomOut: (
      <>
        <circle {...stroke} cx="10.5" cy="10.5" r="6.5" />
        <path {...stroke} d="m16 16 5 5M7.5 10.5h6" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
