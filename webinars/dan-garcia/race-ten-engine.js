export const TARGET = 10;

const isTotal = (total) => Number.isInteger(total) && total >= 0 && total <= TARGET;

export function legalMoves(total) {
  if (!isTotal(total)) return [];
  return [1, 2].filter((amount) => total + amount <= TARGET);
}

// A position wins when at least one move leaves the next player a losing position.
const winningPositions = Array(TARGET + 1).fill(false);
for (let total = TARGET - 1; total >= 0; total -= 1) {
  winningPositions[total] = legalMoves(total).some((amount) => !winningPositions[total + amount]);
}

export function solvePosition(total) {
  return isTotal(total) ? winningPositions[total] : false;
}

export function chooseComputerMove(total) {
  const moves = legalMoves(total);
  return moves.find((amount) => !solvePosition(total + amount)) ?? moves[0] ?? null;
}

export function createGame() {
  return { total: 0, turn: 'you', winner: null, history: [] };
}

export function playMove(state, amount) {
  if (!state || typeof state !== 'object' || !isTotal(state.total)
    || state.winner !== null || !['you', 'computer'].includes(state.turn)
    || !Array.isArray(state.history) || !legalMoves(state.total).includes(amount)) {
    return state;
  }

  const total = state.total + amount;
  const winner = total === TARGET ? state.turn : null;
  return {
    total,
    turn: winner ? null : (state.turn === 'you' ? 'computer' : 'you'),
    winner,
    history: [...state.history, { player: state.turn, amount, total }],
  };
}
