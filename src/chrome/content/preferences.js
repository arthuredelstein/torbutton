// # Security Settings user interface

// ### Utilities
let { utils: Cu } = Components;
let { bindPrefAndInit } =
    Cu.import("resource://torbutton/modules/utils.js");
let { setBoolPref, setIntPref } =
    Cu.import("resource://gre/modules/Services.jsm").Services.prefs;

// __torbutton_init_security_ui()__.
// Wire the Security Settings UI to two prefs,
// 'extensions.torbutton.security_slider' and
// 'extensions.torbutton.security_custom'.
// (The behavior of the prefs themselves is determined
// not here but in security-prefs.js.)
let torbutton_init_security_ui = function () {
  // When slider pref changes, move the security slider to
  // reflect its new value.
  const slider = document.getElementById("torbutton_sec_slider");
  bindPrefAndInit("extensions.torbutton.security_slider", prefValue => {
    slider.value = prefValue;
  });
  // When security slider is finished dragging, propagate its value to the pref.
  // (For performance and security reasons, we don't set prefs during dragging.)
  slider.dragStateChanged = function(isDragging) {
    let newValue = slider.value;
    if (newValue >= 1 && newValue <= 4) {
      setIntPref("extensions.torbutton.security_slider", newValue);
    }
  };
  // When the slider moves during or after a drag, or after it moves to
  // reflect a change in the pref value, show the matching description.
  const descNames =
        [, "desc_high", "desc_medium_high", "desc_medium_low", "desc_low"];
  const descs = descNames.map(name => document.getElementById(name));
  const updateDescs = sliderPosition =>
        descs.forEach((desc, i) => desc.collapsed = sliderPosition !== i);
  slider.valueChanged = function (which, newValue, userChanged) {
    if (userChanged && newValue >= 1 && newValue <= 4) {
      updateDescs(newValue);
    }
  };
  // Show the right description at init.
  updateDescs(slider.value);
  // When the custom pref is toggled, either show the security slider
  // or show the custom settings box instead.
  const sliderSettings = document.getElementById("torbutton_slider_settings");
  const customSettings = document.getElementById("torbutton_custom_settings");
  bindPrefAndInit("extensions.torbutton.security_custom", value => {
    sliderSettings.hidden = value;
    customSettings.hidden = !value;
  });
};
