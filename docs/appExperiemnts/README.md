# AI dollar-value experiment

`config.json` controls the default display of dollar values in Phoenix AI usage views.
The app downloads only the JSON, from
`https://updates.phcode.io/appExperiemnts/config.json`.

```json
{
    "SHOW_$_COSTS": {
        "isExperimenting": true,
        "finalValueEnable$": true
    }
}
```

## Run the experiment

Set `isExperimenting` to `true`. Phoenix assigns signed-in users to a stable 50/50 split:
one half sees dollar values by default, the other half does not. The assignment uses SHA-256
of the trimmed, lowercase email: first hex digit `0–7` shows dollars, `8–f` hides them.
The same email receives the same assignment across machines. The final-value field is ignored
while experimenting.

## Finish the experiment

Once the experiment is over, set `isExperimenting` to `false` and choose `finalValueEnable$`
based on the result:

- `true`: show dollar values by default.
- `false`: hide dollar values by default.

Clients stop experiment metrics and apply the final default after the next config refresh.
The final default works without a signed-in account. A user's manual dollar-display choice
always takes precedence, both during and after the experiment.

## Rendering and rollout

The meter renders immediately without waiting for the fetch. It reuses the last resolved
experiment/default value saved in StateManager; with no saved value it starts hidden. A valid
response updates the UI dynamically and saves the new default separately from manual choices.
Missing or invalid config keeps that saved display value and cannot start an experiment.
A valid config cache can be used for up to 24 hours while offline. The app fetches at startup
and hourly, with a five-second timeout.

Publish `config.json` through the desktop docs site's normal deployment to make a change live.
Editing this repository locally does not change production. Keep the experiment running over
a consistent date range; do not mix another experiment into the same metric names.

## Read the outcome

The experiment measures whether showing dollar values increases AI use or Phoenix Pro
participation. Compare daily event-count graphs for `exp.ai$show` and `exp.ai$hide`, with the
same suffix: `activePro`, `activeFree`, `aiDayPro` or `aiDayFree`. Google Analytics replaces
punctuation with underscores, for example `exp_ai_show_aiDayPro`.

`Pro` uses Phoenix's existing paid-subscriber gate; free trials and free education Pro count
as `Free`. The counts represent active/AI-used installation-days, not purchases, exact unique
people or the amount of AI consumed. Look for sustained separation across comparable dates.
The full graph-reading guide is in `phoenix-pro/docs/experiment_tracking.md`.
