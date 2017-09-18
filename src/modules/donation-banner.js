/* jshint esversion:6 */

const Cu = Components.utils;

// ### Import Mozilla Services
Cu.import("resource://gre/modules/Services.jsm");

// A list of locales for which the banner has been translated.
const kBannerLocales = [
  "bg",
  "da",
  "el",
  "en",
  "es",
  "fr",
  "is",
  "it",
  "nb",
  "tr",
];

// A list of donation page locales (at least redirects should exist).
const kDonationPageLocales = [
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

const kPropertiesURL = "chrome://torbutton/locale/aboutTor.properties";
const gStringBundle = Services.strings.createBundle(kPropertiesURL);

// Check if we should show the banner, depends on
// browser locale, current date, and how many times
// we have already shown the banner.
const shouldShowBanner = function (shortLocale) {
  try {
    // If our override test pref is true, then just show the banner regardless.
    if (Services.prefs.getBoolPref("extensions.torbutton.testBanner", false)) {
      return true;
    }
    // Don't show a banner if update is needed.
    let updateNeeded = Services.prefs.getBoolPref("extensions.torbutton.updateNeeded");
    if (updateNeeded) {
      return false;
    }
    // Only show banner when we have that locale and if a donation redirect exists.
    if (kBannerLocales.indexOf(shortLocale) === -1 ||
        kDonationPageLocales.indexOf(shortLocale) === -1) {
      return false;
    }
    // Only show banner between 2017 Oct 23 and 2018 Jan 25.
    let now = new Date();
    let start = new Date(2017, 9, 23);
    let end = new Date(2018, 0, 26);
    let shownCountPref = "extensions.torbutton.donation_banner2017.shown_count";
    if (now < start || now > end) {
      // Clean up pref if not in use.
      Services.prefs.clearUserPref(shownCountPref);
      return false;
    }
    // Only show banner 50 times.
    let count = 0;
    if (Services.prefs.prefHasUserValue(shownCountPref)) {
      count = Services.prefs.getIntPref(shownCountPref);
    }
    if (count >= 50) {
      return false;
    }
    Services.prefs.setIntPref(shownCountPref, count+1);
    return true;
  } catch (e) {
    return false;
  }
};

// Read data needed for displaying banner on page.
var bannerData = function () {
  // Read short locale.
  let locale = Services.prefs.getCharPref("general.useragent.locale");
  let shortLocale = locale.match(/[a-zA-Z]+/)[0].toLowerCase();
  if (!shouldShowBanner(shortLocale)) {
    return null;
  }
  // Load tag lines.
  let taglines = [];
  for (let index = 0; index < 5; ++index) {
    let tagline = gStringBundle.GetStringFromName(
      "aboutTor.donationBanner.tagline" + (index + 1));
    taglines.push(tagline);
  }
  // Read slogan and donate button text.
  let slogan = gStringBundle.GetStringFromName("aboutTor.donationBanner.slogan");
  let donate = gStringBundle.GetStringFromName("aboutTor.donationBanner.donate");
  let isMac = Services.appinfo.OS === "Darwin";
  return JSON.stringify({ taglines, slogan, donate, shortLocale, isMac });
};

// Export utility functions for external use.
var EXPORTED_SYMBOLS = ["bannerData"];
