/* jshint esnext:true */

// __addObserverFunction__.
// Attach an observerFunction for the given notification type.
// When notification is triggered, the observerFunction will
// be called with arguments (subject, data). Returns an
// zero-arg anonymous function that detaches the observer.
let addObserverFunction = function(notification, observerFunction) {
  let observer = {
    observe: function (subject, topic, data) {
      if (topic === notification) {
        observerFunction(subject, data);
      }
    }
  };
  Services.obs.addObserver(observer, notification, false);
  return function () {
    Services.obs.removeObserver(observer, notification);
  };
};

// __runScriptFirstInEachContentWindow__.
// In each future new content document (such as a new tab or iframe),
// run the script at scriptURL in the content's global "window" scope
// before any content is loaded.
let runScriptFirstInEachContentWindow = function (scriptURL) {
  return addObserverFunction("content-document-global-created",
    function (subject, data) {
      if (subject instanceof Ci.nsIDOMWindow) {
        let contentWindow = XPCNativeWrapper.unwrap(subject);
        Services.scriptloader.loadSubScript(scriptURL, contentWindow, "UTF-8");
      }
    });
};

