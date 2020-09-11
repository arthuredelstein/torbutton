// A script that automatically displays the Tor Circuit used for the
// current domain for the currently selected tab.
//
// This file is written in call stack order (later functions
// call earlier functions). The file can be processed
// with docco.js to produce pretty documentation.
//
// This script is to be embedded in torbutton.xhtml. It defines a single global
// function, createTorCircuitDisplay(), which activates the automatic Tor
// circuit display for the current tab and any future tabs.
//
// See https://trac.torproject.org/8641

/* jshint esnext: true */
/* global document, gBrowser, Components */

// ### Main function
// __createTorCircuitDisplay(enablePrefName)__.
// The single function that prepares tor circuit display. Connects to a tor
// control port using information provided to the control port module via
// a previous call to configureControlPortModule(), and binds to a named
// bool pref whose value determines whether the circuit display is enabled
// or disabled.
let createTorCircuitDisplay = (function () {

"use strict";

// Mozilla utilities
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Import the controller code.
let { controller } = ChromeUtils.import("resource://torbutton/modules/tor-control-port.js", {});

// Utility functions
let { bindPrefAndInit, observe, getLocale, getDomainForBrowser, torbutton_get_property_string } = ChromeUtils.import("resource://torbutton/modules/utils.js", {});

// Make the TorButton logger available.
let logger = Cc["@torproject.org/torbutton-logger;1"]
               .getService(Ci.nsISupports).wrappedJSObject;

// ## Circuit/stream credentials and node monitoring

// A mutable map that stores the current nodes for each
// SOCKS username/password pair.
let credentialsToNodeDataMap = new Map(),
    // A mutable map that reports `true` for IDs of "mature" circuits
    // (those that have conveyed a stream).
    knownCircuitIDs = new Map(),
    // A mutable map that records the SOCKS credentials for the
    // latest channels for each browser + domain.
    browserToCredentialsMap = new Map();

// __trimQuotes(s)__.
// Removes quotation marks around a quoted string.
let trimQuotes = s => s ? s.match(/^"(.*)"$/)[1] : undefined;

// __getBridge(id)__.
// Gets the bridge parameters for a given node ID. If the node
// is not currently used as a bridge, returns null.
let getBridge = async function (controller, id) {
  let bridges = await controller.getConf("bridge");
  if (bridges) {
    for (let bridge of bridges) {
      if (bridge.ID && bridge.ID.toUpperCase() === id.toUpperCase()) {
        return bridge;
      }
    }
  }
  return null;
};

// nodeDataForID(controller, id)__.
// Returns the type, IP and country code of a node with given ID.
// Example: `nodeDataForID(controller, "20BC91DC525C3DC9974B29FBEAB51230DE024C44")`
// => `{ type : "default", ip : "12.23.34.45", countryCode : "fr" }`
let nodeDataForID = async function (controller, id) {
  let result = {},
      bridge = await getBridge(controller, id); // type, ip, countryCode;
  if (bridge) {
    result.type = "bridge";
    result.bridgeType = bridge.type;
    // Attempt to get an IP address from bridge address string.
    try {
      result.ip = bridge.address.split(":")[0];
    } catch (e) { }
  } else {
    // either dealing with a relay, or a bridge whose fingerprint is not saved in torrc
    try {
      let statusMap = await controller.getInfo("ns/id/" + id);
      result.type = "default";
      result.ip = statusMap.IP;
    } catch (e) {
      // getInfo will throw if the given id is not a relay
      // this probably means we are dealing with a user-provided bridge with no fingerprint
      result.type = "bridge";
      // we don't know the ip or type, so leave blank
      result.ip = "";
      result.bridgeType = "";
    }
  }
  if (result.ip) {
    // Get the country code for the node's IP address.
    try {
      let countryCode = await controller.getInfo("ip-to-country/" + result.ip);
      result.countryCode = countryCode === "??" ? null : countryCode;
    } catch (e) { }
  }
  return result;
};

// __nodeDataForCircuit(controller, circuitEvent)__.
// Gets the information for a circuit.
let nodeDataForCircuit = async function (controller, circuitEvent) {
  let rawIDs = circuitEvent.circuit.map(circ => circ[0]),
      // Remove the leading '$' if present.
      ids = rawIDs.map(id => id[0] === "$" ? id.substring(1) : id);
  // Get the node data for all IDs in circuit.
  return Promise.all(ids.map(id => nodeDataForID(controller, id)));
};

// __getCircuitStatusByID(aController, circuitID)__
// Returns the circuit status for the circuit with the given ID.
let getCircuitStatusByID = async function (aController, circuitID) {
  let circuitStatuses = await aController.getInfo("circuit-status");
  if (circuitStatuses) {
    for (let circuitStatus of circuitStatuses) {
      if (circuitStatus.id === circuitID) {
        return circuitStatus;
      }
    }
  }
  return null;
};

// __collectIsolationData(aController, updateUI)__.
// Watches for STREAM SENTCONNECT events. When a SENTCONNECT event occurs, then
// we assume isolation settings (SOCKS username+password) are now fixed for the
// corresponding circuit. Whenever the first stream on a new circuit is seen,
// looks up u+p and records the node data in the credentialsToNodeDataMap.
// We need to update the circuit display immediately after any new node data
// is received. So the `updateUI` callback will be called at that point.
// See https://trac.torproject.org/projects/tor/ticket/15493
let collectIsolationData = function (aController, updateUI) {
  return aController.watchEvent(
    "STREAM",
    streamEvent => streamEvent.StreamStatus === "SENTCONNECT",
    async (streamEvent) => {
      if (!knownCircuitIDs.get(streamEvent.CircuitID)) {
        logger.eclog(3, "streamEvent.CircuitID: " + streamEvent.CircuitID);
        knownCircuitIDs.set(streamEvent.CircuitID, true);
        let circuitStatus = await getCircuitStatusByID(aController, streamEvent.CircuitID),
            credentials = circuitStatus ?
                            (trimQuotes(circuitStatus.SOCKS_USERNAME) + "|" +
                             trimQuotes(circuitStatus.SOCKS_PASSWORD)) :
                            null;
        if (credentials) {
          let nodeData = await nodeDataForCircuit(aController, circuitStatus);
          credentialsToNodeDataMap.set(credentials, nodeData);
          updateUI();
        }
      }
    });
};

// __browserForChannel(channel)__.
// Returns the browser that loaded a given channel.
let browserForChannel = function (channel) {
  if (!channel) return null;
  let chan = channel.QueryInterface(Ci.nsIChannel);
  let callbacks = chan.notificationCallbacks;
  if (!callbacks) return null;
  let loadContext;
  try {
    loadContext = callbacks.getInterface(Ci.nsILoadContext);
  } catch (e) {
    // Ignore
    return null;
  }
  if (!loadContext) return null;
  return loadContext.topFrameElement;
};

// __collectBrowserCredentials()__.
// Starts observing http channels. Each channel's proxyInfo
// username and password is recorded for the channel's browser.
let collectBrowserCredentials = function () {
  return observe("http-on-modify-request", chan => {
    try {
      let proxyInfo = chan.QueryInterface(Ci.nsIProxiedChannel).proxyInfo;
      let browser = browserForChannel(chan);
      if (browser && proxyInfo) {
        if (!browserToCredentialsMap.has(browser)) {
          browserToCredentialsMap.set(browser, new Map());
        }
        let domainMap = browserToCredentialsMap.get(browser);
        domainMap.set(proxyInfo.username, [proxyInfo.username,
                                          proxyInfo.password]);
      }
    } catch (e) {
      logger.eclog(3, `Error collecting browser credentials: ${e.message}, ${chan.URI.spec}`);
    }
  });
};

// ## User interface

// __uiString__.
// Read the localized strings for this UI.
let uiString = function (shortName) {
  return torbutton_get_property_string("torbutton.circuit_display." + shortName);
};

// __localizedCountryNameFromCode(countryCode)__.
// Convert a country code to a localized country name.
// Example: `'de'` -> `'Deutschland'` in German locale.
let localizedCountryNameFromCode = function (countryCode) {
  if (!countryCode) return uiString("unknown_country");
  try {
    return Services.intl.getRegionDisplayNames(undefined, [countryCode])[0];
  } catch (e) {
    return countryCode.toUpperCase();
  }
};

// __showCircuitDisplay(show)__.
// If show === true, makes the circuit display visible.
let showCircuitDisplay = function (show) {
  document.getElementById("circuit-display-container").style.display = show ?
							    'block' : 'none';
};

// __xmlTree(ns, data)__.
// Takes an xml namespace, ns, and a
// data structure representing xml elements like
// [tag, { attr-key: attr-value }, ...xml-children]
// and returns nested xml element objects.
let xmlTree = function xmlTree (ns, data) {
  let [type, attrs, ...children] = data;
  let element = type.startsWith("html:")
    ? document.createXULElement(type)
    : document.createElementNS(ns, type);
  for (let [key, val] of Object.entries(attrs)) {
    element.setAttribute(key, val);
  }
  for (let child of children) {
    if (child !== null && child !== undefined) {
      element.append(typeof child === "string" ? child : xmlTree(ns, child));
    }
  }
  return element;
};

// __htmlTree(data)__.
// Takes a data structure representing html elements like
// [tag, { attr-key: attr-value }, ...html-children]
// and returns nested html element objects.
let htmlTree = data => xmlTree("http://www.w3.org/1999/xhtml", data);

// __appendHtml(parent, data)__.
// Takes a data structure representing html elements like
// [tag, { attr-key: attr-value }, ...html-children]
// and appends nested html element objects to the parent element.
let appendHtml = (parent, data) => parent.appendChild(htmlTree(data));

// __circuitCircuitData()__.
// Obtains the circuit used by the given browser.
let currentCircuitData = function (browser) {
  if (browser) {
    let firstPartyDomain = getDomainForBrowser(browser);
    let domain = firstPartyDomain || "--unknown--";
    let domainMap = browserToCredentialsMap.get(browser);
    let credentials = domainMap && domainMap.get(domain);
    if (credentials) {
      let [SOCKS_username, SOCKS_password] = credentials;
      let nodeData = credentialsToNodeDataMap.get(`${SOCKS_username}|${SOCKS_password}`);
      let domain = SOCKS_username;
      return { domain, nodeData };
    }
  }
  return { domain: null, nodeData: null };
};

// __updateCircuitDisplay()__.
// Updates the Tor circuit display, showing the current domain
// and the relay nodes for that domain.
let updateCircuitDisplay = function () {
  let { domain, nodeData } = currentCircuitData(gBrowser.selectedBrowser);
  if (domain && nodeData) {
    // Update the displayed information for the relay nodes.
    let nodeHtmlList = document.getElementById("circuit-display-nodes");
    let li = (...data) => appendHtml(nodeHtmlList, ["li", {}, ...data]);
    nodeHtmlList.innerHTML = "";
    li(uiString("this_browser"));
    for (let i = 0; i < nodeData.length; ++i) {
      let relayText;
      if (nodeData[i].type === "bridge") {
        relayText = uiString("tor_bridge");
        let bridgeType = nodeData[i].bridgeType;
        if (bridgeType === "meek_lite") {
          relayText += ": meek";
        }
        else if (bridgeType !== "vanilla" && bridgeType !== "") {
          relayText += ": " + bridgeType;
        }
      } else if (nodeData[i].type == "default") {
        relayText = localizedCountryNameFromCode(nodeData[i].countryCode);
      }
      let ip = nodeData[i].ip.startsWith("0.") ? "" : nodeData[i].ip;
      li(relayText, " ", ["span", { class: "circuit-ip-address" }, ip], " ",
         (i === 0 && nodeData[0].type !== "bridge") ?
           ["span", { class: "circuit-guard-info" }, uiString("guard")] : null);
    }

    let domainParts = [];
    if (domain.endsWith(".onion")) {
      for (let i = 0; i < 3; ++i) {
        li(uiString("relay"));
      }
      if (domain.length > 22) {
        domainParts.push(domain.slice(0, 7), "…", domain.slice(-12));
      } else {
        domainParts.push(domain);
      }
    } else {
      domainParts.push(domain);
    }

    // We use a XUL html:span element so that the tooltiptext is displayed.
    li([
      "html:span",
      {
        class: "circuit-onion",
        onclick: `
          this.classList.add("circuit-onion-copied");
          Cc[
            "@mozilla.org/widget/clipboardhelper;1"
          ].getService(Ci.nsIClipboardHelper).copyString(this.getAttribute("data-onion"))
        `,
        "data-onion": domain,
        "data-text-clicktocopy": torbutton_get_property_string("torbutton.circuit_display.click_to_copy"),
        "data-text-copied": torbutton_get_property_string("torbutton.circuit_display.copied"),
        tooltiptext: domain,
      },
      ...domainParts,
    ]);

    // Hide the note about guards if we are using a bridge.
    document.getElementById("circuit-guard-note-container").style.display =
      (nodeData[0].type === "bridge") ? "none" : "block";
  } else {
    // Only show the Tor circuit if we have credentials and node data.
    logger.eclog(4, "no SOCKS credentials found for current document.");
  }
  showCircuitDisplay(domain && nodeData);
};

// __syncDisplayWithSelectedTab(syncOn)__.
// Whenever the user starts to open the popup menu, make sure the display
// is the correct one for this tab. It's also possible that a new site
// can be loaded while the popup menu is open.
// Update the display if this happens.
let syncDisplayWithSelectedTab = (function() {
  let listener = { onLocationChange : function (aBrowser) {
                      if (aBrowser === gBrowser.selectedBrowser) {
                        updateCircuitDisplay();
                      }
                    } };
  return function (syncOn) {
    let popupMenu = document.getElementById("identity-popup");
    if (syncOn) {
      // Update the circuit display just before the popup menu is shown.
      popupMenu.addEventListener("popupshowing", updateCircuitDisplay);
      // If the currently selected tab has been sent to a new location,
      // update the circuit to reflect that.
      gBrowser.addTabsProgressListener(listener);
    } else {
      // Stop syncing.
      gBrowser.removeTabsProgressListener(listener);
      popupMenu.removeEventListener("popupshowing", updateCircuitDisplay);
      // Hide the display.
      showCircuitDisplay(false);
    }
  };
})();

// __setupGuardNote()__.
// Call once to show the Guard note as intended.
let setupGuardNote = function () {
  let guardNote = document.getElementById("circuit-guard-note-container");
  let guardNoteString = uiString("guard_note");
  let learnMoreString = uiString("learn_more");
  let [noteBefore, name, noteAfter] = guardNoteString.split(/[\[\]]/);
  let localeCode = getLocale();
  appendHtml(guardNote,
             ["div", {},
              noteBefore, ["span", {class: "circuit-guard-name"}, name],
              noteAfter, " ",
              ["span", {onclick: `gBrowser.selectedTab = gBrowser.addWebTab('https://support.torproject.org/${localeCode}/tbb/tbb-2/');`,
                        class: "circuit-link"},
               learnMoreString]]);
};

// __ensureCorrectPopupDimensions()__.
// Make sure the identity popup always displays with the correct height.
let ensureCorrectPopupDimensions = function () {
  let setDimensions = () => {
    setTimeout(() => {
      let view = document.querySelector("#identity-popup-multiView .panel-viewcontainer");
      let stack = document.querySelector("#identity-popup-multiView .panel-viewstack");
      let view2 = document.getElementById("identity-popup-mainView");
      if (view && stack && view2) {
        let newWidth = Math.max(...[...view2.children].map(el => el.clientWidth));
        let newHeight = stack.clientHeight;
        stack.setAttribute("width", newWidth);
        view2.style.minWidth = view2.style.maxWidth = newWidth + "px";
        view.setAttribute("width", newWidth);
        view.setAttribute("height", newHeight);
      }
    }, 0);
  };
  let removeDimensions = () => {
    let view = document.querySelector("#identity-popup-multiView .panel-viewcontainer");
    let stack = document.querySelector("#identity-popup-multiView .panel-viewstack");
    let view2 = document.getElementById("identity-popup-mainView");
    if (view && stack && view2) {
      view.removeAttribute("width");
      view.removeAttribute("height");
      stack.removeAttribute("width");
      view2.style.minWidth = view2.style.maxWidth = "";
    }
  };
  let popupMenu = document.getElementById("identity-popup");
  popupMenu.addEventListener("popupshowing", setDimensions);
  popupMenu.addEventListener("popuphiding", removeDimensions);
  return () => {
    popupMenu.removeEventListener("popupshowing", setDimensions);
    popupMenu.removeEventListener("popuphiding", removeDimensions);
  };
};

// ## Main function

// __setupDisplay(enablePrefName)__.
// Once called, the Tor circuit display will be started whenever
// the "enablePref" is set to true, and stopped when it is set to false.
// A reference to this function (called createTorCircuitDisplay) is exported as a global.
let setupDisplay = function (enablePrefName) {
  // From 79 on the identity popup is initialized lazily
  if (gIdentityHandler._initializePopup) {
    gIdentityHandler._initializePopup();
  }
  setupGuardNote();
  let myController = null,
      stopCollectingIsolationData = null,
      stopCollectingBrowserCredentials = null,
      stopEnsuringCorrectPopupDimensions = null,
      stop = function() {
        syncDisplayWithSelectedTab(false);
        if (myController) {
          if (stopCollectingIsolationData) {
	    stopCollectingIsolationData();
          }
          if (stopCollectingBrowserCredentials) {
            stopCollectingBrowserCredentials();
          }
          if (stopEnsuringCorrectPopupDimensions) {
            stopEnsuringCorrectPopupDimensions();
          }
          myController = null;
        }
      },
      start = function () {
        if (!myController) {
          myController = controller(function (err) {
            // An error has occurred.
            logger.eclog(5, err);
            logger.eclog(5, "Disabling tor display circuit because of an error.");
            myController.close();
            stop();
          });
          syncDisplayWithSelectedTab(true);
          stopCollectingIsolationData = collectIsolationData(myController, updateCircuitDisplay);
          stopCollectingBrowserCredentials = collectBrowserCredentials();
          stopEnsuringCorrectPopupDimensions = ensureCorrectPopupDimensions();
       }
     };
  try {
    let unbindPref = bindPrefAndInit(enablePrefName, on => { if (on) start(); else stop(); });
    // When this chrome window is unloaded, we need to unbind the pref.
    window.addEventListener("unload", function () {
      unbindPref();
      stop();
    });
  } catch (e) {
    logger.eclog(5, "Error: " + e.message + "\n" + e.stack);
  }
};

return setupDisplay;

// Finish createTorCircuitDisplay()
})();
