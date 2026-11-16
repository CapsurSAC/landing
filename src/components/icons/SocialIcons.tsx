import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base = { viewBox: '0 0 24 24', fill: 'currentColor', 'aria-hidden': true, focusable: false } as const;

export function FacebookIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13.5 21v-7.2h2.4l.4-2.9h-2.8V9.1c0-.8.3-1.4 1.4-1.4h1.5V5.1c-.3 0-1.2-.1-2.2-.1-2.2 0-3.7 1.3-3.7 3.8v2.1H8v2.9h2.5V21h3Z" />
    </svg>
  );
}

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M13.8 3h2.6c.2 1.9 1.4 3.4 3.6 3.7v2.7c-1.4 0-2.6-.4-3.6-1.1v6.4c0 3-2.4 5.3-5.3 5.3S5.8 17.7 5.8 14.7s2.4-5.3 5.3-5.3c.3 0 .6 0 .9.1v2.8a2.6 2.6 0 0 0-.9-.2 2.6 2.6 0 1 0 2.7 2.6V3Z" />
    </svg>
  );
}

export function LinkedInIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.9 8.6H4.2V20h2.7V8.6ZM5.6 4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2ZM20 20h-2.7v-5.6c0-1.5-.5-2.4-1.8-2.4-1 0-1.6.7-1.8 1.3-.1.2-.1.6-.1.9V20h-2.7V8.6h2.7v1.3c.4-.6 1.2-1.5 2.9-1.5 2.1 0 3.5 1.4 3.5 4.3V20Z" />
    </svg>
  );
}

export function YouTubeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12c0 1.6.1 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.3-1.6.4-3.2.4-4.8s-.1-3.2-.4-4.8ZM10 15V9l5.2 3L10 15Z" />
    </svg>
  );
}
