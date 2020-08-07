// Bug 1506 P1: This is just a handy logger. If you have a better one, toss
// this in the trash.

/*************************************************************************
 * TBLogger (JavaScript XPCOM component)
 *
 * Allows loglevel-based logging to different logging mechanisms.
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Torbutton Logger";
const kMODULE_CONTRACTID = "@torproject.org/torbutton-logger;1";
const kMODULE_CID = Components.ID("f36d72c9-9718-4134-b550-e109638331d7");

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  ComponentUtils: "resource://gre/modules/ComponentUtils.jsm",
});

function TorbuttonLogger() {
    // Register observer
    Services.prefs.addObserver("extensions.torbutton", this);

    this.loglevel = Services.prefs.getIntPref("extensions.torbutton.loglevel");
    this.logmethod = Services.prefs.getIntPref("extensions.torbutton.logmethod");

    try {
        var logMngr = Cc["@mozmonkey.com/debuglogger/manager;1"]
            .getService(Ci.nsIDebugLoggerManager);
        this._debuglog = logMngr.registerLogger("torbutton");
    } catch (exErr) {
        this._debuglog = false;
    }
    this._console = Services.console;

    // This JSObject is exported directly to chrome
    this.wrappedJSObject = this;
    this.log(3, "Torbutton debug output ready");
}

/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

const nsIClassInfo = Ci.nsIClassInfo;

const logString = { 1:"VERB", 2:"DBUG", 3: "INFO", 4:"NOTE", 5:"WARN" };

function padInt(i)
{
    return (i < 10) ? '0' + i : i;
}

TorbuttonLogger.prototype =
{
  QueryInterface: ChromeUtils.generateQI([Ci.nsIClassInfo]),

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: "TorbuttonLogger",
  classID: kMODULE_CID,
  contractID: kMODULE_CONTRACTID,

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

  formatLog: function(str, level) {
      var d = new Date();
      var now = padInt(d.getUTCMonth()+1)+"-"+padInt(d.getUTCDate())+" "+padInt(d.getUTCHours())+":"+padInt(d.getUTCMinutes())+":"+padInt(d.getUTCSeconds());
      return "["+now+"] Torbutton "+logString[level]+": "+str;
  },

  // error console log
  eclog: function(level, str) {
      switch(this.logmethod) {
          case 0: // stderr
              if(this.loglevel <= level)
                  dump(this.formatLog(str, level)+"\n");
              break;
          default: // errorconsole
              if(this.loglevel <= level)
                  this._console.logStringMessage(this.formatLog(str,level));
              break;
      }
  },

  safe_log: function(level, str, scrub) {
      if (this.loglevel < 4) {
          this.eclog(level, str+scrub);
      } else {
          this.eclog(level, str+" [scrubbed]");
      }
  },

  log: function(level, str) {
      switch(this.logmethod) {
          case 2: // debuglogger
              if(this._debuglog) {
                  this._debuglog.log((6-level), this.formatLog(str,level));
                  break;
              }
              // fallthrough
          case 0: // stderr
              if(this.loglevel <= level) 
                  dump(this.formatLog(str,level)+"\n");
              break;
          default:
              dump("Bad log method: "+this.logmethod);
          case 1: // errorconsole
              if(this.loglevel <= level)
                  this._console.logStringMessage(this.formatLog(str,level));
              break;
      }
  },

  // Pref observer interface implementation

  // topic:   what event occurred
  // subject: what nsIPrefBranch we're observing
  // data:    which pref has been changed (relative to subject)
  observe: function(subject, topic, data)
  {
      if (topic != "nsPref:changed") return;
      switch (data) {
          case "extensions.torbutton.logmethod":
              this.logmethod = Services.prefs.getIntPref("extensions.torbutton.logmethod");
              if (this.logmethod === 0) {
                Services.prefs.setBoolPref("browser.dom.window.dump.enabled",
                  true);
              } else if (Services.prefs.
                getIntPref("extensions.torlauncher.logmethod", 3) !== 0) {
                // If Tor Launcher is not available or its log method is not 0
                // then let's reset the dump pref.
                Services.prefs.setBoolPref("browser.dom.window.dump.enabled",
                  false);
              }
              break;
          case "extensions.torbutton.loglevel":
              this.loglevel = Services.prefs.getIntPref("extensions.torbutton.loglevel");
              break;
      }
  }
}

// Assign factory to global object.
const NSGetFactory = XPCOMUtils.generateNSGetFactory
  ? XPCOMUtils.generateNSGetFactory([TorbuttonLogger])
  : ComponentUtils.generateNSGetFactory([TorbuttonLogger]);
