/*************************************************************************
 * Copyright (c) 2020, The Tor Project, Inc.
 * See LICENSE for licensing information.
 *
 * vim: set sw=2 sts=2 ts=8 et syntax=javascript:
 *************************************************************************/

window.addEventListener("pageshow", function() {
  let evt = new CustomEvent("AboutTorLoad", { bubbles: true });
  document.dispatchEvent(evt);
});
