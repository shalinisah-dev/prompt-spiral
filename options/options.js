"use strict";

const checkbox = document.querySelector("#suggestions-off");
chrome.storage.local.get({ passiveDisabled: false }, (settings) => {
  checkbox.checked = Boolean(settings.passiveDisabled);
});
checkbox.addEventListener("change", () => {
  chrome.storage.local.set({ passiveDisabled: checkbox.checked });
});
