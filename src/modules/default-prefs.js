let loaded = false;

function ensureDefaultPrefs () {
  if (loaded) {
    return;
  }
  Components.utils.import("resource://gre/modules/Services.jsm");
  const kDefaultPreferences = "resource://torbutton/defaults/preferences/preferences.js";

  let obj = { pref: function (aPrefName, aValue) {
    Services.console.logStringMessage(`${aPrefName} : ${aValue}`);
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
  Services.scriptloader.loadSubScript(kDefaultPreferences, obj);
  loaded = true;
}

let EXPORTED_SYMBOLS = ["enxureDefaultPrefs"];
