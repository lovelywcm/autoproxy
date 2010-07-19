/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Adblock Plus.
 *
 * The Initial Developer of the Original Code is
 * Wladimir Palant.
 * Portions created by the Initial Developer are Copyright (C) 2006-2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * 2009: Wang Congming <lovelywcm@gmail.com> modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Constants / Globals
 */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

const Node = Ci.nsIDOMNode;
const Element = Ci.nsIDOMElement;
const Window = Ci.nsIDOMWindow;

const loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
const versionComparator = Cc["@mozilla.org/xpcom/version-comparator;1"].createInstance(Ci.nsIVersionComparator);
var windowMediator = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
var windowWatcher= Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
try
{
  var headerParser = Cclasses["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
}
catch(e)
{
  headerParser = null;
}

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

/**
 * Application startup/shutdown observer, triggers init()/shutdown() methods in aup object.
 */
function Initializer() {}
Initializer.prototype =
{
  classDescription: "AutoProxy initializer",
  contractID: "@autoproxy.org/aup/startup;1",
  classID: Components.ID("{6b6b24d0-63c3-11de-8a39-0800200c9a66}"),
  _xpcom_categories: [{ category: "app-startup", service: true }],

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver, Ci.nsISupportsWeakReference]),

  observe: function(subject, topic, data)
  {
    let observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
    switch (topic)
    {
      case "app-startup":
        observerService.addObserver(this, "profile-after-change", true);
        observerService.addObserver(this, "quit-application", true);
        break;
      case "profile-after-change":
        observerService.addObserver(this, "quit-application", true);
        aup.init();
        break;
      case "quit-application":
        aup.shutdown();
        break;
    }
  }
};

/*
 * Content policy class definition
 */
const aup =
{
  classDescription: "AutoProxy component",
  classID: Components.ID("{7FCE727A-028D-11DE-9E0F-298E56D89593}"),
  contractID: "@mozilla.org/autoproxy;1",
  _xpcom_factory: {
    createInstance: function(outer, iid)
    {
      if (outer)
        throw Cr.NS_ERROR_NO_AGGREGATION;

      return aup.QueryInterface(iid);
    }
  },
  _xpcom_categories: [{category: "content-policy"}, {category: "net-channel-event-sinks"}],

  //
  // nsISupports interface implementation
  //
  QueryInterface: function(iid)
  {
    // Note: do not use |this| in this method! It is being used in the
    // content policy component as well.

    if (iid.equals(Ci.nsIContentPolicy) || iid.equals(Ci.nsIChannelEventSink))
      return policy;

    if (iid.equals(Ci.nsISupports))
      return aup;

    throw Cr.NS_ERROR_NO_INTERFACE;
  },

  //
  // IAutoProxy interface implementation
  //

  /**
   * Returns current subscription count
   * @type Integer
   */
  get subscriptionCount()
  {
    return filterStorage.subscriptions.length;
  },

  /**
   * Wraps a subscription into IAutoProxySubscription structure.
   */
  _getSubscriptionWrapper: function(/**Subscription*/ subscription) /**IAutoProxySubscription*/
  {
    if (!subscription)
      return null;

    return {
      url: subscription.url,
      special: subscription instanceof SpecialSubscription,
      title: subscription.title,
      autoDownload: subscription instanceof DownloadableSubscription && subscription.autoDownload,
      disabled: subscription.disabled,
      external: subscription instanceof ExternalSubscription,
      lastDownload: subscription instanceof RegularSubscription ? subscription.lastDownload : 0,
      downloadStatus: subscription instanceof DownloadableSubscription ? subscription.downloadStatus : "synchronize_ok",
      lastModified: subscription instanceof DownloadableSubscription ? subscription.lastModified : null,
      expires: subscription instanceof DownloadableSubscription ? subscription.expires : 0,
      getPatterns: function(length)
      {
        let result = subscription.filters.map(function(filter)
        {
          return filter.text;
        });
        if (typeof length == "object")
          length.value = result.length;
        return result;
      }
    };
  },

  /**
   * Gets a subscription by its URL
   */
  getSubscription: function(/**String*/ id) /**IAutoProxySubscription*/
  {
    if (id in filterStorage.knownSubscriptions)
      return this._getSubscriptionWrapper(filterStorage.knownSubscriptions[id]);

    return null;
  },

  /**
   * Gets a subscription by its position in the list
   */
  getSubscriptionAt: function(/**Integer*/ index) /**IAutoProxySubscription*/
  {
    if (index < 0 || index >= filterStorage.subscriptions.length)
      return null;

    return this._getSubscriptionWrapper(filterStorage.subscriptions[index]);
  },

  /**
   * Updates an external subscription and creates it if necessary
   */
  updateExternalSubscription: function(/**String*/ id, /**String*/ title, /**Array of Filter*/ filters, /**Integer*/ length) /**Boolean*/
  {
    try
    {
      // Don't allow valid URLs as IDs for external subscriptions
      if (ioService.newURI(id, null, null))
        return false;
    } catch (e) {}

    let subscription = Subscription.fromURL(id);
    if (!subscription)
      subscription = new ExternalSubscription(id, title);

    if (!(subscription instanceof ExternalSubscription))
      return false;

    subscription.lastDownload = parseInt(new Date().getTime() / 1000);

    let newFilters = [];
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        newFilters.push(filter);
    }

    if (id in filterStorage.knownSubscriptions)
      filterStorage.updateSubscriptionFilters(subscription, newFilters);
    else
    {
      subscription.filters = newFilters;
      filterStorage.addSubscription(subscription);
    }
    filterStorage.saveToDisk();

    return true;
  },

  /**
   * Removes an external subscription by its identifier
   */
  removeExternalSubscription: function(/**String*/ id) /**Boolean*/
  {
    if (!(id in filterStorage.knownSubscriptions && filterStorage.knownSubscriptions[id] instanceof ExternalSubscription))
      return false;

    filterStorage.removeSubscription(filterStorage.knownSubscriptions[id]);
    return true;
  },

  /**
   * Adds user-defined filters to the list
   */
  addPatterns: function(/**Array of String*/ filters, /**Integer*/ length)
  {
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        filterStorage.addFilter(filter);
    }
    filterStorage.saveToDisk();
  },

  /**
   * Removes user-defined filters from the list
   */
  removePatterns: function(/**Array of String*/ filters, /**Integer*/ length)
  {
    for each (let filter in filters)
    {
      filter = Filter.fromText(normalizeFilter(filter));
      if (filter)
        filterStorage.removeFilter(filter);
    }
    filterStorage.saveToDisk();
  },

  /**
   * Returns installed AutoProxy version
   */
  getInstalledVersion: function() /**String*/
  {
    return "{{VERSION}}";
  },

  /**
   * Returns source code revision this AutoProxy build was created from (if available)
   */
  getInstalledBuild: function() /**String*/
  {
    return "{{BUILD}}";
  },

  //
  // Custom methods
  //

  /**
   * Will be set to true if init() was called already.
   * @type Boolean
   */
  initialized: false,

  /**
   * Version comparator instance.
   * @type nsIVersionComparator
   */
  versionComparator: versionComparator,

  /**
   * Initializes the component, called on application startup.
   */
  init: function()
  {
    timeLine.enter("Entered aup.init()");

    if (this.initialized)
      return;
    this.initialized = true;

    timeLine.log("calling prefs.init()");
    prefs.init();

    timeLine.log("calling filterListener.init()");
    filterListener.init();

    timeLine.log("calling proxy.init()");
    proxy.init();

    timeLine.log("calling filterStorage.init()");
    filterStorage.init();

    timeLine.log("calling policy.init()");
    policy.init();

    timeLine.log("calling synchronizer.init()");
    synchronizer.init();

    timeLine.leave("aup.init() done");
  },

  /**
   * Saves all unsaved changes, called on application shutdown.
   */
  shutdown: function()
  {
    filterStorage.saveToDisk();
  },

  /**
   * Adds a new subscription to the list or changes the parameters of
   * an existing filter subscription.
   */
  addSubscription: function(/**String*/ url, /**String*/ title, /**Boolean*/ autoDownload, /**Boolean*/ disabled)
  {
    if (typeof autoDownload == "undefined")
      autoDownload = true;
    if (typeof disabled == "undefined")
      disabled = false;

    let subscription = Subscription.fromURL(url);
    if (!subscription)
      return;

    filterStorage.addSubscription(subscription);

    if (disabled != subscription.disabled)
    {
      subscription.disabled = disabled;
      filterStorage.triggerSubscriptionObservers(disabled ? "disable" : "enable", [subscription]);
    }

    subscription.title = title;
    if (subscription instanceof DownloadableSubscription)
      subscription.autoDownload = autoDownload;
    filterStorage.triggerSubscriptionObservers("updateinfo", [subscription]);

    if (subscription instanceof DownloadableSubscription && !subscription.lastDownload)
      synchronizer.execute(subscription);
    filterStorage.saveToDisk();
  },

  /**
   * Opens preferences dialog or focused already open dialog.
   * @param {String} location  (optional) filter suggestion
   * @param {Filter} filter    (optional) filter to be selected
   */
  openSettingsDialog: function(location, filter)
  {
    var dlg = windowMediator.getMostRecentWindow("aup:settings");
    var func = function()
    {
      if (typeof location == "string")
        dlg.setLocation(location);
      if (filter instanceof Filter)
        dlg.selectFilter(filter);
    }

    if (dlg)
    {
      func();

      try
      {
        dlg.focus();
      }
      catch (e)
      {
        // There must be some modal dialog open
        dlg = windowMediator.getMostRecentWindow("aup:subscription") || windowMediator.getMostRecentWindow("aup:about");
        if (dlg)
          dlg.focus();
      }
    }
    else
    {
      dlg = windowWatcher.openWindow(null, "chrome://autoproxy/content/ui/settings.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", null);
      dlg.addEventListener("post-load", func, false);
    }
  },

  /**
   * Opens a URL in the browser window. If browser window isn't passed as parameter,
   * this function attempts to find a browser window.
   */
  loadInBrowser: function(/**String*/ url, /**Window*/ currentWindow)
  {
    currentWindow = currentWindow ||
                    windowMediator.getMostRecentWindow("navigator:browser") ||
                    windowMediator.getMostRecentWindow("Songbird:Main") ||
                    windowMediator.getMostRecentWindow("emusic:window");
    let aupHooks = currentWindow ? currentWindow.document.getElementById("aup-hooks") : null;
    if (!aupHooks || !aupHooks.addTab || aupHooks.addTab(url) === false)
    {
      let protocolService = Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(Ci.nsIExternalProtocolService);
      protocolService.loadURI(makeURL(url), null);
    }
  },

  params: null,

  /**
   * Saves sidebar state before detaching/reattaching
   */
  setParams: function(params)
  {
    this.params = params;
  },

  /**
   * Retrieves and removes sidebar state after detaching/reattaching
   */
  getParams: function()
  {
    var ret = this.params;
    this.params = null;
    return ret;
  },

  headerParser: headerParser
};
aup.wrappedJSObject = aup;

/*
 * Module declaration
 */
function AUPComponent() {}
AUPComponent.prototype = aup;
if (XPCOMUtils.generateNSGetFactory)
    var NSGetFactory = XPCOMUtils.generateNSGetFactory([Initializer, AUPComponent]);
else
    var NSGetModule = XPCOMUtils.generateNSGetModule([Initializer, AUPComponent]);

/*
 * Loading additional files
 */
loader.loadSubScript('chrome://autoproxy/content/utils.js');
loader.loadSubScript('chrome://autoproxy/content/filterClasses.js');
loader.loadSubScript('chrome://autoproxy/content/subscriptionClasses.js');
loader.loadSubScript('chrome://autoproxy/content/filterStorage.js');
loader.loadSubScript('chrome://autoproxy/content/matcher.js');
loader.loadSubScript('chrome://autoproxy/content/filterListener.js');
loader.loadSubScript('chrome://autoproxy/content/proxy.js');
loader.loadSubScript('chrome://autoproxy/content/policy.js');
loader.loadSubScript('chrome://autoproxy/content/requests.js');
loader.loadSubScript('chrome://autoproxy/content/prefs.js');
loader.loadSubScript('chrome://autoproxy/content/synchronizer.js');

/*
 * Core Routines
 */

/**
 * Time logging module, used to measure startup time of AutoProxy (development builds only).
 * @class
 */
var timeLine = {
  _nestingCounter: 0,
  _lastTimeStamp: null,

  /**
   * Logs an event to console together with the time it took to get there.
   */
  log: function(/**String*/ message, /**Boolean*/ _forceDisplay)
  {
    if (!_forceDisplay && this._invocationCounter <= 0)
      return;

    let now = (new Date()).getTime();
    let diff = this._lastTimeStamp ? (now - this._lastTimeStamp) : "first event";
    this._lastTimeStamp = now;

    // Indent message depending on current nesting level
    for (let i = 0; i < this._nestingCounter; i++)
      message = "* " + message;

    // Pad message with spaces
    let padding = [];
    for (let i = message.toString().length; i < 40; i++)
      padding.push(" ");
    dump("AUP timeline: " + message + padding.join("") + "\t (" + diff + ")\n");
  },

  /**
   * Called to indicate that application entered a block that needs to be timed.
   */
  enter: function(/**String*/ message)
  {
    this.log(message, true);
    this._nestingCounter = (this._nestingCounter <= 0 ? 1 : this._nestingCounter + 1);
  },

  /**
   * Called when applicaiton exited a block that timeLine.enter() was called for.
   */
  leave: function(/**String*/ message)
  {
    this._nestingCounter--;
    this.log(message, true);

    if (this._nestingCounter <= 0)
      this._lastTimeStamp = null;
  }
};
