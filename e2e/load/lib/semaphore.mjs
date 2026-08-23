// Tiny FIFO semaphore. Used to cap how many POST /orders are in flight at
// once, so the demo can be run either as a true thundering herd (unlimited)
// or as a paced rush that the backend can actually keep up with.
export function createSemaphore(limit) {
  if (!limit || limit <= 0) {
    const passthrough = async (fn) => fn();
    return { run: passthrough, limit: Infinity };
  }
  let active = 0;
  const queue = [];

  const release = () => {
    active--;
    const next = queue.shift();
    if (next) next();
  };

  const acquire = () =>
    new Promise((resolve) => {
      if (active < limit) {
        active++;
        resolve();
        return;
      }
      queue.push(() => {
        active++;
        resolve();
      });
    });

  return {
    limit,
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
  };
}
