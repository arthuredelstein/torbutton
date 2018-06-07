// # NoScript settings control (for binding to Security Slider)

// ## Utilities

const { utils: Cu } = Components;
const { LegacyExtensionContext } =
      Cu.import("resource://gre/modules/LegacyExtensionsUtils.jsm", {});
const { bindPrefAndInit } =
      Cu.import("resource://torbutton/modules/utils.js", {});

// ### NoScript settings

// Minimum and maximum capability states as controlled by NoScript.
const max_caps = ["fetch", "font", "frame", "media", "other", "script", "webgl"];
const min_caps = ["frame", "other"];

// Untrusted capabilities for [Low, Medium, High] safety levels.
const untrusted_caps = [
  max_caps, // low safety: neither http nor https
  ["frame", "font", "other"] // medium: http
  min_caps, // high safety: neither http nor https
];

// Default capabilities for [Low, Medium, High] safety levels.
const default_caps = [
  max_caps, // low: both http and https
  ["fetch", "font", "frame", "other", "script", "webgl"], // medium: https only
  min_caps, // high: both http and https
];

// __noscriptSettings(safetyLevel)__.
// Produces NoScript settings with policy according to
// the safetyLevel which can be:
// 0 = low
// 1 = medium
// 2 = high
//
// At the lowest safety level, we leave all sites at
// default with maximal capabilities. Essentially no content
// is blocked.
//
// At medium safety, we set all http sites to untrusted,
// and all https sites to default. Scripts are only permitted
// on https sites. Neither type of site is supposed to allow
// media, but both allow fonts (as we used in legacy NoScript).
//
// At high safety, all sites are at default with minimal
// capabilities. Most things are blocked.
let noscriptSettings = safetyLevel => (
  {
    "type": "NoScript.updateSettings",
    "policy": {
      "DEFAULT": {
        "capabilities": default_caps[safetyLevel],
        "temp": false
      },
      "TRUSTED": {
        "capabilities": max_caps,
        "temp": false
      },
      "UNTRUSTED": {
        "capabilities": untrusted_caps[safetyLevel],
        "temp": false
      },
      "sites": {
        "trusted": [],
        "untrusted": [[], ["http:"], []][safetyLevel],
        "custom": {},
        "temp": []
      },
      "enforced": true,
      "autoAllowTop": false
    },
   "tabId": -1
  });

// ### Communications

// The extension ID for NoScript (WebExtension)
const noscriptID = "{73a6fe31-595d-460b-a920-fcc0f8843232}";

// A mock extension object that can communicate with another extension
// via the WebExtensions sendMessage/onMessage mechanism.
let extensionContext = new LegacyExtensionContext({ id : noscriptID });

// The component that handles WebExtensions' sendMessage.
let messageManager = extensionContext.messenger.messageManagers[0];

// __setNoScriptSettings(settings)__.
// NoScript listens for internal settings with onMessage. We can send
// a new settings JSON object according to NoScript's
// protocol and these are accepted! See the use of
// `browser.runtime.onMessage.addListener(...)` in NoScript's bg/main.js.
let sendNoScriptSettings = settings =>
    extensionContext.messenger.sendMessage(messageManager, settings, noscriptID);

// __setNoScriptSafetyLevel(safetyLevel)__.
// Set NoScript settings according to a particular safety level
// (security slider level): 0 = Low, 1 = Med, 2 = High
let setNoScriptSafetyLevel = safetyLevel =>
    sendNoScriptSettings(noscriptSettings(safetyLevel));

// ### Slider binding

// __securitySliderToSafetyLevel(sliderState)__.
// Converts the "extensions.torbutton.security_slider" pref value
// to a "safety level" value: 0 = Low, 1 = Med, 2 = High
let securitySliderToSafetyLevel = sliderState => [, 2, 1, 1, 0][sliderState];

// Ensure binding only occurs once.
let initialized = false;

// __initialize()__.
// The main function that binds the NoScript settings to the security
// slider pref state.
var initialize = () => {
  if (initialized) {
    return;
  }
  bindPrefAndInit(
    "extensions.torbutton.security_slider",
    sliderState => setNoScriptSafetyLevel(securitySliderToSafetyLevel(sliderState)));
};

// Export initialize() function for external use.
let EXPORTED_SYMBOLS = ["initialize"];
