let loaded = false;

function ensureDefaultPrefs () {
  if (loaded) {
    return;
  }
  Components.utils.import("resource://gre/modules/Services.jsm");
  const kDefaultPreferences = "resource://torbutton/defaults/preferences/preferences.js";
  const defaultPrefBranch = Services.prefs.getDefaultBranch(null);

  const context = {
    pref: function (aPrefName, aValue) {
      const aValueType = typeof aValue;
      if (aValueType === "boolean") {
        defaultPrefBranch.setBoolPref(aPrefName, aValue);
      } else if (aValueType === "number") {
        defaultPrefBranch.setIntPref(aPrefName, aValue);
      } else if (aValueType === "string") {
        defaultPrefBranch.setCharPref(aPrefName, aValue);
      } else {
        Services.console.logStringMessage(
          `Preference ${aPrefName} with value ${aValue} has an invalid value type`);
      }
    }
  };
  Services.scriptloader.loadSubScript(kDefaultPreferences, context);
  loaded = true;
}

let EXPORTED_SYMBOLS = ["ensureDefaultPrefs"];
