import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const EMPTY_STATE = {
  heroes: [],
  inventory: [],
  partyOrder: null,
  expedition: { status: "none", checkpointAt: null, cyclesCompletedSinceStart: 0 },
  gold: 0,
  bossClaims: [],
  revision: 0,
};

describe("App shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("shows a loading state before the session check resolves", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    render(<App />);
    expect(screen.getByText("Loading…")).toBeTruthy();
  });

  it("shows the account selector when no session exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({ ok: false, error: { code: "unauthenticated", message: "no session", correlationId: "c1" } }, 401),
        ),
      ),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Banner & Bounty" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Company A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Company B" })).toBeTruthy();
  });

  it("shows the Company screen once a session and account state are available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/dev/session/current")) {
          return Promise.resolve(jsonResponse({ ok: true, data: { accountId: "acc-a", displayName: "Company A" } }));
        }
        if (url.includes("/account/state")) {
          return Promise.resolve(jsonResponse({ ok: true, data: EMPTY_STATE, revision: 0 }));
        }
        return Promise.reject(new Error(`unexpected fetch: ${url}`));
      }),
    );
    render(<App />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Company" })).toBeTruthy());
    expect(screen.getByText("Company A")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Boss" })).toBeTruthy();
  });
});
