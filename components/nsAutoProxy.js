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
 *
 * ***** END LICENSE BLOCK ***** */

const aup_PACKAGE = "/autoproxy.mozdev.org"; 
const aup_EXTENSION_ID = "autoproxy@autoproxy.org";
const aup_CONTRACTID = "@mozilla.org/autoproxy;1";
const aup_CID = Components.ID("{7FCE727A-028D-11DE-9E0F-298E56D89593}");
const aup_PROT_CONTRACTID = "@mozilla.org/network/protocol;1?name=aup";
const aup_PROT_CID = Components.ID("{8A6417BC-028D-11DE-B190-998E56D89593}");
const locales = [
  "{{LOCALE}}",
  null
];

const loader = Components.classes["@mozilla.org/moz/jssubscript-loader;1"]
                         .getService(Components.interfaces.mozIJSSubScriptLoader);
const ioService = Components.classes["@mozilla.org/network/io-service;1"]
                            .getService(Components.interfaces.nsIIOService);

/*
 * Module object
 */

const module = {
  registerSelf: function(compMgr, fileSpec, location, type)
  {
    compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);
    compMgr.registerFactoryLocation(aup_CID, 
                    "AutoProxy content policy",
                    aup_CONTRACTID,
                    fileSpec, location, type);
    compMgr.registerFactoryLocation(aup_PROT_CID,
                    "aup protocol handler",
                    aup_PROT_CONTRACTID,
                    fileSpec, location, type);

    // Need to delete category before removing, nsIContentPolicies in Gecko 1.9 listens to
    // category changes
    var catman = Components.classes["@mozilla.org/categorymanager;1"]
                           .getService(Components.interfaces.nsICategoryManager);
    catman.deleteCategoryEntry("content-policy", aup_CONTRACTID, true);
    catman.addCategoryEntry("content-policy", aup_CONTRACTID,
              aup_CONTRACTID, true, true);
  },

  unregisterSelf: function(compMgr, fileSpec, location)
  {
    compMgr = compMgr.QueryInterface(Components.interfaces.nsIComponentRegistrar);

    compMgr.unregisterFactoryLocation(aup_CID, fileSpec);
    compMgr.unregisterFactoryLocation(aup_PROT_CID, fileSpec);
    var catman = Components.classes["@mozilla.org/categorymanager;1"]
                           .getService(Components.interfaces.nsICategoryManager);
    catman.deleteCategoryEntry("content-policy", aup_CONTRACTID, true);
  },

  getClassObject: function(compMgr, cid, iid)
  {
    if (!cid.equals(aup_CID) && !cid.equals(aup_PROT_CID))
      throw Components.results.NS_ERROR_NO_INTERFACE;

    if (!iid.equals(Components.interfaces.nsIFactory))
      throw Components.results.NS_ERROR_NOT_IMPLEMENTED;

    return factory;
  },

  canUnload: function(compMgr)
  {
    return true;
  }
};

function NSGetModule(comMgr, fileSpec)
{
  return module;
}

/*
 * Factory object
 */

var initialized = false;
const factory = {
  // nsIFactory interface implementation
  createInstance: function(outer, iid)
  {
    if (outer != null)
      throw Components.results.NS_ERROR_NO_AGGREGATION;

    if (!initialized)
      init();

    return aup.QueryInterface(iid);
  },

  // nsISupports interface implementation
  QueryInterface: function(iid)
  {
    if (iid.equals(Components.interfaces.nsISupports) ||
        iid.equals(Components.interfaces.nsIFactory))
      return this;

    if (!iid.equals(Components.interfaces.nsIClassInfo))
      dump("AutoProxy: factory.QI to an unknown interface: " + iid + "\n");

    throw Components.results.NS_ERROR_NO_INTERFACE;
  }
}

/*
 * Constants / Globals
 */

const Node = Components.interfaces.nsIDOMNode;
const Element = Components.interfaces.nsIDOMElement;
const Window = Components.interfaces.nsIDOMWindow;
const ImageLoadingContent = Components.interfaces.nsIImageLoadingContent;

var windowMediator = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                               .getService(Components.interfaces.nsIWindowMediator);
var windowWatcher= Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                             .getService(Components.interfaces.nsIWindowWatcher);
try
{
  var headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                               .getService(Components.interfaces.nsIMsgHeaderParser);
}
catch(e)
{
  headerParser = null;
}

/*
 * Content policy class definition
 */

const aup =
{
  //
  // nsISupports interface implementation
  //

  QueryInterface: function(iid)
  {
    if (iid.equals(Components.interfaces.nsIContentPolicy))
      return policy;

    if (iid.equals(Components.interfaces.nsIProtocolHandler))
      return protocol;

    if (iid.equals(Components.interfaces.nsISupports))
      return this;

    if (!iid.equals(Components.interfaces.nsIClassInfo) &&
        !iid.equals(Components.interfaces.nsISecurityCheckedComponent) &&
        !iid.equals(Components.interfaces.nsIDOMWindow))
      dump("AutoProxy: aup.QI to an unknown interface: " + iid + "\n");

    throw Components.results.NS_ERROR_NO_INTERFACE;
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

  //
  // Custom methods
  //

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
      dlg = windowWatcher.openWindow(null, "chrome://autoproxy/content/settings.xul", "_blank", "chrome,centerscreen,resizable,dialog=no", null);
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
    function tryWindowMethod(method, parameters)
    {
      let obj = currentWindow;
      if (currentWindow && /^browser\.(.*)/.test(method))
      {
        method = RegExp.$1;
        obj = aup.getBrowserInWindow(currentWindow);
      }

      if (!obj)
        return false;

      try
      {
        obj[method].apply(obj, parameters);
      }
      catch(e)
      {
        return false;
      }

      try
      {
        currentWindow.focus();
      } catch(e) {}
      return true;
    }

    if (tryWindowMethod("delayedOpenTab", [url]))
      return;
    if (tryWindowMethod("browser.addTab", [url, null, null, true]))
      return;
    if (tryWindowMethod("openUILinkIn", [url, "tab"]))
      return;
    if (tryWindowMethod("loadURI", [url]))
      return;

    var protocolService = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"]
                                    .getService(Components.interfaces.nsIExternalProtocolService);
    protocolService.loadURI(makeURL(url), null);
  },

  /**
   * Retrieves the browser/tabbrowser element for the specified window (might return null).
   */
  getBrowserInWindow: function(/**Window*/ window)  /**Element*/
  {
    if ("getBrowser" in window)
      return window.getBrowser();
    else if ("messageContent" in window)
      return window.messageContent;
    else
      return window.document.getElementById("frame_main_pane") || window.document.getElementById("browser_content");
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
 * Core Routines
 */

// Initialization and registration
function init()
{
  initialized = true;
  timeLine.log("init() called");

  if ("nsIChromeRegistrySea" in Components.interfaces)
  {
    // Autoregister chrome in SeaMonkey
    var registry = Components.classes["@mozilla.org/chrome/chrome-registry;1"]
                             .getService(Components.interfaces.nsIChromeRegistrySea);

    try
    {
      registry.installPackage("jar:resource:/chrome/autoproxy.jar!/content/", false);
    } catch(e) {}

    try
    {
      registry.installSkin("jar:resource:/chrome/autoproxy.jar!/skin/classic/", false, true);
    } catch(e) {}

    for (var i = 0; i < locales.length; i++)
    {
      if (!locales[i])
        continue;

      try
      {
        registry.installLocale("jar:resource:/chrome/autoproxy.jar!/locale/" + locales[i] + "/", false);
      } catch(e) {}
    }
  }

  aup.versionComparator = Components.classes["@mozilla.org/xpcom/version-comparator;1"]
                                    .createInstance(Components.interfaces.nsIVersionComparator);

  loader.loadSubScript('chrome://autoproxy/content/utils.js');
  loader.loadSubScript('chrome://autoproxy/content/filterClasses.js');
  loader.loadSubScript('chrome://autoproxy/content/subscriptionClasses.js');
  loader.loadSubScript('chrome://autoproxy/content/filterStorage.js');
  loader.loadSubScript('chrome://autoproxy/content/matcher.js');
  loader.loadSubScript('chrome://autoproxy/content/filterListener.js');
  loader.loadSubScript('chrome://autoproxy/content/protocol.js');
  loader.loadSubScript('chrome://autoproxy/content/policy.js');
  loader.loadSubScript('chrome://autoproxy/content/data.js');
  loader.loadSubScript('chrome://autoproxy/content/prefs.js');
  loader.loadSubScript('chrome://autoproxy/content/synchronizer.js');
  loader.loadSubScript('chrome://autoproxy/content/flasher.js');
  
  timeLine.log("init() done");
}

// Try to fix selected locale (SeaMonkey doesn't do it correctly)
function fixPackageLocale()
{
  try
  {
    var locale = "en-US";
    try
    {
      var branch = Components.classes["@mozilla.org/preferences-service;1"]
                             .getService(Components.interfaces.nsIPrefBranch);
      try
      {
        var complex = branch.getComplexValue("general.useragent.locale", Components.interfaces.nsIPrefLocalizedString);
        locale = complex.data;
      }
      catch (e)
      {
        locale = branch.getCharPref("general.useragent.locale");
      }
    } catch (e) {}

    var select = null;
    for (var i = 0; i < locales.length; i++)
    {
      if (!locales[i])
        continue;

      if (locales[i] == locale)
      {
        select = locales[i];
        break;
      }

      if (locales[i].substr(0, 2) == locale.substr(0, 2))
        select = locales[i];
    }
    if (!select)
      select = locales[0];

    var registry = Components.classes["@mozilla.org/chrome/chrome-registry;1"]
                             .getService(Components.interfaces.nsIChromeRegistrySea);
    registry.selectLocaleForPackage(select, "autoproxy", true);
  } catch(e) {}
}

/**
 * Time logging module, used to measure startup time of AutoProxy (development builds only).
 * @class
 */
var timeLine = {
  _lastTimeStamp: null,

  /**
   * Logs an event to console together with the time it took to get there.
   */
  log: function(/**String*/ msg)
  {
    let now = (new Date()).getTime();
    let diff = this._lastTimeStamp ? (now - this._lastTimeStamp) : "first event";
    this._lastTimeStamp = now;
    
    let padding = [];
    for (var i = msg.toString().length; i < 40; i++)
      padding.push(" ");
    dump("aup timeline: " + msg + padding.join("") + "\t (" + diff + ")\n");
  }
};
