let loaded = false;

function ensureDefaultPrefs () {
  if (loaded) {
    return;
  }
  Components.utils.import("resource://gre/modules/Services.jsm");
  const kDefaultPreferences = "resource://torbutton/defaults/preferences/preferences.js";

  let context = {
    pref: function (aPrefName, aValue) {
      if (Services.prefs.prefHasUserValue(aPrefName)) {
        return;
      }
      const aValueType = typeof aValue;
      if (aValueType === "boolean") {
        Services.prefs.setBoolPref(aPrefName, aValue);
      } else if (aValueType === "number") {
        Services.prefs.setIntPref(aPrefName, aValue);
      } else if (aValueType === "string") {
        Services.prefs.setCharPref(aPrefName, aValue);
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
