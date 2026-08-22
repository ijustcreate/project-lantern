import type { TrackingPoint, TrackingRenderFrame } from "./trackingRuntime";

export type GlassesStyle = "classic" | "playful";
export type HatStyle = "party" | "wizard";
export type HandPropStyle = "wand" | "dagger";

export interface WizardHatRig {
  points: Array<{ x: number; y: number }>;
  velocity: Array<{ x: number; y: number }>;
  previousBase?: { x: number; y: number };
  previousAt?: number;
}

export interface TrackedGlassesGeometry {
  center: { x: number; y: number };
  angle: number;
  lineWidth: number;
  lenses: Array<{ x: number; y: number; width: number; height: number }>;
  temples: Array<{ x: number; y: number }>;
  nosePadY: number;
}

export function createWizardHatRig(): WizardHatRig {
  return {
    points: [],
    velocity: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]
  };
}

export function drawTrackedGlasses(context: CanvasRenderingContext2D, frame: TrackingRenderFrame, style: GlassesStyle) {
  const geometry = deriveTrackedGlassesGeometry(frame, style);
  if (!geometry) return;
  const { center, angle, lenses, temples, lineWidth, nosePadY } = geometry;

  context.save();
  context.translate(center.x, center.y);
  context.rotate(angle);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.lineWidth = lineWidth;

  if (style === "playful") {
    context.strokeStyle = "#b62f63";
    context.fillStyle = "rgba(255, 205, 70, 0.23)";
    lenses.forEach((lens, index) => {
      const side = index === 0 ? -1 : 1;
      const { x, y, width: lensWidth, height: lensHeight } = lens;
      context.beginPath();
      context.moveTo(x - lensWidth * 0.52, y - lensHeight * 0.5);
      context.quadraticCurveTo(x, y - lensHeight * 0.7, x + lensWidth * 0.54, y - lensHeight * 0.42);
      context.lineTo(x + lensWidth * 0.47, y + lensHeight * 0.48);
      context.quadraticCurveTo(x, y + lensHeight * 0.62, x - lensWidth * 0.47, y + lensHeight * 0.42);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(x - side * lensWidth * 0.15, y - lensHeight * 0.54);
      context.lineTo(x - side * lensWidth * 0.02, y - lensHeight * 0.76);
      context.stroke();
    });
  } else {
    context.strokeStyle = "#172635";
    context.fillStyle = "rgba(85, 199, 191, 0.13)";
    lenses.forEach((lens) => {
      roundedRect(context, lens.x - lens.width / 2, lens.y - lens.height / 2, lens.width, lens.height, lens.height * 0.34);
      context.fill();
      context.stroke();
    });
  }

  const leftLens = lenses[0];
  const rightLens = lenses[1];
  const leftInner = leftLens.x + leftLens.width / 2;
  const rightInner = rightLens.x - rightLens.width / 2;
  const bridgeY = (leftLens.y + rightLens.y) / 2 - Math.min(leftLens.height, rightLens.height) * 0.03;
  // A compact bridge follows the eye line and avoids the high arch that made
  // the frames appear to float above the nose.
  context.beginPath();
  context.moveTo(leftInner, bridgeY);
  context.quadraticCurveTo(0, bridgeY - Math.min(leftLens.height, rightLens.height) * 0.2, rightInner, bridgeY);
  context.stroke();

  // Temple arms reach toward the sides of the head instead of joining both ovals.
  context.beginPath();
  context.moveTo(leftLens.x - leftLens.width / 2, leftLens.y - leftLens.height * 0.08);
  context.lineTo(temples[0].x, temples[0].y);
  context.moveTo(rightLens.x + rightLens.width / 2, rightLens.y - rightLens.height * 0.08);
  context.lineTo(temples[1].x, temples[1].y);
  context.stroke();

  // Subtle nose pads sit just below the bridge rather than drifting down the nose.
  context.fillStyle = style === "playful" ? "#ffe8a6" : "#dce9ec";
  context.beginPath();
  context.ellipse(-lineWidth * 0.7, nosePadY, lineWidth * 0.38, lineWidth * 0.56, -0.3, 0, Math.PI * 2);
  context.ellipse(lineWidth * 0.7, nosePadY, lineWidth * 0.38, lineWidth * 0.56, 0.3, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

/** Derive wearable geometry from complete eye contours, not two outer corners. */
export function deriveTrackedGlassesGeometry(frame: TrackingRenderFrame, style: GlassesStyle): TrackedGlassesGeometry | undefined {
  const landmarks = frame.face?.landmarks;
  if (!landmarks) return undefined;

  const eyeRecords = [
    makeEyeRecord(landmarks, frame, [33, 133], [159, 145], [160, 144], [468, 469, 470, 471, 472]),
    makeEyeRecord(landmarks, frame, [362, 263], [386, 374], [385, 380], [473, 474, 475, 476, 477])
  ].filter((eye): eye is NonNullable<typeof eye> => Boolean(eye)).sort((left, right) => left.center.x - right.center.x);
  if (eyeRecords.length !== 2) return undefined;

  const [screenLeftEye, screenRightEye] = eyeRecords;
  const center = midpoint(screenLeftEye.center, screenRightEye.center);
  const eyeCenterDistance = Math.max(20, distance(screenLeftEye.center, screenRightEye.center));
  const angle = Math.atan2(screenRightEye.center.y - screenLeftEye.center.y, screenRightEye.center.x - screenLeftEye.center.x);
  const headEdges = [pixelPoint(landmarks[234], frame), pixelPoint(landmarks[454], frame)].filter((point): point is { x: number; y: number } => Boolean(point)).sort((left, right) => left.x - right.x);
  const headWidth = headEdges.length === 2 ? Math.max(eyeCenterDistance * 2, distance(headEdges[0], headEdges[1])) : eyeCenterDistance * 2.5;
  const localPoint = (point: { x: number; y: number }) => rotatePoint({ x: point.x - center.x, y: point.y - center.y }, -angle);
  const localEyeCenters = [localPoint(screenLeftEye.center), localPoint(screenRightEye.center)];
  const lineWidth = Math.max(2.5, Math.min(headWidth * 0.026, eyeCenterDistance * 0.05));
  const minLensWidth = eyeCenterDistance * 0.48;
  const maxLensWidth = Math.min(eyeCenterDistance * 0.82, headWidth * 0.36);
  let lensWidths = [screenLeftEye.width, screenRightEye.width].map((eyeWidth) => clamp(eyeWidth * 1.52, minLensWidth, maxLensWidth));

  // Preserve a real bridge gap even when a face turns and one eye contour grows.
  const availableForHalfWidths = eyeCenterDistance - lineWidth * 2.2;
  const combinedHalfWidths = (lensWidths[0] + lensWidths[1]) / 2;
  if (combinedHalfWidths > availableForHalfWidths) {
    const scale = availableForHalfWidths / combinedHalfWidths;
    lensWidths = lensWidths.map((width) => width * scale);
  }

  const lenses = eyeRecords.map((eye, index) => {
    const width = lensWidths[index];
    const aspectHeight = width * (style === "classic" ? 0.54 : 0.6);
    const height = clamp(Math.max(aspectHeight, eye.height * 2.15), width * 0.5, width * 0.7);
    return { x: localEyeCenters[index].x, y: localEyeCenters[index].y - height * 0.055, width, height };
  });
  const averageLensHeight = (lenses[0].height + lenses[1].height) / 2;

  const templeCandidates = [
    frame.extensionAnchors.leftEar ? pixelPoint(frame.extensionAnchors.leftEar, frame) : pixelPoint(landmarks[127] ?? landmarks[234], frame),
    frame.extensionAnchors.rightEar ? pixelPoint(frame.extensionAnchors.rightEar, frame) : pixelPoint(landmarks[356] ?? landmarks[454], frame)
  ].filter((point): point is { x: number; y: number } => Boolean(point)).sort((left, right) => left.x - right.x).map(localPoint);
  const temples = [
    {
      x: Math.min(templeCandidates[0]?.x ?? -headWidth * 0.48, lenses[0].x - lenses[0].width / 2 - lineWidth),
      y: clamp(templeCandidates[0]?.y ?? averageLensHeight * 0.08, -averageLensHeight * 0.18, averageLensHeight * 0.28)
    },
    {
      x: Math.max(templeCandidates[1]?.x ?? headWidth * 0.48, lenses[1].x + lenses[1].width / 2 + lineWidth),
      y: clamp(templeCandidates[1]?.y ?? averageLensHeight * 0.08, -averageLensHeight * 0.18, averageLensHeight * 0.28)
    }
  ];
  const nose = pixelPoint(landmarks[168] ?? landmarks[6], frame);
  const localNose = nose ? localPoint(nose) : { x: 0, y: averageLensHeight * 0.12 };
  const nosePadY = clamp(localNose.y + lineWidth * 0.25, averageLensHeight * 0.06, averageLensHeight * 0.26);

  return { center, angle, lineWidth, lenses, temples, nosePadY };
}

export function drawTrackedHat(
  context: CanvasRenderingContext2D,
  frame: TrackingRenderFrame,
  style: HatStyle,
  wizardRig: WizardHatRig,
  options: { springiness: number; damping: number }
) {
  const landmarks = frame.face?.landmarks;
  if (!landmarks) return;
  const headLeft = pixelPoint(landmarks[234], frame);
  const headRight = pixelPoint(landmarks[454], frame);
  const headTop = pixelPoint(landmarks[10], frame);
  if (!headLeft || !headRight || !headTop) return;
  const center = midpoint(headLeft, headRight);
  const headWidth = Math.max(28, distance(headLeft, headRight));
  const angle = Math.atan2(headRight.y - headLeft.y, headRight.x - headLeft.x);
  const normal = { x: Math.sin(angle), y: -Math.cos(angle) };
  const base = { x: headTop.x + normal.x * headWidth * 0.05, y: headTop.y + normal.y * headWidth * 0.05 };

  if (style === "wizard") {
    const points = updateWizardHatRig(wizardRig, base, angle, headWidth, frame.nowMs, options);
    drawWizardHat(context, base, points, angle, headWidth);
    return;
  }
  drawPartyHat(context, base, angle, headWidth);
}

/** A small hand-held item drawn with a single stable grip instead of competing fingertip overlays. */
export function drawTrackedHandProp(context: CanvasRenderingContext2D, frame: TrackingRenderFrame, style: HandPropStyle, side: "left" | "right") {
  const hand = frame.hands.find((candidate) => candidate.side === side);
  if (!hand) return;
  const palm = pixelPoint(hand.palm, frame);
  const indexTip = pixelPoint(hand.landmarks[8], frame);
  const pinkyTip = pixelPoint(hand.landmarks[20], frame);
  if (!palm) return;
  const guide = indexTip ?? pinkyTip;
  const angle = guide ? Math.atan2(guide.y - palm.y, guide.x - palm.x) : (side === "left" ? -2.2 : -0.94);
  const handSize = Math.max(24, hand.fingertips.reduce((total, tip) => total + Math.hypot(tip.x * frame.width - palm.x, tip.y * frame.height - palm.y), 0) / Math.max(1, hand.fingertips.length));
  const reach = handSize * (style === "wand" ? 2.5 : 2.15);
  const tip = { x: palm.x + Math.cos(angle) * reach, y: palm.y + Math.sin(angle) * reach };
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (style === "wand") {
    roundedLine(context, palm, tip, Math.max(4, handSize * .16), "#754c2d", "#251a2f");
    context.fillStyle = "#f7e67a";
    context.beginPath(); context.arc(tip.x, tip.y, Math.max(5, handSize * .24), 0, Math.PI * 2); context.fill();
    context.strokeStyle = "#fff7bf"; context.lineWidth = 2;
    context.beginPath(); context.arc(tip.x, tip.y, Math.max(8, handSize * .38), 0, Math.PI * 2); context.stroke();
  } else {
    const normal = { x: -Math.sin(angle), y: Math.cos(angle) };
    const guard = { x: palm.x + Math.cos(angle) * handSize * .42, y: palm.y + Math.sin(angle) * handSize * .42 };
    roundedLine(context, palm, guard, Math.max(5, handSize * .22), "#5a3b2b", "#251a2f");
    context.strokeStyle = "#d7e7ef"; context.lineWidth = Math.max(5, handSize * .28);
    context.beginPath(); context.moveTo(guard.x, guard.y); context.lineTo(tip.x, tip.y); context.stroke();
    context.strokeStyle = "#fff7ca"; context.lineWidth = Math.max(3, handSize * .14);
    context.beginPath(); context.moveTo(guard.x + normal.x * handSize * .46, guard.y + normal.y * handSize * .46); context.lineTo(guard.x - normal.x * handSize * .46, guard.y - normal.y * handSize * .46); context.stroke();
  }
  // Reapply one compact grip last: readable hand ownership without fingertip z-fighting.
  context.strokeStyle = "rgba(38, 59, 89, .85)";
  context.lineWidth = Math.max(3, handSize * .14);
  context.beginPath();
  context.moveTo(palm.x - Math.cos(angle) * handSize * .15, palm.y - Math.sin(angle) * handSize * .15);
  context.lineTo(palm.x + Math.cos(angle) * handSize * .38, palm.y + Math.sin(angle) * handSize * .38);
  context.stroke();
  context.restore();
}

export function updateWizardHatRig(
  rig: WizardHatRig,
  base: { x: number; y: number },
  faceAngle: number,
  headWidth: number,
  nowMs: number,
  options: { springiness: number; damping: number }
) {
  const segmentLength = headWidth * 0.34;
  const rootAngle = faceAngle - Math.PI / 2;
  const targetAngles = [rootAngle + 0.08, rootAngle + 0.28, rootAngle + 0.52];
  if (rig.points.length !== 3) {
    rig.points = [];
    let parent = base;
    targetAngles.forEach((targetAngle) => {
      const next = { x: parent.x + Math.cos(targetAngle) * segmentLength, y: parent.y + Math.sin(targetAngle) * segmentLength };
      rig.points.push(next);
      parent = next;
    });
    rig.previousBase = { ...base };
    rig.previousAt = nowMs;
    return rig.points;
  }

  const deltaSeconds = Math.max(1 / 120, Math.min(1 / 20, (nowMs - (rig.previousAt ?? nowMs)) / 1_000));
  const step = deltaSeconds * 60;
  const spring = 0.05 + Math.max(0, Math.min(1, options.springiness)) * 0.2;
  const damping = Math.pow(0.98 - Math.max(0, Math.min(1, options.damping)) * 0.22, step);
  const baseVelocity = rig.previousBase ? { x: base.x - rig.previousBase.x, y: base.y - rig.previousBase.y } : { x: 0, y: 0 };
  let parent = base;
  rig.points.forEach((point, index) => {
    const target = {
      x: parent.x + Math.cos(targetAngles[index]) * segmentLength,
      y: parent.y + Math.sin(targetAngles[index]) * segmentLength
    };
    const velocity = rig.velocity[index];
    const tipInfluence = (index + 1) / rig.points.length;
    velocity.x = (velocity.x + (target.x - point.x) * spring * step - baseVelocity.x * tipInfluence * 0.34) * damping;
    velocity.y = (velocity.y + (target.y - point.y) * spring * step - baseVelocity.y * tipInfluence * 0.22) * damping;
    point.x += velocity.x * step;
    point.y += velocity.y * step;

    // Keep each bone's length stable while allowing the linked tip to flop.
    const dx = point.x - parent.x;
    const dy = point.y - parent.y;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    point.x = parent.x + dx / length * segmentLength;
    point.y = parent.y + dy / length * segmentLength;
    parent = point;
  });
  rig.previousBase = { ...base };
  rig.previousAt = nowMs;
  return rig.points;
}

function drawPartyHat(context: CanvasRenderingContext2D, base: { x: number; y: number }, angle: number, headWidth: number) {
  context.save();
  context.translate(base.x, base.y);
  context.rotate(angle);
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, headWidth * 0.025);
  context.strokeStyle = "#b62f63";
  context.fillStyle = "#f7c94f";
  context.beginPath();
  context.moveTo(-headWidth * 0.42, 0);
  context.lineTo(0, -headWidth * 0.94);
  context.lineTo(headWidth * 0.42, 0);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = "#55c7bf";
  context.lineWidth = Math.max(4, headWidth * 0.06);
  context.beginPath();
  context.moveTo(-headWidth * 0.4, -headWidth * 0.02);
  context.lineTo(headWidth * 0.4, -headWidth * 0.02);
  context.stroke();
  context.fillStyle = "#f07b5f";
  [-0.2, 0.13].forEach((offset, index) => {
    context.beginPath();
    context.arc(headWidth * offset, -headWidth * (0.31 + index * 0.18), headWidth * 0.06, 0, Math.PI * 2);
    context.fill();
  });
  context.fillStyle = "#55c7bf";
  context.beginPath();
  context.arc(0, -headWidth, headWidth * 0.11, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawWizardHat(context: CanvasRenderingContext2D, base: { x: number; y: number }, points: Array<{ x: number; y: number }>, angle: number, headWidth: number) {
  const chain = [base, ...points];
  context.save();
  context.lineJoin = "round";
  context.lineCap = "round";
  const widths = [headWidth * 0.42, headWidth * 0.31, headWidth * 0.2, headWidth * 0.055];
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  chain.forEach((point, index) => {
    const before = chain[Math.max(0, index - 1)];
    const after = chain[Math.min(chain.length - 1, index + 1)];
    const direction = { x: after.x - before.x, y: after.y - before.y };
    const length = Math.max(0.001, Math.hypot(direction.x, direction.y));
    const normal = { x: -direction.y / length, y: direction.x / length };
    left.push({ x: point.x + normal.x * widths[index], y: point.y + normal.y * widths[index] });
    right.push({ x: point.x - normal.x * widths[index], y: point.y - normal.y * widths[index] });
  });
  const gradient = context.createLinearGradient(base.x, base.y, points[2].x, points[2].y);
  gradient.addColorStop(0, "#293b78");
  gradient.addColorStop(0.55, "#5a3a91");
  gradient.addColorStop(1, "#2b245b");
  context.fillStyle = gradient;
  context.strokeStyle = "#f4c45d";
  context.lineWidth = Math.max(3, headWidth * 0.025);
  context.beginPath();
  context.moveTo(left[0].x, left[0].y);
  left.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  right.slice().reverse().forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.fill();
  context.stroke();

  // Three small seams make the linked-bone construction visible in the authoring preview.
  context.strokeStyle = "rgba(244, 196, 93, 0.55)";
  context.lineWidth = Math.max(1.5, headWidth * 0.012);
  [1, 2].forEach((index) => {
    context.beginPath();
    context.moveTo(left[index].x, left[index].y);
    context.lineTo(right[index].x, right[index].y);
    context.stroke();
  });
  drawStar(context, points[2].x, points[2].y, headWidth * 0.11, -angle);
  context.restore();
}

function drawStar(context: CanvasRenderingContext2D, x: number, y: number, radius: number, rotation: number) {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.fillStyle = "#ffe47a";
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const pointRadius = index % 2 === 0 ? radius : radius * 0.42;
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const point = { x: Math.cos(angle) * pointRadius, y: Math.sin(angle) * pointRadius };
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  }
  context.closePath();
  context.fill();
  context.restore();
}

function pixelPoint(point: TrackingPoint | undefined, frame: TrackingRenderFrame) {
  return point ? { x: point.x * frame.width, y: point.y * frame.height } : undefined;
}

function makeEyeRecord(
  landmarks: TrackingPoint[],
  frame: TrackingRenderFrame,
  cornerIndices: [number, number],
  verticalPairOne: [number, number],
  verticalPairTwo: [number, number],
  irisIndices: number[]
) {
  const corners = cornerIndices.map((index) => pixelPoint(landmarks[index], frame)).filter((point): point is { x: number; y: number } => Boolean(point));
  if (corners.length !== 2) return undefined;
  const contourCenter = midpoint(corners[0], corners[1]);
  const width = Math.max(4, distance(corners[0], corners[1]));
  const irisPoints = irisIndices.map((index) => pixelPoint(landmarks[index], frame)).filter((point): point is { x: number; y: number } => Boolean(point));
  const irisCenter = averagePixelPoint(irisPoints);
  const center = irisCenter && distance(irisCenter, contourCenter) <= width * 0.6 ? irisCenter : contourCenter;
  const verticalDistances = [verticalPairOne, verticalPairTwo].map(([top, bottom]) => {
    const topPoint = pixelPoint(landmarks[top], frame);
    const bottomPoint = pixelPoint(landmarks[bottom], frame);
    return topPoint && bottomPoint ? distance(topPoint, bottomPoint) : 0;
  }).filter((value) => value > 0);
  const height = verticalDistances.length ? verticalDistances.reduce((sum, value) => sum + value, 0) / verticalDistances.length : width * 0.28;
  return { center, width, height };
}

function averagePixelPoint(points: Array<{ x: number; y: number }>) {
  if (!points.length) return undefined;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function midpoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function roundedLine(context: CanvasRenderingContext2D, start: { x: number; y: number }, end: { x: number; y: number }, width: number, color: string, outline?: string) {
  context.lineCap = "round";
  if (outline) {
    context.strokeStyle = outline;
    context.lineWidth = width + Math.max(2, width * .32);
    context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
  }
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
}

function rotatePoint(point: { x: number; y: number }, angle: number) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return { x: point.x * cosine - point.y * sine, y: point.x * sine + point.y * cosine };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
