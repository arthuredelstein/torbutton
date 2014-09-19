// Bug 1506 Android P1/TBB P5: This code providers users with notification
// in the event of external app launch. We want it to exist in the desktop
// port, but it is probably useless for Android.

/*************************************************************************
 * External App Handler.
 * Handles displaying confirmation dialogs for external apps and protocols
 * due to Firefox Bug https://bugzilla.mozilla.org/show_bug.cgi?id=440892
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton External App Handler";

const kMODULE_CONTRACTID_APP = "@mozilla.org/uriloader/external-helper-app-service;1";
const kMODULE_CONTRACTID_PROTO = "@mozilla.org/uriloader/external-protocol-service;1";
const kMODULE_CONTRACTID_MIME = "@mozilla.org/mime;1";


const kMODULE_CID = Components.ID("3da0269f-fc29-4e9e-a678-c3b1cafcf13f");

/* Mozilla defined interfaces for FF3.0 */
const kREAL_EXTERNAL_CID = "{A7F800E0-4306-11d4-98D0-001083010E9B}";
const kExternalInterfaces = ["nsIObserver", "nsIMIMEService",
                             "nsIExternalHelperAppService",
                             "nsISupportsWeakReference", // XXX: Uh-oh...
                             "nsIExternalProtocolService",
                             "nsPIExternalAppLauncher"];
                             
const Cr = Components.results;
const Cc = Components.classes;
const Ci = Components.interfaces;

var is_ff3 = (Services.vc.compare(Services.appInfo.version, "3.0a1") >= 0);

function ExternalWrapper() {
  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;
  this.logger.log(3, "Component Load 0: New ExternalWrapper.");

  this._real_external = Components.classesByID[kREAL_EXTERNAL_CID];
  this._interfaces = kExternalInterfaces;
  this._external = function() {
    var external = this._real_external.getService();
    for (var i = 0; i < this._interfaces.length; i++) {
      external.QueryInterface(Components.interfaces[this._interfaces[i]]);
    }
    return external;
  };
    
  this.copyMethods(this._external());

  try {
    var observerService = Cc["@mozilla.org/observer-service;1"].
        getService(Ci.nsIObserverService);
    observerService.addObserver(this, "on-modify-drag-list", false);
  } catch(e) {
    this.logger.log(5, "Failed to register drag observer");
  }
}

ExternalWrapper.prototype =
{
  QueryInterface: function(iid) {
    if (iid.equals(Components.interfaces.nsIClassInfo)
        || iid.equals(Components.interfaces.nsISupports)) {
      return this;
    }

    /* We perform this explicit check first because otherwise
     * the JSD exception logs are full of noise */
    var external = this._external().QueryInterface(iid);
    this.copyMethods(external);

    return this;
  },

  // make this an nsIClassInfo object
  flags: Components.interfaces.nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo

  classDescription: "@mozilla.org/uriloader/external-helper-app-service;1",
  contractID: "@mozilla.org/uriloader/external-helper-app-service;1",
  classID: kMODULE_CID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [Components.interfaces.nsIClassInfo];
    for (var i = 0; i < this._interfaces.length; i++) {
      interfaceList.push(Components.interfaces[this._interfaces[i]]);
    }

    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo  
  getHelperForLanguage: function(count) { return null; },

  /* Determine whether we should ask the user to run the app */
  blockApp: function() {
    return Services.prefs.getBoolPref("extensions.torbutton.tor_enabled");
  },

  /* Copies methods from the true object we are wrapping */
  copyMethods: function(wrapped) {
    var mimic = function(newObj, method) {
       if(typeof(wrapped[method]) == "function") {
          // Code courtesy of timeless: 
          // http://www.webwizardry.net/~timeless/windowStubs.js
          var params = [];
          params.length = wrapped[method].length;
          var x = 0;
          var call;
          if(params.length) call = "("+params.join().replace(/(?:)/g,function(){return "p"+(++x)})+")";
          else call = "()";

          var fun = "(function "+call+"{"+
            "if (arguments.length < "+wrapped[method].length+")"+
            "  throw Components.results.NS_ERROR_XPC_NOT_ENOUGH_ARGS;"+
            "return wrapped."+method+".apply(wrapped, arguments);})";
          newObj[method] = eval(fun);
       } else {
          newObj.__defineGetter__(method, function() { return wrapped[method]; });
          newObj.__defineSetter__(method, function(val) { wrapped[method] = val; });
      }
    };
    for (var method in wrapped) {
      if(typeof(this[method]) == "undefined") mimic(this, method);
    }
  },

  loadURI: function(aUri, aContext) {
    if(this.blockApp()) {
      var check = {value: false};
      var result = this._confirmLaunch(aUri.spec, check);

      if (result != 0) {
        return null;
      }
    }
 
    return this._external().loadURI(aUri, aContext);
  },

  // loadUrl calls loadURI

  _confirmLaunch: function(urispec, check) {
    if (!Services.prefs.getBoolPref("extensions.torbutton.launch_warning")) {
      return 0;
    }

    var chrome = Services.wm.getMostRecentWindow("navigator:browser");

    var prompts = Services.prompt;
    var flags = prompts.BUTTON_POS_0 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_POS_1 * prompts.BUTTON_TITLE_IS_STRING +
                prompts.BUTTON_DELAY_ENABLE +
                prompts.BUTTON_POS_1_DEFAULT;

    var title = chrome.torbutton_get_property_string("torbutton.popup.external.title");
    var app = chrome.torbutton_get_property_string("torbutton.popup.external.app");
    var note = chrome.torbutton_get_property_string("torbutton.popup.external.note");
    var suggest = chrome.torbutton_get_property_string("torbutton.popup.external.suggest");
    var launch = chrome.torbutton_get_property_string("torbutton.popup.launch");
    var cancel = chrome.torbutton_get_property_string("torbutton.popup.cancel");
    var dontask = chrome.torbutton_get_property_string("torbutton.popup.dontask");

    var result = prompts.confirmEx(chrome, title, app+note+suggest+" ",
                                   flags, launch, cancel, "", dontask, check);

    //var result = prompts.confirmEx(chrome, title, app+urispec+note+suggest+" ",
    //                               flags, launch, cancel, "", dontask, check);

    if (check.value) {
      Services.prefs.setBoolPref("extensions.torbutton.launch_warning", false);
    }

    return result;
  },
  
  doContent: function(aMimeContentType, aRequest, aWindowContext, aForceSave) {
    if(this.blockApp()) {
      var check = {value: false};
      var result = this._confirmLaunch(aRequest.name, check);

      if (result != 0) {
        return null;
      }
    }
 
    return this._external().doContent(aMimeContentType, aRequest, aWindowContext, aForceSave);
  },

  observe: function(subject, topic, data) {
    if(topic == "on-modify-drag-list") {
      this.logger.log(3, "Got drag observer event");
      try {
        subject.QueryInterface(Ci.nsISupportsArray);
      } catch(e) {
        this.logger.log(5, "Drag and Drop subject is not an array: "+e);
      }

      return this.filterDragURLs(subject);
    }
  },

  filterDragURLs: function(aTransferableArray) {
    for(var i = 0; i < aTransferableArray.Count(); i++) {
      this.logger.log(3, "Inspecting drag+drop transfer: "+i);
      var tr = aTransferableArray.GetElementAt(i);
      tr.QueryInterface(Ci.nsITransferable);

      var flavors = tr.flavorsTransferableCanExport()
                      .QueryInterface(Ci.nsISupportsArray);

      for (var f=0; f < flavors.Count(); f++) {
        var flavor =flavors.GetElementAt(f); 
        flavor.QueryInterface(Ci.nsISupportsCString);

        this.logger.log(3, "Got drag+drop flavor: "+flavor);
        if (flavor == "text/x-moz-url" ||
            flavor == "text/x-moz-url-data" ||
            flavor == "text/uri-list" ||
            flavor == "application/x-moz-file-promise-url") {
          this.logger.log(3, "Removing "+flavor);
          try { tr.removeDataFlavor(flavor); } catch(e) {}
        }
      }
    }
  },

};

var ExternalWrapperSingleton = null;
var ExternalWrapperFactory = new Object();

ExternalWrapperFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }

  if(!ExternalWrapperSingleton)
    ExternalWrapperSingleton = new ExternalWrapper();

  return ExternalWrapperSingleton;
};


/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

var ExternalWrapperModule = new Object();

ExternalWrapperModule.registerSelf = 
function (compMgr, fileSpec, location, type) {
  var nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_APP,
                                  fileSpec,
                                  location,
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_PROTO,
                                  fileSpec,
                                  location,
                                  type);

  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID_MIME,
                                  fileSpec,
                                  location,
                                  type);

};

ExternalWrapperModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return ExternalWrapperFactory;

  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
};

ExternalWrapperModule.canUnload = function (compMgr)
{
  return true;
};

/**
* XPCOMUtils.generateNSGetFactory was introduced in Mozilla 2 (Firefox 4).
* XPCOMUtils.generateNSGetModule is for Mozilla 1.9.2 (Firefox 3.6).
*/
Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");
if (XPCOMUtils.generateNSGetFactory) {
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([ExternalWrapper]);
} else {
    function NSGetModule(compMgr, fileSpec)
    {
      return ExternalWrapperModule;
    }
}

