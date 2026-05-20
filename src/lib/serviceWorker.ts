import { criticalStaticAssets } from "./assets";

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

export async function warmCriticalAssets(): Promise<void> {
  const warmUrls = async (urls: string[], concurrency = 8) => {
    for (let index = 0; index < urls.length; index += concurrency) {
      await Promise.allSettled(
        urls.slice(index, index + concurrency).map((url) =>
          fetch(url, { cache: "force-cache" }).then((response) => {
            if (!response.ok) {
              throw new Error(`Unable to warm ${url}`);
            }
          })
        )
      );
    }
  };

  await warmUrls(criticalStaticAssets);
}
