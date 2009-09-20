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
 * Wang Congming <lovelywcm@gmail.com> Modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Content policy implementation, responsible for proxying things.
 * This file is included from AutoProxy.js.
 */

var effectiveTLD = Cc["@mozilla.org/network/effective-tld-service;1"].getService(Ci.nsIEffectiveTLDService);

const ok = Ci.nsIContentPolicy.ACCEPT;

var policy =
{
  /**
   * Map of content type identifiers by their name.
   * @type Object
   */
  type: null,

  /**
   * Map of content type names by their identifiers (reverse of type map).
   * @type Object
   */
  typeDescr: null,

  /**
   * Map of localized content type names by their identifiers.
   * @type Object
   */
  localizedDescr: null,

  /**
   * Map containing all schemes that can be proxyed.
   * @type Object
   */
  proxyableSchemes: null,

  /**
   * nsIProxyInfo
   */
  defaultProxy: null,

  shouldProxy: function(){},

  /**
   * Assigned in shouldLoad() & used by autoMatching().
   * Since autoMatching is called by applyFilter,
   * but we can't get such information within applyFilter(?).
   *
   * TODO: shouldLoad won't be called for 30x redirection and extentions' http
   * requests, error (Wnd/Node/... won't be refreshed) in these two situations
   * though it's not so serious.
   */
  Wnd: null,
  Node: null,
  ContentType: "",

  //
  // nsIProtocolProxyFilter implementation
  //
  applyFilter: function(pS, uri, proxy)
  {
    if ( !uri.schemeIs("feed") && this.shouldProxy(uri) ) return this.defaultProxy;
    return pS.newProxyInfo("direct", "", -1, 0, 0, null);
  },

  init: function()
  {
    var types = ["OTHER", "SCRIPT", "IMAGE", "STYLESHEET", "OBJECT", "SUBDOCUMENT",
      "DOCUMENT", "XBL", "PING", "XMLHTTPREQUEST", "OBJECT_SUBREQUEST", "DTD", "FONT", "MEDIA"];

    // type constant by type description and type description by type constant
    this.type = {};
    this.typeDescr = {};
    this.localizedDescr = {};
    var iface = Ci.nsIContentPolicy;
    for each (let typeName in types)
    {
      if ("TYPE_" + typeName in iface)
      {
        this.type[typeName] = iface["TYPE_" + typeName];
        this.typeDescr[this.type[typeName]] = typeName;
        this.localizedDescr[this.type[typeName]] = aup.getString("type_label_" + typeName.toLowerCase());
      }
    }

    this.type.BACKGROUND = 0xFFFE;
    this.typeDescr[0xFFFE] = "BACKGROUND";
    this.localizedDescr[0xFFFE] = aup.getString("type_label_background");

    // Proxyable URL schemes
    this.proxyableSchemes = {};
    for each (var scheme in prefs.proxyableSchemes.toLowerCase().split(" "))
      this.proxyableSchemes[scheme] = true;
  },

  /**
   * Checks whether a node should be proxyed according to rules
   * @param wnd {nsIDOMWindow}
   * @param node {nsIDOMElement}
   * @param contentType {String}
   * @param location {nsIURI}
   * @return {Boolean} true if the node should be proxyed
   */
  autoMatching: function(location) {
    var match=null, wnd=this.Wnd, node=this.Node, contentType=this.ContentType;
    var locationText = location.spec;

    // Data loaded by plugins should be attached to the document
    if ((contentType == this.type.OTHER || contentType == this.type.OBJECT_SUBREQUEST) && node instanceof Element)
      node = node.ownerDocument;

    // Fix type for background images
    if (contentType == this.type.IMAGE && node.nodeType == Node.DOCUMENT_NODE)
      contentType = this.type.BACKGROUND;

    // Fix type for objects misrepresented as frames or images
    if (contentType != this.type.OBJECT && (node instanceof Ci.nsIDOMHTMLObjectElement ||
                                            node instanceof Ci.nsIDOMHTMLEmbedElement ))
      contentType = this.type.OBJECT;

    var data = DataContainer.getDataForWindow(wnd);

    let docDomain = this.getHostname(wnd.location.href);
    let thirdParty = this.isThirdParty(location, docDomain);

    match = whitelistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);
    if (match == null)
      match = blacklistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);

    // Store node data
    var nodeData = data.addNode(wnd.top, node, contentType, docDomain, thirdParty, locationText, match);
    if (match)
      filterStorage.increaseHitCount(match);

    return match && !(match instanceof WhitelistFilter);
  },

  /**
   * Checks whether the location's scheme is proxyable.
   * @param location  {nsIURI}
   * @return {Boolean}
   */
  isProxyableScheme: function(location) {
    return location.scheme in this.proxyableSchemes;
  },

  /**
   * Extracts the hostname from a URL (might return null).
   */
  getHostname: function(/**String*/ url) /**String*/
  {
    try
    {
      return unwrapURL(url).host;
    }
    catch(e)
    {
      return null;
    }
  },

  /**
   * Checks whether the location's origin is different from document's origin.
   */
  isThirdParty: function(/**nsIURI*/location, /**String*/ docDomain) /**Boolean*/
  {
    if (!location || !docDomain)
      return true;
    try
    {
      return effectiveTLD.getBaseDomain(location) != effectiveTLD.getBaseDomainFromHost(docDomain);
    }
    catch (e)
    {
      // EffectiveTLDService throws on IP addresses
      return location.host != docDomain;
    }
  },

  //
  // nsISupports interface implementation
  //

  QueryInterface: aup.QueryInterface,

  //
  // nsIContentPolicy interface implementation
  //
  shouldLoad: function(contentType, location, requestOrigin, node, mimeTypeGuess, extra) {
    if ( this.isProxyableScheme(location) ) {
      var wnd = getWindow(node);

      // Interpret unknown types as "other"
      if ( !(contentType in this.typeDescr) ) contentType = this.type.OTHER;

      this.Wnd = wnd;
      this.Node = node;
      this.ContentType = contentType;
    }

    return ok;
  },

  //
  // nsIChannelEventSink interface implementation
  //
  onChannelRedirect: function(oldChannel, newChannel, flags)
  {
    return;
 /*
    try {
      let oldLocation = null;
      let newLocation = null;
      try {
        oldLocation = oldChannel.originalURI.spec;
        newLocation = newChannel.URI.spec;
      }
      catch(e2) {}

      if (!oldLocation || !newLocation || oldLocation == newLocation)
        return;

      // Look for the request both in the origin window and in its parent (for frames)
      let contexts = [getRequestWindow(newChannel)];
      if (!contexts[0])
        contexts.pop();
      else if (contexts[0] && contexts[0].parent != contexts[0])
        contexts.push(contexts[0].parent);

      let info = null;
      for each (let context in contexts)
      {
        // Did we record the original request in its own window?
        let data = DataContainer.getDataForWindow(context, true);
        if (data)
          info = data.getURLInfo(oldLocation);

        if (info)
        {
          let node = (info.nodes.length ? info.nodes[info.nodes.length - 1] : context.document);
          // HACK: NS_BINDING_ABORTED would be proper error code to throw but this will show up in error console (bug 287107)
          if (!this.processNode(context, node, info.type, newChannel.URI))
            throw Cr.NS_BASE_STREAM_WOULD_BLOCK;
          else
            return;
        }
      }
    }
    catch (e if (e != Cr.NS_BASE_STREAM_WOULD_BLOCK))
    {
      // We shouldn't throw exceptions here - this will prevent the redirect.
      dump("AutoProxy: Unexpected error in policy.onChannelRedirect: " + e + "\n");
    }
*/
  },



/*
  below 2 functions can be removed after removing of composer
*/

  // Reapplies filters to all nodes of the window
  refilterWindowInternal: function(wnd, start) {
    if (wnd.closed)
      return;

    var wndData = aup.getDataForWindow(wnd);
    var data = wndData.getAllLocations();
    for (var i = start; i < data.length; i++) {
      if (i - start >= 20) {
        // Allow events to process
        createTimer(function() {policy.refilterWindowInternal(wnd, i);}, 0);
        return;
      }

      if (!data[i].filter || data[i].filter instanceof WhitelistFilter) {
        var nodes = data[i].nodes;
        data[i].nodes = [];
        for (var j = 0; j < nodes.length; j++) {
          //this.shouldProxy(wnd, nodes[j], data[i].type, makeURL(data[i].location));
        }
      }
    }

    aup.DataContainer.notifyListeners(wnd, "invalidate", data);
  },

  // Calls refilterWindowInternal delayed to allow events to process
  refilterWindow: function(wnd) {
    createTimer(function() {policy.refilterWindowInternal(wnd, 0);}, 0);
  }
};

aup.policy = policy;
