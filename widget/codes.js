const CodeList = [
    FREEDOM,
    A7XY,
    BRQR,
    NAND,
    LOGIC,
    ZERO_HOPE
]

const code = prompt("Enter the code: ");

if (CodeList.includes(code)) {
    alert("Validated code! + stats");
    player.stats + 10

} else {
    alert("Incorrect code!");
}