# Leekha Scoreboard

Lightweight score tracker for the card game **Leekha**.

## Why this stack

This project uses **HTML, CSS, and modern JavaScript**.

That is the best fit here because:

- the rules are custom and easy to encode directly
- the app works with no package install or build step
- you can host it anywhere as a static website
- the UI can still be polished and fully responsive

## Scoring rules in the app

- `13` hearts are worth `1` point each
- `10♦` is worth `10` points
- `Q♠` is worth `13` points
- every round always totals `36` points
- each round is entered as `4` player scores that must total `36`
- if any single player reaches `101`, that player’s team loses

## Run it

Open [index.html](/Users/fayezbast/Documents/wara2/index.html) directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.
