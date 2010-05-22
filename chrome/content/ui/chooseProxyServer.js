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
 *
 * Portions created by the Initial Developer are Copyright (C) 2009-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

var aup = Components.classes["@mozilla.org/autoproxy;1"]
                          .createInstance().wrappedJSObject;
var prefs = aup.prefs;
var proxies = (prefs.customProxy || prefs.knownProxy).split("$");

var gE = function(id) { return document.getElementById(id); };
var cE = function(tag) { return document.createElementNS(
       "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul", tag); };

function init()
{
  // row for setting default proxy
  var defaultProxy = prefs.defaultProxy || prefs.customProxy.split('$')[0] ||
                                            prefs.knownProxy.split('$')[0];
  menu.newList( gE('defaultProxy'), defaultProxy, true);

  // one row per rule group
  var rows = document.getElementsByTagName('rows')[0];
  for each (let subscription in aup.filterStorage.subscriptions) {
    if ( subscription.url == '~il~' || subscription.url == '~wl~' ) continue;
    var row = cE('row');
    var groupName = cE('label');
    row.appendChild(groupName);
    rows.insertBefore( row, gE('groupSeparator') );

    groupName.setAttribute('value',
      (subscription instanceof aup.RegularSubscription ?
                          aup.getString('subscription_description') : '自定义：')
      + subscription.title
    );

    // for http, https and ftp proxy, we need 3 menu lists per row
    // Parameter given to menu.newList() is to mark this munu item as selected
    // dummy, to be implemented
    menu.newList( row, '默认代理' );
    menu.newList( row, '默认代理' );
    menu.newList( row, '默认代理' );
  }

  // row for setting fallback proxy
  menu.newList( gE('fallbackProxy'), prefs.fallBackProxy );
  // dummy, to be implemented
  menu.newList( gE('fallbackProxy'), '直接连接' );
  menu.newList( gE('fallbackProxy'), '直接连接' );

  defaultProxyforAll(true);
}

var menu =
{
  menuList: null,

  selectedProxy: null,

  /**
   * Create a menu list with several menu items:
   *   "default proxy" item
   *    ....
   *    several items according to how many proxies
   *    ...
   *   "direct connect" item
   *
   * @param node {DOM node}: which node should this new menu list append to
   * @param selectedProxy {string}: menu item with this proxy name will be marked as selected
   * @param isDefaultProxyPopup {boolean}: if true, "default proxy" menu item won't be created
   */
  newList: function(node, selectedProxy, isDefaultProxyPopup)
  {
    this.selectedProxy = ! selectedProxy ? '默认代理' :
      ! selectedProxy.split(';')[0] ? "直接连接" : selectedProxy.split(';')[0];

    this.menuList = cE('menulist');
    this.menuList.appendChild( cE('menupopup') );
    node.appendChild( this.menuList );

    if (!isDefaultProxyPopup) this.newItem('默认代理');
    for each (let proxy in proxies) this.newItem(proxy.split(';')[0]);
    this.newItem('直接连接');
  },

  /**
   * Create a new menu item (and mark it as selected if necessary) for menu list
   */
  newItem: function(proxyName)
  {
    var menuItem = cE('menuitem');
    menuItem.setAttribute('label', proxyName);
    this.menuList.firstChild.appendChild(menuItem);

    if (proxyName == this.selectedProxy) this.menuList.selectedItem = menuItem;
  }
}

function defaultProxyforAll(init)
{
  if (!init) prefs.defaultProxyforAll = ! prefs.defaultProxyforAll;

  var checkbox = document.getElementsByTagName('checkbox')[0];
  checkbox.setAttribute('checked', prefs.defaultProxyforAll);

  for ( var row=gE('description'); row!=gE('groupSeparator'); row=row.nextSibling )
    for ( var node=row.firstChild; node; node=node.nextSibling )
      node.setAttribute('disabled', prefs.defaultProxyforAll);

  // not implemented, temporarily disable them
  var menulists = document.getElementsByTagName('menulist');
  for (var i=1; i<menulists.length; i++)
    if (i != menulists.length-3) menulists[i].setAttribute('disabled', true);
}

function save()
{
  // TODO: rename prefs.fallBackProxy to prefs.fallbackProxy
  // TODO: init a proxy map at shartup, store proxy name(but not config) to defaultProxy & fallbackProxy
  // TODO: if ( customProxy == knownProxy ) customProxy = "";
  // TODO: new class: proxy
  // TODO: ";" & "$" is not allowed in proxy name
  // TODO: i18n

  prefs.defaultProxy = proxies[ gE('defaultProxy').lastChild.selectedIndex ] || ';;;direct';

  var fallbackId = gE('fallbackProxy').firstChild.nextSibling.selectedIndex;
  if ( fallbackId == 0 ) prefs.fallBackProxy = '';
  else prefs.fallBackProxy = proxies[ fallbackId-1 ] || ';;;direct';

  // other configs are ignored, not implemented yet
  prefs.save();
}
