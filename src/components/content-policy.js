/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Based on ResourceFilter: A direct workaround for https://bugzil.la/863246
 * https://notabug.org/desktopd/no-resource-uri-leak/src/master/src/resource-filter/content-policy.js
 */

const Ci = Components.interfaces, Cu = Components.utils;

// Import XPCOMUtils object.
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

function ContentPolicy() {}

ContentPolicy.prototype = {
  classDescription: "ContentPolicy",
  classID: Components.ID("{4c03be7d-492f-990e-f0da-f3689e564898}"),
  contractID: "@torproject.org/content-policy;1",
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPolicy]),

  _xpcom_categories: [{category: "content-policy"}],

  shouldLoad: function(aContentType, aContentLocation, aRequestOrigin, aContext, aMimeTypeGuess, aExtra) {
    // Accept if no content URI or scheme is not a resource.
    if (!aContentLocation || !aContentLocation.schemeIs('resource'))
      return Ci.nsIContentPolicy.ACCEPT;

    // Accept if no origin URI, or if the origin URI scheme is chrome/resource.
    if (!aRequestOrigin || aRequestOrigin.schemeIs('resource') || aRequestOrigin.schemeIs('chrome'))
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

// Firefox >= 4.0 (Old versions are extremely irrelevant).
var NSGetFactory = XPCOMUtils.generateNSGetFactory([ContentPolicy]);
