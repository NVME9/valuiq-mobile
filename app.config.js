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

// HERMES, NOT JSC (2026-11-11, OTA crash incident) - app.json's
// ios.jsEngine:"jsc" has been a lie since this project moved to React
// Native 0.81: that RN version's own react_native_pods.rb hardcodes
// `hermes_enabled = true` and explicitly deprecated first-party JSC
// support (see error_if_try_to_use_jsc_from_core() - trying to opt out
// without a third-party JSC pod is now a hard Podfile error). Confirmed
// against build 46's own EAS build logs: `hermes-engine`/`React-hermes`/
// `React-RuntimeHermes` pods were installed, no JSC pod anywhere. So the
// embedded binary has only ever run Hermes bytecode - while `eas update`
// (reading the OLD, wrong "jsc" config) has been exporting plain JS TEXT
// for every OTA bundle. Hermes's release-mode VM expects its own bytecode
// format and does not fall back to interpreting plain JS source - the
// bundle fails before a single line of app JS runs, which is exactly
// the "fails 0.3-1.6s after launch, before the startup trap's first line
// ever gets a chance to install" signature from this whole incident.
// Setting it correctly here (not editing app.json, so the mismatch stays
// visible in git history) makes `expo export`/`eas update` finally emit
// Hermes bytecode, matching what the binary has actually been running
// the entire time.
module.exports = ({ config }) => ({
  ...config,
  jsEngine: "hermes",
  ios: {
    ...config.ios,
    jsEngine: "hermes",
  },
  extra: {
    ...config.extra,
    gitCommitHash: gitCommitHash(),
  },
});
