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

function init()
{
  // row for setting default proxy
  menu.newList( E('defaultProxy'), prefs.defaultProxy, true );

  // one row per rule group
  var rows = document.getElementsByTagName('rows')[0];
  for each (let subscription in aup.filterStorage.subscriptions) {
    var row = cE('row');
    var groupName = cE('label');
    row.appendChild(groupName);
    rows.insertBefore( row, E('groupSeparator') );

    groupName.setAttribute('value',
      (subscription instanceof aup.RegularSubscription ?
                          aup.getString('subscription_description') : '自定义：')
      + subscription.title
    );

    // for http, https and ftp proxy, we need 3 menu lists per row
    // Parameter given to menu.newList() is to mark this munu item as selected
    // dummy, to be implemented
    menu.newList( row, proxy.server.length );
    menu.newList( row, proxy.server.length );
    menu.newList( row, proxy.server.length );
  }

  // row for setting fallback proxy
  menu.newList( E('fallbackProxy'),
        prefs.fallbackProxy == -1 ? proxy.server.length : prefs.fallbackProxy );
  // dummy, to be implemented
  menu.newList( E('fallbackProxy'), 0 );
  menu.newList( E('fallbackProxy'), 0 );

  defaultProxyforAll(true);
}

var menu =
{
  menuList: null,

  /**
   * Create a menu list with several menu items:
   *   "direct connect" item
   *    ....
   *    several items according to how many proxies
   *    ...
   *   "default proxy" item
   *
   * @param node {DOM node}: which node should this new menu list append to
   * @param index {int}: which menu item should be selected by default
   * @param isDefaultProxyPopup {boolean}: if true, "default proxy" menu item won't be created
   */
  newList: function(node, index, isDefaultProxyPopup)
  {
    this.menuList = cE('menulist');
    this.menuList.appendChild( cE('menupopup') );
    node.appendChild( this.menuList );

    proxy.getName.forEach(this.newItem);

    if (isDefaultProxyPopup)
      this.menuList.firstChild.firstChild.hidden = true;
    else
      this.newItem('默认代理');

    this.menuList.selectedIndex = index;
  },

  /**
   * Create a new menu item for this.menuList
   */
  newItem: function(proxyName)
  {
    var menuItem = cE('menuitem');
    menuItem.setAttribute('label', proxyName);
    menu.menuList.firstChild.appendChild(menuItem);
  }
}

function defaultProxyforAll(init)
{
  if (!init) prefs.defaultProxyforAll = ! prefs.defaultProxyforAll;

  var checkbox = document.getElementsByTagName('checkbox')[0];
  checkbox.setAttribute('checked', prefs.defaultProxyforAll);

  for ( var row=E('description'); row!=E('groupSeparator'); row=row.nextSibling )
    for ( var node=row.firstChild; node; node=node.nextSibling )
      node.setAttribute('disabled', prefs.defaultProxyforAll);

  // not implemented, temporarily disable them
  var menulists = document.getElementsByTagName('menulist');
  for (var i=1; i<menulists.length; i++)
    if (i != menulists.length-3) menulists[i].setAttribute('disabled', true);
}

function save()
{
  prefs.defaultProxy = E('defaultProxy').lastChild.selectedIndex;

  var fallbackId = E('fallbackProxy').firstChild.nextSibling.selectedIndex;
  if ( fallbackId == proxy.server.length ) fallbackId = -1;
  prefs.fallbackProxy = fallbackId;

  // other configs are ignored, not implemented yet
  prefs.save();
}
