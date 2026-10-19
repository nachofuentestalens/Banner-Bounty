// Injected clock abstraction (design/studio/contracts.md: "the server never
// accepts a client-supplied now"; architecture.md: no Date.now() inside pure
// game rules — here it is the one place apps/server is allowed to read it,
// behind an interface tests can substitute).
export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}
  now(): Date {
    return this.current;
  }
  set(date: Date): void {
    this.current = date;
  }
}
