# Tree View Visualizer (React Flow)

Client-side tree renderer built with React + Vite + React Flow.

## Features

- Recursive tree layout with sibling spacing
- Parent nodes centered above visible children
- Parent-child edges rendered automatically
- Expand/collapse controls on any node with children
- Layout recalculates instantly after toggle
- Node selection highlighting

## Example Tree

```text
Root
├── A
│   ├── A1
│   └── A2
├── B
│   ├── B1
│   └── B2
└── C
    └── C1
        ├── C1a
        └── C1b
```

## Run Locally

```bash
npm install
npm run dev
```

Open the URL shown in terminal (usually `http://localhost:5173`).

## Build for Production

```bash
npm run build
npm run preview
```

## Notes

- No backend is required; all logic is client-side.
- Spacing constants can be tuned in `src/App.jsx` (`NODE_WIDTH`, `HORIZONTAL_GAP`, `VERTICAL_GAP`).
