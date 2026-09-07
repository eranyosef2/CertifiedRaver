// Entry point, runs last (see the content_scripts js order in manifest.json).

(async function boot() {
  if (!CR.alive()) return;

  await CR.settings.load();
  CR.settings._startWatching();
  CR.settings.onChange((changed) => CR.runtime.handleSettingsChange(changed));

  CR.router.onChange(() => CR.runtime.sync());
  CR.router.start();

  CR.runtime.sync();

  CR.log.info(
    `loaded — ${CR.features.filter((f) => f._running).length}/${CR.features.length} ` +
    `feature(s) active. Run CRdiagnose() here if something's missing.`
  );
})();
