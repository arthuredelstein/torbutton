// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return rounded values.

// This file is formatted for docco.js. Later functions call earlier ones.

/*
TODO:
* Fix bug causing horizontal repeated shrink.
* Consider separate prefs for (1) margins/autozoom and (2) autoresizing.
* Maybe don't use shrinking?
* Only allow shrinking when the window dimensions have actually changed in a resize event (compare to dimensions after previous resize event) -- fixes ALT menu problem.
x Tooltip on margins.
* Confirm that youtube fullscreen is maximally large.
* Implement manual zooming.
* Ensure no shrinking when window is maximized, fullscreen, or in a tiled window manager
* Understand gBrowser.contentWindow.document.body.getBoundingClientRect(). Does this leak some useful information?
* Decide on quantization amount. 100x100? 200x100? Maybe gradually increase, like 50, 100, 150, 200, 300, 500, 600, 800, etc.?
* Match margin color to window background color?
* Deal with rebuilding on linux. Maybe just do it once after shrink, and then once later on mouseover/keypress?
* Cleanup comments and code.
*/

/* jshint esnext: true */

// __quantizeBrowserSize(window, xStep, yStep)__.
// Ensures that gBrowser width and height are multiples of
// xStep and yStep.
let quantizeBrowserSize = function (window, xStep, yStep) {

// Use Task.jsm to avoid callback hell.
Cu.import("resource://gre/modules/Task.jsm");

// Make the TorButton logger available.
let logger = Cc["@torproject.org/torbutton-logger;1"]
               .getService(Components.interfaces.nsISupports).wrappedJSObject;

// Utility function
let { bindPrefAndInit, getEnv } = Cu.import("resource://torbutton/modules/utils.js");

// __isTilingWindowManager__.
// Constant, set to true if we are using a (known) tiling window
// manager in linux.
let isTilingWindowManager = (function () {
  let gdmSession = getEnv("GDMSESSION");
  if (!gdmSession) return false;
  let gdmSessionLower = gdmSession.toLowerCase();
  return ["9wm","alopex","awesome","bspwm","catwm","dswm","dwm",
          "echinus","euclid-wm","frankenwm","herbstluftwm","i3",
          "i3wm","ion","larswm","monsterwm","musca","notion",
          "qtile","ratpoison","snapwm","spectrwm","stumpwm",
          "subtle","tinywm","ttwm","wingo","wmfs","wmii","xmonad"]
            .filter(x => x.startsWith(gdmSessionLower)).length > 0;
})();

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

// __sleep(time_ms)__.
// Returns a Promise that sleeps for the specified time interval,
// and returns an Event object of type "wake".
let sleep = function (timeoutMs) {
  return new Promise(function (resolve, reject) {
    window.setTimeout(function () {
      resolve(new Event("wake"));
    }, timeoutMs);
  });
};

// __isNumber(value)__.
// Returns true iff the value is a number.
let isNumber = x => typeof x === "number";

// __reshape(window, {left, top, width, height}, timeoutMs)__.
// Reshapes the window to rectangle {left, top, width, height} and yields
// until the window reaches its target size, or the timeout occurs.
let reshape = function* (window, {left, top, width, height}, timeoutMs) {
  let finishTime = Date.now() + timeoutMs,
      x = isNumber(left) ? left : window.screenX,
      y = isNumber(top) ? top : window.screenY,
      w = isNumber(width) ? width : window.outerWidth,
      h = isNumber(height) ? height : window.outerHeight;
  // Make sure we are in a new event.
  yield sleep(0);
  if (w !== window.outerWidth || h !== window.outerWidth) {
    window.resizeTo(w, h);
  }
  if (x !== window.screenX || y !== window.screenY) {
    window.moveTo(x, y);
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
  yield reshape(window, {height : (h + 1)}, 300);
  yield reshape(window, {height : h}, 300);
};

// __gaps(window)__.
// Deltas between gBrowser and its container. Returns null if there is no gap.
let gaps = function (window) {
  let gBrowser = window.gBrowser,
      container = gBrowser.parentElement,
      deltaWidth = Math.max(0, container.clientWidth - gBrowser.clientWidth - 5),
      deltaHeight = Math.max(0, container.clientHeight - gBrowser.clientHeight - 5);
  //logger.eclog(3, "gaps " + deltaWidth + "," + deltaHeight);
  return (deltaWidth === 0 && deltaHeight === 0) ? null
           : { deltaWidth : deltaWidth, deltaHeight : deltaHeight };
};

// __shrinkwrap(window)__.
// Shrinks the window so that it encloses the gBrowser with no gaps.
let shrinkwrap = function* (window) {
  // Maximized windows in Linux and Windows need to be demaximized first.
/*  if (gaps(window) &&
      window.windowState === 1 && // maximized 
      Services.appinfo.OS !== "Darwin") {
    if (Services.appinfo.OS !== "WINNT") {
      // Linux windows need an extra jolt out of maximized mode.
      window.moveBy(1,1);
    }
    // If window has been maximized, demaximize by shrinking it to
    // fit within the available screen area.
    yield reshape(window,
                  {left : window.screen.availLeft + 1,
                   top : window.screen.availTop + 1,
                   width : window.screen.availWidth - 2,
                   height : window.screen.availHeight - 2},
                  500);
  }*/
  // Figure out what size change we need.
  let currentGaps = gaps(window);
  if (currentGaps) {
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
  // margins and gBrowser in top center, and when using a tiling
  // window manager, when we have gray margins and gBrowser in top
  // center.
  container.align = on ? "center" //((window.fullScreen || isTilingWindowManager) ?
			  //"center" : "start")
                       : "";
  container.pack = on ? "start" : "";
  container.tooltipText = on ? "Tor Browser adds this margin to make the width and height of your window less distinctive." : "";
  container.style.backgroundColor = on ? (window.fullScreen ? "Black"
                                                            : "LightGray")
                                       : "";
};

// __fixWindow(window)__.
// An async function for Task.jsm. Makes sure the window looks okay
// given the quantized browser element.
let fixWindow = function* (window) {
  updateContainerAppearance(window.gBrowser.parentElement, true);
  if (window.windowState !== window.STATE_FULLSCREEN && window.windowState !== window.STATE_MAXIMIZED) {
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
        // If the user has stopped resizing the window after `stepMs`, then we can resize
        // the window so no gray margin is visible.
        if (event.type === "timeout" || event.type === "mousemove") {
          yield fixWindow(window);
        }
      }
    }
  });
  return () => { stop = true; };
};

// __trueZoom(gBrowser)__.
// Returns the true magnification of the content in the gBrowser
// object. (In contrast, `gBrowser.fullZoom`value is only approximated
// by the display zoom.)
let trueZoom = function (gBrowser) {
  return gBrowser.contentWindow
                 .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                 .getInterface(Components.interfaces.nsIDOMWindowUtils)
                 .screenPixelsPerCSSPixel;
};

// __sortBy(array, scoreFn)__.
// Returns a copy of the array, sorted from least to best
// according to scoreFn.
let sortBy = function (array, scoreFn) {
  compareFn = (a, b) => scoreFn(a) - scoreFn(b);
  return array.slice().sort(compareFn);
};

// __targetSize(parentWidth, parentHeight, xStep, yStep, fillHeight)__.
// Given a parent width and height for gBrowser's container, returns the
// desired [width, height, zoom] the content window.
let targetSize = function (parentWidth, parentHeight, xStep, yStep, fillHeight) {
  if (fillHeight) {
    let h = largestMultipleLessThan(yStep, parentHeight),
        zoom = parentHeight / h,
        w = largestMultipleLessThan(xStep, (parentWidth / zoom) + 2);
    logger.eclog(3, "" + parentWidth + " " + parentHeight + " " + h + " " + zoom + " " + w);
    return [w, h, zoom];
  } else {
    let w = largestMultipleLessThan(xStep, parentWidth),
        h = largestMultipleLessThan(yStep, parentHeight),
        parentAspectRatio = parentWidth / parentHeight,
        possibilities = [[w, h],
              //           [Math.min(w, w - xStep), h],
              //           [w, Math.min(h - yStep)]
                           ],
        score = ([w, h]) => Math.abs(Math.log(w / h / parentAspectRatio)),
        // Choose the target content width and height for the closest possible
        // aspect ratio to the parent.
        [W, H] = sortBy(possibilities, score)[0],
        zoom = Math.min(parentHeight / H, parentWidth / W);
    return [W, H, zoom];
  }
};

// __updateDimensions(gBrowser, xStep, yStep)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of x/yStep.
let updateDimensions = function (gBrowser, xStep, yStep) {
  // TODO: Get zooming to work such that it doesn't cause the window
  // to continuously shrink.
  // We'll use something like:
  // let winUtils = gBrowser.contentWindow
  //                 .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
  //                 .getInterface(Components.interfaces.nsIDOMWindowUtils),
  //    zoom = winUtils.screenPixelsPerCSSPixel,
  let container = gBrowser.parentElement,
      parentWidth = container.clientWidth,
      parentHeight = container.clientHeight,
      longPage = !gBrowser.contentWindow.fullScreen, // || gBrowser.contentWindow.scrollMaxY > 0,
      [targetContentWidth, targetContentHeight, targetZoom] =
        targetSize(parentWidth, parentHeight, xStep, yStep, longPage);
  // We set `gBrowser.fullZoom` to 99% of the needed zoom. That's because
  // the "true zoom" is sometimes larger than fullZoom, and we need to
  // ensure the gBrowser width and height do not exceed the container size.
  gBrowser.fullZoom = 0.99 * targetZoom;
  let zoom = trueZoom(gBrowser),
      targetBrowserWidth = Math.round(targetContentWidth * zoom),
      targetBrowserHeight = Math.round(targetContentHeight * zoom);
  // Because gBrowser is inside a vbox, width and height behave differently. It turns
  // out we need to set `gBrowser.width` and `gBrowser.maxHeight`.
  gBrowser.width = targetBrowserWidth;
  gBrowser.maxHeight = targetBrowserHeight;
  // If the content window's innerWidth/innerHeight failed to updated correctly,
  // then jog the gBrowser width/height. (With zoom there may also be a rounding
  // error, but we can't do much about that.)
/*
  if (gBrowser.contentWindow.innerWidth !== targetContentWidth ||
      gBrowser.contentWindow.innerHeight !== targetContentHeight) {
    gBrowser.width = targetBrowserWidth;
    gBrowser.maxHeight = gBrowser.targetBrowserHeight;
    gBrowser.width = targetBrowserWidth;
    gBrowser.maxHeight = targetBrowserHeight;
  }
*/
  logger.eclog(3,
               " chromeWin " + window.outerWidth + "x" +  window.outerHeight +
               " container " + parentWidth + "x" + parentHeight +
               " targetContent " + targetContentWidth + "x" + targetContentHeight +
               " gBrowser.fullZoom " + gBrowser.fullZoom + "X" +
               " zoom " + zoom + "X" +
               " targetBrowser " + targetBrowserWidth + "x" + targetBrowserHeight +
	       " gBrowser " + gBrowser.clientWidth + "x" + gBrowser.clientHeight +
               " content " + gBrowser.contentWindow.innerWidth + "x" +  gBrowser.contentWindow.innerHeight);
};

// __updateBackground(window)__.
// Sets the margin background to black or dim gray, depending on
// whether the window is full screen.
let updateBackground = function (window) {
  window.gBrowser.parentElement.style
        .backgroundColor = window.fullScreen ? "Black" : "LightGray";
};

// __listenForLocationChange(gBrowser, onLocationChange)__.
// Whenver the location changes in gBrowser, calls 
// `onLocationChange(tabOrWindow, request, URI)`.
// Returns a zero-argument function to stop listening.
let listenForLocationChange = function (gBrowser, onLocationChange) {
  let listener = {
    QueryInterface: XPCOMUtils.generateQI(["nsIWebProgressListener",
                                           "nsISupportsWeakReference"]),
    onLocationChange: function(aProgress, aRequest, aURI) {
      console.log("onLocationChange", aProgress, aRequest, aURI);
      onLocationChange(aProgress.DOMWindow, aRequest, aURI);
    },
    // Ignore these irrelevant callbacks.
    onStateChange: function(aWebProgress, aRequest, aFlag, aStatus) { },
    onProgressChange: function(aWebProgress, aRequest, curSelf, maxSelf, curTot, maxTot) {},
    onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {},
    onSecurityChange: function(aWebProgress, aRequest, aState) {}
  };
  gBrowser.addProgressListener(listener);
  return function () { gBrowser.removeProgressListener(listener); };
};

// __quantizeBrowserSizeNow(window, xStep, yStep)__.
// Ensures that gBrowser width and height are multiples of xStep and yStep, and always as
// large as possible inside the chrome window.
let quantizeBrowserSizeMain = function (window, xStep, yStep) {
  let gBrowser = window.gBrowser,
      container = window.gBrowser.parentElement,
      updater = event => updateDimensions(gBrowser, xStep, yStep),
      fullscreenHandler = event => updateBackground(window),
      originalMinWidth = container.minWidth,
      originalMinHeight = container.minHeight,
      stopAutoresizing,
      stopUpdatingOnLocationChange,
      activate = function (on) {
        // Don't let the browser shrink below a single xStep x yStep size.
        container.minWidth = on ? xStep : originalMinWidth;
        container.minHeight = on ? yStep : originalMinHeight;
        updateContainerAppearance(container, on);
        if (on) {
          // Quantize browser size on activation.
          updateDimensions(gBrowser, xStep, yStep);
          shrinkwrap(window);
          // Quantize browser size at subsequent resize events.
          window.addEventListener("resize", updater, false);
          stopUpdatingOnLocationChange = listenForLocationChange(gBrowser, updater);
          gBrowser.addEventListener("load", updater, true);
          window.addEventListener("sizemodechange", fullscreenHandler, false);
	  if (!isTilingWindowManager) {
            stopAutoresizing = autoresize(window, 250);
          }
        } else {
          if (stopAutoresizing) stopAutoresizing();
          // Ignore future resize events.
          window.removeEventListener("resize", updater, false);
	  stopUpdatingOnLocationChange();
          gBrowser.removeEventListener("load", updater, true);
          window.removeEventListener("sizemodechange", fullscreenHandler, false);
          // Let gBrowser expand with its parent vbox.
          gBrowser.width = "";
          gBrowser.maxHeight = "";
        }
     };
  bindPrefAndInit("extensions.torbutton.resize_windows", activate);
};

quantizeBrowserSizeMain(window, xStep, yStep);

// quantizeBrowserSize
};
