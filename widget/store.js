// Store UI. Runs inside the game's store overlay (an iframe in index.html).
// It never changes game state itself: it asks the game (parent window) to buy
// an item and re-renders from the state the game sends back.

const container = document.getElementById("card-container");
const moneyEl = document.getElementById("money");
const messageEl = document.getElementById("store-message");
const inGame = window.parent !== window;

const STAT_LABELS = [
    ["healAmount", "Heal"],
    ["attack", "Attack"],
    ["defence", "Defence"],
    ["spattack", "Sp. Attack"],
    ["speed", "Speed"],
];

function showMessage(text, isError) {
    messageEl.textContent = text || "";
    messageEl.classList.toggle("error", !!isError);
}

function renderStore(money, owned) {
    moneyEl.textContent = money;
    container.innerHTML = STORE_ITEMS.map(item => {
        const stats = STAT_LABELS
            .filter(([key]) => item[key])
            .map(([key, label]) => `<p>${label}: +${item[key]}</p>`)
            .join("");
        const canBuy = inGame && money >= item.price;
        return `
  <div class="card" style="border-left-color: ${item.color};">
    <h3>${item.name}</h3>
    <p class="price">Price: ${item.price}</p>
    ${stats}
    <p class="owned">Owned: ${owned[item.id] || 0}</p>
    <button class="btn-buy" data-id="${item.id}" ${canBuy ? "" : "disabled"}>Buy</button>
  </div>`;
    }).join("");
}

// One listener for every Buy button (the cards are re-rendered after each purchase).
container.addEventListener("click", (e) => {
    const btn = e.target.closest(".btn-buy");
    if (!btn || btn.disabled || !inGame) return;
    window.parent.postMessage({ type: "store-buy", id: btn.dataset.id }, "*");
});

document.getElementById("btn-close").addEventListener("click", () => {
    if (inGame) {
        window.parent.postMessage({ type: "store-close" }, "*");
    } else {
        window.location.href = "index.html";
    }
});

window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const msg = e.data || {};
    if (msg.type !== "store-state") return;
    renderStore(msg.money, msg.owned || {});
    if (msg.message) showMessage(msg.message, msg.ok === false);
});

if (inGame) {
    window.parent.postMessage({ type: "store-ready" }, "*");
} else {
    renderStore(0, {});
    showMessage("Open the store from the in-game menu to buy items.", true);
}
