window.onload = function()
{
  document.getElementById("connectionSettings").addEventListener("click", onConnectionSettings, false);
}

function onConnectionSettings(event)
{
  aup.openSettingsDialog();
  event.preventDefault();
}
