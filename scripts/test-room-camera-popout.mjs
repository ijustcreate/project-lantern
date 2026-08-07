import assert from "node:assert/strict";
import {
  openRoomCameraPopout,
  ROOM_CAMERA_POPOUT_FEATURES,
  ROOM_CAMERA_POPOUT_NAME,
  ROOM_CAMERA_POPOUT_ROOT_ID
} from "../src/roomCameraPopout.ts";

const clonedStyles = [];
const sourceStyle = { cloneNode: (deep) => ({ kind: "style", deep }) };
const popup = {
  closed: false,
  focused: false,
  document: {
    title: "",
    head: {
      innerHTML: "",
      appendChild: (node) => clonedStyles.push(node)
    },
    body: { className: "", innerHTML: "" }
  },
  focus() { this.focused = true; }
};
const openCalls = [];
const opener = {
  open: (...args) => {
    openCalls.push(args);
    return popup;
  }
};
const sourceDocument = {
  querySelectorAll: (selector) => {
    assert.equal(selector, 'link[rel="stylesheet"], style');
    return [sourceStyle];
  }
};

const result = openRoomCameraPopout(opener, sourceDocument, "Discovery Hall");
assert.equal(result, popup);
assert.deepEqual(openCalls[0], ["", ROOM_CAMERA_POPOUT_NAME, ROOM_CAMERA_POPOUT_FEATURES]);
assert.match(ROOM_CAMERA_POPOUT_FEATURES, /resizable=yes/);
assert.equal(popup.document.title, "Discovery Hall Room Camera · Project Lantern");
assert.equal(popup.document.body.className, "room-view-popout-body");
assert.match(popup.document.body.innerHTML, new RegExp(`id=["']${ROOM_CAMERA_POPOUT_ROOT_ID}["']`));
assert.deepEqual(clonedStyles, [{ kind: "style", deep: true }]);
assert.equal(popup.focused, true);

const blocked = openRoomCameraPopout({ open: () => null }, sourceDocument, "Discovery Hall");
assert.equal(blocked, null);

console.log("Room camera pop-out fixture passed: separate named window, copied styles, resizable shell, and blocked-popup fallback.");
