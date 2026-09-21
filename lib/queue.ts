export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];

  const pump = (): void => {
    while (active < max && waiting.length > 0) {
      const start = waiting.shift();
      if (!start) return;
      active += 1;
      start();
    }
  };

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      pump();
    });
    try {
      return await fn();
    } finally {
      active -= 1;
      pump();
    }
  };
}
