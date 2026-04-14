export type BgTone = 'white' | 'light' | 'blue-light' | 'navy' | 'navy-dark' | 'green';

export function bgClass(bg: BgTone): string {
  return `section--${bg}`;
}
