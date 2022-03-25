export function restart<T extends any[], U>(
  func: (signal: AbortSignal, ...args: T) => Promise<U>
): (...args: T) => Promise<U> {
  let abortController: AbortController | null = null;

  return (...args: T) => {
    if (abortController) {
      abortController.abort();
    }

    abortController = new AbortController();

    const currentAbortController = abortController;
    return func(abortController.signal, ...args).finally(() => {
      if (currentAbortController === abortController) {
        abortController = null;
      }
    });
  };
}
