// # Utilities
// This file has functions for handling Mozilla things, including multiple browser
// windows and prefs.
// Later functions call earlier functions only. Format with docco.js.

/* jshint esnext:true */

// __Mozilla services__.
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");
let uuidGenerator = Components.classes["@mozilla.org/uuid-generator;1"]
                    .getService(Components.interfaces.nsIUUIDGenerator);
    
// __newUUID()__. Generates a new UUID.                
let newUUID = function () {
  // Generate the UUID string, and remove '{' and '}' at beginning and end.
  return uuidGenerator.generateUUID().number.replace(/^{|}$/g, "");
};

// __enumeratorToArray(enumerator)__.
// Puts the contents of an nsISimpleEnumerator into a JS array.
let enumeratorToArray = function (enumerator) {
  let result = [];
  while (enumerator.hasMoreElements()) result.push(enumerator.getNext());
  return result;
};

// ## Windows, browsers, and tabs

// __browserWindows()__.
// Returns an array of browser ChromeWindows.
let browserWindows = () => enumeratorToArray(Services.wm.getEnumerator("navigator:browser"));

// __frontBrowserWindow()__.
// Returns the frontmost browser ChromeWindow.
let frontBrowserWindow = () => Services.wm.getMostRecentWindow("navigator:browser");

// __currentTabBrowser()__.
// Returns the tabbrowser object for the front browser window.
// See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/tabbrowser
let currentTabBrowser = function() {
  let window = frontBrowserWindow();
  return window && window.gBrowser ? window.gBrowser : null;
};

// __selectedBrowser()__.
// Returns the currently selected xul:browser object in the frontmost browser window.
// See https://developer.mozilla.org/en-US/docs/Mozilla/Tech/XUL/browser
let selectedBrowser = function() {
  let tabBrowser = currentTabBrowser();
  return tabBrowser ? tabBrowser.selectedBrowser : null;
};

// __activateForAllWindows(activateFunction)__.
// Applies activateFunction(window) to all existing browser chrome windows, and to all new
// windows created in the future. Returns a zero-arg function that deactivates
// all open windows using deactivateFunction(window), and stops activating future windows.
let activateForAllWindows = function (activateFunction, deactivateFunction) {
  // Create an nsIObserver instance to monitor open and closing of chrome windows.
  let observer = { observe : function (window, eventType, data) {
    if (eventType === "domwindowopened") {
      if (activateFunction) activateFunction(window);
    } else if (eventType === "domwindowclosed") {
      if (deactivateFunction) deactivateFunction(window);
    }
  } };
  // Register the observer and add tab progress listeners to existing open windows.
  Services.ww.registerNotification(observer);
  if (activateFunction) browserWindows().map(activateFunction);
  // Now return a function to deregister the window observer and run
  // the deactivateFunction on all windows.
  return function() {
    Services.ww.unregisterNotification(observer);
    if (deactivateFunction) browserWindows().map(deactivateFunction);
  };
};

// ## Prefs

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

let EXPORTED_SYMBOLS =
  [newUUID, enumeratorToArray, browserWindows, frontBrowserWindow,
   currentTabBrowser, selectedBrowser, activateForAllWindows,
   getPrefValue, bindPrefAndInit];

