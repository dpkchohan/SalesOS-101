import { useEffect, useState } from "react";

const BUILD_HASH = import.meta.env.VITE_BUILD_HASH as string | undefined;
const BASE_URL = import.meta.env.BASE_URL ?? "/";
const POLL_MS = 5 * 60 * 1000;

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !BUILD_HASH) return;

    async function check() {
      try {
        const res = await fetch(
          `${BASE_URL}version.json?t=${Date.now()}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const { hash } = (await res.json()) as { hash: string };
        if (hash && hash !== BUILD_HASH) setUpdateAvailable(true);
      } catch {
        // silent — network blip, try again next poll
      }
    }

    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, []);

  return updateAvailable;
}
