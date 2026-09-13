import type confettiDefault from "canvas-confetti";

const PALETTE = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#ffd93a"];

type ConfettiFn = typeof confettiDefault;

let confettiPromise: Promise<ConfettiFn> | null = null;

function loadConfetti(): Promise<ConfettiFn> {
  confettiPromise ??= import("canvas-confetti").then((m) => m.default);
  return confettiPromise;
}

const BASE = { colors: PALETTE, zIndex: 9999, disableForReducedMotion: false };

/** Small fountain from bottom-center — one task checked off. */
export function confettiBurst(): void {
  void loadConfetti()
    .then((confetti) => {
      confetti({
        ...BASE,
        particleCount: 80,
        angle: 90,
        spread: 65,
        startVelocity: 45,
        gravity: 1,
        ticks: 180,
        origin: { x: 0.5, y: 0.9 },
      });
    })
    .catch(() => {});
}

/** Full celebration — the day just hit zero open tasks. */
export function confettiCelebrate(): void {
  void loadConfetti()
    .then((confetti) => {
      const center = { ...BASE, origin: { y: 0.7 } as const };
      confetti({ ...center, particleCount: 130, spread: 100 });
      confetti({ ...center, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.8 } });
      confetti({ ...center, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.8 } });
      setTimeout(() => {
        confetti({ ...center, particleCount: 45, angle: 60, spread: 70, origin: { x: 0 } });
        confetti({ ...center, particleCount: 45, angle: 120, spread: 70, origin: { x: 1 } });
      }, 350);
    })
    .catch(() => {});
}
