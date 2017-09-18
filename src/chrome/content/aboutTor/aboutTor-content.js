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
 *   AboutTor:GetToolbarData  request toolbar info   content -> chrome
 *   AboutTor:ToolbarData     toolbar info           chrome -> content
 */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;


Cu.import("resource://gre/modules/Services.jsm");
let { bindPrefAndInit } = Cu.import("resource://torbutton/modules/utils.js", {});


var AboutTorListener = {
  kAboutTorMessages: [ "AboutTor:ChromeData", "AboutTor:ToolbarData" ],

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
      case "resize":
        sendAsyncMessage("AboutTor:GetToolbarData");
        break;
    }
  },

  receiveMessage: function(aMessage) {
    if (!this.isAboutTor)
      return;

    switch (aMessage.name) {
      case "AboutTor:ChromeData":
        this.onChromeDataUpdate(aMessage.data);
        break;
      case "AboutTor:ToolbarData":
        this.onToolbarDataUpdate(aMessage.data);
        break;
    }
  },

  onPageLoad: function() {
    // Arrange to update localized text and links.
    bindPrefAndInit("general.useragent.locale", aNewVal => {
      this.onLocaleChange(aNewVal);
    });

    // Add message and event listeners.
    this.kAboutTorMessages.forEach(aMsg => addMessageListener(aMsg, this));
    addMessageListener("AboutTor:ChromeData", this);
    addEventListener("pagehide", this, false);
    addEventListener("resize", this, false);

    sendAsyncMessage("AboutTor:Loaded");
  },

  onPageHide: function() {
    removeEventListener("resize", this, false);
    removeEventListener("pagehide", this, false);
    this.kAboutTorMessages.forEach(aMsg => removeMessageListener(aMsg, this));
  },

  onChromeDataUpdate: function(aData) {
    let body = content.document.body;

    // Update status: tor on/off, update needed, Tor Browser manual shown.
    if (aData.torOn)
      body.setAttribute("toron", "yes");
    else
      body.removeAttribute("toron");

    if (aData.updateNeeded)
      body.setAttribute("torNeedsUpdate", "yes");
    else
      body.removeAttribute("torNeedsUpdate");

    if (aData.showManual)
      body.setAttribute("showmanual", "yes");
    else
      body.removeAttribute("showmanual");

    if (aData.bannerData)
      body.setAttribute("banner-data", aData.bannerData);
    else
      body.removeAttribute("banner-data");

    // Setting body.initialized="yes" displays the body, which must be done
    // at this point because our remaining initialization depends on elements
    // being visible so that their size and position are accurate.
    body.setAttribute("initialized", "yes");

    let containerName = "torstatus-" + (aData.torOn ? "on" : "off") +
                        "-container";
    this.adjustFontSizes(containerName);

    this.onToolbarDataUpdate(aData);
  },

  onToolbarDataUpdate: function(aData) {
    this.adjustArrow(aData.toolbarButtonXPos);
  },

  onLocaleChange: function(aLocale) {
    this.insertPropertyStrings();

    // Set Tor Browser manual link.
    content.document.getElementById("manualLink").href =
                            "https://tb-manual.torproject.org/" + aLocale;

    // Insert "Test Tor Network Settings" url.
    let elem = content.document.getElementById("testTorSettings");
    if (elem) {
      let url = Services.prefs.getCharPref(
                      "extensions.torbutton.test_url_interactive");
      elem.href = url.replace(/__LANG__/g, aLocale.replace(/-/g, '_'));
    }

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
  },

  insertPropertyStrings: function() {
    try {
      let kPropertiesURL = "chrome://torbutton/locale/aboutTor.properties";

      let stringBundle = Services.strings.createBundle(kPropertiesURL);
      let s1 = stringBundle.GetStringFromName("aboutTor.searchDDG.privacy.link");
      let s2 = stringBundle.GetStringFromName("aboutTor.searchDDG.search.link");
      let result = stringBundle.formatStringFromName(
                                  "aboutTor.searchDDG.privacy", [s1, s2], 2);
      if (result) {
        let elem = content.document.getElementById("searchProviderInfo");
        if (elem)
          elem.innerHTML = result;
      }
    } catch(e) {}
  },

  // Ensure that text in top area does not overlap the tor on/off (onion) image.
  // This is done by reducing the font sizes as necessary.
  adjustFontSizes: function(aContainerName)
  {
    let imgElem = content.document.getElementById("torstatus-image");
    let containerElem = content.document.getElementById(aContainerName);
    if (!imgElem || !containerElem)
      return;

    try
    {
      let imgRect = imgElem.getBoundingClientRect();

      for (let textElem = containerElem.firstChild; textElem;
           textElem = textElem.nextSibling)
      {
        if ((textElem.nodeType != textElem.ELEMENT_NODE) ||
            (textElem.nodeName.toLowerCase() == "br"))
        {
          continue;
        }

        let textRect = textElem.getBoundingClientRect();
        if (0 == textRect.width)
          continue;

        // Reduce font to 90% of previous size, repeating the process up to 7
        // times.  This allows for a maximum reduction to just less than 50% of
        // the original size.
        let maxTries = 7;
        while ((textRect.left < imgRect.right) && (--maxTries >= 0))
        {
          let style = content.document.defaultView
                             .getComputedStyle(textElem, null);
          let fontSize = parseFloat(style.getPropertyValue("font-size"));
          textElem.style.fontSize = (fontSize * 0.9) + "px";
          textRect = textElem.getBoundingClientRect();
        }
      }

    } catch (e) {}
  },

  adjustArrow: function(aToolbarButtonXPos)
  {
    let win = content;
    let doc = content.document;
    let textElem = doc.getElementById("updatePrompt");
    let arrowHeadDiv = doc.getElementById("toolbarIconArrowHead");
    let vertExtDiv = doc.getElementById("toolbarIconArrowVertExtension");
    let bendDiv = doc.getElementById("toolbarIconArrowBend");
    let horzExtDiv = doc.getElementById("toolbarIconArrowHorzExtension");
    if (!textElem || !arrowHeadDiv || !vertExtDiv || !bendDiv || !horzExtDiv)
      return;

    let arrowTailElems = [ vertExtDiv, bendDiv, horzExtDiv ];
    if (!aToolbarButtonXPos || isNaN(aToolbarButtonXPos) ||
        (aToolbarButtonXPos < 0))
    {
      arrowHeadDiv.style.display = "none";
      for (let elem of arrowTailElems)
        elem.style.display = "none";
      return;
    }

    const kArrowMargin = 6;          // Horizontal margin between line and text.
    const kArrowHeadExtraWidth = 9;  // Horizontal margin to the line.
    const kArrowLineThickness = 11;
    const kBendWidth = 22;
    const kBendHeight = 22;

    try {
      // Compensate for any content zoom that may be in effect on about:tor.
      // Because window.devicePixelRatio always returns 1.0 for non-Chrome
      // windows (see bug 13875), we use screenPixelsPerCSSPixel for the
      // content window.
      let pixRatio = content.QueryInterface(Ci.nsIInterfaceRequestor)
                             .getInterface(Ci.nsIDOMWindowUtils)
                             .screenPixelsPerCSSPixel;
      let tbXpos = Math.round(aToolbarButtonXPos / pixRatio);

      arrowHeadDiv.style.display = "block";  // Must be visible to get offsetWidth.
      let arrowHalfWidth = Math.round(arrowHeadDiv.offsetWidth / 2);
      let leftAnchor = textElem.offsetLeft - kArrowMargin
                        - kBendWidth + Math.round(kArrowLineThickness / 2);
      let rightAnchor = textElem.offsetLeft + textElem.offsetWidth
                        + kArrowMargin + arrowHalfWidth;

      let isArrowOnLeft = (tbXpos < leftAnchor);
      let isArrowOnRight = (tbXpos > rightAnchor) &&
                           (tbXpos < (win.innerWidth - arrowHalfWidth));
      let isArrowInMiddle = (tbXpos >= leftAnchor) && (tbXpos <= rightAnchor);

      if (isArrowOnLeft || isArrowOnRight || isArrowInMiddle)
      {
        // Position the arrow head.
        let arrowHeadLeft = tbXpos - arrowHalfWidth;
        arrowHeadDiv.style.left = arrowHeadLeft + "px";
        if (isArrowOnLeft || isArrowOnRight)
        {
          let horzExtBottom = textElem.offsetTop +
                Math.round((textElem.offsetHeight + kArrowLineThickness) / 2);

          // Position the vertical (extended) line.
          let arrowHeadBottom = arrowHeadDiv.offsetTop +
                                arrowHeadDiv.offsetHeight;
          vertExtDiv.style.top = arrowHeadBottom + "px";
          vertExtDiv.style.left = (arrowHeadLeft + kArrowHeadExtraWidth) + "px";
          let ht = horzExtBottom - kBendHeight - arrowHeadBottom;
          vertExtDiv.style.height = ht + "px";

          // Position the bend (elbow).
          bendDiv.style.top = (horzExtBottom - kBendHeight) + "px";
          let bendDivLeft;
          if (isArrowOnLeft)
          {
            bendDiv.setAttribute("pos", "left");
            bendDivLeft = arrowHeadLeft + kArrowHeadExtraWidth;
          }
          else if (isArrowOnRight)
          {
            bendDiv.setAttribute("pos", "right");
            bendDivLeft = arrowHeadLeft + kArrowHeadExtraWidth
                          + kArrowLineThickness - kBendWidth;
          }
          bendDiv.style.left = bendDivLeft + "px";

          // Position the horizontal (extended) line.
          horzExtDiv.style.top = (horzExtBottom - kArrowLineThickness) + "px";
          let horzExtLeft, w;
          if (isArrowOnLeft)
          {
            horzExtLeft = bendDivLeft + kBendWidth;
            w = (textElem.offsetLeft - horzExtLeft - kArrowMargin);
          }
          else
          {
            horzExtLeft = rightAnchor - arrowHalfWidth;
            w = tbXpos - arrowHalfWidth - horzExtLeft;
          }
          horzExtDiv.style.left = horzExtLeft + "px";
          horzExtDiv.style.width = w + "px";
        }
      }

      let headDisplay = (isArrowOnLeft || isArrowInMiddle || isArrowOnRight)
                          ? "block" : "none";
      arrowHeadDiv.style.display = headDisplay;
      let tailDisplay = (isArrowOnLeft || isArrowOnRight) ? "block" : "none";
      for (let elem of arrowTailElems)
        elem.style.display = tailDisplay;
    } catch (e) {}
  }
};

AboutTorListener.init(this);
