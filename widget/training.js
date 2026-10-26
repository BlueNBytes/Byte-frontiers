function playGame(playerChoice) {
    const choices = ['antivirus', 'data', 'virus'];
    const computerChoice = choices[Math.floor(Math.random() * choices.length)];

    let resultMessage = `You chose ${playerChoice}. Computer chose ${computerChoice}. `;

    if (playerChoice === computerChoice) {
        resultMessage += "It's a tie!";
    } else if (
        (playerChoice === 'antivirus' && computerChoice === 'virus') ||
        (playerChoice === 'data' && computerChoice === 'antivirus') ||
        (playerChoice === 'virus' && computerChoice === 'data')
    ) {
        resultMessage += ("You win!, +2 atk +1 def");
    } else {
        resultMessage += ("You lose!, -1 def");
    }

    document.getElementById('result').textContent = resultMessage;
}

// Player Stats
let player = {
    level: 0,
    atk: 10,
    hp: 100
};

// Enemy Stats
let enemy = {
    name: "Training Bot",
    atk: 5,
    hp: 80
};

// Display stats
function updateStats() {
    document.getElementById("player-stats").textContent = `Lvl: ${player.level} | ATK: ${player.atk} | HP: ${player.hp}`;
    document.getElementById("enemy-stats").textContent = `${enemy.name} | ATK: ${enemy.atk} | HP: ${enemy.hp}`;
}

// Battle logic
function fight(choice) {
    // Player action
    let damage = player.atk + Math.floor(Math.random() * 6);
    enemy.hp -= damage;
    document.getElementById("log").textContent += `You attack for ${damage} damage.  `;

    if (enemy.hp <= 0) {
        enemy.hp = 0;
        player.level++;
        player.atk += 2;
        player.hp = 100;
        document.getElementById("log").textContent += `\n${enemy.name} defeated! You leveled up!`;
        resetEnemy();
        updateStats();
        return;
    }

    // Enemy action
    damage = enemy.atk + Math.floor(Math.random() * 6);
    player.hp -= damage;
    document.getElementById("log").textContent += `\n${enemy.name} attacks for ${damage} damage.  `;

    if (player.hp <= 0) {
        player.hp = 0;
        document.getElementById("log").textContent += `\nYou were defeated!`;
        resetEnemy();
    }

    updateStats();
}

// Reset enemy
function resetEnemy() {
    const enemies = ["Glitch", "Scavenger Bug", "Firewall Guard"];
    enemy.name = enemies[Math.floor(Math.random() * enemies.length)];
    enemy.atk = 5 + Math.floor(Math.random() * 6);
    enemy.hp = 50 + Math.floor(Math.random() * 40);
}

// Start battle
updateStats();
