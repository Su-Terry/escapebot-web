'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MousePointer2, Grab } from 'lucide-react';
import type { Application, Sprite, Graphics as PixiGraphics } from 'pixi.js';
import type * as MatterNS from 'matter-js';

export type ActionResult = {
  narration: string;
  isWon: boolean;
};

const MIN_CHEW_MS = 500;
const minDelay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Minimum perspective scale for on-ground buns — prevents shrinking to a dot at far depth. Tune to taste. */
const MIN_BUN_SCALE = 0.55;

/** Max suggestions shown per category (scene items / exits / inventory). Easy to tune. */
const MAX_CHIPS_PER_CATEGORY = 3;

type SceneItem = { id: string; name: string; isTakeable: boolean };
type Exit = { id: string; name: string; isLocked: boolean };
type InventoryItem = { id: string; name: string };

type Props = {
  onAction: (action: string) => Promise<ActionResult>;
  onWin: () => void;
  initialNarration?: string;
  sceneItems?: SceneItem[];
  exits?: Exit[];
  inventory?: InventoryItem[];
};

type BunPhase =
  | 'at_launch'   // sitting at launch pad
  | 'dragging'    // player pulling back
  | 'in_flight'   // analytic 3D trajectory, no matter.js body
  | 'returning'   // missed: arc tween back to launch pad
  | 'eating'      // consumed, LLM thinking
  | 'flying_out'  // reply bun Bezier arc
  | 'on_ground';  // reply bun with live XZ scatter body

type CatPhase = 'idle' | 'chewing' | 'spitting';

type MB = MatterNS.Body;

interface Bun {
  id: number;
  action: string;
  narration: string;
  phase: BunPhase;
  sprite: Sprite;
  isReply: boolean;
  body: MB | null;
  slowFrames: number;
  // in_flight analytic tracking
  wx0: number; wy0: number;   // world position at launch (wz0 = 0)
  vx: number; vy: number; vz: number;
  flightStart: number;
  // Bezier arc (reply buns, flying_out)
  fromX: number; fromY: number; fromWZ: number;
  ctrlX: number; ctrlY: number;
  toX: number;   toY: number;   toWX: number; toWZ: number;
  dur: number;   startAt: number;
  // Return arc (player buns, returning)
  retFromX: number; retFromY: number;
  retCtrlX: number; retCtrlY: number;
  retStartAt: number;
  // Pre-fetched LLM result (set at spawn time, awaited on hit)
  pendingResult: Promise<ActionResult> | null;
}

export default function BunCatScene({ onAction, onWin, initialNarration, sceneItems, exits, inventory }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const spawnRef = useRef<((action: string) => void) | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);
  const [gloveMode, setGloveMode] = useState(false);
  const gloveModeRef = useRef(false);

  function toggleGloveMode(val: boolean) {
    gloveModeRef.current = val;
    setGloveMode(val);
  }

  const suggestions = useMemo(() => {
    const chips: string[] = [];
    (sceneItems ?? []).slice(0, MAX_CHIPS_PER_CATEGORY).forEach(item => {
      chips.push(`查看${item.name}`);
    });
    (exits ?? []).slice(0, MAX_CHIPS_PER_CATEGORY).forEach(exit => {
      chips.push(`前往${exit.name}`);
    });
    (inventory ?? []).slice(0, MAX_CHIPS_PER_CATEGORY).forEach(inv => {
      chips.push(`使用${inv.name}`);
    });
    return chips;
  }, [sceneItems, exits, inventory]);

  const onActionRef = useRef(onAction);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);
  const onWinRef = useRef(onWin);
  useEffect(() => { onWinRef.current = onWin; }, [onWin]);
  const setBusyRef = useRef(setBusy);

  // Bind PlayPage wrapper width to the visual viewport via CSS --vvw variable so the
  // entire layout fits within the visible area on iOS (keyboard / system UI).
  // overflow-x: hidden prevents residual scroll if layout and vvW are briefly out of sync.
  useEffect(() => {
    if (window.innerWidth >= 640) return; // mobile only
    document.body.style.overflowX = 'hidden';
    const setVvw = () => {
      const w = window.visualViewport?.width ?? window.innerWidth;
      document.documentElement.style.setProperty('--vvw', `${w}px`);
      document.documentElement.style.setProperty('--vvml', '0px');
    };
    setVvw(); // set immediately on mount
    window.visualViewport?.addEventListener('resize', setVvw);
    return () => {
      document.body.style.overflowX = '';
      document.documentElement.style.removeProperty('--vvw');
      document.documentElement.style.removeProperty('--vvml');
      window.visualViewport?.removeEventListener('resize', setVvw);
    };
  }, []);

  const setPopupRef = useRef(setPopup);
  const initialNarrationRef = useRef(initialNarration ?? '');

  useEffect(() => {
    let cancelled = false;
    let destroyFn: (() => void) | null = null;
    let initGen = 0;   // incremented each time we (re)start initPixi
    const el = mountRef.current;
    if (!el) return;

    async function initPixi(el: HTMLDivElement, W: number, H: number, gen: number) {
      const [PIXI, Matter] = await Promise.all([
        import('pixi.js'),
        import('matter-js'),
      ]);
      if (cancelled || gen !== initGen) return;

      const { Engine, Bodies, Body, Composite, World, Constraint } = Matter;

      // ── PixiJS app ────────────────────────────────────────
      PIXI.TextureSource.defaultOptions.scaleMode = 'nearest';
      const app: Application = new PIXI.Application();
      await app.init({
        antialias: false,
        backgroundAlpha: 0,
        width: W,
        height: H,
        resolution: 1,
        autoDensity: false,
      });
      if (cancelled) { app.destroy(true); return; }

      // ── Matter.js engine (XZ scatter only; no gravity) ───
      const engine = Engine.create();
      engine.gravity.x = 0;
      engine.gravity.y = 0;

      destroyFn = () => {
        World.clear(engine.world, false);
        Engine.clear(engine);
        app.destroy(true);
      };

      el.appendChild(app.canvas as HTMLCanvasElement);
      (app.canvas as HTMLCanvasElement).style.imageRendering = 'pixelated';

      const [texIdle, texHit, texBun] = await Promise.all([
        PIXI.Assets.load('/sprites/cat-idle.png'),
        PIXI.Assets.load('/sprites/cat-hit.png'),
        PIXI.Assets.load('/sprites/bun.png'),
      ]);
      if (cancelled) { destroyFn(); return; }

      // ── Physics / layout constants ────────────────────────
      // GRAVITY in px/ms²; unchanged from previous version.
      const GRAVITY      = 0.00045;
      const LAUNCH_SCALE = 0.020;
      const MAX_PULL     = 190;
      const FIXED_STEP   = 1000 / 60;
      const RETURN_DUR   = 380;

      // ── True 3D projection ────────────────────────────────
      // Camera at (W/2, bgGroundY, -CAM_DIST) looking toward +Z.
      // scale(wz) = CAM_DIST/(wz+CAM_DIST): z=0→1.0, z=CAT_Z→0.75.
      const CAM_DIST      = 600;
      const CAT_Z         = 200;    // cat world-Z; CAM_DIST/3 → scale=0.75
      const HIT_RADIUS_3D = 55;     // world-unit sphere; depth-locked ≈ horizontal tolerance

      const CAT_SCALE = 2;
      const BUN_SCALE = 1.0;
      const groundY   = H - 44;
      const bgGroundY = groundY - 100;  // CAM_Y: camera eye / horizon line
      const CAM_Y     = bgGroundY;
      const CAM_X     = Math.round(W / 2);

      const bunRadius     = Math.max(Math.ceil((41 * BUN_SCALE) / 2), 12);
      const bunHitCY      = Math.round(((18 + 51) / 2 - 50) * BUN_SCALE);

      const launchX  = CAM_X;
      const launchY  = groundY - 40;

      // catWY: reverse-project catCenterY_screen to world Y at CAT_Z.
      // catCenterY_screen kept at groundY-200 (same as previous physics sensor centre).
      // Solve: CAM_Y + (catWY - CAM_Y) * 0.75 = groundY - 200.
      const catCenterYScreen = groundY - 200;
      const catWY = Math.round(CAM_Y + (catCenterYScreen - CAM_Y) / 0.75);
      const catWX = CAM_X;

      // catVisualScale: sprite scale at depth CAT_Z.
      const catVisualScale = CAT_SCALE * (CAM_DIST / (CAT_Z + CAM_DIST));  // 2 * 0.75 = 1.5
      const catW = 100 * CAT_SCALE;

      let mouthX = CAM_X;
      let mouthY = catCenterYScreen;

      // ── Projection ────────────────────────────────────────
      function project(wx: number, wy: number, wz: number) {
        const scale = CAM_DIST / (wz + CAM_DIST);
        return {
          sx: CAM_X + (wx - CAM_X) * scale,
          sy: CAM_Y + (wy - CAM_Y) * scale,
          scale,
        };
      }

      // ── Bun visual scale with MIN_BUN_SCALE floor ────────
      // Use for sprite.scale, hit radius, outline — NOT for raw geometry (shadows, project()).
      function clampedBunScale(wz: number): number {
        return Math.max(CAM_DIST / (wz + CAM_DIST), MIN_BUN_SCALE);
      }

      // ── Pointer → ground-plane XZ (exact inverse of project at wy=groundY) ─
      // Subtracts the grab offset recorded at drag start so we invert from the
      // shadow screen position, not from the raw pointer (which sits above the shadow
      // by BUN_SCALE*scale + visual-center offset → would produce wrong wz without offset).
      // Algebraic inverse: shadow_sy = CAM_Y + (groundY-CAM_Y)*scale
      //   → scale = (shadow_sy - CAM_Y)/(groundY - CAM_Y)
      //   → wz   = CAM_DIST/scale - CAM_DIST
      //   → wx   = CAM_X + (shadow_sx - CAM_X)/scale
      // At drag start offset=pointer-shadow → adj=pointer-offset=shadow → wz=wz0, wx=wx0 ✓
      function pointerToGroundXZ(px: number, py: number): { wx: number; wz: number } {
        const shadowSx = px - gloveOffsetX;
        const shadowSy = py - gloveOffsetY;
        // Only clamp for true out-of-bounds (pointer dragged above horizon); no clamp needed in normal range.
        // Clamp shadowSy so scale > 0 (pointer above horizon) and wz ≥ 0 (pointer below ground).
        const clampedSy = Math.min(Math.max(shadowSy, CAM_Y + 1), groundY);
        const scale = (clampedSy - CAM_Y) / (groundY - CAM_Y);
        const wz = Math.min(Math.max(CAM_DIST / scale - CAM_DIST, 0), 280);
        const wx = Math.min(Math.max(CAM_X + (shadowSx - CAM_X) / scale, 0), W);
        return { wx, wz };
      }

      // ── 3D Hit Detection ──────────────────────────────────
      function checkHit3D(wx: number, wy: number, wz: number): boolean {
        const dx = wx - catWX, dy = wy - catWY, dz = wz - CAT_Z;
        return dx * dx + dy * dy + dz * dz < HIT_RADIUS_3D * HIT_RADIUS_3D;
      }

      // ── Depth-lock: compute vz so bun reaches CAT_Z at t_hit ─
      // wy0: actual world Y at launch (may differ from launchY if bun pulled down).
      // Returns null when throw is SHORT (arc apex below catWY).
      function computeVz(vy: number, wy0: number): number | null {
        const deltaY = wy0 - catWY;        // > 0: bun starts below cat (Y-down)
        const D = vy * vy - 2 * GRAVITY * deltaY;
        if (D < 0) return null;             // SHORT
        const t_hit = (-vy - Math.sqrt(D)) / GRAVITY;
        return CAT_Z / t_hit;
      }

      // ── XZ scatter walls (body.x=worldX, body.y=worldZ) ──
      const wallL    = Bodies.rectangle(-25,    150, 50, 600, { isStatic: true, label: 'wall', restitution: 0.2 });
      const wallR    = Bodies.rectangle(W + 25, 150, 50, 600, { isStatic: true, label: 'wall', restitution: 0.2 });
      const wallNear = Bodies.rectangle(W / 2, -25, W + 200, 50, { isStatic: true, label: 'wall', restitution: 0.1 });
      const wallFar  = Bodies.rectangle(W / 2, 285, W + 200, 50, { isStatic: true, label: 'wall', restitution: 0.1 });
      Composite.add(engine.world, [wallL, wallR, wallNear, wallFar]);

      // ── Scene state ───────────────────────────────────────
      const buns: Bun[] = [];
      let bunId = 0;
      let catBusy = false;
      let catPhase: CatPhase = 'idle';
      let chewMs = 0;
      let dragBun: Bun | null = null;
      let dragOriginX = 0;
      let dragOriginY = 0;
      let firstBunDemo = true;
      let physAccum = 0;
      let latestReplyBunId: number | null = null;

      // ── Glove drag state ──────────────────────────────────
      let gloveDragBun: Bun | null = null;
      let gloveAnchorBody: MB | null = null;
      let gloveConstraint: MatterNS.Constraint | null = null;
      // Offset from pointer to bun's shadow screen position at drag start.
      // Shadow = project(wx, groundY, wz).{sx,sy} — NOT sprite.y (which has −BUN_SCALE*scale).
      // Stored so pointermove can invert to exact XZ without pointer-to-sprite offset error.
      let gloveOffsetX = 0;
      let gloveOffsetY = 0;

      // ── PIXI layers ───────────────────────────────────────
      const bgLayer: PixiGraphics = new PIXI.Graphics();
      const skyGrad = new PIXI.FillGradient(0, 0, 0, groundY);
      skyGrad.addColorStop(0, 0xfff9f2);
      skyGrad.addColorStop(1, 0xf0dfc8);
      bgLayer.rect(0, 0, W, groundY).fill(skyGrad);
      app.stage.addChild(bgLayer);

      const groundLayer: PixiGraphics = new PIXI.Graphics();
      groundLayer.rect(0, bgGroundY, W, H - bgGroundY).fill(0xc8935a);
      groundLayer.rect(0, groundY, W, 5).fill(0xd9a878);
      app.stage.addChild(groundLayer);

      const shadowLayer: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(shadowLayer);

      const FORK_JOIN  = { x: launchX,      y: launchY - 8  };
      const FORK_LEFT  = { x: launchX - 20, y: launchY - 35 };
      const FORK_RIGHT = { x: launchX + 20, y: launchY - 35 };
      const FORK_BASE  = { x: launchX,      y: groundY + 55 };

      const sling: PixiGraphics = new PIXI.Graphics();
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_BASE.x, FORK_BASE.y)
           .stroke({ color: 0x6b3d1e, width: 11, cap: 'round' });
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_LEFT.x, FORK_LEFT.y)
           .stroke({ color: 0x6b3d1e, width: 8, cap: 'round' });
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_RIGHT.x, FORK_RIGHT.y)
           .stroke({ color: 0x6b3d1e, width: 8, cap: 'round' });
      sling.circle(FORK_LEFT.x, FORK_LEFT.y, 7).fill(0x6b3d1e);
      sling.circle(FORK_RIGHT.x, FORK_RIGHT.y, 7).fill(0x6b3d1e);
      app.stage.addChild(sling);

      // Cat: same visual positioning (feet at bgGroundY, scale=1.5).
      const catSpriteY = bgGroundY - 63 * catVisualScale;
      const cat: Sprite = new PIXI.Sprite(texIdle);
      cat.scale.set(catVisualScale);
      cat.anchor.set(0);
      cat.x = Math.round(W / 2 - 33 * catVisualScale);
      cat.y = catSpriteY;
      mouthX = cat.x + Math.round(0.28 * 100 * catVisualScale);
      mouthY = catSpriteY + Math.round(0.38 * 100 * catVisualScale);
      app.stage.addChildAt(cat, app.stage.getChildIndex(sling));

      const traj: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(traj);

      const outlineLayer: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(outlineLayer);

      // ── Trajectory preview (3D analytic + depth-lock) ────
      function drawTrajectory(vx: number, vy: number, sx: number, sy: number) {
        traj.clear();
        traj.moveTo(FORK_LEFT.x, FORK_LEFT.y).lineTo(sx, sy)
            .stroke({ color: 0xcc8844, width: 3, alpha: 0.8, cap: 'round' });
        traj.moveTo(FORK_RIGHT.x, FORK_RIGHT.y).lineTo(sx, sy)
            .stroke({ color: 0xcc8844, width: 3, alpha: 0.8, cap: 'round' });

        const vz = computeVz(vy, sy);   // sy = wy0 at z=0

        if (vz === null) {
          // SHORT: a few red dots, no landing shadow
          for (let step = 1; step <= 8; step++) {
            const t = step * 50;
            const wx = sx + vx * t;
            const wy = sy + vy * t + 0.5 * GRAVITY * t * t;
            if (wy > groundY + 20) break;
            const { sx: px, sy: py } = project(wx, wy, 0);
            traj.circle(px, py, 4).fill({ color: 0xff3300, alpha: (1 - step / 8) * 0.7 });
          }
          return;
        }

        const SAMPLE = 50, MAX_STEPS = 40;
        let willHit = false;
        for (let step = 1; step <= MAX_STEPS; step++) {
          const t  = step * SAMPLE;
          const wx = sx + vx * t;
          const wy = sy + vy * t + 0.5 * GRAVITY * t * t;
          const wz = vz * t;
          if (wx < -20 || wx > W + 20 || wy > groundY + 20) break;
          const { sx: px, sy: py } = project(wx, wy, wz);

          const near = checkHit3D(wx, wy, wz);
          const alpha = (1 - step / MAX_STEPS) * 0.95;
          traj.circle(px, py, near ? 7 : 5).fill({ color: near ? 0xff5500 : 0xffcc44, alpha });
          if (near) { willHit = true; break; }

          if (wy >= groundY) {
            // Show landing shadow (missed cat, hit ground)
            const { sx: lx, sy: ly, scale: ls } = project(wx, groundY, wz);
            traj.ellipse(lx, ly, bunRadius * 0.8 * ls, 3 * ls).fill({ color: 0x3d1a00, alpha: 0.38 });
            break;
          }
        }
        if (willHit) {
          traj.circle(catWX, catCenterYScreen, (HIT_RADIUS_3D * 0.75) + 10)
              .stroke({ color: 0xff5500, width: 3, alpha: 0.75 });
        }
      }

      // ── Return a missed player bun to the launch pad ──────
      function returnToLaunch(bun: Bun) {
        if (bun.body) { Composite.remove(engine.world, bun.body); bun.body = null; }
        bun.retFromX   = bun.sprite.x;
        bun.retFromY   = bun.sprite.y;
        bun.retCtrlX   = (bun.sprite.x + launchX) / 2;
        bun.retCtrlY   = Math.min(bun.sprite.y, launchY) - 90;
        bun.retStartAt = performance.now();
        bun.slowFrames = 0;
        bun.sprite.cursor  = 'default';
        bun.sprite.scale.set(BUN_SCALE);
        bun.sprite.rotation = 0;
        bun.phase = 'returning';
      }

      // ── Eat a player bun ──────────────────────────────────
      async function triggerEat(bun: Bun) {
        bun.phase = 'eating';
        if (bun.body) { Composite.remove(engine.world, bun.body); bun.body = null; }
        app.stage.removeChild(bun.sprite);
        bun.sprite.destroy();

        catPhase = 'chewing';
        cat.texture = texHit;
        cat.scale.set(catVisualScale);
        chewMs = 0;

        let result: ActionResult;
        try {
          [result] = await Promise.all([bun.pendingResult!, minDelay(MIN_CHEW_MS)]);
        } catch {
          result = { narration: '（無回應）', isWon: false };
        }
        if (cancelled) return;

        spitBun(result.narration);
        if (result.isWon) setTimeout(() => onWinRef.current(), 900);
      }

      // ── Spit a reply bun (Bezier arc → XZ scatter body) ──
      function spitBun(narration: string) {
        // Landing near foreground so buns are large enough to tap.
        const toWZ = Math.random() * 50;
        const toWX = Math.round(W / 3 + Math.random() * (W / 3));
        // toY: sprite.y when on_ground — visual content bottom (row 51) at shadow (groundY).
        // anchor(0.5) → content-bottom offset = (51−50)×scale = 1×scale below sprite.y.
        const { sx: toX, sy: toShadowY, scale: toScale } = project(toWX, groundY, toWZ);
        const toY = toShadowY - 1 * BUN_SCALE * toScale;

        // Cat mouth world coords (approximate; mouth is near cat depth).
        const catScale = CAM_DIST / (CAT_Z + CAM_DIST);
        const mouthWX = CAM_X + (mouthX - CAM_X) / catScale;
        const mouthWY = CAM_Y + (mouthY - CAM_Y) / catScale;

        const sprite = new PIXI.Sprite(texBun) as Sprite;
        sprite.scale.set(BUN_SCALE * catScale);
        sprite.anchor.set(0.5);
        sprite.x = mouthX; sprite.y = mouthY;
        app.stage.addChild(sprite);
        app.stage.addChild(outlineLayer);

        const bun: Bun = {
          id: bunId++, action: '', narration, phase: 'flying_out',
          sprite, isReply: true,
          body: null, slowFrames: 0,
          wx0: mouthWX, wy0: mouthWY, vx: 0, vy: 0, vz: 0, flightStart: 0,
          fromX: mouthX, fromY: mouthY, fromWZ: CAT_Z,
          ctrlX: (mouthX + toX) / 2, ctrlY: mouthY - 120,
          toX, toY, toWX, toWZ,
          dur: 780, startAt: performance.now(),
          retFromX: 0, retFromY: 0, retCtrlX: 0, retCtrlY: 0, retStartAt: 0,
          pendingResult: null,
        };
        buns.push(bun);
        latestReplyBunId = bun.id;

        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        sprite.hitArea = new PIXI.Circle(-3, bunHitCY, bunRadius);
        sprite.on('pointerover', () => {
          if (bun.phase !== 'on_ground') return;
          const wz_b = bun.body ? bun.body.position.y : bun.toWZ;
          bun.sprite.scale.set(clampedBunScale(wz_b) * 1.28);
        });
        sprite.on('pointerout', () => {
          if (bun.phase !== 'on_ground') return;
          const wz_b = bun.body ? bun.body.position.y : bun.toWZ;
          bun.sprite.scale.set(clampedBunScale(wz_b));
        });

        catPhase = 'spitting';
        cat.texture = texHit;
        cat.scale.set(catVisualScale);
      }

      // ── Spawn a player bun at the launch pad ─────────────
      function spawnBun(action: string) {
        if (catBusy) return;

        const sprite = new PIXI.Sprite(texBun) as Sprite;
        sprite.scale.set(BUN_SCALE);
        sprite.anchor.set(0.5);
        sprite.x = launchX; sprite.y = launchY;
        sprite.eventMode = 'static';
        sprite.cursor = 'grab';
        app.stage.addChild(sprite);
        app.stage.addChild(outlineLayer);

        const bun: Bun = {
          id: bunId++, action, narration: '', phase: 'at_launch',
          sprite, isReply: false,
          body: null, slowFrames: 0,
          wx0: launchX, wy0: launchY, vx: 0, vy: 0, vz: 0, flightStart: 0,
          fromX: 0, fromY: 0, fromWZ: 0, ctrlX: 0, ctrlY: 0,
          toX: 0, toY: 0, toWX: 0, toWZ: 0, dur: 0, startAt: 0,
          retFromX: 0, retFromY: 0, retCtrlX: 0, retCtrlY: 0, retStartAt: 0,
          pendingResult: null,
        };
        buns.push(bun);
        catBusy = true;
        setBusyRef.current(true);
        bun.pendingResult = onActionRef.current(action);

        sprite.on('pointerover', () => {
          if (bun.phase !== 'at_launch') return;
          bun.sprite.scale.set(BUN_SCALE * 1.1);
        });
        sprite.on('pointerout', () => {
          if (dragBun === bun) return;
          if (bun.phase === 'at_launch') bun.sprite.scale.set(BUN_SCALE);
        });
        sprite.on('pointerdown', () => {
          // Glove mode: player bun is not draggable
          if (gloveModeRef.current) return;
          if (bun.phase !== 'at_launch') return;
          bun.phase = 'dragging';
          dragBun = bun;
          dragOriginX = bun.sprite.x;
          dragOriginY = bun.sprite.y;
          bun.sprite.cursor = 'grabbing';
          bun.sprite.scale.set(BUN_SCALE * 1.22);
        });

        // First-bun hint demo
        if (firstBunDemo) {
          firstBunDemo = false;
          const DELAY = 800, PULL_DUR = 550, SNAP_DUR = 320;
          const DX = -32, DY = 22;
          let elapsed = -DELAY;
          const demoFn = () => {
            if (bun.phase !== 'at_launch' || cancelled) { app.ticker.remove(demoFn); traj.clear(); return; }
            elapsed += app.ticker.deltaMS;
            if (elapsed < 0) return;
            if (elapsed < PULL_DUR) {
              const t = elapsed / PULL_DUR;
              const e = t < 0.5 ? 2*t*t : 1-2*(1-t)*(1-t);
              bun.sprite.x = launchX + DX * e;
              bun.sprite.y = launchY + DY * e;
              drawTrajectory(
                -(bun.sprite.x - launchX) * LAUNCH_SCALE,
                -(bun.sprite.y - launchY) * LAUNCH_SCALE,
                bun.sprite.x, bun.sprite.y,
              );
            } else if (elapsed < PULL_DUR + SNAP_DUR) {
              const t = (elapsed - PULL_DUR) / SNAP_DUR;
              const snapE = 1 - (1-t)*(1-t);
              bun.sprite.x = launchX + DX * (1 - snapE);
              bun.sprite.y = launchY + DY * (1 - snapE);
              traj.clear();
            } else {
              bun.sprite.x = launchX; bun.sprite.y = launchY;
              traj.clear();
              app.ticker.remove(demoFn);
            }
          };
          app.ticker.add(demoFn);
        }
      }

      spawnRef.current = spawnBun;

      // ── Pick the visually top-most reply bun under (x, y) ─
      // Uses hit-circle test, then selects the highest zIndex (= smallest worldZ = nearest viewer).
      // Shared by pointer-mode click and glove-mode grab — both get the visual top bun.
      // Single bun case: only one candidate → same result as "closest"; no regression.
      function pickBunAt(x: number, y: number): Bun | null {
        let topBun: Bun | null = null;
        let topZIndex = -1;
        for (const bun of buns) {
          if (bun.phase !== 'on_ground' || bun.sprite.destroyed || !bun.isReply) continue;
          const wz_b = bun.body ? bun.body.position.y : bun.toWZ;
          const sc = clampedBunScale(wz_b);
          const clickR = Math.max(bunRadius * sc, 20);
          // on_ground buns have pivot=(-3, bunHitCY): sprite.x/y IS already the visual center.
          const vcx = bun.sprite.x;
          const vcy = bun.sprite.y;
          if (Math.hypot(x - vcx, y - vcy) < clickR) {
            if (bun.sprite.zIndex > topZIndex) {
              topZIndex = bun.sprite.zIndex;
              topBun = bun;
            }
          }
        }
        return topBun;
      }

      // ── Glove drag: start, move anchor, release ───────────
      function startGloveDrag(x: number, y: number) {
        const bun = pickBunAt(x, y);
        if (!bun || !bun.body) return;

        // Compute bun's shadow screen position from body XZ via forward projection.
        // Shadow = project(wx, groundY, wz) — does NOT subtract the sprite.y visual offset.
        const wx0 = bun.body.position.x;
        const wz0 = bun.body.position.y;
        const scale0 = CAM_DIST / (wz0 + CAM_DIST);
        const shadowSx0 = CAM_X + (wx0 - CAM_X) * scale0;
        const shadowSy0 = CAM_Y + (groundY - CAM_Y) * scale0;
        // Record offset so pointerToGroundXZ inverts from shadow, not raw pointer.
        gloveOffsetX = x - shadowSx0;
        gloveOffsetY = y - shadowSy0;

        gloveDragBun = bun;
        // Place anchor at bun's exact XZ — zero spring tension at grab start, no jump.
        gloveAnchorBody = Bodies.circle(wx0, wz0, 5, {
          isStatic: true,
          collisionFilter: { mask: 0 },  // anchor never collides with anything
          label: 'gloveAnchor',
        });

        Body.set(bun.body, 'frictionAir', 0.12);  // damp spring oscillation during drag

        gloveConstraint = Constraint.create({
          bodyA: gloveAnchorBody,
          bodyB: bun.body,
          stiffness: 0.2,
          damping: 0.3,
          length: 0,
        });

        Composite.add(engine.world, [gloveAnchorBody, gloveConstraint]);
        bun.sprite.cursor = 'grabbing';
      }

      function releaseGloveDrag() {
        if (!gloveDragBun) return;
        if (gloveDragBun.body) {
          Body.set(gloveDragBun.body, 'frictionAir', 0.02);
        }
        gloveDragBun.sprite.cursor = 'pointer';
        gloveDragBun = null;
        if (gloveConstraint) { Composite.remove(engine.world, gloveConstraint); gloveConstraint = null; }
        if (gloveAnchorBody) { Composite.remove(engine.world, gloveAnchorBody); gloveAnchorBody = null; }
      }

      // ── Stage pointer events ──────────────────────────────
      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(0, 0, W, H);

      app.stage.on('pointermove', (e: { global: { x: number; y: number } }) => {
        const { x, y } = e.global;

        // Glove drag: update anchor position
        if (gloveDragBun && gloveAnchorBody) {
          const { wx, wz } = pointerToGroundXZ(x, y);
          Body.setPosition(gloveAnchorBody, { x: wx, y: wz });
          return;
        }

        // Slingshot drag (pointer mode)
        if (!dragBun || dragBun.sprite.destroyed) return;
        let pullX = x - dragOriginX, pullY = y - dragOriginY;
        const dist = Math.hypot(pullX, pullY);
        if (dist > MAX_PULL) { pullX = pullX / dist * MAX_PULL; pullY = pullY / dist * MAX_PULL; }
        dragBun.sprite.x = dragOriginX + pullX;
        dragBun.sprite.y = dragOriginY + pullY;
        drawTrajectory(
          -pullX * LAUNCH_SCALE, -pullY * LAUNCH_SCALE,
          dragOriginX + pullX, Math.min(dragOriginY + pullY, groundY - 2),
        );
      });

      function releaseDrag() {
        // Release glove drag if active (glove and slingshot are mutually exclusive modes)
        releaseGloveDrag();

        if (!dragBun || dragBun.sprite.destroyed) { dragBun = null; traj.clear(); return; }
        const bun = dragBun;
        dragBun = null;
        traj.clear();

        const pullX = bun.sprite.x - dragOriginX;
        const pullY = bun.sprite.y - dragOriginY;
        bun.sprite.scale.set(BUN_SCALE);

        if (Math.hypot(pullX, pullY) < 12) {
          bun.sprite.x = dragOriginX;
          bun.sprite.y = dragOriginY;
          bun.phase = 'at_launch';
          bun.sprite.cursor = 'grab';
          return;
        }

        const vx = -pullX * LAUNCH_SCALE;
        const vy = -pullY * LAUNCH_SCALE;
        const wy0 = Math.min(bun.sprite.y, groundY - 2);
        const vz  = computeVz(vy, wy0);

        if (vz === null) {
          // SHORT: snap back
          bun.sprite.x = dragOriginX;
          bun.sprite.y = dragOriginY;
          bun.phase = 'at_launch';
          bun.sprite.cursor = 'grab';
          return;
        }

        bun.vx = vx; bun.vy = vy; bun.vz = vz;
        bun.wx0 = bun.sprite.x;  // includes lateral offset
        bun.wy0 = wy0;
        bun.flightStart = performance.now();
        bun.phase = 'in_flight';
        bun.slowFrames = 0;
        bun.sprite.cursor = 'default';
      }

      app.stage.on('pointerup', releaseDrag);
      app.stage.on('pointerupoutside', releaseDrag);

      // ── Stage pointerdown: branch on mode ─────────────────
      app.stage.on('pointerdown', (e: { global: { x: number; y: number } }) => {
        const { x, y } = e.global;

        if (gloveModeRef.current) {
          // Glove mode: grab the visually top reply bun under pointer
          startGloveDrag(x, y);
          return;
        }

        // Pointer mode: tap reply bun to read narration
        // dragBun is set by the player-bun sprite's own pointerdown (which fires first);
        // if it's set we're doing a slingshot pull, not a tap.
        if (dragBun) return;
        const picked = pickBunAt(x, y);
        if (picked) setPopupRef.current(picked.narration);
      });

      // ── Main ticker ───────────────────────────────────────
      app.ticker.add(() => {
        const dt  = app.ticker.deltaMS;
        const now = performance.now();

        if (catPhase === 'chewing') {
          chewMs += dt;
          cat.scale.set(catVisualScale * (1 + Math.sin(chewMs / 140) * 0.05));
        }

        physAccum += dt;
        while (physAccum >= FIXED_STEP) {
          Engine.update(engine, FIXED_STEP, 1);
          physAccum -= FIXED_STEP;
        }

        for (const bun of buns) {
          if (bun.sprite.destroyed) continue;

          // ── in_flight: pure analytic 3D ───────────────────
          if (bun.phase === 'in_flight') {
            const elapsed = now - bun.flightStart;
            const wx = bun.wx0 + bun.vx * elapsed;
            const wy = bun.wy0 + bun.vy * elapsed + 0.5 * GRAVITY * elapsed * elapsed;
            const wz = bun.vz * elapsed;
            const { sx, sy, scale } = project(wx, wy, wz);
            bun.sprite.x = sx;
            bun.sprite.y = sy;
            bun.sprite.scale.set(BUN_SCALE * scale);

            if (sx < -220 || sx > W + 220 || wy < -400) {
              returnToLaunch(bun); continue;
            }
            if (checkHit3D(wx, wy, wz) && catPhase === 'idle') {
              void triggerEat(bun); continue;
            }
            if (wy >= groundY) {
              returnToLaunch(bun); continue;
            }
          }

          // ── returning: Bezier arc back to slingshot ───────
          if (bun.phase === 'returning') {
            const t = Math.min((now - bun.retStartAt) / RETURN_DUR, 1);
            const e = 1 - Math.pow(1 - t, 3);
            const i = 1 - e;
            bun.sprite.x = i*i*bun.retFromX + 2*i*e*bun.retCtrlX + e*e*launchX;
            bun.sprite.y = i*i*bun.retFromY + 2*i*e*bun.retCtrlY + e*e*launchY;
            bun.sprite.rotation *= (1 - t * 0.35);
            // Scale from ~0.75 back to 1.0 as bun returns to z=0
            bun.sprite.scale.set(BUN_SCALE * (0.75 + 0.25 * e));
            if (t >= 1) {
              bun.sprite.x = launchX; bun.sprite.y = launchY;
              bun.sprite.rotation = 0; bun.sprite.scale.set(BUN_SCALE);
              bun.phase = 'at_launch'; bun.sprite.cursor = 'grab';
            }
          }

          // ── flying_out: reply bun Bezier arc ──────────────
          if (bun.phase === 'flying_out') {
            const t = Math.min((now - bun.startAt) / bun.dur, 1);
            const i = 1 - t;
            bun.sprite.x = i*i*bun.fromX + 2*i*t*bun.ctrlX + t*t*bun.toX;
            bun.sprite.y = i*i*bun.fromY + 2*i*t*bun.ctrlY + t*t*bun.toY;
            // Interpolate Z for perspective scale: CAT_Z → toWZ
            const wz_i = bun.fromWZ + (bun.toWZ - bun.fromWZ) * t;
            bun.sprite.scale.set(clampedBunScale(wz_i));

            if (t >= 1) {
              // Create XZ scatter body (body.x=worldX, body.y=worldZ)
              const body = Bodies.circle(bun.toWX, bun.toWZ, bunRadius, {
                restitution: 0.22, friction: 0.85, frictionAir: 0.02,
                label: 'replyBun',
              });
              Body.setVelocity(body, { x: (Math.random() - 0.5) * 2, y: (Math.random() - 0.5) * 0.8 });
              Composite.add(engine.world, body);
              bun.body = body;
              // Shift rotation pivot to visual circle center so the bun spins around its
              // visual center, not the sprite anchor (texture row 50 vs visual row 34.5).
              // sprite.x/y now places this pivot in world space; on_ground sync below compensates.
              bun.sprite.pivot.set(-3, bunHitCY);
              bun.phase = 'on_ground';
              catPhase = 'idle';
              cat.texture = texIdle;
              cat.scale.set(catVisualScale);
              catBusy = false;
              setBusyRef.current(false);
            }
          }

          // ── on_ground: XZ scatter body → sprite sync ──────
          if (bun.phase === 'on_ground' && bun.body) {
            const wx_b = bun.body.position.x;
            const wz_b = bun.body.position.y;   // matter.js Y = world Z
            const { sx, sy: shadow_sy } = project(wx_b, groundY, wz_b);
            const vsc = clampedBunScale(wz_b);
            // pivot=(-3, bunHitCY): sprite.x/y places the visual center (rotation pivot).
            // vsc may exceed raw perspective scale at far depth (MIN_BUN_SCALE floor).
            bun.sprite.x = sx + (-3) * vsc;
            bun.sprite.y = shadow_sy - 1 * BUN_SCALE * vsc + bunHitCY * vsc;
            bun.sprite.scale.set(vsc);
            bun.sprite.rotation = bun.body.angle;
          }
        }

        // ── Depth-sort: near (small Z) buns render on top ─
        const groundBuns = buns.filter(b => b.phase === 'on_ground' && !b.sprite.destroyed && b.body);
        groundBuns.sort((a, b_) => b_!.body!.position.y - a!.body!.position.y);
        groundBuns.forEach((b, i) => { b.sprite.zIndex = i; });

        // ── Redraw shadows ─────────────────────────────────
        shadowLayer.clear();
        const catSc = CAM_DIST / (CAT_Z + CAM_DIST);  // 0.75
        shadowLayer.ellipse(catWX, bgGroundY, catW * 0.22 * catSc, 6 * catSc).fill({ color: 0x3d1a00, alpha: 0.22 });
        shadowLayer.ellipse(launchX, groundY, 15, 4).fill({ color: 0x3d1a00, alpha: 0.22 });
        for (const bun of buns) {
          if (bun.sprite.destroyed || bun.phase !== 'on_ground' || !bun.body) continue;
          const wz_b = bun.body.position.y;
          const { sx, sy, scale: sc } = project(bun.body.position.x, groundY, wz_b);
          shadowLayer.ellipse(sx, sy, bunRadius * 0.75 * sc, 4 * sc).fill({ color: 0x3d1a00, alpha: 0.22 });
        }

        // ── Latest reply bun outline ───────────────────────
        outlineLayer.clear();
        if (latestReplyBunId !== null) {
          const lb = buns.find(b => b.id === latestReplyBunId && !b.sprite.destroyed);
          if (lb) {
            const wz_lb = lb.body ? lb.body.position.y : lb.toWZ;
            const sc_lb = clampedBunScale(wz_lb);
            const _or = (bunRadius + 4) * sc_lb;
            // on_ground (lb.body !== null): pivot set → sprite.x/y = visual center directly.
            // flying_out (lb.body === null): no pivot yet → apply offset to sprite.x/y.
            const vcx_lb = lb.body ? lb.sprite.x : lb.sprite.x + (-3) * sc_lb;
            const vcy_lb = lb.body ? lb.sprite.y : lb.sprite.y + bunHitCY * sc_lb;
            outlineLayer.circle(vcx_lb, vcy_lb, _or + 1).stroke({ color: 0x1a0800, width: 2 });
            outlineLayer.circle(vcx_lb, vcy_lb, _or).stroke({ color: 0xFFE055, width: 3 });
          }
        }
      });

      if (initialNarrationRef.current) {
        setTimeout(() => { if (!cancelled) spitBun(initialNarrationRef.current); }, 400);
      }
    }

    // The PlayPage wrapper is bounded by CSS --vvw (set by the useEffect above), so the
    // container's contentRect.width already reflects the visual viewport. ResizeObserver
    // fires automatically when --vvw changes and causes a layout reflow. Pixi reinit is
    // debounced 100 ms so rapid CSS animation frames (keyboard opening) trigger one reinit,
    // not many.
    let lastW = 0;
    let lastH = 550;
    let reinitTimer: ReturnType<typeof setTimeout> | null = null;
    const pending = { w: 0, h: 550 };

    const maybeReinit = (W: number, H: number) => {
      if (Math.abs(W - lastW) <= 2 && Math.abs(H - lastH) <= 2) return;
      lastW = W; lastH = H;
      const myGen = ++initGen;
      destroyFn?.(); destroyFn = null;
      initPixi(el, W, H, myGen);
    };

    const ro = new ResizeObserver((entries) => {
      if (cancelled) return;
      const { width, height } = entries[0].contentRect;
      if (width <= 0 || height <= 0) return;
      pending.w = Math.round(width);
      pending.h = height;
      if (reinitTimer) clearTimeout(reinitTimer);
      reinitTimer = setTimeout(() => {
        reinitTimer = null;
        if (cancelled) return;
        maybeReinit(pending.w, pending.h);
      }, 100);
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      spawnRef.current = null;
      ro.disconnect();
      if (reinitTimer) clearTimeout(reinitTimer);
      destroyFn?.();
    };
  }, []);

  function submit() {
    const action = text.trim();
    if (!action || busy) return;
    setText('');
    toggleGloveMode(false);  // always return to pointer mode so slingshot works
    spawnRef.current?.(action);
  }

  // Narrow-viewport detection for popup layout (client-only component, window always available).
  const isMobileView = window.innerWidth < 640;

  return (
    <div style={{ position: 'relative', paddingBottom: 80 }}>
      {popup && (
        isMobileView ? (
          // Mobile: bottom sheet. Dismissed automatically when input is focused
          // (onFocus handler on the input) so keyboard-vs-sheet conflicts are avoided.
          <div
            onClick={() => setPopup(null)}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.45)',
              zIndex: 200,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: '12px 12px 0 0',
                padding: '20px 20px 32px',
                maxHeight: '45vh', overflowY: 'auto',
                lineHeight: 1.75, fontSize: 15,
                whiteSpace: 'pre-wrap', color: '#111',
                maxWidth: 'var(--vvw, 100%)',
              }}
            >
              {popup}
              <button
                onClick={() => setPopup(null)}
                style={{
                  display: 'block', marginTop: 16, padding: '6px 18px',
                  fontSize: 13, borderRadius: 6,
                  border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
                }}
              >
                收起
              </button>
            </div>
          </div>
        ) : (
          // Desktop: centered modal (unchanged)
          <div
            onClick={() => setPopup(null)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 200, padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff', borderRadius: 12, padding: '24px 28px',
                maxWidth: 520, width: '100%', lineHeight: 1.75,
                fontSize: 15, whiteSpace: 'pre-wrap', color: '#111',
              }}
            >
              {popup}
              <button
                onClick={() => setPopup(null)}
                style={{
                  display: 'block', marginTop: 20, padding: '6px 18px',
                  fontSize: 13, borderRadius: 6,
                  border: '1px solid #ccc', background: '#fff', cursor: 'pointer',
                }}
              >
                收起
              </button>
            </div>
          </div>
        )
      )}

      {/* Canvas + mode toggle overlay */}
      <div style={{ position: 'relative' }}>
        <div
          ref={mountRef}
          style={{
            width: '100%', height: 550,
            borderRadius: 12, background: '#f5ede0',
            overflow: 'hidden',
          }}
        />

        {/* Mode switch: pointer vs glove — top-right corner */}
        <div
          style={{
            position: 'absolute', top: 8, right: 8,
            display: 'flex', gap: 4, zIndex: 10,
          }}
        >
          <button
            onClick={() => toggleGloveMode(false)}
            title="指標模式：點包子讀回覆"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: `2px solid ${!gloveMode ? '#b07030' : '#ddd'}`,
              background: !gloveMode ? '#fff3e0' : '#f5f5f5',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: !gloveMode ? '#7a4520' : '#bbb',
              boxShadow: !gloveMode ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <MousePointer2 size={18} strokeWidth={1.75}/>
          </button>
          <button
            onClick={() => toggleGloveMode(true)}
            title="手套模式：拖動落地包子"
            style={{
              width: 36, height: 36, borderRadius: 8,
              border: `2px solid ${gloveMode ? '#b07030' : '#ddd'}`,
              background: gloveMode ? '#fff3e0' : '#f5f5f5',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: gloveMode ? '#7a4520' : '#bbb',
              boxShadow: gloveMode ? '0 1px 4px rgba(0,0,0,0.18)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            <Grab size={18} strokeWidth={1.75}/>
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#bbb', marginTop: 5, textAlign: 'center' }}>
        {gloveMode
          ? '手套模式：拖動落地包子撥來撥去 · 切回指標模式讀回覆'
          : '把包子往後拉放開丟給貓 · 落地後點包子讀回覆 · 丟歪的包子會自動飛回'}
      </div>

      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #eee',
          padding: '8px 12px 10px',
          maxWidth: 'min(900px, var(--vvw, 900px))',
          marginLeft: 'var(--vvml, auto)',
          marginRight: 'var(--vvml, auto)',
        }}
      >
        {text === '' && !busy && suggestions.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onMouseDown={e => {
                  e.preventDefault(); // keep focus on input
                  setText(s);
                  inputRef.current?.focus();
                }}
                style={{
                  padding: '4px 10px', fontSize: 12,
                  borderRadius: 12, border: '1px solid #ddd',
                  background: '#f8f4f0', cursor: 'pointer',
                  color: '#555', whiteSpace: 'nowrap',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
            onFocus={() => { if (window.innerWidth < 640) setPopup(null); }}
            placeholder={busy ? '貓在嚼…' : '打字捏包子，然後拖曳瞄準丟（移動 / 解謎 / 查看）'}
            disabled={busy}
            autoFocus
            style={{
              flex: 1, padding: '9px 12px', fontSize: 14,
              borderRadius: 6, border: '1px solid #ccc', outline: 'none',
            }}
          />
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '9px 16px', fontSize: 14, borderRadius: 6,
              border: '1px solid #ccc', background: '#fff',
              cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.4 : 1,
            }}
          >
            捏
          </button>
        </div>
      </div>
    </div>
  );
}
