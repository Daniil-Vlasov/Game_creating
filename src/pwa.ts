/**
 * Установка PWA на главный экран. Chrome присылает `beforeinstallprompt` —
 * сохраняем его, чтобы показать системное окно установки по кнопке в игре.
 */
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPromptEvent;
  listeners.forEach((f) => f());
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  listeners.forEach((f) => f());
});

/** Игра уже запущена как установленное приложение (с главного экрана). */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Браузер готов показать системное окно установки. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  listeners.forEach((f) => f());
  return outcome === 'accepted';
}

export function onInstallStateChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}
