/**
 * Call Center Chaos - Touch and pointer input
 *
 * The keyboard still works exactly as it did. This adds the gestures a phone
 * needs on top of it:
 *
 *   drag   - a floating stick appears under your thumb and the manager runs
 *            the way you push it, in screen directions rather than the world's
 *            isometric axes
 *   tap    - shout at whoever you tapped and send them back to their desk
 *   pinch  - zoom the office in and out around the automatic framing
 *
 * Nothing in here knows about game rules; it converts gestures into calls on
 * the Game and the Manager and leaves the rules where they were.
 */

/** Coarse pointer or a touch screen - decides which prompts the game shows. */
function isTouchDevice() {
    if (typeof window === 'undefined') return false;
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return true;
    return (navigator.maxTouchPoints || 0) > 0;
}

class TouchControls {
    /**
     * @param {HTMLCanvasElement} canvas surface the gestures are read from
     * @param {HTMLElement} joystick the floating stick's root element
     * @param {object} hooks { getGame() }
     */
    constructor(canvas, joystick, hooks) {
        this.canvas = canvas;
        this.joystick = joystick;
        this.knob = joystick ? joystick.querySelector('.joystick-knob') : null;
        this.getGame = hooks.getGame;

        // Live pointers, so a second finger can start a pinch mid-drag
        this.pointers = new Map();

        // The drag that is steering, if any
        this.steering = null;
        this.pinch = null;

        this.bind();
    }

    get config() {
        return CONFIG.input || {};
    }

    bind() {
        // The canvas must not scroll, zoom or select while it is being played
        this.canvas.style.touchAction = 'none';

        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        this.canvas.addEventListener('pointermove', (e) => this.onPointerMove(e));
        this.canvas.addEventListener('pointerup', (e) => this.onPointerUp(e));
        this.canvas.addEventListener('pointercancel', (e) => this.onPointerUp(e, true));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Trackpads and mice get the same zoom the pinch gives a phone
        this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    }

    active() {
        const game = this.getGame();
        return game && game.state === GAME_STATE.PLAYING ? game : null;
    }

    /** Pointer position in canvas pixels, which is what the camera works in. */
    canvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / (rect.width || 1);
        const scaleY = this.canvas.height / (rect.height || 1);
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
            clientX: e.clientX,
            clientY: e.clientY,
        };
    }

    onPointerDown(e) {
        const game = this.active();
        if (!game) return;

        // A press on the floor is play, not a text selection or a page scroll
        e.preventDefault();
        this.canvas.setPointerCapture(e.pointerId);

        if (typeof soundManager !== 'undefined') soundManager.resume();

        const point = this.canvasPoint(e);
        this.pointers.set(e.pointerId, point);

        if (this.pointers.size === 2) {
            this.beginPinch(game);
            return;
        }
        if (this.pointers.size > 2) return;

        this.steering = {
            pointerId: e.pointerId,
            originX: point.clientX,
            originY: point.clientY,
            startedAt: performance.now(),
            dragging: false,
            // A mouse steers only once it has been dragged; a finger gets the
            // stick straight away, since there is no keyboard behind it
            touch: e.pointerType !== 'mouse',
        };

        if (this.steering.touch) {
            this.showJoystick(point.clientX, point.clientY, 0, 0);
        }
    }

    onPointerMove(e) {
        const game = this.active();
        if (!game || !this.pointers.has(e.pointerId)) return;

        const point = this.canvasPoint(e);
        this.pointers.set(e.pointerId, point);

        if (this.pinch) {
            this.updatePinch(game);
            return;
        }

        const steering = this.steering;
        if (!steering || steering.pointerId !== e.pointerId) return;

        const dx = point.clientX - steering.originX;
        const dy = point.clientY - steering.originY;
        const travel = Math.sqrt(dx * dx + dy * dy);

        if (!steering.dragging && travel > (this.config.tapMaxTravel || 14)) {
            steering.dragging = true;
            if (!steering.touch) this.showJoystick(steering.originX, steering.originY, 0, 0);
        }

        if (steering.dragging) {
            this.steer(game, dx, dy);
            this.showJoystick(steering.originX, steering.originY, dx, dy);
        }
    }

    onPointerUp(e, cancelled = false) {
        const point = this.pointers.get(e.pointerId);
        this.pointers.delete(e.pointerId);

        if (this.canvas.hasPointerCapture && this.canvas.hasPointerCapture(e.pointerId)) {
            this.canvas.releasePointerCapture(e.pointerId);
        }

        if (this.pinch) {
            // Lifting one of two fingers ends the pinch rather than handing the
            // remaining finger a drag it never started
            if (this.pointers.size < 2) this.pinch = null;
            return;
        }

        const steering = this.steering;
        if (!steering || steering.pointerId !== e.pointerId) return;

        this.steering = null;
        this.hideJoystick();

        const game = this.active();
        if (game) game.manager.setAnalogMove(0, 0);
        if (cancelled || !game || !point) return;

        const heldFor = performance.now() - steering.startedAt;
        if (!steering.dragging && heldFor <= (this.config.tapMaxDurationMs || 300)) {
            const scene = game.camera.screenToScene(point.x, point.y);
            game.handleTap(scene.x, scene.y);
        }
    }

    /**
     * Push the manager the way the stick points. The stick is read in screen
     * directions - up the screen is up the screen - and turned into the world's
     * isometric axes, so the office moves the way it looks like it should.
     */
    steer(game, dx, dy) {
        const radius = this.config.joystickRadius || 56;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const deadzone = radius * (this.config.joystickDeadzone || 0.18);

        if (distance <= deadzone) {
            game.manager.setAnalogMove(0, 0);
            return;
        }

        // Tilt from the edge of the deadzone out to the rim, so a small push is
        // a walk and a full push is a run
        const tilt = Math.min(1, (distance - deadzone) / Math.max(1, radius - deadzone));
        const world = this.screenVectorToWorld(game.office, dx / distance, dy / distance);
        game.manager.setAnalogMove(world.x * tilt, world.y * tilt);
    }

    /**
     * Invert the isometric projection for a direction: the same maths as
     * Office.fromIso, without the offsets, renormalised so the result is a
     * unit direction rather than a distance.
     */
    screenVectorToWorld(office, sx, sy) {
        const halfWidth = office.tileWidth / 2;
        const halfHeight = office.tileHeight / 2;
        const x = (sx / halfWidth + sy / halfHeight) / 2;
        const y = (sy / halfHeight - sx / halfWidth) / 2;
        const length = Math.sqrt(x * x + y * y) || 1;
        return { x: x / length, y: y / length };
    }

    beginPinch(game) {
        this.steering = null;
        this.hideJoystick();
        game.manager.setAnalogMove(0, 0);

        this.pinch = {
            startDistance: this.pointerDistance() || 1,
            startZoom: game.camera.userZoom,
        };
    }

    updatePinch(game) {
        const distance = this.pointerDistance();
        if (!distance) return;
        game.camera.setUserZoom(this.pinch.startZoom * (distance / this.pinch.startDistance));
    }

    pointerDistance() {
        const points = [...this.pointers.values()];
        if (points.length < 2) return 0;
        const dx = points[0].clientX - points[1].clientX;
        const dy = points[0].clientY - points[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    onWheel(e) {
        const game = this.active();
        if (!game) return;
        e.preventDefault();
        const step = e.deltaY > 0 ? 0.9 : 1.1;
        game.camera.setUserZoom(game.camera.userZoom * step);
    }

    showJoystick(clientX, clientY, dx, dy) {
        if (!this.joystick) return;

        const radius = this.config.joystickRadius || 56;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const clamp = distance > radius ? radius / distance : 1;

        this.joystick.style.left = `${clientX}px`;
        this.joystick.style.top = `${clientY}px`;
        this.joystick.classList.remove('hidden');
        if (this.knob) {
            this.knob.style.transform =
                `translate(-50%, -50%) translate(${dx * clamp}px, ${dy * clamp}px)`;
        }
    }

    hideJoystick() {
        if (!this.joystick) return;
        this.joystick.classList.add('hidden');
        if (this.knob) this.knob.style.transform = 'translate(-50%, -50%)';
    }

    /** Called when the game ends or the player leaves the floor. */
    reset() {
        this.pointers.clear();
        this.steering = null;
        this.pinch = null;
        this.hideJoystick();
    }
}
