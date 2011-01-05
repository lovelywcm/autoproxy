const aup = Components.classes["@mozilla.org/autoproxy;1"].createInstance().wrappedJSObject;

window.onload = bindEvent = function()
{
  var pane = document.getElementById("paneAdvanced");
  if (!pane.loaded)
    pane.addEventListener("click", bindEvent, false);
  else {
    document.getElementById("connectionSettings").setAttribute("oncommand", "handleProxySettings()");
    pane.removeEventListener("click", bindEvent, false);
  }
}

function handleProxySettings()
{
  aup.openSettingsDialog();
}
