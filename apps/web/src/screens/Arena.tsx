import { useEffect, useRef, useState } from "react";
import { ApiError, NetworkError, get, mutationPayload, post } from "../api.js";
import { runMutation } from "../runMutation.js";
import type { AccountStateController } from "../useAccountState.js";
import type { AccountState, ArenaChallengeResult, SnapshotDetail, SnapshotSummary } from "../types.js";
import { COPY, classCopy } from "../copy.js";
import { isFormationComplete } from "../rules.js";
import { BattleView } from "../components/BattleView.js";

function PublishPanel({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const [pending, setPending] = useState(false);
  const [published, setPublished] = useState(false);
  const partyComplete = isFormationComplete(state);

  async function publish() {
    setPending(true);
    await runMutation(async () => {
      await post("/arena/publish", mutationPayload(state.revision, {}));
      await controller.refetch();
      setPublished(true);
    }, controller);
    setPending(false);
  }

  return (
    <div className="publish-panel">
      <button type="button" onClick={publish} disabled={pending || !partyComplete}>
        {pending ? COPY.state_action_pending.label : COPY.action_publish_snapshot}
      </button>
      {!partyComplete ? <p className="disabled-note">{COPY.disabled_party_incomplete}</p> : null}
      {published ? (
        <p role="status" className="inline-note">
          Team published.
        </p>
      ) : null}
    </div>
  );
}

function SnapshotPreviewPanel({ snapshotId, controller, accountRevision, onRefreshList }: { snapshotId: string; controller: AccountStateController; accountRevision: number; onRefreshList: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ArenaChallengeResult | null>(null);
  // useAccountState returns a new controller object on every state change
  // (including the 5s poll); reading it through a ref keeps the load effect
  // keyed on snapshotId only, so a refetch never wipes the shown result.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;

  useEffect(() => {
    const controller = controllerRef.current;
    panelRef.current?.focus();
    setLoading(true);
    setDetail(null);
    setResult(null);
    get<{ snapshot: SnapshotDetail }>(`/arena/snapshots/${encodeURIComponent(snapshotId)}`)
      .then((envelope) => setDetail(envelope.data.snapshot))
      .catch((err) => {
        if (err instanceof ApiError) controller.handleRejected(err);
        else if (err instanceof NetworkError) controller.pushToast({ kind: "offline", title: "Reconnecting", desc: COPY.state_offline.desc });
      })
      .finally(() => setLoading(false));
  }, [snapshotId]);

  async function challenge() {
    setPending(true);
    await runMutation(async () => {
      const { data } = await post<ArenaChallengeResult>("/arena/challenge", mutationPayload(accountRevision, { snapshotId }));
      setResult(data);
      // A challenge bumps the account revision; refetch so the next mutation
      // (on any screen) does not send a stale expectedRevision and hit 409.
      await controller.refetch();
    }, controller);
    setPending(false);
  }

  return (
    <div className="snapshot-preview-panel" ref={panelRef} tabIndex={-1}>
      <h2 id="snapshot-preview-heading">{COPY.arena_snapshot.title}</h2>
      <p>{COPY.arena_snapshot.body}</p>
      {loading ? <p role="status">{COPY.state_loading.label}</p> : null}
      {detail ? (
        <>
          <p>
            Published {new Date(detail.publishedAt).toLocaleDateString()} under ruleset v{detail.rulesVersion}
          </p>
          <table className="compare-table">
            <thead>
              <tr>
                <th scope="col">Class</th>
                <th scope="col">Level</th>
                <th scope="col">HP</th>
                <th scope="col">ATK</th>
                <th scope="col">DEF</th>
              </tr>
            </thead>
            <tbody>
              {detail.frozenParty.map((member) => {
                const stats = detail.frozenStats.find((s) => s.heroId === member.heroId);
                return (
                  <tr key={member.heroId}>
                    <td>{classCopy(member.primaryClassId).name}</td>
                    <td>{member.level}</td>
                    <td>{stats?.maxHp ?? "—"}</td>
                    <td>{stats?.atk ?? "—"}</td>
                    <td>{stats?.def ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button type="button" onClick={challenge} disabled={pending}>
            {pending ? COPY.state_action_pending.label : COPY.action_challenge}
          </button>
        </>
      ) : null}
      {!loading && !detail ? (
        <button
          type="button"
          onClick={() => {
            onRefreshList();
          }}
        >
          {COPY.action_retry}
        </button>
      ) : null}
      {result ? <BattleView report={result.report} /> : null}
    </div>
  );
}

export function ArenaScreen({ state, controller }: { state: AccountState; controller: AccountStateController }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const [snapshots, setSnapshots] = useState<SnapshotSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const loadList = () => {
    setSnapshots(null);
    get<{ snapshots: SnapshotSummary[] }>("/arena/snapshots?excludeMine=true")
      .then((envelope) => setSnapshots(envelope.data.snapshots))
      .catch((err) => {
        if (err instanceof ApiError) controller.handleRejected(err);
        else if (err instanceof NetworkError) controller.pushToast({ kind: "offline", title: "Reconnecting", desc: COPY.state_offline.desc });
        setSnapshots([]);
      });
  };

  useEffect(() => {
    headingRef.current?.focus();
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="screen screen-arena">
      <h1 ref={headingRef} tabIndex={-1}>
        Arena
      </h1>
      <PublishPanel state={state} controller={controller} />
      <div className="arena-columns">
        <section aria-labelledby="opponent-list-heading">
          <h2 id="opponent-list-heading">Opponents</h2>
          {snapshots === null ? (
            <p role="status">{COPY.state_loading.label}</p>
          ) : snapshots.length === 0 ? (
            <div className="empty-state">
              <p>{COPY.arena_no_opponent.title}</p>
              <p>{COPY.arena_no_opponent.desc}</p>
            </div>
          ) : (
            <ul className="opponent-list">
              {snapshots.map((snapshot) => (
                <li key={snapshot.snapshotId}>
                  <button type="button" onClick={() => setSelected(snapshot.snapshotId)} aria-expanded={selected === snapshot.snapshotId}>
                    {snapshot.heroClasses.map((c) => classCopy(c).name).join(" / ")} — published {new Date(snapshot.publishedAt).toLocaleDateString()} under ruleset v{snapshot.rulesVersion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        {selected ? <SnapshotPreviewPanel snapshotId={selected} controller={controller} accountRevision={state.revision} onRefreshList={loadList} /> : null}
      </div>
    </main>
  );
}
