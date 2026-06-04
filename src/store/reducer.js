// ─── HalfTime State Reducer ────────────────────────────────────────────────────
import { runSnakeDraft, runLottery, runAIFairness } from "../engine/allocation";

export function reducer(state, action) {
  switch (action.type) {

    case "SET_SCREEN":
      return { ...state, screen: action.screen };

    case "SET_METHOD":
      return { ...state, allocationMethod: action.method };

    case "RUN_ALLOCATION": {
      let assignments;
      if (action.method === "snake") {
        const { assignments: a } = runSnakeDraft(state.games, state.members);
        assignments = a;
      } else if (action.method === "lottery") {
        assignments = runLottery(state.games, state.members);
      } else {
        assignments = runAIFairness(state.games, state.members);
      }
      return { ...state, assignments, allocationDone: true,
               toast: "✓ Allocation complete!" };
    }

    case "PLACE_BID": {
      const bids = { ...state.bids };
      if (!bids[action.gameId]) bids[action.gameId] = {};
      bids[action.gameId]["m1"] = action.amount;
      // Simulate other members bidding
      bids[action.gameId]["m2"] = Math.max(
        0, action.amount - 20 + Math.floor(Math.random() * 40)
      );
      return { ...state, bids, myBid: action.amount, activeBid: action.gameId };
    }

    case "RESOLVE_BID": {
      const gameId = action.gameId;
      const gameBids = state.bids[gameId] || {};
      const winner = Object.entries(gameBids).sort((a, b) => b[1] - a[1])[0];
      const winnerId = winner ? winner[0] : "m1";
      const assignments = { ...state.assignments, [gameId]: winnerId };
      const members = state.members.map(m => ({
        ...m,
        credits: gameBids[m.id]
          ? Math.max(0, m.credits - (gameBids[m.id] || 0))
          : m.credits,
      }));
      const winnerName = state.members.find(m => m.id === winnerId)?.name;
      return {
        ...state, assignments, members, activeBid: null,
        toast: winnerId === "m1" ? "🏆 You won the bid!" : `${winnerName} won the bid`,
      };
    }

    case "LIST_RESALE":
      return { ...state, resaleListing: { gameId: action.gameId, askPrice: action.price } };

    case "COMPLETE_RESALE": {
      const share = Math.round(action.price * 0.25 * 0.92);
      const resaleSold = {
        ...state.resaleSold,
        [action.gameId]: { price: action.price, soldTo: "Fan via platform" },
      };
      return {
        ...state, resaleListing: null, resaleSold,
        toast: `💰 Ticket sold for $${action.price}! Your share: +$${share}`,
      };
    }

    case "FUND_ESCROW":
      return { ...state, toast: "✓ Escrow funded successfully!" };

    case "VERIFY_MEMBER": {
      const members = state.members.map(m =>
        m.id === action.memberId ? { ...m, verified: true } : m
      );
      return { ...state, members, toast: "✓ Member identity verified" };
    }

    case "NEXT_ONBOARDING":
      return { ...state, onboardingStep: state.onboardingStep + 1 };

    case "COMPLETE_ONBOARDING":
      return { ...state, screen: "dashboard", onboardingStep: 0 };

    case "MARK_NOTIFS_READ": {
      const notifications = state.notifications.map(n => ({ ...n, read: true }));
      return { ...state, notifications };
    }

    case "CLEAR_TOAST":
      return { ...state, toast: null };

    default:
      return state;
  }
}
