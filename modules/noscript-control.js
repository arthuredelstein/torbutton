// # NoScript settings control (for binding to Security Slider)

// ## Utilities

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm", {});
const { bindPref } =
      ChromeUtils.import("resource://torbutton/modules/utils.js", {});

const { ExtensionUtils } = ChromeUtils.import("resource://gre/modules/ExtensionUtils.jsm");
const { MessageChannel } = ChromeUtils.import("resource://gre/modules/MessageChannel.jsm");

const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  ExtensionParent: "resource://gre/modules/ExtensionParent.jsm",
});

async function waitForExtensionMessage(extensionId, checker = () => {}) {
  const { torWaitForExtensionMessage } = ExtensionParent;
  if (torWaitForExtensionMessage) {
    return torWaitForExtensionMessage(extensionId, checker);
  }

  // Old messaging <= 78
  return new Promise(resolve => {
    const listener = ({ data }) => {
      for (const msg of data) {
        if (msg.recipient.extensionId === extensionId) {
          const deserialized = msg.data.deserialize({});
          if (checker(deserialized)) {
            Services.mm.removeMessageListener(
              "MessageChannel:Messages",
              listener
            );
            resolve(deserialized);
          }
        }
      }
    };
    Services.mm.addMessageListener("MessageChannel:Messages", listener);
  });
}

async function sendExtensionMessage(extensionId, message) {
  const { torSendExtensionMessage } = ExtensionParent;
  if (torSendExtensionMessage) {
    return torSendExtensionMessage(extensionId, message);
  }

  // Old messaging <= 78
  Services.cpmm.sendAsyncMessage("MessageChannel:Messages", [
    {
      messageName: "Extension:Message",
      sender: { id: extensionId, extensionId },
      recipient: { extensionId },
      data: new StructuredCloneHolder(message),
      channelId: ExtensionUtils.getUniqueId(),
      responseType: MessageChannel.RESPONSE_NONE,
    },
  ]);
  return undefined;
}

let logger = Cc["@torproject.org/torbutton-logger;1"]
    .getService(Ci.nsISupports).wrappedJSObject;
let log = (level, msg) => logger.log(level, msg);

// ## NoScript settings

// Minimum and maximum capability states as controlled by NoScript.
const max_caps = ["fetch", "font", "frame", "media", "object", "other", "script", "webgl"];
const min_caps = ["frame", "other"];

// Untrusted capabilities for [Standard, Safer, Safest] safety levels.
const untrusted_caps = [
  max_caps, // standard safety: neither http nor https
  ["frame", "font", "object", "other"], // safer: http
  min_caps, // safest: neither http nor https
];

// Default capabilities for [Standard, Safer, Safest] safety levels.
const default_caps = [
  max_caps, // standard: both http and https
  ["fetch", "font", "frame", "object", "other", "script"], // safer: https only
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
   "isTorBrowser": true,
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
    // LegacyExtensionContext is not there anymore. Using raw
    // Services.cpmm.sendAsyncMessage mechanism to communicate with
    // NoScript.

    // The component that handles WebExtensions' sendMessage.

    // __setNoScriptSettings(settings)__.
    // NoScript listens for internal settings with onMessage. We can send
    // a new settings JSON object according to NoScript's
    // protocol and these are accepted! See the use of
    // `browser.runtime.onMessage.addListener(...)` in NoScript's bg/main.js.

    // TODO: Is there a better way?
    let sendNoScriptSettings = settings =>
      sendExtensionMessage(noscriptID, settings);

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
    let messageListener = a => {
      try {
        log(3, `Message received from NoScript: ${JSON.stringify([a])}`);
        let noscriptPersist = Services.prefs.getBoolPref("extensions.torbutton.noscript_persist", false);
        let noscriptInited = Services.prefs.getBoolPref("extensions.torbutton.noscript_inited", false);
        // Set the noscript safety level once if we have never run noscript
        // before, or if we are not allowing noscript per-site settings to be
        // persisted between browser sessions. Otherwise make sure that the
        // security slider position, if changed, will rewrite the noscript
        // settings.
        bindPref("extensions.torbutton.security_slider",
                 sliderState => setNoScriptSafetyLevel(securitySliderToSafetyLevel(sliderState)),
                 !noscriptPersist || !noscriptInited);
        if (!noscriptInited) {
          Services.prefs.setBoolPref("extensions.torbutton.noscript_inited", true);
        }
      } catch (e) {
        log(5, e.message);
      }
    };
    waitForExtensionMessage(noscriptID, a => a.__meta.name === "started").then(
      messageListener
    );
    log(3, "Listening for message from NoScript.");
  } catch (e) {
    log(5, e.message);
  }
};

// Export initialize() function for external use.
let EXPORTED_SYMBOLS = ["initialize"];
