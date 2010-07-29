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
 * 2009-2010: Wang Congming <lovelywcm@gmail.com> Modified for AutoProxy.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Content policy implementation.
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

  shouldProxy: function(){},

  /**
   * Assigned in shouldLoad() & used by autoMatching().
   * Since autoMatching is called by applyFilter,
   * but we can't get such information within applyFilter(?).
   */
  Wnd: null,        // nsIDOMWindow
  Node: null,       // nsIDOMElement
  ContentType: "",  // String
  ContentURI: null, // nsIURI

  init: function() {
    var types = ["OTHER", "SCRIPT", "IMAGE", "STYLESHEET", "OBJECT", "SUBDOCUMENT", "DOCUMENT", "XBL", "PING", "XMLHTTPREQUEST", "OBJECT_SUBREQUEST", "DTD", "FONT", "MEDIA"];

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
  },

  /**
   * Checks whether a node should be proxyed according to rules
   * @param location {nsIURI}
   * @return {Boolean} true if the node should be proxyed
   */
  autoMatching: function(location) {
    var match = null, docDomain = "extension", thirdParty = false, contentType = 3;
    var wnd, node, locationText = location.spec;

    if ( location == this.ContentURI ) {
      wnd = this.Wnd; node = this.Node; contentType = this.ContentType;

      // Data loaded by plugins should be attached to the document
      if ((contentType == this.type.OTHER || contentType == this.type.OBJECT_SUBREQUEST) && node instanceof Element)
        node = node.ownerDocument;

      // Fix type for background images
      if (contentType == this.type.IMAGE && node.nodeType == Node.DOCUMENT_NODE)
        contentType = this.type.BACKGROUND;

      // Fix type for objects misrepresented as frames or images
      if (contentType != this.type.OBJECT && (node instanceof Ci.nsIDOMHTMLObjectElement || node instanceof Ci.nsIDOMHTMLEmbedElement))
        contentType = this.type.OBJECT;

      docDomain = this.getHostname(wnd.location.href);
      thirdParty = this.isThirdParty(location, docDomain);
    }

    match = whitelistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);
    if (match == null)
      match = blacklistMatcher.matchesAny(locationText, this.typeDescr[contentType] || "", docDomain, thirdParty);

    // Store node data.
    // Skip this step if the request is established by a Firefox extension
    //   * no sidebar window can be used to display extension's http request;
    //   * shouldLoad() doesn't check extension's request, any way to do this?
    //     * just like onChannelRedirect() did for 301/302 redirection.
    if (location == this.ContentURI) {
      var data = RequestList.getDataForWindow(wnd);
      data.addNode(node, contentType, docDomain, thirdParty, locationText, match);
    }

    if (match&&arguments.length==1)
      filterStorage.increaseHitCount(match);

    return match && !(match instanceof WhitelistFilter);
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
      // EffectiveTLDService throws on IP addresses, just compare the host name
      let host = "";
      try
      {
        host = location.host;
      } catch (e) {}
      return host != docDomain;
    }
  },

  //
  // nsISupports interface implementation
  //

  QueryInterface: aup.QueryInterface,

  //
  // nsIContentPolicy interface implementation
  //
  shouldLoad: function(contentType, contentLocation, requestOrigin, node, mimeTypeGuess, extra)
  {
    if ( proxy.isProxyableScheme(contentLocation) ) {
      // Interpret unknown types as "other"
      if (!(contentType in this.typeDescr))
        contentType = this.type.OTHER;

      this.Wnd = getWindow(node);
      this.Node = node;
      this.ContentType = contentType;
      this.ContentURI = unwrapURL(contentLocation);
    }
    return ok;
  },

  shouldProcess: function(contentType, contentLocation, requestOrigin, insecNode, mimeType, extra)
  {
    return ok;
  },

  //
  // nsIChannelEventSink interface implementation
  //
  onChannelRedirect: function(oldChannel, newChannel, flags)
  {
    try {
      // Look for the request both in the origin window and in its parent (for frames)
      let contexts = [getRequestWindow(newChannel)];
      if (!contexts[0])
        contexts.pop();
      else if (contexts[0] && contexts[0].parent != contexts[0])
        contexts.push(contexts[0].parent);
      else if (contexts[0] && contexts[0].parent == contexts[0])
      {
          contexts.push(Cc["@mozilla.org/appshell/window-mediator;1"]
                  .getService(Ci.nsIWindowMediator)
                  .getMostRecentWindow("navigator:browser"));          
          contexts.shift();
      }

      let info = null;
      for each (let context in contexts)
      {
        // Did we record the original request in its own window?
        let data = RequestList.getDataForWindow(context, true);
        if (data)
          info = data.getURLInfo(oldChannel.originalURI.spec);

        if (info)
        {
          let nodes = info.nodes;
          let node = (nodes.length > 0 ? nodes[nodes.length - 1] : context.document);

          this.Wnd = context;
          this.Node = node;
          this.ContentType = info.type;
          this.ContentURI = newChannel.URI;

          this.autoMatching(newChannel.URI,true);
          return;
        }
      }
    }
    catch (e if (e != Cr.NS_BASE_STREAM_WOULD_BLOCK))
    {
      // We shouldn't throw exceptions here - this will prevent the redirect.
      dump("AutoProxy: Unexpected error in policy.onChannelRedirect: " + e + "\n");
    }
  }
};

aup.policy = policy;
