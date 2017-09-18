/* jshint esnext:true */

let sel = selector => document.querySelector(selector);

// Shrink the font size if the text in the given element is overflowing.
let fitTextInElement = function (element) {
  element.style.fontSize = "8px";
  let defaultWidth = element.scrollWidth,
      defaultHeight = element.scrollHeight;
  let bestSize;
  for (let testSize = 8; testSize <= 40; testSize += 0.5) {
    element.style.fontSize = `${testSize}px`;
    if (element.scrollWidth <= defaultWidth &&
        element.scrollHeight <= defaultHeight) {
      bestSize = testSize;
    } else {
      break;
    }
  }
  element.style.fontSize = `${bestSize}px`;
};

// Increase padding at end to "squeeze" text, until just before
// it gets squeezed so much that it gets longer vertically.
let avoidWidows = function (element) {
  element.style.paddingRight = "0px";
  let originalWidth = element.scrollWidth;
  let originalHeight = element.scrollHeight;
  let bestPadding;
  for (let testPadding = 0; testPadding < originalWidth; testPadding += 0.5) {
    element.style.paddingRight = `${testPadding}px`;
    if (element.scrollHeight <= originalHeight) {
      bestPadding = testPadding;
    } else {
      break;
    }
  }
  element.style.paddingRight = `${bestPadding}px`;
  if (window.getComputedStyle(element).direction === "rtl") {
    element.style.paddingLeft = element.style.paddingRight;
    element.style.paddingRight = "0px";
  }
};

// Resize the text inside banner to fit.
let updateTextSizes = function () {
  fitTextInElement(sel("#banner-tagline"));
  fitTextInElement(sel("#banner-slogan"));
  fitTextInElement(sel("#banner-donate-button-inner"));
  avoidWidows(sel("#banner-tagline span"));
};


// Returns a random integer x, such that 0 <= x < max
let randomInteger = max => Math.floor(max * Math.random());


// The main donation banner function.
let runDonationBanner = function ({ taglines, slogan, donate, shortLocale }) {
  try {
    sel("#banner-tagline span").innerText = taglines[randomInteger(taglines.length)];
    sel("#banner-slogan span").innerText = slogan;
    let donateButtonText = sel("#banner-donate-button-inner span");
    let rtl = window.getComputedStyle(donateButtonText).direction === "rtl";
    donateButtonText.innerHTML = donate + "&#160;" + (rtl ? "&#9664;" : "&#9654;");
    sel("#banner").style.display = "flex";
    sel("#banner-spacer").style.display = "block";
    addEventListener("resize", updateTextSizes);
    updateTextSizes();
    // Add a suffix corresponding to locale so we can send user
    // to a correctly-localized donation page via redirect.
    sel("#banner-donate-button-link").href += "-" + shortLocale;
    sel("#torstatus-image").style.display = "none";
  } catch (e) {
    // Something went wrong.
    console.error(e);
    sel("#banner").style.display = "none";
    sel("#bannerSpacer").style.display = "none";
    sel("#torstatus-image").style.display = "block";
  }
};

// Calls callback(attributeValue) when the specified attribute changes on
// target. Returns a zero-arg function that stops observing.
let observeAttribute = function (target, attributeName, callback) {
  let observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === "attributes" &&
          mutation.attributeName === attributeName) {
        callback(target.getAttribute(attributeName));
      }
    });
  });
  observer.observe(target, { attributes: true });
  return () => observer.disconnect();
};

// Start the donation banner if "toron" has been set to "yes".
let stopObserving = observeAttribute(document.body, "toron", value => {
  stopObserving();
  if (value === "yes") {
    let bannerDataJSON = document.body.getAttribute("banner-data");
    if (bannerDataJSON.length > 0) {
      runDonationBanner(JSON.parse(bannerDataJSON));
    }
  }
});
