export type Level = 'all' | 'yellow' | 'red';
export type RiskLevel = 'red' | 'yellow' | 'green';

export const SITE: string;
export const FROM: { email: string; name: string };
export const REPLY_TO: string;
export const LEVELS: Record<Level, { label: string; long: string }>;
export const C: Record<string, string>;
export const RISK: Record<RiskLevel, { fill: string; text: string; soft: string; label: string }>;
export const SERIF: string;
export const SANS: string;

export function esc(value: unknown): string;
export function button(href: string, label: string): string;
export function riskChip(level: RiskLevel, score?: number): string;
export function emailLayout(p: { title: string; preheader: string; eyebrow: string; body: string; footer: string }): string;
export function footerHtml(p: { reason: string; links?: [string, string][] }): string;
