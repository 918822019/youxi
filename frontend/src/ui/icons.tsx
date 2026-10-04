/** One geometric icon set, stroke-based, inheriting currentColor — replaces the ad-hoc
 *  Unicode glyphs (◈ ⚙ ▤ ▣ ✦ ✥ ⌖ ⚔) whose rendering varies per platform font. */
interface IconProps {
  size?: number
}

function base(size: number | undefined, fallback: number) {
  const px = size ?? fallback
  return {
    width: px,
    height: px,
    viewBox: '0 0 16 16',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style: { verticalAlign: '-0.15em' as const, display: 'inline-block' as const },
  }
}

export function IconGold({ size }: IconProps) {
  return <svg {...base(size, 14)}><path d="M8 1.6 14.4 8 8 14.4 1.6 8Z" /><path d="M8 5.2 10.8 8 8 10.8 5.2 8Z" /></svg>
}

export function IconGear({ size }: IconProps) {
  return <svg {...base(size, 14)}><circle cx="8" cy="8" r="2.9" /><path d="M8 1.2v2M8 12.8v2M1.2 8h2M12.8 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4" /></svg>
}

export function IconSupply({ size }: IconProps) {
  return <svg {...base(size, 14)}><rect x="2" y="2.8" width="12" height="10.4" /><path d="M2 6.3h12M2 9.7h12" /></svg>
}

export function IconUnit({ size }: IconProps) {
  return <svg {...base(size, 16)}><rect x="2.4" y="2.4" width="11.2" height="11.2" /><rect x="6" y="6" width="4" height="4" fill="currentColor" stroke="none" /></svg>
}

export function IconCrest({ size }: IconProps) {
  return <svg {...base(size, 22)} stroke="none"><path d="M8 .8 9.9 6.1 15.2 8 9.9 9.9 8 15.2 6.1 9.9 .8 8 6.1 6.1Z" fill="currentColor" /></svg>
}

export function IconMove({ size }: IconProps) {
  return <svg {...base(size, 13)}><path d="M8 2.2v11.6M2.2 8h11.6" /><path d="M6.2 4 8 2.2 9.8 4M6.2 12 8 13.8 9.8 12M4 6.2 2.2 8 4 9.8M12 6.2 13.8 8 12 9.8" /></svg>
}

export function IconTarget({ size }: IconProps) {
  return <svg {...base(size, 40)}><circle cx="8" cy="8" r="4.6" /><path d="M8 .9v3M8 12.1v3M.9 8h3M12.1 8h3" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /></svg>
}

export function IconSword({ size }: IconProps) {
  return <svg {...base(size, 12)}><path d="M13.6 2.4 6.8 9.2M13.6 2.4h-2.8M13.6 2.4v2.8" /><path d="M4.6 11.4 2.4 13.6M3.2 9.4l3.4 3.4M2.2 10.4l1.4-1.4 3 3-1.4 1.4Z" /></svg>
}

export function IconRoute({ size }: IconProps) {
  return <svg {...base(size, 12)}><path d="M2.5 13.5h6.8a3.1 3.1 0 0 0 0-6.2H6.7a3.1 3.1 0 0 1 0-6.2h6.8" /><path d="M11.5 3.1 13.5 1.1l2 2" /></svg>
}
