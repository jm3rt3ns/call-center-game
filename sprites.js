/**
 * Call Center Chaos - Sprite System
 *
 * Loads pixel-art sprite packs and plays their animations on 2D canvas.
 *
 * A pack is a folder under assets/sprites/ containing horizontal-strip sheets
 * plus a pack.json manifest. Packs are listed in assets/sprites/packs.json and
 * assigned to actors through CONFIG.sprites.actors. See assets/sprites/README.md.
 */

// ============================================
// ROLES
// ============================================
// The game asks for roles, never for a pack's own animation names, so a pack
// with a different naming scheme only has to fill in its own "roles" map.
const SPRITE_ROLE = {
    IDLE: 'idle',
    WALK: 'walk',
    RUN: 'run',
    WORK: 'work',
    TALK: 'talk',
    ANGRY: 'angry',
    SLAM: 'slam',
    COMMAND: 'command',
    CARRY: 'carry',
    WAIT: 'wait',
    HURT: 'hurt',
    FALL: 'fall',
    GET_UP: 'getUp',
    CELEBRATE: 'celebrate',
    DEAD: 'dead',
};

// ============================================
// SPRITE ANIMATION - one clip from one sheet
// ============================================
class SpriteAnimation {
    constructor(name, image, def, frameWidth, frameHeight) {
        this.name = name;
        this.image = image;
        this.frameCount = def.frames;
        this.frameMs = def.frameMs;
        this.loop = def.loop !== false;
        this.frameWidth = frameWidth;
        this.frameHeight = frameHeight;
        // Row lets a pack point several animations at one multi-row sheet.
        this.row = def.row || 0;
        this.firstFrame = def.firstFrame || 0;
    }

    get durationMs() {
        return this.frameCount * this.frameMs;
    }

    // Source rectangle of a frame inside the sheet
    frameRect(index) {
        return {
            x: (this.firstFrame + index) * this.frameWidth,
            y: this.row * this.frameHeight,
            w: this.frameWidth,
            h: this.frameHeight,
        };
    }
}

// ============================================
// SPRITE PACK - one character's animation set
// ============================================
class SpritePack {
    constructor(manifest, basePath) {
        this.id = manifest.id;
        this.name = manifest.name || manifest.id;
        this.basePath = basePath;
        this.frameWidth = manifest.frameWidth;
        this.frameHeight = manifest.frameHeight;
        this.origin = manifest.origin || { x: manifest.frameWidth / 2, y: manifest.frameHeight };
        this.mirrorWhenFacingLeft = manifest.mirrorWhenFacingLeft === true;
        this.defaultAnimation = manifest.defaultAnimation;
        this.roles = manifest.roles || {};
        this.animationDefs = manifest.animations || {};
        this.animations = {};
        this.loaded = false;
    }

    // Load every sheet the manifest references. Resolves once all are decoded.
    async load() {
        const names = Object.keys(this.animationDefs);
        const images = await Promise.all(
            names.map(name => SpritePack.loadImage(this.basePath + this.animationDefs[name].sheet))
        );

        names.forEach((name, i) => {
            this.animations[name] = new SpriteAnimation(
                name, images[i], this.animationDefs[name], this.frameWidth, this.frameHeight
            );
        });

        if (!this.defaultAnimation || !this.animations[this.defaultAnimation]) {
            this.defaultAnimation = names[0];
        }
        this.loaded = true;
        return this;
    }

    static loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Failed to load sprite sheet: ${src}`));
            img.src = src;
        });
    }

    // Resolve a role (or a raw animation name) to a clip this pack actually has.
    resolve(roleOrName) {
        if (!roleOrName) return this.animations[this.defaultAnimation];
        const mapped = this.roles[roleOrName];
        return this.animations[mapped] || this.animations[roleOrName] || this.animations[this.defaultAnimation];
    }

    has(roleOrName) {
        const mapped = this.roles[roleOrName];
        return Boolean(this.animations[mapped] || this.animations[roleOrName]);
    }
}

// ============================================
// SPRITE LIBRARY - registry of loaded packs
// ============================================
class SpriteLibrary {
    constructor() {
        this.packs = {};
        this.ready = false;
        this.errors = [];
        this.inlineNoted = false;
    }

    /**
     * Read a manifest from assets/sprites/. Served over HTTP that is a plain
     * fetch; opened from the filesystem, fetch() is blocked, so fall back to
     * the copy manifests.js inlines (see scripts/gen-sprite-manifests.py).
     * Sheets themselves are <img> loads, which file:// URLs do allow.
     */
    async loadManifest(basePath, relPath) {
        try {
            const response = await fetch(basePath + relPath);
            if (!response.ok) throw new Error(`${relPath}: HTTP ${response.status}`);
            return await response.json();
        } catch (err) {
            const inlined = typeof window !== 'undefined' && window.SPRITE_MANIFESTS;
            const manifest = inlined && inlined[relPath];
            if (!manifest) throw err;
            if (!this.inlineNoted) {
                console.info('[sprites] fetch unavailable, reading manifests.js instead');
                this.inlineNoted = true;
            }
            return manifest;
        }
    }

    // Read assets/sprites/packs.json and load every pack it lists.
    async loadAll(basePath = 'assets/sprites/') {
        this.basePath = basePath;
        try {
            const registry = await this.loadManifest(basePath, 'packs.json');
            await Promise.all((registry.packs || []).map(entry => this.loadPack(entry, basePath)));
        } catch (err) {
            // The game falls back to procedural pixel drawing, so a missing or
            // unreachable pack must never stop it from starting.
            this.errors.push(err.message);
            console.warn('[sprites] pack registry unavailable, using procedural fallback:', err.message);
        }
        this.ready = true;
        return this;
    }

    async loadPack(entry, basePath) {
        try {
            const manifestUrl = basePath + entry.manifest;
            const manifest = await this.loadManifest(basePath, entry.manifest);
            const packBase = manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1);
            const pack = new SpritePack(manifest, packBase);
            await pack.load();
            this.packs[pack.id] = pack;
            console.log(`[sprites] loaded pack "${pack.id}" (${Object.keys(pack.animations).length} animations)`);
        } catch (err) {
            this.errors.push(err.message);
            console.warn(`[sprites] could not load pack "${entry.id}":`, err.message);
        }
    }

    get(packId) {
        return packId ? this.packs[packId] || null : null;
    }

    // Pack assigned to an actor type ('manager', 'employee', ...) in CONFIG.
    forActor(actorType) {
        if (typeof CONFIG === 'undefined' || !CONFIG.sprites || CONFIG.sprites.enabled === false) return null;
        return this.get(CONFIG.sprites.actors[actorType]);
    }
}

const spriteLibrary = new SpriteLibrary();

// ============================================
// SPRITE ANIMATOR - playback state for one entity
// ============================================
class SpriteAnimator {
    constructor(pack, scale = 1) {
        this.pack = pack || null;
        this.scale = scale;
        this.current = null;
        this.currentRole = null;
        this.elapsed = 0;
        this.frame = 0;
        this.finished = false;
        this.facing = 1;          // 1 = right, -1 = left
        // A one-shot role (a yell, a fall) holds the sprite until it plays out.
        this.lockedUntilFinished = false;
        this.oneShot = false;     // stop a looping clip after a single cycle
        this.onFinish = null;

        if (this.pack) this.play(this.pack.defaultAnimation);
    }

    get available() {
        return Boolean(this.pack && this.pack.loaded);
    }

    /**
     * Start a role. Ignored while a locked one-shot is still playing unless
     * force is set. Restarting the role already playing is a no-op so looping
     * animations don't stutter.
     */
    play(role, { force = false, lock = false, once = false, onFinish = null } = {}) {
        if (!this.available) return false;
        if (this.lockedUntilFinished && !this.finished && !force) return false;

        const animation = this.pack.resolve(role);
        if (!animation) return false;
        if (animation === this.current && !force) return true;

        this.current = animation;
        this.currentRole = role;
        this.elapsed = 0;
        this.frame = 0;
        this.finished = false;
        this.oneShot = once;
        this.lockedUntilFinished = lock;
        this.onFinish = onFinish;
        return true;
    }

    /**
     * Play a role through exactly one cycle, then hand control back to the
     * caller. Works for looping clips too - several of the reaction animations
     * (the yell, the smug victory) are authored as loops, and without this they
     * would be replaced by locomotion on the very next frame.
     */
    playOnce(role, onFinish = null) {
        return this.play(role, { force: true, lock: true, once: true, onFinish });
    }

    get busy() {
        return this.lockedUntilFinished && !this.finished;
    }

    setFacing(direction) {
        if (direction < 0) this.facing = -1;
        else if (direction > 0) this.facing = 1;
    }

    update(deltaMs) {
        if (!this.available || !this.current) return;

        const loops = this.current.loop && !this.oneShot;
        if (this.finished && !loops) return;

        this.elapsed += deltaMs;
        const frameMs = this.current.frameMs;
        while (this.elapsed >= frameMs) {
            this.elapsed -= frameMs;
            this.frame++;
            if (this.frame >= this.current.frameCount) {
                if (loops) {
                    this.frame = 0;
                } else {
                    this.frame = this.current.frameCount - 1;
                    this.finished = true;
                    this.lockedUntilFinished = false;
                    const callback = this.onFinish;
                    this.onFinish = null;
                    if (callback) callback();
                    return;
                }
            }
        }
    }

    /**
     * Draw the current frame with its origin (feet) at ground position x, y.
     * Returns false when no sprite is available so callers can fall back to
     * their procedural drawing.
     */
    draw(ctx, x, y, scaleOverride = null) {
        if (!this.available || !this.current) return false;

        const scale = scaleOverride || this.scale;
        const pack = this.pack;
        const rect = this.current.frameRect(this.frame);
        const drawWidth = rect.w * scale;
        const drawHeight = rect.h * scale;
        const originX = pack.origin.x * scale;
        const originY = pack.origin.y * scale;

        // Snap to whole pixels - half-pixel offsets blur pixel art.
        const left = Math.round(x - originX);
        const top = Math.round(y - originY);

        const mirror = pack.mirrorWhenFacingLeft && this.facing === -1;
        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;

        if (mirror) {
            ctx.save();
            ctx.translate(left + drawWidth, top);
            ctx.scale(-1, 1);
            ctx.drawImage(this.current.image, rect.x, rect.y, rect.w, rect.h, 0, 0, drawWidth, drawHeight);
            ctx.restore();
        } else {
            ctx.drawImage(this.current.image, rect.x, rect.y, rect.w, rect.h, left, top, drawWidth, drawHeight);
        }

        ctx.imageSmoothingEnabled = smoothing;
        return true;
    }

    // Height of the drawn sprite above the ground point, for placing bars/labels.
    get drawnHeightAboveGround() {
        if (!this.available) return 0;
        return this.pack.origin.y * this.scale;
    }
}
