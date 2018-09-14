// # NoScript settings control (for binding to Security Slider)

/* jshint esversion:6 */

// ## Utilities

const { utils: Cu } = Components;
const { LegacyExtensionContext } =
      Cu.import("resource://gre/modules/LegacyExtensionsUtils.jsm", {});
const { bindPrefAndInit } =
      Cu.import("resource://torbutton/modules/utils.js", {});
let logger = Components.classes["@torproject.org/torbutton-logger;1"]
    .getService(Components.interfaces.nsISupports).wrappedJSObject;
let log = (level, msg) => logger.log(level, msg);

// ## NoScript settings

// Minimum and maximum capability states as controlled by NoScript.
const max_caps = ["fetch", "font", "frame", "media", "other", "script", "webgl"];
const min_caps = ["frame", "other"];

// Untrusted capabilities for [Standard, Safer, Safest] safety levels.
const untrusted_caps = [
  max_caps, // standard safety: neither http nor https
  ["frame", "font", "other"], // safer: http
  min_caps, // safest: neither http nor https
];

// Default capabilities for [Standard, Safer, Safest] safety levels.
const default_caps = [
  max_caps, // standard: both http and https
  ["fetch", "font", "frame", "other", "script", "webgl"], // safer: https only
  min_caps, // safest: both http and https
];

// __noscriptSettings(safetyLevel)__.
// Produces NoScript settings with policy according to
// the safetyLevel which can be:
// 0 = Standard, 1 = Safer, 2 = Safest
//
// At the "Standard" safety level, we leave all sites at
// default with maximal capabilities. Essentially no content
// is blocked.
//
// At "Safer", we set all http sites to untrusted,
// and all https sites to default. Scripts are only permitted
// on https sites. Neither type of site is supposed to allow
// media, but both allow fonts (as we used in legacy NoScript).
//
// At "Safest", all sites are at default with minimal
// capabilities. Most things are blocked.
let noscriptSettings = safetyLevel => (
  {
    "__meta": {
      "name": "updateSettings",
      "recipientInfo": null
    },
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

// ## Communications

// The extension ID for NoScript (WebExtension)
const noscriptID = "{73a6fe31-595d-460b-a920-fcc0f8843232}";

// Ensure binding only occurs once.
let initialized = false;

// __initialize()__.
// The main function that binds the NoScript settings to the security
// slider pref state.
var initialize = () => {
  if (initialized) {
    return;
  }
  initialized = true;

  try {
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
    // (security slider level): 0 = Standard, 1 = Safer, 2 = Safest
    let setNoScriptSafetyLevel = safetyLevel =>
        sendNoScriptSettings(noscriptSettings(safetyLevel));

    // __securitySliderToSafetyLevel(sliderState)__.
    // Converts the "extensions.torbutton.security_slider" pref value
    // to a "safety level" value: 0 = Standard, 1 = Safer, 2 = Safest
    let securitySliderToSafetyLevel = sliderState =>
        [undefined, 2, 1, 1, 0][sliderState];

    // Wait for the first message from NoScript to arrive, and then
    // bind the security_slider pref to the NoScript settings.
    let messageListener = (a,b,c) => {
      log(3, `Message received from NoScript: ${JSON.stringify([a,b,c])}`);
      if (a._messageName != "started" && a._messageName != "pageshow") {
        return;
      }
      extensionContext.api.browser.runtime.onMessage.removeListener(messageListener);
      bindPrefAndInit(
        "extensions.torbutton.security_slider",
        sliderState => setNoScriptSafetyLevel(securitySliderToSafetyLevel(sliderState)));
    };
    extensionContext.api.browser.runtime.onMessage.addListener(messageListener);
    log(3, "Listening for message from NoScript.");
  } catch (e) {
    log(5, e.message);
  }
};

// Export initialize() function for external use.
let EXPORTED_SYMBOLS = ["initialize"];
