## overview
This is used by in app banner or toast notification in phcode. It is automatically translated
by Google Translate. You just need to update `<stage>/root/banner.json` and
`<stage>/root/toast.json` folder in english language
and a pull request will be raised by GitHub actions translating it into all supported languages.

You should merge the pull request if release is valid update, and then merge the `main` branch into
`update-notifications branch` to trigger the updates across the installation base.

## banner notifications - `banner.json`

![image](https://github.com/phcode-dev/phoenix/assets/5336369/0094d4fa-fb63-4884-90dc-13b025b2de5e)

Banner notifications are shown at the bottom of brackets as seen in picture. Only use this in case of
emergencies to push security updates or other critical updates that needs user attention. Atmost one
banner notification will be shown at a time on screen. If there are multiple, the next notification will only be shown
once the current notification is closed.

### Format of `<stage>/root/banner.json`

`<stage>` can be `staging` or `prod`. (`dev` stage is directly in phoenix codebase for ease of development.)

A sample json is as follows:
```json
{
  "SAMPLE_NOTIFICATION_NAME": {
    "DANGER_SHOW_ON_EVERY_BOOT" : false,
    "HTML_CONTENT": "<div>hello world <a class='notification_ack'>Click to acknowledge.</a></div>",
    "FOR_VERSIONS": "1.x || >=2.5.0 || 5.0.0 - 7.2.3", 
    "PLATFORM" : "allDesktop"
  },
  "ANOTHER_SAMPLE_NOTIFICATION_NAME": {...}
}
```

 By default, a notification is shown only once except if `DANGER_SHOW_ON_EVERY_BOOT` is set
 or there is an html element with class `notification_ack`.

1. `SAMPLE_NOTIFICATION_NAME` : This is a unique ID. It is used to check if the notification was shown to user.
2. `DANGER_SHOW_ON_EVERY_BOOT` : (Default false) Setting this to true will cause the
   notification to be shown on every boot. This is bad ux and only be used if there is a critical security issue
   that we want the version not to be used.
3. `HTML_CONTENT`: The actual html content to show to the user. It can have an optional `notification_ack` class.
    Setting this class in any child html node will cause the notification to be shown once a day until the user explicitly clicks
    on any html element with class `notification_ack` or explicitly click the close button.
    If such a class is not present, then the notification is shown only once ever.
4. `FOR_VERSIONS` : [Semver compatible version filter](https://www.npmjs.com/package/semver).
    The notification will be shown to all versions satisfying this.
5. `PLATFORM`: A comma seperated list(no spaces) of all platforms in which the message will be shown.
    allowed values are: `mac,win,linux,allDesktop,firefox,chrome,safari,allBrowser,all`


## toast notifications - `toast.json`

Toast notifications are shown at the side on the general notification area. Multiple toast notifications
can be shown at the same time. Format is similar to banner notification.

By default, a notification is shown only once and auto close after 25 seconds.
If there is an html element with class `notification_ack` it must be clicked to be dismissed,
else it will come up after every boot till it is acknowledged or the close button clicked. 

### Format of `<stage>/root/toast.json`

> <Not yet implemented. Just use the spec below.>

`<stage>` can be `staging` or `prod`. (`dev` stage is directly in phoenix codebase for ease of development.)

A sample json is as follows:
```json
{
  "SAMPLE_NOTIFICATION_NAME": {
    "TRIGGER" : "MENU_CLICK:file.newFolder,HTML_ELEMENT:#project-files-container",
    "TYPE": "ERROR/WARN/INFO/SUCCESS",
    "HTML_CONTENT": "<div>hello world <a class='notification_ack'>Click to acknowledge.</a></div>",
    "FOR_VERSIONS": "1.x || >=2.5.0 || 5.0.0 - 7.2.3", 
    "PLATFORM" : "allDesktop",
    "autoCloseTimeS": 25
  },
  "ANOTHER_SAMPLE_NOTIFICATION_NAME": {...}
}
```

1. `SAMPLE_NOTIFICATION_NAME` : This is a unique ID. It is used to check if the notification was shown to user.
2. `TRIGGER` : The trigger to show the notification. Can be a comma seperated list of one of the following
    `APP_START/MENU_CLICK:<commandID>/KEYBOARD_SHORTCUT:<commandID>/OTHER:<commandID>/HTML_ELEMENT:<.class/#id>`
   1. `APP_START` : notification will be shown on app start.
   2. `MENU_CLICK:<commandID>` : When a command is executed by clicking on a ui menu item.
   3. `KEYBOARD_SHORTCUT:<commandID>` : When a command is executed by keyboard shortcut.
   4. `HTML_ELEMENT:<jquery selector>` : On click on the given html element with jquery selector.
3. `HTML_CONTENT`: The actual html content to show to the user. It can have an optional `notification_ack` class.
   Setting this class in any child html node will cause the notification to be shown once a day until the user explicitly clicks
   on any html element with class `notification_ack` or explicitly click the close button.
   If such a class is not present, then the notification is shown only once ever.
4. `FOR_VERSIONS` : [Semver compatible version filter](https://www.npmjs.com/package/semver).
   The notification will be shown to all versions satisfying this.
5. `PLATFORM`: A comma seperated list(no spaces) of all platforms in which the message will be shown.
   allowed values are: `mac,win,linux,allDesktop,firefox,chrome,safari,allBrowser,all`
6. `autoCloseTimeS`: Time to auto close the popup in seconds