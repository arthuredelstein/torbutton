/*************************************************************************
 * Copyright (c) 2017, The Tor Project, Inc.
 * See LICENSE for licensing information.
 *
 * vim: set sw=2 sts=2 ts=8 et syntax=javascript:
 *
 * about:tor content script
 *************************************************************************/

/*
 * The following about:tor IPC messages are exchanged by this code and
 * the code in torbutton.js:
 *   AboutTor:Loaded          page loaded            content -> chrome
 *   AboutTor:ChromeData      privileged data        chrome -> content
 */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;


Cu.import("resource://gre/modules/Services.jsm");
let { bindPrefAndInit, show_torbrowser_manual } = Cu.import("resource://torbutton/modules/utils.js", {});


var AboutTorListener = {
  kAboutTorLoadedMessage: "AboutTor:Loaded",
  kAboutTorChromeDataMessage: "AboutTor:ChromeData",
  kAboutTorHideTorNewsBanner: "AboutTor:HideTorNewsBanner",

  get isAboutTor() {
    return content.document.documentURI.toLowerCase() == "about:tor";
  },

  init: function(aChromeGlobal) {
    aChromeGlobal.addEventListener("AboutTorLoad", this, false, true);
  },

  handleEvent: function(aEvent) {
    if (!this.isAboutTor)
      return;

    switch (aEvent.type) {
      case "AboutTorLoad":
        this.onPageLoad();
        break;
      case "pagehide":
        this.onPageHide();
        break;
    }
  },

  receiveMessage: function(aMessage) {
    if (!this.isAboutTor)
      return;

    switch (aMessage.name) {
      case this.kAboutTorChromeDataMessage:
        this.onChromeDataUpdate(aMessage.data);
        break;
    }
  },

  setupBannerClosing: function () {
    const kAboutTorHideTorNewsBanner = this.kAboutTorHideTorNewsBanner;
    let closer = content.document.getElementById("tornews-banner-closer");
    closer.addEventListener("click", function () {
      sendAsyncMessage(kAboutTorHideTorNewsBanner);
    });
    let link = content.document.querySelector("#tornews-banner-message a");
    link.addEventListener("click", function () {
      // Wait until page unloads so we don't hide banner before that.
      content.addEventListener("unload", function () {
        sendAsyncMessage(kAboutTorHideTorNewsBanner);
      });
    });
    bindPrefAndInit("extensions.torbutton.tornews_banner_countdown",
                    countdown => content.document.body.setAttribute(
                      "show-tornews-banner", countdown > 0));
  },

  onPageLoad: function() {
    // Arrange to update localized text and links.
    bindPrefAndInit("intl.locale.requested", aNewVal => {
      if (aNewVal !== null) {
        this.onLocaleChange(aNewVal);
      }
    });

    this.setupBannerClosing();

    // Add message and event listeners.
    addMessageListener(this.kAboutTorChromeDataMessage, this);
    addEventListener("pagehide", this, false);
    addEventListener("resize", this, false);

    sendAsyncMessage(this.kAboutTorLoadedMessage);
  },

  onPageHide: function() {
    removeEventListener("resize", this, false);
    removeEventListener("pagehide", this, false);
    removeMessageListener(this.kAboutTorChromeDataMessage, this);
  },

  onChromeDataUpdate: function(aData) {
    let body = content.document.body;

    // Update status: tor on/off, Tor Browser manual shown.
    if (aData.torOn)
      body.setAttribute("toron", "yes");
    else
      body.removeAttribute("toron");

    if (show_torbrowser_manual())
      body.setAttribute("showmanual", "yes");
    else
      body.removeAttribute("showmanual");

    // Setting body.initialized="yes" displays the body.
    body.setAttribute("initialized", "yes");
  },

  onLocaleChange: function(aLocale) {
    // Set Tor Browser manual link.
    content.document.getElementById("manualLink").href =
                            "https://tb-manual.torproject.org/" + aLocale;

    // Display the Tor Browser product name and version.
    try {
      const kBrandBundle = "chrome://branding/locale/brand.properties";
      let brandBundle = Cc["@mozilla.org/intl/stringbundle;1"]
                          .getService(Ci.nsIStringBundleService)
                          .createBundle(kBrandBundle);
      let productName = brandBundle.GetStringFromName("brandFullName");
      let tbbVersion = Services.prefs.getCharPref("torbrowser.version");
      elem = content.document.getElementById("torstatus-version");

      while (elem.firstChild)
        elem.removeChild(elem.firstChild);
      elem.appendChild(content.document.createTextNode(productName + '\n'
                       + tbbVersion));
    } catch (e) {}
  }
};

AboutTorListener.init(this);
