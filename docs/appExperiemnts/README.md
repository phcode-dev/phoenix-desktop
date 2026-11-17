# AI dollar-value experiment — concluded

The experiment was concluded on 2026-11-17 with **dollar values hidden by default**.
Users can still enable them explicitly through the existing usage controls. Saved manual
choices take precedence, including a previous choice to show dollars.

```json
{
    "SHOW_$_COSTS": {
        "isExperimenting": false,
        "finalValueEnable$": false
    }
}
```

## Compatibility with existing releases

Keep `config.json` available at
`https://updates.phcode.io/appExperiemnts/config.json` for releases that still contain the
experiment client. After their next successful config refresh, those releases stop experiment
metrics and apply the hidden default without changing manual preferences. They fetch at startup
and hourly, and can use a valid cached config for up to 24 hours while offline.

New client code uses the hidden default directly and no longer downloads this config, assigns
experiment groups or emits experiment events. Old saved experiment defaults are ignored;
`ai.usage.showDollars` remains the explicit user preference.

Publish these changes through the desktop docs site's normal deployment to conclude the
experiment for existing releases. Local edits alone do not change production. Keep both
controls false; do not delete this compatibility config or reuse the old event names.

## Recorded outcome

The production GA review covered October 28–November 16, 2026. Results were mixed and small:
free/trial AI participation totaled 61 show / 47 hide daily observations, while Pro AI
participation totaled 34 show / 60 hide. In the latest seven days those counts were 20 / 20
and 13 / 12 respectively. The hidden default is a product decision, not a statistically
established experiment winner. Historical event definitions and the review are recorded in
`phoenix-pro/docs/experiment_tracking.md`.
