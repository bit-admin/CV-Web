export async function registerServiceWorker(): Promise<void> {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        const timeout = window.setTimeout(resolve, 3000);
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            window.clearTimeout(timeout);
            resolve();
          },
          { once: true }
        );
      });
    }
  } catch (error) {
    console.warn("Service worker registration failed", error);
  }
}
