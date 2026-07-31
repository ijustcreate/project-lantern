# Project Lantern agent workflow

After every material code or configuration change:

1. Verify the change in proportion to its risk.
2. Run `npm run changelog -- add "Title" "What changed and why" --areas="Area one,Area two" --files="path/one,path/two" --tests="Verification performed"`.
3. Keep one changelog entry per cohesive user-facing change. Do not record read-only investigation.

Bug-specific analysis and progress must also be recorded with `npm run bugs -- work`.

For every user request that asks Codex to fix, correct, or improve existing behavior:

1. Before changing code, create a visible bug record entered by Codex with `npm run bugs -- add "Summary" "Details"`, unless an existing bug already covers the request.
2. Record analysis, implementation, and verification against that bug with `npm run bugs -- work`.
3. Move the record to `ready-for-test` after verification. Do not use the changelog as a substitute for the bug record.
