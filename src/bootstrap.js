// Entry point, runs last (see the content_scripts js order in manifest.json).

(async function boot() {
  if (!CR.alive()) return;

  await CR.settings.load();
  CR.settings._startWatching();
  CR.settings.onChange((changed) => CR.runtime.handleSettingsChange(changed));

  CR.router.onChange(() => CR.runtime.sync());
  CR.router.start();

  CR.runtime.sync();

  const version = CR.alive() ? chrome.runtime.getManifest().version : "?";
  CR.log.info(
    `v${version} loaded — ${CR.features.filter((f) => f._running).length}/` +
    `${CR.features.length} feature(s) active. Run CRdiagnose() here if something's missing.`
  );

  // With debug on, print the full report unprompted. The console command lives
  // in the page's world and can go missing (an old build, a page that owns the
  // CR global); this path only needs the content script itself.
  if (CR.DEBUG) {
    setTimeout(() => {
      try { CR.diagnose(); } catch (e) { CR.log.error("diagnose failed:", e); }
    }, 4000);
  }
})();
