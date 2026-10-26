// Shared store catalog — loaded by both index.html (game) and store.html (shop UI).
// The game is the source of truth: the shop only sends "buy <id>" and the game
// validates the price, deducts money and applies the stats.
const STORE_ITEMS = [
  { id: "big-potion",  name: "Big Potion",  price: 100, healAmount: 50, color: "#e74c3c" },
  { id: "at-charger",  name: "AT-charger",  price: 50,  attack: 5,      color: "#f39c12" },
  { id: "def-charger", name: "Def-charger", price: 50,  defence: 5,     color: "#3498db" },
  { id: "sp-charger",  name: "Sp-charger",  price: 50,  spattack: 5,    color: "#9b59b6" },
  { id: "ev-charger",  name: "Ev-charger",  price: 50,  speed: 5,       color: "#2ecc71" },
];
