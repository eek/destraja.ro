// Ceasul timpului treaz: cât a lucrat Mac-ul, fără orele în care a dormit.
//
// Ceasurile lui Node (setTimeout, performance.now, process.hrtime) merg și în somn pe macOS (mach_continuous_time). Pe 25
// noiembrie 2026 capacul s-a închis la 09:44, pe baterie, cu pasul Senatului la MinerU; Mac-ul a dormit până la 13:02, iar
// limita de 180 de minute a pasului, pornită la 09:30, s-a declanșat chiar la trezire, după doar 15 minute de lucru.
// Ceasul de aici se uită la ceas la câteva secunde și adună doar pașii mici: un salt mult mai mare decât intervalul
// înseamnă că procesul a stat (somn, sau doar o trezire scurtă de Power Nap), iar saltul nu se pune la socoteală.
// La fel numără și runTool din lib/pdf-text.mjs limita fiecărui document citit de MinerU.

/**
 * Un ceas care adună doar timpul treaz. `sample()` se cheamă des (cel mult la `maxGapMs`); un salt mai mare de atât
 * numără cât un interval obișnuit (`tickMs`), restul e somn. `now` e un ceas în milisecunde (în teste, unul fals).
 */
export function awakeClock({ tickMs = 5000, maxGapMs = 30_000, now = () => performance.now() } = {}) {
  let last = now();
  let awake = 0;
  let slept = 0;
  const sample = () => {
    const t = now();
    const delta = Math.max(0, t - last);
    last = t;
    if (delta <= maxGapMs) awake += delta;
    else {
      awake += tickMs;
      slept += delta - tickMs;
    }
    return awake;
  };
  return {
    sample,
    /** Timpul treaz de la pornire, în ms (cu o citire nouă a ceasului). */
    awakeMs: () => sample(),
    /** Timpul dormit de la pornire, în ms (cu o citire nouă a ceasului). */
    sleptMs: () => (sample(), slept),
  };
}

/**
 * Ca setTimeout, dar pe timpul treaz: `onExpire` vine după `ms` de lucru, oricât ar fi dormit Mac-ul între timp.
 * Întoarce { clear, clock }. `timers` e pentru teste (setInterval/clearInterval false).
 */
export function awakeTimeout(ms, onExpire, { tickMs = 5000, maxGapMs = 30_000, now, timers = globalThis } = {}) {
  const clock = awakeClock({ tickMs, maxGapMs, now });
  let fired = false;
  const id = timers.setInterval(() => {
    if (fired || clock.sample() < ms) return;
    fired = true;
    timers.clearInterval(id);
    onExpire();
  }, tickMs);
  // Ceasul nu ține procesul în viață: pasul îl ține.
  id?.unref?.();
  return { clear: () => timers.clearInterval(id), clock };
}

/** „1 h 25 min”, „7 min”: cât a dormit Mac-ul, pentru jurnal. */
export function formatSleep(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}
