/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Based on ResourceFilter: A direct workaround for https://bugzil.la/863246
 * https://notabug.org/desktopd/no-resource-uri-leak/src/master/src/resource-filter/content-policy.js
 */

const Cc = Components.classes, Ci = Components.interfaces, Cu = Components.utils;

// Import XPCOMUtils object.
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ContentPolicy() {}

ContentPolicy.prototype = {
  classDescription: "ContentPolicy",
  classID: Components.ID("{4c03be7d-492f-990e-f0da-f3689e564898}"),
  contractID: "@torproject.org/content-policy;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy]),

  shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aExtra) {
    // Accept if no content URI or scheme is not a resource/chrome.
    if (!aContentLocation || !(aContentLocation.schemeIs('resource') || aContentLocation.schemeIs('chrome')))
      return Ci.nsIContentPolicy.ACCEPT;

    // Accept if no origin URI or if origin scheme is chrome/resource/about.
    if (!aRequestOrigin || aRequestOrigin.schemeIs('resource') || aRequestOrigin.schemeIs('chrome') || aRequestOrigin.schemeIs('about'))
      return Ci.nsIContentPolicy.ACCEPT;

    // Accept if resource directly loaded into a tab.
    if (Ci.nsIContentPolicy.TYPE_DOCUMENT === aContentType)
      return Ci.nsIContentPolicy.ACCEPT;

    return Ci.nsIContentPolicy.REJECT_REQUEST;
  },

  shouldProcess: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeType, aExtra)  {
    return Ci.nsIContentPolicy.ACCEPT;
  },
};

// Install a HTTP response handler to check for redirects to URLs with schemes
// that should be internal to the browser.  There's various safeguards and
// checks that cause the body to be unavailable, but the `onLoad()` behavior
// is inconsistent, which results in leaking information about the specific
// user agent instance (eg: what addons are installed).
var requestObserver = {
  ioService: Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService),
  observerService: Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService),

  start: function() {
    this.observerService.addObserver(this, "http-on-examine-response", false);
  },

  observe: function(aSubject, aTopic, aData) {
    let aChannel = aSubject.QueryInterface(Ci.nsIHttpChannel);
    let aStatus = aChannel.responseStatus;

    // If this is a redirect...
    //
    // Note: Technically `304 Not Modifed` isn't a redirect, but receiving that
    // to the proscribed schemes is nonsensical.
    if (aStatus >= 300 && aStatus < 400) {
      let location = aChannel.getResponseHeader("Location");
      let aUri = this.ioService.newURI(location, null, null);

      // And it's redirecting into the browser or addon's internal URLs...
      if (aUri.schemeIs("resource") || aUri.schemeIs("chrome") || aUri.schemeIs("about")) {
        // Cancel the request.
        aSubject.cancel(Components.results.NS_BINDING_ABORTED);
      }
    }
  },
};

// Firefox >= 4.0 (Old versions are extremely irrelevant).
var NSGetFactory = XPCOMUtils.generateNSGetFactory([ContentPolicy]);

// Register the request observer to handle redirects.
requestObserver.start();
