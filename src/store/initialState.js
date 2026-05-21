// ─── HalfTime Initial State ────────────────────────────────────────────────────

export const GAMES_DB = [
  { id: 1,  opp: "Lakers",      date: "Jan 24", day: "Thu", time: "7:30 PM", val: 220, tier: "marquee",  sport: "🏀" },
  { id: 2,  opp: "Celtics",     date: "Feb 1",  day: "Fri", time: "8:00 PM", val: 195, tier: "premium",  sport: "🏀" },
  { id: 3,  opp: "Warriors",    date: "Feb 14", day: "Thu", time: "7:00 PM", val: 380, tier: "marquee",  sport: "🏀" },
  { id: 4,  opp: "Knicks",      date: "Mar 2",  day: "Sun", time: "2:30 PM", val: 145, tier: "standard", sport: "🏀" },
  { id: 5,  opp: "Heat",        date: "Mar 18", day: "Mon", time: "7:30 PM", val: 160, tier: "standard", sport: "🏀" },
  { id: 6,  opp: "Bucks",       date: "Mar 25", day: "Mon", time: "7:00 PM", val: 175, tier: "standard", sport: "🏀" },
  { id: 7,  opp: "76ers",       date: "Apr 2",  day: "Tue", time: "7:30 PM", val: 210, tier: "premium",  sport: "🏀" },
  { id: 8,  opp: "Suns",        date: "Apr 9",  day: "Tue", time: "8:00 PM", val: 155, tier: "standard", sport: "🏀" },
  { id: 9,  opp: "Nuggets",     date: "Apr 16", day: "Tue", time: "9:00 PM", val: 190, tier: "premium",  sport: "🏀" },
  { id: 10, opp: "Mavericks",   date: "Apr 22", day: "Mon", time: "7:30 PM", val: 165, tier: "standard", sport: "🏀" },
  { id: 11, opp: "Clippers",    date: "May 1",  day: "Thu", time: "7:30 PM", val: 185, tier: "standard", sport: "🏀" },
  { id: 12, opp: "Timberwolves",date: "May 8",  day: "Thu", time: "7:00 PM", val: 150, tier: "standard", sport: "🏀" },
];

export const MEMBERS_INIT = [
  { id: "m1", name: "You",       initials: "YO", share: 25, credits: 180, color: "#C8F135", verified: true,  escrowFunded: true  },
  { id: "m2", name: "Alex M.",   initials: "AM", share: 25, credits: 140, color: "#34D399", verified: true,  escrowFunded: true  },
  { id: "m3", name: "Sam R.",    initials: "SR", share: 25, credits: 120, color: "#A78BFA", verified: true,  escrowFunded: false },
  { id: "m4", name: "Jordan K.", initials: "JK", share: 25, credits: 95,  color: "#FBBF24", verified: false, escrowFunded: false },
];

export const initialState = {
  screen: "onboarding",
  members: MEMBERS_INIT,
  games: GAMES_DB,
  assignments: {},
  allocationMethod: "snake",
  allocationDone: false,
  bids: {},
  activeBid: null,
  myBid: 0,
  resaleListing: null,
  resaleSold: {},
  escrowBalance: 1482,
  escrowRequired: 1850,
  notifications: [
    { id: 1, text: "🎟️ Game allocated to you: Bulls vs. Lakers", time: "2m ago",  read: false },
    { id: 2, text: "💰 Resale profit +$85 deposited",            time: "1h ago",  read: false },
    { id: 3, text: "🐍 Snake draft starts in 24 hours",           time: "3h ago",  read: true  },
  ],
  onboardingStep: 0,
  toast: null,
};
