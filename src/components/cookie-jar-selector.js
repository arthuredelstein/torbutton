/*************************************************************************
 * Cookie Jar Selector (JavaScript XPCOM component)
 * Enables selection of separate cookie jars for (more) anonymous browsing.
 * Designed as a component of FoxTor, http://cups.cs.cmu.edu/foxtor/
 * Copyright 2006, distributed under the same (open source) license as FoxTor
 *
 * Contributor(s):
 *         Collin Jackson <mozilla@collinjackson.com>
 *
 *************************************************************************/

// Module specific constants
const kMODULE_NAME = "Cookie Jar Selector";
const kMODULE_CONTRACTID = "@stanford.edu/cookie-jar-selector;1";
const kMODULE_CID = Components.ID("e6204253-b690-4159-bfe8-d4eedab6b3be");

const Cr = Components.results;

function CookieJarSelector() {
  var Cc = Components.classes;
  var Ci = Components.interfaces;

  this.logger = Components.classes["@torproject.org/torbutton-logger;1"]
      .getService(Components.interfaces.nsISupports).wrappedJSObject;

  var getProfileFile = function(filename) {
    var loc = "ProfD";  // profile directory
    var file = 
      Cc["@mozilla.org/file/directory_service;1"]
      .getService(Ci.nsIProperties)
      .get(loc, Ci.nsILocalFile)
      .clone();
    file.append(filename); 
    return file;
  };

  var copyProfileFile = function(src, dest) {
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      // XXX: Permissions issue with Vista roaming profiles? 
      // Maybe file locking?
      // XXX: Hrmm... how to alert user?? They may never notice these messages..
      try {
          if (destfile.exists()) {
              destfile.remove(false);
          }
      } catch(e) {
          this.logger.log(4, "Cookie file deletion exception: "+e);
      }
      try {
          srcfile.copyTo(null, dest);
      } catch(e) {
          this.logger.log(5, "Cookie file copy exception: "+e);
      }
    }
  };

  var moveProfileFile = function(src, dest) { // FIXME: Why does this not work?
    var srcfile = getProfileFile(src);    
    var destfile = getProfileFile(dest);
    if (srcfile.exists()) {
      if (destfile.exists()) {
        destfile.remove(false);
      }
      srcfile.moveTo(null, dest);
    }
  };

  var loadCookiesFromFile = function(aFile) {
      var storageService = Cc["@mozilla.org/storage/service;1"]
          .getService(Ci.mozIStorageService);
      try {
          var mDBConn = storageService.openDatabase(aFile);
      } catch(e) {
          this.logger.log(5, "Cookie file open exception: "+e);
          return;
      }
      if (!mDBConn.tableExists("moz_cookies")) { // Should not happen
          this.logger.log(5, "No cookies table!");
          return;
      }
      if (mDBConn.schemaVersion != 2) { // Should not happen
          this.logger.log(5, "Cookies table version mismatch");
          return;
      } 
      
      var cookieManager = Cc["@mozilla.org/cookiemanager;1"].getService(Ci.nsICookieManager);
 
      var stmt = mDBConn.createStatement("SELECT id, name, value, host, path, expiry, lastAccessed, isSecure, isHttpOnly FROM moz_cookies");

      while (stmt.executeStep()) {
          var name = stmt.getUTF8String(1);
          var value = stmt.getUTF8String(2);
          var host = stmt.getUTF8String(3);
          var path = stmt.getUTF8String(4);
          var expiry = stmt.getInt64(5);
          var lastAccessed = stmt.getInt64(6);
          var isSecure = (stmt.getInt32(7) != 0);
          var isHttpOnly = (stmt.getInt32(8) != 0);
          cookieManager.QueryInterface(Ci.nsICookieManager2).add(host, path, name, value, isSecure, isHttpOnly, false, expiry);
      }
      stmt.reset();
  };

  this.clearCookies = function() {
    Cc["@mozilla.org/cookiemanager;1"]
    .getService(Ci.nsICookieManager)
    .removeAll();
  }

  this.saveCookies = function(name) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsICookieManager);
    cookieManager.QueryInterface(Ci.nsIObserver);

    // Tell the cookie manager to unload cookies from memory 
    // and sync to disk.
    cookieManager.observe(this, "profile-before-change", "");
    // Tell the cookie manager to reload cookies from disk
    cookieManager.observe(this, "profile-do-change", "");
    copyProfileFile("cookies"+this.extn, "cookies-" + name + this.extn);
  };

  this.loadCookies = function(name, deleteSavedCookieJar) {
    var cookieManager =
      Cc["@mozilla.org/cookiemanager;1"]
      .getService(Ci.nsIObserver);

    // Tell the cookie manager to unload cookies from memory and disk
    var context = "shutdown-cleanse"; 
    cookieManager.observe(this, "profile-before-change", context);

    var fn = deleteSavedCookieJar ? moveProfileFile : copyProfileFile;

    // Tell the cookie manager to reload cookies from disk
    if (this.is_ff3) {
        var cookieFile = getProfileFile("cookies-"+name+this.extn);
        // Workaround for Firefox bug 439384:
        loadCookiesFromFile(cookieFile);
        // Tell the cookie manager to unload cookies from memory 
        // and sync to disk.
        cookieManager.observe(this, "profile-before-change", "");
        // Tell the cookie manager to reload cookies from disk
        cookieManager.observe(this, "profile-do-change", "");

        // Following fails b/c of FF Bug 439384. It is the alternative
        // to the above lines.
        // Replace the cookies.sqlite file with the loaded data
        // fn("cookies-"+name+this.extn, "cookies"+this.extn);
        // still notify cookieManager to call initDB, and reset mDBConn
        //cookieManager.observe(this, "profile-do-change", context);
    } else {
        // Replace the cookies.txt file with the loaded data
        fn("cookies-"+name+this.extn, "cookies"+this.extn);
        cookieManager.observe(this, "profile-do-change", context);
    }
    this.logger.log(2, "Cookies reloaded");
  };

  // Check firefox version to know filename
  var appInfo = Components.classes["@mozilla.org/xre/app-info;1"]
      .getService(Components.interfaces.nsIXULAppInfo);
  var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
      .getService(Components.interfaces.nsIVersionComparator);

  if(versionChecker.compare(appInfo.version, "3.0a1") >= 0) {
      this.is_ff3 = true;
      this.extn = ".sqlite";
  } else {
      this.is_ff3 = false;
      this.extn = ".txt";
  }


  // This JSObject is exported directly to chrome
  this.wrappedJSObject = this;
}

/**
 * JS XPCOM component registration goop:
 *
 * Everything below is boring boilerplate and can probably be ignored.
 */

const nsISupports = Components.interfaces.nsISupports;
const nsIClassInfo = Components.interfaces.nsIClassInfo;
const nsIComponentRegistrar = Components.interfaces.nsIComponentRegistrar;
const nsIObserverService = Components.interfaces.nsIObserverService;

CookieJarSelector.prototype =
{
  QueryInterface: function(iid)
  {
    if (!iid.equals(nsIClassInfo) &&
        !iid.equals(nsISupports)) {
      Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
      return null;
    }
    return this;
  },

  wrappedJSObject: null,  // Initialized by constructor

  // make this an nsIClassInfo object
  flags: nsIClassInfo.DOM_OBJECT,

  // method of nsIClassInfo
  classDescription: "CookieJarSelector",

  // method of nsIClassInfo
  getInterfaces: function(count) {
    var interfaceList = [nsIClassInfo];
    count.value = interfaceList.length;
    return interfaceList;
  },

  // method of nsIClassInfo
  getHelperForLanguage: function(count) { return null; },

}

var CookieJarSelectorFactory = new Object();

CookieJarSelectorFactory.createInstance = function (outer, iid)
{
  if (outer != null) {
    Components.returnCode = Cr.NS_ERROR_NO_AGGREGATION;
    return null;
  }
  if (!iid.equals(nsIClassInfo) &&
      !iid.equals(nsISupports)) {
    Components.returnCode = Cr.NS_ERROR_NO_INTERFACE;
    return null;
  }
  return new CookieJarSelector();
}

var CookieJarSelectorModule = new Object();

CookieJarSelectorModule.registerSelf = 
function (compMgr, fileSpec, location, type)
{
  compMgr = compMgr.QueryInterface(nsIComponentRegistrar);
  compMgr.registerFactoryLocation(kMODULE_CID,
                                  kMODULE_NAME,
                                  kMODULE_CONTRACTID,
                                  fileSpec, 
                                  location, 
                                  type);
}

CookieJarSelectorModule.getClassObject = function (compMgr, cid, iid)
{
  if (cid.equals(kMODULE_CID))
    return CookieJarSelectorFactory;


  Components.returnCode = Cr.NS_ERROR_NOT_REGISTERED;
  return null;
}

CookieJarSelectorModule.canUnload = function (compMgr)
{
  return true;
}

function NSGetModule(compMgr, fileSpec)
{
  return CookieJarSelectorModule;
}
