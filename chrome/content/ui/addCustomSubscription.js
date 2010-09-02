/**
 * Created by IntelliJ IDEA.
 * User: slimx
 * Date: 2010-8-15
 * Time: 11:58:24
 * To change this template use File | Settings | File Templates.
 */
 var menuList = null;
 var inputTitle = null;
 var subscription = null;
 var isCreate = true;
function init()
{
    menuList = E("proxyMenu");
    inputTitle = E("groupName");
    proxy.getName.forEach(function(proxyName,index)
    {
        let menuItem = cE('menuitem');
        menuItem.setAttribute('label', proxyName);
        menuItem.setAttribute('value',index);
        menuList.firstChild.appendChild(menuItem);
    });

    if(window.arguments&&window.arguments[0])
    {
    	isCreate = false;
    	subscription = window.arguments[0];
    	inputTitle.value = subscription.titleOnly;
    	menuList.selectedIndex = subscription.proxyIndex; //is right?
        if(subscription.url=="~fl~")
        inputTitle.disabled=true;
    }else
    menuList.selectedIndex = 0;

}
function save()
{
	let title = inputTitle.value;
    let proxyIndex = menuList.selectedIndex;
    if(title.match(/^\s*$/))return false;

    if(isCreate)
   {
    let point = prefs.customSubscriptionsPoint++;
    prefs.save();
    
    if(point==0)point="";
    let url="~fl"+point+"~";
    let subscription = new aup.CustomSubscription(url,title,proxyIndex);
    filterStorage.addSubscription(subscription);
}
	else
	{
		if(subscription.titleOnly==title&&subscription.proxyIndex==proxyIndex)return;
        subscription.title = title;
        subscription.proxyIndex = proxyIndex;
	}
}
