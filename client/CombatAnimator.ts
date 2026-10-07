// ============================================================
//  CombatAnimator.ts — GSAP sequences for combat GameEvents
//  Supports: Attack nudge, simultaneous hit shake, HP counters,
//  Strikethrough laser beam, Super Block shield bursts, and
//  floating damage text.
// ============================================================

import * as THREE from "three";
import gsap from "gsap";
import { GameEvent, GameEventType, PlayerId } from "../src/types";
import { HeroDisplayData } from "./HeroDisplay";
import { CardMeshData } from "./CardMesh";
import { StatusVisuals } from "./StatusVisuals";
import { Graveyard3D } from "./Graveyard3D";
import {
  LANE_X, PLAYER_FRONTLINE_Z, PLAYER_SUPPORT_Z, OPP_FRONTLINE_Z, OPP_SUPPORT_Z,
  PLAYER_HERO_Z, OPP_HERO_Z,
  ANIM_ATTACK_SLIDE, ANIM_RETURN_SLIDE, ANIM_SHAKE_DUR,
  ANIM_DEATH_DUR, ANIM_INTER_LANE, ANIM_HP_COUNT_DUR, ANIM_BLOCK_FILL,
} from "./visualConstants";

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface UnitMeshEntry {
  instanceId: string;
  group:      THREE.Group;
  meshData:   CardMeshData;
  laneIndex:  number;
  isPlayer:   boolean;
  slotType:   "frontline" | "support";
  currentHp:  number;
  currentAtk?: number;
  baseHp?:    number;
  baseAtk?:   number;
  statusVisuals?: StatusVisuals;
  attackBadgeMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hpBadgeMesh?:     THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  updateBadges?: (
    currentAtk: number,
    currentHp: number,
    baseAtk?: number,
    baseHp?: number,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ) => void;
}

// ─────────────────────────────────────────────────────────────
//  CombatAnimator
// ─────────────────────────────────────────────────────────────

export class CombatAnimator {
  private scene:        THREE.Scene;
  private unitMap:      Map<string, UnitMeshEntry>;
  private playerHero:   HeroDisplayData;
  private oppHero:      HeroDisplayData;
  private unitProvider?: (instanceId: string) => any;
  private myRole:       "p1" | "p2" = "p1";
  private graveyard3D?:  Graveyard3D;

  constructor(
    scene:       THREE.Scene,
    unitMap:     Map<string, UnitMeshEntry>,
    playerHero:  HeroDisplayData,
    oppHero:     HeroDisplayData,
  ) {
    this.scene      = scene;
    this.unitMap    = unitMap;
    this.playerHero = playerHero;
    this.oppHero    = oppHero;
  }

  public setGraveyard3D(graveyard: Graveyard3D): void {
    this.graveyard3D = graveyard;
  }

  public setRole(role: "p1" | "p2" | "P1" | "P2"): void {
    this.myRole = (role === "p2" || role === "P2") ? "p2" : "p1";
  }

  /**
   * Resolves target Hero display console dynamically:
   * Bottom-Right console (playerHero) = Self
   * Top console (oppHero) = Opponent
   */
  public resolveTargetHero(target: PlayerId | string | undefined): HeroDisplayData {
    const isTargetP1 = target === PlayerId.Player || target === "P1" || target === "PLAYER";
    const amP1 = this.myRole === "p1";
    const isSelf = isTargetP1 === amP1;
    return isSelf ? this.playerHero : this.oppHero;
  }

  public setUnitProvider(provider: (instanceId: string) => any): void {
    this.unitProvider = provider;
  }

  public updateUnitBadges(
    unitInstanceId: string,
    currentAtk: number,
    currentHp: number,
    baseAtk: number,
    baseHp: number,
    options?: { animateDamage?: boolean; animateBuff?: boolean },
  ): void {
    const entry = this.unitMap.get(unitInstanceId);
    if (!entry) return;

    entry.currentAtk = currentAtk;
    entry.currentHp = currentHp;
    entry.baseAtk = baseAtk;
    entry.baseHp = baseHp;

    if (entry.updateBadges) {
      entry.updateBadges(currentAtk, currentHp, baseAtk, baseHp, options);
    } else if (entry.meshData.updateBadges) {
      entry.meshData.updateBadges(currentAtk, currentHp, baseAtk, baseHp, options);
    }
  }

  public refreshAllUnitBadges(): void {
    for (const [id, entry] of this.unitMap.entries()) {
      const u = this.unitProvider ? this.unitProvider(id) : undefined;
      if (u) {
        const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
        const bHp = entry.baseHp ?? entry.meshData.card.hp;
        this.updateUnitBadges(id, u.attack, u.currentHp, bAtk, bHp);
      }
    }
  }

  /**
   * Animate the full sequence of combat events for a combat step.
   * Resolves when all GSAP animations finish.
   */
  async animateCombatEvents(events: GameEvent[]): Promise<void> {
    const tl = gsap.timeline();
    let   t  = 0;

    for (const ev of events) {
      switch (ev.type) {

        // ── Unit attacks ────────────────────────────────────────
        case GameEventType.UNIT_ATTACKED: {
          const payload = ev.payload as { laneIndex?: number; attackerId?: string; attack?: number };
          const attacker = payload.attackerId ? this.unitMap.get(payload.attackerId) : null;
          if (!attacker) break;

          const slideDir = attacker.isPlayer ? -1 : 1;
          tl.to(attacker.group.position, {
            duration: ANIM_ATTACK_SLIDE,
            z: attacker.group.position.z + slideDir * 0.65,
            ease: "power2.out",
          }, t);
          t += ANIM_ATTACK_SLIDE;

          tl.to(attacker.group.position, {
            duration: ANIM_RETURN_SLIDE,
            z: attacker.group.position.z,
            ease: "power2.in",
          }, t + 0.05);
          break;
        }

        // ── Strikethrough beam slicing through to hero ──────────
        case GameEventType.STRIKETHROUGH_HIT: {
          const payload = ev.payload as { attackerId?: string; damage?: number };
          const attacker = payload.attackerId ? this.unitMap.get(payload.attackerId) : null;
          if (attacker) {
            tl.add(() => this.spawnStrikethroughBeam(attacker), t);
            t += 0.28;
          }
          break;
        }

        // ── Unit damaged (simultaneous hit shake & HP update) ───
        case GameEventType.UNIT_DAMAGED: {
          const payload = ev.payload as {
            instanceId?: string;
            targetInstanceId?: string;
            damage?: number;
            currentHp?: number;
            remainingHp?: number;
          };
          const id = payload.instanceId ?? payload.targetInstanceId;
          const entry = id ? this.unitMap.get(id) : null;
          if (!entry) break;

          const newHp = payload.currentHp ?? payload.remainingHp ?? (entry.currentHp - (payload.damage ?? 1));
          tl.add(this.shakeObject(entry.group), t);
          tl.add(() => {
            const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
            const bHp = entry.baseHp ?? entry.meshData.card.hp;
            const curAtk = entry.currentAtk ?? entry.meshData.card.attack;
            this.updateUnitBadges(id!, curAtk, newHp, bAtk, bHp, { animateDamage: true });
          }, t);
          tl.add(this.countHp(entry, newHp), t);
          if (payload.damage) {
            tl.add(() => this.spawnDamageNumber(entry.group.position, payload.damage!), t);
          }
          t += 0.22;
          break;
        }

        // ── Unit buffed (Spell / ability effect) ─────────────────
        case GameEventType.UNIT_BUFFED: {
          const payload = ev.payload as {
            targetInstanceId?: string;
            instanceId?: string;
            attackBonus?: number;
            hpBonus?: number;
            currentAtk?: number;
            currentHp?: number;
          };
          const id = payload.targetInstanceId ?? payload.instanceId;
          const entry = id ? this.unitMap.get(id) : null;
          if (entry) {
            tl.add(() => {
              const liveUnit = this.unitProvider ? this.unitProvider(id!) : undefined;
              const curAtk = payload.currentAtk ?? liveUnit?.attack ?? ((entry.currentAtk ?? entry.meshData.card.attack) + (payload.attackBonus ?? 0));
              const curHp = payload.currentHp ?? liveUnit?.currentHp ?? (entry.currentHp + (payload.hpBonus ?? 0));
              const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
              const bHp = entry.baseHp ?? entry.meshData.card.hp;
              this.updateUnitBadges(id!, curAtk, curHp, bAtk, bHp, { animateBuff: true });
            }, t);
            t += 0.22;
          }
          break;
        }

        // ── Equipment attached ──────────────────────────────────
        case GameEventType.EQUIPMENT_ATTACHED: {
          const payload = ev.payload as {
            targetInstanceId?: string;
            attackBonus?: number;
            hpBonus?: number;
          };
          const id = payload.targetInstanceId;
          const entry = id ? this.unitMap.get(id) : null;
          if (entry) {
            tl.add(() => {
              const liveUnit = this.unitProvider ? this.unitProvider(id!) : undefined;
              const curAtk = liveUnit?.attack ?? ((entry.currentAtk ?? entry.meshData.card.attack) + (payload.attackBonus ?? 0));
              const curHp = liveUnit?.currentHp ?? (entry.currentHp + (payload.hpBonus ?? 0));
              const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
              const bHp = entry.baseHp ?? entry.meshData.card.hp;
              this.updateUnitBadges(id!, curAtk, curHp, bAtk, bHp, { animateBuff: true });
            }, t);
            t += 0.22;
          }
          break;
        }

        // ── Unit healed ─────────────────────────────────────────
        case GameEventType.UNIT_HEALED: {
          const payload = ev.payload as {
            instanceId?: string;
            targetInstanceId?: string;
            heal?: number;
            currentHp?: number;
          };
          const id = payload.instanceId ?? payload.targetInstanceId;
          const entry = id ? this.unitMap.get(id) : null;
          if (entry) {
            tl.add(() => {
              const liveUnit = this.unitProvider ? this.unitProvider(id!) : undefined;
              const curHp = payload.currentHp ?? liveUnit?.currentHp ?? (entry.currentHp + (payload.heal ?? 0));
              const curAtk = entry.currentAtk ?? liveUnit?.attack ?? entry.meshData.card.attack;
              const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
              const bHp = entry.baseHp ?? entry.meshData.card.hp;
              this.updateUnitBadges(id!, curAtk, curHp, bAtk, bHp, { animateBuff: true });
            }, t);
            t += 0.20;
          }
          break;
        }

        // ── Aura recalculated ───────────────────────────────────
        case GameEventType.AURA_RECALCULATED: {
          tl.add(() => {
            this.refreshAllUnitBadges();
          }, t);
          t += 0.15;
          break;
        }

        // ── Unit died ───────────────────────────────────────────
        case GameEventType.UNIT_DIED: {
          const { instanceId } = ev.payload as { instanceId: string };
          const entry = this.unitMap.get(instanceId);
          if (!entry) break;

          const deathPos = entry.group.position.clone();
          const isPlayer = entry.isPlayer;

          tl.add(this.deathAnim(entry), t);
          tl.add(() => {
            this.unitMap.delete(instanceId);
            this.scene.remove(entry.group);
            this.graveyard3D?.animateCardToGraveyard(deathPos, isPlayer);
          }, t + ANIM_DEATH_DUR);
          t += ANIM_DEATH_DUR + 0.08;
          break;
        }

        // ── Card sent to Graveyard (Spells / Environments) ───────
        case GameEventType.CARD_SENT_TO_GRAVEYARD: {
          const payload = ev.payload as { playerId?: PlayerId; cardId?: string; laneIndex?: number };
          const isPlayer = payload.playerId
            ? (this.myRole === "p2" ? payload.playerId === PlayerId.Opponent : payload.playerId === PlayerId.Player)
            : true;
          const laneX = payload.laneIndex !== undefined ? LANE_X[payload.laneIndex] : 0;
          tl.add(() => {
            this.graveyard3D?.animateCardToGraveyard(
              new THREE.Vector3(laneX, 0.4, isPlayer ? 1.0 : -1.0),
              isPlayer,
            );
          }, t);
          t += 0.12;
          break;
        }

        // ── Hero damaged ────────────────────────────────────────
        case GameEventType.HERO_DAMAGED: {
          const payload = ev.payload as {
            playerId?: PlayerId;
            targetId?: PlayerId;
            damage?: number;
            currentHp?: number;
            attackerId?: string;
          };
          const target = payload.playerId ?? payload.targetId;
          const hero = this.resolveTargetHero(target);
          const heroPos = hero.group.position;

          if (payload.attackerId) {
            const attacker = this.unitMap.get(payload.attackerId);
            if (attacker) {
              // Direct face attack projectile trajectory towards Hero!
              tl.add(() => this.spawnHeroAttackProjectile(attacker.group.position, heroPos), t);
              t += 0.16;
            }
          }

          tl.add(this.shakeObject(hero.group), t);
          if (payload.currentHp !== undefined) {
            tl.add(() => hero.updateHp(payload.currentHp!, 20), t);
          }
          if (payload.damage) {
            tl.add(() => this.spawnDamageNumber(new THREE.Vector3(heroPos.x, 0.5, heroPos.z), payload.damage!), t);
          }
          t += 0.3;
          break;
        }

        // ── Hero healed ─────────────────────────────────────────
        case GameEventType.HERO_HEALED: {
          const payload = ev.payload as {
            playerId?: PlayerId;
            targetId?: PlayerId;
            heal?: number;
            amount?: number;
            hp?: number;
            currentHp?: number;
          };
          const target = payload.playerId ?? payload.targetId;
          const hero = this.resolveTargetHero(target);
          const heroPos = hero.group.position;
          const newHp = payload.hp ?? payload.currentHp;
          if (newHp !== undefined) {
            tl.add(() => hero.updateHp(newHp, 20), t);
          }
          const healVal = payload.heal ?? payload.amount;
          if (healVal) {
            tl.add(() => this.spawnDamageNumber(new THREE.Vector3(heroPos.x, 0.5, heroPos.z), healVal, "#22c55e", "+"), t);
          }
          t += 0.25;
          break;
        }

        // ── Super block charge roll ──────────────────────────────
        case GameEventType.SUPER_BLOCK_CHARGE: {
          const payload = ev.payload as {
            playerId?: PlayerId;
            targetId?: PlayerId;
            roll?: number;
            chargesGained?: number;
          };
          const target = payload.playerId ?? payload.targetId;
          const charges = payload.roll ?? payload.chargesGained ?? 1;
          const hero = this.resolveTargetHero(target);
          tl.add(() => hero.fillBlockSegments(charges), t);
          t += ANIM_BLOCK_FILL * charges + 0.1;
          break;
        }

        // ── Super block trigger ──────────────────────────────────
        case GameEventType.SUPER_BLOCK_TRIGGER: {
          const payload = ev.payload as { playerId?: PlayerId; targetId?: PlayerId };
          const target = payload.playerId ?? payload.targetId;
          const hero = this.resolveTargetHero(target);
          tl.add(() => hero.shieldBurst(this.scene), t);
          tl.add(() => hero.resetBlockMeter(), t + 0.25);
          t += 0.85;
          break;
        }

        // ── Deathrattle cascade shockwave ────────────────────────
        case GameEventType.DEATHRATTLE_TRIGGER: {
          tl.add(() => this.spawnDeathrattleVfx(ev.payload as Record<string, unknown>), t);
          t += 0.3;
          break;
        }

        // ── Lane combat step start / end ─────────────────────────
        case GameEventType.COMBAT_LANE_STARTED: {
          t += 0.15;
          break;
        }
        case GameEventType.COMBAT_LANE_ENDED: {
          t += ANIM_INTER_LANE;
          break;
        }

        default:
          break;
      }
    }

    return new Promise<void>((resolve) => {
      tl.eventCallback("onComplete", resolve);
      if (tl.duration() === 0) resolve();
    });
  }

  // ── Strikethrough Laser Beam VFX ─────────────────────────────

  private spawnStrikethroughBeam(attacker: UnitMeshEntry): void {
    const isFriendly = attacker.isPlayer;
    const startPos = new THREE.Vector3(attacker.group.position.x, 0.35, attacker.group.position.z);
    const targetHero = isFriendly ? this.oppHero : this.playerHero;
    const targetPos = new THREE.Vector3(targetHero.group.position.x, 0.35, targetHero.group.position.z);
    const len = Math.max(1, startPos.distanceTo(targetPos));

    const geo = new THREE.CylinderGeometry(0.12, 0.12, len, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const beam = new THREE.Mesh(geo, mat);
    beam.position.copy(startPos).add(targetPos).multiplyScalar(0.5);
    const dir = new THREE.Vector3().subVectors(targetPos, startPos).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(beam);

    gsap.timeline()
      .fromTo(beam.scale, { x: 0.2, y: 1, z: 0.2 }, { x: 2.2, y: 1, z: 2.2, duration: 0.2, ease: "power2.out" })
      .to(mat, { opacity: 0, duration: 0.25, onComplete: () => this.scene.remove(beam) });
  }

  // ── Direct Face Attack Projectile VFX ─────────────────────────

  private spawnHeroAttackProjectile(from: THREE.Vector3, to: THREE.Vector3): void {
    const start = new THREE.Vector3(from.x, 0.35, from.z);
    const target = new THREE.Vector3(to.x, 0.35, to.z);

    const geo = new THREE.SphereGeometry(0.2, 16, 16);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xff4422,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const proj = new THREE.Mesh(geo, mat);
    proj.position.copy(start);
    this.scene.add(proj);

    const trailGeo = new THREE.CylinderGeometry(0.08, 0.02, 0.8, 8);
    const trailMat = new THREE.MeshBasicMaterial({
      color: 0xff8822,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const trail = new THREE.Mesh(trailGeo, trailMat);
    proj.add(trail);
    const dir = new THREE.Vector3().subVectors(target, start).normalize();
    trail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
    trail.position.copy(dir.clone().multiplyScalar(-0.4));

    gsap.timeline()
      .to(proj.position, {
        duration: 0.22,
        x: target.x,
        y: target.y,
        z: target.z,
        ease: "power2.in",
      })
      .to(proj.scale, { duration: 0.08, x: 2.2, y: 2.2, z: 2.2, ease: "power2.out" })
      .to([mat, trailMat], { duration: 0.1, opacity: 0, onComplete: () => this.scene.remove(proj) }, "<");
  }

  // ── Floating Damage Number Sprite ────────────────────────────

  private spawnDamageNumber(pos: THREE.Vector3, dmg: number, color = "#ff4422", prefix = "-"): void {
    const canvas = document.createElement("canvas");
    canvas.width = 128; canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.font = "bold 44px 'Inter', Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${prefix}${dmg}`, 64, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 1.0 });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(1.5, 0.75, 1);
    sprite.position.set(pos.x, pos.y + 0.6, pos.z);
    this.scene.add(sprite);

    gsap.timeline()
      .to(sprite.position, { y: sprite.position.y + 0.9, duration: 0.7, ease: "power1.out" })
      .to(mat, { opacity: 0, duration: 0.4 }, "-=0.35")
      .add(() => {
        this.scene.remove(sprite);
        tex.dispose();
      });
  }

  // ── Internal animation builders ───────────────────────────────

  private shakeObject(obj: THREE.Object3D): gsap.core.Timeline {
    const orig = { x: obj.position.x, z: obj.position.z };
    return gsap.timeline()
      .to(obj.position, { duration: ANIM_SHAKE_DUR, x: orig.x + 0.16 })
      .to(obj.position, { duration: ANIM_SHAKE_DUR, x: orig.x - 0.16 })
      .to(obj.position, { duration: ANIM_SHAKE_DUR, x: orig.x + 0.09 })
      .to(obj.position, { duration: ANIM_SHAKE_DUR, x: orig.x });
  }

  private countHp(entry: UnitMeshEntry, targetHp: number): gsap.core.Tween {
    const proxy = { hp: entry.currentHp };
    return gsap.to(proxy, {
      duration: ANIM_HP_COUNT_DUR,
      hp:       targetHp,
      ease:     "none",
      onUpdate: () => {
        const rounded = Math.round(proxy.hp);
        const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
        const bHp = entry.baseHp ?? entry.meshData.card.hp;
        const curAtk = entry.currentAtk ?? entry.meshData.card.attack;
        if (entry.updateBadges) {
          entry.updateBadges(curAtk, rounded, bAtk, bHp, { animateDamage: false, animateBuff: false });
        }
        entry.meshData.updateTexture(rounded, curAtk, bAtk, bHp);
      },
      onComplete: () => {
        entry.currentHp = targetHp;
        const bAtk = entry.baseAtk ?? entry.meshData.card.attack;
        const bHp = entry.baseHp ?? entry.meshData.card.hp;
        const curAtk = entry.currentAtk ?? entry.meshData.card.attack;
        if (entry.updateBadges) {
          entry.updateBadges(curAtk, targetHp, bAtk, bHp, { animateDamage: false, animateBuff: false });
        }
      },
    });
  }

  private deathAnim(entry: UnitMeshEntry): gsap.core.Timeline {
    return gsap.timeline()
      .to(entry.group.scale, {
        duration: ANIM_DEATH_DUR * 0.4,
        x: 1.25, y: 1.25, z: 1.25,
        ease: "power2.out",
      })
      .to(entry.group.scale, {
        duration: ANIM_DEATH_DUR * 0.6,
        x: 0.0, y: 0.0, z: 0.0,
        ease: "power3.in",
      })
      .to(entry.group.position, {
        duration: ANIM_DEATH_DUR * 0.6,
        y: -0.5,
        ease: "power3.in",
      }, "<");
  }

  private spawnDeathrattleVfx(payload: Record<string, unknown>): void {
    const id = payload["instanceId"] as string | undefined;
    const entry = id ? this.unitMap.get(id) : null;
    const pos = entry ? entry.group.position : new THREE.Vector3(0, 0, 0);

    const geo = new THREE.RingGeometry(0.3, 0.7, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffaa00, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos);
    ring.position.y += 0.2;
    this.scene.add(ring);

    gsap.timeline()
      .to(ring.scale, { duration: 0.5, x: 6, y: 6, z: 6, ease: "power2.out" })
      .to(mat, { duration: 0.35, opacity: 0, onComplete: () => this.scene.remove(ring) }, "-=0.25");
  }
}

// ─────────────────────────────────────────────────────────────
//  Spawn unit mesh into scene with sub-slot positioning
// ─────────────────────────────────────────────────────────────

export function spawnUnitMesh(
  scene:       THREE.Scene,
  unitMap:     Map<string, UnitMeshEntry>,
  meshData:    CardMeshData,
  instanceId:  string,
  laneIndex:   number,
  isPlayer:    boolean,
  hp:          number,
  slotType:    "frontline" | "support" = "frontline",
  attack?:     number,
  baseHp?:     number,
  baseAtk?:    number,
): UnitMeshEntry {
  const isFront = slotType === "frontline";
  let slotZ: number;
  if (isPlayer) {
    slotZ = isFront ? PLAYER_FRONTLINE_Z : PLAYER_SUPPORT_Z;
  } else {
    slotZ = isFront ? OPP_FRONTLINE_Z : OPP_SUPPORT_Z;
  }

  // Subtle depth offset for support units: slightly sunken elevation and 0.94 perspective scale
  const baseElev = laneIndex === 0 ? 0.28 : 0.06;
  const elev = isFront ? baseElev : baseElev - 0.028;
  const targetScale = isFront ? 1.0 : 0.94;
  const g = meshData.group;
  g.userData = { instanceId, isFieldUnit: true };
  meshData.bodyMesh.userData = { instanceId, isFieldUnit: true };

  g.position.set(LANE_X[laneIndex], elev, slotZ);
  g.rotation.set(-Math.PI / 2 + (isFront ? 0.05 : 0.02), 0, 0);

  scene.add(g);

  // Scale-in entrance
  g.scale.set(0, 0, 0);
  gsap.to(g.scale, { duration: 0.4, x: targetScale, y: targetScale, z: targetScale, ease: "back.out(1.8)" });

  const curAtk = attack ?? meshData.currentAtk ?? meshData.card.attack;
  const bHp = baseHp ?? meshData.baseHp ?? meshData.card.hp;
  const bAtk = baseAtk ?? meshData.baseAtk ?? meshData.card.attack;

  const entry: UnitMeshEntry = {
    instanceId,
    group: g,
    meshData,
    laneIndex,
    isPlayer,
    slotType,
    currentHp: hp,
    currentAtk: curAtk,
    baseHp: bHp,
    baseAtk: bAtk,
    attackBadgeMesh: meshData.attackBadgeMesh,
    hpBadgeMesh: meshData.hpBadgeMesh,
    updateBadges: meshData.updateBadges,
  };

  // Ensure initial badge textures match base & current values without initial damage animation
  if (entry.updateBadges) {
    entry.updateBadges(curAtk, hp, bAtk, bHp, { animateDamage: false, animateBuff: false });
  }

  entry.statusVisuals = new StatusVisuals(entry);
  unitMap.set(instanceId, entry);
  return entry;
}
