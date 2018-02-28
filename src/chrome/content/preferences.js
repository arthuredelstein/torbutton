// # Security Settings User Interface

// Utilities
let { utils: Cu } = Components;
let { getBoolPref, getIntPref, setBoolPref, setIntPref, getCharPref } =
    Cu.import("resource://gre/modules/Services.jsm", {}).Services.prefs;

let { getLocale } =
    Cu.import("resource://torbutton/modules/utils.js", {});

// Description elements have the follow names.
const descNames =
      [, "desc_safest", "desc_safer", "desc_standard"];
// "Learn-more"-elements have the follow names.
const linkNames =
      [, "link_safest", "link_safer", "link_standard"];
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
  torbutton_set_learn_more_links();
  // Make sure the "Accept"-button is focused when we show the dialog and not a
  // possible "Learn more"-link. See: comment:16 in bug 21847.
  let okBtn = document.documentElement.getButton("accept");
  if (okBtn)
    okBtn.focus();
  setTimeout(adjustDialogSize, 0);
};

// Write the two prefs from the current settings.
function torbutton_save_security_settings() {
  setIntPref("extensions.torbutton.security_slider",
             sliderPositionToPrefSetting(state.slider));
  setBoolPref("extensions.torbutton.security_custom", state.custom);
};

// We follow the way we treat the links to the Tor Browser User Manual on the
// Help Menu and on about:tor: if we have the manual available for a locale,
// let's show the "Learn more"-link, otherwise hide it.
function torbutton_set_learn_more_links() {
  let show_manual = window.opener.torbutton_show_torbrowser_manual();
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

// Increase the height of this window so that a vertical scrollbar is not
// needed on the description box.
function adjustDialogSize() {
  try {
    // Find the height required by the tallest description element.
    let descHeight = 0;
    let descs = descNames.map(name => document.getElementById(name));
    descs.forEach(elem => {
      let origCollapsed = elem.collapsed;
      elem.collapsed = false;
      let h = elem.scrollHeight;
      elem.collapsed = origCollapsed;
      if (h > descHeight)
        descHeight = h;
    });

    // Cap the height (just in case).
    const kMaxDescriptionHeight = 550;
    if (descHeight > kMaxDescriptionHeight)
      descHeight = kMaxDescriptionHeight;

    // Increase the height of the description container if it is too short.
    let boxElem = document.getElementById("descBox");
    if (boxElem.clientHeight < descHeight) {
      boxElem.setAttribute("height", descHeight);

      // Resize the XUL window to account for the new description height. In
      // order for sizeToContent() to work correctly, it seems that we must
      // remove the height attribute from the dialog (that attribute is added
      // after a user manually resizes the window).
      document.documentElement.removeAttribute("height");
      sizeToContent();
    }
  } catch (e) {}

  // Show a scrollbar for the description text if one is needed.
  // To avoid bug 21330, we set the overflow=auto style here instead
  // of directly in the XUL.
  document.getElementById("descBox").style.overflow = "auto";
}
