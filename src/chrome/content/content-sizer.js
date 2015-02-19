// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return rounded values.

// TODO: Handle situation where user zooms the page.

/* jshint esnext: true */

Cu.import("resource://gre/modules/Task.jsm");

// Utility function
let { bindPrefAndInit } = Cu.import("resource://torbutton/modules/utils.js");

// __largestMultipleLessThan(factor, max)__.
// Returns the largest number that is a multiple of factor
// and is less or equal to max.
let largestMultipleLessThan = function (factor, max) {
  return Math.max(1, Math.floor(max / factor, 1)) * factor;
};

let rebuild = function(window) {
  //console.log("rebuild");
  let w = window.outerWidth,
      h = window.outerHeight;
  window.resizeTo(w + 1, h + 1);
  window.resizeTo(w, h);
};

// __shrinkwrap(window)__.
// Shrinks the window so that it encloses the gBrowser with no gaps.
let shrinkwrap2 = function (window) {
  let gBrowser = window.gBrowser,
      container = gBrowser.parentElement,
      deltaWidth = gBrowser.clientWidth - container.clientWidth,
      deltaHeight = gBrowser.clientHeight - container.clientHeight;
//  console.log("shrinkwrap: " + deltaWidth + "," + deltaHeight);
  if (deltaWidth !== 0 || deltaHeight !== 0) {
    window.resizeBy(deltaWidth, deltaHeight);
    return true;
  } else {
    return false;
  }
};

let shrinkwrap = (window) => shrinkwrap2(window);

// __sleep(time_ms)__.
// Returns a Promise that sleeps for the specified time interval,
// and returns an Event object of type "wake".
let sleep = function (time_ms) {
  return new Promise(function (resolve, reject) {
                       window.setTimeout(() => resolve(new Event("wake")),
                                         time_ms);
                     });
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
        reject(new Error("Timed out"));
      }, timeoutMs);
    }
  });
};

let flush = function* (target, eventType, useCapture) {
  while (true) {
    try {
      yield listen(target, eventType, useCapture, 100);
    } catch (e) {
      break;
    }
  }
};

let fixWindow = function* (window) {
        shrinkwrap(window);
        yield flush(window, "resize", true);
        rebuild(window);
        yield flush(window, "resize", true);
};

let autoresize = function (window) {
  let stop = false;
  Task.spawn(function* () {
    while (!stop) {
      // Do nothing until the user starts to resize window.
      yield listen(window, "resize", true);
      // Wait for resizing to pause or (hopefully) end
      while (true) {
        try {
          yield listen(window, "resize", true, 500);
        } catch (e) {
          break;
        }
      }
      // Here we wrestle with the window size. If the user has released the 
      // mouse cursor on the window's drag/resize handle, then fixWindow
      // will resize the window on its first call. Unfortunately, on some
      // OSs, the window resize fails if the user is still holding on
      // to the drag-resize handle. Even more unfortunately, the
      // only way to know that the user no longer has the mouse down
      // on the window's drag/resize handle is if we detect the mouse
      // cursor inside the window. So until the window fires a mousemove
      // event, we repeatedly calling fixWindow every stepMs.
      while (true) {
        yield fixWindow(window);
        try {
          yield listen(window, "mousemove", true, stepMs);
          // We have received a mousemove event; stop loop.
          break;
        } catch (e) {
          // No mousemove detected before timeout; continue loop.
        }
      }
      // It's possible that we still need to fix window after
      // the mousemove event. So run once more.
      yield fixWindow(window);
    }
  });
  return () => { stop = true; };
};

// __updateDimensions(gBrowser, xStep, yStep)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of x/yStep.
let updateDimensions = function (gBrowser, xStep, yStep) {
  //log("updateDimensions");
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
        // Align the browser at upper left, so any gray margin will be visible
        // at right and bottom.
        container.align = on ? "start" : "";
        container.pack = on ? "start" : "";
        container.style.backgroundColor = on ? "DimGray" : "";
        // If the user has stopped resizing the window after 1 second, then we can resize
        // the window so no gray margin is visible.
        if (on) {
          // Quantize browser size on activation.
          updateDimensions(gBrowser, xStep, yStep);
          shrinkwrap(window);
          // Quantize browser size at subsequent resize events.
          window.addEventListener("resize", updater, false);
          stopAutoresizing = autoresize(window);
        } else {
          // Ignore future resize events.
          window.removeEventListener("resize", updater, false);
          // Let gBrowser expand with its parent vbox.
          gBrowser.width = "";
          gBrowser.maxHeight = "";
          if (stopAutoresizing) stopAutoresizing();
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
