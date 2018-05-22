// A script that automatically displays the Tor Circuit used for the
// current domain for the currently selected tab.
//
// This file is written in call stack order (later functions
// call earlier functions). The file can be processed
// with docco.js to produce pretty documentation.
//
// This script is to be embedded in torbutton.xul. It defines a single global
// function, createTorCircuitDisplay(ipcFile, host, port, password), which
// activates the automatic Tor circuit display for the current tab and any
// future tabs.
//
// See https://trac.torproject.org/8641

/* jshint esnext: true */
/* global document, gBrowser, Components */

// ### Main function
// __createTorCircuitDisplay(ipcFile, host, port, password, enablePrefName)__.
// The single function that prepares tor circuit display. Connects to a tor
// control port with the given ipcFile or host plus port, and password, and
// binds to a named bool pref whose value determines whether the circuit display
// is enabled or disabled.
let createTorCircuitDisplay = (function () {

"use strict";

// Mozilla utilities
const { Cu : utils , Ci : interfaces } = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

// Import the controller code.
let { controller } = Cu.import("resource://torbutton/modules/tor-control-port.js", {});

// Utility functions
let { bindPrefAndInit, observe } = Cu.import("resource://torbutton/modules/utils.js", {});

// Make the TorButton logger available.
let logger = Cc["@torproject.org/torbutton-logger;1"]
               .getService(Components.interfaces.nsISupports).wrappedJSObject;

// ## Circuit/stream credentials and node monitoring

// A mutable map that stores the current nodes for each
// SOCKS username/password pair.
let credentialsToNodeDataMap = {},
    // A mutable map that reports `true` for IDs of "mature" circuits
    // (those that have conveyed a stream).
    knownCircuitIDs = {},
    // A mutable map that records the SOCKS credentials for the
    // latest channels for each browser.
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
    result.type = "default";
    // Get the IP address for the given node ID.
     try {
       let statusMap = await controller.getInfo("ns/id/" + id);
       result.ip = statusMap.IP;
     } catch (e) { }
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
      if (!knownCircuitIDs[streamEvent.CircuitID]) {
        logger.eclog(3, "streamEvent.CircuitID: " + streamEvent.CircuitID);
        knownCircuitIDs[streamEvent.CircuitID] = true;
        let circuitStatus = await getCircuitStatusByID(aController, streamEvent.CircuitID),
            credentials = circuitStatus ?
                            (trimQuotes(circuitStatus.SOCKS_USERNAME) + "|" +
                             trimQuotes(circuitStatus.SOCKS_PASSWORD)) :
                            null;
        if (credentials) {
          let nodeData = await nodeDataForCircuit(aController, circuitStatus);
          credentialsToNodeDataMap[credentials] = nodeData;
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
          browserToCredentialsMap.set(browser, [proxyInfo.username,
                                                proxyInfo.password]);
      }
    } catch (e) {
      logger.eclog(3, `Error collecting browser credentials: ${e.message}, ${chan.URI.spec}`);
    }
  });
};

// ## User interface

// __torbuttonBundle__.
// Bundle of localized strings for torbutton UI.
let torbuttonBundle = Services.strings.createBundle(
                        "chrome://torbutton/locale/torbutton.properties");

// __uiString__.
// Read the localized strings for this UI.
let uiString = function (shortName) {
  return torbuttonBundle.GetStringFromName("torbutton.circuit_display." + shortName);
};

// __regionBundle__.
// A list of localized region (country) names.
let regionBundle = Services.strings.createBundle(
                     "chrome://global/locale/regionNames.properties");

// __localizedCountryNameFromCode(countryCode)__.
// Convert a country code to a localized country name.
// Example: `'de'` -> `'Deutschland'` in German locale.
let localizedCountryNameFromCode = function (countryCode) {
  if (!countryCode) return uiString("unknown_country");
  try {
    return regionBundle.GetStringFromName(countryCode.toLowerCase());
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

// __nodeLines(nodeData)__.
// Takes a nodeData array of node items, each like
// `{ ip : "12.34.56.78", country : "fr" }`
// and converts each node data to text, as
// `"France (12.34.56.78)"`.
let nodeLines = function (nodeData) {
  let result = [];
  for (let {ip, countryCode, type, bridgeType} of nodeData) {
    let bridge = type === "bridge",
        country = countryCode ? localizedCountryNameFromCode(countryCode) : null;
    result.push(
      bridge ?
               // As we have a bridge, don't show the IP address
               // but show the bridge type.
               (uiString("tor_bridge") +
                ((bridgeType !== "vanilla") ? (": " + bridgeType) : "") +
                 (country ? " (" + country + ")" : ""))
             :
               // For each non-bridge relay, show its host country and IP.
               country +
               // As we don't have a bridge, show the IP address
               // of the node. Use unicode escapes to ensure that
               // parentheses behave properly in both left-to-right
               // and right-to-left languages.
               " &#x202D; (" + (ip || uiString("ip_unknown")) + ")&#x202C;"
    );
  }
  return result;
};

// __xmlTree(ns, data)__.
// Takes an xml namespace, ns, and a
// data structure representing xml elements like
// [tag, { attr-key: attr-value }, ...xml-children]
// and returns nested xml element objects.
let xmlTree = function xmlTree (ns, data) {
  let [type, attrs, ...children] = data;
  let element = document.createElementNS(ns, type);
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
    let credentials = browserToCredentialsMap.get(browser);
    if (credentials) {
      let [SOCKS_username, SOCKS_password] = credentials;
      let nodeData = credentialsToNodeDataMap[`${SOCKS_username}|${SOCKS_password}`];
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
        relayText = uiString("tor_bridge") +
          ((nodeData[i].bridgeType !== "vanilla") ? `: ${nodeData[i].bridgeType}` : "");
      } else {
        relayText = localizedCountryNameFromCode(nodeData[i].countryCode);
      }
      li(relayText, " ",
         ["span", { class: "circuit-ip-address" }, nodeData[i].ip], " ",
         (i === 0 && nodeData[0].type !== "bridge") ?
           ["span", { class: "circuit-guard-info" }, uiString("guard")] : null);
    }
    if (domain.endsWith(".onion")) {
      for (let i = 0; i < 3; ++i) {
        li(uiString("relay"));
      }
    }
    li(domain);
    // Hide the note about guards if we are using a bridge.
    document.getElementById("circuit-guard-note-container").style.display =
      (nodeData[0].type === "bridge") ? "none" : "block";
  } else {
    // Only show the Tor circuit if we have credentials and node data.
    logger.eclog(5, "no SOCKS credentials found for current document.");
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
  let localeCode = torbutton_get_general_useragent_locale();
  appendHtml(guardNote,
             ["div", {},
              noteBefore, ["span", {class: "circuit-guard-name"}, name],
              noteAfter, " ",
              ["span", {onclick: `gBrowser.selectedTab = gBrowser.addTab('https://tb-manual.torproject.org/${localeCode}');`,
                        class: "circuit-link"},
               learnMoreString]]);
};

// __ensureCorrectPopupHeight()__.
// Make sure the identity popup always displays with the correct height.
let ensureCorrectPopupHeight = function () {
  let setHeight = () => {
    let view = document.querySelector("#identity-popup-multiView .panel-viewcontainer");
    let stack = document.querySelector("#identity-popup-multiView .panel-viewstack");
    view.setAttribute("height", stack.clientHeight);
  };
  let removeHeight = () => {
    let view = document.querySelector("#identity-popup-multiView .panel-viewcontainer");
    view.removeAttribute("height");
  };
  let popupMenu = document.getElementById("identity-popup");
  popupMenu.addEventListener("popupshowing", setHeight);
  popupMenu.addEventListener("popuphiding", removeHeight);
  return () => {
    popupMenu.removeEventListener("popupshowing", setHeight);
    popupMenu.removeEventListener("popuphiding", removeHeight);
  };
};

// ## Main function

// __setupDisplay(ipcFile, host, port, password, enablePrefName)__.
// Once called, the Tor circuit display will be started whenever
// the "enablePref" is set to true, and stopped when it is set to false.
// A reference to this function (called createTorCircuitDisplay) is exported as a global.
let setupDisplay = function (ipcFile, host, port, password, enablePrefName) {
  setupGuardNote();
  let myController = null,
      stopCollectingIsolationData = null,
      stopCollectingBrowserCredentials = null,
      stopEnsuringCorrectPopupHeight = null,
      stop = function() {
        syncDisplayWithSelectedTab(false);
        if (myController) {
          if (stopCollectingIsolationData) {
	    stopCollectingIsolationData();
          }
          if (stopCollectingBrowserCredentials) {
            stopCollectingBrowserCredentials();
          }
          if (stopEnsuringCorrectPopupHeight) {
            stopEnsuringCorrectPopupHeight();
          }
          myController = null;
        }
      },
      start = function () {
        if (!myController) {
          myController = controller(ipcFile, host, port || 9151, password,
                function (err) {
            // An error has occurred.
            logger.eclog(5, err);
            logger.eclog(5, "Disabling tor display circuit because of an error.");
            myController.close();
            stop();
          });
          syncDisplayWithSelectedTab(true);
          stopCollectingIsolationData = collectIsolationData(myController, updateCircuitDisplay);
          stopCollectingBrowserCredentials = collectBrowserCredentials();
          stopEnsuringCorrectPopupHeight = ensureCorrectPopupHeight();
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
