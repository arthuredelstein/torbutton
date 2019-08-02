// Bug 1506 Android P1/TBB P5: This code provides users with notification
// in the event of external app launch. We want it to exist in the desktop
// port, but it is probably useless for Android.

/*************************************************************************
 * External App Handler.
 * Handles displaying confirmation dialogs for external apps and protocols
 * due to Firefox Bug https://bugzilla.mozilla.org/show_bug.cgi?id=440892
 *
 * An instance of this module is created each time the browser starts to
 * download a file and when an external application may be invoked to
 * handle an URL (e.g., when the user clicks on a mailto: URL).
 *************************************************************************/

const {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {PromptUtils} = ChromeUtils.import("resource://gre/modules/SharedPromptUtils.jsm");

// Module specific constants
const kMODULE_NAME = "Torbutton External App Handler";
const kCONTRACT_ID = "@torproject.org/torbutton-extAppBlocker;1";
const kMODULE_CID = Components.ID("3da0269f-fc29-4e9e-a678-c3b1cafcf13f");

const kInterfaces = [Ci.nsIObserver, Ci.nsIClassInfo];

function ExternalAppBlocker() {
  this.logger = Cc["@torproject.org/torbutton-logger;1"]
      .getService(Ci.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New ExternalAppBlocker.");
}

ExternalAppBlocker.prototype =
{
  _helperAppLauncher: undefined,

  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIHelperAppWarningDialog]),

  // make this an nsIClassInfo object
  flags: Ci.nsIClassInfo.DOM_OBJECT,
  classDescription: kMODULE_NAME,
  contractID: kCONTRACT_ID,
  classID: kMODULE_CID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    count.value = kInterfaces.length;
    return kInterfaces;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  // method of nsIHelperAppWarningDialog
  maybeShow: function(aLauncher, aWindowContext)
  {
    // Hold a reference to the object that called this component. This is
    // important not just because we need to later invoke the
    // continueRequest() or cancelRequest() callback on aLauncher, but also
    // so that the launcher object (which is a reference counted object) is
    // not released too soon.
    this._helperAppLauncher = aLauncher;

    if (!Services.prefs.getBoolPref("extensions.torbutton.launch_warning")) {
      this._helperAppLauncher.continueRequest();
      return;
    }

    this._showPrompt(aWindowContext);
  },

  /*
   * The _showPrompt() implementation uses some XUL and JS that is part of the
   * browser's confirmEx() implementation. Specifically, _showPrompt() depends
   * on chrome://global/content/commonDialog.xul as well as some of the code
   * in resource://gre/modules/SharedPromptUtils.jsm.
   */
  _showPrompt: function(aWindowContext) {
    let parentWin;
    try {
      parentWin = aWindowContext.getInterface(Ci.nsIDOMWindow);
    } catch (e) {
      parentWin = Services.wm.getMostRecentWindow("navigator:browser");
    }

    let title = parentWin.torbutton_get_property_string("torbutton.popup.external.title");
    let app = parentWin.torbutton_get_property_string("torbutton.popup.external.app");
    let note = parentWin.torbutton_get_property_string("torbutton.popup.external.note");
    let suggest = parentWin.torbutton_get_property_string("torbutton.popup.external.suggest");
    let launch = parentWin.torbutton_get_property_string("torbutton.popup.launch");
    let cancel = parentWin.torbutton_get_property_string("torbutton.popup.cancel");
    let dontask = parentWin.torbutton_get_property_string("torbutton.popup.dontask");

    let args = {
      promptType:       "confirmEx",
      title:            title,
      text:             app+note+suggest+" ",
      checkLabel:       dontask,
      checked:          false,
      ok:               false,
      button0Label:     launch,
      button1Label:     cancel,
      defaultButtonNum: 1, // Cancel
      buttonNumClicked: 1, // Cancel
      enableDelay: true,
    };

    let propBag = PromptUtils.objectToPropBag(args);
    let uri = "chrome://global/content/commonDialog.xul";
    let promptWin = Services.ww.openWindow(parentWin, uri, "_blank",
                                    "centerscreen,chrome,titlebar", propBag);
    promptWin.addEventListener("load", aEvent => {
      promptWin.addEventListener("unload", aEvent => {
        PromptUtils.propBagToObject(propBag, args);

        if (0 == args.buttonNumClicked) {
          // Save the checkbox value and tell the browser's external helper app
          // module about the user's choice.
          if (args.checked) {
            Services.prefs.setBoolPref("extensions.torbutton.launch_warning",
                                       false);
          }

          this._helperAppLauncher.continueRequest();
        } else {
          this._helperAppLauncher.cancelRequest(Cr.NS_BINDING_ABORTED);
        }
      }, false);
    }, false);
  },
};

var NSGetFactory = XPCOMUtils.generateNSGetFactory([ExternalAppBlocker]);
