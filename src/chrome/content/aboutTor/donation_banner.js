/* jshint esnext:true */

// A list of locales for which the banner has been translated.
let kBannerLocales = [
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "it",
  "nl",
  "pt",
  "ru",
  "tr",
  "vi",
  "zh",
];

// A list of donation page locales (at least redirects should exist).
let kDonationPageLocales = [
  "ar",
  "de",
  "en",
  "es",
  "fa",
  "fr",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "tr",
  "vi",
  "zh",
];

let kPropertiesURL = "chrome://torbutton/locale/aboutTor.properties";
Components.utils.import("resource://gre/modules/Services.jsm");
let gStringBundle = Services.strings.createBundle(kPropertiesURL);
let kBrowserLocale = Services.prefs.getCharPref("general.useragent.locale");
let kBrowserLocaleShort = kBrowserLocale.match(/[a-zA-Z]+/)[0].toLowerCase();

let sel = selector => document.querySelector(selector);

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
    // Only show banner when we have that locale and if a donation redirect exists.
    if (kBannerLocales.indexOf(kBrowserLocaleShort) === -1 ||
        kDonationPageLocales.indexOf(kBrowserLocaleShort) === -1) {
      return false;
    }
    // Only show banner between 2016 Nov 23 and 2017 Jan 25.
    let now = new Date();
    let start = new Date(2016, 10, 23);
    let end = new Date(2017, 0, 26);
    let shownCountPref = "extensions.torbutton.donation_banner2016.shown_count";
    if (now < start || now > end) {
      // Clean up pref if not in use.
      Services.prefs.clearUserPref(shownCountPref);
      return false;
    }
    // Only show banner 10 times.
    let count = 0;
    if (Services.prefs.prefHasUserValue(shownCountPref)) {
      count = Services.prefs.getIntPref(shownCountPref);
    }
    if (count >= 10) {
      return false;
    }
    Services.prefs.setIntPref(shownCountPref, count+1);
    return true;
  } catch (e) {
    return false;
  }
};

// Shrink the font size if the text in the given element is overflowing.
let fitTextInElement = function (element) {
  element.style.fontSize = "8px";
  let defaultWidth = element.scrollWidth,
      defaultHeight = element.scrollHeight;
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

// Increase padding at left and right to "squeeze" text, until it gets
// squeezed so much that it gets longer vertically.
let avoidWidows = function (element) {
  element.style.paddingLeft = "0px";
  element.style.paddingRight = "0px";
  let originalWidth = element.scrollWidth;
  let originalHeight = element.scrollHeight;
  for (let testPadding = 0; testPadding < originalWidth / 2; testPadding += 0.5) {
    element.style.paddingLeft = element.style.paddingRight = `${testPadding}px`;
    if (element.scrollHeight <= originalHeight) {
      bestPadding = testPadding;
    } else {
      break;
    }
  }
  element.style.paddingLeft = element.style.paddingRight = `${bestPadding}px`;
};

// Resize the text inside banner to fit.
let updateTextSizes = function () {
  fitTextInElement(sel("#banner-tagline"));
  fitTextInElement(sel("#banner-heart"));
  fitTextInElement(sel("#banner-donate-button-text"));
  avoidWidows(sel("#banner-tagline span"));
};

// Read the tagline with the given index.
let getTagline = index => gStringBundle.GetStringFromName(
  "aboutTor.donationBanner.tagline" + (index + 1));

// Returns a random integer x, such that 0 <= x < max
let randomInteger = max => Math.floor(max * Math.random());


// The main donation banner function.
let runDonationBanner = function () {
  try {
    if (!shouldShowBanner()) {
      return;
    }
    sel("#banner-tagline span").innerText = getTagline(randomInteger(4));
    sel("#banner-heart span").innerText =
      gStringBundle.GetStringFromName("aboutTor.donationBanner.heart");
    sel("#banner-donate-button-text span").innerHTML =
      gStringBundle.GetStringFromName("aboutTor.donationBanner.donate");
    sel("#banner-donate-button-arrow").innerHTML = "&#187;";
    sel("#banner").style.display = "flex";
    sel("#banner-spacer").style.display = "block";
    addEventListener("resize", updateTextSizes);
    updateTextSizes();
    // Add a suffix corresponding to locale so we can send user
    // to a correctly-localized donation page via redirect.
    sel("#banner-donate-button-link").href += "-" + kBrowserLocaleShort;
    sel("#torstatus-image").style.display = "none";
  } catch (e) {
    // Something went wrong.
    console.error(e.message);
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
    runDonationBanner();
  }
});
