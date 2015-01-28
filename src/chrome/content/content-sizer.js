// The purpose of this file is to ensure that window.innerWidth and window.innerHeight
// always return a multiple of 200.

// TODO: Deal with zooming of pages
// Maybe re-shrink window when resizing finishes?

// __largestMultipleLessThan(factor, max)__.
// Returns the largest number that is a multiple of factor
// and is less or equal to max.
let largestMultipleLessThan = function (factor, max) {
  return Math.max(1, Math.floor(max / factor, 1)) * factor;
};

// __updateDimensions(gBrowser, step)__.
// Changes the width and height of the gBrowser XUL element to be a multiple of step.
let updateDimensions = function (gBrowser, step) {
  // Because gBrowser is inside a vbox, width and height behave differently. It turns
  // out we need to set `gBrowser.width` and `gBrowser.maxHeight`.
  gBrowser.width = largestMultipleLessThan(step, gBrowser.parentElement.clientWidth);
  gBrowser.maxHeight = largestMultipleLessThan(step, gBrowser.parentElement.clientHeight);
};

// __quantizeBrowserSize(window, step)__.
// Ensures that gBrowser width and height are multiples of step, and always as
// large as possible inside the chrome window.
let quantizeBrowserSize = function (window, step) {
  let gBrowser = window.gBrowser,
      container = window.gBrowser.parentElement;
  gBrowser.minHeight = step;
  gBrowser.minWidth = step;
  container.align = "start"; // or? "center";
  container.pack = "start"; // or? "center";
  container.style.backgroundColor = "DimGray";
  updateDimensions(gBrowser, step);
  window.addEventListener("resize", function (event) {
    updateDimensions(gBrowser, step);
  }, false);
};
