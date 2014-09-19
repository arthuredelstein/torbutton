// This script, when run in a content window, modifies
// certain Web APIs to prevent them from leaking information
// about the user. It is loaded into content windows when
// before any scripts run by run-content-sanitizer.js.

/* jshint esnext:true */

// Wrap all code in an anonymous function that runs immediately.
(function () {

// USify(locales): a function that converts a locales argument (as
// described in https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl#locales_argument)
// into an array with the last (default) locale set to "en-US".
let USify = function (locales) {
  // Here we are careful not to run any potentially hostile methods
  // of the locales argument that could delete the "en-US" default.
  let newLocales = ["en-US"];
  if (typeof(locales) === "string") {
    newLocales.unshift(locales);
  } else {
    if (locales && locales.length) {
      for (i = locales.length - 1; i >= 0; --i) {
        newLocales.unshift(locales[i]);
      }
    }
  }
  return newLocales;
};

// __spoofLocales()__.
// Modifies the default locale for various Web API methods
// to avoid leaking the user's locale.
let spoofLocales = function () {
  // Set default (fallback) locale to "en-US" for...
  // ... Date.toLocaleString() and Number.toLocaleString()
  ['Date', 'Number'].map(function (api) {
    let old_toLocaleString = window[api].prototype.toLocaleString;
    window[api].prototype.toLocaleString = function (locales, options) {
      return old_toLocaleString.apply(this, [USify(locales), options]);
    };
  });
  // ... String.localeCompare()
  let old_String_localeCompare = String.prototype.localeCompare;
  String.prototype.localeCompare = function (compareString, locales, options) {
    return old_String_localeCompare.apply(this, [compareString, USify(locales), options]);
  };
  // ... Intl.Collator, Intl.DateTimeFormat, and Intl.NumberFormat
  ['Collator', 'DateTimeFormat', 'NumberFormat'].map(function (property) {
    let old_Intl_property = Intl[property];
    Intl[property] = function (locales, options) {
      return old_Intl_property(USify(locales), options);
    };
    Intl[property].supportedLocalesOf = old_Intl_property.supportedLocalesOf;
  });
};

spoofLocales();
//                        Array.toLocaleString

})();
