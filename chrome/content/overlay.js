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
 * Portions created by the Initial Developer are Copyright (C) 2006-2008
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

var aup = null;
try {
  aup = Components.classes["@mozilla.org/adblockplus;1"].createInstance().wrappedJSObject;

  if (!aup.prefs.initialized)
    aup = null;
} catch (e) {}

var aupPrefs = aup ? aup.prefs : {enabled: false};
var aupDetachedSidebar = null;
var aupOldShowInToolbar = aupPrefs.showintoolbar;
var aupHideImageManager;

window.addEventListener("load", aupInit, false);

function aupInit() {
  window.addEventListener("unload", aupUnload, false);

  // Process preferences
  aupReloadPrefs();
  if (aup) {
    aupPrefs.addListener(aupReloadPrefs);

    // Make sure whitelisting gets displayed after at most 2 seconds
    setInterval(aupReloadPrefs, 2000);
    aupGetBrowser().addEventListener("select", aupReloadPrefs, false); 

    // Make sure we always configure keys but don't let them break anything
    try {
      // Configure keys
      for (var key in aupPrefs)
        if (key.match(/(.*)_key$/))
          aupConfigureKey(RegExp.$1, aupPrefs[key]);
    } catch(e) {}
  }

  // Install context menu handler
  var contextMenu = document.getElementById("contentAreaContextMenu") || document.getElementById("messagePaneContext") || document.getElementById("popup_content");
  if (contextMenu) {
    contextMenu.addEventListener("popupshowing", aupCheckContext, false);
  
    // Make sure our context menu items are at the bottom
    contextMenu.appendChild(document.getElementById("aup-frame-menuitem"));
    contextMenu.appendChild(document.getElementById("aup-object-menuitem"));
    contextMenu.appendChild(document.getElementById("aup-image-menuitem"));
  }

  // First run actions
  if (aup && !("doneFirstRunActions" in aupPrefs) && aup.versionComparator.compare(aupPrefs.lastVersion, "0.0") <= 0)
  {
    // Don't repeat first run actions if new window is opened
    aupPrefs.doneFirstRunActions = true;

    // Add aup icon to toolbar if necessary
    setTimeout(aupInstallInToolbar, 0);

    // Show subscriptions dialog if the user doesn't have any subscriptions yet
    setTimeout(aupShowSubscriptions, 0);
  }

  // Move toolbar button to a correct location in Mozilla/SeaMonkey
  var button = document.getElementById("aup-toolbarbutton");
  if (button && button.parentNode.id == "nav-bar-buttons") {
    var ptf = document.getElementById("bookmarks-ptf");
    ptf.parentNode.insertBefore(button, ptf);
  }

  // Copy the menu from status bar icon to the toolbar
  var fixId = function(node) {
    if (node.nodeType != Node.ELEMENT_NODE)
      return node;

    if ("id" in node && node.id)
      node.id = node.id.replace(/aup-status/, "aup-toolbar");

    for (var child = node.firstChild; child; child = child.nextSibling)
      fixId(child);

    return node;
  };
  var copyMenu = function(to) {
    if (!to || !to.firstChild)
      return;

    to = to.firstChild;
    var from = document.getElementById("aup-status-popup");
    for (var node = from.firstChild; node; node = node.nextSibling)
      to.appendChild(fixId(node.cloneNode(true)));
  };
  copyMenu(document.getElementById("aup-toolbarbutton"));
  copyMenu(aupGetPaletteButton());

  setTimeout(aupInitImageManagerHiding, 0);
}

function aupUnload() {
  aupPrefs.removeListener(aupReloadPrefs);
  aupGetBrowser().removeEventListener("select", aupReloadPrefs, false); 
}

function aupGetBrowser() {
  if ("getBrowser" in window)
    return getBrowser();
  else if ("messageContent" in window)
    return window.messageContent;
  else
    return document.getElementById("frame_main_pane") || document.getElementById("browser_content");
}

function aupReloadPrefs() {
  var label;
  var state = null;
  if (aup) {
    if (aupPrefs.enabled)
      state = "active";
    else
      state = "disabled";

    label = aup.getString("status_" + state + "_label");

    if (state == "active")
    {
      let location = null;
      if ("currentHeaderData" in window && "content-base" in currentHeaderData)
      {
        // Thunderbird blog entry
        location = currentHeaderData["content-base"].headerValue;
      }
      else if ("gDBView" in window)
      {
        // Thunderbird mail/newsgroup entry
        try
        {
          var msgHdr = gDBView.hdrForFirstSelectedMessage;
          var headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                                      .getService(Components.interfaces.nsIMsgHeaderParser);
          var emailAddress = headerParser.extractHeaderAddressMailboxes(null, msgHdr.author);
          if (emailAddress)
            location = 'mailto:' + emailAddress.replace(/^[\s"]+/, "").replace(/[\s"]+$/, "").replace(' ', '%20');
        }
        catch(e) {}
      }
      else
      {
        // Firefox web page
        location = aupGetBrowser().contentWindow.location.href;
      }

      if (location && aup.policy.isWhitelisted(location))
        state = "whitelisted";
    }
  }

  var tooltip = document.getElementById("aup-tooltip");
  if (state && tooltip)
    tooltip.setAttribute("curstate", state);

  var updateElement = function(element) {
    if (!element)
      return;

    if (aup) {
      element.removeAttribute("disabled");

      if (element.tagName == "statusbarpanel" || element.tagName == "vbox") {
        element.hidden = !aupPrefs.showinstatusbar;

        var labelElement = element.getElementsByTagName("label")[0];
        labelElement.setAttribute("value", label);
      }
      else
        element.hidden = !aupPrefs.showintoolbar;

      // HACKHACK: Show status bar icon in SeaMonkey Mail and Prism instead of toolbar icon
      if (element.hidden && (element.tagName == "statusbarpanel" || element.tagName == "vbox") && (document.getElementById("msgToolbar") || location.host == "webrunner"))
        element.hidden = !aupPrefs.showintoolbar;

      if (aupOldShowInToolbar != aupPrefs.showintoolbar)
        aupInstallInToolbar();

      aupOldShowInToolbar = aupPrefs.showintoolbar;
    }

    element.removeAttribute("deactivated");
    element.removeAttribute("whitelisted");
    if (state == "whitelisted")
      element.setAttribute("whitelisted", "true");
    else if (state == "disabled")
      element.setAttribute("deactivated", "true");
  };

  var status = document.getElementById("aup-status");
  updateElement(status);
  if (aupPrefs.defaultstatusbaraction == 0)
    status.setAttribute("popup", status.getAttribute("context"));
  else
    status.removeAttribute("popup");

  var button = document.getElementById("aup-toolbarbutton");
  updateElement(button);
  if (button) {
    if (button.hasAttribute("context") && aupPrefs.defaulttoolbaraction == 0)
    {
      button.setAttribute("popup", button.getAttribute("context"));
      button.removeAttribute("type");
    }
    else
      button.removeAttribute("popup");
  }

  updateElement(aupGetPaletteButton());
}

function aupInitImageManagerHiding() {
  if (!aup || typeof aupHideImageManager != "undefined")
    return;

  aupHideImageManager = false;
  if (aupPrefs.hideimagemanager && "@mozilla.org/permissionmanager;1" in Components.classes) {
    try {
      aupHideImageManager = true;
      var permissionManager = Components.classes["@mozilla.org/permissionmanager;1"]
                                        .getService(Components.interfaces.nsIPermissionManager);
      var enumerator = permissionManager.enumerator;
      while (aupHideImageManager && enumerator.hasMoreElements()) {
        var item = enumerator.getNext().QueryInterface(Components.interfaces.nsIPermission);
        if (item.type == "image" && item.capability == Components.interfaces.nsIPermissionManager.DENY_ACTION)
          aupHideImageManager = false;
      }
    } catch(e) {}
  }
}

function aupConfigureKey(key, value) {
  var valid = {
    accel: "accel",
    ctrl: "control",
    control: "control",
    shift: "shift",
    alt: "alt",
    meta: "meta"
  };

  var command = document.getElementById("aup-command-" + key);
  if (!command)
    return;

  var parts = value.split(/\s+/);
  var modifiers = [];
  var keychar = null;
  var keycode = null;
  for (var i = 0; i < parts.length; i++) {
    if (parts[i].toLowerCase() in valid)
      modifiers.push(parts[i].toLowerCase());
    else if (parts[i].length == 1)
      keychar = parts[i];
    else if ("DOM_VK_" + parts[i].toUpperCase() in Components.interfaces.nsIDOMKeyEvent)
      keycode = "VK_" + parts[i].toUpperCase();
  }

  if (keychar || keycode) {
    var element = document.createElement("key");
    element.setAttribute("id", "aup-key-" + key);
    element.setAttribute("command", "aup-command-" + key);
    if (keychar)
      element.setAttribute("key", keychar);
    else
      element.setAttribute("keycode", keycode);
    element.setAttribute("modifiers", modifiers.join(","));

    document.getElementById("aup-keyset").appendChild(element);
  }
}

// Finds the toolbar button in the toolbar palette
function aupGetPaletteButton() {
  var toolbox = document.getElementById("navigator-toolbox") || document.getElementById("mail-toolbox");
  if (!toolbox || !("palette" in toolbox) || !toolbox.palette)
    return null;

  for (var child = toolbox.palette.firstChild; child; child = child.nextSibling)
    if (child.id == "aup-toolbarbutton")
      return child;

  return null;
}

// Check whether we installed the toolbar button already
function aupInstallInToolbar() {
  if (!document.getElementById("aup-toolbarbutton")) {
    var insertBeforeBtn = null;
    var toolbar = document.getElementById("nav-bar");
    if (!toolbar) {
      insertBeforeBtn = "button-junk";
      toolbar = document.getElementById("mail-bar");
    }

    if (toolbar && "insertItem" in toolbar) {
      var insertBefore = (insertBeforeBtn ? document.getElementById(insertBeforeBtn) : null);
      if (insertBefore && insertBefore.parentNode != toolbar)
        insertBefore = null;

      toolbar.insertItem("aup-toolbarbutton", insertBefore, null, false);

      toolbar.setAttribute("currentset", toolbar.currentSet);
      document.persist(toolbar.id, "currentset");

      // HACKHACK: Make sure icon is added to both main window and message window in Thunderbird
      var override = null;
      if (window.location.href == "chrome://messenger/content/messenger.xul")
        override = "chrome://messenger/content/messageWindow.xul#mail-bar";
      else if (window.location.href == "chrome://messenger/content/messageWindow.xul")
        override = "chrome://messenger/content/messenger.xul#mail-bar";

      if (override) {
        try {
          var rdf = Components.classes["@mozilla.org/rdf/rdf-service;1"]
                              .getService(Components.interfaces.nsIRDFService);
          var localstore = rdf.GetDataSource("rdf:local-store");
          var resource = rdf.GetResource(override);
          var arc = rdf.GetResource("currentset");
          var target = localstore.GetTarget(resource, arc, true);
          var currentSet = (target ? target.QueryInterface(Components.interfaces.nsIRDFLiteral).Value : document.getElementById('mail-bar').getAttribute("defaultset"));

          if (/\bbutton-junk\b/.test(currentSet))
            currentSet = currentSet.replace(/\bbutton-junk\b/, "aup-toolbarbutton,button-junk");
          else
            currentSet = currentSet + ",aup-toolbarbutton";

          if (target)
            localstore.Unassert(resource, arc, target, true);
          localstore.Assert(resource, arc, rdf.GetLiteral(currentSet), true);
        } catch (e) {}
      }
    }
  }
}

// Let user choose subscriptions on first start unless he has some already
function aupShowSubscriptions()
{
  // Look for existing subscriptions
  for each (let subscription in aup.filterStorage.subscriptions)
    if (subscription instanceof aup.DownloadableSubscription)
      return;

  let browser = aupGetBrowser();
  if ("addTab" in browser)
  {
    // We have a tabbrowser
    browser.selectedTab = browser.addTab("chrome://adblockplus/content/tip_subscriptions.xul");
  }
  else
  {
	window.openDialog("chrome://adblockplus/content/tip_subscriptions.xul", "_blank", "chrome,centerscreen,resizable=no,dialog=no");
  }
}

function aupFillTooltip(ev) {
  if (!document.tooltipNode || !document.tooltipNode.hasAttribute("tooltip"))
    return false;

  if (aup) {
    aupReloadPrefs();

    var type = (document.tooltipNode && document.tooltipNode.id == "aup-toolbarbutton" ? "toolbar" : "statusbar");
    var action = parseInt(aupPrefs["default" + type + "action"]);
    if (isNaN(action))
      action = -1;

    var actionDescr = document.getElementById("aup-tooltip-action");
    actionDescr.hidden = (action < 0 || action > 3);
    if (!actionDescr.hidden)
      actionDescr.setAttribute("value", aup.getString("action" + action + "_tooltip"));

    var state = ev.target.getAttribute("curstate");
    var statusDescr = document.getElementById("aup-tooltip-status");
    statusDescr.setAttribute("value", aup.getString(state + "_tooltip"));

    var activeFilters = [];
    document.getElementById("aup-tooltip-blocked-label").hidden = (state != "active");
    document.getElementById("aup-tooltip-blocked").hidden = (state != "active");
    if (state == "active") {
      var data = aup.getDataForWindow(aupGetBrowser().contentWindow);
      var locations = data.getAllLocations();

      var blocked = 0;
      var filterCount = {__proto__: null};
      for (i = 0; i < locations.length; i++) {
        if (locations[i].filter && !(locations[i].filter instanceof aup.WhitelistFilter))
          blocked++;
        if (locations[i].filter) {
          if (locations[i].filter.text in filterCount)
            filterCount[locations[i].filter.text]++;
          else
            filterCount[locations[i].filter.text] = 1;
        }
      }

      var blockedStr = aup.getString("blocked_count_tooltip");
      blockedStr = blockedStr.replace(/--/, blocked).replace(/--/, locations.length);
      document.getElementById("aup-tooltip-blocked").setAttribute("value", blockedStr);

      var filterSort = function(a, b) {
        return filterCount[b] - filterCount[a];
      };
      for (var filter in filterCount)
        activeFilters.push(filter);
      activeFilters = activeFilters.sort(filterSort);
    }

    document.getElementById("aup-tooltip-filters-label").hidden = (activeFilters.length == 0);
    document.getElementById("aup-tooltip-filters").hidden = (activeFilters.length == 0);
    if (activeFilters.length > 0) {
      var filtersContainer = document.getElementById("aup-tooltip-filters");
      while (filtersContainer.firstChild)
        filtersContainer.removeChild(filtersContainer.firstChild);

      for (var i = 0; i < activeFilters.length && i < 3; i++) {
        var descr = document.createElement("description");
        descr.setAttribute("value", activeFilters[i] + " (" + filterCount[activeFilters[i]] + ")");
        filtersContainer.appendChild(descr);
      }
      if (activeFilters.length > 3) {
        var descr = document.createElement("description");
        descr.setAttribute("value", "...");
        filtersContainer.appendChild(descr);
      }
    }
  }
  return true;
}

// Fills the context menu on the status bar
function aupFillPopup(popup) {
  if (!aup)
    return false;

  // Not at-target call, ignore
  if (popup.getAttribute("id").indexOf("options") >= 0)
    return true;

  // Need to do it this way to prevent a Gecko bug from striking
  var elements = {};
  var list = popup.getElementsByTagName("menuitem");
  for (var i = 0; i < list.length; i++)
    if (list[i].id && /\-(\w+)$/.test(list[i].id))
      elements[RegExp.$1] = list[i];

  var sidebarOpen = aupIsSidebarOpen();
  elements.opensidebar.hidden = sidebarOpen;
  elements.closesidebar.hidden = !sidebarOpen;

  var whitelistItemSite = elements.whitelistsite;
  var whitelistItemPage = elements.whitelistpage;
  var whitelistSeparator = whitelistItemPage.nextSibling;
  while (whitelistSeparator.nodeType != Node.ELEMENT_NODE)
    whitelistSeparator = whitelistSeparator.nextSibling;

  var location = null;
  var site = null;
  if ("currentHeaderData" in window && "content-base" in currentHeaderData) {
    // Thunderbird blog entry
    location = aup.unwrapURL(currentHeaderData["content-base"].headerValue);
  }
  else if ("gDBView" in window) {
    // Thunderbird mail/newsgroup entry
    try {
      var msgHdr = gDBView.hdrForFirstSelectedMessage;
      var headerParser = Components.classes["@mozilla.org/messenger/headerparser;1"]
                                  .getService(Components.interfaces.nsIMsgHeaderParser);
      site = headerParser.extractHeaderAddressMailboxes(null, msgHdr.author);
      if (site)
        site = site.replace(/^[\s"]+/, "").replace(/[\s"]+$/, "");
    }
    catch(e) {
      site = null;
    }

    if (site) {
      whitelistItemSite.pattern = "@@|mailto:" + site.replace(' ', '%20') + "|";
      whitelistItemSite.setAttribute("checked", aupHasFilter(whitelistItemSite.pattern));
      whitelistItemSite.setAttribute("label", whitelistItemSite.getAttribute("labeltempl").replace(/--/, site));
    }
  }
  else {
    // Firefox web page
    location = aup.unwrapURL(aupGetBrowser().contentWindow.location.href);
  }

  if (!site && location) {
    if (aup.policy.isBlockableScheme(location)) {
      let ending = "|";
      if (location instanceof Components.interfaces.nsIURL && location.query)
      {
        location.query = "";
        ending = "?";
      }

      let url = location.spec;
      let host = location.host;
      site = url.replace(/^([^\/]+\/\/[^\/]+\/).*/, "$1");

      whitelistItemSite.pattern = "@@|" + site;
      whitelistItemSite.setAttribute("checked", aupHasFilter(whitelistItemSite.pattern));
      whitelistItemSite.setAttribute("label", whitelistItemSite.getAttribute("labeltempl").replace(/--/, host));

      whitelistItemPage.pattern = "@@|" + url + ending;
      whitelistItemPage.setAttribute("checked", aupHasFilter(whitelistItemPage.pattern));
    }
    else
      location = null;
  }

  whitelistItemSite.hidden = !site;
  whitelistItemPage.hidden = !location;
  whitelistSeparator.hidden = !site && !location;

  elements.enabled.setAttribute("checked", aupPrefs.enabled);
  elements.frameobjects.setAttribute("checked", aupPrefs.frameobjects);
  elements.slowcollapse.setAttribute("checked", !aupPrefs.fastcollapse);
  elements.showintoolbar.setAttribute("checked", aupPrefs.showintoolbar);
  elements.showinstatusbar.setAttribute("checked", aupPrefs.showinstatusbar);

  var defAction = (popup.tagName == "menupopup" || document.popupNode.id == "aup-toolbarbutton" ? aupPrefs.defaulttoolbaraction : aupPrefs.defaultstatusbaraction);
  elements.opensidebar.setAttribute("default", defAction == 1);
  elements.closesidebar.setAttribute("default", defAction == 1);
  elements.settings.setAttribute("default", defAction == 2);
  elements.enabled.setAttribute("default", defAction == 3);

  return true;
}

// Only show context menu on toolbar button in vertical toolbars
function aupCheckToolbarContext(event) {
  var toolbox = event.target;
  while (toolbox && toolbox.tagName != "toolbox")
    toolbox = toolbox.parentNode;

  if (!toolbox || toolbox.getAttribute("vertical") != "true")
    return;

  event.target.open = true;
  event.preventDefault();
}

function aupIsSidebarOpen() {
  // Test whether detached sidebar window is open
  if (aupDetachedSidebar && !aupDetachedSidebar.closed)
    return true;

  var sidebar = document.getElementById("aup-sidebar");
  return (sidebar ? !sidebar.hidden : false);
}

function aupToggleSidebar() {
  if (!aup)
    return;

  if (aupDetachedSidebar && !aupDetachedSidebar.closed)
    aupDetachedSidebar.close();
  else {
    var sidebar = document.getElementById("aup-sidebar");
    if (sidebar && (!aupPrefs.detachsidebar || !sidebar.hidden)) {
      document.getElementById("aup-sidebar-splitter").hidden = !sidebar.hidden;
      document.getElementById("aup-sidebar-browser").setAttribute("src", sidebar.hidden ? "chrome://adblockplus/content/sidebar.xul" : "about:blank");
      sidebar.hidden = !sidebar.hidden;
    }
    else
      aupDetachedSidebar = window.openDialog("chrome://adblockplus/content/sidebarDetached.xul", "_blank", "chrome,resizable,dependent,dialog=no,width=600,height=300");
  }

  let menuItem = document.getElementById("aup-blockableitems");
  if (menuItem)
    menuItem.setAttribute("checked", aupIsSidebarOpen());
}

/**
 * Checks whether the specified user-defined filter exists
 *
 * @param {String} filter   text representation of the filter
 */
function aupHasFilter(filter)
{
  filter = aup.Filter.fromText(filter);
  for each (let subscription in aup.filterStorage.subscriptions)
    if (subscription instanceof aup.SpecialSubscription && subscription.filters.indexOf(filter) >= 0)
      return true;

  return false;
}

// Toggles the value of a boolean pref
function aupTogglePref(pref) {
  if (!aup)
    return;

  aupPrefs[pref] = !aupPrefs[pref];
  aupPrefs.save();
}

// Inserts or removes the specified pattern into/from the list
function aupTogglePattern(text, insert) {
  if (!aup)
    return;

  if (insert)
    aup.addPatterns([text], 1);
  else
    aup.removePatterns([text], 1);

  // Make sure to display whitelisting immediately
  aupReloadPrefs();
}

// Handle clicks on the Adblock statusbar panel
function aupClickHandler(e) {
  if (e.button == 0)
    aupExecuteAction(aupPrefs.defaultstatusbaraction);
  else if (e.button == 1)
    aupTogglePref("enabled");
}

function aupCommandHandler(e) {
  if (aupPrefs.defaulttoolbaraction == 0)
    e.target.open = true;
  else
    aupExecuteAction(aupPrefs.defaulttoolbaraction);
}

// Executes default action for statusbar/toolbar by its number
function aupExecuteAction(action) {
  if (action == 1)
    aupToggleSidebar();
  else if (action == 2)
    aup.openSettingsDialog();
  else if (action == 3)
    aupTogglePref("enabled");
}

// Retrieves the image URL for the specified style property
function aupImageStyle(computedStyle, property) {
  var value = computedStyle.getPropertyCSSValue(property);
  if (value.primitiveType == CSSPrimitiveValue.CSS_URI)
    return aup.unwrapURL(value.getStringValue()).spec;

  return null;
}

// Hides the unnecessary context menu items on display
function aupCheckContext() {
  var contextMenu = document.getElementById("contentAreaContextMenu") || document.getElementById("messagePaneContext") || document.getElementById("popup_content");
  var target = document.popupNode;

  var nodeType = null;
  contextMenu.aupBgData = null;
  contextMenu.aupFrameData = null;
  if (aup && target) {
    // Lookup the node in our stored data
    var data = aup.getDataForNode(target);
    var targetNode = null;
    if (data) {
      targetNode = data[0];
      data = data[1];
    }
    contextMenu.aupData = data;
    if (data && !data.filter)
      nodeType = data.typeDescr;

    var wnd = (target ? target.ownerDocument.defaultView : null);
    var wndData = (wnd ? aup.getDataForWindow(wnd) : null);

    if (wnd.frameElement)
      contextMenu.aupFrameData = aup.getDataForNode(wnd.frameElement, true);
    if (contextMenu.aupFrameData)
      contextMenu.aupFrameData = contextMenu.aupFrameData[1];
    if (contextMenu.aupFrameData && contextMenu.aupFrameData.filter)
      contextMenu.aupFrameData = null;

    if (nodeType != "IMAGE") {
      // Look for a background image
      var imageNode = target;
      while (imageNode && !contextMenu.aupBgData) {
        if (imageNode.nodeType == Node.ELEMENT_NODE) {
          var bgImage = null;
          var style = wnd.getComputedStyle(imageNode, "");
          bgImage = aupImageStyle(style, "background-image") || aupImageStyle(style, "list-style-image");
          if (bgImage) {
            contextMenu.aupBgData = wndData.getLocation(aup.policy.type.BACKGROUND, bgImage);
            if (contextMenu.aupBgData && contextMenu.aupBgData.filter)
              contextMenu.aupBgData = null;
          }
        }

        imageNode = imageNode.parentNode;
      }
    }

    // Hide "Block Images from ..." if hideimagemanager pref is true and the image manager isn't already blocking something
    var imgManagerContext = document.getElementById("context-blockimage");
    if (imgManagerContext) {
      if (typeof aupHideImageManager == "undefined")
        aupInitImageManagerHiding();

      // Don't use "hidden" attribute - it might be overridden by the default popupshowing handler
      imgManagerContext.style.display = (aupHideImageManager ? "none" : "");
    }
  }

  document.getElementById("aup-image-menuitem").hidden = (nodeType != "IMAGE" && contextMenu.aupBgData == null);
  document.getElementById("aup-object-menuitem").hidden = (nodeType != "OBJECT");
  document.getElementById("aup-frame-menuitem").hidden = (contextMenu.aupFrameData == null);
}

// Bring up the settings dialog for the node the context menu was referring to
function aupNode(data) {
  if (aup && data)
    openDialog("chrome://adblockplus/content/composer.xul", "_blank", "chrome,centerscreen,resizable,dialog=no,dependent", aupGetBrowser().contentWindow, data);
}
