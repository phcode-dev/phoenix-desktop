# Survey Configuration

Configuration file for user surveys displayed in Phoenix Code.

## Survey Types

- **newUser**: Survey shown once to new users after initial delay
- **powerUser**: Recurring survey shown to active users at regular intervals
  - **powerUserLoggedIn**: Optional survey URL for logged-in users (fallback to `powerUser` if not given)
  - **powerUserPaid**: Optional survey URL for paid subscribers (takes precedence over `powerUserLoggedIn`)

## Configuration Properties

| Property | Type | Default | Description                                                                      |
|----------|------|---------|----------------------------------------------------------------------------------|
| `newUser` | string | - | URL for new user survey                                                          |
| `powerUser` | string | - | URL for power user survey (fallback for all users)                               |
| `powerUserLoggedIn` | string/null | null | URL for logged-in users (overrides `powerUser`)                                  |
| `powerUserPaid` | string/null | null | URL for paid subscribers (overrides `powerUserLoggedIn`)                         |
| `newUserTitle` | string/null | null | Custom title for new user survey (null uses translated default)                  |
| `powerUserTitle` | string/null | null | Custom title for power user survey (null uses translated default)                |
| `newUserShowDelayMS` | number | 1200000 | Delay before showing new user survey (20 minutes)                                |
| `powerUserShowIntervalDays` | number | 35 | Days between power user surveys                                                  |
| `newUserUseDialog` | boolean | false | Display mode: `true` = dialog, `false` = notification                            |
| `powerUserUseDialog` | boolean | false | Display mode: `true` = dialog, `false` = notification                            |
| `browser` | object | - | Browser app will use this if present, else it will default  to the above version |

## Platform-Specific Configuration

Use the `browser` object to override settings for browser deployments. All properties from the main config can be overridden.

## Example

```json
{
  "newUser": "https://s.surveyplanet.com/jssqbld8",
  "newUserTitle": null,
  "newUserUseDialog": false,
  "newUserShowDelayMS": 1200000,
  "powerUser": "https://s.surveyplanet.com/v3j59a7z",
  "powerUserLoggedIn": "https://s.surveyplanet.com/abc123",
  "powerUserPaid": "https://s.surveyplanet.com/xyz789",
  "powerUserTitle": null,
  "powerUserUseDialog": false,
  "powerUserShowIntervalDays": 35,
  "browser": {
    "newUser": "https://s.surveyplanet.com/5lrpp9ud",
    "powerUser": "https://s.surveyplanet.com/wtohpj8x",
    "powerUserLoggedIn": "https://s.surveyplanet.com/def456",
    "powerUserPaid": "https://s.surveyplanet.com/uvw321",
    "newUserShowDelayMS": 600000,
    "powerUserShowIntervalDays": 30
  }
}
```

## Behavior

- **New User Survey**: Shown once per user. Version number in code determines if shown again after updates.
- **Power User Survey**: First shown 14 days after initial boot, then repeats at configured interval.
  - Survey URL selection priority: `powerUserPaid` (if paid subscriber) → `powerUserLoggedIn` (if logged in) → `powerUser` (fallback)
- **Fallback**: If browser-specific config exists, native app uses main config, browser uses browser config with fallback to main.
