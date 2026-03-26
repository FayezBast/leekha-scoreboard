const TOTAL_ROUND_POINTS = 36;
const LOSS_THRESHOLD = 101;
const STORAGE_KEY = "leekha-scoreboard-v1";
const TEAM_COUNT = 2;
const PLAYERS_PER_TEAM = 2;
const PLAYER_COUNT = TEAM_COUNT * PLAYERS_PER_TEAM;

const TEAM_PLAYER_INDEXES = Array.from({ length: TEAM_COUNT }, (_, teamIndex) =>
  Array.from(
    { length: PLAYERS_PER_TEAM },
    (_, playerIndex) => teamIndex * PLAYERS_PER_TEAM + playerIndex,
  ),
);

function createDefaultState() {
  return {
    teams: [
      { name: "Team A", players: ["Player 1", "Player 2"] },
      { name: "Team B", players: ["Player 3", "Player 4"] },
    ],
    rounds: [],
    draft: {
      playerScores: Array(PLAYER_COUNT).fill(0),
    },
  };
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
      fallbackScores[playerIndex] ?? 0,
    ),
  );
}

function getTeamScores(playerScores) {
  return TEAM_PLAYER_INDEXES.map((playerIndexes) =>
    playerIndexes.reduce(
      (teamScore, playerIndex) => teamScore + (playerScores[playerIndex] ?? 0),
      0,
    ),
  );
}

function computeRound(draft) {
  const playerScores = normalizePlayerScores(draft?.playerScores);
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
          clampNumber(round?.playerScores?.[playerIndex], 0, TOTAL_ROUND_POINTS, 0),
      ),
    Array(PLAYER_COUNT).fill(0),
  );
}

function getTeamLabel(team, fallback) {
  const explicitName = String(team?.name ?? "").trim();

  if (explicitName) {
    return explicitName;
  }

  const players = Array.isArray(team?.players)
    ? team.players.map((player) => String(player ?? "").trim()).filter(Boolean)
    : [];

  if (players.length) {
    return players.join(" + ");
  }

  return fallback;
}

function getPlayerName(team, playerIndex, fallback) {
  const rawPlayers = Array.isArray(team?.players) ? team.players : [];
  const explicitName = String(rawPlayers[playerIndex] ?? "").trim();
  return explicitName || fallback;
}

function getPlayerLine(team) {
  const players = Array.isArray(team?.players)
    ? team.players.map((player) => String(player ?? "").trim()).filter(Boolean)
    : [];

  return players.length ? players.join(" / ") : "Add two player names";
}

function joinWithAnd(parts) {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }

  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }

  return `${parts.slice(0, -1).join(", ")}, and ${
    parts[parts.length - 1]
  }`;
}

function getPlayerEntries(teams) {
  return TEAM_PLAYER_INDEXES.flatMap((playerIndexes, teamIndex) =>
    playerIndexes.map((absoluteIndex, playerIndex) => ({
      absoluteIndex,
      teamIndex,
      playerIndex,
      teamLabel: getTeamLabel(teams[teamIndex], `Team ${teamIndex + 1}`),
      name: getPlayerName(
        teams[teamIndex],
        playerIndex,
        `Player ${absoluteIndex + 1}`,
      ),
    })),
  );
}

function getMatchStatus(playerTotals, teams) {
  const playerEntries = getPlayerEntries(teams);
  const crossedByTeam = Array.from({ length: TEAM_COUNT }, () => []);

  playerEntries.forEach((entry) => {
    const score = playerTotals[entry.absoluteIndex];

    if (score >= LOSS_THRESHOLD) {
      crossedByTeam[entry.teamIndex].push({ ...entry, score });
    }
  });

  const crossedTeams = crossedByTeam.map((players) => players.length > 0);

  if (!crossedTeams[0] && !crossedTeams[1]) {
    const playerDanger = playerEntries.map((entry) => ({
      ...entry,
      score: playerTotals[entry.absoluteIndex],
      distance: LOSS_THRESHOLD - playerTotals[entry.absoluteIndex],
    }));
    const smallestDistance = Math.min(
      ...playerDanger.map((player) => player.distance),
    );
    const closestPlayers = playerDanger.filter(
      (player) => player.distance === smallestDistance,
    );
    const names = joinWithAnd(
      closestPlayers.map((player) => `${player.name} (${player.teamLabel})`),
    );

    return {
      type: smallestDistance <= 15 ? "live-danger" : "live",
      dangerTeamIndex: closestPlayers[0].teamIndex,
      dangerPlayerIndexes: closestPlayers.map((player) => player.absoluteIndex),
      message:
        closestPlayers.length === 1
          ? `${names} is ${smallestDistance} points away from 101.`
          : `${names} are ${smallestDistance} points away from 101.`,
    };
  }

  if (crossedTeams[0] && crossedTeams[1]) {
    const crossedPlayers = crossedByTeam.flat();
    const summary = joinWithAnd(
      crossedPlayers.map((player) => `${player.name} (${player.score})`),
    );

    return {
      type: "tie",
      message: `${summary} are at or above 101 on both teams. Decide the table tiebreak.`,
    };
  }

  const losingIndex = crossedTeams[0] ? 0 : 1;
  const winningIndex = losingIndex === 0 ? 1 : 0;
  const losingPlayers = crossedByTeam[losingIndex];
  const losingSummary = joinWithAnd(
    losingPlayers.map((player) => `${player.name} (${player.score})`),
  );

  return {
    type: "finished",
    losingIndex,
    winningIndex,
    losingPlayerIndexes: losingPlayers.map((player) => player.absoluteIndex),
    message: `${losingSummary} hit 101 or more, so ${getTeamLabel(
      teams[losingIndex],
      `Team ${losingIndex + 1}`,
    )} loses. ${getTeamLabel(teams[winningIndex], `Team ${winningIndex + 1}`)} wins.`,
  };
}

function sanitizeTeam(rawTeam, fallbackTeam) {
  const rawPlayers = Array.isArray(rawTeam?.players) ? rawTeam.players : [];

  return {
    name:
      typeof rawTeam?.name === "string" ? rawTeam.name : fallbackTeam.name,
    players: [0, 1].map((playerIndex) =>
      typeof rawPlayers[playerIndex] === "string"
        ? rawPlayers[playerIndex]
        : fallbackTeam.players[playerIndex],
    ),
  };
}

function sanitizeRound(rawRound) {
  if (!Array.isArray(rawRound?.playerScores)) {
    return null;
  }

  const computed = computeRound({
    playerScores: rawRound.playerScores,
  });

  return {
    ...computed,
    createdAt:
      typeof rawRound?.createdAt === "string"
        ? rawRound.createdAt
        : computed.createdAt,
  };
}

function sanitizeState(rawState) {
  const fallback = createDefaultState();
  const rawTeams = Array.isArray(rawState?.teams) ? rawState.teams : [];
  const rawRounds = Array.isArray(rawState?.rounds) ? rawState.rounds : [];

  return {
    teams: [0, 1].map((teamIndex) =>
      sanitizeTeam(rawTeams[teamIndex], fallback.teams[teamIndex]),
    ),
    // Legacy rounds only stored team totals, so they cannot be mapped back to
    // individual players without inventing data.
    rounds: rawRounds.map(sanitizeRound).filter(Boolean),
    draft: {
      playerScores: normalizePlayerScores(
        rawState?.draft?.playerScores,
        fallback.draft.playerScores,
      ),
    },
  };
}

function loadState() {
  if (typeof localStorage === "undefined") {
    return createDefaultState();
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return createDefaultState();
    }

    return sanitizeState(JSON.parse(saved));
  } catch {
    return createDefaultState();
  }
}

function persistState(currentState) {
  if (typeof localStorage === "undefined") {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRoundCount(count) {
  return `${count} round${count === 1 ? "" : "s"}`;
}

let state = loadState();

if (typeof document !== "undefined") {
  const refs = {
    scoreboardGrid: document.querySelector("#scoreboard-grid"),
    statusBanner: document.querySelector("#status-banner"),
    roundForm: document.querySelector("#round-form"),
    roundTotalValue: document.querySelector("#round-total-value"),
    roundValidation: document.querySelector("#round-validation"),
    addRoundButton: document.querySelector("#add-round-button"),
    roundTeamNames: [
      document.querySelector("#round-team-0-name"),
      document.querySelector("#round-team-1-name"),
    ],
    roundTeamTotals: [
      document.querySelector("#round-team-0-total"),
      document.querySelector("#round-team-1-total"),
    ],
    roundPlayerLabels: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
      document.querySelector(`#round-player-${playerIndex}-label`),
    ),
    roundPlayerInputs: Array.from({ length: PLAYER_COUNT }, (_, playerIndex) =>
      document.querySelector(`#round-player-${playerIndex}`),
    ),
    teamNameInputs: [
      document.querySelector("#team-0-name"),
      document.querySelector("#team-1-name"),
    ],
    playerInputs: [
      [
        document.querySelector("#team-0-player-0"),
        document.querySelector("#team-0-player-1"),
      ],
      [
        document.querySelector("#team-1-player-0"),
        document.querySelector("#team-1-player-1"),
      ],
    ],
    historyList: document.querySelector("#history-list"),
    historyEmpty: document.querySelector("#history-empty"),
    roundCount: document.querySelector("#round-count"),
    undoButton: document.querySelector("#undo-button"),
    resetButton: document.querySelector("#reset-button"),
  };

  function teamLabels() {
    return state.teams.map((team, index) =>
      getTeamLabel(team, index === 0 ? "Team A" : "Team B"),
    );
  }

  function playerEntries() {
    return getPlayerEntries(state.teams);
  }

  function totals() {
    return getPlayerTotals(state.rounds);
  }

  function updateInputValue(input, value) {
    if (input && input.value !== value) {
      input.value = value;
    }
  }

  function renderSetupInputs() {
    state.teams.forEach((team, teamIndex) => {
      updateInputValue(refs.teamNameInputs[teamIndex], team.name);
      team.players.forEach((player, playerIndex) => {
        updateInputValue(refs.playerInputs[teamIndex][playerIndex], player);
      });
    });
  }

  function renderScoreboard() {
    const labels = teamLabels();
    const players = playerEntries();
    const playerTotals = totals();
    const teamTotals = getTeamScores(playerTotals);
    const matchStatus = getMatchStatus(playerTotals, state.teams);
    const lastRound = state.rounds[state.rounds.length - 1] ?? null;

    refs.scoreboardGrid.innerHTML = labels
      .map((label, teamIndex) => {
        const teamPlayers = players.filter(
          (player) => player.teamIndex === teamIndex,
        );
        const highestPlayer = teamPlayers.reduce((bestPlayer, player) => {
          if (!bestPlayer) {
            return player;
          }

          return playerTotals[player.absoluteIndex] >
            playerTotals[bestPlayer.absoluteIndex]
            ? player
            : bestPlayer;
        }, null);
        const highestScore = highestPlayer
          ? playerTotals[highestPlayer.absoluteIndex]
          : 0;
        const distance = Math.max(LOSS_THRESHOLD - highestScore, 0);
        const progress = Math.min((highestScore / LOSS_THRESHOLD) * 100, 100);
        const isLosingTeam =
          matchStatus.type === "finished" && matchStatus.losingIndex === teamIndex;
        const playerRows = teamPlayers
          .map((player) => {
            const total = playerTotals[player.absoluteIndex];
            const lastGain = lastRound?.playerScores?.[player.absoluteIndex] ?? null;
            const isEliminated =
              matchStatus.type === "finished" &&
              matchStatus.losingPlayerIndexes?.includes(player.absoluteIndex);

            return `
              <div class="player-total-row ${isEliminated ? "is-eliminated" : ""}">
                <div>
                  <p class="player-total-name">${escapeHtml(player.name)}</p>
                  <p class="player-total-meta">${
                    total >= LOSS_THRESHOLD
                      ? "Reached 101."
                      : `${LOSS_THRESHOLD - total} left before 101.`
                  }</p>
                </div>
                <div class="player-total-side">
                  <span class="player-total-value">${total}</span>
                  ${
                    lastGain !== null
                      ? `<span class="player-round-chip">+${lastGain}</span>`
                      : ""
                  }
                </div>
              </div>
            `;
          })
          .join("");

        return `
          <article class="team-score-card ${isLosingTeam ? "is-losing" : ""}" data-tone="${
            teamIndex === 0 ? "moss" : "accent"
          }">
            <div class="team-card-top">
              <div>
                <h3 class="team-name">${escapeHtml(label)}</h3>
                <p class="team-players">${escapeHtml(
                  getPlayerLine(state.teams[teamIndex]),
                )}</p>
              </div>
              <div class="score-bubble">
                <span class="score-number">${highestScore}</span>
                <span class="score-caption">highest player</span>
              </div>
            </div>
            <div class="meter" aria-hidden="true">
              <div class="meter-fill" style="width: ${progress}%"></div>
            </div>
            <p class="meter-copy">${escapeHtml(
              highestScore >= LOSS_THRESHOLD
                ? `${highestPlayer?.name ?? label} pushed this team past the line.`
                : `${distance} points left before a player on this team hits 101.`,
            )}</p>
            <div class="player-total-list">${playerRows}</div>
            <p class="card-footnote">Combined score: ${teamTotals[teamIndex]}</p>
            <p class="card-footnote">${
              lastRound
                ? escapeHtml(
                    `Last round: ${teamPlayers
                      .map(
                        (player) =>
                          `${player.name} +${lastRound.playerScores[player.absoluteIndex]}`,
                      )
                      .join(" | ")}`,
                  )
                : "No rounds logged yet"
            }</p>
          </article>
        `;
      })
      .join("");

    refs.statusBanner.className = "status-banner";
    refs.statusBanner.textContent = matchStatus.message;

    if (matchStatus.type !== "live") {
      refs.statusBanner.classList.add(`is-${matchStatus.type}`);
    }
  }

  function renderRoundDraft() {
    const labels = teamLabels();
    const preview = computeRound(state.draft);
    const players = playerEntries();
    const difference = TOTAL_ROUND_POINTS - preview.total;
    const isComplete = isRoundComplete(preview);

    refs.roundTotalValue.textContent = `${preview.total} / ${TOTAL_ROUND_POINTS} points`;
    refs.roundTotalValue.classList.toggle("is-invalid", !isComplete);
    refs.addRoundButton.disabled = !isComplete;

    refs.roundTeamNames.forEach((element, teamIndex) => {
      element.textContent = labels[teamIndex];
      refs.roundTeamTotals[teamIndex].textContent = `${preview.teamScores[teamIndex]} pts`;
    });

    players.forEach((player) => {
      refs.roundPlayerLabels[player.absoluteIndex].textContent = player.name;
      updateInputValue(
        refs.roundPlayerInputs[player.absoluteIndex],
        String(preview.playerScores[player.absoluteIndex]),
      );
    });

    refs.roundValidation.hidden = isComplete;

    if (!isComplete) {
      refs.roundValidation.textContent =
        difference > 0
          ? `Add ${difference} more point${difference === 1 ? "" : "s"} to reach 36.`
          : `Remove ${Math.abs(difference)} point${
              Math.abs(difference) === 1 ? "" : "s"
            } to get back to 36.`;
    }
  }

  function renderHistory() {
    const labels = teamLabels();
    const players = playerEntries();

    refs.roundCount.textContent = formatRoundCount(state.rounds.length);
    refs.historyEmpty.hidden = state.rounds.length > 0;
    refs.historyList.hidden = state.rounds.length === 0;

    refs.historyList.innerHTML = [...state.rounds]
      .reverse()
      .map((round, reverseIndex) => {
        const actualIndex = state.rounds.length - reverseIndex;
        const teamBlocks = labels
          .map((label, teamIndex) => {
            const teamPlayers = players.filter(
              (player) => player.teamIndex === teamIndex,
            );

            return `
              <div class="history-team-block" data-tone="${
                teamIndex === 0 ? "moss" : "accent"
              }">
                <p class="history-team-name">${escapeHtml(label)} • ${
                  round.teamScores[teamIndex]
                } pts</p>
                ${teamPlayers
                  .map(
                    (player) => `
                      <div class="history-player-row">
                        <span class="history-player-name">${escapeHtml(
                          player.name,
                        )}</span>
                        <span>${round.playerScores[player.absoluteIndex]} pts</span>
                      </div>
                    `,
                  )
                  .join("")}
              </div>
            `;
          })
          .join("");

        return `
          <article class="history-item">
            <div class="history-top">
              <div>
                <p class="history-round">Round ${actualIndex}</p>
                <p class="history-scoreline">${escapeHtml(
                  labels[0],
                )} ${round.teamScores[0]} - ${round.teamScores[1]} ${escapeHtml(
                  labels[1],
                )}</p>
              </div>
              <span class="history-badge">${round.total} pts</span>
            </div>
            <div class="history-team-grid">${teamBlocks}</div>
          </article>
        `;
      })
      .join("");
  }

  function render() {
    renderSetupInputs();
    renderRoundDraft();
    renderScoreboard();
    renderHistory();
    refs.undoButton.disabled = state.rounds.length === 0;
  }

  function saveAndRender() {
    persistState(state);
    render();
  }

  function updateDraftPlayer(playerIndex, value) {
    state = {
      ...state,
      draft: {
        playerScores: state.draft.playerScores.map((score, currentIndex) =>
          currentIndex === playerIndex
            ? clampNumber(value, 0, TOTAL_ROUND_POINTS, score)
            : score,
        ),
      },
    };

    saveAndRender();
  }

  refs.teamNameInputs.forEach((input, teamIndex) => {
    input.addEventListener("input", (event) => {
      state = {
        ...state,
        teams: state.teams.map((team, index) =>
          index === teamIndex ? { ...team, name: event.target.value } : team,
        ),
      };

      saveAndRender();
    });
  });

  refs.playerInputs.forEach((teamInputs, teamIndex) => {
    teamInputs.forEach((input, playerIndex) => {
      input.addEventListener("input", (event) => {
        state = {
          ...state,
          teams: state.teams.map((team, index) => {
            if (index !== teamIndex) {
              return team;
            }

            return {
              ...team,
              players: team.players.map((player, currentPlayerIndex) =>
                currentPlayerIndex === playerIndex ? event.target.value : player,
              ),
            };
          }),
        };

        saveAndRender();
      });
    });
  });

  refs.roundPlayerInputs.forEach((input, playerIndex) => {
    input.addEventListener("input", (event) => {
      updateDraftPlayer(playerIndex, event.target.value);
    });
  });

  refs.roundForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nextRound = computeRound(state.draft);

    if (!isRoundComplete(nextRound)) {
      renderRoundDraft();
      return;
    }

    state = {
      ...state,
      rounds: [...state.rounds, nextRound],
      draft: {
        playerScores: Array(PLAYER_COUNT).fill(0),
      },
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
    const confirmed = window.confirm(
      "Start a new match and clear all recorded rounds?",
    );

    if (!confirmed) {
      return;
    }

    const fresh = createDefaultState();

    state = {
      ...state,
      rounds: [],
      draft: fresh.draft,
    };

    saveAndRender();
  });

  render();
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
