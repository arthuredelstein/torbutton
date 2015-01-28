// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return a multiple of 200.

// TODO: Deal with zooming of pages

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
  lastPingTime = 0;
  return function () {
    lastPingTime = new Date().getTime();
    setTimeout(function () {
      let now = new Date().getTime();
      if (now - lastPingTime >= timeout) {
        onTimeout();
      }
    }, timeout);
  };
};

// __updateDimensions(gBrowser, step)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of step.
let updateDimensions = function (gBrowser, step, ping) {
  // Because gBrowser is inside a vbox, width and height behave differently. It turns
  // out we need to set `gBrowser.width` and `gBrowser.maxHeight`.
  gBrowser.width = largestMultipleLessThan(step, gBrowser.parentElement.clientWidth);
  gBrowser.maxHeight = largestMultipleLessThan(step, gBrowser.parentElement.clientHeight);
  ping();
};

// __quantizeBrowserSize(window, step)__.
// Ensures that gBrowser width and height are multiples of step, and always as
// large as possible inside the chrome window.
let quantizeBrowserSize = function (window, step) {
  let gBrowser = window.gBrowser,
      container = window.gBrowser.parentElement;
  // Don't let the browser shrink below a single step x step size.
  gBrowser.minHeight = step;
  gBrowser.minWidth = step;
  // Align the browser at upper left, so any gray margin will be visible
  // at right and bottom.
  container.align = "start"; // or? "center";
  container.pack = "start"; // or? "center";
  container.style.backgroundColor = "DimGray";
  // If the user has stopped resizing the window after 1 second, then we can resize
  // the window so no gray margin is visible.
  let ping = pinger(1000, function () {
    window.resizeBy(gBrowser.clientWidth - container.clientWidth, gBrowser.clientHeight - container.clientHeight);
  });
  // Quantize browser size at startup.
  updateDimensions(gBrowser, step, ping);
  // Quantize browser size at subsequent resize events.
  window.addEventListener("resize", function (event) {
    updateDimensions(gBrowser, step, ping);
  }, false);
};
