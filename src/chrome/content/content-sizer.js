// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return rounded values.

// TODO: Handle situation where user zooms the page.

/* jshint esnext: true */

// Utility function
let { bindPrefAndInit } = Cu.import("resource://torbutton/modules/utils.js");

// __largestMultipleLessThan(factor, max)__.
// Returns the largest number that is a multiple of factor
// and is less or equal to max.
let largestMultipleLessThan = function (factor, max) {
  return Math.max(1, Math.floor(max / factor, 1)) * factor;
};

// __pinger(timeout, onTimeout)__.
// Listens for pings, and, if a ping is not followed by another ping by timeout,
// then runs onTimeout().
let pinger = function (timeout, onTimeout) {
  let lastPingTime = 0;
  return function () {
    lastPingTime = new Date().getTime();
    setTimeout(function () {
      let now = new Date().getTime();
      if (now - lastPingTime >= timeout) {
        onTimeout();
        lastPingTime = now;
      }
    }, timeout);
  };
};

// __shrinkwrap(window)__.
// Shrinks the window so that it encloses the gBrowser with no gaps.
let shrinkwrap = function (window) {
  let gBrowser = window.gBrowser,
      container = gBrowser.parentElement,
      deltaWidth = gBrowser.clientWidth - container.clientWidth,
      deltaHeight = gBrowser.clientHeight - container.clientHeight;
  if (deltaWidth !== 0 || deltaHeight !== 0) {
    window.resizeBy(deltaWidth, deltaHeight);
  }
};

// __updateDimensions(gBrowser, xStep, yStep)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of x/yStep.
let updateDimensions = function (gBrowser, xStep, yStep, ping) {
  //log("updateDimensions");
  let outerWidth = gBrowser.parentElement.clientWidth,
      outerHeight = gBrowser.parentElement.clientHeight;
  // Because gBrowser is inside a vbox, width and height behave differently. It turns
  // out we need to set `gBrowser.width` and `gBrowser.maxHeight`.
  gBrowser.width = largestMultipleLessThan(xStep, outerWidth);
  gBrowser.maxHeight = largestMultipleLessThan(yStep, outerHeight);
  if (ping) {
    ping();
  }
};

// __quantizeBrowserSizeNow(window, xStep, yStep)__.
// Ensures that gBrowser width and height are multiples of xStep and yStep, and always as
// large as possible inside the chrome window.
let quantizeBrowserSizeNow = function (window, xStep, yStep) {
  let gBrowser = window.gBrowser,
      container = window.gBrowser.parentElement,
      ping = pinger(1000, () => shrinkwrap(window)),
      updater = event => updateDimensions(gBrowser, xStep, yStep, ping),
      originalMinWidth = gBrowser.minWidth,
      originalMinHeight = gBrowser.minHeight,
      activate = function (on) {
        // Don't let the browser shrink below a single xStep x yStep size.
        gBrowser.minWidth = on ? xStep : originalMinWidth;
        gBrowser.minHeight = on ? yStep : originalMinHeight;
        // Align the browser at upper left, so any gray margin will be visible
        // at right and bottom.
        container.align = on ? "start" : "";
        container.pack = on ? "start" : "";
        container.style.backgroundColor = on ? "DimGray" : "";
        // If the user has stopped resizing the window after 1 second, then we can resize
        // the window so no gray margin is visible.
        if (on) {
          // Quantize browser size on activation.
          updateDimensions(gBrowser, xStep, yStep, null);
          shrinkwrap(window);
          // Quantize browser size at subsequent resize events.
          window.addEventListener("resize", updater, false);
        } else {
          // Ignore future resize events.
          window.removeEventListener("resize", updater, false);
          // Let gBrowser expand with its parent vbox.
          gBrowser.width = "";
          gBrowser.maxHeight = "";
        }
     };
  bindPrefAndInit("extensions.torbutton.resize_windows", activate);
};

// __quantizeBrowserSizeOnLoad(window, xStep, yStep)__.
// Once a window is fully loaded, ensures that gBrowser width and height are multiples of
// xStep and yStep.
let quantizeBrowserSizeOnLoad = function (window, xStep, yStep) {
  let onLoad = () => quantizeBrowserSizeNow(window, xStep, yStep);
  window.gBrowser.addEventListener("load", onLoad, true);
  return () => window.gBrowser.removeEventListener("load", onLoad, true);
};

