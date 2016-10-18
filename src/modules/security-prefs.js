// # Security Settings prefs (as controlled by the Security Slider)

// ### Utilities

let {classes: Cc, utils: Cu } = Components;
let { getBoolPref, setBoolPref, getIntPref, setIntPref } =
    Cu.import("resource://gre/modules/Services.jsm").Services.prefs;
let { bindPref } =
    Cu.import("resource://torbutton/modules/utils.js");
let logger = Components.classes["@torproject.org/torbutton-logger;1"]
    .getService(Components.interfaces.nsISupports).wrappedJSObject;
let log = (level, msg) => logger.log(level, msg);

// ### Constants

// __kSecuritySettings__.
// A table of all prefs bound to the security slider, and the value
// for each security setting.
const kSecuritySettings = {
  // Preference name :                        [0, 1-high 2-mh   3-ml   4-low]
  "javascript.options.ion.content" :          [,  false, false, false, true ],
  "javascript.options.typeinference" :        [,  false, false, false, true ],
  "noscript.forbidMedia" :                    [,  true,  true,  true,  false],
  "media.webaudio.enabled" :                  [,  false, false, false, true ],
  "mathml.disabled" :                         [,  true,  true,  true,  false],
  "javascript.options.baselinejit.content" :  [,  false, false, true,  true ],
  "gfx.font_rendering.opentype_svg.enabled" : [,  false, false, true,  true ],
  "noscript.global" :                         [,  false, false, true,  true ],
  "noscript.globalHttpsWhitelist" :           [,  false, true,  false, false],
  "noscript.forbidFonts" :                    [,  true,  false, false, false],
  "svg.in-content.enabled" :                  [,  false, true,  true,  true ],
};

// The Security Settings prefs in question.
const kSliderPref = "extensions.torbutton.security_slider";
const kCustomPref = "extensions.torbutton.security_custom";

// ### Prefs

// __write_setting_to_prefs(settingIndex)__.
// Take a given setting index and write the appropriate pref values
// to the pref database.
var write_setting_to_prefs = function (settingIndex) {
  Object.keys(kSecuritySettings).forEach(
    prefName => setBoolPref(
      prefName, kSecuritySettings[prefName][settingIndex]));
};

// __read_setting_from_prefs()__.
// Read the current pref values, and decide if any of our
// security settings matches. Otherwise return null.
var read_setting_from_prefs = function () {
  let prefNames = Object.keys(kSecuritySettings);
  for (let settingIndex of [1, 2, 3, 4]) {
    let possibleSetting = true;
    // For the given settingIndex, check if all current pref values
    // match the setting.
    for (let prefName of prefNames) {
      if (kSecuritySettings[prefName][settingIndex] !==
          getBoolPref(prefName)) {
        possibleSetting = false;
      }
    }
    if (possibleSetting) {
      // We have a match!
      return settingIndex;
    }
  }
  // No matching setting; return null.
  return null;
};

// __watch_security_prefs(onSettingChanged)__.
// Whenever a pref bound to the security slider changes, onSettingChanged
// is called with the new security setting value (1,2,3,4 or null).
// Returns a zero-arg function that ends this binding.
var watch_security_prefs = function (onSettingChanged) {
  let prefNames = Object.keys(kSecuritySettings);
  let unbindFuncs = [];
  for (let prefName of prefNames) {
    unbindFuncs.push(bindPref(
      prefName, () => onSettingChanged(read_setting_from_prefs())));
  }
  // Call all the unbind functions.
  return () => unbindFuncs.forEach(unbind => unbind());
};

// __initialized__.
// Have we called initialize() yet?
var initialized = false;

// __initialize()__.
// Defines the behavior of "extensions.torbutton.security_custom",
// "extensions.torbutton.security_slider", and the security-sensitive
// prefs declared in kSecuritySettings.
var initialize = function () {
  // Only run once.
  if (initialized) {
    return;
  }
  log(4, "Initializing security-prefs.js");
  initialized = true;
  // When security_custom is set to false, apply security_slider setting
  // to the security-sensitive prefs.
  bindPref(kCustomPref, function (custom) {
    if (custom === false) {
      write_setting_to_prefs(getIntPref(kSliderPref));
    }
  });
  // If security_slider is given a new value, then security_custom should
  // be set to false.
  bindPref(kSliderPref, function (prefIndex) {
    setBoolPref(kCustomPref, false);
    write_setting_to_prefs(prefIndex);
  });
  // If a security-sensitive pref changes, then decide if the set of pref values
  // constitutes a security_slider setting or a custom value.
  watch_security_prefs(settingIndex => {
    if (settingIndex === null) {
      setBoolPref(kCustomPref, true);
    } else {
      setIntPref(kSliderPref, settingIndex);
      setBoolPref(kCustomPref, false);
    }
  });
  log(4, "security-prefs.js initialization complete");
};

// Export initialize() function for external use.
let EXPORTED_SYMBOLS = ["initialize"];
