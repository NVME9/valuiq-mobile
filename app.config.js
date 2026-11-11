const { execSync } = require("child_process");

// Stamps the exact commit this bundle was built/published from into
// extra.gitCommitHash, read by ProfileScreen's footer (Updates.updateId
// alone can't answer "did my publish land" - see the EAS update / .env.local
// incident notes - a published update's manifest shows gitCommitHash, but
// there was previously no way to see that same thing ON the device without
// cross-referencing `eas update:view`). Runs at config-evaluation time, i.e.
// every `eas build`/`eas update`/`expo start`, so it's always the commit
// actually being packaged, not a hand-maintained string someone forgets to
// bump. A trailing "*" means the working tree had uncommitted changes when
// this was evaluated - the exact "built dirty" signal this project has been
// burned by before.
function gitCommitHash() {
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim();
    const dirty = execSync("git status --porcelain", { cwd: __dirname }).toString().trim().length > 0;
    return dirty ? `${hash}*` : hash;
  } catch {
    return "unknown";
  }
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    gitCommitHash: gitCommitHash(),
  },
});
