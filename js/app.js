/*! © 2026 삼대710. 교실 내 비영리 사용 외 복제·수정·상업적 이용 금지 */
(function(){
  const e = window.T;
  const B = window.Backend;
  const R = window.Rating;
  const Renju = window.Renju;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  const CODE_RE = /^[a-z0-9][a-z0-9-]{1,11}$/;
  const accountKey = (cid, loginId) => `${String(cid).trim().toLowerCase()}.${String(loginId).trim().toLowerCase()}`;

  const AI_NAMES = { easy: e("쉬움"), normal: e("보통"), hard: e("어려움") };
  const MATCH_NAMES = { random: e("랜덤 매치"), select: e("1:1 선택 매치"), assigned: e("선생님 배정"), ai: e("AI 대전") };
  const REASON_NAMES = { five: e("오목 완성"), foul: e("흑 금수 반칙패"), resign: e("기권"), timeout: e("시간 초과"), cancel: e("취소") };
  const STATUS_KO = { game: e("경기 중"), queue: e("매칭 중"), idle: e("접속 중"), off: e("오프라인") };

  const S = {
    view: "connect",
    uid: null,
    cid: null,
    isSuper: false,
    isMaster: false,
    masterName: e("선생님"),
    loginKey: "",
    classList: {},
    classMeta: {},
    users: {},
    active: {},
    presence: {},
    queue: {},
    seasons: {},
    settingsRaw: {},
    champion: null,
    stuSideTab: "rank",
    curGameId: null,
    curGame: null,
    spectate: false,
    ghostIdx: -1,
    showNumbers: false
  };

  let classUnsubs = [];
  let gameUnsub = null;
  let inviteUnsub = null;
  let userGamesUnsub = null;
  let userGames = {};
  let boardView = null;
  let timerInterval = null;
  let queueInterval = null;
  let aiTimeout = null;
  let handledInviteId = null;
  let lastKnownTier = null;

  const settings = () => R.mergeSettings(S.settingsRaw);

  const D = {
    path: p => `classes/${S.cid}/${p}`,
    get: p => B.get(`classes/${S.cid}/${p}`),
    set: (p, v) => B.set(`classes/${S.cid}/${p}`, v),
    update: (p, u) => {
      const pref = p ? `classes/${S.cid}/${p.replace(/\/$/, "")}/` : `classes/${S.cid}/`;
      const out = {};
      for (const [k, v] of Object.entries(u || {})) out[pref + k] = v;
      return B.update("", out);
    },
    remove: p => B.remove(`classes/${S.cid}/${p}`),
    on: (p, cb) => B.on(`classes/${S.cid}/${p}`, cb),
    tx: (p, fn) => B.tx(`classes/${S.cid}/${p}`, fn)
  };

  function emblem(tierId) {
    const colors = {
      bronze: ["#cd7f32", "#8c4a19"],
      silver: ["#c0c8d4", "#6b7788"],
      gold: ["#ffd54f", "#b27d00"],
      platinum: ["#4fd1c5", "#0d7a70"],
      diamond: ["#63b3ed", "#2b58c4"],
      master: ["#c084fc", "#6b21a8"],
      challenger: ["#fb7185", "#be123c"],
      champion: ["#fbbf24", "#d97706"],
      placement: ["#9ca3af", "#4b5563"],
      ai: ["#60a5fa", "#1d4ed8"],
      none: ["#9ca3af", "#6b7280"]
    };
    const [c1, c2] = colors[tierId] || colors.none;
    const crown = (tierId === "champion" || tierId === "challenger" || tierId === "master")
      ? `<polygon points="10,9 14,14 20,8 26,14 30,9 28,17 12,17" fill="#fff8dc" opacity=".92"/>`
      : `<circle cx="20" cy="19" r="5" fill="#fff" opacity=".85"/>`;
    return `<svg class="emb" viewBox="0 0 40 40" aria-hidden="true">
      <defs><linearGradient id="g_${tierId}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
      <polygon points="20,2 36,11 36,29 20,38 4,29 4,11" fill="url(#g_${tierId})" stroke="#1f2937" stroke-width="1.5"/>
      ${crown}
    </svg>`;
  }

  function tierOfUid(uid) {
    if (!uid || String(uid).startsWith("ai:")) return { id: "ai", name: "AI" };
    return R.displayTier(S.users[uid], uid, S.champion);
  }

  function nameOf(uid, extra = {}) {
    if (!uid) return "-";
    if (uid === "ai" || String(uid).startsWith("ai:")) return `AI (${AI_NAMES[extra.level || "normal"] || ""})`;
    return (S.users[uid] && S.users[uid].name) || e("알 수 없음");
  }

  function nameTag(uid, size = "", extra = {}) {
    if (!uid) return "";
    if (uid === "ai" || String(uid).startsWith("ai:")) {
      return `<span class="ntag t-ai ${size}">${emblem("ai")}<span class="nm">${esc(nameOf(uid, extra))}</span></span>`;
    }
    const t = tierOfUid(uid);
    return `<span class="ntag t-${t.id} ${size}">${emblem(t.id)}<span class="nm">${esc(nameOf(uid))}</span></span>`;
  }

  function scoreText(uid) {
    const u = S.users[uid];
    if (!u) return "";
    return (u.placed || 0) < R.PLACEMENT_GAMES ? e("배치고사 {0}/{1}", u.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", u.score);
  }

  function status(uid) {
    if (S.active && S.active[uid]) return "game";
    if (S.queue && S.queue[uid]) return "queue";
    if (B.mode === "demo" && S.uid === uid) return "idle";
    const p = S.presence && S.presence[uid];
    if (p && (B.now() - (p.at || 0) < 120000)) return "idle";
    return "off";
  }

  function statusDot(uid) {
    const st = status(uid);
    const cls = st === "game" ? "game" : st === "queue" ? "queue" : st === "idle" ? "on" : "";
    return `<span class="dot ${cls}"></span>`;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function toast(msg, type = "") {
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.textContent = msg;
    $("#toast-root").appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function modal(html) {
    const bg = document.createElement("div");
    bg.className = "modal-bg";
    bg.innerHTML = `<div class="modal">${html}</div>`;
    const close = () => bg.remove();
    bg.addEventListener("click", ev => {
      if (ev.target === bg || ev.target.closest("[data-close]")) close();
    });
    $("#modal-root").appendChild(bg);
    return { el: bg, close };
  }

  function confirmBox(title, bodyHtml, okLabel = e("확인"), danger = false) {
    return new Promise(res => {
      const m = modal(`<h3>${esc(title)}</h3>
        <div style="line-height:1.6;font-size:.94em">${bodyHtml}</div>
        <div class="foot">
          <button type="button" class="btn ghost" data-no>${e("취소")}</button>
          <button type="button" class="btn ${danger ? "danger" : "primary"}" data-yes>${esc(okLabel)}</button>
        </div>`);
      m.el.querySelector("[data-no]").onclick = () => { m.close(); res(false); };
      m.el.querySelector("[data-yes]").onclick = () => { m.close(); res(true); };
    });
  }

  function show(view) {
    if (S.view === "admin" && view !== "admin" && window.Admin) window.Admin.leave();
    S.view = view;
    $$(".screen").forEach(el => el.classList.add("hidden"));
    const target = $(`#view-${view}`);
    if (target) target.classList.remove("hidden");
    if (view === "admin" && window.Admin) window.Admin.enter();
    render();
  }

  function clearClassListeners() {
    classUnsubs.forEach(fn => fn());
    classUnsubs = [];
    if (inviteUnsub) { inviteUnsub(); inviteUnsub = null; }
    if (userGamesUnsub) { userGamesUnsub(); userGamesUnsub = null; }
    S.users = {};
    S.active = {};
    S.presence = {};
    S.queue = {};
    S.seasons = {};
    S.settingsRaw = {};
    S.champion = null;
  }

  async function enterClass(cid) {
    clearClassListeners();
    S.cid = cid || null;
    if (!cid) {
      S.classMeta = {};
      render();
      return;
    }
    S.classMeta = (await B.get(`classes/${cid}/meta`)) || (S.classList && S.classList[cid]) || { name: cid };

    classUnsubs.push(D.on("settings", v => {
      S.settingsRaw = v || {};
      R.applyTiers(S.settingsRaw);
      if (!S.isMaster && v && v.lang && v.lang !== window.I18N.lang) {
        window.I18N.set(v.lang);
      }
      render();
    }));

    classUnsubs.push(D.on("users", v => {
      S.users = v || {};
      S.champion = R.championOf(S.users);
      if (!S.isMaster && S.uid && S.users[S.uid]) {
        const curTier = R.tierOf(S.users[S.uid].score).id;
        if (lastKnownTier && (S.users[S.uid].placed || 0) >= R.PLACEMENT_GAMES && R.tierIndex(S.users[S.uid].score) > R.TIERS.findIndex(t => t.id === lastKnownTier)) {
          window.TierUp && window.TierUp.show(lastKnownTier, curTier);
        }
        lastKnownTier = curTier;
      }
      render();
    }));

    classUnsubs.push(D.on("active", v => {
      S.active = v || {};
      if (!S.isMaster && S.uid) {
        const agid = S.active[S.uid];
        if (agid && S.curGameId !== agid) {
          openGame(agid, { spectate: false });
        }
      }
      render();
    }));

    classUnsubs.push(D.on("presence", v => { S.presence = v || {}; render(); }));
    classUnsubs.push(D.on("queue", v => { S.queue = v || {}; render(); }));
    classUnsubs.push(D.on("seasons", v => { S.seasons = v || {}; render(); }));

    if (!S.isMaster && S.uid) {
      B.setupPresence(`classes/${cid}/presence/${S.uid}`, () => ({ at: B.now() }));
      B.set(`classes/${cid}/presence/${S.uid}`, { at: B.now() }).catch(() => {});

      userGamesUnsub = D.on(`userGames/${S.uid}`, v => { userGames = v || {}; render(); });
      inviteUnsub = D.on(`invites/${S.uid}`, inv => {
        if (!inv || !inv.id || handledInviteId === inv.id) return;
        handledInviteId = inv.id;
        showIncomingInvite(inv);
      });
    }
    render();
  }

  function rankingOrder() {
    const placed = [], placing = [];
    for (const [uid, u] of Object.entries(S.users || {})) {
      if ((u.placed || 0) >= R.PLACEMENT_GAMES) placed.push(uid);
      else placing.push(uid);
    }
    placed.sort((a, b) => {
      const ua = S.users[a], ub = S.users[b];
      return (ub.score - ua.score) || ((ub.wins || 0) - (ua.wins || 0)) || ((ua.losses || 0) - (ub.losses || 0));
    });
    placing.sort((a, b) => String(S.users[a].name).localeCompare(String(S.users[b].name)));
    return { placed, placing };
  }

  // --- 대국 생성 · 진행 · 종료 ---
  async function createPvp(blackUid, whiteUid, mode, matchType, autoStart = true) {
    const gid = B.newKey();
    const now = B.now();
    const uB = S.users[blackUid] || {};
    const uW = S.users[whiteUid] || {};
    const game = {
      id: gid,
      mode,
      matchType,
      black: blackUid,
      white: whiteUid,
      moves: [],
      status: autoStart ? "active" : "waiting",
      ready: autoStart ? { [blackUid]: true, [whiteUid]: true } : {},
      pre: {
        [blackUid]: { score: uB.score ?? R.START_SCORE, placed: uB.placed || 0 },
        [whiteUid]: { score: uW.score ?? R.START_SCORE, placed: uW.placed || 0 }
      },
      createdAt: now,
      turnAt: now
    };
    await D.update("", {
      [`games/${gid}`]: game,
      [`live/${gid}`]: { createdAt: now },
      [`active/${blackUid}`]: gid,
      [`active/${whiteUid}`]: gid
    });
    return gid;
  }

  async function startAiGame(mode, level) {
    const gid = B.newKey();
    const now = B.now();
    const isBlack = Math.random() < 0.5;
    const black = isBlack ? S.uid : `ai:${level}`;
    const white = isBlack ? `ai:${level}` : S.uid;
    const game = {
      id: gid,
      mode: "normal",
      matchType: "ai",
      aiLevel: level,
      black,
      white,
      moves: [],
      status: "active",
      createdAt: now,
      turnAt: now
    };
    await D.update("", {
      [`games/${gid}`]: game,
      [`live/${gid}`]: { createdAt: now },
      [`active/${S.uid}`]: gid
    });
    openGame(gid, { spectate: false });
  }

  async function cancelGame(gid) {
    const g = await D.get(`games/${gid}`);
    if (!g) return;
    const updates = { [`games/${gid}/status`]: "cancelled", [`live/${gid}`]: null };
    if (g.black && !String(g.black).startsWith("ai:")) updates[`active/${g.black}`] = null;
    if (g.white && !String(g.white).startsWith("ai:")) updates[`active/${g.white}`] = null;
    await D.update("", updates);
  }

  async function finalize(gid) {
    const g = await D.get(`games/${gid}`);
    if (!g) { await D.remove(`live/${gid}`); return; }
    const updates = { [`live/${gid}`]: null };
    if (g.black && !String(g.black).startsWith("ai:") && S.active[g.black] === gid) updates[`active/${g.black}`] = null;
    if (g.white && !String(g.white).startsWith("ai:") && S.active[g.white] === gid) updates[`active/${g.white}`] = null;
    await D.update("", updates);
  }

  function openGame(gid, opts = {}) {
    if (gameUnsub) { gameUnsub(); gameUnsub = null; }
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    S.curGameId = gid;
    S.curGame = null;
    S.spectate = !!opts.spectate;
    S.ghostIdx = -1;
    show("game");

    if (!boardView) {
      boardView = new window.BoardView($("#game-canvas"), {
        interactive: true,
        labels: true,
        onTap: onBoardTap
      });
    }

    gameUnsub = D.on(`games/${gid}`, g => {
      S.curGame = g;
      if (!g) return;
      renderGame();
      maybeTriggerAiMove(g);
    });
  }

  function myColor(g) {
    if (!g || S.spectate) return 0;
    if (g.black === S.uid) return 1;
    if (g.white === S.uid) return 2;
    return 0;
  }

  function onBoardTap(idx) {
    const g = S.curGame;
    if (!g || g.status !== "active" || S.spectate) return;
    const mc = myColor(g);
    const moves = g.moves || [];
    const turnColor = moves.length % 2 === 0 ? 1 : 2;
    if (mc !== turnColor) return;
    const board = Renju.boardFromMoves(moves);
    if (board[idx] !== 0) return;

    if (mc === 1) {
      const f = Renju.forbidden(board, idx);
      if (f) {
        toast(`금수 자리입니다 (${Renju.REASON_KO[f]})`, "bad");
        window.Fx && window.Fx.shake($(".board-wrap"));
        return;
      }
    }

    if (settings().confirmMove) {
      if (S.ghostIdx === idx) {
        S.ghostIdx = -1;
        commitMove(idx);
      } else {
        S.ghostIdx = idx;
        renderGame();
      }
    } else {
      commitMove(idx);
    }
  }

  async function commitMove(idx) {
    const g = S.curGame;
    if (!g || g.status !== "active") return;
    const moves = (g.moves || []).slice();
    const color = moves.length % 2 === 0 ? 1 : 2;
    const board = Renju.boardFromMoves(moves);
    if (board[idx] !== 0) return;

    const evalRes = Renju.evaluateMove(board, idx, color);
    moves.push(idx);

    if (evalRes.end === "five") {
      const winner = color === 1 ? g.black : g.white;
      await finishGame(g, moves, { winner, reason: "five", moves: moves.length });
    } else if (evalRes.end === "foul") {
      await finishGame(g, moves, { winner: g.white, reason: "foul", detail: evalRes.reason, moves: moves.length });
    } else if (moves.length >= Renju.N * Renju.N) {
      await finishGame(g, moves, { winner: null, reason: "draw", moves: moves.length });
    } else {
      await D.update(`games/${g.id}`, { moves, turnAt: B.now() });
    }
  }

  function maybeTriggerAiMove(g) {
    if (!g || g.status !== "active" || g.matchType !== "ai" || S.spectate) return;
    const moves = g.moves || [];
    const turnUid = moves.length % 2 === 0 ? g.black : g.white;
    if (!String(turnUid).startsWith("ai:")) return;
    if (aiTimeout) return;
    aiTimeout = setTimeout(async () => {
      aiTimeout = null;
      const cur = S.curGame;
      if (!cur || cur.id !== g.id || cur.status !== "active") return;
      if ((cur.moves || []).length !== moves.length) return;
      const pick = window.OmokAI.pick(moves, cur.aiLevel || "normal");
      if (pick >= 0) await commitMove(pick);
    }, 450);
  }

  async function finishGame(g, finalMoves, result) {
    const now = B.now();
    const isPvp = !String(g.black).startsWith("ai:") && !String(g.white).startsWith("ai:");
    const updates = {
      [`games/${g.id}/moves`]: finalMoves,
      [`games/${g.id}/status`]: "finished",
      [`games/${g.id}/result`]: result,
      [`games/${g.id}/endedAt`]: now,
      [`live/${g.id}`]: null
    };
    if (!String(g.black).startsWith("ai:")) updates[`active/${g.black}`] = null;
    if (!String(g.white).startsWith("ai:")) updates[`active/${g.white}`] = null;

    let deltas = null;
    if (isPvp && g.mode === "rank") {
      const fakeGame = Object.assign({}, g, { result });
      deltas = R.computeRank(fakeGame, S.users, settings(), now);
      updates[`games/${g.id}/deltas`] = deltas;

      for (const uid of [g.black, g.white]) {
        const opp = uid === g.black ? g.white : g.black;
        const won = result.winner === uid;
        const draw = !result.winner;
        const nextUser = R.applyToUser(S.users[uid], deltas[uid], won, draw, opp, now);
        updates[`users/${uid}`] = nextUser;
        updates[`userGames/${uid}/${g.id}`] = {
          ts: now, mode: "rank", opp, won, draw,
          delta: deltas[uid].delta, counted: deltas[uid].counted, note: deltas[uid].note || ""
        };
      }
    } else if (isPvp && g.mode === "normal") {
      for (const uid of [g.black, g.white]) {
        const opp = uid === g.black ? g.white : g.black;
        const won = result.winner === uid;
        const u = Object.assign({}, S.users[uid]);
        if (result.winner) {
          if (won) u.nWins = (u.nWins || 0) + 1;
          else u.nLosses = (u.nLosses || 0) + 1;
        }
        updates[`users/${uid}`] = u;
        updates[`userGames/${uid}/${g.id}`] = { ts: now, mode: "normal", opp, won, draw: !result.winner, delta: 0, counted: false };
      }
    } else if (!isPvp && S.uid) {
      const won = result.winner === S.uid;
      updates[`userGames/${S.uid}/${g.id}`] = { ts: now, mode: "normal", opp: `ai:${g.aiLevel || "normal"}`, won, draw: !result.winner, delta: 0, counted: false };
    }

    if (isPvp) {
      updates[`log/${g.id}`] = {
        ts: now, mode: g.mode, matchType: g.matchType, aiLevel: g.aiLevel || null,
        black: g.black, white: g.white, winner: result.winner || null,
        reason: result.reason, detail: result.detail || null,
        moves: result.moves, deltas
      };
    }

    await D.update("", updates);
  }

  // --- 화면 렌더링 ---
  function render() {
    if (S.view === "auth") {
      const isDemo = B.mode === "demo";
      $("#demo-banner").classList.toggle("hidden", !isDemo);
      const savedCid = localStorage.getItem("omokClassCode");
      if (savedCid && !$("#login-cid").value) $("#login-cid").value = savedCid;
    } else if (S.view === "student") {
      renderStudent();
    } else if (S.view === "game") {
      renderGame();
    } else if (S.view === "admin" && window.Admin) {
      window.Admin.render();
    }
    window.I18N && window.I18N.apply();
  }

  function renderStudent() {
    const me = S.users[S.uid];
    if (!me) return;
    $("#stu-class-name").textContent = (S.classMeta && S.classMeta.name) || S.cid || "";
    $("#stu-me-tag").innerHTML = nameTag(S.uid);

    const st = settings();
    const dCount = R.dayCount(me, B.now());
    $("#stu-daily-pill").textContent = st.dailyLimit > 0 ? `오늘 ${dCount}/${st.dailyLimit}판` : "무제한";
    $("#stu-rank-desc").textContent = `랜덤 매치 ×${st.multRandom} · 1:1 선택 매치 ×${st.multSelect}`;

    const disp = tierOfUid(S.uid);
    const placing = (me.placed || 0) < R.PLACEMENT_GAMES;
    let pct = 100, subText = "";
    if (placing) {
      pct = Math.round(((me.placed || 0) / R.PLACEMENT_GAMES) * 100);
      subText = `${e("배치고사 진행 중")} (${me.placed || 0}/${R.PLACEMENT_GAMES}판 완료)`;
    } else {
      const idx = R.tierIndex(me.score);
      const curTier = R.TIERS[idx];
      const nextTier = R.TIERS[idx + 1];
      if (nextTier) {
        const base = curTier.min === -Infinity ? Math.min(me.score, nextTier.min - 100) : curTier.min;
        pct = Math.max(4, Math.min(100, Math.round(((me.score - base) / (nextTier.min - base)) * 100)));
        subText = e("{0}까지 {1}점", nextTier.name, Math.max(0, nextTier.min - me.score));
      } else {
        subText = disp.id === "champion" ? "현재 우리 반 1위 챔피언!" : "최고 티어 달성!";
      }
    }

    $("#stu-profile").innerHTML = `
      <div class="profile-top">
        <div class="big-emb">${emblem(disp.id)}</div>
        <div>
          <div class="muted" style="font-size:.82em;font-weight:700">${e("현재 티어")}</div>
          <div class="tier-name tier-color-${disp.id}">${esc(disp.name)}</div>
          <div class="score-num">${placing ? e("배치고사 {0}/{1}", me.placed || 0, R.PLACEMENT_GAMES) : e("{0}점", me.score)}</div>
        </div>
      </div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="muted" style="font-size:.84em">${esc(subText)}</div>
      <div class="stats">
        <div><b>${me.wins || 0}승 ${me.losses || 0}패</b><span>랭크 전적</span></div>
        <div><b>${me.nWins || 0}승 ${me.nLosses || 0}패</b><span>일반 전적</span></div>
        <div><b>${(me.wins || 0) + (me.losses || 0) ? Math.round(((me.wins || 0) / ((me.wins || 0) + (me.losses || 0))) * 100) + "%" : "-"}</b><span>랭크 승률</span></div>
      </div>`;

    const side = $("#stu-side-body");
    if (S.stuSideTab === "rank") {
      const { placed, placing: pl } = rankingOrder();
      side.innerHTML = `<ul class="rank-list">
        ${placed.map((uid, i) => {
          const u = S.users[uid];
          return `<li class="${uid === S.uid ? "me" : ""}">
            <span class="no">${i + 1}</span>
            ${statusDot(uid)}
            ${nameTag(uid)}
            <span class="sp"></span>
            <b>${e("{0}점", u.score)}</b>
          </li>`;
        }).join("")}
        ${pl.map(uid => `<li class="${uid === S.uid ? "me" : ""}">
          <span class="no muted">-</span>
          ${statusDot(uid)}
          ${nameTag(uid)}
          <span class="sp"></span>
          <span class="muted">${e("배치고사 {0}/{1}", S.users[uid].placed || 0, R.PLACEMENT_GAMES)}</span>
        </li>`).join("")}
      </ul>${!placed.length && !pl.length ? `<p class="empty">등록된 학생이 없습니다.</p>` : ""}`;
    } else if (S.stuSideTab === "hist") {
      const list = Object.entries(userGames || {}).map(([gid, r]) => Object.assign({ gid }, r)).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30);
      side.innerHTML = list.length ? `<ul class="hist">
        ${list.map(r => {
          const cls = r.draw ? "draw" : r.won ? "win" : "loss";
          const lbl = r.draw ? "무" : r.won ? "승" : "패";
          const dStr = r.mode === "rank" ? (r.counted ? `<span class="delta ${r.delta > 0 ? "up" : r.delta < 0 ? "down" : ""}">${r.delta > 0 ? "+" : ""}${r.delta}</span>` : `<span class="muted">${esc(r.note || "연습")}</span>`) : `<span class="muted">일반</span>`;
          return `<li>
            <span class="res ${cls}">${lbl}</span>
            ${nameTag(r.opp, "", { level: String(r.opp).split(":")[1] })}
            <span class="sp"></span>
            ${dStr}
            <button type="button" class="btn xs ghost" data-replay="${esc(r.gid)}">기보</button>
          </li>`;
        }).join("")}
      </ul>` : `<p class="empty">아직 완료한 경기가 없습니다.</p>`;
    } else {
      side.innerHTML = `<div class="rules">
        <p><b>렌주룰(Renju Rule)</b>은 먼저 두는 <b>흑돌</b>이 너무 유리하지 않도록 제한을 둔 공식 오목 규칙입니다.</p>
        <ul>
          <li><b>흑돌 금지 수 (금수):</b> <b>삼삼(쌍삼)</b>, <b>사사(쌍사)</b>, <b>장목(6목 이상)</b> 자리에는 둘 수 없습니다. 금수 자리에 두면 즉시 반칙패가 됩니다.</li>
          <li><b>흑돌 승리 조건:</b> 정확히 <b>5목</b>을 먼저 만들어야 이깁니다.</li>
          <li><b>백돌 규칙:</b> 금수 제한이 전혀 없으며, 삼삼·사사·6목 이상(장목) 모두 허용되고 <b>5목 이상</b>을 만들면 승리합니다.</li>
        </ul>
      </div>`;
    }
  }

  function renderGame() {
    const g = S.curGame;
    if (!g) return;
    const moves = g.moves || [];
    const turnColor = moves.length % 2 === 0 ? 1 : 2;
    const mc = myColor(g);
    const st = settings();

    const modeTxt = g.mode === "rank" ? e("🏆 랭크전") : e("🎮 일반전");
    const typeTxt = g.matchType === "ai" ? `AI ${AI_NAMES[g.aiLevel] || ""}` : (MATCH_NAMES[g.matchType] || "");
    $("#g-title").textContent = `${modeTxt} · ${typeTxt}`;
    $("#g-spec-tag").classList.toggle("hidden", !S.spectate);
    $("#g-num-btn").classList.toggle("on", S.showNumbers);
    $("#g-resign-btn").classList.toggle("hidden", S.spectate || g.status !== "active" || !mc);

    const renderPcard = (el, uid, color) => {
      const isTurn = g.status === "active" && turnColor === color;
      el.classList.toggle("turn", isTurn);
      const isMe = !S.spectate && uid === S.uid;
      el.innerHTML = `
        <div class="top">
          <span class="stone ${color === 1 ? "b" : "w"}"></span>
          ${nameTag(uid, "", { level: g.aiLevel })}
          ${isMe ? `<span class="you">나</span>` : ""}
          <span class="sp"></span>
          <span class="muted" style="font-size:.82em">${scoreText(uid)}</span>
        </div>
        <div class="timer"><i style="width:${isTurn ? "100%" : "0%"}"></i></div>`;
    };
    renderPcard($("#pcard-black"), g.black, 1);
    renderPcard($("#pcard-white"), g.white, 2);

    const statusEl = $("#g-status");
    statusEl.classList.remove("warn");
    if (g.status === "waiting") {
      statusEl.textContent = "상대방의 준비 완료를 기다리는 중…";
    } else if (g.status === "active") {
      const turnUid = turnColor === 1 ? g.black : g.white;
      if (mc === turnColor) {
        statusEl.textContent = S.ghostIdx >= 0 ? "선택한 위치를 한 번 더 누르거나 아래 [착수]를 누르세요!" : `내 차례입니다 (${moves.length + 1}수)`;
      } else {
        statusEl.textContent = `${nameOf(turnUid, { level: g.aiLevel })} 차례입니다 (${moves.length + 1}수)`;
      }
    } else if (g.status === "finished") {
      const res = g.result || {};
      statusEl.textContent = res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리! (${REASON_NAMES[res.reason] || ""})` : "무승부로 종료되었습니다.";
    } else {
      statusEl.textContent = "취소된 경기입니다.";
    }

    const board = Renju.boardFromMoves(moves);
    const showF = st.showForbidden === "all" || (st.showForbidden === "normal" && g.mode === "normal");
    const forb = (showF && turnColor === 1 && g.status === "active") ? Renju.forbiddenPoints(board) : [];

    boardView && boardView.set({
      moves,
      forbidden: forb,
      ghost: (g.status === "active" && mc === turnColor) ? S.ghostIdx : -1,
      ghostColor: mc || 1,
      numbers: S.showNumbers
    });

    $("#g-confirm-btn").classList.toggle("hidden", !(g.status === "active" && mc === turnColor && st.confirmMove && S.ghostIdx >= 0));

    const ov = $("#board-overlay");
    if (g.status === "finished" && !ov.dataset.dismissed) {
      const res = g.result || {};
      const iWon = mc && res.winner === S.uid;
      const iLost = mc && res.winner && res.winner !== S.uid;
      ov.classList.remove("hidden", "loss");
      if (iLost) ov.classList.add("loss");
      const title = !mc ? (res.winner ? `${nameOf(res.winner, { level: g.aiLevel })} 승리` : "무승부") : (iWon ? e("승리!") : iLost ? e("패배") : e("무승부"));
      const d = g.deltas && S.uid && g.deltas[S.uid];
      const scHtml = d ? `<div class="score-box">${d.counted ? `${d.delta >= 0 ? "+" : ""}${d.delta}점 (현재 ${S.users[S.uid]?.score ?? ""}점)` : esc(d.note || "연습 경기")}</div>` : "";
      $("#ov-card").innerHTML = `
        <h2 class="${iWon ? "win" : iLost ? "loss" : ""}">${esc(title)}</h2>
        <p class="muted" style="margin:4px 0">${esc(REASON_NAMES[res.reason] || "")}${res.detail ? ` (${esc(Renju.REASON_KO[res.detail] || "")})` : ""}</p>
        ${scHtml}
        <div class="foot" style="justify-content:center">
          <button type="button" class="btn" id="ov-view">${e("판 보기")}</button>
          <button type="button" class="btn primary" id="ov-home">${e("홈으로")}</button>
        </div>`;
      $("#ov-view").onclick = () => { ov.dataset.dismissed = "1"; ov.classList.add("hidden"); };
      $("#ov-home").onclick = () => leaveGame();
    } else if (g.status !== "finished") {
      delete ov.dataset.dismissed;
      ov.classList.add("hidden");
    }
  }

  function leaveGame() {
    if (gameUnsub) { gameUnsub(); gameUnsub = null; }
    if (aiTimeout) { clearTimeout(aiTimeout); aiTimeout = null; }
    S.curGameId = null;
    S.curGame = null;
    S.ghostIdx = -1;
    show(S.isMaster ? "admin" : "student");
  }

  // --- 매칭 · 초대 모달 ---
  function startRandomQueue() {
    if (!S.cid || !S.uid) return;
    D.set(`queue/${S.uid}`, { at: B.now(), score: S.users[S.uid]?.score ?? R.START_SCORE });
    const m = modal(`<div class="searching">
      <div class="rings"><i></i><i></i></div>
      <h3>상대를 찾는 중…</h3>
      <p class="muted" style="font-size:.9em">비슷한 티어의 학생이 들어오면 바로 대국이 시작됩니다.</p>
      <button type="button" class="btn ghost" id="q-cancel">매칭 취소</button>
    </div>`);

    const stop = () => {
      if (queueInterval) { clearInterval(queueInterval); queueInterval = null; }
      D.remove(`queue/${S.uid}`).catch(() => {});
      m.close();
    };
    m.el.querySelector("#q-cancel").onclick = stop;

    queueInterval = setInterval(async () => {
      if (S.active[S.uid]) { stop(); return; }
      const entries = Object.entries(S.queue || {}).filter(([u]) => u !== S.uid && !S.active[u]);
      if (!entries.length) return;
      entries.sort((a, b) => a[0].localeCompare(b[0]));
      const [opp] = entries[0];
      if (S.uid < opp) {
        await D.update("", { [`queue/${S.uid}`]: null, [`queue/${opp}`]: null });
        const gid = await createPvp(Math.random() < 0.5 ? S.uid : opp, Math.random() < 0.5 ? opp : S.uid, "rank", "random", true);
        stop();
        openGame(gid, { spectate: false });
      }
    }, 1200);
  }

  function openChallengeModal(mode) {
    const idleList = Object.keys(S.users).filter(u => u !== S.uid && status(u) === "idle");
    const m = modal(`<h3>${mode === "rank" ? "1:1 선택 매치 상대 고르기" : "친구와 대전 상대 고르기"}</h3>
      <div class="pick-list">
        ${idleList.length ? idleList.map(u => `<button type="button" class="pick-item" data-opp="${u}">
          <span>${nameTag(u)}</span>
          <span class="muted">${scoreText(u)}</span>
        </button>`).join("") : `<p class="empty">지금 도전할 수 있는 접속 중인 친구가 없습니다.</p>`}
      </div>
      <div class="foot"><button type="button" class="btn ghost" data-close>${e("닫기")}</button></div>`);

    m.el.querySelectorAll("[data-opp]").forEach(btn => {
      btn.onclick = async () => {
        const opp = btn.dataset.opp;
        m.close();
        const invId = B.newKey();
        await D.set(`invites/${opp}`, { id: invId, from: S.uid, mode, at: B.now() });
        toast(`${nameOf(opp)} 학생에게 대결 신청을 보냈습니다!`, "good");
      };
    });
  }

  function showIncomingInvite(inv) {
    D.remove(`invites/${S.uid}`).catch(() => {});
    if (!S.users[inv.from] || S.active[S.uid] || S.active[inv.from]) return;
    const m = modal(`<h3>대결 신청이 왔어요!</h3>
      <p style="line-height:1.6">${nameTag(inv.from)} 학생이 <b>${inv.mode === "rank" ? "🏆 랭크전 (1:1 선택 매치)" : "🎮 일반전"}</b>을 신청했습니다.</p>
      <div class="foot">
        <button type="button" class="btn ghost" id="inv-no">거절</button>
        <button type="button" class="btn primary" id="inv-yes">수락하고 시작!</button>
      </div>`);
    m.el.querySelector("#inv-no").onclick = () => m.close();
    m.el.querySelector("#inv-yes").onclick = async () => {
      m.close();
      if (S.active[inv.from]) return toast("상대방이 이미 다른 경기를 시작했습니다.", "bad");
      const blackFirst = Math.random() < 0.5;
      const gid = await createPvp(blackFirst ? inv.from : S.uid, blackFirst ? S.uid : inv.from, inv.mode, "select", true);
      openGame(gid, { spectate: false });
    };
  }

  function openAiModal() {
    const m = modal(`<h3>AI 난이도 선택</h3>
      <div class="pick-list">
        <button type="button" class="pick-item" data-lv="easy"><b>🌱 쉬움</b><span class="muted">입문 · 기본 수 읽기</span></button>
        <button type="button" class="pick-item" data-lv="normal"><b>⚔️ 보통</b><span class="muted">공격과 수비 균형</span></button>
        <button type="button" class="pick-item" data-lv="hard"><b>🔥 어려움</b><span class="muted">다음 수까지 예측하는 고수 AI</span></button>
      </div>
      <div class="foot"><button type="button" class="btn ghost" data-close>${e("닫기")}</button></div>`);
    m.el.querySelectorAll("[data-lv]").forEach(btn => {
      btn.onclick = () => { m.close(); startAiGame("normal", btn.dataset.lv); };
    });
  }

  // --- 이벤트 연결 & 부팅 ---
  window.addEventListener("DOMContentLoaded", async () => {
    // 타이머 갱신 루프
    timerInterval = setInterval(() => {
      const g = S.curGame;
      if (!g || g.status !== "active" || g.matchType === "ai") return;
      const st = settings();
      const limit = g.mode === "rank" ? st.moveTimeRank : st.moveTimeNormal;
      if (!limit || limit <= 0) return;
      const elapsed = Math.max(0, (B.now() - (g.turnAt || g.createdAt)) / 1000);
      const left = Math.max(0, limit - elapsed);
      const pct = Math.round((left / limit) * 100);
      const moves = g.moves || [];
      const turnColor = moves.length % 2 === 0 ? 1 : 2;
      const activeCard = $(turnColor === 1 ? "#pcard-black" : "#pcard-white");
      const bar = activeCard && activeCard.querySelector(".timer");
      if (bar) {
        bar.classList.toggle("warn", pct <= 35 && pct > 15);
        bar.classList.toggle("crit", pct <= 15);
        const inner = bar.querySelector("i");
        if (inner) inner.style.width = `${pct}%`;
      }
      if (left <= 0 && !S.spectate && myColor(g) === turnColor) {
        const winner = turnColor === 1 ? g.white : g.black;
        finishGame(g, moves, { winner, reason: "timeout", moves: moves.length });
      }
    }, 250);

    // 로그인 역할 탭 전환
    $("#auth-role-tabs")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-role]");
      if (!btn) return;
      $$("#auth-role-tabs button").forEach(b => b.classList.toggle("on", b === btn));
      const role = btn.dataset.role;
      $("#login-form").classList.toggle("hidden", role === "join");
      $("#join-form").classList.toggle("hidden", role !== "join");
      $("#auth-cid-hint").textContent = role === "teacher" ? "(총관리자는 비워두세요)" : "";
      $("#login-id").placeholder = role === "teacher" ? "master (또는 admin)" : "예: kim01";
    });

    $("#demo-fill-master")?.addEventListener("click", () => {
      $("#auth-role-tabs [data-role='teacher']").click();
      $("#login-cid").value = "";
      $("#login-id").value = "master";
      $("#login-pw").value = "123456";
    });
    $("#demo-fill-stu")?.addEventListener("click", () => {
      $("#auth-role-tabs [data-role='student']").click();
      $("#login-cid").value = "3-2";
      $("#login-id").value = "kim01";
      $("#login-pw").value = "123456";
    });

    // 최초 master 설정 폼
    $("#setup-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const tname = f.tname.value.trim() || e("선생님");
      const pw = f.pw.value.trim();
      const cname = f.cname.value.trim();
      const cid = f.cid.value.trim().toLowerCase();
      const errEl = $("#setup-err");
      errEl.textContent = "";
      if (!CODE_RE.test(cid)) { errEl.textContent = "반 코드는 영문 소문자·숫자·하이픈(-) 2~12자여야 합니다."; return; }
      try {
        const uid = await B.signUpSelf("master", pw);
        const now = B.now();
        await B.update("", {
          "config/master": uid,
          "config/masterName": tname,
          [`classList/${cid}`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/meta`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/pub`]: { name: cname }
        });
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // 로그인 처리
    $("#login-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const cid = f.cid.value.trim().toLowerCase();
      const id = f.id.value.trim().toLowerCase();
      const pw = f.pw.value;
      const errEl = $("#login-err");
      errEl.textContent = "";
      const key = (id === "master" && !cid) ? "master" : accountKey(cid, id);
      try {
        if (cid) localStorage.setItem("omokClassCode", cid);
        await B.signIn(key, pw);
      } catch (err) {
        errEl.textContent = "로그인에 실패했습니다. 반 코드, 아이디, 비밀번호를 확인하세요.";
      }
    });

    // 가입 코드로 새 반 만들기
    $("#join-form")?.addEventListener("submit", async ev => {
      ev.preventDefault();
      const f = ev.target;
      const jcode = f.jcode.value.trim();
      const tname = f.tname.value.trim();
      const cname = f.cname.value.trim();
      const cid = f.cid.value.trim().toLowerCase();
      const pw = f.pw.value;
      const errEl = $("#join-err");
      errEl.textContent = "";
      if (!CODE_RE.test(cid)) { errEl.textContent = "반 코드 형식을 확인하세요."; return; }
      try {
        const realCode = await B.get("config/joinCode");
        if (!realCode || realCode !== jcode) throw new Error("가입 코드가 올바르지 않습니다.");
        if (await B.get(`classes/${cid}/pub`)) throw new Error("이미 사용 중인 반 코드입니다.");
        const uid = await B.signUpSelf(accountKey(cid, "admin"), pw);
        const now = B.now();
        await B.update("", {
          [`members/${uid}`]: { cid, role: "admin" },
          [`classList/${cid}`]: { name: cname, teacherName: tname, createdAt: now },
          [`classes/${cid}/meta`]: { name: cname, teacherName: tname, owner: uid, createdAt: now },
          [`classes/${cid}/pub`]: { name: cname }
        });
        location.reload();
      } catch (err) {
        errEl.textContent = err.message;
      }
    });

    // 로그아웃
    $("#stu-logout")?.addEventListener("click", () => { clearClassListeners(); B.signOut(); });
    $("#admin-logout")?.addEventListener("click", () => { clearClassListeners(); B.signOut(); });

    // 학생 화면 버튼
    $("#btn-rank-random")?.addEventListener("click", startRandomQueue);
    $("#btn-rank-select")?.addEventListener("click", () => openChallengeModal("rank"));
    $("#btn-norm-ai")?.addEventListener("click", openAiModal);
    $("#btn-norm-friend")?.addEventListener("click", () => openChallengeModal("normal"));

    $("#stu-side-tabs")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-stab]");
      if (!btn) return;
      $$("#stu-side-tabs button").forEach(b => b.classList.toggle("on", b === btn));
      S.stuSideTab = btn.dataset.stab;
      renderStudent();
    });

    $("#stu-side-body")?.addEventListener("click", ev => {
      const btn = ev.target.closest("[data-replay]");
      if (btn) openGame(btn.dataset.replay, { spectate: true });
    });

    // 대국 화면 버튼
    $("#g-leave")?.addEventListener("click", leaveGame);
    $("#g-num-btn")?.addEventListener("click", () => { S.showNumbers = !S.showNumbers; renderGame(); });
    $("#g-confirm-btn")?.addEventListener("click", () => {
      if (S.ghostIdx >= 0) {
        const idx = S.ghostIdx;
        S.ghostIdx = -1;
        commitMove(idx);
      }
    });
    $("#g-resign-btn")?.addEventListener("click", async () => {
      const g = S.curGame;
      if (!g || g.status !== "active") return;
      if (!await confirmBox("기권할까요?", "기권하면 상대방의 승리로 경기가 종료됩니다.", "기권하기", true)) return;
      const winner = g.black === S.uid ? g.white : g.black;
      await finishGame(g, g.moves || [], { winner, reason: "resign", moves: (g.moves || []).length });
    });

    // 부팅 & 인증 상태 감시
    if (window.OMOK_NEEDS_CONNECT) {
      show("connect");
      return;
    }

    await B.init();
    B.onAuth(async uid => {
      clearClassListeners();
      S.uid = uid;
      S.isSuper = false;
      S.isMaster = false;
      lastKnownTier = null;

      if (!uid) {
        const masterUid = await B.get("config/master").catch(() => null);
        if (!masterUid && B.mode !== "demo") {
          show("setup");
        } else {
          show("auth");
        }
        return;
      }

      const masterUid = await B.get("config/master").catch(() => null);
      if (masterUid === uid) {
        S.isSuper = true;
        S.isMaster = true;
        S.loginKey = "master";
        S.masterName = (await B.get("config/masterName")) || e("선생님");
        B.on("classList", v => {
          S.classList = v || {};
          if (!S.cid && Object.keys(S.classList).length === 1) {
            enterClass(Object.keys(S.classList)[0]);
          }
          render();
        });
        window.Admin && window.Admin.boot();
        show("admin");
        return;
      }

      const mem = await B.get(`members/${uid}`).catch(() => null);
      if (mem && mem.role === "admin" && mem.cid) {
        S.isMaster = true;
        S.loginKey = accountKey(mem.cid, "admin");
        await enterClass(mem.cid);
        window.Admin && window.Admin.boot();
        show("admin");
        return;
      }

      if (mem && mem.cid) {
        await enterClass(mem.cid);
        show("student");
        return;
      }

      await B.signOut();
      show("auth");
    });
  });

  window.App = {
    S, B, D, R, $, $$, esc,
    CODE_RE, accountKey, AI_NAMES, MATCH_NAMES, REASON_NAMES, STATUS_KO,
    settings, emblem, tierOfUid, nameOf, nameTag, scoreText, status, statusDot, fmtTime,
    toast, modal, confirmBox, show, render, enterClass, rankingOrder,
    createPvp, cancelGame, finalize, openGame
  };
})();
