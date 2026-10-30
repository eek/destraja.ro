import type { BalanceSummary, BillBalance } from './types';

/** Cât intră pe o casetă: greutățile punctelor, problema cea mai gravă și reparația. Fără fs, ca să meargă și în browser. */
export function summarize(b: BillBalance): NonNullable<BalanceSummary> {
  return { good: b.good.map((x) => x.weight), bad: b.bad.map((x) => x.weight), worst: b.bad[0]?.text ?? null, fix: b.fix };
}
