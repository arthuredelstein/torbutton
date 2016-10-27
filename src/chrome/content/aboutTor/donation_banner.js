let kPropertiesURL = "chrome://torbutton/locale/aboutTor.properties";
Components.utils.import("resource://gre/modules/Services.jsm");
let gStringBundle = Services.strings.createBundle(kPropertiesURL);

let elem = id => document.getElementById(id);

// Change the font size of text in element by delta.
let changeFontBy = function (element, delta) {
  let style = window.getComputedStyle(element),
      originalFontSize = parseFloat(style.fontSize),
      targetFontSize = originalFontSize + delta;
  element.style.fontSize = targetFontSize + "px";
};

// Shrink the font size if the text in the given element is overflowing.
let fitTextInElement = function(element) {
  element.style.fontSize = "36px";
  let style = window.getComputedStyle(element);
  if (style.whiteSpace === "nowrap") {
    // Look for horizontal overflow.
    let elementWidth = element.getBoundingClientRect().width,
        paddingWidth = parseFloat(style.paddingLeft) +
        parseFloat(style.paddingRight),
        targetWidth = elementWidth - paddingWidth,
        textWidth = element.scrollWidth;
    // Compute the appropriate font size to make the text fit.
    let ratio = targetWidth / textWidth;
    scaleFontBy(element, ratio);
  } else {
    // Look for vertical overflow.
    let elementHeight = element.clientHeight,// parentElement
        // .getBoundingClientRect().height,
        paddingHeight = parseFloat(style.paddingTop) +
        parseFloat(style.paddingBottom),
        targetHeight = elementHeight - paddingHeight;
    // Wrapping causes somewhat difficult-to-predict overflow.
    // So shrink slightly and repeat.
    for (let i = 0; i < 100; ++i) {
      let currentHeight = element.scrollHeight;
      console.log(`currentHeight: ${currentHeight}, targetHeight: ${targetHeight}, fontSize: ${style.fontSize}`);
      if (targetHeight < currentHeight) {
        changeFontBy(element, -0.5);
      } else {
        break;
      }
    }
  }
};

// Check if we should show the banner, depends on
// browser locale, current date, and how many times
// we have already shown the banner.
let shouldShowBanner = function () {
  try {
    // Don't show a banner if update is needed.
    let updateNeeded = Services.prefs.getBoolPref("extensions.torbutton.updateNeeded");
    if (updateNeeded) {
      return false;
    }
    // Only show banner for US English
    let browserLocale = Services.prefs.getCharPref("general.useragent.locale");
    if (browserLocale !== "en-US") {
      return false;
    }
    // Only show banner between 2016 Dec 1 and 2017 Jan 25.
    let now = new Date();
    let start = new Date(2016,9,1);
    let end = new Date(2017,0,26);
    if (now < start || now > end) {
      return false;
    }
    // Only show banner 10 times.
    let showCountPref = "extensions.torbutton.donation_banner2016.shown_count";
    if (Services.prefs.prefHasUserValue(showCountPref)) {
      count = Services.prefs.getIntPref(showCountPref);
    } else {
      count = 0;
    }
    if (count >= 10) {
         return false;
    }
    Services.prefs.setIntPref(showCountPref, count+1);
    return true;
  } catch (e) {
    return false;
  }
};

// Resize the text inside banner to fit.
let updateTextSizes = function () {
  fitTextInElement(elem("banner-text"));
  fitTextInElement(elem("banner-donate-button"));
};

let getTagline = index => gStringBundle.GetStringFromName(
  "aboutTor.donationBanner.tagline" + (index + 1));

// Returns a random integer x, such that 0 <= x < max
let randomInteger = max => Math.floor(max * Math.random());

// The main donation banner function.
let runDonationBanner = function () {
  let torStatusImage = document.getElementById("torstatus-image");
  let banner = document.getElementById("banner");
  try {
    if (!shouldShowBanner()) {
      return;
    }
    elem("banner-tagline").innerText = getTagline(randomInteger(4));
    elem("banner-heart").innerText = gStringBundle.GetStringFromName("aboutTor.donationBanner.heart");
    elem("banner-support").innerText = gStringBundle.GetStringFromName("aboutTor.donationBanner.pleaseSupport");
    torStatusImage.style.display = "none";
    banner.style.display = "flex";
    elem("banner-spacer").style.display = "block";
    addEventListener("resize", updateTextSizes);
    updateTextSizes();
  } catch (e) {
    // Something went wrong.
    console.log(e.message);
    banner.style.display = "none";
    torStatusImage.style.display = "block";
  }
};

// Calls callback(attributeValue) when the specified attribute changes on
// target. Returns a zero-arg function that stop observing.
let observeAttribute = function (target, attributeName, callback) {
  let observer = new MutationObserver(mutations => {
    mutations.forEach(mutation => {
      if (mutation.type === "attributes" &&
          mutation.attributeName === attributeName) {
        callback(target.getAttribute(attributeName));
      }
    });
  });
  observer.observe(document.body, { attributes: true });
  return () => observer.disconnect();
};

// Start the donation banner if "toron" has been set to "yes".
let stopObserving = observeAttribute(document.body, "toron", value => {
  stopObserving();
  if (value === "yes") {
    runDonationBanner();
  }
});
