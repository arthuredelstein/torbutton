// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return rounded values.

// This file is formatted for docco.js. Later functions call earlier ones.

// TODO: Handle situation where user zooms the page.

/* jshint esnext: true */

// Use Task.jsm to avoid callback hell.
Cu.import("resource://gre/modules/Task.jsm");

// Utility function
let { bindPrefAndInit } = Cu.import("resource://torbutton/modules/utils.js");

// __largestMultipleLessThan(factor, max)__.
// Returns the largest number that is a multiple of factor
// and is less or equal to max.
let largestMultipleLessThan = function (factor, max) {
  return Math.max(1, Math.floor(max / factor, 1)) * factor;
};

// __listen(target, eventType, useCapture, timeoutMs)__.
// Listens for a single event of eventType on target.
// Returns a Promise that resolves to an Event object, if the event fires.
// If a timeout occurs, then Promise is rejected with a "Timed out" error.
let listen = function (target, eventType, useCapture, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let listenFunction = function (event) {
      target.removeEventListener(eventType, listenFunction, useCapture);
      resolve(event);
    };
    target.addEventListener(eventType, listenFunction, useCapture);
    if (timeoutMs !== undefined && timeoutMs !== null) {
      window.setTimeout(function () {
        target.removeEventListener(eventType, listenFunction, useCapture);
        resolve(new Event("timeout"));
      }, timeoutMs);
    }
  });
};

// __reshape(window, {left, top, width, height}, timeoutMs)__.
// Reshapes the window to rectangle {left, top, width, height} and yields
// until the window reaches its target size, or the timeout occurs.
let reshape = function* (window, {left, top, width, height}, timeoutMs) {
  let finishTime = Date.now() + timeoutMs,
      x = left || window.screenX,
      y = top || window.screenY,
      w = width || window.outerWidth,
      h = height || window.outerHeight;
  if (x !== window.screenX || y !== window.screenY) {
    // Does not block:
    window.moveTo(x, y);
  }
  if (w !== window.outerWidth || h !== window.outerWidth) {
    // Does not block:
    window.resizeTo(w, h);
  }
  // Yield until we have the correct screen position and size, or
  // we timeout. Multiple resize events often fire in a resize.
  while (x !== window.screenX ||
         y !== window.screenY ||
         w !== window.outerWidth ||
         h !== window.outerHeight) {
    let timeLeft = finishTime - Date.now();
    if (timeLeft <= 0) break;
    yield listen(window, "resize", true, timeLeft);
  }
};

// __rebuild(window)__.
// Jog the size of the window slightly, to remind the window manager
// to redraw the window.
let rebuild = function* (window) {
  let h = window.outerHeight;
  yield reshape(window, {height : (h + 1)}, 100);
  yield reshape(window, {height : h}, 100);
};

// __gaps(window)__.
// Deltas between gBrowser and its container. Returns null if there is no gap.
let gaps = function (window) {
  let gBrowser = window.gBrowser,
      container = gBrowser.parentElement,
      deltaWidth = container.clientWidth - gBrowser.clientWidth,
      deltaHeight = container.clientHeight - gBrowser.clientHeight;
  return (deltaWidth === 0 && deltaHeight === 0) ? null
           : { deltaWidth : deltaWidth, deltaHeight : deltaHeight };
};

// __shrinkwrap(window)__.
// Shrinks the window so that it encloses the gBrowser with no gaps.
let shrinkwrap = function* (window) {
  // Figure out what size change we need.
  let currentGaps = gaps(window);
  // We don't need to change the window size if there are no gaps.
  if (currentGaps) {
    // If window has been maximized, demaximize by shrinking it to
    // fit within the available screen area.
    if (Services.appinfo.OS !== "Darwin" &&
        window.windowState === 1 /* maximized */) {
      yield reshape(window, {left : window.screen.availLeft,
                             top : window.screen.availTop,
                             width : window.screen.availWidth,
                             height : window.screen.availHeight}, 200);
      // Re-measure the gaps.
      currentGaps = gaps(window);
    }
    // Now resize to close the gaps.
    yield reshape(window,
                  {width : (window.outerWidth - currentGaps.deltaWidth),
                   height : (window.outerHeight - currentGaps.deltaHeight)},
                  500);
  }
};

// __updateContainerAppearance(container, on)__.
// Get the color and position of margins right.
let updateContainerAppearance = function (container, on) {
  // Align the browser at top left, so any gray margin will be visible
  // at right and bottom. Except in fullscreen, where we have black 
  // margins and gBrowser in top center.
  container.align = on ? (window.fullScreen ? "center" : "start")
                       : "";
  container.pack = on ? "start" : "";
  container.style.backgroundColor = on ? (window.fullScreen ? "Black"
                                                            : "DimGray")
                                       : "";
};

// __fixWindow(window)__.
// An async function for Task.jsm. Makes sure the window looks okay
// given the quantized browser element.
let fixWindow = function* (window) {
  updateContainerAppearance(window.gBrowser.parentElement, true);
  if (!window.fullScreen) {
    yield shrinkwrap(window);
    if (Services.appinfo.OS !== "Darwin" && Services.appinfo.OS !== "WINNT") {
      // Linux tends to require us to rebuild the window, or we might be
      // left with a large useless white area on the screen.
      yield rebuild(window);
    }
  }
};

// __autoresize(window, stepMs)__.
// Do what it takes to eliminate the gray margin around the gBrowser inside
// window. Periodically (stepMs) attempt to shrink the window. Runs
// as a Task.jsm coroutine.
let autoresize = function (window, stepMs) {
  let stop = false;
  Task.spawn(function* () {
    while (!stop) {
      // Do nothing until the user starts to resize window.
      let event = yield listen(window, "resize", true);
      // Here we wrestle with the window size. If the user has released the
      // mouse cursor on the window's drag/resize handle, then fixWindow
      // will resize the window on its first call. Unfortunately, on some
      // OSs, the window resize fails if the user is still holding on
      // to the drag-resize handle. Even more unfortunately, the
      // only way to know that the user no longer has the mouse down
      // on the window's drag/resize handle is if we detect the mouse
      // cursor inside the window. So until the window fires a mousemove
      // event, we repeatedly call fixWindow every stepMs.
      while (event.type !== "mousemove") {
        event = yield Promise.race(
                 [listen(window, "resize", true, stepMs),
                  listen(window, "mousemove", true, stepMs)]);
        if (event.type === "timeout" || event.type === "mousemove") {
          yield fixWindow(window);
        }
      }
    }
  });
  return () => { stop = true; };
};

// __updateDimensions(gBrowser, xStep, yStep)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of x/yStep.
let updateDimensions = function (gBrowser, xStep, yStep) {
  let outerWidth = gBrowser.parentElement.clientWidth,
      outerHeight = gBrowser.parentElement.clientHeight;
  // Because gBrowser is inside a vbox, width and height behave differently. It turns
  // out we need to set `gBrowser.width` and `gBrowser.maxHeight`.
  gBrowser.width = largestMultipleLessThan(xStep, outerWidth);
  gBrowser.maxHeight = largestMultipleLessThan(yStep, outerHeight);
};

// __quantizeBrowserSizeNow(window, xStep, yStep)__.
// Ensures that gBrowser width and height are multiples of xStep and yStep, and always as
// large as possible inside the chrome window.
let quantizeBrowserSizeNow = function (window, xStep, yStep) {
  let gBrowser = window.gBrowser,
      container = window.gBrowser.parentElement,
      updater = event => updateDimensions(gBrowser, xStep, yStep),
      originalMinWidth = gBrowser.minWidth,
      originalMinHeight = gBrowser.minHeight,
      stopAutoresizing,
      activate = function (on) {
        // Don't let the browser shrink below a single xStep x yStep size.
        gBrowser.minWidth = on ? xStep : originalMinWidth;
        gBrowser.minHeight = on ? yStep : originalMinHeight;
        updateContainerAppearance(container, on);
        // If the user has stopped resizing the window after 1 second, then we can resize
        // the window so no gray margin is visible.
        if (on) {
          // Quantize browser size on activation.
          updateDimensions(gBrowser, xStep, yStep);
          shrinkwrap(window);
          // Quantize browser size at subsequent resize events.
          window.addEventListener("resize", updater, false);
          stopAutoresizing = autoresize(window, 250);
        } else {
          if (stopAutoresizing) stopAutoresizing();
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
