import fs from 'node:fs';
import path from 'node:path';

// De unde a venit Senatul la ultima rulare: de pe VM-ul destraja (citit acolo la 07:30 și 12:30, chiar dacă Mac-ul
// doarme) sau citit de Mac, când lista VM-ului nu era de azi. Scris de scripts/straja-sync.mjs în data/senat-sursa.json.
type VmStatus = {
  listDay?: string;
  listAt?: string;
  listCount?: number;
  failedCount?: number;
  startedAt?: string;
  finishedAt?: string | null;
  ok?: boolean | null;
  error?: string | null;
  pdfsDownloaded?: number;
  durationSec?: number;
  reread?: { due: number; done: number; changed: number; failed: number; left: number } | null;
};
type Source = { day: string; at: string; from: 'vm' | 'mac'; listTime?: string; why?: string | null; vmConfigured?: boolean; fromVm?: number; pdfs?: number; vm?: VmStatus | null };

const time = (iso?: string | null) =>
  iso ? new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '–';

function readSource(): Source | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'senat-sursa.json'), 'utf8')) as Source;
  } catch {
    return null;
  }
}

export default function AdminSenatSource() {
  const s = readSource();
  if (!s) return null;
  const vm = s.vm;
  const rows: [string, string, boolean?][] = [
    ['Rularea Mac-ului', `${time(s.at)}: ${s.from === 'vm' ? `de pe VM, lista din ${s.listTime}` : `citit de Mac${s.why ? ` (${s.why})` : ''}`}`, s.from === 'mac' && s.vmConfigured],
  ];
  if (s.from === 'vm') rows.push(['Aduse de pe VM', `${s.fromVm ?? 0} proiecte noi sau schimbate, ${s.pdfs ?? 0} PDF-uri`]);
  if (vm) {
    rows.push(['Lista pe VM', vm.listAt ? `${time(vm.listAt)}, ${vm.listCount} proiecte în consultare${vm.failedCount ? `, ${vm.failedCount} fișe necitite` : ''}` : 'necitită', !vm.listAt]);
    rows.push([
      'Ultima rulare pe VM',
      vm.finishedAt
        ? `${time(vm.startedAt)}, ${vm.ok ? `gata în ${Math.round((vm.durationSec ?? 0) / 60)} min` : `eroare: ${vm.error}`}${vm.pdfsDownloaded ? `, ${vm.pdfsDownloaded} PDF-uri noi` : ''}`
        : `pornită ${time(vm.startedAt)}, în lucru`,
      vm.ok === false,
    ]);
    if (vm.reread) rows.push(['Recitiri pe VM', `${vm.reread.done} din ${vm.reread.due}, ${vm.reread.changed} schimbate${vm.reread.failed ? `, ${vm.reread.failed} necitite` : ''}${vm.reread.left ? `, ${vm.reread.left} rămase` : ''}`]);
  }
  return (
    <section aria-labelledby="senat-sursa" className="mt-10">
      <h2 id="senat-sursa" className="text-base font-semibold text-ink">
        Senatul: de unde au venit datele
      </h2>
      <p className="mt-1 text-sm text-muted">VM-ul citește Senatul la 07:30 și la 12:30; Mac-ul îl citește singur doar când lista VM-ului nu e de azi.</p>
      <table className="mt-3 w-full max-w-xl text-sm">
        <tbody className="divide-y divide-line">
          {rows.map(([label, value, bad]) => (
            <tr key={label}>
              <td className="py-2 pr-4 align-top text-body">{label}</td>
              <td className={`py-2 text-right ${bad ? 'font-semibold text-risk-red-text' : 'text-muted'}`}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
