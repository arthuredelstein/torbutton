// # Security Settings User Interface for Mobile

// Utilities
let { utils: Cu } = Components;
let { getBoolPref, getIntPref, setBoolPref, setIntPref, getCharPref } =
    Cu.import("resource://gre/modules/Services.jsm", {}).Services.prefs;

let { getLocale, show_torbrowser_manual } =
    Cu.import("resource://torbutton/modules/utils.js", {});

// Description elements have the follow names.
const descNames =
      [, "desc_standard", "desc_safer", "desc_safest"];
// "Learn-more"-elements have the follow names.
const linkNames =
      [, "link_standard", "link_safer", "link_safest"];
// A single `state` object that reflects the user settings in this UI.

let state = { slider : 0, custom : false};

// Utility functions to convert between the legacy 4-value pref index
// and the 3-valued security slider.
let sliderPositionToPrefSetting = pos => [, 4, 2, 1][pos];
let prefSettingToSliderPosition = pref => [, 3, 2, 2, 1][pref];

// Set the desired slider value and update UI.
function torbutton_set_slider(sliderValue) {
  state.slider = sliderValue;
  let slider = document.getElementById("torbutton_sec_slider");
  slider.value = sliderValue.toString();
  let descs = descNames.map(name => document.getElementById(name));
  descs.forEach((desc, i) => {
    if (state.slider !== i) {
      desc.style.display = 'none';
    } else {
      desc.style.display = 'block';
    }
  });
  torbutton_save_security_settings();
}

// Read prefs 'extensions.torbutton.security_slider' and
// 'extensions.torbutton.security_custom', and initialize the UI.
function torbutton_init_security_ui() {
  torbutton_set_slider(prefSettingToSliderPosition(
    getIntPref("extensions.torbutton.security_slider")));
  torbutton_set_learn_more_links();
}

// Write the two prefs from the current settings.
function torbutton_save_security_settings() {
  setIntPref("extensions.torbutton.security_slider",
             sliderPositionToPrefSetting(state.slider));
  setBoolPref("extensions.torbutton.security_custom", state.custom);
}

// We follow the way we treat the links to the Tor Browser User Manual on the
// Help Menu and on about:tor: if we have the manual available for a locale,
// let's show the "Learn more"-link, otherwise hide it.
function torbutton_set_learn_more_links() {
  let show_manual = show_torbrowser_manual();
  let locale = ""
  if (show_manual) {
    locale = getLocale();
  }
  let links = linkNames.map(name => document.getElementById(name));
  links.forEach(link => {;
    if (show_manual && locale != "") {
      link.href= "https:/tb-manual.torproject.org/" + locale +
        "/security-slider.html";
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  });
}
