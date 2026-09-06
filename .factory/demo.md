# Demo sandbox

## Browser demo

- URL: `https://telemetry-budget-guard.sociobot.in/demo/`
- Direct local URL: `http://localhost:5173/demo/` after `npm run dev`
- Entry action: **Try it with sample data** on the first screen
- Sample: seven checkout-service span, log, and metric records. The baseline drops health and cache noise; the proposal keeps all records and adds `team.name=payments`.
- Expected outcome: `FAIL` at the 20% change limit, with three sensitive fields dropped.
- Reset: either **Reset demo** action restores the sample, 60-second window, two replicas, 20% limit, and populated result.
- Exit: **Start for real** opens the CLI installation instructions.

The browser demo keeps all edits in page memory. It does not use localStorage, sessionStorage, IndexedDB, OPFS, cookies, or a backend. Since no demo or real records are stored, leaving the page discards the sample edits and cannot change real data.

## Native CLI demo

Run the bundled sample from any working directory after installation:

```sh
telemetry-budget-guard demo
```

The binary writes its bundled example inputs to a unique operating-system temporary directory, runs the same estimator used by `check`, prints the expected failed budget report, and removes the directory before exiting. It exits `0` because the demo completed; the output explains that the equivalent CI check would exit `2`.
