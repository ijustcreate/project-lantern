import fs from "node:fs";

const app = fs.readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const styles = fs.readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const checks = {
  programsCollapsedByDefault: app.includes('const [expandedId, setExpandedId] = useState("")'),
  vocabularyUsesSelection: app.includes('className="vocabulary-select-row"') && app.includes("Select ${singularTitle}"),
  categoryLabelIsGrammatical: app.includes('title === "Categories" ? "category"'),
  selectedValueIsEditable: app.includes('className="vocabulary-edit-row"') && app.includes("onClick={save}"),
  vocabularyCanAddAndDelete: app.includes("onClick={remove}") && app.includes("Add new"),
  workspaceOwnsFourRows: styles.includes("grid-template-rows: repeat(4, max-content);"),
  expandedProgramStaysInFlow: styles.includes(".giving-program-settings { position: relative; z-index: 0; display: grid; min-height: max-content;")
};

const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
if (failed.length) throw new Error(`Settings vocabulary/layout fixture failed: ${failed.join(", ")}`);

console.log(JSON.stringify(checks));
