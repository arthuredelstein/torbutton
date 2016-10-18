// # Utils.js
// Various helpful utility functions.

// ### Shortcut
const Cu = Components.utils;

// ### Import Mozilla Services
Cu.import("resource://gre/modules/Services.jsm");

// ## Pref utils

// __prefs__. A shortcut to Mozilla Services.prefs.
let prefs = Services.prefs;

// __getPrefValue(prefName)__
// Returns the current value of a preference, regardless of its type.
var getPrefValue = function (prefName) {
  switch(prefs.getPrefType(prefName)) {
    case prefs.PREF_BOOL: return prefs.getBoolPref(prefName);
    case prefs.PREF_INT: return prefs.getIntPref(prefName);
    case prefs.PREF_STRING: return prefs.getCharPref(prefName);
    default: return null;
  }
};

// __bindPref(prefName, prefHandler, init)__
// Applies prefHandler whenever the value of the pref changes.
// If init is true, applies prefHandler to the current value.
// Returns a zero-arg function that unbinds the pref.
var bindPref = function (prefName, prefHandler, init = false) {
  let update = () => { prefHandler(getPrefValue(prefName)); },
      observer = { observe : function (subject, topic, data) {
                     if (data === prefName) {
                         update();
                     }
                   } };
  prefs.addObserver(prefName, observer, false);
  if (init) {
    update();
  }
  return () => { prefs.removeObserver(prefName, observer); };
};

// __bindPrefAndInit(prefName, prefHandler)__
// Applies prefHandler to the current value of pref specified by prefName.
// Re-applies prefHandler whenever the value of the pref changes.
// Returns a zero-arg function that unbinds the pref.
var bindPrefAndInit = (prefName, prefHandler) =>
    bindPref(prefName, prefHandler, true);

// ## Environment variables

// __env__.
// Provides access to process environment variables.
let env = Components.classes["@mozilla.org/process/environment;1"]
            .getService(Components.interfaces.nsIEnvironment);

// __getEnv(name)__.
// Reads the environment variable of the given name.
var getEnv = function (name) {
  return env.exists(name) ? env.get(name) : undefined;
};

// ## Windows

// __dialogsByName__.
// Map of window names to dialogs.
let dialogsByName = {};

// __showDialog(parent, url, name, features, arg1, arg2, ...)__.
// Like window.openDialog, but if the window is already
// open, just focuses it instead of opening a new one.
var showDialog = function (parent, url, name, features) {
  let existingDialog = dialogsByName[name];
  if (existingDialog && !existingDialog.closed) {
    existingDialog.focus();
    return existingDialog;
  } else {
    let newDialog = parent.openDialog.apply(parent,
                                            Array.slice(arguments, 1));
    dialogsByName[name] = newDialog;
    return newDialog;
  }
};

// __browserWindows()__.
// Returns an array of chrome windows containing a browser element.
var browserWindows = function () {
  let browserEnumerator = Services.wm.getEnumerator("navigator:browser");
  let results = [];
  while (browserEnumerator.hasMoreElements()) {
    results.push(browserEnumerator.getNext());
  }
  return results;
};

// Export utility functions for external use.
let EXPORTED_SYMBOLS = ["bindPref", "bindPrefAndInit", "browserWindows",
                        "getEnv", "getPrefValue", "showDialog"];
