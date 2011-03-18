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
 * Portions created by the Initial Developer are Copyright (C) 2006-2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 * 2011: Wang Congming <lovelywcm@gmail.com> Modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Definition of Subscription class and its subclasses.
 * This file is included from AutoProxy.js.
 */

/**
 * Abstract base class for filter subscriptions
 *
 * @param {String} url    download location of the subscription
 * @param {String} title  title of the subscription
 * @param {Integer} proxy  which proxy should be used for this subscription,
 *              -1 means default proxy, others see aup.proxy.server.
 * @constructor
 */
function Subscription(url, title, proxy)
{
  this.url = url;
  this.title = title;
  this.proxy = (proxy === "") ? -1 : proxy;
  this.filters = [];
  Subscription.knownSubscriptions[url] = this;
}
Subscription.prototype =
{
  title: null,

  url: null,

  proxy: 0,

  /**
   * Filters contained in the filter subscription
   * @type Array of Filter
   */
  filters: null,

  /**
   * Defines whether the filters in the subscription should be disabled
   * @type Boolean
   */
  disabled: false,

  /**
   * Serializes the filter to an array of strings for writing out on the disk.
   * @param {Array of String} buffer  buffer to push the serialization results into
   */
  serialize: function(buffer)
  {
    buffer.push("[Subscription]");
    buffer.push("url=" + this.url);
    buffer.push("proxy=" + this.proxy);
    if (this.title)
      buffer.push("title=" + this.title);
    if (this.disabled)
      buffer.push("disabled=true");
  },

  serializeFilters: function(buffer)
  {
    for each (let filter in this.filters)
      buffer.push(filter.text.replace(/\[/g, "\\["));
  },

  toString: function()
  {
    let buffer = [];
    this.serialize(buffer);
    return buffer.join("\n");
  },

  get typeDesc()
  {
    return aup.getString(this._typeDescId);
  },

  set typeDesc()
  {
  }
};
aup.Subscription = Subscription;

/**
 * Cache for known filter subscriptions, maps URL to subscription objects.
 * @type Object
 */
Subscription.knownSubscriptions = {__proto__: null};

/**
 * Returns a subscription from its URL, creates a new one if necessary.
 * @param {String} url  URL of the subscription
 * @return {Subscription} subscription or null if the subscription couldn't be created
 */
Subscription.fromURL = function(url)
{
  if (url in Subscription.knownSubscriptions)
    return Subscription.knownSubscriptions[url];

  if (/^~fl\d*~$/.test(url))
    return new SpecialSubscription(url);
  else
  {
    try
    {
      // Test URL for validity
      url = ioService.newURI(url, null, null).spec;
      return new DownloadableSubscription(url, null);
    }
    catch (e)
    {
      return null;
    }
  }
}

/**
 * Deserializes a subscription
 *
 * @param {Object}  obj map of serialized properties and their values
 * @return {Subscription} subscription or null if the subscription couldn't be created
 */
Subscription.fromObject = function(obj)
{
  let result;
  if (/^~fl\d*~$/.test(obj.url))
    result = new SpecialSubscription(obj.url, obj.title, obj.proxy);
  else
  {
    if ("external" in obj && obj.external == "true")
      result = new ExternalSubscription(obj.url, obj.title, obj.proxy);
    else
    {
      try
      {
        // Test URL for validity
        obj.url = ioService.newURI(obj.url, null, null).spec;
      }
      catch (e)
      {
        return null;
      }

      result = new DownloadableSubscription(obj.url, obj.title, obj.proxy);
      if ("autoDownload" in obj)
        result.autoDownload = (obj.autoDownload == "true");
      if ("nextURL" in obj)
        result.nextURL = obj.nextURL;
      if ("downloadStatus" in obj)
        result.downloadStatus = obj.downloadStatus;
      if ("lastModified" in obj)
        result.lastModified = obj.lastModified;
      if ("expires" in obj)
        result.expires = parseInt(obj.expires) || 0;
      if ("errors" in obj)
        result.errors = parseInt(obj.errors) || 0;
      if ("requiredVersion" in obj)
      {
        result.requiredVersion = obj.requiredVersion;
        if (aup.versionComparator.compare(result.requiredVersion, aup.getInstalledVersion()) > 0)
          result.upgradeRequired = true;
      }
    }
    if ("lastDownload" in obj)
      result.lastDownload = parseInt(obj.lastDownload) || 0;
  }
  if ("disabled" in obj)
    result.disabled = (obj.disabled == "true");

  return result;
}

/**
 * "SpecialSubscription" means "user custom rule group", keep name for historical reason
 *
 * Large changes (compare to ABP) here for multi-proxies support.
 * Blocking/Whitelist special filter group is no longer exists,
 *   all types of filters can be included in one group, and user can create multiple groups.
 * More like a regular subscription now.
 */
function SpecialSubscription(url, title, proxy)
{
  Subscription.call(this, url || this.makeNewSpecialUrl(), title, proxy);
}
SpecialSubscription.prototype =
{
  __proto__: Subscription.prototype,

  _typeDescId: "customRuleGroup_description",

  makeNewSpecialUrl: function()
  {
    var newUrl = "~fl" + Math.floor(Math.random()*100) + "~";
    return Subscription.knownSubscriptions[newUrl] ? this.makeNewSpecialUrl() : newUrl;
  }
};
aup.SpecialSubscription = SpecialSubscription;

/**
 * Abstract base class for regular filter subscriptions (both internally and externally updated)
 * @param {String} url    see Subscription()
 * @param {String} title  (optional) title of the filter subscription
 * @constructor
 * @augments Subscription
 */
function RegularSubscription(url, title, proxy)
{
  Subscription.call(this, url, title, proxy);
}
RegularSubscription.prototype =
{
  __proto__: Subscription.prototype,

  _typeDescId: "subscription_description",

  /**
   * Time of the last subscription download (in milliseconds since the beginning of the epoch)
   * @type Number
   */
  lastDownload: 0,

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    Subscription.prototype.serialize.call(this, buffer);
    if (this.lastDownload)
      buffer.push("lastDownload=" + this.lastDownload);
  }
};
aup.RegularSubscription = RegularSubscription;

/**
 * Class for filter subscriptions updated by externally (by other extension)
 * @param {String} url    see Subscription()
 * @param {String} title  see RegularSubscription()
 * @constructor
 * @augments RegularSubscription
 */
function ExternalSubscription(url, title, proxy)
{
  RegularSubscription.call(this, url, title, proxy);
}
ExternalSubscription.prototype =
{
  __proto__: RegularSubscription.prototype,

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    RegularSubscription.prototype.serialize.call(this, buffer);
    buffer.push("external=true");
  }
};
aup.ExternalSubscription = ExternalSubscription;

/**
 * Class for filter subscriptions updated by externally (by other extension)
 * @param {String} url    see Subscription()
 * @param {String} title  see RegularSubscription()
 * @constructor
 * @augments RegularSubscription
 */
function DownloadableSubscription(url, title, proxy)
{
  RegularSubscription.call(this, url, title, proxy);
}
DownloadableSubscription.prototype =
{
  __proto__: RegularSubscription.prototype,

  /**
   * Defines whether the subscription should be downloaded automatically
   * @type Boolean
   */
  autoDownload: true,

  /**
   * Next URL the downloaded should be attempted from (in case of redirects)
   * @type String
   */
  nextURL: null,

  /**
   * Status of the last download (ID of a string)
   * @type String
   */
  downloadStatus: null,

  /**
   * Value of the Last-Modified header returned by the server on last download
   * @type String
   */
  lastModified: null,

  /**
   * Expiration time of the filter subscription (in milliseconds since the beginning of the epoch)
   * @type Number
   */
  expires: 0,

  /**
   * Number of download failures since last success
   * @type Number
   */
  errors: 0,

  /**
   * Minimal AutoProxy version required for this subscription
   * @type String
   */
  requiredVersion: null,

  /**
   * Should be true if requiredVersion is higher than current AutoProxy version
   * @type Boolean
   */
  upgradeRequired: false,

  /**
   * See Subscription.serialize()
   */
  serialize: function(buffer)
  {
    RegularSubscription.prototype.serialize.call(this, buffer);
    if (!this.autoDownload)
      buffer.push("autoDownload=false");
    if (this.nextURL)
      buffer.push("nextURL=" + this.nextURL);
    if (this.downloadStatus)
      buffer.push("downloadStatus=" + this.downloadStatus);
    if (this.lastModified)
      buffer.push("lastModified=" + this.lastModified);
    if (this.expires)
      buffer.push("expires=" + this.expires);
    if (this.errors)
      buffer.push("errors=" + this.errors);
    if (this.requiredVersion)
      buffer.push("requiredVersion=" + this.requiredVersion);
  }
};
aup.DownloadableSubscription = DownloadableSubscription;
