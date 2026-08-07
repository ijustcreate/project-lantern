import type { TrackingPoint, TrackingRenderFrame } from "./trackingRuntime";

export type GlassesStyle = "classic" | "playful";
export type HatStyle = "party" | "wizard";

export interface WizardHatRig {
  points: Array<{ x: number; y: number }>;
  velocity: Array<{ x: number; y: number }>;
  previousBase?: { x: number; y: number };
  previousAt?: number;
}

export function createWizardHatRig(): WizardHatRig {
  return {
    points: [],
    velocity: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }]
  };
}

export function drawTrackedGlasses(context: CanvasRenderingContext2D, frame: TrackingRenderFrame, style: GlassesStyle) {
  const landmarks = frame.face?.landmarks;
  if (!landmarks) return;
  const leftEye = pixelPoint(landmarks[33], frame);
  const rightEye = pixelPoint(landmarks[263], frame);
  const nose = pixelPoint(landmarks[168] ?? landmarks[6], frame);
  const leftTemple = pixelPoint(landmarks[127] ?? landmarks[234], frame);
  const rightTemple = pixelPoint(landmarks[356] ?? landmarks[454], frame);
  if (!leftEye || !rightEye || !nose) return;

  const center = midpoint(leftEye, rightEye);
  const eyeSpan = Math.max(20, distance(leftEye, rightEye));
  const angle = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
  const lensWidth = eyeSpan * 0.39;
  const lensHeight = eyeSpan * (style === "classic" ? 0.25 : 0.28);
  const lensOffset = eyeSpan * 0.29;
  const lineWidth = Math.max(3, eyeSpan * 0.045);

  context.save();
  context.translate(center.x, center.y + eyeSpan * 0.025);
  context.rotate(angle);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.lineWidth = lineWidth;

  if (style === "playful") {
    context.strokeStyle = "#b62f63";
    context.fillStyle = "rgba(255, 205, 70, 0.23)";
    [-1, 1].forEach((side) => {
      const x = side * lensOffset;
      context.beginPath();
      context.moveTo(x - lensWidth * 0.52, -lensHeight * 0.5);
      context.quadraticCurveTo(x, -lensHeight * 0.75, x + lensWidth * 0.58, -lensHeight * 0.42);
      context.lineTo(x + lensWidth * 0.48, lensHeight * 0.48);
      context.quadraticCurveTo(x, lensHeight * 0.68, x - lensWidth * 0.48, lensHeight * 0.42);
      context.closePath();
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(x - side * lensWidth * 0.15, -lensHeight * 0.58);
      context.lineTo(x - side * lensWidth * 0.02, -lensHeight * 0.86);
      context.stroke();
    });
  } else {
    context.strokeStyle = "#172635";
    context.fillStyle = "rgba(85, 199, 191, 0.2)";
    [-1, 1].forEach((side) => {
      const x = side * lensOffset;
      roundedRect(context, x - lensWidth / 2, -lensHeight / 2, lensWidth, lensHeight, lensHeight * 0.42);
      context.fill();
      context.stroke();
    });
  }

  // A distinct curved bridge leaves visible space between both lenses.
  context.beginPath();
  context.moveTo(-lensOffset + lensWidth / 2, -lensHeight * 0.03);
  context.quadraticCurveTo(0, -lensHeight * 0.42, lensOffset - lensWidth / 2, -lensHeight * 0.03);
  context.stroke();

  // Temple arms reach toward the sides of the head instead of joining both ovals.
  const inverse = (point: { x: number; y: number } | undefined) => point ? rotatePoint({ x: point.x - center.x, y: point.y - center.y }, -angle) : undefined;
  const localLeftTemple = inverse(leftTemple);
  const localRightTemple = inverse(rightTemple);
  context.beginPath();
  context.moveTo(-lensOffset - lensWidth / 2, -lensHeight * 0.06);
  context.lineTo(localLeftTemple?.x ?? -eyeSpan * 0.68, (localLeftTemple?.y ?? lensHeight * 0.14) + lineWidth * 0.35);
  context.moveTo(lensOffset + lensWidth / 2, -lensHeight * 0.06);
  context.lineTo(localRightTemple?.x ?? eyeSpan * 0.68, (localRightTemple?.y ?? lensHeight * 0.14) + lineWidth * 0.35);
  context.stroke();

  // Small nose pads make the asset read as wearable glasses at lower resolution.
  context.fillStyle = style === "playful" ? "#ffe8a6" : "#dce9ec";
  context.beginPath();
  context.ellipse(-lineWidth * 0.8, Math.max(0, nose.y - center.y) + lineWidth, lineWidth * 0.5, lineWidth * 0.75, -0.3, 0, Math.PI * 2);
  context.ellipse(lineWidth * 0.8, Math.max(0, nose.y - center.y) + lineWidth, lineWidth * 0.5, lineWidth * 0.75, 0.3, 0, Math.PI * 2);
  context.fill();
  context.restore();
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

function midpoint(left: { x: number; y: number }, right: { x: number; y: number }) {
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(right.x - left.x, right.y - left.y);
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
