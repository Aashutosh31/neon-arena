import {
  ARENA_HALF_EXTENT,
  MAX_ARMOR,
  MAX_HEALTH,
} from "../shared/constants";
import {
  DEFAULT_RULES,
  sanitizeName,
  sanitizeRules,
} from "../shared/game";
import { MAP_ROOFS, MAP_SIDEWALKS } from "../shared/map";
import type {
  GameMode,
  GameRules,
  GameStatePayload,
  PlayerState,
  WeaponId,
} from "../shared/types";
import { WEAPONS, WEAPON_ORDER } from "../shared/weapons";

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export interface MenuActions {
  offlineTdm: () => void;
  offlineFfa: () => void;
  onlineTdm: () => void;
  onlineFfa: () => void;
}

export interface GameActions {
  resume: () => void;
  leave: () => void;
  cancelSearch: () => void;
  pause: () => void;
  selectWeapon: (weapon: WeaponId) => void;
}

export class Hud {
  private readonly menu = byId<HTMLDivElement>("menu");
  private readonly searching = byId<HTMLDivElement>("searching");
  private readonly pause = byId<HTMLDivElement>("pause");
  private readonly death = byId<HTMLDivElement>("death-overlay");
  private readonly deathTitle = byId<HTMLHeadingElement>("death-title");
  private readonly deathKiller = byId<HTMLDivElement>("death-killer");
  private readonly deathSubtitle = byId<HTMLDivElement>("death-subtitle");
  private readonly matchOver = byId<HTMLDivElement>("match-over");
  private readonly matchOverTitle = byId<HTMLDivElement>("match-over-title");
  private readonly matchOverSubtitle =
    byId<HTMLDivElement>("match-over-subtitle");
  private readonly connection = byId<HTMLDivElement>("connection-status");
  private readonly ping = byId<HTMLDivElement>("ping");
  private readonly crosshair = byId<HTMLDivElement>("crosshair");
  private readonly scope = byId<HTMLDivElement>("scope");
  private readonly scopeZoom = byId<HTMLDivElement>("scope-zoom");
  private readonly scopeHint = byId<HTMLDivElement>("scope-hint");
  private readonly opticStatus = byId<HTMLDivElement>("optic-status");
  private readonly healthBar = byId<HTMLDivElement>("health-bar");
  private readonly healthFill = byId<HTMLDivElement>("health-fill");
  private readonly healthLabel = byId<HTMLDivElement>("health-label");
  private readonly armorBar = byId<HTMLDivElement>("armor-bar");
  private readonly armorFill = byId<HTMLDivElement>("armor-fill");
  private readonly armorLabel = byId<HTMLDivElement>("armor-label");
  private readonly medkitCount = byId<HTMLSpanElement>("medkit-count");
  private readonly grenadeCount = byId<HTMLSpanElement>("grenade-count");
  private readonly touchMedkit =
    byId<HTMLButtonElement>("touch-medkit");
  private readonly touchGrenade =
    byId<HTMLButtonElement>("touch-grenade");
  private readonly minimap = byId<HTMLCanvasElement>("minimap");
  private readonly hitMarker = byId<HTMLDivElement>("hit-marker");
  private readonly damageFlash = byId<HTMLDivElement>("damage-flash");
  private readonly matchTimer = byId<HTMLDivElement>("match-timer");
  private readonly modeLabel = byId<HTMLDivElement>("mode-label");
  private readonly teamScores = byId<HTMLDivElement>("team-scores");
  private readonly alphaScore = byId<HTMLSpanElement>("alpha-score");
  private readonly bravoScore = byId<HTMLSpanElement>("bravo-score");
  private readonly ffaStatus = byId<HTMLDivElement>("ffa-status");
  private readonly scoreboardRows = byId<HTMLDivElement>("scoreboard-rows");
  private readonly killFeed = byId<HTMLDivElement>("kill-feed");
  private readonly weaponName = byId<HTMLDivElement>("weapon-name");
  private readonly ammoCurrent = byId<HTMLSpanElement>("ammo-current");
  private readonly ammoReserve = byId<HTMLSpanElement>("ammo-reserve");
  private readonly reloadStatus = byId<HTMLDivElement>("reload-status");
  private readonly weaponSlots = byId<HTMLDivElement>("weapon-slots");
  private readonly searchingMode = byId<HTMLDivElement>("searching-mode");
  private readonly searchingStatus =
    byId<HTMLDivElement>("searching-status");
  private readonly playerName = byId<HTMLInputElement>("player-name");
  private readonly lockHint = byId<HTMLDivElement>("lock-hint");
  private readonly modBots = byId<HTMLSelectElement>("mod-bots");
  private readonly modDamage = byId<HTMLInputElement>("mod-damage");
  private readonly modSpeed = byId<HTMLInputElement>("mod-speed");
  private readonly modGravity = byId<HTMLInputElement>("mod-gravity");
  private readonly modDuration = byId<HTMLSelectElement>("mod-duration");
  private readonly modInfinite = byId<HTMLInputElement>("mod-infinite");
  private readonly modFriendly = byId<HTMLInputElement>("mod-friendly");
  private readonly modDamageValue =
    byId<HTMLOutputElement>("mod-damage-value");
  private readonly modSpeedValue =
    byId<HTMLOutputElement>("mod-speed-value");
  private readonly modGravityValue =
    byId<HTMLOutputElement>("mod-gravity-value");
  private readonly modPanel = byId<HTMLDivElement>("mod-panel");
  private readonly modFile = byId<HTMLInputElement>("mod-file");

  private health = MAX_HEALTH;
  private lastTimerText = "";
  private lastTimerLow = false;
  private scoreboardSignature = "";
  private lastAmmoText = "";
  private lastWeaponText = "";
  private lastReloadText = "";
  private hitMarkerTimeout = 0;
  private damageFlashTimeout = 0;
  private matchOverScoreLine = "";
  private minimapBase: HTMLCanvasElement | null = null;

  constructor() {
    this.buildWeaponSlots([], () => undefined);
    this.loadName();
    this.loadMods();
    this.bindMods();
    this.buildMinimapBase();
  }

  bindMenu(actions: MenuActions): void {
    byId<HTMLButtonElement>("play-offline-tdm")?.addEventListener(
      "click",
      actions.offlineTdm,
    );
    byId<HTMLButtonElement>("play-offline-ffa")?.addEventListener(
      "click",
      actions.offlineFfa,
    );
    byId<HTMLButtonElement>("play-online-tdm")?.addEventListener(
      "click",
      actions.onlineTdm,
    );
    byId<HTMLButtonElement>("play-online-ffa")?.addEventListener(
      "click",
      actions.onlineFfa,
    );
  }

  bindGame(actions: GameActions): void {
    byId<HTMLButtonElement>("resume-button")?.addEventListener(
      "click",
      actions.resume,
    );
    byId<HTMLButtonElement>("leave-button")?.addEventListener(
      "click",
      actions.leave,
    );
    byId<HTMLButtonElement>("cancel-search")?.addEventListener(
      "click",
      actions.cancelSearch,
    );
    byId<HTMLButtonElement>("match-leave")?.addEventListener(
      "click",
      actions.leave,
    );
    byId<HTMLButtonElement>("touch-pause")?.addEventListener(
      "click",
      actions.pause,
    );
    this.buildWeaponSlots(WEAPON_ORDER, actions.selectWeapon);
  }

  getPlayerName(): string {
    return sanitizeName(this.playerName?.value, "Operator");
  }

  readModRules(): GameRules {
    return sanitizeRules({
      damageMultiplier: Number(this.modDamage?.value ?? 1),
      speedMultiplier: Number(this.modSpeed?.value ?? 1),
      gravityMultiplier: Number(this.modGravity?.value ?? 1),
      infiniteAmmo: this.modInfinite?.checked === true,
      friendlyFire: this.modFriendly?.checked === true,
      botCount: Number(this.modBots?.value ?? DEFAULT_RULES.botCount),
      matchDurationSeconds: Number(
        this.modDuration?.value ?? DEFAULT_RULES.matchDurationSeconds,
      ),
    });
  }

  saveMods(): void {
    try {
      localStorage.setItem(
        "neon-arena-mod",
        JSON.stringify(this.readModRules()),
      );
    } catch {
      return;
    }
  }

  setConnection(text: string): void {
    if (this.connection) {
      this.connection.textContent = text;
    }
  }

  setPing(text: string): void {
    if (this.ping) {
      this.ping.textContent = text;
    }
  }

  setHealth(health: number): void {
    const clamped = Math.max(0, Math.min(MAX_HEALTH, Math.round(health)));
    if (clamped < this.health && this.health > 0) {
      this.flashDamage();
    }
    this.health = clamped;
    if (this.healthFill) {
      this.healthFill.style.width = `${(clamped / MAX_HEALTH) * 100}%`;
    }
    if (this.healthLabel) {
      this.healthLabel.textContent = `HP ${clamped}`;
    }
    this.healthBar?.classList.toggle("low", clamped <= 25);
  }

  setArmor(armor: number): void {
    const clamped = Math.max(0, Math.min(MAX_ARMOR, Math.round(armor)));
    if (this.armorFill) {
      this.armorFill.style.width = `${(clamped / MAX_ARMOR) * 100}%`;
    }
    if (this.armorLabel) {
      this.armorLabel.textContent = `ARMOR ${clamped}`;
    }
    this.armorBar?.classList.toggle("low", clamped <= 0);
  }

  updateUtilities(medkits: number, grenades: number): void {
    if (this.medkitCount) {
      this.medkitCount.textContent = `MEDKIT ${medkits} · H`;
      this.medkitCount.classList.toggle("utility-empty", medkits <= 0);
    }
    if (this.grenadeCount) {
      this.grenadeCount.textContent = `FRAG ${grenades} · G`;
      this.grenadeCount.classList.toggle("utility-empty", grenades <= 0);
    }
    if (this.touchMedkit) {
      this.touchMedkit.textContent = `MED ${medkits}`;
      this.touchMedkit.classList.toggle("utility-empty", medkits <= 0);
    }
    if (this.touchGrenade) {
      this.touchGrenade.textContent = `FRAG ${grenades}`;
      this.touchGrenade.classList.toggle("utility-empty", grenades <= 0);
    }
  }

  updateMinimap(state: GameStatePayload, localId: string): void {
    const canvas = this.minimap;
    const base = this.minimapBase;
    if (!canvas || !base) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    const size = canvas.width;
    context.clearRect(0, 0, size, size);
    context.drawImage(base, 0, 0);

    const toMap = (x: number, z: number): [number, number] => {
      const padding = 12;
      const scale = (size - padding * 2) / (ARENA_HALF_EXTENT * 2);
      return [
        padding + (x + ARENA_HALF_EXTENT) * scale,
        padding + (z + ARENA_HALF_EXTENT) * scale,
      ];
    };

    for (const pickup of state.pickups) {
      if (!pickup.available) {
        continue;
      }
      const [x, y] = toMap(pickup.position.x, pickup.position.z);
      context.fillStyle =
        pickup.kind === "medkit" ? "#66ffb2" : "#5ad8ff";
      context.globalAlpha = 0.78;
      context.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    context.globalAlpha = 1;

    const local = state.players.find((player) => player.id === localId);
    for (const player of state.players) {
      if (player.id === localId || player.health <= 0) {
        continue;
      }
      const [x, y] = toMap(player.position.x, player.position.z);
      const friendly =
        state.mode === "tdm" &&
        local !== undefined &&
        player.team === local.team;
      context.fillStyle = friendly ? "#66f6ff" : "#ff3d5e";
      context.shadowColor = context.fillStyle;
      context.shadowBlur = friendly ? 4 : 8;
      context.beginPath();
      context.arc(x, y, friendly ? 2.6 : 3.4, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;

    if (local) {
      const [x, y] = toMap(local.position.x, local.position.z);
      context.save();
      context.translate(x, y);
      context.rotate(-local.rotation.y);
      context.fillStyle = "#ffffff";
      context.shadowColor = "#66f6ff";
      context.shadowBlur = 8;
      context.beginPath();
      context.moveTo(0, -6);
      context.lineTo(4.2, 4.6);
      context.lineTo(0, 2.6);
      context.lineTo(-4.2, 4.6);
      context.closePath();
      context.fill();
      context.restore();
      context.shadowBlur = 0;
    }
  }

  flashHit(headshot: boolean): void {
    if (!this.hitMarker) {
      return;
    }
    this.hitMarker.classList.toggle("headshot", headshot);
    this.hitMarker.style.opacity = "1";
    window.clearTimeout(this.hitMarkerTimeout);
    this.hitMarkerTimeout = window.setTimeout(() => {
      if (this.hitMarker) {
        this.hitMarker.style.opacity = "0";
      }
    }, 110);
  }

  flashDamage(): void {
    if (!this.damageFlash) {
      return;
    }
    this.damageFlash.style.opacity = "0.55";
    window.clearTimeout(this.damageFlashTimeout);
    this.damageFlashTimeout = window.setTimeout(() => {
      if (this.damageFlash) {
        this.damageFlash.style.opacity = "0";
      }
    }, 140);
  }

  updateTimer(seconds: number): void {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    const text = `${minutes}:${(total % 60).toString().padStart(2, "0")}`;
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      if (this.matchTimer) {
        this.matchTimer.textContent = text;
      }
    }
    const low = seconds <= 15;
    if (low !== this.lastTimerLow) {
      this.lastTimerLow = low;
      this.matchTimer?.classList.toggle("low", low);
    }
  }

  updateTeam(state: GameStatePayload): void {
    if (this.modeLabel) {
      this.modeLabel.textContent =
        state.mode === "tdm" ? "TEAM DEATHMATCH 4V4" : "FREE FOR ALL";
    }
    this.teamScores?.classList.toggle("hidden", state.mode === "ffa");
    this.ffaStatus?.classList.toggle("hidden", state.mode !== "ffa");
    if (this.ffaStatus && state.mode === "ffa") {
      const leader = [...state.players].sort(
        (a, b) => b.kills - a.kills || a.deaths - b.deaths,
      )[0];
      this.ffaStatus.textContent = leader
        ? `LEADER ${leader.name}  ${leader.kills} KILLS`
        : "FREE FOR ALL";
    }
    if (this.alphaScore) {
      this.alphaScore.textContent = String(state.scores.alpha);
    }
    if (this.bravoScore) {
      this.bravoScore.textContent = String(state.scores.bravo);
    }
  }

  updateScoreboard(players: PlayerState[], localId: string): void {
    if (!this.scoreboardRows) {
      return;
    }
    const sorted = [...players].sort(
      (a, b) =>
        b.kills - a.kills ||
        a.deaths - b.deaths ||
        a.name.localeCompare(b.name),
    );
    let signature = "";
    for (const entry of sorted) {
      signature += `${entry.id}:${entry.name}:${entry.team}:${entry.kills}:${entry.deaths}:${entry.isBot}|`;
    }
    if (signature === this.scoreboardSignature) {
      return;
    }
    this.scoreboardSignature = signature;
    const fragment = document.createDocumentFragment();
    for (const entry of sorted) {
      const row = document.createElement("div");
      row.className = `score-row team-${entry.team}`;
      const name = document.createElement("span");
      const local = entry.id === localId;
      name.className = local ? "score-name local" : "score-name";
      name.textContent = local ? `${entry.name} (YOU)` : entry.name;
      if (entry.isBot) {
        const tag = document.createElement("span");
        tag.className = "bot-tag";
        tag.textContent = "BOT";
        name.append(" ", tag);
      }
      const score = document.createElement("span");
      score.className = "score-kd";
      score.textContent = `${entry.kills} / ${entry.deaths}`;
      row.append(name, score);
      fragment.append(row);
    }
    this.scoreboardRows.replaceChildren(fragment);
  }

  updateWeapon(
    weapon: WeaponId,
    ammo: number,
    reserve: number,
    reloading: boolean,
  ): void {
    const spec = WEAPONS[weapon];
    if (spec.name !== this.lastWeaponText) {
      this.lastWeaponText = spec.name;
      if (this.weaponName) {
        this.weaponName.textContent = spec.name;
      }
    }
    const ammoText = `${ammo}|${reserve}`;
    if (ammoText !== this.lastAmmoText) {
      this.lastAmmoText = ammoText;
      if (this.ammoCurrent) {
        this.ammoCurrent.textContent = `${ammo}`;
      }
      if (this.ammoReserve) {
        this.ammoReserve.textContent = `${reserve}`;
      }
    }
    const reloadText = reloading
      ? "RELOADING"
      : ammo <= 0
        ? "EMPTY — RELOAD"
        : "";
    if (reloadText !== this.lastReloadText) {
      this.lastReloadText = reloadText;
      if (this.reloadStatus) {
        this.reloadStatus.textContent = reloadText;
        this.reloadStatus.classList.toggle(
          "active",
          reloadText.length > 0,
        );
      }
    }
    if (this.weaponSlots) {
      for (const child of this.weaponSlots.children) {
        const element = child as HTMLElement;
        element.classList.toggle(
          "active",
          element.dataset.weapon === weapon,
        );
      }
    }
  }

  setAiming(
    aiming: boolean,
    scoped: boolean,
    zoomLabel = "",
    canCycle = false,
  ): void {
    this.crosshair?.classList.toggle("ads", aiming);
    this.crosshair?.classList.toggle("hidden", scoped);
    this.scope?.classList.toggle("visible", scoped);
    if (this.scopeZoom) {
      this.scopeZoom.textContent = zoomLabel;
    }
    if (this.scopeHint) {
      const touch = document.body.classList.contains("touch");
      this.scopeHint.textContent = canCycle
        ? touch
          ? "TAP ZOOM TO CYCLE"
          : "V / WHEEL TO CYCLE"
        : "";
    }
    if (this.opticStatus) {
      this.opticStatus.textContent = aiming && zoomLabel ? zoomLabel : "";
    }
  }

  showDeath(details: {
    killerName?: string | null;
    killerWeapon?: WeaponId | null;
    headshot?: boolean;
  } = {}): void {
    this.death?.classList.add("visible");
    if (this.deathTitle) {
      this.deathTitle.textContent = "YOU DIED";
    }
    if (this.deathKiller) {
      if (details.killerName) {
        const tags: string[] = [];
        if (details.headshot) {
          tags.push("HEADSHOT");
        }
        if (details.killerWeapon) {
          tags.push(WEAPONS[details.killerWeapon].name.toUpperCase());
        }
        const suffix = tags.length > 0 ? ` · ${tags.join(" · ")}` : "";
        this.deathKiller.textContent = `KILLED BY ${details.killerName.toUpperCase()}${suffix}`;
      } else {
        this.deathKiller.textContent = "NO SURVIVORS · STAY SHARP";
      }
    }
    if (this.deathSubtitle) {
      this.deathSubtitle.textContent = "RESPAWNING IN 3";
    }
  }

  hideDeath(): void {
    this.death?.classList.remove("visible");
  }

  updateDeathCountdown(respawnAt: number): void {
    if (!this.deathSubtitle) {
      return;
    }
    const seconds = Math.max(
      0,
      Math.ceil((respawnAt - Date.now()) / 1000),
    );
    this.deathSubtitle.textContent = `RESPAWNING IN ${seconds}`;
  }

  addKillFeed(
    killer: string,
    victim: string,
    headshot: boolean,
    weapon?: WeaponId | null,
  ): void {
    if (!this.killFeed) {
      return;
    }
    const entry = document.createElement("div");
    entry.className = "kill-entry";
    const killerNode = document.createElement("span");
    killerNode.className = "kill-killer";
    killerNode.textContent = killer;
    const action = document.createElement("span");
    action.className = "kill-weapon";
    const weaponLabel = weapon ? WEAPONS[weapon].shortName : "";
    action.textContent = [
      weaponLabel,
      headshot ? "HEADSHOT" : "ELIMINATED",
    ]
      .filter(Boolean)
      .join(" · ");
    const victimNode = document.createElement("span");
    victimNode.className = "kill-victim";
    victimNode.textContent = victim;
    entry.append(killerNode, action, victimNode);
    this.killFeed.prepend(entry);
    while (this.killFeed.childElementCount > 5) {
      this.killFeed.lastElementChild?.remove();
    }
    window.setTimeout(() => entry.remove(), 4200);
  }

  showMatchOver(
    winner: "alpha" | "bravo" | "draw",
    scores: Record<"alpha" | "bravo", number>,
    restartIn: number,
    state: GameStatePayload,
  ): void {
    if (!this.matchOver) {
      return;
    }
    this.matchOverScoreLine = `CYAN ${scores.alpha}  —  ${scores.bravo} EMBER`;
    if (this.matchOverTitle) {
      this.matchOverTitle.classList.remove("alpha", "bravo");
    }
    if (state.mode === "ffa") {
      const leader = [...state.players].sort(
        (a, b) => b.kills - a.kills || a.deaths - b.deaths,
      )[0];
      if (this.matchOverTitle) {
        this.matchOverTitle.textContent = "MATCH COMPLETE";
      }
      if (this.matchOverSubtitle) {
        this.matchOverSubtitle.textContent = leader
          ? `${leader.name} TOP FRAGS ${leader.kills}`
          : "ROUND OVER";
      }
      this.matchOverScoreLine = this.matchOverSubtitle?.textContent ?? "";
    } else {
      if (this.matchOverTitle) {
        this.matchOverTitle.textContent =
          winner === "draw"
            ? "DRAW"
            : winner === "alpha"
              ? "CYAN VICTORY"
              : "EMBER VICTORY";
        this.matchOverTitle.classList.toggle("alpha", winner === "alpha");
        this.matchOverTitle.classList.toggle("bravo", winner === "bravo");
      }
      if (this.matchOverSubtitle) {
        this.matchOverSubtitle.textContent = this.matchOverScoreLine;
      }
    }
    this.matchOverTimer = restartIn;
    this.matchOverAt = performance.now();
    this.matchOver.classList.add("visible");
  }

  hideMatchOver(): void {
    this.matchOver?.classList.remove("visible");
  }

  updateMatchRestart(): void {
    if (
      !this.matchOver?.classList.contains("visible") ||
      this.matchOverTimer <= 0 ||
      !this.matchOverSubtitle
    ) {
      return;
    }
    const remaining = Math.max(
      0,
      Math.ceil(
        (this.matchOverAt + this.matchOverTimer - performance.now()) / 1000,
      ),
    );
    this.matchOverSubtitle.textContent = `${this.matchOverScoreLine}  —  NEXT IN ${remaining}`;
  }

  startMatch(): void {
    this.menu?.classList.remove("visible");
    this.searching?.classList.remove("visible");
    this.pause?.classList.remove("visible");
    this.death?.classList.remove("visible");
    this.hideMatchOver();
    this.killFeed?.replaceChildren();
    this.scoreboardSignature = "";
    this.setLockHint(false);
  }

  showMenu(): void {
    this.menu?.classList.add("visible");
    this.searching?.classList.remove("visible");
    this.pause?.classList.remove("visible");
    this.death?.classList.remove("visible");
    this.hideMatchOver();
    this.setLockHint(false);
  }

  showSearching(mode: GameMode): void {
    this.menu?.classList.remove("visible");
    this.searching?.classList.add("visible");
    if (this.searchingMode) {
      this.searchingMode.textContent =
        mode === "tdm" ? "SEARCHING: 4V4 TDM" : "SEARCHING: FREE FOR ALL";
    }
    this.updateSearching("CONNECTING TO MATCHMAKER...");
  }

  updateSearching(text: string): void {
    if (this.searchingStatus) {
      this.searchingStatus.textContent = text;
    }
  }

  showPause(): void {
    this.pause?.classList.add("visible");
  }

  hidePause(): void {
    this.pause?.classList.remove("visible");
  }

  setLockHint(visible: boolean): void {
    if (this.lockHint) {
      this.lockHint.style.display = visible ? "block" : "none";
    }
  }

  private matchOverTimer = 0;
  private matchOverAt = 0;

  private buildMinimapBase(): void {
    const size = this.minimap?.width ?? 220;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const padding = 12;
    const scale = (size - padding * 2) / (ARENA_HALF_EXTENT * 2);
    const toMap = (x: number, z: number): [number, number] => [
      padding + (x + ARENA_HALF_EXTENT) * scale,
      padding + (z + ARENA_HALF_EXTENT) * scale,
    ];

    context.fillStyle = "#03090f";
    context.fillRect(0, 0, size, size);

    context.strokeStyle = "rgba(102, 246, 255, 0.08)";
    context.lineWidth = 1;
    for (let value = -40; value <= 40; value += 10) {
      const [x] = toMap(value, 0);
      const [, y] = toMap(0, value);
      context.beginPath();
      context.moveTo(x, padding);
      context.lineTo(x, size - padding);
      context.moveTo(padding, y);
      context.lineTo(size - padding, y);
      context.stroke();
    }

    context.fillStyle = "#0a1d27";
    for (const sidewalk of MAP_SIDEWALKS) {
      const [x, y] = toMap(sidewalk.x, sidewalk.z);
      context.fillRect(
        x - (sidewalk.width * scale) / 2,
        y - (sidewalk.depth * scale) / 2,
        sidewalk.width * scale,
        sidewalk.depth * scale,
      );
    }

    for (const roof of MAP_ROOFS) {
      const [x, y] = toMap(roof.x, roof.z);
      const width = roof.width * scale;
      const depth = roof.depth * scale;
      context.fillStyle = "#143342";
      context.strokeStyle = "rgba(88, 220, 255, 0.42)";
      context.lineWidth = 1;
      context.fillRect(x - width / 2, y - depth / 2, width, depth);
      context.strokeRect(x - width / 2, y - depth / 2, width, depth);
    }

    context.strokeStyle = "rgba(88, 220, 255, 0.35)";
    context.lineWidth = 1.5;
    context.strokeRect(
      padding,
      padding,
      size - padding * 2,
      size - padding * 2,
    );

    context.fillStyle = "rgba(102, 246, 255, 0.6)";
    context.font = "bold 9px monospace";
    context.textAlign = "left";
    context.fillText("N", padding + 3, padding + 10);
    this.minimapBase = canvas;
  }

  private buildWeaponSlots(
    weapons: readonly WeaponId[],
    onSelect: (weapon: WeaponId) => void,
  ): void {
    if (!this.weaponSlots) {
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const weapon of weapons) {
      const spec = WEAPONS[weapon];
      const button = document.createElement("button");
      button.type = "button";
      button.className = "weapon-slot";
      button.dataset.weapon = weapon;
      button.style.setProperty("--weapon-accent", spec.hudColor);
      const number = document.createElement("span");
      number.textContent = `${spec.slot}`;
      const name = document.createElement("strong");
      name.textContent = spec.shortName;
      button.append(number, name);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        onSelect(weapon);
      });
      fragment.append(button);
    }
    this.weaponSlots.replaceChildren(fragment);
  }

  private loadName(): void {
    try {
      const saved = localStorage.getItem("neon-arena-name");
      if (saved && this.playerName) {
        this.playerName.value = saved;
      }
    } catch {
      return;
    }
    this.playerName?.addEventListener("change", () => {
      try {
        localStorage.setItem(
          "neon-arena-name",
          sanitizeName(this.playerName?.value, "Operator"),
        );
      } catch {
        return;
      }
    });
  }

  private loadMods(): void {
    try {
      const saved = localStorage.getItem("neon-arena-mod");
      if (saved) {
        this.applyMods(sanitizeRules(JSON.parse(saved)));
        return;
      }
    } catch {
      this.applyMods(DEFAULT_RULES);
      return;
    }
    this.applyMods(DEFAULT_RULES);
  }

  private applyMods(rules: GameRules): void {
    if (this.modBots) {
      this.setSelectValue(this.modBots, rules.botCount, "BOTS");
    }
    if (this.modDamage) {
      this.modDamage.value = String(rules.damageMultiplier);
    }
    if (this.modSpeed) {
      this.modSpeed.value = String(rules.speedMultiplier);
    }
    if (this.modGravity) {
      this.modGravity.value = String(rules.gravityMultiplier);
    }
    if (this.modDuration) {
      this.setSelectValue(
        this.modDuration,
        rules.matchDurationSeconds,
        "SECONDS",
      );
    }
    if (this.modInfinite) {
      this.modInfinite.checked = rules.infiniteAmmo;
    }
    if (this.modFriendly) {
      this.modFriendly.checked = rules.friendlyFire;
    }
    this.updateModOutputs();
  }

  private setSelectValue(
    select: HTMLSelectElement,
    value: number,
    suffix: string,
  ): void {
    const text = String(value);
    if (
      !Array.from(select.options).some(
        (option) => option.value === text,
      )
    ) {
      const option = document.createElement("option");
      option.value = text;
      option.textContent = `${value} ${suffix}`;
      select.append(option);
    }
    select.value = text;
  }

  private updateModOutputs(): void {
    if (this.modDamageValue && this.modDamage) {
      this.modDamageValue.textContent = `${Number(this.modDamage.value).toFixed(2)}x`;
    }
    if (this.modSpeedValue && this.modSpeed) {
      this.modSpeedValue.textContent = `${Number(this.modSpeed.value).toFixed(2)}x`;
    }
    if (this.modGravityValue && this.modGravity) {
      this.modGravityValue.textContent = `${Number(this.modGravity.value).toFixed(2)}x`;
    }
  }

  private bindMods(): void {
    this.modDamage?.addEventListener("input", () => this.updateModOutputs());
    this.modSpeed?.addEventListener("input", () => this.updateModOutputs());
    this.modGravity?.addEventListener("input", () => this.updateModOutputs());
    byId<HTMLButtonElement>("mod-toggle")?.addEventListener("click", () => {
      this.modPanel?.classList.toggle("open");
    });
    byId<HTMLButtonElement>("mod-reset")?.addEventListener("click", () => {
      this.applyMods(DEFAULT_RULES);
      this.saveMods();
    });
    byId<HTMLButtonElement>("mod-export")?.addEventListener("click", () => {
      const payload = JSON.stringify(
        { name: "Neon Arena Custom Rules", rules: this.readModRules() },
        null,
        2,
      );
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "neon-arena-mod.json";
      anchor.click();
      URL.revokeObjectURL(url);
    });
    byId<HTMLButtonElement>("mod-import")?.addEventListener("click", () => {
      this.modFile?.click();
    });
    this.modFile?.addEventListener("change", async () => {
      const file = this.modFile?.files?.[0];
      if (!file) {
        return;
      }
      try {
        const parsed = JSON.parse(await file.text()) as {
          rules?: unknown;
        };
        this.applyMods(sanitizeRules(parsed.rules ?? parsed));
        this.saveMods();
      } catch {
        this.updateSearching("INVALID MOD FILE");
      } finally {
        if (this.modFile) {
          this.modFile.value = "";
        }
      }
    });
  }
}
