import { TARGET, createGame, legalMoves, playMove, chooseComputerMove } from './race-ten-engine.js';

const game = document.querySelector('#strategy-game');
if (game) {
  const total = game.querySelector('#race-total');
  const turn = game.querySelector('#race-turn');
  const playfield = game.querySelector('#race-playfield');
  const feedback = game.querySelector('#race-feedback');
  const history = game.querySelector('#race-history');
  const reset = game.querySelector('#race-reset');
  const buttons = [...game.querySelectorAll('[data-add]')];
  const positions = [...game.querySelectorAll('[data-position]')];
  let state = createGame();
  let computerTimer;

  function render(message) {
    total.textContent = state.total;
    turn.textContent = state.winner ? (state.winner === 'you' ? 'You win!' : 'Computer wins') : (state.turn === 'you' ? 'Your turn' : 'Computer’s turn');
    playfield.dataset.turn = state.turn || 'finished';
    playfield.dataset.result = state.winner || '';
    const available = legalMoves(state.total);
    for (const button of buttons) {
      const amount = Number(button.dataset.add);
      // Keep keyboard focus in place while the computer thinks. The click
      // handler rejects unavailable moves; native disabling would lose focus.
      button.disabled = false;
      button.setAttribute('aria-disabled', String(state.turn !== 'you' || !available.includes(amount)));
      button.querySelector('span').textContent = state.winner ? 'Finished' : state.total + amount <= TARGET ? `${state.total} → ${state.total + amount}` : 'Past 10';
      button.setAttribute('aria-label', state.winner ? `Add ${amount} unavailable: game finished` : state.total + amount <= TARGET ? `Add ${amount}, bringing the total to ${state.total + amount}` : `Add ${amount} unavailable: would pass 10`);
    }
    for (const position of positions) {
      const value = Number(position.dataset.position);
      const move = state.history.find(item => item.total === value);
      if (move) position.dataset.player = move.player;
      else delete position.dataset.player;
      if (value === state.total) position.setAttribute('aria-current', 'step');
      else position.removeAttribute('aria-current');
    }
    history.textContent = state.history.length ? state.history.map(move => `${move.player === 'you' ? 'You' : 'Computer'} +${move.amount} → ${move.total}`).join(' · ') : 'Your moves will appear here.';
    if (message) feedback.textContent = message;
    reset.disabled = false;
  }

  function endMessage(winner) {
    return winner === 'you'
      ? 'You reached 10 first! The winning checkpoints are 1, 4, 7, 10. Reveal the strategy to see why.'
      : 'The computer reached 10 first. Try again: can you end your turns at 1, 4, 7, 10? Reveal the strategy for the explanation.';
  }

  for (const button of buttons) button.addEventListener('click', () => {
    if (state.turn !== 'you' || state.winner) return;
    const amount = Number(button.dataset.add);
    const next = playMove(state, amount);
    if (next === state) return;
    state = next;
    render(state.winner ? endMessage(state.winner) : `You added ${amount}: the total is ${state.total}. The computer is choosing its move…`);
    if (state.winner) { reset.focus({ preventScroll: true }); return; }
    computerTimer = window.setTimeout(() => {
      const choice = chooseComputerMove(state.total);
      state = playMove(state, choice);
      render(state.winner ? endMessage(state.winner) : `The computer added ${choice}: the total is ${state.total}. Your turn—add 1 or 2.`);
      // Never pull focus away from the registration form or another control.
      if (buttons.includes(document.activeElement) && (state.winner || document.activeElement.getAttribute('aria-disabled') === 'true')) {
        (state.winner ? reset : buttons.find(item => item.getAttribute('aria-disabled') === 'false'))?.focus({ preventScroll: true });
      }
    }, 650);
  });

  reset.addEventListener('click', () => {
    window.clearTimeout(computerTimer);
    state = createGame();
    render('New game. You go first. Can you find a winning pattern?');
    buttons[0].focus({ preventScroll: true });
  });
  render();
}
