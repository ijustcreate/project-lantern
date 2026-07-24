import { useEffect, useMemo, useRef } from "react";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import QRCode from "qrcode";
import "@babylonjs/core/Meshes/Builders/boxBuilder";
import "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import "@babylonjs/core/Meshes/Builders/sphereBuilder";
import "@babylonjs/core/Meshes/Builders/tubeBuilder";
import type { DisplayProfile, Donor, LanternState, ScreenId } from "../types";

interface BabylonDonorWallProps {
  state: LanternState;
  screenId: ScreenId;
  interactive?: boolean;
  fitToScreen?: boolean;
  viewMode?: "2d" | "3d";
  resetKey?: number;
  previewProgramId?: string;
  announcementCharacter?: "off" | "inspector";
  announcementActive?: boolean;
  onFps?: (fps: number) => void;
}

const backgroundMediaCache = new Map<string, HTMLImageElement | HTMLVideoElement>();
const donorIconImageCache = new Map<string, HTMLImageElement>();

export function BabylonDonorWall({ state, screenId, interactive = false, fitToScreen = false, viewMode = "3d", resetKey = 0, previewProgramId, announcementCharacter = state.announcement.character, announcementActive = state.announcement.active && targetIncludesAnnouncement(state, screenId), onFps }: BabylonDonorWallProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousAnnouncementActive = useRef(announcementActive);
  const sceneStateKey = useMemo(
    () => {
      const screen = state.screens[screenId];
      const renderScreen = screen
        ? {
            ...screen,
            fps: undefined,
            status: undefined,
            lastHeartbeat: undefined
          }
        : null;
      return JSON.stringify({
        revision: state.revision,
        donors: state.donors,
        board: state.board,
        boardPrograms: state.boardPrograms,
        schedules: state.schedules,
        theme: state.theme,
        screen: renderScreen,
        announcementCharacter,
        announcementActive,
        previewProgramId
      });
    },
    [state.revision, state.donors, state.board, state.boardPrograms, state.schedules, state.theme, state.screens, screenId, announcementCharacter, announcementActive, previewProgramId]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const engine = new Engine(canvas, true, {
      antialias: true,
      preserveDrawingBuffer: true,
      stencil: true
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.015, 0.045, 0.075, 1);

    const screen = state.screens[screenId] ?? Object.values(state.screens)[0];
    const isPortrait = screen.orientation === "Portrait";
    const panelWidth = isPortrait ? 4.8 : 11.4;
    const panelHeight = isPortrait ? 8.1 : 5.7;

    const defaultCameraRadius = isPortrait ? 10.6 : 10.4;
    const camera = new ArcRotateCamera(
      "camera",
      Math.PI / 2,
      Math.PI / 2.08,
      defaultCameraRadius,
      new Vector3(0, 0.2, 0),
      scene
    );
    camera.minZ = 0.1;
    camera.wheelPrecision = 35;
    camera.lowerRadiusLimit = 1.25;
    camera.upperRadiusLimit = 80;
    camera.panningSensibility = interactive ? 700 : 0;
    if (viewMode === "2d") {
      camera.lowerAlphaLimit = Math.PI / 2;
      camera.upperAlphaLimit = Math.PI / 2;
      camera.lowerBetaLimit = Math.PI / 2;
      camera.upperBetaLimit = Math.PI / 2;
    } else {
      camera.lowerAlphaLimit = -Math.PI * 2;
      camera.upperAlphaLimit = Math.PI * 2;
      camera.lowerBetaLimit = 0.22;
      camera.upperBetaLimit = Math.PI - 0.22;
    }
    if (interactive) {
      camera.attachControl(false, false, 2);
    }
    const containContextMenu = (event: MouseEvent) => {
      if (!interactive) return;
      event.preventDefault();
    };
    const containWheel = (event: WheelEvent) => {
      if (!interactive) return;
      event.preventDefault();
      event.stopPropagation();
    };
    canvas.addEventListener("contextmenu", containContextMenu);
    canvas.addEventListener("wheel", containWheel, { passive: false });

    new HemisphericLight("soft-room", new Vector3(-0.2, 1, 0.4), scene).intensity = 0.58 + state.theme.warmth / 260;
    const key = new DirectionalLight("key-light", new Vector3(-0.45, -0.75, 0.35), scene);
    key.intensity = 1.25;
    key.diffuse = Color3.FromHexString(state.theme.warmth > 55 ? "#ffe1aa" : "#d8f5ff");

    const resizeCamera = () => {
      engine.resize();
      if (!fitToScreen) {
        camera.radius = defaultCameraRadius;
        return;
      }
      camera.alpha = Math.PI / 2;
      camera.beta = Math.PI / 2;
      camera.setTarget(Vector3.Zero());
      const aspect = Math.max(0.25, canvas.clientWidth / Math.max(1, canvas.clientHeight));
      const halfVerticalFov = camera.fov / 2;
      const verticalDistance = panelHeight / 2 / Math.tan(halfVerticalFov);
      const horizontalDistance = panelWidth / 2 / (Math.tan(halfVerticalFov) * aspect);
      camera.radius = Math.max(verticalDistance, horizontalDistance) * 1.12;
    };
    resizeCamera();

    let redrawPanel: (animationTime?: number) => void = () => undefined;
    prepareBackgroundMedia(screen, () => redrawPanel());
    const panelTexture = makePanelTexture(scene, state, screenId, screen, previewProgramId);
    const texture = panelTexture.texture;
    redrawPanel = panelTexture.redraw;
    const panelMaterial = new StandardMaterial("baked-donor-lettering", scene);
    panelMaterial.diffuseTexture = texture;
    panelMaterial.diffuseColor = Color3.White();
    panelMaterial.specularColor = state.theme.finish === "Matte" ? new Color3(0.06, 0.07, 0.07) : new Color3(0.24, 0.2, 0.14);
    panelMaterial.specularPower = state.theme.finish === "Soft Gloss" ? 52 : state.theme.finish === "Matte" ? 8 : 24;

    const panel = MeshBuilder.CreateBox(
      "donor-panel",
      {
        width: panelWidth,
        height: panelHeight,
        depth: 0.18
      },
      scene
    );
    panel.material = panelMaterial;

    const backMaterial = new StandardMaterial("solid-panel-back", scene);
    backMaterial.diffuseColor = Color3.FromHexString("#11130f");
    backMaterial.specularColor = Color3.FromHexString("#24241d");
    const panelBack = MeshBuilder.CreateBox("solid-panel-back", { width: panelWidth, height: panelHeight, depth: 0.055 }, scene);
    // The default camera views the panel from +Z, so the solid backing belongs
    // on -Z. Placing it on +Z covers the textured donor face.
    panelBack.position.z = -0.118;
    panelBack.material = backMaterial;

    const trimMaterial = new StandardMaterial("trim", scene);
    trimMaterial.diffuseColor = trimColor(state.theme.trim);
    trimMaterial.specularColor = new Color3(0.82, 0.74, 0.52);

    const topTrim = MeshBuilder.CreateBox("top-trim", { width: panelWidth + 0.16, height: 0.045, depth: 0.28 }, scene);
    topTrim.position.y = panelHeight / 2 + 0.075;
    topTrim.position.z = -0.01;
    topTrim.material = trimMaterial;
    const bottomTrim = topTrim.clone("bottom-trim");
    bottomTrim.position.y = -panelHeight / 2 - 0.075;
    const leftTrim = MeshBuilder.CreateBox("left-trim", { width: 0.045, height: panelHeight + 0.16, depth: 0.28 }, scene);
    leftTrim.position.x = -panelWidth / 2 - 0.075;
    leftTrim.position.z = -0.01;
    leftTrim.material = trimMaterial;
    const rightTrim = leftTrim.clone("right-trim");
    rightTrim.position.x = panelWidth / 2 + 0.075;
    if (screen.style === "donor-wall" && announcementCharacter === "inspector" && (announcementActive || previousAnnouncementActive.current)) {
      addToyInspector(scene, isPortrait, panelWidth, panelHeight, announcementActive);
    }
    previousAnnouncementActive.current = announcementActive;

    if (state.theme.motion > 15 && !fitToScreen && !interactive) {
      scene.onBeforeRenderObservable.add(() => {
        camera.alpha = Math.PI / 2 + Math.sin(performance.now() / 3600) * 0.018;
      });
    }

    let lastReport = 0;
    let lastMediaRedraw = 0;
    engine.runRenderLoop(() => {
      const now = performance.now();
      const animatedBackground = screen.style === "image" && screen.backgroundImage && (screen.backgroundMediaType === "video" || screen.backgroundMediaAnimated);
      const animatedDonors = state.donors.some((donor) => donor.animation && donor.animation !== "none");
      if ((animatedBackground || screen.donorScrollEnabled || animatedDonors || screen.particleAnimationEnabled) && now - lastMediaRedraw > 33) {
        lastMediaRedraw = now;
        redrawPanel(now);
      }
      scene.render();
      if (onFps && now - lastReport > 1000) {
        lastReport = now;
        onFps(Math.round(engine.getFps()));
      }
    });

    const resize = () => resizeCamera();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("contextmenu", containContextMenu);
      canvas.removeEventListener("wheel", containWheel);
      engine.stopRenderLoop();
      scene.dispose();
      engine.dispose();
    };
  }, [sceneStateKey, screenId, interactive, fitToScreen, viewMode, resetKey, onFps]);

  return <canvas className="wall-canvas" ref={canvasRef} tabIndex={interactive ? 0 : -1} aria-label={`Interactive preview for ${state.screens[screenId]?.label ?? screenId}`} />;
}

function makePanelTexture(scene: Scene, state: LanternState, screenId: ScreenId, screen: DisplayProfile, previewProgramId?: string) {
  const isPortrait = screen.orientation === "Portrait";
  const width = isPortrait ? 1536 : 2560;
  const height = isPortrait ? 2560 : 1440;
  const texture = new DynamicTexture("panel-texture", { width, height }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;

  texture.hasAlpha = false;
  const redraw = (animationTime = performance.now()) => {
    drawTextureContent(context, width, height, state, screenId, screen, previewProgramId, animationTime);
    texture.update(false);
  };
  redraw();
  return { texture, redraw };
}

function drawTextureContent(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: LanternState,
  screenId: ScreenId,
  screen: DisplayProfile,
  previewProgramId?: string,
  animationTime = performance.now()
) {
  const isPortrait = screen.orientation === "Portrait";
  const previewProgram = previewProgramId ? state.boardPrograms.find((program) => program.id === previewProgramId) : undefined;
  const activeProgram = previewProgram ?? resolveActiveProgram(state, screenId, new Date());
  const rosterIds = screen.donorIds ?? [];
  const donors = state.donors.filter((donor) => {
    if (!donor.active) return false;
    if (!donor.displayIds?.includes(screenId)) return false;
    if (screen.donorRosterConfigured && !rosterIds.includes(donor.id)) return false;
    if (!screen.donorRosterConfigured && rosterIds.length && !rosterIds.includes(donor.id)) return false;
    if (screen.donorRosterConfigured) return true;
    return !activeProgram || activeProgram.donorIds.includes(donor.id);
  }).sort((a, b) => screen.donorRosterConfigured ? rosterIds.indexOf(a.id) - rosterIds.indexOf(b.id) : 0);
  const baseProgram = activeProgram ?? state.boardPrograms[0];
  const displayProgram = previewProgram
    ? previewProgram
    : ({
        ...baseProgram,
        heading: screen.customHeading || baseProgram?.heading || state.board.portraitHeading,
        subtitle: screen.customSubheading || baseProgram?.subtitle || state.board.portraitSubtitle,
        columns: screen.columns ?? baseProgram?.columns ?? state.board.donorColumns
      } as LanternState["boardPrograms"][number]);

  const draw = () => {
    context.save();
    context.translate(width, 0);
    context.scale(-1, 1);

    if (screen.style === "constellation") {
      drawConstellationBackground(context, width, height, state, isPortrait);
      drawHeading(context, width, height, screenId, state.revision, "constellation", displayProgram);
      drawConstellationDonors(context, width, height, donors, isPortrait);
    } else if (screen.style === "image") {
      drawImageBackground(context, width, height, screen);
      drawHeading(context, width, height, screenId, state.revision, "image", displayProgram);
      drawDonors(context, width, height, donors, isPortrait, state.theme.lettering, screen.layoutScale);
    } else {
      drawMuseumBoard(context, width, height, state, donors, isPortrait, screen.layoutScale, displayProgram, screen, animationTime);
    }

    applyBrightness(context, width, height, screen.brightness);
    context.restore();
  };

  draw();
}

function drawMuseumBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: LanternState,
  donors: Donor[],
  isPortrait: boolean,
  layoutScale: number,
  activeProgram?: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  const navy = "#061a2d";
  const navy2 = "#0a2c42";
  const cream = "#f6edd9";
  const teal = "#39c5c0";
  const gold = "#f3b52f";
  const coral = "#f27e60";
  const scale = layoutScale / 100;

  const chalkboard = state.board.visualStyle === "chalkboard" || state.board.visualStyle === "chalkboard-minimal";
  const galleryPlaque = state.board.visualStyle === "gallery-plaque";
  context.fillStyle = galleryPlaque ? "#101518" : chalkboard ? "#12191d" : navy;
  context.fillRect(0, 0, width, height);
  const wash = context.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, galleryPlaque ? "#242c31" : chalkboard ? "#1c252a" : "#092945");
  wash.addColorStop(0.55, galleryPlaque ? "#151b1f" : chalkboard ? "#131b20" : navy);
  wash.addColorStop(1, galleryPlaque ? "#0a0e11" : chalkboard ? "#0b1014" : "#04111f");
  context.fillStyle = wash;
  context.fillRect(0, 0, width, height);

  if (galleryPlaque) drawGraphiteTexture(context, width, height);
  else if (chalkboard) drawChalkTexture(context, width, height);
  else drawBoardStars(context, width, height, screen, animationTime);
  if (screen?.donorScrollEnabled) {
    drawScrollingDonorBoard(context, width, height, donors, state, isPortrait, scale, activeProgram, screen, animationTime);
    return;
  }
  if (activeProgram?.panels?.length) {
    drawComposableBoard(context, width, height, donors, state, scale, activeProgram, screen, animationTime);
    return;
  }
  if (isPortrait) {
    drawPortraitBoard(context, width, height, donors, state, cream, teal, gold, scale, activeProgram, screen, animationTime);
  } else {
    drawLandscapeBoard(context, width, height, donors, state, cream, teal, gold, coral, scale, activeProgram, screen, animationTime);
  }
}

function drawScrollingDonorBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  isPortrait: boolean,
  scale: number,
  activeProgram: LanternState["boardPrograms"][number] | undefined,
  screen: DisplayProfile,
  animationTime: number
) {
  const galleryPlaque = state.board.visualStyle === "gallery-plaque";
  const chalkboard = state.board.visualStyle === "chalkboard" || state.board.visualStyle === "chalkboard-minimal";
  const gold = galleryPlaque ? "#c9954e" : "#d9a657";
  const ivory = galleryPlaque ? "#f2f1ed" : "#f5f2eb";
  const muted = galleryPlaque ? "rgba(242, 241, 237, 0.58)" : "rgba(245, 242, 235, 0.58)";
  const fadeSolid = galleryPlaque ? "rgba(16, 21, 24, 1)" : chalkboard ? "rgba(18, 25, 29, 1)" : "rgba(6, 26, 45, 1)";
  const fadeClear = galleryPlaque ? "rgba(16, 21, 24, 0)" : chalkboard ? "rgba(18, 25, 29, 0)" : "rgba(6, 26, 45, 0)";
  const heading = screen.customHeading || activeProgram?.heading || state.board.portraitHeading;
  const subtitle = screen.customSubheading || activeProgram?.subtitle || state.board.portraitSubtitle;
  const footer = activeProgram?.footer || state.board.portraitFooter;
  const family = screen.fontFamily ?? "Montserrat";
  const viewportTop = height * (isPortrait ? 0.265 : 0.285);
  const viewportBottom = height * (isPortrait ? 0.845 : 0.815);
  const viewportHeight = viewportBottom - viewportTop;
  const rowHeight = height * (isPortrait ? 0.054 : 0.073);
  const loopGap = Math.max(rowHeight * 2.25, viewportHeight * 0.18);
  const contentHeight = Math.max(rowHeight, donors.length * rowHeight);
  const cycleHeight = contentHeight + loopGap;
  const speedSetting = Math.min(10, Math.max(1, screen.donorScrollSpeed ?? 4));
  const speedPixelsPerSecond = height * (0.006 + speedSetting * 0.0036);
  const offset = ((animationTime / 1000) * speedPixelsPerSecond) % cycleHeight;
  const firstY = viewportBottom + rowHeight * 0.72 - offset;

  context.save();
  context.strokeStyle = "rgba(201, 149, 78, 0.48)";
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.002);
  context.strokeRect(width * 0.035, height * 0.026, width * 0.93, height * 0.948);

  context.textAlign = "center";
  context.fillStyle = gold;
  context.font = `600 ${Math.round((isPortrait ? 42 : 34) * scale)}px ${family}, Inter, sans-serif`;
  fitText(context, heading.toUpperCase(), width / 2, height * (isPortrait ? 0.105 : 0.105), width * 0.76, Math.round((isPortrait ? 42 : 34) * scale), 18);
  context.fillStyle = ivory;
  context.font = `500 ${Math.round((isPortrait ? 66 : 54) * scale)}px ${family}, Inter, sans-serif`;
  fitText(context, subtitle.toUpperCase(), width / 2, height * (isPortrait ? 0.17 : 0.175), width * 0.84, Math.round((isPortrait ? 66 : 54) * scale), 24);
  context.fillStyle = muted;
  context.font = `400 ${Math.round((isPortrait ? 23 : 18) * scale)}px ${family}, Inter, sans-serif`;
  fitText(context, "WITH GRATITUDE, WE RECOGNIZE EVERY SUPPORTER", width / 2, height * (isPortrait ? 0.215 : 0.225), width * 0.7, Math.round((isPortrait ? 23 : 18) * scale), 12);

  context.save();
  context.beginPath();
  context.rect(width * 0.09, viewportTop, width * 0.82, viewportHeight);
  context.clip();

  const drawCycle = (cycleStart: number) => {
    donors.forEach((donor, index) => {
      const y = cycleStart + index * rowHeight;
      if (y < viewportTop - rowHeight || y > viewportBottom + rowHeight) return;
      const showSubtext = donorSubtextVisible(screen, donor.id);
      const nameSize = Math.max(15, Math.round((screen.nameSize ?? (isPortrait ? 34 : 28)) * scale));
      const nameY = y + (showSubtext ? rowHeight * 0.34 : rowHeight * 0.46);
      context.save();
      drawDonorHighlight(context, donor, width / 2, nameY, width * (isPortrait ? 0.72 : 0.62), nameSize, gold);
      applyDonorCanvasEffect(context, donor, animationTime);
      context.fillStyle = donor.nameColor || ivory;
      context.font = `500 ${nameSize}px ${donorFont(donor, family)}, Inter, sans-serif`;
      fitText(context, donor.name.toUpperCase(), width / 2, nameY, width * (isPortrait ? 0.72 : 0.62), nameSize, 13);
      if (screen.showIcons) {
        drawDonorIcons(context, width * (isPortrait ? 0.18 : 0.25), width * (isPortrait ? 0.82 : 0.75), nameY - nameSize * 0.3, donor, screen, donor.accentColor || gold, Math.max(8, nameSize * 0.42));
      }
      if (showSubtext && (donor.subtext || donor.note)) {
        context.fillStyle = muted;
        context.font = `400 ${Math.max(10, Math.round(nameSize * 0.48))}px ${donorFont(donor, family)}, Inter, sans-serif`;
        fitText(context, donor.subtext || donor.note, width / 2, y + rowHeight * 0.7, width * (isPortrait ? 0.65 : 0.55), Math.round(nameSize * 0.48), 9);
      }
      context.restore();
      context.strokeStyle = "rgba(220, 214, 202, 0.14)";
      context.lineWidth = Math.max(1, 1.2 * scale);
      context.beginPath();
      context.moveTo(width * (isPortrait ? 0.2 : 0.27), y + rowHeight * 0.92);
      context.lineTo(width * (isPortrait ? 0.8 : 0.73), y + rowHeight * 0.92);
      context.stroke();
    });
  };

  drawCycle(firstY);
  drawCycle(firstY + cycleHeight);
  drawCycle(firstY - cycleHeight);
  context.restore();

  const fadeHeight = Math.min(viewportHeight * 0.19, height * 0.095);
  const topFade = context.createLinearGradient(0, viewportTop, 0, viewportTop + fadeHeight);
  topFade.addColorStop(0, fadeSolid);
  topFade.addColorStop(1, fadeClear);
  context.fillStyle = topFade;
  context.fillRect(width * 0.09, viewportTop, width * 0.82, fadeHeight);
  const bottomFade = context.createLinearGradient(0, viewportBottom - fadeHeight, 0, viewportBottom);
  bottomFade.addColorStop(0, fadeClear);
  bottomFade.addColorStop(1, fadeSolid);
  context.fillStyle = bottomFade;
  context.fillRect(width * 0.09, viewportBottom - fadeHeight, width * 0.82, fadeHeight);

  context.strokeStyle = gold;
  context.globalAlpha = 0.88;
  context.lineWidth = Math.max(2, 3 * scale);
  context.beginPath();
  context.moveTo(width * 0.14, viewportTop);
  context.lineTo(width * 0.86, viewportTop);
  context.moveTo(width * 0.14, viewportBottom);
  context.lineTo(width * 0.86, viewportBottom);
  context.stroke();
  context.globalAlpha = 1;
  context.fillStyle = gold;
  context.beginPath();
  context.arc(width / 2, viewportTop, Math.max(3, 5 * scale), 0, Math.PI * 2);
  context.arc(width / 2, viewportBottom, Math.max(3, 5 * scale), 0, Math.PI * 2);
  context.fill();

  drawHeart(context, width / 2, height * 0.9, Math.min(width, height) * 0.016, gold);
  context.fillStyle = gold;
  context.font = `500 ${Math.round((isPortrait ? 22 : 17) * scale)}px ${family}, Inter, sans-serif`;
  fitText(context, footer.toUpperCase(), width / 2, height * (isPortrait ? 0.945 : 0.94), width * 0.66, Math.round((isPortrait ? 22 : 17) * scale), 11);
  if (screen.qrEnabled && screen.qrUrl) {
    const qrSize = Math.min(width, height) * (isPortrait ? 0.085 : 0.08);
    drawQr(context, width * 0.075, height * (isPortrait ? 0.855 : 0.84), qrSize, ivory, screen.qrUrl);
  }
  context.restore();
}

function drawComposableBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  scale: number,
  program: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  const ivory = "#f5f2eb";
  const gold = "#d9a657";
  const muted = "#bdc7c7";
  const teal = "#79cac6";
  const font = screen?.fontFamily ?? "Montserrat";
  const panels = program.panels ?? [];
  const gap = height * 0.009;
  const left = width * 0.075;
  const contentWidth = width * 0.85;
  const top = height * 0.055;
  const bottom = height * 0.055;
  const weights = panels.map((panel) => panel.size === "feature" ? 2.55 : panel.size === "compact" ? 0.62 : 1.15);
  const available = height - top - bottom - gap * Math.max(0, panels.length - 1);
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  let y = top;

  context.strokeStyle = "rgba(217, 166, 87, 0.62)";
  context.lineWidth = Math.max(2, 4 * scale);
  context.strokeRect(width * 0.03, height * 0.022, width * 0.94, height * 0.956);

  panels.forEach((panel, panelIndex) => {
    const panelHeight = available * (weights[panelIndex] / weightTotal);
    const centerX = width / 2;
    const centerY = y + panelHeight / 2;
    context.save();
    context.beginPath();
    context.rect(left, y, contentWidth, panelHeight);
    context.clip();

    if (panel.type === "heading") {
      context.textAlign = "center";
      context.fillStyle = gold;
      context.font = `600 ${Math.max(15, Math.round(panelHeight * 0.13 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.eyebrow ?? "", centerX, y + panelHeight * 0.23, contentWidth * 0.75, Math.round(panelHeight * 0.13 * scale), 11);
      context.fillStyle = ivory;
      context.font = `600 ${Math.max(24, Math.round(panelHeight * 0.27 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.title, centerX, y + panelHeight * 0.56, contentWidth * 0.92, Math.round(panelHeight * 0.27 * scale), 18);
      if (panel.body) {
        context.fillStyle = muted;
        context.font = `400 ${Math.max(12, Math.round(panelHeight * 0.105 * scale))}px ${font}, Inter, sans-serif`;
        fitText(context, panel.body, centerX, y + panelHeight * 0.78, contentWidth * 0.78, Math.round(panelHeight * 0.105 * scale), 10);
      }
    }

    if (panel.type === "donors") {
      const columns = panel.columns ?? program.columns;
      const titleHeight = Math.min(panelHeight * 0.18, height * 0.04);
      context.textAlign = "center";
      context.fillStyle = gold;
      context.font = `700 ${Math.max(13, Math.round(titleHeight * 0.52 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.title, centerX, y + titleHeight * 0.72, contentWidth * 0.8, Math.round(titleHeight * 0.52 * scale), 11);
      const rows = Math.max(1, Math.ceil(donors.length / columns));
      const listTop = y + titleHeight;
      const rowHeight = (panelHeight - titleHeight) / rows;
      donors.forEach((donor, index) => {
        const showSubtext = donorSubtextVisible(screen, donor.id);
        const column = index % columns;
        const row = Math.floor(index / columns);
        const cellWidth = contentWidth / columns;
        const x = left + cellWidth * (column + 0.5);
        const baseline = listTop + rowHeight * (row + (showSubtext && (donor.subtext || donor.note) ? 0.47 : 0.58));
        const baseSize = Math.min(screen?.nameSize ?? 28, Math.max(10, rowHeight * (showSubtext ? 0.34 : 0.48)));
        context.save();
        drawDonorHighlight(context, donor, x, baseline, cellWidth * 0.88, baseSize * scale, gold);
        applyDonorCanvasEffect(context, donor, animationTime);
        context.fillStyle = donor.nameColor || ivory;
        context.font = `500 ${Math.round(baseSize * scale)}px ${donorFont(donor, font)}, Inter, sans-serif`;
        fitText(context, donor.name, x, baseline, cellWidth * 0.88, Math.round(baseSize * scale), 9);
        if (screen?.showIcons) drawDonorIcons(context, left + cellWidth * column + cellWidth * 0.05, left + cellWidth * column + cellWidth * 0.95, baseline - baseSize * 0.25, donor, screen, donor.accentColor || gold, Math.max(7, baseSize * 0.35));
        if (showSubtext && (donor.subtext || donor.note)) {
          context.fillStyle = "rgba(245, 242, 235, 0.6)";
          context.font = `400 ${Math.max(8, Math.round(baseSize * 0.48))}px ${donorFont(donor, font)}, Inter, sans-serif`;
          fitText(context, donor.subtext || donor.note, x, baseline + rowHeight * 0.28, cellWidth * 0.84, Math.round(baseSize * 0.48), 7);
        }
        context.restore();
        context.strokeStyle = "rgba(217, 166, 87, 0.2)";
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(left + cellWidth * column + cellWidth * 0.08, listTop + rowHeight * (row + 0.94));
        context.lineTo(left + cellWidth * (column + 1) - cellWidth * 0.08, listTop + rowHeight * (row + 0.94));
        context.stroke();
      });
    }

    if (panel.type === "message" || panel.type === "story") {
      const imageWidth = panel.type === "story" ? contentWidth * 0.28 : 0;
      if (panel.type === "story") {
        context.fillStyle = "rgba(121, 202, 198, 0.12)";
        context.fillRect(left, y + panelHeight * 0.08, imageWidth, panelHeight * 0.84);
      }
      const textLeft = left + imageWidth + (imageWidth ? contentWidth * 0.04 : 0);
      const textWidth = contentWidth - imageWidth - (imageWidth ? contentWidth * 0.04 : 0);
      context.textAlign = imageWidth ? "left" : "center";
      const textX = imageWidth ? textLeft : centerX;
      context.fillStyle = teal;
      context.font = `700 ${Math.max(10, Math.round(panelHeight * 0.1 * scale))}px ${font}, Inter, sans-serif`;
      context.fillText(panel.eyebrow ?? "", textX, y + panelHeight * 0.28);
      context.fillStyle = ivory;
      context.font = `650 ${Math.max(16, Math.round(panelHeight * 0.19 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.title, textX, y + panelHeight * 0.52, textWidth * 0.96, Math.round(panelHeight * 0.19 * scale), 12);
      context.fillStyle = muted;
      context.font = `400 ${Math.max(10, Math.round(panelHeight * 0.095 * scale))}px ${font}, Inter, sans-serif`;
      const lines = wrapLines(context, panel.body ?? "", textWidth * 0.94, 2);
      lines.forEach((line, lineIndex) => context.fillText(line, textX, y + panelHeight * (0.72 + lineIndex * 0.13)));
    }

    if (panel.type === "qr") {
      const qrSize = Math.min(panelHeight * 0.72, contentWidth * 0.18);
      drawQr(context, left + contentWidth * 0.04, centerY - qrSize / 2, qrSize, ivory, screen?.qrUrl ?? state.board.qrUrl);
      const textX = left + contentWidth * 0.04 + qrSize + contentWidth * 0.05;
      context.textAlign = "left";
      context.fillStyle = gold;
      context.font = `700 ${Math.max(10, Math.round(panelHeight * 0.12 * scale))}px ${font}, Inter, sans-serif`;
      context.fillText(panel.eyebrow ?? "", textX, y + panelHeight * 0.31);
      context.fillStyle = ivory;
      context.font = `650 ${Math.max(14, Math.round(panelHeight * 0.18 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.title, textX, y + panelHeight * 0.56, contentWidth * 0.62, Math.round(panelHeight * 0.18 * scale), 11);
      context.fillStyle = muted;
      context.font = `400 ${Math.max(9, Math.round(panelHeight * 0.09 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, panel.body ?? "", textX, y + panelHeight * 0.75, contentWidth * 0.62, Math.round(panelHeight * 0.09 * scale), 8);
    }

    if (panel.type === "footer") {
      context.textAlign = "center";
      context.fillStyle = gold;
      context.font = `600 ${Math.max(10, Math.round(panelHeight * 0.22 * scale))}px ${font}, Inter, sans-serif`;
      fitText(context, `♡   ${panel.title}   ♡`, centerX, centerY + panelHeight * 0.08, contentWidth * 0.92, Math.round(panelHeight * 0.22 * scale), 9);
    }

    context.restore();
    y += panelHeight + gap;
  });
}

function drawPortraitBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  cream: string,
  teal: string,
  gold: string,
  scale: number,
  activeProgram?: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  if (state.board.visualStyle === "gallery-plaque") {
    drawGalleryPlaque(context, width, height, donors, state, scale, true, activeProgram, screen, animationTime);
    return;
  }
  if (state.board.visualStyle === "chalkboard" || state.board.visualStyle === "chalkboard-minimal") {
    drawChalkboardPortrait(context, width, height, donors, state, cream, teal, gold, scale, activeProgram, screen, animationTime);
    return;
  }
  context.textAlign = "center";
  context.fillStyle = cream;
  context.font = `800 ${Math.round(88 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(activeProgram?.heading ?? state.board.portraitHeading, width / 2, height * 0.105);
  context.fillStyle = teal;
  context.font = `700 ${Math.round(34 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(activeProgram?.subtitle ?? state.board.portraitSubtitle, width / 2, height * 0.14);

  const groups = [
    ["COMMUNITY PARTNERS", "Community", "#bda8ff"],
    ["GOLD SUPPORTERS", "Corporate", gold],
    ["SILVER SUPPORTERS", "Family", teal]
  ] as const;
  let y = height * 0.22;
  groups.forEach(([label, category, accent], groupIndex) => {
    const members = donors.filter((donor) => donor.category === category).slice(0, 5);
    drawTierBadge(context, width * 0.16, y - 10, groupIndex, accent);
    context.textAlign = "left";
    context.fillStyle = accent;
    context.font = `800 ${Math.round(26 * scale)}px Inter, Segoe UI, sans-serif`;
    context.fillText(label, width * 0.28, y);
    members.forEach((donor, index) => {
      const donorY = y + 42 * scale + index * 31 * scale;
      context.save();
      applyDonorCanvasEffect(context, donor, animationTime);
      context.fillStyle = donor.nameColor || cream;
      context.font = `500 ${Math.round(24 * scale)}px ${donorFont(donor, "Inter")}, Segoe UI, sans-serif`;
      context.fillText(donor.name, width * 0.28, donorY);
      context.restore();
    });
    context.strokeStyle = "rgba(246, 237, 217, 0.34)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width * 0.28, y + 60 * scale + members.length * 31 * scale);
    context.lineTo(width * 0.86, y + 60 * scale + members.length * 31 * scale);
    context.stroke();
    y += (members.length * 31 + 84) * scale;
  });

  drawSilhouetteWave(context, width, height * 0.77, height * 0.1, teal);
  drawFooter(context, width, height, state, gold, teal, true);
}

function drawChalkboardPortrait(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  cream: string,
  _teal: string,
  gold: string,
  scale: number,
  activeProgram?: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  const heading = activeProgram?.heading ?? state.board.portraitHeading;
  const subtitle = activeProgram?.subtitle ?? state.board.portraitSubtitle;
  const description = activeProgram?.description ?? state.board.portraitDescription;
  const footer = activeProgram?.footer ?? state.board.portraitFooter;
  const columns = activeProgram?.columns ?? state.board.donorColumns;
  context.strokeStyle = "rgba(214, 151, 61, 0.62)";
  context.lineWidth = 5;
  context.strokeRect(width * 0.035, height * 0.025, width * 0.93, height * 0.95);
  context.textAlign = "center";
  context.fillStyle = gold;
  context.font = `500 ${Math.round(40 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(heading, width / 2, height * 0.14);
  context.fillStyle = cream;
  context.font = `500 ${Math.round(67 * scale)}px Inter, Segoe UI, sans-serif`;
  fitText(context, subtitle, width / 2, height * 0.2, width * 0.82, Math.round(67 * scale), Math.round(30 * scale));
  context.fillStyle = gold;
  context.font = `500 ${Math.round(28 * scale)}px Inter, Segoe UI, sans-serif`;
  fitText(context, description, width / 2, height * 0.25, width * 0.7, Math.round(28 * scale), Math.round(16 * scale));
  context.strokeStyle = "rgba(214, 151, 61, 0.48)";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(width * 0.12, height * 0.29);
  context.lineTo(width * 0.88, height * 0.29);
  context.stroke();

  const maxRows = Math.ceil(donors.length / columns);
  const rowHeight = Math.min(height * 0.055, (height * 0.56) / Math.max(maxRows, 1));
  const startY = height * 0.34;
  donors.forEach((donor, index) => {
    const showSubtext = donorSubtextVisible(screen, donor.id);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = columns === 1 ? width / 2 : width * (column === 0 ? 0.29 : 0.71);
    const y = startY + row * rowHeight;
    const baseSize = Math.min(screen?.nameSize ?? (columns === 1 ? 29 : 25), columns === 1 ? 38 : 30);
    const family = screen?.fontFamily ?? "Montserrat";
    context.save();
    drawDonorHighlight(context, donor, x, y, width * (columns === 1 ? 0.7 : 0.36), baseSize * scale, gold);
    applyDonorCanvasEffect(context, donor, animationTime);
    context.fillStyle = donor.nameColor || cream;
    context.font = `500 ${Math.round(baseSize * scale)}px ${donorFont(donor, family)}, Inter, Segoe UI, sans-serif`;
    fitText(context, donor.name.toUpperCase(), x, y, width * (columns === 1 ? 0.7 : 0.36), Math.round(baseSize * scale), Math.round(13 * scale));
    if (screen?.showIcons) drawDonorIcons(context, x - width * (columns === 1 ? 0.36 : 0.205), x + width * (columns === 1 ? 0.36 : 0.205), y - baseSize * 0.3, donor, screen, donor.accentColor || gold, 11 * scale);
    if (showSubtext && (donor.subtext || donor.note)) {
      context.fillStyle = "rgba(246, 237, 217, 0.62)";
      context.font = `400 ${Math.round(Math.max(10, baseSize * 0.48) * scale)}px ${donorFont(donor, family)}, Inter, sans-serif`;
      fitText(context, donor.subtext || donor.note, x, y + rowHeight * 0.3, width * (columns === 1 ? 0.65 : 0.34), Math.round(baseSize * 0.48 * scale), Math.round(9 * scale));
    }
    context.restore();
    if (state.board.visualStyle === "chalkboard-minimal") {
      if (row < maxRows - 1) {
        context.fillStyle = gold;
        context.beginPath();
        context.arc(x, y + rowHeight * 0.48, Math.max(3, 5 * scale), 0, Math.PI * 2);
        context.fill();
      }
    } else {
      context.strokeStyle = "rgba(220, 212, 193, 0.23)";
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x - width * (columns === 1 ? 0.3 : 0.18), y + rowHeight * 0.46);
      context.lineTo(x + width * (columns === 1 ? 0.3 : 0.18), y + rowHeight * 0.46);
      context.stroke();
    }
  });
  if (columns === 2) {
    context.strokeStyle = "rgba(214, 151, 61, 0.62)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width / 2, height * 0.33);
    context.lineTo(width / 2, height * 0.83);
    context.stroke();
  }
  context.fillStyle = gold;
  context.font = `500 ${Math.round(28 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText("♡", width / 2, height * 0.91);
  context.font = `500 ${Math.round(22 * scale)}px Inter, Segoe UI, sans-serif`;
  drawHeart(context, width / 2, height * 0.9, 18 * scale, gold);
  context.fillText(footer, width / 2, height * 0.94);
  if (screen?.qrEnabled && screen.qrUrl) {
    drawQr(context, width * 0.09, height * 0.84, width * 0.1, cream, screen.qrUrl);
  }
}

function drawGalleryPlaque(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  scale: number,
  isPortrait: boolean,
  activeProgram?: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  const gold = "#c9954e";
  const ivory = "#f2f1ed";
  const mutedIvory = "rgba(242, 241, 237, 0.76)";
  const heading = activeProgram?.heading ?? state.board.portraitHeading;
  const subtitle = activeProgram?.subtitle ?? state.board.portraitSubtitle;
  const description = activeProgram?.description ?? state.board.portraitDescription;
  const footer = activeProgram?.footer ?? state.board.portraitFooter;
  const columns = activeProgram?.columns ?? state.board.donorColumns;
  const family = screen?.fontFamily ?? "Montserrat";

  context.save();
  const vignette = context.createRadialGradient(width * 0.5, height * 0.42, 0, width * 0.5, height * 0.46, Math.max(width, height) * 0.72);
  vignette.addColorStop(0, "rgba(70, 80, 84, 0.08)");
  vignette.addColorStop(0.68, "rgba(4, 7, 9, 0.08)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.48)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  const outerInset = Math.min(width, height) * 0.025;
  const innerInset = outerInset + Math.min(width, height) * 0.018;
  context.lineJoin = "miter";
  context.strokeStyle = "#050708";
  context.lineWidth = Math.max(14, Math.min(width, height) * 0.018);
  context.strokeRect(outerInset, outerInset, width - outerInset * 2, height - outerInset * 2);
  context.strokeStyle = "rgba(176, 185, 188, 0.28)";
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.0022);
  context.strokeRect(innerInset, innerInset, width - innerInset * 2, height - innerInset * 2);
  context.strokeStyle = "rgba(201, 149, 78, 0.28)";
  context.lineWidth = Math.max(1.5, Math.min(width, height) * 0.0012);
  context.strokeRect(innerInset + 7, innerInset + 7, width - (innerInset + 7) * 2, height - (innerInset + 7) * 2);

  const crestY = height * (isPortrait ? 0.082 : 0.07);
  drawLeafCrest(context, width / 2, crestY, Math.min(width, height) * (isPortrait ? 0.047 : 0.055), gold);
  drawTrackedLabel(context, heading.toUpperCase(), width / 2, height * (isPortrait ? 0.145 : 0.145), width * 0.68, Math.round((isPortrait ? 42 : 36) * scale), 18, family, 500, gold, 0.34);

  context.strokeStyle = gold;
  context.globalAlpha = 0.72;
  context.lineWidth = Math.max(2, 2.4 * scale);
  context.beginPath();
  context.moveTo(width * 0.47, height * (isPortrait ? 0.162 : 0.165));
  context.lineTo(width * 0.53, height * (isPortrait ? 0.162 : 0.165));
  context.stroke();
  context.globalAlpha = 1;

  drawTrackedLabel(context, subtitle.toUpperCase(), width / 2, height * (isPortrait ? 0.205 : 0.225), width * 0.82, Math.round((isPortrait ? 62 : 58) * scale), 25, family, 400, ivory, 0.2);
  drawTrackedLabel(context, description, width / 2, height * (isPortrait ? 0.245 : 0.275), width * 0.74, Math.round((isPortrait ? 24 : 21) * scale), 13, family, 400, mutedIvory, 0.035);

  context.strokeStyle = gold;
  context.globalAlpha = 0.55;
  context.lineWidth = Math.max(1.5, 2 * scale);
  context.beginPath();
  context.moveTo(width * 0.47, height * (isPortrait ? 0.275 : 0.305));
  context.lineTo(width * 0.53, height * (isPortrait ? 0.275 : 0.305));
  context.stroke();
  context.globalAlpha = 1;

  const donorTop = height * (isPortrait ? 0.31 : 0.35);
  const donorBottom = height * (isPortrait ? 0.84 : 0.79);
  const maxRows = Math.max(1, Math.ceil(donors.length / columns));
  const rowHeight = (donorBottom - donorTop) / maxRows;
  const requestedNameSize = screen?.nameSize ?? (columns === 1 ? 31 : 27);
  const hasAnySubtext = donors.some((donor) => donorSubtextVisible(screen, donor.id) && (donor.subtext || donor.note));
  const nameSize = Math.max(13, Math.min(requestedNameSize * scale, rowHeight * (hasAnySubtext ? 0.34 : 0.43)));

  donors.forEach((donor, index) => {
    const showSubtext = donorSubtextVisible(screen, donor.id);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = columns === 1 ? width / 2 : width * (column === 0 ? 0.29 : 0.71);
    const cellWidth = width * (columns === 1 ? 0.7 : 0.35);
    const y = donorTop + row * rowHeight + rowHeight * (showSubtext ? 0.37 : 0.46);
    context.save();
    drawDonorHighlight(context, donor, x, y, cellWidth, nameSize, gold);
    applyDonorCanvasEffect(context, donor, animationTime);
    drawTrackedLabel(context, donor.name.toUpperCase(), x, y, cellWidth, Math.round(nameSize), 11, donorFont(donor, family), 400, donor.nameColor || ivory, 0.13);

    if (screen?.showIcons) {
      drawDonorIcons(context, x - cellWidth * 0.54, x + cellWidth * 0.54, y - nameSize * 0.3, donor, screen, donor.accentColor || gold, Math.max(8, nameSize * 0.42));
    }
    if (showSubtext && (donor.subtext || donor.note)) {
      drawTrackedLabel(context, donor.subtext || donor.note, x, y + rowHeight * 0.25, cellWidth * 0.92, Math.round(Math.max(10, nameSize * 0.48)), 9, donorFont(donor, family), 400, "rgba(242, 241, 237, 0.5)", 0.025);
    }
    context.restore();

    if (row < maxRows - 1) {
      const dividerY = donorTop + (row + 1) * rowHeight;
      context.strokeStyle = "rgba(220, 214, 202, 0.16)";
      context.lineWidth = Math.max(1, 1.2 * scale);
      context.beginPath();
      context.moveTo(x - cellWidth * 0.48, dividerY);
      context.lineTo(x + cellWidth * 0.48, dividerY);
      context.stroke();
    }
  });

  if (columns === 2) {
    context.strokeStyle = "rgba(201, 149, 78, 0.46)";
    context.lineWidth = Math.max(1.5, 2 * scale);
    context.beginPath();
    context.moveTo(width / 2, donorTop - rowHeight * 0.08);
    context.lineTo(width / 2, donorBottom + rowHeight * 0.04);
    context.stroke();
  }

  const heartY = height * (isPortrait ? 0.9 : 0.875);
  const ruleGap = width * 0.035;
  const ruleOuter = width * (isPortrait ? 0.27 : 0.35);
  context.strokeStyle = gold;
  context.globalAlpha = 0.78;
  context.lineWidth = Math.max(1.5, 2 * scale);
  context.beginPath();
  context.moveTo(width / 2 - ruleOuter, heartY);
  context.lineTo(width / 2 - ruleGap, heartY);
  context.moveTo(width / 2 + ruleGap, heartY);
  context.lineTo(width / 2 + ruleOuter, heartY);
  context.stroke();
  context.globalAlpha = 1;
  drawHeart(context, width / 2, heartY, Math.min(width, height) * 0.018, gold);
  drawTrackedLabel(context, footer.toUpperCase(), width / 2, height * (isPortrait ? 0.945 : 0.935), width * 0.72, Math.round((isPortrait ? 22 : 18) * scale), 11, family, 400, gold, 0.25);

  if (screen?.qrEnabled && screen.qrUrl) {
    const qrSize = Math.min(width, height) * (isPortrait ? 0.095 : 0.1);
    drawQr(context, width * 0.075, height * (isPortrait ? 0.855 : 0.83), qrSize, ivory, screen.qrUrl);
  }
  context.restore();
}

function drawLeafCrest(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size * 0.035);
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(x, y + size * 0.72);
  context.bezierCurveTo(x - size * 0.02, y + size * 0.34, x + size * 0.03, y - size * 0.08, x + size * 0.18, y - size * 0.62);
  context.stroke();

  const leaves = [
    { dx: -0.23, dy: 0.22, angle: -0.72 },
    { dx: 0.2, dy: 0.02, angle: 0.7 },
    { dx: -0.16, dy: -0.18, angle: -0.64 },
    { dx: 0.16, dy: -0.34, angle: 0.62 },
    { dx: 0.1, dy: -0.58, angle: 0.22 }
  ];
  leaves.forEach((leaf) => {
    const cx = x + leaf.dx * size;
    const cy = y + leaf.dy * size;
    context.save();
    context.translate(cx, cy);
    context.rotate(leaf.angle);
    context.beginPath();
    context.moveTo(0, size * 0.2);
    context.bezierCurveTo(-size * 0.18, size * 0.04, -size * 0.16, -size * 0.2, 0, -size * 0.3);
    context.bezierCurveTo(size * 0.16, -size * 0.2, size * 0.18, size * 0.04, 0, size * 0.2);
    context.stroke();
    context.restore();
  });
  context.restore();
}

function drawTrackedLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  minSize: number,
  family: string,
  weight: number,
  color: string,
  trackingRatio: number
) {
  const characters = Array.from(text);
  let size = fontSize;
  let tracking = Math.max(1, size * trackingRatio);
  let measured = 0;
  do {
    context.font = `${weight} ${Math.round(size)}px ${family}, Inter, Segoe UI, sans-serif`;
    tracking = Math.max(1, size * trackingRatio);
    measured = characters.reduce((total, character) => total + context.measureText(character).width, 0) + Math.max(0, characters.length - 1) * tracking;
    if (measured <= maxWidth || size <= minSize) break;
    size -= 1;
  } while (size >= minSize);

  context.save();
  context.fillStyle = color;
  context.textAlign = "left";
  let cursor = x - measured / 2;
  characters.forEach((character) => {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + tracking;
  });
  context.restore();
}

function applyDonorCanvasEffect(context: CanvasRenderingContext2D, donor: Donor, animationTime: number) {
  const phase = (animationTime / 1000 + donor.id.length * 0.37) % (Math.PI * 2);
  if (donor.animation === "gentle-pulse") context.globalAlpha *= 0.88 + (Math.sin(phase * 1.25) + 1) * 0.06;
  if (donor.animation === "soft-glow") {
    context.shadowColor = donor.accentColor || donor.nameColor || "#d9a657";
    context.shadowBlur = 5 + (Math.sin(phase) + 1) * 6;
  }
  if (donor.animation === "shimmer") {
    context.shadowColor = donor.accentColor || "#f2d08c";
    context.shadowBlur = 3 + (Math.sin(phase * 0.72) + 1) * 4;
    context.globalAlpha *= 0.9 + (Math.sin(phase * 0.72) + 1) * 0.05;
  }
}

function drawDonorHighlight(context: CanvasRenderingContext2D, donor: Donor, x: number, y: number, width: number, height: number, fallbackAccent: string) {
  const accent = donor.accentColor || fallbackAccent;
  if (donor.highlight === "underline") {
    context.save();
    context.strokeStyle = accent;
    context.globalAlpha = 0.72;
    context.lineWidth = Math.max(1, height * 0.035);
    context.beginPath();
    context.moveTo(x - width * 0.34, y + height * 0.34);
    context.lineTo(x + width * 0.34, y + height * 0.34);
    context.stroke();
    context.restore();
  } else if (donor.highlight === "soft-box") {
    context.save();
    context.fillStyle = accent;
    context.globalAlpha = 0.1;
    context.fillRect(x - width * 0.45, y - height * 0.68, width * 0.9, height * 1.08);
    context.strokeStyle = accent;
    context.globalAlpha = 0.32;
    context.lineWidth = 1;
    context.strokeRect(x - width * 0.45, y - height * 0.68, width * 0.9, height * 1.08);
    context.restore();
  }
}

function donorFont(donor: Donor, fallback: string) {
  return donor.fontOverride || fallback;
}

function drawDonorIcons(context: CanvasRenderingContext2D, leftX: number, rightX: number, y: number, donor: Donor, screen: DisplayProfile, color: string, size: number) {
  drawDonorIcon(context, leftX, y, screen.donorIconStyle ?? "circle", color, size, donor.customIconImage);
  if (screen.donorIconPlacement === "both") drawDonorIcon(context, rightX, y, screen.donorIconStyle ?? "circle", color, size, donor.customIconImage);
}

function drawDonorIcon(context: CanvasRenderingContext2D, x: number, y: number, icon: "circle" | "diamond" | "dash", color: string, size: number, customIconImage?: string) {
  if (customIconImage) {
    let image = donorIconImageCache.get(customIconImage);
    if (!image) {
      image = new Image();
      image.src = customIconImage;
      donorIconImageCache.set(customIconImage, image);
    }
    if (image.complete && image.naturalWidth) {
      context.drawImage(image, x - size, y - size, size * 2, size * 2);
      return;
    }
  }
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 2;
  if (icon === "circle") {
    context.beginPath(); context.arc(x, y, size * 0.48, 0, Math.PI * 2); context.fill();
  } else if (icon === "diamond") {
    context.beginPath(); context.moveTo(x, y - size); context.lineTo(x + size * 0.72, y); context.lineTo(x, y + size); context.lineTo(x - size * 0.72, y); context.closePath(); context.stroke();
  } else {
    context.lineWidth = Math.max(2, size * 0.28);
    context.beginPath(); context.moveTo(x - size * 0.78, y); context.lineTo(x + size * 0.78, y); context.stroke();
  }
  context.restore();
}

function drawHeart(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(2, size * 0.12);
  context.beginPath();
  context.moveTo(x, y + size);
  context.bezierCurveTo(x - size * 1.8, y - size * 0.2, x - size, y - size * 1.2, x, y - size * 0.25);
  context.bezierCurveTo(x + size, y - size * 1.2, x + size * 1.8, y - size * 0.2, x, y + size);
  context.stroke();
  context.restore();
}

function drawChalkTexture(context: CanvasRenderingContext2D, width: number, height: number) {
  context.globalAlpha = 0.08;
  context.strokeStyle = "#d5d0c2";
  context.lineWidth = 2;
  for (let index = 0; index < 80; index += 1) {
    const y = (index / 80) * height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y + Math.sin(index * 1.4) * 10);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawGraphiteTexture(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  for (let index = 0; index < 190; index += 1) {
    const x = ((index * 733 + 191) % 997) / 997 * width;
    const y = ((index * 487 + 313) % 991) / 991 * height;
    const length = width * (0.035 + ((index * 37) % 70) / 1000);
    const bend = Math.sin(index * 1.73) * height * 0.0025;
    context.strokeStyle = index % 3 === 0 ? "rgba(218, 224, 224, 0.025)" : "rgba(0, 0, 0, 0.055)";
    context.lineWidth = 1 + (index % 4) * 0.45;
    context.beginPath();
    context.moveTo(x - length / 2, y);
    context.quadraticCurveTo(x, y + bend, x + length / 2, y + Math.sin(index * 0.91) * 3);
    context.stroke();
  }
  context.restore();
}

function drawLandscapeBoard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  state: LanternState,
  cream: string,
  teal: string,
  gold: string,
  coral: string,
  scale: number,
  activeProgram?: LanternState["boardPrograms"][number],
  screen?: DisplayProfile,
  animationTime = performance.now()
) {
  if (state.board.visualStyle === "gallery-plaque") {
    drawGalleryPlaque(context, width, height, donors, state, scale, false, activeProgram, screen, animationTime);
    return;
  }
  context.textAlign = "center";
  context.fillStyle = cream;
  context.font = `800 ${Math.round(76 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.landscapeHeadingPrimary, width * 0.43, height * 0.105);
  context.fillStyle = teal;
  context.fillText(state.board.landscapeHeadingAccent, width * 0.68, height * 0.105);
  context.font = `700 ${Math.round(27 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.landscapeSubtitle, width / 2, height * 0.15);

  const left = width * 0.055;
  const top = height * 0.22;
  const bottom = height * 0.79;
  context.fillStyle = "rgba(6, 26, 45, 0.82)";
  context.fillRect(left, top, width * 0.22, bottom - top);
  context.strokeStyle = "rgba(246, 237, 217, 0.22)";
  context.strokeRect(left, top, width * 0.22, bottom - top);
  context.textAlign = "left";
  context.fillStyle = cream;
  context.font = `800 ${Math.round(22 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.storyEyebrow, left + 22, top + 34);
  context.fillStyle = coral;
  context.fillRect(left + 22, top + 52, width * 0.17, height * 0.13);
  context.fillStyle = cream;
  context.font = `700 ${Math.round(20 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.storyTitle, left + 22, top + height * 0.22);
  context.font = `500 ${Math.round(16 * scale)}px Inter, Segoe UI, sans-serif`;
  const storyLines = wrapLines(context, state.board.storyBody, width * 0.17, 3);
  storyLines.forEach((line, index) => context.fillText(line, left + 22, top + height * 0.255 + index * 24));
  if (screen?.qrEnabled !== false) drawQr(context, left + width * 0.14, bottom - 64, 48, cream, screen?.qrUrl ?? state.board.qrUrl);
  context.font = `800 ${Math.round(14 * scale)}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.qrLabel, left + 22, bottom - 18);

  const columns = [
    ["COMMUNITY PARTNERS", "Community", "#bda8ff"],
    ["GOLD SUPPORTERS", "Corporate", gold],
    ["SILVER SUPPORTERS", "Family", teal]
  ] as const;
  const columnX = [0.31, 0.53, 0.75];
  columns.forEach(([label, category, accent], index) => {
    const x = width * columnX[index];
    context.fillStyle = accent;
    context.font = `800 ${Math.round(18 * scale)}px Inter, Segoe UI, sans-serif`;
    context.fillText(label, x, top + 34);
    donors.filter((donor) => donor.category === category).slice(0, 5).forEach((donor, donorIndex) => {
      context.save();
      applyDonorCanvasEffect(context, donor, animationTime);
      context.fillStyle = donor.nameColor || cream;
      context.font = `500 ${Math.round(18 * scale)}px ${donorFont(donor, "Inter")}, Segoe UI, sans-serif`;
      context.fillText(donor.name, x, top + 76 + donorIndex * 34);
      context.restore();
    });
    context.strokeStyle = "rgba(246, 237, 217, 0.2)";
    context.beginPath();
    context.moveTo(x - 18, top + 50);
    context.lineTo(x - 18, bottom - 12);
    context.stroke();
  });
  drawSilhouetteWave(context, width, bottom - 4, height * 0.11, teal);
  drawFooter(context, width, height, state, gold, teal, false);
}

function drawTierBadge(context: CanvasRenderingContext2D, x: number, y: number, index: number, accent: string) {
  context.fillStyle = accent;
  context.beginPath();
  context.arc(x, y, 36, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#09213a";
  context.textAlign = "center";
  context.font = "800 30px Inter, Segoe UI, sans-serif";
  context.fillText(index === 0 ? "●" : index === 1 ? "★" : "♥", x, y + 11);
}

function drawFooter(context: CanvasRenderingContext2D, width: number, height: number, state: LanternState, gold: string, teal: string, portrait: boolean) {
  const top = portrait ? height * 0.84 : height * 0.84;
  context.fillStyle = "#03101d";
  context.fillRect(0, top, width, height - top);
  context.textAlign = "left";
  context.fillStyle = gold;
  context.font = `800 ${portrait ? 22 : 18}px Inter, Segoe UI, sans-serif`;
  context.fillText("◷", width * 0.22, top + 38);
  context.fillStyle = "#f6edd9";
  context.font = `700 ${portrait ? 17 : 15}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.hoursLabel, width * 0.27, top + 28);
  context.font = `500 ${portrait ? 16 : 14}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.hoursValue, width * 0.27, top + 52);
  context.fillStyle = teal;
  context.font = `800 ${portrait ? 24 : 18}px Inter, Segoe UI, sans-serif`;
  context.fillText("♡", width * 0.62, top + 38);
  context.fillStyle = "#f6edd9";
  context.font = `700 ${portrait ? 17 : 15}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.membershipLabel, width * 0.67, top + 28);
  context.font = `500 ${portrait ? 16 : 14}px Inter, Segoe UI, sans-serif`;
  context.fillText(state.board.membershipValue, width * 0.67, top + 52);
  if (portrait) {
    context.fillStyle = "#f6edd9";
    context.font = "700 15px Inter, Segoe UI, sans-serif";
    state.board.impactLines.forEach((line, index) => context.fillText(line, width * 0.67, top + 18 + index * 18));
  }
  if (!portrait) {
    context.fillStyle = gold;
    context.fillText(state.board.theaterLabel, width * 0.055, top + 28);
    context.fillStyle = "#f6edd9";
    context.fillText(state.board.theaterValue, width * 0.055, top + 52);
    context.fillStyle = teal;
    context.fillText(state.board.socialLabel, width * 0.86, top + 28);
    context.fillStyle = "#f6edd9";
    context.fillText(state.board.socialValue, width * 0.86, top + 52);
  }
}

function drawQr(context: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, url: string) {
  context.fillStyle = color;
  context.fillRect(x, y, size, size);
  context.fillStyle = "#061a2d";
  const code = QRCode.create(url || "https://example.github.io/museum-supporters", { errorCorrectionLevel: "M" });
  const margin = size * 0.08;
  const cell = (size - margin * 2) / code.modules.size;
  for (let row = 0; row < code.modules.size; row += 1) for (let col = 0; col < code.modules.size; col += 1) {
    if (code.modules.get(row, col)) context.fillRect(x + margin + col * cell, y + margin + row * cell, Math.ceil(cell), Math.ceil(cell));
  }
}

function drawBoardStars(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  screen?: DisplayProfile,
  animationTime = 0
) {
  const animated = screen?.particleAnimationEnabled ?? false;
  const speed = Math.max(1, screen?.particleDriftSpeed ?? 4);
  const gravity = Math.max(0, screen?.particleGravity ?? 3);
  const direction = screen?.particleDriftDirection ?? "natural";
  const colorStyle = screen?.particleColorStyle ?? "warm";
  const elapsed = animated ? animationTime / 1000 : 0;
  for (let index = 0; index < 34; index += 1) {
    const random = (salt: number) => ((Math.sin((index + 1) * salt) * 10000) % 1 + 1) % 1;
    const initialX = random(12.9898) * width;
    const initialY = random(78.233) * height;
    const depth = 0.28 + random(93.184) * 0.72;
    const radius = 0.65 + random(39.346) * 2.15;
    const particleTime = elapsed * (0.36 + speed * 0.055) * (0.72 + random(17.719) * 0.75);
    const naturalDirection = random(54.531) >= 0.5 ? 1 : -1;
    const horizontalDirection = direction === "left" ? -1 : direction === "right" ? 1 : naturalDirection;
    const horizontalTravel = horizontalDirection * particleTime * (10 + random(44.123) * 24);
    const airWobble = Math.sin(particleTime * (0.65 + random(63.726)) + index * 1.7) * (7 + random(28.417) * 22);
    const verticalWander = Math.sin(particleTime * (0.42 + random(31.337) * 0.55) + index * 2.21) * (8 + random(71.943) * 24);
    const fallSpeed = gravity * depth * 1.4 * particleTime;
    const x = animated ? ((initialX + horizontalTravel + airWobble) % width + width) % width : initialX;
    const y = animated ? ((initialY + fallSpeed + verticalWander) % height + height) % height : initialY;
    const shimmer = animated ? 0.55 + Math.sin(particleTime * 1.7 + index * 2.6) * 0.25 : 0.68;
    const color = colorStyle === "primary"
      ? ["#ef5959", "#f2d64b", "#4f8cff"][index % 3]
      : index % 3 === 0 ? "#e8b85f" : "#fff8e6";
    context.save();
    context.globalAlpha = Math.max(0.08, shimmer * depth);
    context.fillStyle = color;
    context.shadowColor = color;
    context.shadowBlur = radius * (1.5 + (1 - depth) * 2.5);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
}

function donorSubtextVisible(screen: DisplayProfile | undefined, donorId: string) {
  return screen?.donorSubtextVisibility?.[donorId] ?? screen?.showSubtext ?? false;
}

function resolveActiveProgram(state: LanternState, screenId: ScreenId, now: Date) {
  const day = now.getDay();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const schedule = state.schedules?.find((entry) => entry.contentType !== "announcement" && entry.active && (entry.recurrence === "once" && entry.scheduleDate ? entry.scheduleDate === localDate : entry.days.includes(day)) && (entry.target === "all" || entry.target === screenId) && time >= entry.startTime && time < entry.endTime);
  if (schedule) return state.boardPrograms?.find((program) => program.id === schedule.boardId && program.active);
  const assignedProgramId = state.screens[screenId]?.boardProgramId;
  return assignedProgramId ? state.boardPrograms?.find((program) => program.id === assignedProgramId && program.active) : undefined;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

function drawSilhouetteWave(context: CanvasRenderingContext2D, width: number, y: number, height: number, color: string) {
  context.fillStyle = color;
  context.globalAlpha = 0.26;
  context.beginPath();
  context.moveTo(0, y + height);
  context.quadraticCurveTo(width * 0.25, y - height * 0.2, width * 0.5, y + height * 0.4);
  context.quadraticCurveTo(width * 0.75, y + height, width, y - height * 0.05);
  context.lineTo(width, y + height);
  context.closePath();
  context.fill();
  context.globalAlpha = 1;
}

function drawPanelBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: LanternState,
  isPortrait: boolean
) {
  const base = materialColor(state.theme.material);
  context.fillStyle = base.dark;
  context.fillRect(0, 0, width, height);

  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, base.light);
  gradient.addColorStop(0.45, base.mid);
  gradient.addColorStop(1, base.dark);
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.16 + state.theme.grain / 700;
  context.strokeStyle = base.grain;
  context.lineWidth = isPortrait ? 2 : 1.4;
  for (let i = 0; i < 90; i += 1) {
    const y = (i / 90) * height;
    context.beginPath();
    context.moveTo(0, y + Math.sin(i) * 18);
    context.bezierCurveTo(width * 0.28, y + Math.cos(i) * 34, width * 0.72, y - Math.sin(i / 2) * 28, width, y + Math.cos(i / 3) * 18);
    context.stroke();
  }
  context.globalAlpha = 1;

  context.strokeStyle = "rgba(241, 190, 103, 0.54)";
  context.lineWidth = isPortrait ? 4 : 3;
  for (let i = 0; i < 5; i += 1) {
    context.beginPath();
    context.ellipse(
      isPortrait ? width * 0.42 : width * 0.5,
      isPortrait ? height * 0.17 : height * 0.5,
      width * (0.24 + i * 0.085),
      height * (0.09 + i * 0.055),
      -0.28,
      0,
      Math.PI * 2
    );
    context.stroke();
  }
}

function drawConstellationBackground(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: LanternState,
  isPortrait: boolean
) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#06111e");
  gradient.addColorStop(0.5, state.theme.trim === "Teal" ? "#082836" : "#101525");
  gradient.addColorStop(1, "#030810");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.strokeStyle = "rgba(85, 199, 191, 0.26)";
  context.lineWidth = isPortrait ? 3 : 2;
  const points = constellationPoints(width, height, isPortrait);
  context.beginPath();
  points.forEach(([x, y], index) => {
    if (index === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();

  points.forEach(([x, y], index) => {
    context.fillStyle = index % 2 === 0 ? "#f5df9b" : "#55c7bf";
    context.beginPath();
    context.arc(x, y, isPortrait ? 9 : 8, 0, Math.PI * 2);
    context.fill();
  });

  for (let i = 0; i < 34; i += 1) {
    const x = (Math.sin(i * 8.13) * 0.5 + 0.5) * width;
    const y = (Math.cos(i * 4.91) * 0.5 + 0.5) * height;
    context.fillStyle = i % 3 === 0 ? "rgba(240, 123, 95, 0.74)" : "rgba(246, 234, 211, 0.52)";
    context.beginPath();
    context.arc(x, y, 3 + (i % 4), 0, Math.PI * 2);
    context.fill();
  }
}

function drawConstellationDonors(context: CanvasRenderingContext2D, width: number, height: number, donors: Donor[], isPortrait: boolean) {
  const points = constellationPoints(width, height, isPortrait);
  context.textAlign = "left";
  donors.slice(0, points.length).forEach((donor, index) => {
    const [x, y] = points[index];
    const labelX = Math.min(x + 22, width - 360);
    const labelY = y + (index % 2 === 0 ? -22 : 34);
    context.fillStyle = tierColor(donor.tier);
    context.beginPath();
    context.arc(x, y, isPortrait ? 16 : 15, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f7e6c1";
    context.font = `700 ${isPortrait ? 34 : 28}px Inter, Segoe UI, sans-serif`;
    fitText(context, donor.name, labelX, labelY, isPortrait ? 360 : 420, isPortrait ? 34 : 28, 18);
    context.fillStyle = "rgba(198, 224, 219, 0.76)";
    context.font = `500 ${isPortrait ? 20 : 16}px Inter, Segoe UI, sans-serif`;
    fitText(context, donor.note, labelX, labelY + (isPortrait ? 28 : 24), isPortrait ? 340 : 380, isPortrait ? 20 : 16, 12);
  });
}

function constellationPoints(width: number, height: number, isPortrait: boolean) {
  const count = isPortrait ? 14 : 20;
  return Array.from({ length: count }, (_, index) => {
    const t = index / Math.max(1, count - 1);
    const wave = Math.sin(index * 1.73);
    return [
      width * (isPortrait ? 0.18 + t * 0.64 : 0.12 + t * 0.76),
      height * (isPortrait ? 0.25 + t * 0.46 + wave * 0.08 : 0.28 + Math.sin(index * 0.85) * 0.16)
    ] as [number, number];
  });
}

function prepareBackgroundMedia(screen: DisplayProfile, onReady: () => void) {
  const source = screen.backgroundImage;
  if (!source) return;
  const cached = backgroundMediaCache.get(source);
  if (cached) {
    if (cached instanceof HTMLVideoElement) {
      if (cached.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) onReady();
      else cached.addEventListener("loadeddata", onReady, { once: true });
      void cached.play().catch(() => undefined);
    } else if (cached.complete) onReady();
    else cached.addEventListener("load", onReady, { once: true });
    return;
  }

  if (screen.backgroundMediaType === "video" || source.startsWith("data:video/")) {
    const video = document.createElement("video");
    video.src = source;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.addEventListener("loadeddata", () => {
      void video.play().catch(() => undefined);
      onReady();
    }, { once: true });
    backgroundMediaCache.set(source, video);
    return;
  }

  const image = new Image();
  image.onload = onReady;
  image.src = source;
  backgroundMediaCache.set(source, image);
}

function drawImageBackground(context: CanvasRenderingContext2D, width: number, height: number, screen: DisplayProfile) {
  const media = screen.backgroundImage ? backgroundMediaCache.get(screen.backgroundImage) : undefined;
  context.fillStyle = "#081524";
  context.fillRect(0, 0, width, height);

  const mediaWidth = media instanceof HTMLVideoElement ? media.videoWidth : media?.naturalWidth ?? 0;
  const mediaHeight = media instanceof HTMLVideoElement ? media.videoHeight : media?.naturalHeight ?? 0;
  const mediaReady = media instanceof HTMLVideoElement ? media.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA : Boolean(media?.complete);
  if (media && mediaReady && mediaWidth > 0 && mediaHeight > 0) {
    const crop = screen.backgroundCrop;
    const coverScale = Math.max(width / mediaWidth, height / mediaHeight) * crop.scale;
    const drawWidth = mediaWidth * coverScale;
    const drawHeight = mediaHeight * coverScale;
    context.save();
    context.translate(width / 2 + (crop.x / 100) * width, height / 2 + (crop.y / 100) * height);
    context.rotate(((crop.rotation ?? 0) * Math.PI) / 180);
    context.drawImage(media, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    context.restore();
  } else {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#16324a");
    gradient.addColorStop(0.55, "#265c63");
    gradient.addColorStop(1, "#101525");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  }

  context.fillStyle = "rgba(3, 8, 16, 0.48)";
  context.fillRect(0, 0, width, height);
}

function applyBrightness(context: CanvasRenderingContext2D, width: number, height: number, brightness: number) {
  const delta = brightness - 72;
  if (delta < 0) {
    context.fillStyle = `rgba(0, 0, 0, ${Math.min(0.48, Math.abs(delta) / 100)})`;
    context.fillRect(0, 0, width, height);
  }
  if (delta > 0) {
    context.fillStyle = `rgba(255, 239, 198, ${Math.min(0.2, delta / 260)})`;
    context.fillRect(0, 0, width, height);
  }
}

function drawHeading(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  screenId: ScreenId,
  revision: number,
  style: DisplayProfile["style"],
  program?: LanternState["boardPrograms"][number]
) {
  const isPortrait = height > width;
  context.textAlign = "left";
  context.fillStyle = style === "constellation" ? "#f7e6c1" : "#f7e6c1";
  context.font = `700 ${isPortrait ? 78 : 74}px Inter, Segoe UI, sans-serif`;
  context.fillText(program?.heading || "Our Gratitude", width * 0.075, height * (isPortrait ? 0.08 : 0.12));
  context.font = `500 ${isPortrait ? 32 : 28}px Inter, Segoe UI, sans-serif`;
  context.fillStyle = "rgba(206, 230, 225, 0.82)";
  context.fillText(program?.subtitle || "Project Lantern donor recognition", width * 0.078, height * (isPortrait ? 0.108 : 0.158));

  context.textAlign = "right";
  context.font = `600 ${isPortrait ? 24 : 22}px Inter, Segoe UI, sans-serif`;
  context.fillStyle = "rgba(242, 190, 103, 0.78)";
  context.fillText(`Revision ${revision}`, width * 0.925, height * (isPortrait ? 0.08 : 0.12));
}

function drawDonors(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  donors: Donor[],
  isPortrait: boolean,
  lettering: string,
  layoutScale = 100
) {
  const grouped = ["Founder", "Champion", "Patron", "Friend"].flatMap((tier) => donors.filter((donor) => donor.tier === tier));
  const columns = isPortrait ? 2 : 4;
  const startY = height * (isPortrait ? 0.27 : 0.31);
  const columnGap = isPortrait ? width * 0.075 : width * 0.035;
  const usableWidth = width * (isPortrait ? 0.58 : 0.78);
  const columnWidth = (usableWidth - columnGap * (columns - 1)) / columns;
  const scale = layoutScale / 100;
  const rowHeight = (isPortrait ? 116 : 96) * scale;
  const x0 = width * (isPortrait ? 0.22 : 0.11);

  grouped.forEach((donor, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = x0 + column * (columnWidth + columnGap);
    const y = startY + row * rowHeight;
    const accent = tierColor(donor.tier);

    context.fillStyle = accent;
    context.beginPath();
    context.arc(x + 18, y - 12, isPortrait ? 18 : 15, 0, Math.PI * 2);
    context.fill();

    context.strokeStyle = "rgba(255,255,255,0.22)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x + 50, y - 20);
    context.lineTo(x + columnWidth, y - 20);
    context.stroke();

    const shadowAlpha = lettering === "Engraved" ? 0.48 : lettering === "Raised Inlay" ? 0.24 : 0.16;
    context.shadowColor = `rgba(0, 0, 0, ${shadowAlpha})`;
    context.shadowBlur = lettering === "Raised Inlay" ? 2 : 8;
    context.shadowOffsetY = lettering === "Engraved" ? 5 : 2;
    context.fillStyle = lettering === "Painted" ? "#f9e8ca" : "#fff1d2";
    const nameSize = (isPortrait ? 36 : 31) * scale;
    fitText(context, donor.name, x + 50, y, columnWidth - 52, nameSize, 18);

    context.shadowColor = "transparent";
    const noteSize = (isPortrait ? 22 : 18) * scale;
    context.font = `500 ${noteSize}px Inter, Segoe UI, sans-serif`;
    context.fillStyle = "rgba(198, 224, 219, 0.78)";
    fitText(context, `${donor.tier} - ${donor.note}`, x + 50, y + (isPortrait ? 34 : 29) * scale, columnWidth - 52, noteSize, 12);
  });
}

function drawPanelDetails(context: CanvasRenderingContext2D, width: number, height: number, depth: number) {
  context.globalAlpha = 0.28 + depth / 500;
  context.strokeStyle = "#62c9c3";
  context.lineWidth = 2;
  for (let i = 0; i < 24; i += 1) {
    const x = (Math.sin(i * 7.1) * 0.5 + 0.5) * width;
    const y = (Math.cos(i * 3.4) * 0.5 + 0.5) * height;
    context.beginPath();
    context.moveTo(x - 8, y);
    context.lineTo(x + 8, y);
    context.moveTo(x, y - 8);
    context.lineTo(x, y + 8);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function fitText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  initialSize: number,
  minSize: number
) {
  let size = initialSize;
  while (size > minSize && context.measureText(text).width > maxWidth) {
    size -= 1;
    context.font = context.font.replace(/[\d.]+px/, `${size}px`);
  }
  context.fillText(text, x, y);
}

function addConstellation(scene: Scene, isPortrait: boolean, panelWidth: number, panelHeight: number) {
  const material = new StandardMaterial("constellation-stars", scene);
  material.emissiveColor = Color3.FromHexString("#f3c567");
  material.diffuseColor = Color3.FromHexString("#f3c567");

  const points = isPortrait
    ? [
        [-1.6, 2.55],
        [-0.75, 2.9],
        [0.15, 2.36],
        [0.98, 2.68],
        [1.55, 2.12]
      ]
    : [
        [-4.6, 1.6],
        [-2.8, 1.2],
        [-1.1, 1.65],
        [0.4, 0.85],
        [2.1, 1.45],
        [4.2, 0.7]
      ];

  points.forEach(([x, y], index) => {
    const star = MeshBuilder.CreateSphere(`star-${index}`, { diameter: 0.07 + index * 0.004, segments: 12 }, scene);
    star.position = new Vector3(x, y, -0.17);
    star.material = material;
  });

  const lineMaterial = new StandardMaterial("constellation-lines", scene);
  lineMaterial.diffuseColor = Color3.FromHexString("#55c7bf");
  lineMaterial.alpha = 0.42;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const line = MeshBuilder.CreateTube(
      `constellation-line-${i}`,
      {
        path: [new Vector3(x1, y1, -0.18), new Vector3(x2, y2, -0.18)],
        radius: 0.008,
        tessellation: 6
      },
      scene
    );
    line.material = lineMaterial;
  }

  const moon = MeshBuilder.CreateSphere("soft-moon", { diameter: isPortrait ? 0.32 : 0.38, segments: 24 }, scene);
  moon.position = new Vector3(panelWidth * 0.36, panelHeight * 0.28, -0.2);
  const moonMaterial = new StandardMaterial("moon-material", scene);
  moonMaterial.diffuseColor = Color3.FromHexString("#f6dfaa");
  moonMaterial.emissiveColor = Color3.FromHexString("#3b2d18");
  moon.material = moonMaterial;
}

function addToyInspector(scene: Scene, isPortrait: boolean, panelWidth: number, panelHeight: number, announcementActive: boolean) {
  const root = new TransformNode("toy-inspector", scene);
  const restingX = -panelWidth * 0.3;
  const offscreenX = announcementActive ? -panelWidth * 0.68 : panelWidth * 0.68;
  root.position = new Vector3(announcementActive ? offscreenX : restingX, -panelHeight * (isPortrait ? 0.34 : 0.36), -0.42);
  root.scaling = new Vector3(isPortrait ? 0.8 : 0.72, isPortrait ? 0.8 : 0.72, isPortrait ? 0.8 : 0.72);

  const coat = new StandardMaterial("inspector-coat", scene);
  coat.diffuseColor = Color3.FromHexString("#d8c49a");
  const navy = new StandardMaterial("inspector-navy", scene);
  navy.diffuseColor = Color3.FromHexString("#16324a");
  const glow = new StandardMaterial("inspector-star", scene);
  glow.diffuseColor = Color3.FromHexString("#f5c562");
  glow.emissiveColor = Color3.FromHexString("#6d4b12");

  const body = MeshBuilder.CreateCylinder("inspector-body", { height: 0.48, diameterTop: 0.18, diameterBottom: 0.25, tessellation: 16 }, scene);
  body.position.y = 0.18;
  body.material = coat;
  body.parent = root;

  const head = MeshBuilder.CreateSphere("inspector-head", { diameter: 0.18, segments: 16 }, scene);
  head.position.y = 0.52;
  head.material = coat;
  head.parent = root;

  const hat = MeshBuilder.CreateCylinder("inspector-hat", { height: 0.1, diameter: 0.23, tessellation: 16 }, scene);
  hat.position.y = 0.66;
  hat.material = navy;
  hat.parent = root;

  const arm = MeshBuilder.CreateCylinder("inspector-arm", { height: 0.48, diameter: 0.035, tessellation: 10 }, scene);
  arm.position = new Vector3(0.18, 0.34, 0);
  arm.rotation.z = -0.72;
  arm.material = coat;
  arm.parent = root;

  const star = MeshBuilder.CreateSphere("inspector-held-star", { diameter: 0.09, segments: 10 }, scene);
  star.position = new Vector3(0.38, 0.5, -0.02);
  star.material = glow;
  star.parent = root;

  const started = performance.now();
  const duration = 1250;
  scene.onBeforeRenderObservable.add(() => {
    const progress = Math.min(1, (performance.now() - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    root.position.x = announcementActive
      ? offscreenX + (restingX - offscreenX) * eased
      : restingX + (offscreenX - restingX) * eased;
    root.position.y += Math.sin(progress * Math.PI * 10) * 0.0018;
    root.rotation.y = Math.sin(progress * Math.PI * 10) * 0.08;
    if (!announcementActive && progress >= 1) root.setEnabled(false);
  });
}

function targetIncludesAnnouncement(state: LanternState, screenId: ScreenId) {
  return state.announcement.targets?.length ? state.announcement.targets.includes(screenId) : state.announcement.target === "all" || state.announcement.target === screenId;
}

function materialColor(material: string) {
  switch (material) {
    case "Painted Maple":
      return { light: "#d9b982", mid: "#9d7652", dark: "#34454a", grain: "#f3d8a3" };
    case "Brushed Brass":
      return { light: "#d7b45f", mid: "#795b2b", dark: "#10283a", grain: "#ffe4a7" };
    case "Deep Navy Enamel":
      return { light: "#164869", mid: "#0c2438", dark: "#061321", grain: "#55c7bf" };
    default:
      return { light: "#68482d", mid: "#2f211b", dark: "#081524", grain: "#c9965d" };
  }
}

function trimColor(trim: string) {
  switch (trim) {
    case "Teal":
      return Color3.FromHexString("#55c7bf");
    case "Graphite":
      return Color3.FromHexString("#232d35");
    default:
      return Color3.FromHexString("#c89748");
  }
}

function tierColor(tier: Donor["tier"]) {
  switch (tier) {
    case "Founder":
      return "#f2c46d";
    case "Champion":
      return "#f07b5f";
    case "Patron":
      return "#55c7bf";
    default:
      return "#8fb4c2";
  }
}
