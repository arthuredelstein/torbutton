// Bug 1506 P1: Most of this code needs to go away. See also Bug 3100.

// PREFERences dialog functions
//   torbutton_prefs_init() -- on dialog load
//   torbutton_prefs_save() -- on dialog save

const Cc = Components.classes, Ci = Components.interfaces;


function torbutton_prefs_init(doc) {
    torbutton_log(2, "called prefs_init()");

    var o_torprefs = torbutton_get_prefbranch('extensions.torbutton.');

    // Privacy and security settings
    let sec_slider = doc.getElementById('torbutton_sec_slider');
    let sec_custom = doc.getElementById('torbutton_sec_custom');
    let custom_values = o_torprefs.getBoolPref('security_custom');
    sec_slider.value = o_torprefs.getIntPref('security_slider');
    sec_custom.checked = custom_values;
    sec_custom.disabled = !custom_values;
    torbutton_set_slider_text(doc, sec_custom.checked);
    // If the custom checkbox is checked and the user is done with dragging
    // uncheck the checkbox to allow setting the (newly) chosen security level.
    sec_slider.dragStateChanged = function(isDragging) {
        if (!isDragging && sec_custom.checked) {
           sec_custom.checked = false;
           sec_custom.disabled = true;
        }
    }
    sec_slider.valueChanged = function(which, newValue, userChanged) {
        torbutton_set_slider_text(doc, false);
    }
}

function torbutton_prefs_save(doc) {
    // Disable the Accept button once the user clicked on it as clicking on
    // our active Accept button more than once can lead to all sort of weird
    // behavior. See bug 11763 for an example.
    doc.documentElement.getButton("accept").disabled = true;
    torbutton_log(2, "called prefs_save()");
    var o_torprefs = torbutton_get_prefbranch('extensions.torbutton.');

    // Privacy and Security Settings

    o_torprefs.setBoolPref('security_custom',
                           doc.getElementById('torbutton_sec_custom').checked);
    o_torprefs.setIntPref('security_slider',
                          doc.getElementById('torbutton_sec_slider').value);

    // If we have non-custom Security Slider settings update them now.
    if (!o_torprefs.getBoolPref('security_custom')) {
      let wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                         .getService(Components.interfaces.nsIWindowMediator);
      let win = wm.getMostRecentWindow("navigator:browser");
      win.torbutton_update_security_slider();
    }
}

function torbutton_toggle_slider(doc, pos) {
    doc.getElementById("torbutton_sec_slider").value = pos;
    // Make sure the custom checkbox is unchecked as the user seems to want one
    // of the defined security levels.
    let sec_custom = doc.getElementById("torbutton_sec_custom");
    if (sec_custom.checked) {
        sec_custom.checked = false;
    }
    torbutton_set_slider_text(doc, false);
}

function torbutton_set_slider_text(doc, custom) {
  let level = doc.getElementById("torbutton_sec_slider").value;
  if (custom) {
    level = 5;
  }
  switch (level) {
    case (1):
      doc.getElementById("desc_low").collapsed = true;
      doc.getElementById("desc_medium_low").collapsed = true;
      doc.getElementById("desc_medium_high").collapsed = true;
      doc.getElementById("desc_high").collapsed = false;
      break;
    case (2):
      doc.getElementById("desc_low").collapsed = true;
      doc.getElementById("desc_medium_low").collapsed = true;
      doc.getElementById("desc_medium_high").collapsed = false;
      doc.getElementById("desc_high").collapsed = true;
      break;
   case (3):
      doc.getElementById("desc_low").collapsed = true;
      doc.getElementById("desc_medium_low").collapsed = false;
      doc.getElementById("desc_medium_high").collapsed = true;
      doc.getElementById("desc_high").collapsed = true;
      break;
    case (4):
      doc.getElementById("desc_low").collapsed = false;
      doc.getElementById("desc_medium_low").collapsed = true;
      doc.getElementById("desc_medium_high").collapsed = true;
      doc.getElementById("desc_high").collapsed = true;
      break;
    case (5):
      doc.getElementById("desc_low").collapsed = true;
      doc.getElementById("desc_medium_low").collapsed = true;
      doc.getElementById("desc_medium_high").collapsed = true;
      doc.getElementById("desc_high").collapsed = true;
      break;
  }
}
