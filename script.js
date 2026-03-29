const TOTAL_ROUND_POINTS = 36;
const LOSS_THRESHOLD = 101;
const STORAGE_KEY = "leekha-scoreboard-v1";
const TEAM_COUNT = 2;
const PLAYERS_PER_TEAM = 2;
const PLAYER_COUNT = TEAM_COUNT * PLAYERS_PER_TEAM;
const HEARTS_POOL_POINTS = 13;

const TEAM_PLAYER_INDEXES = Array.from({ length: TEAM_COUNT }, (_, teamIndex) =>
  Array.from(
    { length: PLAYERS_PER_TEAM },
    (_, playerIndex) => teamIndex * PLAYERS_PER_TEAM + playerIndex,
  ),
);

function createDefaultState() {
  return {
    players: ["Player 1", "Player 2", "Player 3", "Player 4"],
    rounds: [],
    draft: createDefaultDraft(),
  };
}

function createDefaultDraft() {
  return {
    hearts: Array(PLAYER_COUNT).fill(0),
    tenDiamondOwner: null,
    queenSpadeOwner: null,
  };
}

function valueOr(value, fallback) {
  return value === null || value === undefined ? fallback : value;
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function normalizePlayerScores(rawScores, fallbackScores = []) {
  const source = Array.isArray(rawScores) ? rawScores : [];

  return Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
    clampNumber(
      source[playerIndex],
      0,
      TOTAL_ROUND_POINTS,
      valueOr(fallbackScores[playerIndex], 0),
    ),
  );
}

function normalizeHearts(rawHearts, fallbackHearts = []) {
  const source = Array.isArray(rawHearts) ? rawHearts : [];

  return Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
    clampNumber(
      source[playerIndex],
      0,
      HEARTS_POOL_POINTS,
      valueOr(fallbackHearts[playerIndex], 0),
    ),
  );
}

function normalizeOwner(value) {
  const index = Number(value);

  if (!Number.isInteger(index)) {
    return null;
  }

  return index >= 0 && index < PLAYER_COUNT ? index : null;
}

function getDraftPlayerScores(draft) {
  if (Array.isArray(draft)) {
    return normalizePlayerScores(draft);
  }

  if (draft && Array.isArray(draft.playerScores)) {
    return normalizePlayerScores(draft.playerScores);
  }

  const hearts = normalizeHearts(draft && draft.hearts);
  const scores = [...hearts];
  const tenDiamondOwner = normalizeOwner(draft && draft.tenDiamondOwner);
  const queenSpadeOwner = normalizeOwner(draft && draft.queenSpadeOwner);

  if (tenDiamondOwner !== null) {
    scores[tenDiamondOwner] += 10;
  }

  if (queenSpadeOwner !== null) {
    scores[queenSpadeOwner] += 13;
  }

  return scores;
}

function getTeamScores(playerScores) {
  return TEAM_PLAYER_INDEXES.map((playerIndexes) =>
    playerIndexes.reduce(
      (teamScore, playerIndex) => teamScore + valueOr(playerScores[playerIndex], 0),
      0,
    ),
  );
}

function computeRound(draft) {
  const playerScores = getDraftPlayerScores(draft);
  const teamScores = getTeamScores(playerScores);

  return {
    playerScores,
    teamScores,
    total: playerScores.reduce((sum, score) => sum + score, 0),
    createdAt: new Date().toISOString(),
  };
}

function isRoundComplete(round) {
  return round.total === TOTAL_ROUND_POINTS;
}

function getPlayerTotals(rounds) {
  return rounds.reduce(
    (totals, round) =>
      totals.map(
        (runningTotal, playerIndex) =>
          runningTotal +
          clampNumber(
            round && round.playerScores ? round.playerScores[playerIndex] : undefined,
            0,
            TOTAL_ROUND_POINTS,
            0,
          ),
      ),
    Array(PLAYER_COUNT).fill(0),
  );
}

function getTeamLabel(teamIndex) {
  return `Team ${teamIndex + 1}`;
}

function displayName(name, playerIndex) {
  const cleaned = String(valueOr(name, "")).trim();
  return cleaned || `Player ${playerIndex + 1}`;
}

function joinWithAnd(parts) {
  if (parts.length <= 1) {
    return valueOr(parts[0], "");
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

function getPlayerEntries(players) {
  return Array.from({ length: PLAYER_COUNT }, (_, absoluteIndex) => {
    const teamIndex = absoluteIndex < PLAYERS_PER_TEAM ? 0 : 1;

    return {
      absoluteIndex,
      teamIndex,
      name: displayName(players[absoluteIndex], absoluteIndex),
      teamLabel: getTeamLabel(teamIndex),
    };
  });
}

function getMatchStatus(playerTotals, players) {
  const entries = getPlayerEntries(players);
  const crossedByTeam = Array.from({ length: TEAM_COUNT }, () => []);

  entries.forEach((entry) => {
    const score = playerTotals[entry.absoluteIndex];

    if (score >= LOSS_THRESHOLD) {
      crossedByTeam[entry.teamIndex].push({ ...entry, score });
    }
  });

  const crossedTeams = crossedByTeam.map((teamPlayers) => teamPlayers.length > 0);

  if (!crossedTeams[0] && !crossedTeams[1]) {
    const dangerList = entries.map((entry) => ({
      ...entry,
      score: playerTotals[entry.absoluteIndex],
      distance: LOSS_THRESHOLD - playerTotals[entry.absoluteIndex],
    }));

    const nearestDistance = Math.min(...dangerList.map((entry) => entry.distance));
    const nearestPlayers = dangerList.filter(
      (entry) => entry.distance === nearestDistance,
    );
    const nearestNames = joinWithAnd(nearestPlayers.map((entry) => entry.name));

    return {
      type: nearestDistance <= 15 ? "live-danger" : "live",
      message:
        nearestPlayers.length === 1
          ? `${nearestNames} is ${nearestDistance} points away from 101.`
          : `${nearestNames} are ${nearestDistance} points away from 101.`,
    };
  }

  if (crossedTeams[0] && crossedTeams[1]) {
    const tiedPlayers = crossedByTeam.flat();
    const names = joinWithAnd(
      tiedPlayers.map((entry) => `${entry.name} (${entry.score})`),
    );

    return {
      type: "tie",
      message: `${names} crossed 101 on both teams. Resolve the table tiebreak.`,
    };
  }

  const losingIndex = crossedTeams[0] ? 0 : 1;
  const winningIndex = losingIndex === 0 ? 1 : 0;
  const losingPlayers = crossedByTeam[losingIndex];
  const names = joinWithAnd(
    losingPlayers.map((entry) => `${entry.name} (${entry.score})`),
  );

  return {
    type: "finished",
    losingIndex,
    winningIndex,
    message: `${names} crossed 101, so ${getTeamLabel(losingIndex)} loses and ${getTeamLabel(
      winningIndex,
    )} wins.`,
  };
}

function sanitizeRound(rawRound) {
  if (!rawRound || !Array.isArray(rawRound.playerScores)) {
    return null;
  }

  const computed = computeRound({
    playerScores: rawRound.playerScores,
  });

  return {
    ...computed,
    createdAt:
      typeof rawRound.createdAt === "string"
        ? rawRound.createdAt
        : computed.createdAt,
  };
}

function extractLegacyPlayers(rawState) {
  if (rawState && Array.isArray(rawState.players)) {
    return rawState.players;
  }

  if (!rawState || !Array.isArray(rawState.teams)) {
    return [];
  }

  return rawState.teams.flatMap((team) =>
    team && Array.isArray(team.players) ? team.players : [],
  );
}

function sanitizeDraft(rawDraft, fallbackDraft) {
  const fallback = valueOr(fallbackDraft, createDefaultDraft());
  const hasStructuredDraft =
    (rawDraft && Array.isArray(rawDraft.hearts)) ||
    Object.prototype.hasOwnProperty.call(rawDraft || {}, "tenDiamondOwner") ||
    Object.prototype.hasOwnProperty.call(rawDraft || {}, "queenSpadeOwner");

  if (hasStructuredDraft) {
    return {
      hearts: normalizeHearts(rawDraft && rawDraft.hearts, fallback.hearts),
      tenDiamondOwner: normalizeOwner(rawDraft && rawDraft.tenDiamondOwner),
      queenSpadeOwner: normalizeOwner(rawDraft && rawDraft.queenSpadeOwner),
    };
  }

  const fallbackHearts = normalizeHearts(fallback.hearts);
  const oldDraftScores = normalizePlayerScores(
    rawDraft && rawDraft.playerScores,
    fallbackHearts,
  );

  return {
    hearts: oldDraftScores.map((score, playerIndex) =>
      clampNumber(score, 0, HEARTS_POOL_POINTS, fallbackHearts[playerIndex]),
    ),
    tenDiamondOwner: null,
    queenSpadeOwner: null,
  };
}

function sanitizeState(rawState) {
  const fallback = createDefaultState();
  const rawPlayers = extractLegacyPlayers(rawState);
  const rawRounds = rawState && Array.isArray(rawState.rounds) ? rawState.rounds : [];

  return {
    players: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) => {
      const candidate = rawPlayers[playerIndex];

      if (typeof candidate !== "string") {
        return fallback.players[playerIndex];
      }

      const cleaned = candidate.trim();
      return cleaned || fallback.players[playerIndex];
    }),
    rounds: rawRounds.map(sanitizeRound).filter(Boolean),
    draft: sanitizeDraft(rawState && rawState.draft, fallback.draft),
  };
}

let storageWritesDisabled = false;

function getLocalStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function loadState() {
  const storage = getLocalStorage();

  if (!storage) {
    return createDefaultState();
  }

  try {
    const saved = storage.getItem(STORAGE_KEY);

    if (!saved) {
      return createDefaultState();
    }

    return sanitizeState(JSON.parse(saved));
  } catch {
    return createDefaultState();
  }
}

function persistState(currentState) {
  if (storageWritesDisabled) {
    return;
  }

  const storage = getLocalStorage();

  if (!storage) {
    storageWritesDisabled = true;
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  } catch {
    storageWritesDisabled = true;
  }
}

function escapeHtml(value) {
  const entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value).replace(/[&<>"']/g, (character) => entityMap[character]);
}

function formatRoundCount(count) {
  return `${count} round${count === 1 ? "" : "s"}`;
}

function formatRoundTime(isoStamp) {
  if (typeof isoStamp !== "string") {
    return "";
  }

  const parsed = new Date(isoStamp);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

let state = loadState();

function bootstrapApp() {
  function pickSelector(selectors) {
    for (const selector of selectors) {
      const match = document.querySelector(selector);

      if (match) {
        return match;
      }
    }

    return null;
  }

  const refs = {
    nameInputs: [
      pickSelector(["#player-name-0", "#team-0-player-0"]),
      pickSelector(["#player-name-1", "#team-0-player-1"]),
      pickSelector(["#player-name-2", "#team-1-player-0"]),
      pickSelector(["#player-name-3", "#team-1-player-1"]),
    ],
    scoreNameLabels: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
      pickSelector([`#score-name-${playerIndex}`, `#round-player-${playerIndex}-label`]),
    ),
    heartsValueOutputs: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
      document.querySelector(`#hearts-value-${playerIndex}`),
    ),
    playerPointsOutputs: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
      document.querySelector(`#player-points-${playerIndex}`),
    ),
    roundTotalPill: pickSelector(["#round-total-pill", "#round-total-value"]),
    heartsRemaining: document.querySelector("#hearts-remaining"),
    roundValidation: document.querySelector("#round-validation"),
    addRoundButton: pickSelector(["#add-round-button"]),
    roundForm: document.querySelector("#round-form"),
    undoButton: document.querySelector("#undo-button"),
    resetButton: document.querySelector("#reset-button"),
    statusBanner: document.querySelector("#status-banner"),
    teamBoard: pickSelector(["#team-board", "#scoreboard-grid"]),
    roundCount: document.querySelector("#round-count"),
    historyEmpty: document.querySelector("#history-empty"),
    historyList: document.querySelector("#history-list"),
    heartSteppers: Array.from(document.querySelectorAll(".heart-stepper")),
    cardButtons: Array.from(document.querySelectorAll(".card-chip")),
  };

  const hasRequiredMarkup = Boolean(
    refs.roundTotalPill &&
      refs.roundValidation &&
      refs.addRoundButton &&
      refs.roundForm &&
      refs.undoButton &&
      refs.resetButton &&
      refs.statusBanner &&
      refs.teamBoard &&
      refs.roundCount &&
      refs.historyEmpty &&
      refs.historyList,
  );

  if (!hasRequiredMarkup) {
    const refreshKey = "leekha-force-refresh-20260329-2";

    try {
      const alreadyRefreshed = window.sessionStorage.getItem(refreshKey) === "1";

      if (!alreadyRefreshed) {
        window.sessionStorage.setItem(refreshKey, "1");
        const refreshedUrl = new URL(window.location.href);
        refreshedUrl.searchParams.set("refresh", "20260329-2");
        window.location.replace(refreshedUrl.toString());
        return;
      }
    } catch {
      // Continue without storage support.
    }

    return;
  }

  function updateInputValue(input, value) {
    if (input && input.value !== value) {
      input.value = value;
    }
  }

  function renderNames() {
    state.players.forEach((name, playerIndex) => {
      updateInputValue(refs.nameInputs[playerIndex], name);

      if (refs.scoreNameLabels[playerIndex]) {
        refs.scoreNameLabels[playerIndex].textContent = displayName(
          name,
          playerIndex,
        );
      }
    });
  }

  function renderRoundDraft() {
    const preview = computeRound(state.draft);
    const difference = TOTAL_ROUND_POINTS - preview.total;
    const isComplete = isRoundComplete(preview);
    const hearts = normalizeHearts(state.draft.hearts);
    const heartsTotal = hearts.reduce((sum, value) => sum + value, 0);
    const heartsRemaining = HEARTS_POOL_POINTS - heartsTotal;
    const hasHeartsComplete = heartsTotal === HEARTS_POOL_POINTS;
    const hasTenDiamond = state.draft.tenDiamondOwner !== null;
    const hasQueenSpade = state.draft.queenSpadeOwner !== null;
    const isReady = isComplete && hasHeartsComplete && hasTenDiamond && hasQueenSpade;

    refs.roundTotalPill.textContent = `${preview.total} / ${TOTAL_ROUND_POINTS} points`;
    refs.roundTotalPill.classList.toggle("is-invalid", !isReady);
    refs.addRoundButton.disabled = !isReady;

    if (refs.heartsRemaining) {
      refs.heartsRemaining.textContent = `Hearts left: ${heartsRemaining}`;
      refs.heartsRemaining.classList.toggle("is-warning", heartsRemaining !== 0);
    }

    hearts.forEach((heartCount, playerIndex) => {
      if (refs.heartsValueOutputs[playerIndex]) {
        refs.heartsValueOutputs[playerIndex].textContent = `${heartCount}♥`;
      }
    });

    preview.playerScores.forEach((score, playerIndex) => {
      if (refs.playerPointsOutputs[playerIndex]) {
        refs.playerPointsOutputs[playerIndex].textContent = `${score} pts`;
      }
    });

    refs.cardButtons.forEach((button) => {
      const playerIndex = Number(button.dataset.player);
      const cardType = button.dataset.card;
      const isActive =
        (cardType === "ten" && state.draft.tenDiamondOwner === playerIndex) ||
        (cardType === "queen" && state.draft.queenSpadeOwner === playerIndex);

      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    refs.heartSteppers.forEach((button) => {
      const playerIndex = Number(button.dataset.player);
      const delta = Number(button.dataset.delta);
      const canAddHeart = delta > 0 ? heartsRemaining > 0 : true;
      const canRemoveHeart = delta < 0 ? hearts[playerIndex] > 0 : true;
      const enabled = canAddHeart && canRemoveHeart;

      button.disabled = !enabled;
      button.setAttribute("aria-disabled", enabled ? "false" : "true");
    });

    refs.roundValidation.hidden = isReady;

    if (!isReady) {
      const notes = [];
      const totalMessage = isComplete
        ? "Point total is correct."
        : difference > 0
          ? `Add ${difference} more point${difference === 1 ? "" : "s"} to reach 36.`
          : `Remove ${Math.abs(difference)} point${
              Math.abs(difference) === 1 ? "" : "s"
            } to get back to 36.`;

      notes.push(totalMessage);

      if (!hasHeartsComplete) {
        notes.push(`${heartsRemaining} heart${heartsRemaining === 1 ? "" : "s"} left.`);
      }

      if (!hasTenDiamond) {
        notes.push("Choose who took 10♦.");
      }

      if (!hasQueenSpade) {
        notes.push("Choose who took Q♠.");
      }

      refs.roundValidation.textContent = notes.join(" ");
    }
  }

  function renderScoreboard() {
    const playerTotals = getPlayerTotals(state.rounds);
    const matchStatus = getMatchStatus(playerTotals, state.players);

    refs.roundCount.textContent = formatRoundCount(state.rounds.length);
    refs.statusBanner.className = "status-banner";
    refs.statusBanner.textContent = matchStatus.message;

    if (matchStatus.type !== "live") {
      refs.statusBanner.classList.add(`is-${matchStatus.type}`);
    }

    refs.teamBoard.innerHTML = TEAM_PLAYER_INDEXES.map(
      (playerIndexes, teamIndex) => {
        const highestPlayerTotal = Math.max(
          ...playerIndexes.map((playerIndex) => playerTotals[playerIndex]),
        );
        const progress = Math.min((highestPlayerTotal / LOSS_THRESHOLD) * 100, 100);
        const isLosingTeam =
          matchStatus.type === "finished" && matchStatus.losingIndex === teamIndex;

        const playersMarkup = playerIndexes
          .map((playerIndex) => {
            const total = playerTotals[playerIndex];
            const crossed = total >= LOSS_THRESHOLD;

            return `
              <div class="board-player ${crossed ? "is-crossed" : ""}">
                <span>${escapeHtml(displayName(state.players[playerIndex], playerIndex))}</span>
                <span>${total}</span>
              </div>
            `;
          })
          .join("");

        return `
          <article class="team-card ${isLosingTeam ? "is-losing" : ""}" data-team="${
            teamIndex + 1
          }">
            <div class="team-top">
              <h3 class="team-title">${getTeamLabel(teamIndex)}</h3>
            </div>
            <div class="progress-track" aria-hidden="true">
              <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
            <div class="team-players">${playersMarkup}</div>
            <p class="team-foot">Highest player on this team: ${highestPlayerTotal}</p>
          </article>
        `;
      },
    ).join("");
  }

  function renderHistory() {
    refs.historyEmpty.hidden = state.rounds.length > 0;
    refs.historyList.hidden = state.rounds.length === 0;

    refs.historyList.innerHTML = [...state.rounds]
      .reverse()
      .map((round, reverseIndex) => {
        const roundNumber = state.rounds.length - reverseIndex;
        const timeCopy = formatRoundTime(round.createdAt);

        const playersMarkup = round.playerScores
          .map(
            (score, playerIndex) => `
              <div class="history-player">
                <span>${escapeHtml(displayName(state.players[playerIndex], playerIndex))}</span>
                <strong>${score}</strong>
              </div>
            `,
          )
          .join("");

        return `
          <article class="history-item">
            <div class="history-top">
              <p class="history-round">Round ${roundNumber}</p>
              <span class="history-meta">${timeCopy ? `at ${timeCopy}` : ""}</span>
            </div>
            <div class="history-players">${playersMarkup}</div>
          </article>
        `;
      })
      .join("");
  }

  function render() {
    renderNames();
    renderRoundDraft();
    renderScoreboard();
    renderHistory();
    refs.undoButton.disabled = state.rounds.length === 0;
  }

  function saveAndRender() {
    persistState(state);
    render();
  }

  function updatePlayerName(playerIndex, value) {
    state = {
      ...state,
      players: state.players.map((name, index) =>
        index === playerIndex ? String(value) : name,
      ),
    };

    saveAndRender();
  }

  function updateDraftHearts(playerIndex, value) {
    const fallbackHearts = normalizeHearts(state.draft.hearts);
    const current = valueOr(fallbackHearts[playerIndex], 0);
    const nextRequested = clampNumber(
      value,
      0,
      HEARTS_POOL_POINTS,
      current,
    );
    const heartsTotal = fallbackHearts.reduce((sum, hearts) => sum + hearts, 0);
    const remaining = HEARTS_POOL_POINTS - heartsTotal;
    const maxIncrease = Math.max(remaining, 0);
    const limitedIncrease = Math.min(
      Math.max(nextRequested - current, 0),
      maxIncrease,
    );
    const nextHearts = nextRequested < current ? nextRequested : current + limitedIncrease;

    state = {
      ...state,
      draft: {
        ...state.draft,
        hearts: fallbackHearts.map((hearts, index) =>
          index === playerIndex ? nextHearts : hearts,
        ),
      },
    };

    saveAndRender();
  }

  function toggleDraftCard(cardType, playerIndex) {
    const key = cardType === "ten" ? "tenDiamondOwner" : "queenSpadeOwner";
    const currentOwner = normalizeOwner(state.draft[key]);
    const nextOwner = currentOwner === playerIndex ? null : playerIndex;

    state = {
      ...state,
      draft: {
        ...state.draft,
        [key]: nextOwner,
      },
    };

    saveAndRender();
  }

  refs.nameInputs.forEach((input, playerIndex) => {
    if (!input) {
      return;
    }

    input.addEventListener("input", (event) => {
      updatePlayerName(playerIndex, event.target.value);
    });
  });

  refs.heartSteppers.forEach((button) => {
    button.addEventListener("click", () => {
      const playerIndex = Number(button.dataset.player);
      const delta = Number(button.dataset.delta);
      const currentHearts = valueOr(
        normalizeHearts(state.draft.hearts)[playerIndex],
        0,
      );

      updateDraftHearts(playerIndex, currentHearts + delta);
    });
  });

  refs.cardButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const playerIndex = Number(button.dataset.player);
      const cardType = button.dataset.card;

      if (cardType !== "ten" && cardType !== "queen") {
        return;
      }

      toggleDraftCard(cardType, playerIndex);
    });
  });

  refs.roundForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nextRound = computeRound(state.draft);
    const hearts = normalizeHearts(state.draft.hearts);
    const heartsTotal = hearts.reduce((sum, value) => sum + value, 0);
    const isReady =
      isRoundComplete(nextRound) &&
      heartsTotal === HEARTS_POOL_POINTS &&
      state.draft.tenDiamondOwner !== null &&
      state.draft.queenSpadeOwner !== null;

    if (!isReady) {
      renderRoundDraft();
      return;
    }

    state = {
      ...state,
      rounds: [...state.rounds, nextRound],
      draft: createDefaultDraft(),
    };

    saveAndRender();
  });

  refs.undoButton.addEventListener("click", () => {
    if (!state.rounds.length) {
      return;
    }

    state = {
      ...state,
      rounds: state.rounds.slice(0, -1),
    };

    saveAndRender();
  });

  refs.resetButton.addEventListener("click", () => {
    const confirmed = window.confirm("Start a new match and clear all rounds?");

    if (!confirmed) {
      return;
    }

    state = {
      ...state,
      rounds: [],
      draft: createDefaultDraft(),
    };

    saveAndRender();
  });

  render();
}

if (typeof document !== "undefined") {
  bootstrapApp();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    TOTAL_ROUND_POINTS,
    LOSS_THRESHOLD,
    TEAM_COUNT,
    PLAYERS_PER_TEAM,
    PLAYER_COUNT,
    createDefaultState,
    computeRound,
    isRoundComplete,
    getPlayerTotals,
    getTeamScores,
    getMatchStatus,
    sanitizeState,
  };
}
