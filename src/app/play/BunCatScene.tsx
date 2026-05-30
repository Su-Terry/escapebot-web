'use client';

import { useEffect, useRef, useState } from 'react';
import type { Application, Sprite, Graphics as PixiGraphics } from 'pixi.js';
import type * as MatterNS from 'matter-js';

export type ActionResult = {
  narration: string;
  isWon: boolean;
};

type Props = {
  onAction: (action: string) => Promise<ActionResult>;
  onWin: () => void;
  initialNarration?: string;
};

type BunPhase =
  | 'at_launch'   // sitting at launch pad, no body
  | 'dragging'    // player pulling it back
  | 'in_flight'   // physics body live, flying
  | 'returning'   // missed: arc tween back to launch pad (M3.2 entry point for tail-sweep)
  | 'eating'      // consumed, LLM thinking
  | 'flying_out'  // reply bun Bezier arc, no body yet
  | 'on_ground';  // reply bun with live physics body

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
  // Consecutive low-speed frames; resets on any speed spike (stable-stop guard)
  slowFrames: number;
  // Bezier arc fields (reply buns, flying_out only)
  fromX: number; fromY: number;
  ctrlX: number; ctrlY: number;
  toX: number;   toY: number;
  dur: number;   startAt: number;
  // Return-to-launch fields (player buns, 'returning' phase — M3.2 / M3.2.5 hook)
  retFromX: number; retFromY: number;
  retCtrlX: number; retCtrlY: number;
  retStartAt: number;
}

export default function BunCatScene({ onAction, onWin, initialNarration }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const spawnRef = useRef<((action: string) => void) | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [popup, setPopup] = useState<string | null>(null);

  const onActionRef = useRef(onAction);
  useEffect(() => { onActionRef.current = onAction; }, [onAction]);
  const onWinRef = useRef(onWin);
  useEffect(() => { onWinRef.current = onWin; }, [onWin]);
  const setBusyRef = useRef(setBusy);
  const setPopupRef = useRef(setPopup);
  const initialNarrationRef = useRef(initialNarration ?? '');

  useEffect(() => {
    let cancelled = false;
    let destroyFn: (() => void) | null = null;
    const el = mountRef.current;
    if (!el) return;

    async function initPixi(el: HTMLDivElement, W: number, H: number) {
      const [PIXI, Matter] = await Promise.all([
        import('pixi.js'),
        import('matter-js'),
      ]);
      if (cancelled) return;

      const { Engine, Bodies, Body, Composite, Events, World } = Matter;

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

      // ── Matter.js engine ─────────────────────────────────
      const engine = Engine.create();

      destroyFn = () => {
        Events.off(engine, 'collisionStart', onCollisionStart as Parameters<typeof Events.on>[2]);
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
      // GRAVITY in px/ms² — must match engine.gravity.scale so
      // the analytic trajectory formula stays consistent with matter.js.
      const GRAVITY      = 0.00045;
      const LAUNCH_SCALE = 0.016;
      const MAX_PULL     = 190;
      // Fixed physics step (ms).  Body.setVelocity takes px/step, so
      // converting vx/vy (px/ms) → px/step requires multiplying by FIXED_STEP.
      const FIXED_STEP   = 1000 / 60;
      // Stable-stop thresholds: 45 consecutive frames < 0.5 px/step ≈ 750 ms
      // of truly low speed before triggering the return-to-launch arc.
      const SLOW_THRESHOLD = 0.5;
      const SLOW_FRAMES    = 45;
      // Return-to-launch tween duration (ms). Fast enough to feel "咻", long enough to read.
      const RETURN_DUR     = 380;

      const CAT_SCALE = 2;
      const BUN_SCALE = 1.0;           // smaller buns → less ground clutter, launch clears the pile
      const groundY   = H - 44;
      // bunRadius from measured visual content width (41px of 100px sprite).
      const bunRadius = Math.max(Math.ceil((41 * BUN_SCALE) / 2), 12);
      const BUN_VISUAL_YOFFSET = bunRadius - 1;
      // hitArea circle centre y in sprite local coords (anchor 0.5); derived from measured row 34.5.
      const bunHitCY = Math.round(((18 + 51) / 2 - 50) * BUN_SCALE);

      const launchX = 110;
      // Raised launch point so the parabola naturally clears ground-level bun piles.
      const launchY = groundY - 100;

      const catW = 100 * CAT_SCALE;
      const catH = 100 * CAT_SCALE;
      const catX = W - catW - 60;
      const catY = groundY - catH;
      const catCenterX = catX + catW * 0.5;
      const catCenterY = catY + catH * 0.5;
      const mouthX = catX + catW * 0.28;
      const mouthY = catY + catH * 0.38;

      const scatterW = Math.max(catX - 80, 300);

      // ── Configure engine gravity to match hand-rolled GRAVITY ─
      // matter.js applies acceleration = gravity.y * gravity.scale per step.
      // With gravity.y=1 and gravity.scale=GRAVITY: Δvy per step = GRAVITY * FIXED_STEP²
      // which equals our old: vy += GRAVITY * dt (both in px/ms, dt=FIXED_STEP).
      engine.gravity.y = 1;
      engine.gravity.scale = GRAVITY;

      // ── Static world bodies ───────────────────────────────
      const groundBody = Bodies.rectangle(W / 2, groundY + 25, W + 200, 50, {
        isStatic: true, label: 'ground', friction: 0.85, restitution: 0.1,
      });
      const wallL = Bodies.rectangle(-25, H / 2, 50, H + 200, {
        isStatic: true, label: 'wall', restitution: 0.2,
      });
      const wallR = Bodies.rectangle(W + 25, H / 2, 50, H + 200, {
        isStatic: true, label: 'wall', restitution: 0.2,
      });
      // Cat sensor: registers collisions but produces no reaction force.
      const catSensor = Bodies.rectangle(catCenterX, catCenterY, catW * 0.65, catH * 0.65, {
        isStatic: true, isSensor: true, label: 'cat',
      });
      Composite.add(engine.world, [groundBody, wallL, wallR, catSensor]);

      // ── Mutable scene state ───────────────────────────────
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

      // ── Collision: player bun → cat sensor ───────────────
      // Store callback so we can unregister it precisely in cleanup.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function onCollisionStart(evt: any) {
        for (const { bodyA, bodyB } of (evt.pairs as { bodyA: MB; bodyB: MB }[])) {
          let playerBody: MB | null = null;
          if (bodyA.label === 'cat'      && bodyB.label === 'playerBun') playerBody = bodyB;
          else if (bodyB.label === 'cat' && bodyA.label === 'playerBun') playerBody = bodyA;
          if (!playerBody) continue;

          const bun = buns.find(b => b.body === playerBody);
          if (bun && bun.phase === 'in_flight' && !catBusy) {
            triggerEat(bun);
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Events.on(engine, 'collisionStart', onCollisionStart as any);

      // ── PIXI scene ────────────────────────────────────────
      // Layer 1 — Sky/background gradient (replace with bg sprite in future)
      const bgLayer: PixiGraphics = new PIXI.Graphics();
      const skyGrad = new PIXI.FillGradient(0, 0, 0, groundY);
      skyGrad.addColorStop(0, 0xfff9f2);   // warm cream at top
      skyGrad.addColorStop(1, 0xf0dfc8);   // slightly deeper warm at horizon
      bgLayer.rect(0, 0, W, groundY).fill(skyGrad);
      app.stage.addChild(bgLayer);

      // Layer 2 — Ground fill (replace with textured sprite in future)
      const groundLayer: PixiGraphics = new PIXI.Graphics();
      groundLayer.rect(0, groundY, W, H - groundY).fill(0xc8935a);  // warm earth
      groundLayer.rect(0, groundY, W, 5).fill(0xd9a878);            // horizon highlight strip
      app.stage.addChild(groundLayer);

      // Layer 3 — Shadow layer; cleared and redrawn every frame (keep this logic when swapping art)
      const shadowLayer: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(shadowLayer);

      // Tall slingshot: junction just below pocket, arms spread wide, stem buried deep.
      const FORK_JOIN  = { x: launchX,      y: launchY - 12 };
      const FORK_LEFT  = { x: launchX - 30, y: launchY - 80 };
      const FORK_RIGHT = { x: launchX + 30, y: launchY - 80 };
      const FORK_BASE  = { x: launchX,      y: groundY + 55 };  // long stem, deep in earth

      const sling: PixiGraphics = new PIXI.Graphics();
      // Main stem — thick, planted deep into the ground
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_BASE.x, FORK_BASE.y)
           .stroke({ color: 0x6b3d1e, width: 11, cap: 'round' });
      // Fork arms
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_LEFT.x, FORK_LEFT.y)
           .stroke({ color: 0x6b3d1e, width: 8, cap: 'round' });
      sling.moveTo(FORK_JOIN.x, FORK_JOIN.y).lineTo(FORK_RIGHT.x, FORK_RIGHT.y)
           .stroke({ color: 0x6b3d1e, width: 8, cap: 'round' });
      // Fork tip knobs
      sling.circle(FORK_LEFT.x, FORK_LEFT.y, 7).fill(0x6b3d1e);
      sling.circle(FORK_RIGHT.x, FORK_RIGHT.y, 7).fill(0x6b3d1e);
      app.stage.addChild(sling);

      // cat-idle last content row = 63 (measured). Shift sprite down so visual feet hit groundY.
      const catSpriteY = groundY - 63 * CAT_SCALE;
      const cat: Sprite = new PIXI.Sprite(texIdle);
      cat.scale.set(CAT_SCALE);
      cat.anchor.set(0);
      cat.x = catX; cat.y = catSpriteY;
      app.stage.addChild(cat);

      const traj: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(traj);

      // Outline layer: always kept on top by re-raising after each bun sprite addChild.
      const outlineLayer: PixiGraphics = new PIXI.Graphics();
      app.stage.addChild(outlineLayer);

      // ── Trajectory preview (analytic, matches physics gravity) ─
      function drawTrajectory(vx: number, vy: number, sx: number, sy: number) {
        traj.clear();
        traj.moveTo(FORK_LEFT.x, FORK_LEFT.y).lineTo(sx, sy)
            .stroke({ color: 0xcc8844, width: 3, alpha: 0.8, cap: 'round' });
        traj.moveTo(FORK_RIGHT.x, FORK_RIGHT.y).lineTo(sx, sy)
            .stroke({ color: 0xcc8844, width: 3, alpha: 0.8, cap: 'round' });

        const SAMPLE = 50;
        const MAX_STEPS = 40;
        const catHitR = catW * 0.325; // matches sensor half-width
        let willHit = false;
        for (let step = 1; step <= MAX_STEPS; step++) {
          const t  = step * SAMPLE;
          const px = sx + vx * t;
          const py = sy + vy * t + 0.5 * GRAVITY * t * t;
          if (px < -20 || px > W + 20 || py > groundY + 20) break;
          const near  = Math.hypot(px - catCenterX, py - catCenterY) < catHitR;
          const alpha = (1 - step / MAX_STEPS) * 0.95;
          traj.circle(px, py, near ? 7 : 5).fill({ color: near ? 0xff5500 : 0xffcc44, alpha });
          if (near) { willHit = true; break; }
        }
        if (willHit) {
          traj.circle(catCenterX, catCenterY, catW * 0.325 + 10)
              .stroke({ color: 0xff5500, width: 3, alpha: 0.75 });
        }
      }

      // ── Return a missed player bun to the launch pad (M3.2) ─
      // This is the canonical entry point for the "return" behaviour.
      // M3.2.5 will insert a cat-tail-sweep animation here before (or instead of)
      // this arc, or call this after the sweep completes.
      function returnToLaunch(bun: Bun) {
        if (bun.body) { Composite.remove(engine.world, bun.body); bun.body = null; }
        bun.retFromX  = bun.sprite.x;
        bun.retFromY  = bun.sprite.y;
        // Control point arcs over and upward toward the slingshot.
        bun.retCtrlX  = (bun.sprite.x + launchX) / 2;
        bun.retCtrlY  = Math.min(bun.sprite.y, launchY) - 90;
        bun.retStartAt = performance.now();
        bun.slowFrames = 0;
        bun.sprite.cursor  = 'default';
        bun.sprite.scale.set(BUN_SCALE);
        bun.sprite.rotation = 0;
        bun.phase = 'returning';
      }

      // ── Create a physics circle body with initial velocity ─
      // vx/vy are in px/ms (our game units); convert to px/step for matter.js.
      function makeBunBody(x: number, y: number, vx: number, vy: number, label: string): MB {
        const body = Bodies.circle(x, y, bunRadius, {
          restitution: 0.28,
          friction: 0.70,
          frictionAir: 0,   // 0 = pure parabola; matches the analytic trajectory formula exactly
          label,
        });
        Composite.add(engine.world, body);
        Body.setVelocity(body, { x: vx * FIXED_STEP, y: vy * FIXED_STEP });
        return body;
      }

      // ── Eat a player bun (called on sensor collision) ─────
      async function triggerEat(bun: Bun) {
        bun.phase = 'eating';
        if (bun.body) { Composite.remove(engine.world, bun.body); bun.body = null; }
        app.stage.removeChild(bun.sprite);
        bun.sprite.destroy();

        catBusy = true;
        catPhase = 'chewing';
        setBusyRef.current(true);
        cat.texture = texHit;
        cat.scale.set(CAT_SCALE);
        chewMs = 0;

        let result: ActionResult;
        try {
          result = await onActionRef.current(bun.action);
        } catch {
          result = { narration: '（無回應）', isWon: false };
        }
        if (cancelled) return;

        spitBun(result.narration);
        if (result.isWon) setTimeout(() => onWinRef.current(), 900);
      }

      // ── Spit a reply bun: Bezier arc then physics body ────
      function spitBun(narration: string) {
        // Random target X; physics handles stacking, no slot math needed.
        const landX = 50 + Math.random() * scatterW * 0.85;
        // End Bezier at bunRadius above groundY so the spawned body sits
        // exactly on the ground surface (center = groundY - bunRadius).
        const landY = groundY - bunRadius;

        const sprite = new PIXI.Sprite(texBun) as Sprite;
        sprite.scale.set(BUN_SCALE);
        sprite.anchor.set(0.5);
        sprite.x = mouthX; sprite.y = mouthY;
        app.stage.addChild(sprite);
        app.stage.addChild(outlineLayer); // keep outline layer above all bun sprites

        const bun: Bun = {
          id: bunId++, action: '', narration, phase: 'flying_out',
          sprite, isReply: true,
          body: null, slowFrames: 0,
          fromX: mouthX, fromY: mouthY,
          ctrlX: (mouthX + landX) / 2, ctrlY: mouthY - 120,
          toX: landX, toY: landY,
          dur: 780, startAt: performance.now(),
          retFromX: 0, retFromY: 0, retCtrlX: 0, retCtrlY: 0, retStartAt: 0,
        };
        buns.push(bun);
        latestReplyBunId = bun.id;

        sprite.eventMode = 'static';
        sprite.cursor = 'pointer';
        // Restrict hover hit area to visual content only (measured: cols 28-68, rows 18-51).
        // bunHitCY = (34.5−50)×BUN_SCALE in local coords. Radius = bunRadius (visual half-width).
        sprite.hitArea = new PIXI.Circle(-3, bunHitCY, bunRadius);
        sprite.on('pointerover', () => {
          if (bun.phase === 'on_ground') bun.sprite.scale.set(BUN_SCALE * 1.28);
        });
        sprite.on('pointerout', () => {
          if (bun.phase === 'on_ground') bun.sprite.scale.set(BUN_SCALE);
        });

        catPhase = 'spitting';
        cat.texture = texHit;
        cat.scale.set(CAT_SCALE);
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
        app.stage.addChild(outlineLayer); // keep outline layer above all bun sprites

        const bun: Bun = {
          id: bunId++, action, narration: '', phase: 'at_launch',
          sprite, isReply: false,
          body: null, slowFrames: 0,
          fromX: 0, fromY: 0, ctrlX: 0, ctrlY: 0, toX: 0, toY: 0, dur: 0, startAt: 0,
          retFromX: 0, retFromY: 0, retCtrlX: 0, retCtrlY: 0, retStartAt: 0,
        };
        buns.push(bun);

        sprite.on('pointerover', () => {
          if (bun.phase !== 'at_launch') return;
          bun.sprite.scale.set(BUN_SCALE * 1.1);
        });
        sprite.on('pointerout', () => {
          if (dragBun === bun) return;
          if (bun.phase === 'at_launch') bun.sprite.scale.set(BUN_SCALE);
        });
        sprite.on('pointerdown', () => {
          if (catBusy) return;
          if (bun.phase !== 'at_launch') return;
          bun.phase = 'dragging';
          dragBun = bun;
          dragOriginX = bun.sprite.x;
          dragOriginY = bun.sprite.y;
          bun.sprite.cursor = 'grabbing';
          bun.sprite.scale.set(BUN_SCALE * 1.22);
        });

        // First-bun slingshot hint animation
        if (firstBunDemo) {
          firstBunDemo = false;
          const DELAY = 800;
          const PULL_DUR = 550;
          const SNAP_DUR = 320;
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
              const e = 1 - (1-t)*(1-t);
              bun.sprite.x = launchX + DX * (1-e);
              bun.sprite.y = launchY + DY * (1-e);
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

      // ── Stage pointer events ──────────────────────────────
      app.stage.eventMode = 'static';
      app.stage.hitArea = new PIXI.Rectangle(0, 0, W, H);

      app.stage.on('pointermove', (e: { global: { x: number; y: number } }) => {
        if (!dragBun || dragBun.sprite.destroyed) return;
        const { x, y } = e.global;
        let pullX = x - dragOriginX;
        let pullY = y - dragOriginY;
        const dist = Math.hypot(pullX, pullY);
        if (dist > MAX_PULL) { pullX = pullX / dist * MAX_PULL; pullY = pullY / dist * MAX_PULL; }
        dragBun.sprite.x = dragOriginX + pullX;
        dragBun.sprite.y = dragOriginY + pullY;

        const vx = -pullX * LAUNCH_SCALE;
        const vy = -pullY * LAUNCH_SCALE;
        drawTrajectory(vx, vy, dragOriginX + pullX, Math.min(dragOriginY + pullY, groundY - 2));
      });

      function releaseDrag() {
        if (!dragBun || dragBun.sprite.destroyed) { dragBun = null; traj.clear(); return; }
        const bun = dragBun;
        dragBun = null;
        traj.clear();

        const pullX = bun.sprite.x - dragOriginX;
        const pullY = bun.sprite.y - dragOriginY;
        bun.sprite.scale.set(BUN_SCALE);

        // Too-small pull: snap back to launch pad, stay ready.
        if (Math.hypot(pullX, pullY) < 12) {
          bun.sprite.x = dragOriginX;
          bun.sprite.y = dragOriginY;
          bun.phase = 'at_launch';
          bun.sprite.cursor = 'grab';
          return;
        }

        // Clamp to just above ground so the first-frame physics step can't
        // immediately see the bun touching the ground.
        bun.sprite.y = Math.min(bun.sprite.y, groundY - 2);

        const vx = -pullX * LAUNCH_SCALE;
        const vy = -pullY * LAUNCH_SCALE;
        // Spawn body at sprite.y - BUN_VISUAL_YOFFSET so the first body-sync
        // frame (sprite.y = body.y + BUN_VISUAL_YOFFSET) puts the sprite exactly here.
        bun.body = makeBunBody(bun.sprite.x, bun.sprite.y - BUN_VISUAL_YOFFSET, vx, vy, 'playerBun');
        bun.phase = 'in_flight';
        bun.slowFrames = 0;
        bun.sprite.cursor = 'default';
      }

      app.stage.on('pointerup', releaseDrag);
      app.stage.on('pointerupoutside', releaseDrag);

      // ── Reply bun click: closest geometry, stage-level ───
      // Use body.position (not sprite.y which includes BUN_VISUAL_YOFFSET) as the hit centre.
      // Radius = bunRadius so two touching bodies (2*bunRadius apart) have non-overlapping circles.
      const REPLY_CLICK_RADIUS = bunRadius;
      app.stage.on('pointerdown', (e: { global: { x: number; y: number } }) => {
        if (dragBun) return;
        const { x, y } = e.global;
        let closest: Bun | null = null;
        let closestDist = REPLY_CLICK_RADIUS;
        for (const bun of buns) {
          if (bun.phase !== 'on_ground' || bun.sprite.destroyed || !bun.isReply) continue;
          const hitX = bun.body ? bun.body.position.x : bun.sprite.x;
          const hitY = bun.body ? bun.body.position.y : bun.sprite.y - BUN_VISUAL_YOFFSET;
          const dist = Math.hypot(x - hitX, y - hitY);
          if (dist < closestDist) { closestDist = dist; closest = bun; }
        }
        if (closest) setPopupRef.current(closest.narration);
      });

      // ── Main ticker: physics step → sprite sync → logic ──
      app.ticker.add(() => {
        const dt  = app.ticker.deltaMS;
        const now = performance.now();

        // Cat chew wobble while LLM is thinking.
        if (catPhase === 'chewing') {
          chewMs += dt;
          cat.scale.set(CAT_SCALE * (1 + Math.sin(chewMs / 140) * 0.05));
        }

        // Fixed-step physics accumulator: run as many 16.67ms steps as dt allows.
        physAccum += dt;
        while (physAccum >= FIXED_STEP) {
          Engine.update(engine, FIXED_STEP, 1);
          physAccum -= FIXED_STEP;
        }

        for (const bun of buns) {
          if (bun.sprite.destroyed) continue;

          // ── Sync sprite from body (all live-body phases) ──
          // +BUN_VISUAL_YOFFSET shifts sprite center to visual bottom at groundY.
          if (bun.body && bun.phase !== 'dragging' && bun.phase !== 'flying_out') {
            bun.sprite.x = bun.body.position.x;
            bun.sprite.y = bun.body.position.y + BUN_VISUAL_YOFFSET;
            bun.sprite.rotation = bun.body.angle;
          }

          // ── in_flight: off-screen recovery + stable-stop → return ──
          if (bun.phase === 'in_flight' && bun.body) {
            const { x: px, y: py } = bun.body.position;

            // Flew off canvas: start return arc immediately.
            if (px < -220 || px > W + 220 || py < -400) {
              returnToLaunch(bun);
              continue;
            }

            // Stable-stop: count consecutive frames below speed threshold.
            // Any speed spike (rolling, collision bump) resets the counter to
            // prevent premature return while the bun is still moving.
            if (bun.body.speed < SLOW_THRESHOLD) {
              bun.slowFrames++;
            } else {
              bun.slowFrames = 0;
            }

            if (bun.slowFrames >= SLOW_FRAMES) returnToLaunch(bun);
          }

          // ── returning: arc tween back to the slingshot ────────────
          // Entry point for M3.2 tail-sweep (M3.2.5): replace or precede this block.
          if (bun.phase === 'returning') {
            const t = Math.min((now - bun.retStartAt) / RETURN_DUR, 1);
            // Ease-out cubic: fast launch, smooth settle into the slingshot.
            const e = 1 - Math.pow(1 - t, 3);
            const i = 1 - e;
            bun.sprite.x = i*i*bun.retFromX + 2*i*e*bun.retCtrlX + e*e*launchX;
            bun.sprite.y = i*i*bun.retFromY + 2*i*e*bun.retCtrlY + e*e*launchY;
            // Spin damps toward 0 as bun settles into the pocket.
            bun.sprite.rotation *= (1 - t * 0.35);

            if (t >= 1) {
              bun.sprite.x = launchX;
              bun.sprite.y = launchY;
              bun.sprite.rotation = 0;
              bun.phase = 'at_launch';
              bun.sprite.cursor = 'grab';
            }
          }

          // ── flying_out: Bezier arc → spawn physics body at landing ──
          if (bun.phase === 'flying_out') {
            const t = Math.min((now - bun.startAt) / bun.dur, 1);
            const i = 1 - t;
            bun.sprite.x = i*i*bun.fromX + 2*i*t*bun.ctrlX + t*t*bun.toX;
            // Ramp in BUN_VISUAL_YOFFSET so arc lands at same y the body-sync will use (no jump).
            bun.sprite.y = i*i*bun.fromY + 2*i*t*bun.ctrlY + t*t*bun.toY + BUN_VISUAL_YOFFSET * t;

            if (t >= 1) {
              // Arc complete: create physics body at landing position.
              // A tiny downward seed velocity lets matter.js start contact
              // resolution immediately rather than from zero.
              const body = Bodies.circle(bun.toX, bun.toY, bunRadius, {
                restitution: 0.22,
                friction: 0.85,
                frictionAir: 0.02,
                label: 'replyBun',
              });
              Body.setVelocity(body, { x: 0, y: FIXED_STEP * 0.4 });
              Composite.add(engine.world, body);
              bun.body = body;
              bun.phase = 'on_ground';

              catPhase = 'idle';
              cat.texture = texIdle;
              cat.scale.set(CAT_SCALE);
              catBusy = false;
              setBusyRef.current(false);
            }
          }
        }

        // ── Redraw ground shadows (after all positions updated) ──────────
        // ellipse(cx, cy, halfW, halfH) — semi-transparent dark oval on groundY
        shadowLayer.clear();
        shadowLayer.ellipse(catX + catW * 0.5, groundY, catW * 0.22, 6).fill({ color: 0x3d1a00, alpha: 0.22 });
        shadowLayer.ellipse(launchX, groundY, 15, 4).fill({ color: 0x3d1a00, alpha: 0.22 });
        for (const bun of buns) {
          if (bun.sprite.destroyed) continue;
          if (bun.phase === 'on_ground') {
            shadowLayer.ellipse(bun.sprite.x, groundY, bunRadius * 0.75, 4).fill({ color: 0x3d1a00, alpha: 0.22 });
          }
        }

        // ── Latest-reply-bun outline (pixel-art border ring) ─────────────
        // Follows the bun even as physics rolls/stacks it. Clears when next bun arrives.
        outlineLayer.clear();
        if (latestReplyBunId !== null) {
          const lb = buns.find(b => b.id === latestReplyBunId && !b.sprite.destroyed);
          if (lb) {
            const cx = lb.body ? lb.body.position.x : lb.sprite.x;
            const cy = lb.body ? lb.body.position.y : (lb.sprite.y - BUN_VISUAL_YOFFSET);
            // Dark shadow ring (1px outside the bright ring for pixel-art pop)
            outlineLayer.circle(cx, cy, bunRadius + 5).stroke({ color: 0x1a0800, width: 2 });
            // Bright warm-yellow ring
            outlineLayer.circle(cx, cy, bunRadius + 4).stroke({ color: 0xFFE055, width: 3 });
          }
        }
      });

      // Auto-spit opening narration as a reply bun.
      if (initialNarrationRef.current) {
        setTimeout(() => { if (!cancelled) spitBun(initialNarrationRef.current); }, 400);
      }
    }

    let observing = true;
    const ro = new ResizeObserver((entries) => {
      if (!observing || cancelled) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        observing = false;
        ro.disconnect();
        initPixi(el, width, height);
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      spawnRef.current = null;
      if (observing) { observing = false; ro.disconnect(); }
      destroyFn?.();
    };
  }, []);

  function submit() {
    const action = text.trim();
    if (!action || busy) return;
    setText('');
    spawnRef.current?.(action);
  }

  return (
    <div style={{ position: 'relative', paddingBottom: 80 }}>
      {popup && (
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
      )}

      <div
        ref={mountRef}
        style={{
          width: '100%', height: 550,
          borderRadius: 12, background: '#f5ede0',
          overflow: 'hidden',
        }}
      />

      <div style={{ fontSize: 11, color: '#bbb', marginTop: 5, textAlign: 'center' }}>
        把包子往後拉放開丟給貓 · 落地後點包子讀回覆 · 丟歪的包子會自動飛回
      </div>

      <div
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          background: '#fff', borderTop: '1px solid #eee',
          padding: '10px 12px',
          display: 'flex', gap: 8, alignItems: 'center',
          maxWidth: 900, margin: '0 auto',
        }}
      >
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) submit(); }}
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
  );
}
