export const ROOM_CAMERA_POPOUT_NAME = "lantern-room-camera";
export const ROOM_CAMERA_POPOUT_ROOT_ID = "lantern-room-view-root";
export const ROOM_CAMERA_POPOUT_FEATURES = "popup=yes,width=960,height=720,resizable=yes,scrollbars=no";

export function prepareRoomCameraPopout(popup: Window, sourceDocument: Document, displayLabel: string) {
  popup.document.head.innerHTML = '<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
  popup.document.title = `${displayLabel} Room Camera · Project Lantern`;
  sourceDocument.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    popup.document.head.appendChild(node.cloneNode(true));
  });
  popup.document.body.className = "room-view-popout-body";
  popup.document.body.innerHTML = `<div id="${ROOM_CAMERA_POPOUT_ROOT_ID}"></div>`;
}

export function openRoomCameraPopout(opener: Window, sourceDocument: Document, displayLabel: string) {
  const popup = opener.open("", ROOM_CAMERA_POPOUT_NAME, ROOM_CAMERA_POPOUT_FEATURES);
  if (!popup) return null;
  prepareRoomCameraPopout(popup, sourceDocument, displayLabel);
  popup.focus();
  return popup;
}
