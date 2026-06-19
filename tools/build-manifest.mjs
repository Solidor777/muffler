/**
 * Injects release metadata into module.json for the release workflow. Sets `version` from the
 * Git tag (a leading "v" is stripped) and derives `url`, `manifest`, `download`, `readme`, and
 * `bugs` from the GitHub repository slug. Run inside GitHub Actions on a tag, where
 * GITHUB_REPOSITORY and GITHUB_REF_NAME are provided automatically.
 */
import { readFileSync, writeFileSync } from "node:fs";

const repo = process.env.GITHUB_REPOSITORY;
const tag = process.env.GITHUB_REF_NAME;
if (!repo || !tag) {
  throw new Error("GITHUB_REPOSITORY and GITHUB_REF_NAME must be set (run in GitHub Actions on a tag).");
}

const version = tag.replace(/^v/, "");
const manifest = JSON.parse(readFileSync("module.json", "utf8"));
manifest.version = version;
manifest.url = `https://github.com/${repo}`;
manifest.manifest = `https://github.com/${repo}/releases/latest/download/module.json`;
manifest.download = `https://github.com/${repo}/releases/download/${tag}/module.zip`;
manifest.readme = `https://github.com/${repo}#readme`;
manifest.bugs = `https://github.com/${repo}/issues`;
writeFileSync("module.json", `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`module.json: version ${version}, repo ${repo}`);
