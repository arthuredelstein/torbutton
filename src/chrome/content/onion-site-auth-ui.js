// # onion-site-auth-ui.js

// Provides a user interface for entering onion site passwords.

// Formatted for docco.js. Later functions call earlier functions.

/* jshint esnext: true */
/* global gBrowser, Components */

// __activateOnionSiteAuthUI__.
// When this feature is activated, users trying to connect
// to an onion site that requires credentials will be
// be prompted for a password.
let activateOnionSiteAuthUI = function (controlHost, controlPort, controlPass) {

// __Implementation:__
// Accumulates HS_DESC results by onion site address. HS_DESC events
// returning REASON=BAD_DESC indicate that the onion site likely needs
// authorization. When an onion site with BAD_DESC fails in the browser,
// prompt the user for a password. Add the password to tor instances's list
// of onion site credentials, and then attempt to connect to the site again.

"use strict";

// Mozilla utilities
const Cu = Components.utils;
const Cr = Components.results;
Cu.import("resource://gre/modules/Services.jsm");

// Import the controller code.
let { controller } = Cu.import("resource://torbutton/modules/tor-control-port.js");

// Make the TorButton logger available.
let logger = Cc["@torproject.org/torbutton-logger;1"]
               .getService(Components.interfaces.nsISupports).wrappedJSObject;


logger.eclog(4, "activating onion site auth UI...");

// __myController__.
// The Tor Control Port we need to detect hidden services
// needing authorization and to set the credentials.
let myController = controller(controlHost, controlPort, controlPass,
                              x => console.log(x.toString()));

// __onionSiteDescriptors__.
// A mutable map of onion sites to HS_DESC responses.
let onionSiteResponses = {};

// __accumulateOnionSiteResponses()__.
// Stores the HS_DESC responses in onionSiteResponses.
let accumulateOnionSiteResponses = function () {
  myController.watchEvent("HS_DESC",
                          event => event.action === "FAILED",
                          event => { logger.eclog(4, JSON.stringify(event)); onionSiteResponses[event.address + ".onion"] = event; } );
};

// __promptOnionSitePassword(onionSiteAddress)__.
// Shows a standard-looking Firefox password prompt, but asks
// for an onion site password. Returns [canceled, password, save].
let promptOnionSitePassword = function (onionSiteAddress) {
  let password = {value : ""},
      checkbox = {value : ""},
      ok = Services.prompt.promptPassword(
             gBrowser.contentWindow, "Authorization Required",
             "Connecting to " + onionSiteAddress + " failed because it requires a password. " +
             "Please enter the password given to you by the onion site operator:",
             password, "Save password", checkbox);
  return [!ok, password.value, checkbox.value];
};

// __attemptToAuthorizeOnionSite(browser, address)__.
// Ask user for password, and if it is provided, attempt to re-connect
// to the onion site.
let attemptToAuthorizeOnionSite = function (browser, address) {
  let response = onionSiteResponses[address];
  logger.eclog(4, "onionSiteResponses: " + JSON.stringify(onionSiteResponses));
  logger.eclog(4, "response found: " + JSON.stringify(response));
  if (response && response.REASON === "BAD_DESC") {
    // Ask the user for the password (blocks).
    let [canceled, password, save] = promptOnionSitePassword(address);
    if (!canceled) {
      myController.setConf("HidServAuth", [address, password]).then(
        () => browser.reload(),
        function (error) {
          Cu.reportError(error);
          window.alert("Password invalid or failed.");
          attemptToAuthorizeOnionSite(address);
        });
    }
  }
};

// __listenForFailedOnionPages(callback)__.
// Whenever an onion page connection fails, calls `callback(browser, address)`, where
// `browser` is the browser object for the tab in question and `address` is the
// onion domain.
let listenForFailedOnionPages = function (callback) {
  let listener = {
    QueryInterface: XPCOMUtils.generateQI(["nsIWebProgressListener",
                                           "nsISupportsWeakReference"]),
    onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
      if ((aFlag & Ci.nsIWebProgressListener.STATE_STOP) &&
          (aStatus === Cr.NS_ERROR_CONNECTION_REFUSED)) {
        let browser = gBrowser.getBrowserForDocument(
                        aWebProgress.DOMWindow.document),
            address = aRequest && aRequest.URI && aRequest.URI.host;
        if (address && address.endsWith(".onion")) {
          callback(browser, address);
        }
      }
    },
    // The following callbacks aren't needed.
    onLocationChange: function(aProgress, aRequest, aURI) { },
    onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) {},
    onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {},
    onSecurityChange: function(aWebProgress, aRequest, aState) {}
  };
  gBrowser.addProgressListener(listener);
};

// Run:
accumulateOnionSiteResponses();
listenForFailedOnionPages(attemptToAuthorizeOnionSite);

// end activateHiddenServiceAuthUI
};
