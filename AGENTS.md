# Project Lantern agent workflow

After every material code or configuration change:

1. Verify the change in proportion to its risk.
2. Run `npm run changelog -- add "Title" "What changed and why" --areas="Area one,Area two" --files="path/one,path/two" --tests="Verification performed"`.
3. Keep one changelog entry per cohesive user-facing change. Do not record read-only investigation.

Bug-specific analysis and progress must also be recorded with `npm run bugs -- work`.
