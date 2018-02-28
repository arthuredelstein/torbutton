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

// ## Observers

// __observe(topic, callback)__.
// Observe the given topic. When notification of that topic
// occurs, calls callback(subject, data). Returns a zero-arg
// function that stops observing.
var observe = function (topic, callback) {
  let observer = {
    observe: function (aSubject, aTopic, aData) {
      if (topic === aTopic) {
        callback(aSubject, aData);
      }
    },
  };
  Services.obs.addObserver(observer, topic, false);
  return () => Services.obs.removeObserver(observer, topic);
};

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

// __getLocale
// Reads the browser locale, the default locale is en-US.
var getLocale = function() {
  return Services.locale.getRequestedLocale() || "en-US";
}

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

// ## Tor control protocol utility functions

let _torControl = {
  // Unescape Tor Control string aStr (removing surrounding "" and \ escapes).
  // Based on Vidalia's src/common/stringutil.cpp:string_unescape().
  // Returns the unescaped string. Throws upon failure.
  // Within Tor Launcher, the file components/tl-protocol.js also contains a
  // copy of _strUnescape().
  _strUnescape: function(aStr)
  {
    if (!aStr)
      return aStr;

    var len = aStr.length;
    if ((len < 2) || ('"' != aStr.charAt(0)) || ('"' != aStr.charAt(len - 1)))
      return aStr;

    const kHexRE = /[0-9A-Fa-f]{2}/;
    const kOctalRE = /[0-7]{3}/;
    var rv = "";
    var i = 1;
    var lastCharIndex = len - 2;
    while (i <= lastCharIndex)
    {
      var c = aStr.charAt(i);
      if ('\\' == c)
      {
        if (++i > lastCharIndex)
          throw new Error("missing character after \\");

        c = aStr.charAt(i);
        if ('n' == c)
          rv += '\n';
        else if ('r' == c)
          rv += '\r';
        else if ('t' == c)
          rv += '\t';
        else if ('x' == c)
        {
          if ((i + 2) > lastCharIndex)
            throw new Error("not enough hex characters");

          let s = aStr.substr(i + 1, 2);
          if (!kHexRE.test(s))
            throw new Error("invalid hex characters");

          let val = parseInt(s, 16);
          rv += String.fromCharCode(val);
          i += 3;
        }
        else if (this._isDigit(c))
        {
          let s = aStr.substr(i, 3);
          if ((i + 2) > lastCharIndex)
            throw new Error("not enough octal characters");

          if (!kOctalRE.test(s))
            throw new Error("invalid octal characters");

          let val = parseInt(s, 8);
          rv += String.fromCharCode(val);
          i += 3;
        }
        else // "\\" and others
        {
          rv += c;
          ++i;
        }
      }
      else if ('"' == c)
        throw new Error("unescaped \" within string");
      else
      {
        rv += c;
        ++i;
      }
    }

    // Convert from UTF-8 to Unicode. TODO: is UTF-8 always used in protocol?
    return decodeURIComponent(escape(rv));
  }, // _strUnescape()

  // Within Tor Launcher, the file components/tl-protocol.js also contains a
  // copy of _isDigit().
  _isDigit: function(aChar)
  {
    const kRE = /^\d$/;
    return aChar && kRE.test(aChar);
  },
}; // _torControl

// __unescapeTorString(str, resultObj)__.
// Unescape Tor Control string str (removing surrounding "" and \ escapes).
// Returns the unescaped string. Throws upon failure.
var unescapeTorString = function(str) {
  return _torControl._strUnescape(str);
};

// Export utility functions for external use.
let EXPORTED_SYMBOLS = ["bindPref", "bindPrefAndInit", "getEnv", "getLocale",
                        "getPrefValue", "observe", "showDialog", "unescapeTorString"];
