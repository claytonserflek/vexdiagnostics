import type { SVGProps } from "react";

/** Minimal monochrome line icons -- no icon library dependency, no
 * decorative color. Sized/colored entirely by the caller via CSS. */
function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

export function IconOverview(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2" y="2" width="5" height="5" rx="1" />
      <rect x="9" y="2" width="5" height="8" rx="1" />
      <rect x="2" y="9" width="5" height="5" rx="1" />
      <rect x="9" y="12" width="5" height="2" rx="0.5" />
    </svg>
  );
}

export function IconRun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3 2.5v11l10-5.5-10-5.5z" />
    </svg>
  );
}

export function IconHistory(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8.5" r="5.5" />
      <path d="M8 5.5v3l2 1.5" />
      <path d="M5 1.5 8 2.6 6 3.5" />
    </svg>
  );
}

export function IconCompare(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5 2v11" />
      <path d="M11 2v11" />
      <path d="M2 5h6" />
      <path d="M8 11h6" />
    </svg>
  );
}

export function IconSetup(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
      <path d="M5.5 4V2.8A0.8 0.8 0 0 1 6.3 2h3.4a0.8 0.8 0 0 1 0.8 0.8V4" />
      <path d="M2.5 8h11" />
    </svg>
  );
}

export function IconSettings(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 2.3v1.5M8 12.2v1.5M13.7 8h-1.5M3.8 8H2.3M12 4l-1 1M5 11l-1 1M12 12l-1-1M5 5 4 4" />
    </svg>
  );
}

export function IconMenu(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  );
}

export function IconClose(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  );
}

export function IconChevronRight(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

export function IconUpload(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base({ width: 22, height: 22, viewBox: "0 0 22 22", ...props })}>
      <path d="M11 14.5V4.5" />
      <path d="M6.5 9 11 4.5 15.5 9" />
      <path d="M4 15.5v2a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-2" />
    </svg>
  );
}

export function IconWarning(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M8 2 14.5 13.5H1.5L8 2z" />
      <path d="M8 6.3v3.2" />
      <circle cx="8" cy="11.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconSun(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.5M8 13v1.5M14.5 8H13M3 8H1.5M12.5 3.5l-1 1M4.5 11.5l-1 1M12.5 12.5l-1-1M4.5 4.5l-1-1" />
    </svg>
  );
}

export function IconMoon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M13.5 9.3A5.5 5.5 0 1 1 6.7 2.5a4.3 4.3 0 0 0 6.8 6.8z" />
    </svg>
  );
}
