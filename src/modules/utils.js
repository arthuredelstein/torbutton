// # Utils.js
// Various helpful utility functions.

/* jshint esnext:true */

// ### Mozilla Abbreviations
let {classes: Cc, interfaces: Ci, results: Cr, Constructor: CC, utils: Cu } = Components;

// ### Import Mozilla Services
Cu.import("resource://gre/modules/Services.jsm");

// ## Pref utils

// __prefs__. A shortcut to Mozilla Services.prefs.
let prefs = Services.prefs;

// __getPrefValue(prefName)__
// Returns the current value of a preference, regardless of its type.
let getPrefValue = function (prefName) {
  switch(prefs.getPrefType(prefName)) {
    case prefs.PREF_BOOL: return prefs.getBoolPref(prefName);
    case prefs.PREF_INT: return prefs.getIntPref(prefName);
    case prefs.PREF_STRING: return prefs.getCharPref(prefName);
    default: return null;
  }
};

// __bindPrefAndInit(prefName, prefHandler)__
// Applies prefHandler to the current value of pref specified by prefName.
// Re-applies prefHandler whenever the value of the pref changes.
// Returns a zero-arg function that unbinds the pref.
let bindPrefAndInit = function (prefName, prefHandler) {
  let update = () => { prefHandler(getPrefValue(prefName)); },
      observer = { observe : function (subject, topic, data) {
                     if (data === prefName) {
                         update();
                     }
                   } };
  prefs.addObserver(prefName, observer, false);
  update();
  return () => { prefs.removeObserver(prefName, observer); };
};

// ## Environment variables

// __env__.
// Provides access to process environment variables.
let env = Components.classes["@mozilla.org/process/environment;1"]
            .getService(Components.interfaces.nsIEnvironment);

// __getEnv(name)__.
// Reads the environment variable of the given name.
let getEnv = function (name) {
  return env.exists(name) ? env.get(name) : undefined;
};

// Export utility functions for external use.
let EXPORTED_SYMBOLS = ["bindPrefAndInit", "getPrefValue", "getEnv"];

// ## Observers

// __addObserverFunction__.
// Attach an observerFunction for the given notification type.
// When notification is triggered, the observerFunction will
// be called with arguments (subject, data). Returns an
// zero-arg anonymous function that detaches the observer.
let addObserverFunction = function(notification, observerFunction) {
  let observer = {
    observe: function (subject, topic, data) {
      if (topic === notification) {
        observerFunction(subject, data);
      }
    }
  };
  Services.obs.addObserver(observer, notification, false);
  return function () {
    Services.obs.removeObserver(observer, notification);
  };
};

// ## Script injection

// __injectedScripts__.
// Keeps track of scripts that have been injected into content documents,
// to make sure we don't injected the same script more than once.
// A map from the script URL to the cancel function.
let injectedScripts = new Map();

// __runScriptFirstInEachContentWindow__.
// In each future new content document (such as a new tab or iframe),
// run the script at scriptURL in the content's global "window" scope
// before any content is loaded. Returns a zero-arg function that
// cancels the behavior.
let runScriptFirstInEachContentWindow = function (scriptURL) {
  if (!injectedScripts.has(scriptURL)) {
    let cancel = addObserverFunction("content-document-global-created",
      function (subject, data) {
        if (subject instanceof Ci.nsIDOMWindow) {
          let contentWindow = XPCNativeWrapper.unwrap(subject);
          Services.scriptloader.loadSubScript(scriptURL, contentWindow, "UTF-8");
        }
      });
    injectedScripts.set(scriptURL, function () {
      cancel();
      injectedScripts.delete(scriptURL);
    });
  }
  return injectedScripts.get(scriptURL);
};

