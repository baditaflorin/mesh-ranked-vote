import { useEffect, useState } from "react";
import { MeshNameInput, type MeshConfig, type YRoom } from "@baditaflorin/mesh-common";

type Props = { room: YRoom | null; config: MeshConfig };

type Option = { label: string };
type Ballot = { name: string; ranking: string[] };

const NAME_KEY = (prefix: string) => `${prefix}:displayName`;
const newId = () => Math.random().toString(36).slice(2, 10);

type Round = {
  counts: Record<string, number>;
  eliminated: string | null;
  exhaustedBallots: number;
  totalActive: number;
};

function runRCV(
  options: Record<string, string>,
  ballots: Ballot[],
): {
  rounds: Round[];
  winner: string | null;
} {
  const rounds: Round[] = [];
  let alive = new Set(Object.keys(options));
  const cleanedBallots = ballots
    .map((b) => b.ranking.filter((r) => options[r]))
    .filter((r) => r.length > 0);

  while (alive.size > 1) {
    const counts: Record<string, number> = {};
    alive.forEach((id) => (counts[id] = 0));
    let exhausted = 0;
    for (const ballot of cleanedBallots) {
      const top = ballot.find((id) => alive.has(id));
      if (top !== undefined) counts[top] = (counts[top] ?? 0) + 1;
      else exhausted++;
    }
    const totalActive = cleanedBallots.length - exhausted;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const top = sorted[0];
    if (top && totalActive > 0 && top[1] * 2 > totalActive) {
      rounds.push({ counts, eliminated: null, exhaustedBallots: exhausted, totalActive });
      return { rounds, winner: top[0] };
    }
    if (sorted.length === 0) {
      rounds.push({ counts, eliminated: null, exhaustedBallots: exhausted, totalActive });
      return { rounds, winner: null };
    }
    const minVotes = sorted[sorted.length - 1]![1];
    let loser: string | null = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const entry = sorted[i]!;
      if (entry[1] === minVotes) {
        loser = entry[0];
        break;
      }
    }
    rounds.push({ counts, eliminated: loser, exhaustedBallots: exhausted, totalActive });
    if (!loser) break;
    alive.delete(loser);
  }

  // last one standing
  const winner = alive.size === 1 ? Array.from(alive)[0]! : null;
  if (winner) {
    const counts: Record<string, number> = { [winner]: 0 };
    let exhausted = 0;
    for (const ballot of cleanedBallots) {
      const top = ballot.find((id) => alive.has(id));
      if (top !== undefined) counts[top] = (counts[top] ?? 0) + 1;
      else exhausted++;
    }
    rounds.push({
      counts,
      eliminated: null,
      exhaustedBallots: exhausted,
      totalActive: cleanedBallots.length - exhausted,
    });
  }
  return { rounds, winner };
}

export function Feature({ room, config }: Props) {
  if (!room) {
    return (
      <div className="rcv-screen">
        <h1>ranked vote</h1>
        <p className="rcv-status">Connecting…</p>
      </div>
    );
  }
  return <Body room={room} config={config} />;
}

function Body({ room, config }: { room: YRoom; config: MeshConfig }) {
  const [name, setName] = useState(
    () => localStorage.getItem(NAME_KEY(config.storagePrefix)) ?? "",
  );
  const [newOption, setNewOption] = useState("");
  const [questionDraft, setQuestionDraft] = useState("");
  const [editingQ, setEditingQ] = useState(false);
  const [tick, rerender] = useState(0);

  useEffect(() => {
    if (name) localStorage.setItem(NAME_KEY(config.storagePrefix), name);
  }, [name, config.storagePrefix]);

  // Test-only handle: expose the live Yjs doc so e2e tests can seed a realistic
  // ballot set (more than the 2 ballots two browser pages can cast through the
  // keyed-by-peerId UI) into the SAME shared doc both peers render from. This is
  // a plain reference — no behaviour change to the production render path.
  useEffect(() => {
    (window as unknown as { __rcvRoom?: typeof room }).__rcvRoom = room;
    return () => {
      delete (window as unknown as { __rcvRoom?: typeof room }).__rcvRoom;
    };
  }, [room]);

  useEffect(() => {
    const options = room.doc.getMap<Option>("options");
    const ballots = room.doc.getMap<Ballot>("ballots");
    const meta = room.doc.getMap<string>("meta");
    const onChange = () => rerender((n) => n + 1);
    options.observe(onChange);
    ballots.observe(onChange);
    meta.observe(onChange);
    return () => {
      options.unobserve(onChange);
      ballots.unobserve(onChange);
      meta.unobserve(onChange);
    };
  }, [room]);

  void tick;
  const optionsMap = room.doc.getMap<Option>("options");
  const ballotsMap = room.doc.getMap<Ballot>("ballots");
  const meta = room.doc.getMap<string>("meta");
  const question = meta.get("question") ?? "";

  const optionDict: Record<string, string> = {};
  optionsMap.forEach((v, k) => (optionDict[k] = v.label));
  const optionList = Object.entries(optionDict).map(([id, label]) => ({ id, label }));
  optionList.sort((a, b) => a.label.localeCompare(b.label));

  const ballotList: Ballot[] = [];
  ballotsMap.forEach((v) => ballotList.push(v));

  const myBallot = ballotsMap.get(room.peerId) ?? { name: name.trim(), ranking: [] };
  const myRanking = myBallot.ranking;
  const unranked = optionList.filter((o) => !myRanking.includes(o.id)).map((o) => o.id);

  const saveBallot = (ranking: string[]) => {
    if (!name.trim() && ranking.length === 0) {
      ballotsMap.delete(room.peerId);
      return;
    }
    ballotsMap.set(room.peerId, { name: name.trim() || "anon", ranking });
  };

  const addToRanking = (id: string) => {
    if (myRanking.includes(id)) return;
    saveBallot([...myRanking, id]);
  };

  const removeFromRanking = (id: string) => {
    saveBallot(myRanking.filter((r) => r !== id));
  };

  const move = (id: string, dir: -1 | 1) => {
    const idx = myRanking.indexOf(id);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= myRanking.length) return;
    const next = myRanking.slice();
    const tmp = next[idx]!;
    next[idx] = next[j]!;
    next[j] = tmp;
    saveBallot(next);
  };

  const addOption = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newOption.trim();
    if (!label) return;
    optionsMap.set(newId(), { label });
    setNewOption("");
  };

  const removeOption = (id: string) => {
    room.doc.transact(() => {
      optionsMap.delete(id);
      ballotsMap.forEach((b, k) => {
        const filtered = b.ranking.filter((r) => r !== id);
        if (filtered.length !== b.ranking.length) {
          ballotsMap.set(k, { ...b, ranking: filtered });
        }
      });
    });
  };

  const saveQuestion = () => {
    meta.set("question", questionDraft.trim());
    setEditingQ(false);
  };

  const { rounds, winner } = runRCV(optionDict, ballotList);

  return (
    <div className="rcv-screen">
      <header className="rcv-header">
        <h1>ranked vote</h1>
        <p className="rcv-status">
          {ballotList.length} {ballotList.length === 1 ? "ballot" : "ballots"} · {optionList.length}{" "}
          {optionList.length === 1 ? "option" : "options"} · {room.peerCount + 1} present
        </p>
      </header>

      <div className="rcv-question">
        {editingQ ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveQuestion();
            }}
            className="rcv-q-edit"
          >
            <input
              value={questionDraft}
              onChange={(e) => setQuestionDraft(e.target.value)}
              placeholder="ask a question"
              autoFocus
              maxLength={200}
            />
            <button type="submit">save</button>
            <button type="button" onClick={() => setEditingQ(false)}>
              cancel
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="rcv-q-display"
            onClick={() => {
              setQuestionDraft(question);
              setEditingQ(true);
            }}
          >
            {question || <em>tap to set a question</em>}
          </button>
        )}
      </div>

      <MeshNameInput
        value={name}
        onChange={setName}
        placeholder="your name"
        maxLength={48}
        className="rcv-name"
      />

      <section className="rcv-ballot">
        <h2 className="rcv-section-title">your ranking</h2>
        {myRanking.length === 0 ? (
          <p className="rcv-empty">pick options below to build your ranking</p>
        ) : (
          <ol className="rcv-rank-list">
            {myRanking.map((id, i) => (
              <li key={id} className="rcv-rank-item">
                <span className="rcv-rank-num">{i + 1}.</span>
                <span className="rcv-rank-label">{optionDict[id] ?? "(removed)"}</span>
                <button
                  type="button"
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label="move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(id, 1)}
                  disabled={i === myRanking.length - 1}
                  aria-label="move down"
                >
                  ↓
                </button>
                <button type="button" onClick={() => removeFromRanking(id)} aria-label="unrank">
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}

        {unranked.length > 0 && (
          <div className="rcv-unranked">
            <h3>unranked</h3>
            <ul className="rcv-tags">
              {unranked.map((id) => (
                <li key={id}>
                  <button type="button" onClick={() => addToRanking(id)}>
                    + {optionDict[id]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rcv-options-mgr">
        <h2 className="rcv-section-title">options</h2>
        <ul className="rcv-tags">
          {optionList.map((o) => (
            <li key={o.id}>
              <span>{o.label}</span>
              <button
                type="button"
                onClick={() => removeOption(o.id)}
                aria-label={`remove ${o.label}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form className="rcv-add" onSubmit={addOption}>
          <input
            value={newOption}
            onChange={(e) => setNewOption(e.target.value)}
            placeholder="add an option"
            maxLength={80}
          />
          <button type="submit" disabled={!newOption.trim()}>
            + add
          </button>
        </form>
      </section>

      <section className="rcv-tally">
        <h2 className="rcv-section-title">live tally</h2>
        {ballotList.length === 0 ? (
          <p className="rcv-empty">no ballots yet</p>
        ) : (
          <>
            {rounds.map((r, i) => (
              <div key={i} className="rcv-round">
                <h3>round {i + 1}</h3>
                <ul>
                  {Object.entries(r.counts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, c]) => {
                      const pct = r.totalActive > 0 ? Math.round((c / r.totalActive) * 100) : 0;
                      return (
                        <li
                          key={id}
                          className={`${id === r.eliminated ? "is-out" : ""} ${
                            id === winner && i === rounds.length - 1 ? "is-winner" : ""
                          }`}
                        >
                          <span className="rcv-round-label">{optionDict[id] ?? "(removed)"}</span>
                          <span className="rcv-round-bar-wrap">
                            <span className="rcv-round-bar" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="rcv-round-count">
                            {c} · {pct}%
                          </span>
                        </li>
                      );
                    })}
                </ul>
                {r.eliminated && (
                  <p className="rcv-eliminated">
                    eliminated: <strong>{optionDict[r.eliminated]}</strong>
                  </p>
                )}
                {r.exhaustedBallots > 0 && (
                  <p className="rcv-exhausted">exhausted ballots: {r.exhaustedBallots}</p>
                )}
              </div>
            ))}
            {winner && (
              <p className="rcv-winner-banner">
                🏆 winner: <strong>{optionDict[winner]}</strong>
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
