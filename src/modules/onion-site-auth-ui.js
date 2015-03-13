// # onion-site-auth-ui.js

// Provides a user interface for entering onion site passwords.

// Formatted for docco.js. Later functions call earlier functions.

// __Implementation:__
// Accumulates HS_DESC results by onion site hosts. HS_DESC events
// returning REASON=BAD_DESC indicate that the onion site likely needs
// authorization. When an onion site with BAD_DESC fails in the browser,
// prompt the user for a password. Add the password to the tor instances's
// list of onion site credentials, and then attempt to connect to the site
// again.

/* jshint esnext: true */
/* jshint -W097 */
/* global Components, Services, XPCOMUtils */

"use strict";

// ## Mozilla utilities
let {classes: Cc, interfaces: Ci, results: Cr, Constructor: CC, utils: Cu } = Components;
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Import the controller code.
let { controller } = Cu.import("resource://torbutton/modules/tor-control-port.js");

// Make the TorButton logger available.
let logger = Cc["@torproject.org/torbutton-logger;1"]
               .getService(Components.interfaces.nsISupports).wrappedJSObject;

logger.eclog(4, "activating onion site auth UI...");

// ## User interface

// __torbuttonBundle__.
// Bundle of localized strings for torbutton UI.
let torbuttonBundle = Services.strings.createBundle(
                        "chrome://torbutton/locale/torbutton.properties");

// __uiString__.
// Read the localized strings for this UI.
let uiString = function (shortName) {
  return torbuttonBundle.GetStringFromName("torbutton.onion_site_auth_ui." + shortName);
};

// __promptOnionSitePassword(onionHost)__.
// Shows a standard-looking Firefox password prompt, but asks
// for an onion site password. Returns [canceled, password, save].
let promptOnionSitePassword = function (browser, onionHost) {
  // TODO: Implement password saving.
  let password = {value : ""},
      checkbox = {value : null},
      ok = Services.prompt.promptPassword(
             browser.contentWindow, uiString("authorization_required"),
             uiString("connecting").replace("_A1_", onionHost) + " " +
             uiString("please_enter_password"),
             password, null /* "Save password" */, checkbox);
  return [!ok, password.value, checkbox.value];
};

// __attemptToAuthorizeOnionSite(myController, browser, destinationURI)__.
// Ask user for password, and if it is provided, attempt to re-connect
// to the onion site.
let attemptToAuthorizeOnionSite = function (myController, browser, destinationURI) {
  // Ask the user for the password (blocks).
  let onionHost = destinationURI.host,
      [canceled, password, save] = promptOnionSitePassword(browser, onionHost);
  if (!canceled) {
    myController.setConf("HidServAuth", [onionHost, password]).then(
      function () {
        // Attempt to reach the site again.
        browser.contentWindow.location.href = destinationURI.spec;
      },
      function (error) {
        Cu.reportError(error);
        browser.contentWindow.alert(uiString("invalid_password"));
        attemptToAuthorizeOnionSite(browser, destinationURI);
      });
  }
};

// ## Monitoring tabs and onion sites

// __activeBrowsersToHosts__.
// A mutable map of active browser objects to onion domains.
let activeBrowsersToHosts = new Map();

// __badHosts__.
// Set of hosts. Membership indicates we have seen a BAD_DESC
// for that host.
let badHosts = null;

// __hostTried__.
// Have we tried a password with a given host yet?
let hostTried = new Set();

// __monitorActiveBrowsers(myController, gBrowser)__.
// Monitors browsers for any that are actively loading onion sites,
// a places them in the `activeBrowsers` map.
let monitorActiveBrowsers = function (myController, gBrowser) {
  let listener = {
    QueryInterface: XPCOMUtils.generateQI(["nsIWebProgressListener",
                                           "nsISupportsWeakReference"]),
    onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) {
      if (aFlag & (Ci.nsIWebProgressListener.STATE_START |
                   Ci.nsIWebProgressListener.STATE_STOP)) {
        let browser = gBrowser.getBrowserForDocument(
                        aWebProgress.DOMWindow.document),
            destinationURI = aRequest && aRequest.URI,
            host;
        try {
          host = destinationURI.host;
        } catch (e) { }
        if (host && host.endsWith(".onion")) {
          if (aFlag & Ci.nsIWebProgressListener.STATE_START) {
            activeBrowsersToHosts.set(browser, destinationURI);
          } else if ((aFlag & Ci.nsIWebProgressListener.STATE_STOP) &&
                     badHosts.has(host) &&
                     ((aStatus === Cr.NS_ERROR_CONNECTION_REFUSED) ||
                      !hostTried.has(host))) {
            activeBrowsersToHosts.delete(browser);
            hostTried.add(host);
            attemptToAuthorizeOnionSite(myController, browser, destinationURI);
          }
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

// __handleBadOnionSiteDescriptors(myController)__.
// If a bad onion site descriptor is encountered, take note, and
// if show a password prompt immediately if we have never tried
// before.
let handleBadOnionSiteDescriptors = function (myController) {
  if (!badHosts) {
    badHosts = new Set();
    myController.watchEvent(
      "HS_DESC",
      event => event.action === "FAILED",
      function (event) {
        let host = event.address + ".onion";
        if (event.REASON === "BAD_DESC") {
          badHosts.add(host);
          // Abort connection and show a password prompt immediately 
          // if we have never tried a password with this host before.
          for (let activeBrowser of activeBrowsersToHosts.keys()) {
            let destinationURI = activeBrowsersToHosts.get(activeBrowser);
            if (host === destinationURI.host &&
                event.authType === "NO_AUTH" &&
                !hostTried.has(host)) {
              activeBrowser.stop();
              break;
            }
          }
        }
      });
  }
};

// ## Main function

// __activateOnionSiteAuthUI__.
// When this feature is activated, users trying to connect
// to an onion site that requires credentials will be
// be prompted for a password.
let activateOnionSiteAuthUI = function (gBrowser, controlHost, controlPort, controlPass) {
  let myController = controller(controlHost, controlPort, controlPass,
                                err => Cu.reportError(err));
  handleBadOnionSiteDescriptors(myController);
  monitorActiveBrowsers(myController, gBrowser);
};

let EXPORTED_SYMBOLS = ["activateOnionSiteAuthUI"];
