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
 * The Original Code is AutoProxy.
 *
 * The Initial Developer of the Original Code is
 * Wang Congming <lovelywcm@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */


/**
 * Used for creating "Enable Proxy On --" menu items.
 * Shared by context menu of statusbar, toolbar & sidebar.
 *
 * @require
 *   <menuseparator/>
 *   <menuitem...
 *   <menuseparator/>
 *
 * @param location {nsIURI}
 * @param menuItem: document.getElementById, see @require
 */
function enableProxyOn(location, menuItem)
{
  var menuSeparator = menuItem.nextSibling;

  // remove previously created extra "Enable Proxy On --" menu items
  while (menuItem.previousSibling.tagName != 'menuseparator')
    menuItem.parentNode.removeChild(menuItem.previousSibling);

  if (proxy.isProxyableScheme(location)) {
    var siteHost = location.host.replace(/^\.+/, '').replace(/\.{2,}/, '.'); // avoid: .www..xxx.com

    // for host 'www.xxx.com', ignore 'www' unless rule '||www.xxx.com' is active.
    if (siteHost.indexOf('www.')==0 && !isActive(aup.Filter.fromText('||'+siteHost)))
      siteHost = siteHost.replace(/^www\./, '');

    while (true) {
      let siteFilter = aup.Filter.fromText('||' + siteHost);
      if (isActive(siteFilter) || menuItem.nextSibling==menuSeparator) {
        var newProxyOn = cE('menuitem');
        newProxyOn.setAttribute('type', 'checkbox');
        newProxyOn.setAttribute('checked', isActive(siteFilter));
        newProxyOn.addEventListener('command', function() { toggleFilter(siteFilter); }, false);
        newProxyOn.setAttribute('label', aup.getString('enableProxyOn').replace(/--/, siteHost));
        menuItem.parentNode.insertBefore(newProxyOn, menuItem);
        menuItem.setAttribute('disabled', true);
        menuItem = newProxyOn;
      }
      if (siteHost.indexOf('.') <= 0) break;
      siteHost = siteHost.replace(/^[^\.]+\./, '');
    }
  }

  menuSeparator.hidden = menuItem.hidden;
}


/**
 * If the given filter is active, remove/disable it, Otherwise add/enable it.
 */
function toggleFilter(/**Filter*/ filter)
{
  if (filter.subscriptions.length) {
    if (filter.disabled || filter.subscriptions.some(function(subscription) !(subscription instanceof aup.SpecialSubscription))) {
      filter.disabled = !filter.disabled;
      filterStorage.triggerFilterObservers(filter.disabled ? "disable" : "enable", [filter]);
    }
    else
      filterStorage.removeFilter(filter);
  }
  else
    filterStorage.addFilter(filter);

  filterStorage.saveToDisk();

  if (treeView)
    treeView.boxObject.invalidate();
}


function isActive(/**Filter*/ filter)
{
  return filter.subscriptions.length && !filter.disabled;
}


// TODO: @@, |http:*, etc.
// TODO: all level domains
