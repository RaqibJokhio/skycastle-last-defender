# SkyCastle: Last Defender — Project Rules

This is a 2D side-scrolling action-platformer built with Phaser 3 + Vite (vanilla JavaScript). See [ROADMAP.md](ROADMAP.md) for the full game plan, asset choices, and build order.

## Git rules

- Never stage or commit `node_modules` or `dist`. They stay in `.gitignore`.
- After every change that runs without errors, commit with a clear message describing what was done (e.g. "Step 3: blade attack + Scout Bot combat loop"), then push to `origin main`.
- Before any destructive change (deleting files, large rewrites), state what will be removed and why.

## Build rules

- Work one ROADMAP step at a time. Do not jump ahead to future steps.
- Get each step working and confirmed before starting the next.
- Make Mission 1 fully playable and fun before building any other level.
- Reuse enemies with stat scaling; don't create assets that aren't needed yet.
