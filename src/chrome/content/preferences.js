// # Security Settings User Interface

// Utilities
let { utils: Cu } = Components;
let { getBoolPref, getIntPref, setBoolPref, setIntPref } =
    Cu.import("resource://gre/modules/Services.jsm", {}).Services.prefs;

// Description elements have the follow names.
const descNames =
      [, "desc_high", "desc_medium", "desc_low"];

// A single `state` object that reflects the user settings in this UI.
let state = { slider : 0, custom : false};

// Utility functions to convert between the legacy 4-value pref index
// and the 3-valued security slider.
let sliderPositionToPrefSetting = pos => [, 1, 2, 4][pos];
let prefSettingToSliderPosition = pref => [, 1, 2, 2, 3][pref];

// Set the desired slider value and update UI.
function torbutton_set_slider(sliderPosition) {
  state.slider = sliderPosition;
  let slider = document.getElementById("torbutton_sec_slider");
  slider.value = sliderPosition;
  let descs = descNames.map(name => document.getElementById(name));
  descs.forEach((desc, i) => desc.collapsed = sliderPosition !== i);
};

// Set the desired custom value and update UI.
function torbutton_set_custom(customValue) {
  state.custom = customValue;
  let sliderSettings = document.getElementById("torbutton_slider_settings");
  let customSettings = document.getElementById("torbutton_custom_settings");
  sliderSettings.hidden = customValue;
  customSettings.hidden = !customValue;
};

// Read prefs 'extensions.torbutton.security_slider' and
// 'extensions.torbutton.security_custom', and initialize the UI.
function torbutton_init_security_ui() {
  torbutton_set_slider(prefSettingToSliderPosition(
    getIntPref("extensions.torbutton.security_slider")));
  torbutton_set_custom(getBoolPref("extensions.torbutton.security_custom"));
};

// Write the two prefs from the current settings.
function torbutton_save_security_settings() {
  setIntPref("extensions.torbutton.security_slider",
             sliderPositionToPrefSetting(state.slider));
  setBoolPref("extensions.torbutton.security_custom", state.custom);
};
